#!/usr/bin/env python3
"""Inspect and compare avatar GLBs without third-party Python packages.

Usage:
    python inspect_avatar_glb.py current.glb source.glb --output report.json

The first file is the reference; each subsequent file is compared with it.
Names are matched after removing one leading ``mixamorig`` / ``mixamorig:``
prefix and case-folding. Ambiguous names are never silently paired.

This is a structural report, not a proof of animation or Three.js compatibility.
Matrices use glTF's column-major order. Lengths use the asset's world rest
coordinates; no height calibration, pose correction or retargeting is applied.
EXT_meshopt_compression bufferViews are deliberately NOT decoded, even if their
ordinary bufferView fields happen to point at readable bytes. The JSON skeleton
is still inspected, while affected accessor measurements remain unavailable.
Compressed textures do not prevent skeleton/animation inspection.

Exit codes: 0 = report written (possibly partial), 2 = an unreadable/invalid GLB,
or, with --strict, any error or unavailable requested measurement. Differences
between two valid skeletons are evidence, not an execution failure.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import re
import struct
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, unquote_to_bytes, urlsplit


VERSION = "1.0.0"
IDENTITY = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
COMPONENTS = {
    5120: ("b", 1, -127.0), 5121: ("B", 1, 255.0),
    5122: ("h", 2, -32767.0), 5123: ("H", 2, 65535.0),
    5125: ("I", 4, None), 5126: ("f", 4, None),
}
TYPE_SIZES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
              "MAT2": 4, "MAT3": 9, "MAT4": 16}
NORMALIZATION = "Remove one case-insensitive leading mixamorig or mixamorig:; casefold; no other namespace/punctuation removal."


class InspectionError(Exception):
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code = code
        self.details = details


def normalized_name(name):
    if not isinstance(name, str) or not name:
        return None
    value = re.sub(r"^mixamorig:?", "", name, count=1, flags=re.IGNORECASE).casefold()
    return value or None


def integer(value, label, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise InspectionError("invalid_integer", f"{label} must be an integer >= {minimum}.")
    return value


def numbers(value, count, label):
    if not isinstance(value, list) or len(value) != count:
        raise InspectionError("invalid_transform", f"{label} must have {count} components.")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
           for v in value):
        raise InspectionError("non_finite_or_invalid_number", f"{label} contains an invalid number.")
    return [float(v) for v in value]


def multiply(a, b):
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def inverse(matrix):
    rows = [[matrix[col * 4 + row] for col in range(4)]
            + [float(row == col) for col in range(4)] for row in range(4)]
    for col in range(4):
        pivot = max(range(col, 4), key=lambda r: abs(rows[r][col]))
        if abs(rows[pivot][col]) < 1e-15:
            return None
        rows[pivot], rows[col] = rows[col], rows[pivot]
        scale = rows[col][col]
        rows[col] = [x / scale for x in rows[col]]
        for row in range(4):
            if row != col:
                scale = rows[row][col]
                rows[row] = [x - scale * y for x, y in zip(rows[row], rows[col])]
    return [rows[row][col + 4] for col in range(4) for row in range(4)]


def compose(translation, rotation, scale):
    # Use the values as encoded; do not silently normalize a malformed quaternion.
    x, y, z, w = rotation
    xx, yy, zz = 2*x*x, 2*y*y, 2*z*z
    xy, xz, yz = 2*x*y, 2*x*z, 2*y*z
    wx, wy, wz = 2*w*x, 2*w*y, 2*w*z
    sx, sy, sz = scale
    return [(1-yy-zz)*sx, (xy+wz)*sx, (xz-wy)*sx, 0.0,
            (xy-wz)*sy, (1-xx-zz)*sy, (yz+wx)*sy, 0.0,
            (xz+wy)*sz, (yz-wx)*sz, (1-xx-yy)*sz, 0.0,
            *translation, 1.0]


def distance(a, b):
    return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))


def basis_info(matrix):
    if matrix is None:
        return None
    columns = [matrix[i:i+3] for i in (0, 4, 8)]
    lengths = [math.sqrt(sum(v*v for v in col)) for col in columns]
    a, b, c = columns
    determinant = (a[0]*(b[1]*c[2]-b[2]*c[1])
                   - b[0]*(a[1]*c[2]-a[2]*c[1])
                   + c[0]*(a[1]*b[2]-a[2]*b[1]))
    products = []
    for i, j in ((0, 1), (0, 2), (1, 2)):
        denominator = lengths[i] * lengths[j]
        products.append(sum(x*y for x, y in zip(columns[i], columns[j])) / denominator
                        if denominator else None)
    return {"basis_column_lengths": lengths, "determinant_3x3": determinant,
            "reflected": determinant < 0,
            "normalized_axis_dot_products_xy_xz_yz": products,
            "note": "Column lengths are unsigned; with shear they are not a unique TRS scale decomposition."}


def mapping(indices, nodes):
    found = defaultdict(list)
    unnamed = []
    for index in sorted(set(indices)):
        key = nodes[index]["normalized_name"]
        if key is None:
            unnamed.append(index)
        else:
            found[key].append(index)
    return dict(found), unnamed


def unique_pairs(left_map, right_map):
    return [(name, indices[0], right_map[name][0]) for name, indices in sorted(left_map.items())
            if len(indices) == 1 and name in right_map and len(right_map[name]) == 1]


class GLB:
    def __init__(self, path, allow_external=False, max_accessor_values=10000000):
        self.path = Path(path).resolve()
        self.allow_external = allow_external
        self.max_accessor_values = max_accessor_values
        self.issues = []
        self._issue_keys = set()
        self._buffers = {}
        self._accessors = {}
        self._accessor_errors = {}
        self._accessor_attempts = set()
        self.binary = None
        self.raw = self.path.read_bytes()
        self.doc, self.chunks = self._parse()
        self.nodes = []
        self.skins = []
        self.animations = []

    def issue(self, severity, code, message, **details):
        item = {"severity": severity, "code": code, "message": message, **details}
        key = json.dumps(item, sort_keys=True)
        if key not in self._issue_keys:
            self._issue_keys.add(key)
            self.issues.append(item)

    def record_error(self, exc, **details):
        severity = "warning" if exc.code in {
            "compressed_buffer_view", "external_buffer_disabled", "unsupported_buffer_uri",
            "accessor_resource_limit"} else "error"
        self.issue(severity, exc.code, str(exc), **{**exc.details, **details})

    def _parse(self):
        if len(self.raw) < 12:
            raise InspectionError("truncated_glb", "GLB header is shorter than 12 bytes.")
        magic, version, length = struct.unpack_from("<4sII", self.raw)
        if magic != b"glTF" or version != 2:
            raise InspectionError("unsupported_glb", "Expected a glTF version 2 binary container.")
        if length != len(self.raw):
            raise InspectionError("glb_length_mismatch", "Header length does not equal file length.",
                                  declared=length, actual=len(self.raw))
        position, chunks, json_bytes = 12, [], None
        while position < length:
            if position + 8 > length:
                raise InspectionError("truncated_chunk", "Incomplete GLB chunk header.")
            chunk_length, chunk_type = struct.unpack_from("<II", self.raw, position)
            position += 8
            if chunk_length % 4 or position + chunk_length > length:
                raise InspectionError("invalid_chunk_length", "Chunk is unaligned or extends past EOF.")
            data = self.raw[position:position+chunk_length]
            chunk_label = {0x4E4F534A: "JSON", 0x004E4942: "BIN"}.get(chunk_type, hex(chunk_type))
            chunks.append({"type": chunk_label, "byte_length": chunk_length})
            if len(chunks) == 1 and chunk_label != "JSON":
                raise InspectionError("json_chunk_not_first", "First GLB chunk must be JSON.")
            if chunk_label == "JSON":
                if json_bytes is not None:
                    raise InspectionError("duplicate_json_chunk", "Multiple JSON chunks are ambiguous.")
                json_bytes = data
            elif chunk_label == "BIN":
                if self.binary is not None:
                    raise InspectionError("duplicate_bin_chunk", "Multiple BIN chunks are not supported by glTF 2.")
                self.binary = data
            else:
                self.issue("warning", "unknown_glb_chunk", "Unknown chunk ignored.", chunk_type=chunk_label)
            position += chunk_length
        if json_bytes is None:
            raise InspectionError("missing_json_chunk", "GLB has no JSON chunk.")
        try:
            document = json.loads(json_bytes.decode("utf-8"),
                                  parse_constant=lambda s: (_ for _ in ()).throw(ValueError(s)))
        except (UnicodeError, ValueError) as exc:
            raise InspectionError("invalid_json", f"Cannot decode GLB JSON: {exc}") from exc
        if not isinstance(document, dict) or document.get("asset", {}).get("version") != "2.0":
            raise InspectionError("unsupported_asset", "Expected an asset.version of 2.0.")
        for key in ("nodes", "skins", "animations", "accessors", "bufferViews", "buffers", "scenes"):
            if not isinstance(document.get(key, []), list):
                raise InspectionError("invalid_array", f"{key} must be an array.")
        return document, chunks

    def _item(self, collection, index):
        integer(index, f"{collection} index")
        values = self.doc.get(collection, [])
        if index >= len(values) or not isinstance(values[index], dict):
            raise InspectionError("invalid_index", f"Invalid {collection} index {index}.")
        return values[index]

    def buffer(self, index):
        if index in self._buffers:
            return self._buffers[index]
        definition = self._item("buffers", index)
        length = integer(definition.get("byteLength"), "buffer.byteLength")
        uri = definition.get("uri")
        if uri is None:
            if index != 0 or self.binary is None:
                raise InspectionError("missing_buffer", "Only buffer 0 can refer to the GLB BIN chunk.")
            data = self.binary
            if len(data) > length + 3:
                self.issue("warning", "excess_bin_bytes", "BIN contains more than three trailing padding bytes.")
        elif isinstance(uri, str) and uri.startswith("data:"):
            try:
                header, payload = uri.split(",", 1)
                data = (base64.b64decode(payload, validate=True) if header.endswith(";base64")
                        else unquote_to_bytes(payload))
            except (ValueError, TypeError) as exc:
                raise InspectionError("invalid_data_uri", "Cannot decode buffer data URI.") from exc
        elif isinstance(uri, str):
            parts = urlsplit(uri)
            if parts.scheme or parts.netloc or parts.query or parts.fragment:
                raise InspectionError("unsupported_buffer_uri", "Network/absolute buffer URI is never fetched.", buffer=index)
            if not self.allow_external:
                raise InspectionError("external_buffer_disabled", "Use --allow-external-buffers for local relative buffers.", buffer=index)
            relative = Path(unquote(parts.path))
            path = (self.path.parent / relative).resolve()
            if relative.is_absolute() or not path.is_relative_to(self.path.parent):
                raise InspectionError("unsupported_buffer_uri", "External buffers must stay inside the GLB directory.", buffer=index)
            try:
                data = path.read_bytes()
            except OSError as exc:
                raise InspectionError("unreadable_external_buffer", str(exc), buffer=index) from exc
        else:
            raise InspectionError("invalid_buffer_uri", "Buffer URI must be a string.")
        if len(data) < length:
            raise InspectionError("truncated_buffer", "Buffer is shorter than its declared byteLength.", buffer=index)
        self._buffers[index] = memoryview(data)[:length]
        return self._buffers[index]

    def view(self, index):
        definition = self._item("bufferViews", index)
        if "EXT_meshopt_compression" in definition.get("extensions", {}):
            raise InspectionError("compressed_buffer_view",
                                  "EXT_meshopt_compression requires a decoder. No accessor numbers were read from this view.",
                                  buffer_view=index)
        buffer = self.buffer(definition.get("buffer"))
        start = integer(definition.get("byteOffset", 0), "bufferView.byteOffset")
        length = integer(definition.get("byteLength"), "bufferView.byteLength")
        if start + length > len(buffer):
            raise InspectionError("buffer_view_out_of_bounds", "bufferView extends beyond its buffer.", buffer_view=index)
        return buffer[start:start+length], definition, start

    def _elements(self, view_index, byte_offset, count, component_type, element_type, allow_stride=True):
        data, definition, view_start = self.view(view_index)
        fmt, component_size, _ = COMPONENTS[component_type]
        components = TYPE_SIZES[element_type]
        if element_type.startswith("MAT"):
            dimension = int(element_type[-1])
            column_stride = ((dimension * component_size + 3) // 4) * 4
            offsets = [col * column_stride + row * component_size
                       for col in range(dimension) for row in range(dimension)]
            element_size = column_stride * dimension
        else:
            offsets = [i * component_size for i in range(components)]
            element_size = component_size * components
        byte_offset = integer(byte_offset, "accessor/sparse byteOffset")
        if "byteStride" in definition:
            if not allow_stride:
                raise InspectionError("sparse_stride", "Sparse indices/values bufferViews cannot have byteStride.")
            stride = integer(definition["byteStride"], "bufferView.byteStride", 4)
            if stride > 252 or stride % 4:
                raise InspectionError("invalid_stride", "byteStride must be a multiple of 4 in [4, 252].")
        else:
            stride = element_size
        if stride < element_size or (view_start + byte_offset) % component_size:
            raise InspectionError("invalid_accessor_alignment", "Accessor alignment/stride is invalid.")
        if element_type.startswith("MAT") and (view_start + byte_offset) % 4:
            raise InspectionError("invalid_matrix_alignment", "Matrix columns must start at 4-byte aligned offsets.")
        # The final matrix column may omit its trailing alignment padding.
        # Stride still includes padding between adjacent matrix elements.
        final_element_bytes = offsets[-1] + component_size
        end = byte_offset + ((count - 1) * stride + final_element_bytes if count else 0)
        if end > len(data):
            raise InspectionError("accessor_out_of_bounds", "Accessor extends beyond bufferView, including stride/padding.",
                                  buffer_view=view_index, required_end=end, view_byte_length=len(data))
        contiguous = offsets == list(range(0, component_size * components, component_size))
        unpack = struct.Struct("<" + fmt * (components if contiguous else 1)).unpack_from
        result = []
        for i in range(count):
            start = byte_offset + i * stride
            result.append(tuple(unpack(data, start)) if contiguous else
                          tuple(unpack(data, start + offset)[0] for offset in offsets))
        return result

    def accessor(self, index):
        integer(index, "accessor index")
        self._accessor_attempts.add(index)
        if index in self._accessors:
            return self._accessors[index]
        if index in self._accessor_errors:
            raise self._accessor_errors[index]
        try:
            definition = self._item("accessors", index)
            count = integer(definition.get("count"), "accessor.count", 1)
            component_type, element_type = definition.get("componentType"), definition.get("type")
            if component_type not in COMPONENTS or element_type not in TYPE_SIZES:
                raise InspectionError("unsupported_accessor_format", "Invalid accessor componentType/type.")
            components = TYPE_SIZES[element_type]
            if count * components > self.max_accessor_values:
                raise InspectionError("accessor_resource_limit", "Accessor exceeds --max-accessor-values.")
            normalized = definition.get("normalized", False)
            if not isinstance(normalized, bool) or (normalized and component_type not in (5120, 5121, 5122, 5123)):
                raise InspectionError("invalid_normalized_accessor", "normalized is valid only for byte/short integer accessors.")
            if "bufferView" in definition:
                values = self._elements(definition["bufferView"], definition.get("byteOffset", 0),
                                        count, component_type, element_type)
            else:
                if definition.get("byteOffset", 0) != 0:
                    raise InspectionError("orphan_accessor_offset", "Accessor without bufferView cannot have a nonzero byteOffset.")
                values = [(0,) * components for _ in range(count)]
            if "sparse" in definition:
                sparse = definition["sparse"]
                sparse_count = integer(sparse.get("count"), "accessor.sparse.count", 1)
                if sparse_count > count:
                    raise InspectionError("invalid_sparse_count", "Sparse count exceeds accessor count.")
                indices, replacements = sparse.get("indices", {}), sparse.get("values", {})
                index_type = indices.get("componentType")
                if index_type not in (5121, 5123, 5125):
                    raise InspectionError("invalid_sparse_index_type", "Sparse indices must be unsigned integers.")
                positions = self._elements(indices.get("bufferView"), indices.get("byteOffset", 0),
                                           sparse_count, index_type, "SCALAR", False)
                replacements = self._elements(replacements.get("bufferView"), replacements.get("byteOffset", 0),
                                              sparse_count, component_type, element_type, False)
                last = -1
                for (position,), replacement in zip(positions, replacements):
                    if not last < position < count:
                        raise InspectionError("invalid_sparse_indices", "Sparse indices must be strictly increasing and in range.")
                    values[position] = replacement
                    last = position
            if normalized:
                divisor = COMPONENTS[component_type][2]
                values = [tuple(max(v / -divisor, -1.0) if divisor < 0 else v / divisor for v in row)
                          for row in values]
            if any(not math.isfinite(v) for row in values for v in row):
                raise InspectionError("non_finite_accessor", "Accessor contains NaN or infinity.")
            self._accessors[index] = values
            return values
        except InspectionError as exc:
            self._accessor_errors[index] = exc
            raise

    def inspect_nodes(self):
        definitions = self.doc.get("nodes", [])
        parents = [[] for _ in definitions]
        children = [[] for _ in definitions]
        for i, definition in enumerate(definitions):
            if not isinstance(definition, dict):
                raise InspectionError("invalid_node", "Each node must be an object.", node=i)
            for child in definition.get("children", []):
                try:
                    self._item("nodes", child)
                    if child in children[i]:
                        self.issue("error", "duplicate_child", "Node lists the same child twice.", node=i, child=child)
                        continue
                    children[i].append(child)
                    parents[child].append(i)
                except InspectionError as exc:
                    self.record_error(exc, node=i)
        for i, definition in enumerate(definitions):
            local, trs, source = None, None, "matrix" if "matrix" in definition else "trs"
            try:
                if source == "matrix":
                    local = numbers(definition["matrix"], 16, f"node[{i}].matrix")
                    if any(k in definition for k in ("translation", "rotation", "scale")):
                        self.issue("error", "matrix_and_trs", "Node defines both matrix and TRS; matrix was used.", node=i)
                else:
                    translation = numbers(definition.get("translation", [0, 0, 0]), 3, "translation")
                    rotation = numbers(definition.get("rotation", [0, 0, 0, 1]), 4, "rotation")
                    scale = numbers(definition.get("scale", [1, 1, 1]), 3, "scale")
                    norm = math.sqrt(sum(v*v for v in rotation))
                    if abs(norm - 1) > 1e-5:
                        self.issue("error", "non_unit_quaternion", "Rest quaternion is not normalized; encoded values were preserved.", node=i, norm=norm)
                    trs = {"translation": translation, "rotation_xyzw": rotation, "scale": scale}
                    local = compose(translation, rotation, scale)
                if any(abs(local[k]) > 1e-8 for k in (3, 7, 11)) or abs(local[15] - 1) > 1e-8:
                    self.issue("error", "non_affine_node_matrix", "Node matrix is not affine.", node=i)
            except InspectionError as exc:
                self.record_error(exc, node=i)
            if len(parents[i]) > 1:
                self.issue("error", "multiple_parents", "Node has more than one parent; world rest transform is unavailable.", node=i, parents=parents[i])
            self.nodes.append({"index": i, "name": definition.get("name"),
                               "normalized_name": normalized_name(definition.get("name")),
                               "parent_indices": parents[i], "children": children[i],
                               "transform_source": source, "local_trs": trs,
                               "local_matrix": local, "local_basis": basis_info(local),
                               "mesh": definition.get("mesh"), "skin": definition.get("skin"),
                               "world_matrix": None})
        states = [0] * len(self.nodes)

        def resolve(index):
            node = self.nodes[index]
            if states[index] == 2:
                return node["world_matrix"]
            if states[index] == 1:
                self.issue("error", "node_cycle", "Hierarchy contains a cycle; world rest transform is unavailable.", node=index)
                return None
            states[index] = 1
            if len(parents[index]) <= 1 and node["local_matrix"] is not None:
                if not parents[index]:
                    node["world_matrix"] = node["local_matrix"][:]
                else:
                    parent = resolve(parents[index][0])
                    if parent is not None:
                        node["world_matrix"] = multiply(parent, node["local_matrix"])
            states[index] = 2
            return node["world_matrix"]

        for i, node in enumerate(self.nodes):
            world = resolve(i)
            node["world_translation"] = world[12:15] if world is not None else None
            node["world_basis"] = basis_info(world)
            chain, seen, current = [], {i}, i
            while len(parents[current]) == 1:
                current = parents[current][0]
                if current in seen:
                    break
                seen.add(current)
                chain.append(current)
            node["ancestor_indices_root_first"] = list(reversed(chain))
            node["normalized_ancestor_names_root_first"] = [self.nodes[j]["normalized_name"] for j in reversed(chain)]

    def inspect_skins(self):
        for index, definition in enumerate(self.doc.get("skins", [])):
            joints = definition.get("joints", [])
            valid_joints = []
            for joint in joints:
                try:
                    self._item("nodes", joint)
                    valid_joints.append(joint)
                except InspectionError as exc:
                    self.record_error(exc, skin=index)
            if not valid_joints or len(set(valid_joints)) != len(valid_joints):
                self.issue("error", "invalid_skin_joints", "Skin must have nonempty, unique joint indices.", skin=index)
            joint_map, unnamed = mapping(valid_joints, self.nodes)
            attached = [node["index"] for node in self.nodes if node["skin"] == index]
            matrices, matrix_status = None, "read"
            accessor_index = definition.get("inverseBindMatrices")
            if accessor_index is None:
                matrices = [tuple(IDENTITY) for _ in joints]
                matrix_status = "implicit_identity_per_gltf"
            else:
                try:
                    accessor_definition = self._item("accessors", accessor_index)
                    if accessor_definition.get("type") != "MAT4" or accessor_definition.get("componentType") != 5126:
                        raise InspectionError("invalid_inverse_bind_format", "inverseBindMatrices must use FLOAT MAT4.")
                    matrices = self.accessor(accessor_index)
                    if len(matrices) < len(joints):
                        raise InspectionError("inverse_bind_count", "Not enough inverse bind matrices for skin joints.")
                    if len(matrices) > len(joints):
                        self.issue("warning", "extra_inverse_bind_matrices", "Extra matrices are unused by this skin.", skin=index)
                except InspectionError as exc:
                    matrices, matrix_status = None, "unavailable"
                    self.record_error(exc, skin=index, accessor=accessor_index)
            skeleton = definition.get("skeleton")
            if skeleton is not None:
                try:
                    self._item("nodes", skeleton)
                except InspectionError as exc:
                    self.record_error(exc, skin=index)
            joint_records, positions = [], []
            joint_set = set(valid_joints)
            for slot, joint in enumerate(joints):
                if joint not in joint_set:
                    continue
                node = self.nodes[joint]
                ancestors = list(reversed(node["ancestor_indices_root_first"]))
                parent_joint = next((parent for parent in ancestors if parent in joint_set), None)
                world = node["world_matrix"]
                parent_world = self.nodes[parent_joint]["world_matrix"] if parent_joint is not None else None
                ibm = list(matrices[slot]) if matrices is not None else None
                if ibm is not None and inverse(ibm) is None:
                    self.issue("error", "singular_inverse_bind_matrix", "Inverse bind matrix is singular.", skin=index, joint=joint)
                record = {"joint_slot": slot, "node_index": joint, "name": node["name"],
                          "normalized_name": node["normalized_name"],
                          "parent_joint_index": parent_joint,
                          "parent_joint_normalized_name": self.nodes[parent_joint]["normalized_name"] if parent_joint is not None else None,
                          "bone_length_world_rest": distance(world[12:15], parent_world[12:15]) if world is not None and parent_world is not None else None,
                          "bone_length_definition": "Distance to nearest ancestor joint; includes any intervening non-joint nodes.",
                          "inverse_bind_matrix": ibm,
                          "bind_matrix_inverse_of_ibm": inverse(ibm) if ibm is not None else None,
                          "rest_skinning_by_attached_node": []}
                for mesh_index in attached:
                    mesh_world = self.nodes[mesh_index]["world_matrix"]
                    mesh_inverse = inverse(mesh_world) if mesh_world is not None else None
                    if mesh_inverse is not None and world is not None and ibm is not None:
                        skinning = multiply(multiply(mesh_inverse, world), ibm)
                        record["rest_skinning_by_attached_node"].append({
                            "node_index": mesh_index, "matrix": skinning,
                            "max_abs_difference_from_identity": max(abs(a-b) for a, b in zip(skinning, IDENTITY))})
                if world is not None:
                    positions.append(world[12:15])
                joint_records.append(record)
            bounds = None
            if positions:
                lower = [min(p[i] for p in positions) for i in range(3)]
                upper = [max(p[i] for p in positions) for i in range(3)]
                bounds = {"min": lower, "max": upper, "extent": [b-a for a, b in zip(lower, upper)],
                          "note": "Joint-origin bounds only; not the mesh or shoe bounds or calibrated human height."}
            self.skins.append({"index": index, "name": definition.get("name"),
                               "skeleton_node": skeleton, "joint_count": len(joints),
                               "attached_node_indices": attached,
                               "inverse_bind_accessor": accessor_index,
                               "inverse_bind_status": matrix_status,
                               "joint_name_map": joint_map, "unnamed_joint_indices": unnamed,
                               "ambiguous_normalized_names": {k: v for k, v in joint_map.items() if len(v) > 1},
                               "joint_origin_bounds_world_rest": bounds, "joints": joint_records,
                               "rest_skinning_note": "Diagnostic inverse(meshWorld) * jointWorld * inverseBind. Nonidentity is reported, not automatically treated as a defect: JSON rest need not be the intended bind pose."})

    def inspect_animations(self):
        joint_roots = {j["node_index"] for skin in self.skins for j in skin["joints"]
                       if j["parent_joint_index"] is None}
        for ai, definition in enumerate(self.doc.get("animations", [])):
            animation = {"index": ai, "name": definition.get("name"), "channels": [],
                         "start_time_seconds": None, "end_time_seconds": None,
                         "time_span_seconds": None, "inferred_clip_duration_seconds": None,
                         "measurement_status": "complete"}
            all_times, targets = [], set()
            for ci, channel in enumerate(definition.get("channels", [])):
                target = channel.get("target", {})
                node_index, path = target.get("node"), target.get("path")
                record = {"index": ci, "sampler_index": channel.get("sampler"),
                          "target_node_index": node_index, "path": path, "status": "unavailable"}
                try:
                    if "KHR_animation_pointer" in target.get("extensions", {}):
                        raise InspectionError("unsupported_animation_pointer", "KHR_animation_pointer is recorded but not evaluated.")
                    self._item("nodes", node_index)
                    if path not in ("translation", "rotation", "scale", "weights"):
                        raise InspectionError("invalid_animation_path", "Unsupported glTF animation target path.")
                    node = self.nodes[node_index]
                    record.update({"target_name": node["name"], "target_normalized_name": node["normalized_name"],
                                   "channel_name": f"{node['name'] or 'node['+str(node_index)+']'}.{path}"})
                    if path == "translation":
                        roles = []
                        if not node["parent_indices"]:
                            roles.append("scene_graph_root")
                        if node_index in joint_roots:
                            roles.append("skin_joint_root")
                        if node["normalized_name"] in ("hips", "hip", "pelvis"):
                            roles.append("hips_or_pelvis_by_name")
                        if node["normalized_name"] in ("root", "armature", "rootnode"):
                            roles.append("root_or_armature_by_name")
                        record["translation_roles"] = roles
                        record["translation_space"] = "Local to target node parent; not world/root motion when ancestors are animated."
                    if (node_index, path) in targets:
                        self.issue("error", "duplicate_animation_target", "Animation has multiple channels for one node/path.", animation=ai, node=node_index, path=path)
                    targets.add((node_index, path))
                    if path != "weights" and node["transform_source"] == "matrix":
                        self.issue("error", "animated_matrix_node", "TRS animation targets a node encoded with matrix.", animation=ai, node=node_index)
                    samplers = definition.get("samplers", [])
                    sampler_index = integer(channel.get("sampler"), "animation sampler index")
                    if sampler_index >= len(samplers):
                        raise InspectionError("invalid_animation_sampler", "Animation sampler index is out of range.")
                    sampler = samplers[sampler_index]
                    interpolation = sampler.get("interpolation", "LINEAR")
                    if interpolation not in ("LINEAR", "STEP", "CUBICSPLINE"):
                        raise InspectionError("invalid_interpolation", "Unsupported animation interpolation.")
                    record.update({"interpolation": interpolation, "input_accessor": sampler.get("input"),
                                   "output_accessor": sampler.get("output")})
                    input_definition = self._item("accessors", sampler.get("input"))
                    if input_definition.get("type") != "SCALAR" or input_definition.get("componentType") != 5126:
                        raise InspectionError("invalid_animation_input", "Animation times must use FLOAT SCALAR.")
                    times = [row[0] for row in self.accessor(sampler.get("input"))]
                    if times[0] < 0 or any(a >= b for a, b in zip(times, times[1:])):
                        raise InspectionError("invalid_animation_times", "Animation times must be nonnegative and strictly increasing.")
                    all_times.extend((times[0], times[-1]))
                    record.update({"keyframe_count": len(times), "start_time_seconds": times[0],
                                   "end_time_seconds": times[-1], "time_span_seconds": times[-1]-times[0]})
                    output_definition = self._item("accessors", sampler.get("output"))
                    expected_type = {"translation": "VEC3", "rotation": "VEC4", "scale": "VEC3", "weights": "SCALAR"}[path]
                    if output_definition.get("type") != expected_type:
                        raise InspectionError("invalid_animation_output_type", f"{path} output must have type {expected_type}.")
                    values = self.accessor(sampler.get("output"))
                    factor = 3 if interpolation == "CUBICSPLINE" else 1
                    if path == "weights":
                        denominator = len(times) * factor
                        if len(values) % denominator:
                            raise InspectionError("invalid_animation_output_count", "Morph output count is not a multiple of keys/interpolation factor.")
                        target_count = len(values) // denominator
                        record["morph_target_count_from_output"] = target_count
                        record["output_value_count"] = len(values)
                    else:
                        if len(values) != len(times) * factor:
                            raise InspectionError("invalid_animation_output_count", "Output count does not match keys and interpolation.")
                        key_values = values[1::3] if factor == 3 else values
                        record["first_key_value"] = list(key_values[0])
                        record["last_key_value"] = list(key_values[-1])
                        if path in ("translation", "scale"):
                            ranges = vector_ranges(times, values, interpolation)
                            record["value_ranges"] = ranges
                            if path == "translation":
                                record["net_local_displacement"] = [b-a for a, b in zip(key_values[0], key_values[-1])]
                    record["status"] = "read"
                except InspectionError as exc:
                    record["unavailable_reason"] = {"code": exc.code, "message": str(exc), **exc.details}
                    animation["measurement_status"] = "partial"
                    self.record_error(exc, animation=ai, channel=ci)
                animation["channels"].append(record)
            if all_times:
                lower, upper = min(all_times), max(all_times)
                animation.update({"start_time_seconds": lower, "end_time_seconds": upper,
                                  "time_span_seconds": upper-lower, "inferred_clip_duration_seconds": upper})
            animation["duration_complete"] = all("end_time_seconds" in channel for channel in animation["channels"])
            animation["duration_definition"] = "Latest decoded key time (clip beginning at t=0); time_span separately subtracts earliest key. Unreadable channel times make duration incomplete."
            self.animations.append(animation)

    def inspect(self):
        self.inspect_nodes()
        self.inspect_skins()
        self.inspect_animations()
        names, unnamed = mapping(range(len(self.nodes)), self.nodes)
        compressed = []
        for i, view in enumerate(self.doc.get("bufferViews", [])):
            extension = view.get("extensions", {}).get("EXT_meshopt_compression")
            if extension is not None:
                compressed.append({"index": i, "extension": extension, "decoding_status": "not_decoded"})
        scenes = []
        for si, scene in enumerate(self.doc.get("scenes", [])):
            scenes.append({"index": si, "name": scene.get("name"), "root_node_indices": scene.get("nodes", [])})
        joint_indices = {j["node_index"] for skin in self.skins for j in skin["joints"]}
        root_hips = [{"animation_index": a["index"], "animation_name": a["name"], **c}
                     for a in self.animations for c in a["channels"] if c.get("translation_roles")]
        partial = (bool(self._accessor_errors)
                   or any(a["measurement_status"] == "partial" for a in self.animations)
                   or any(n["world_matrix"] is None for n in self.nodes)
                   or any(s["inverse_bind_status"] == "unavailable" for s in self.skins))
        accessor_inventory = []
        for i, accessor in enumerate(self.doc.get("accessors", [])):
            accessor_inventory.append({"index": i, "type": accessor.get("type"),
                                       "component_type": accessor.get("componentType"),
                                       "count": accessor.get("count"), "normalized": accessor.get("normalized", False),
                                       "buffer_view": accessor.get("bufferView"),
                                       "byte_offset": accessor.get("byteOffset", 0),
                                       "sparse_count": accessor.get("sparse", {}).get("count", 0),
                                       "declared_min": accessor.get("min"), "declared_max": accessor.get("max"),
                                       "note": "Declared min/max are metadata; animation ranges are computed from decoded values."})
        return {"path": str(self.path), "sha256": hashlib.sha256(self.raw).hexdigest(),
                "file_byte_length": len(self.raw), "container_chunks": self.chunks,
                "asset": self.doc.get("asset"), "extensions_used": self.doc.get("extensionsUsed", []),
                "extensions_required": self.doc.get("extensionsRequired", []),
                "compressed_buffer_views": compressed, "default_scene": self.doc.get("scene"), "scenes": scenes,
                "counts": {"nodes": len(self.nodes), "skins": len(self.skins), "unique_joint_nodes": len(joint_indices),
                           "animations": len(self.animations), "accessors": len(self.doc.get("accessors", [])),
                           "mesh_primitives_with_draco": sum("KHR_draco_mesh_compression" in p.get("extensions", {})
                               for m in self.doc.get("meshes", []) for p in m.get("primitives", []))},
                "measurement_status": "partial" if partial else "complete",
                "validation_status": "errors" if any(i["severity"] == "error" for i in self.issues) else "no_errors_detected",
                "node_name_map": names, "unnamed_node_indices": unnamed,
                "ambiguous_normalized_node_names": {k: v for k, v in names.items() if len(v) > 1},
                "nodes": self.nodes, "skins": self.skins, "animations": self.animations,
                "accessor_inventory": accessor_inventory,
                "root_hips_translation_channels": root_hips,
                "accessor_reads": {"attempted": sorted(self._accessor_attempts), "decoded": sorted(self._accessors),
                                   "unavailable": [{"index": i, "code": e.code, "message": str(e), **e.details}
                                                   for i, e in sorted(self._accessor_errors.items())]},
                "issues": self.issues}


def vector_ranges(times, values, interpolation):
    keys = values[1::3] if interpolation == "CUBICSPLINE" else values
    size = len(keys[0])
    key_min = [min(row[j] for row in keys) for j in range(size)]
    key_max = [max(row[j] for row in keys) for j in range(size)]
    lower, upper = key_min[:], key_max[:]
    if interpolation == "CUBICSPLINE":
        for i in range(len(times)-1):
            dt = times[i+1] - times[i]
            for j in range(size):
                p0, p1 = keys[i][j], keys[i+1][j]
                m0, m1 = values[i*3+2][j] * dt, values[(i+1)*3][j] * dt
                a, b, c, d = 2*p0-2*p1+m0+m1, -3*p0+3*p1-2*m0-m1, m0, p0
                roots = []
                if abs(a) < 1e-15:
                    if abs(b) >= 1e-15:
                        roots = [-c/(2*b)]
                else:
                    discriminant = 4*b*b - 12*a*c
                    if discriminant >= 0:
                        root = math.sqrt(discriminant)
                        roots = [(-2*b-root)/(6*a), (-2*b+root)/(6*a)]
                for u in roots:
                    if 0 < u < 1:
                        value = ((a*u+b)*u+c)*u+d
                        lower[j] = min(lower[j], value)
                        upper[j] = max(upper[j], value)
    return {"keyframe_min": key_min, "keyframe_max": key_max,
            "interpolated_min": lower, "interpolated_max": upper,
            "interpolated_extent": [b-a for a, b in zip(lower, upper)],
            "scope": "Per-component local values over the clip. CUBICSPLINE includes analytic Hermite extrema; tangent samples are not positions."}


def matrix_difference(left, right, abs_tol, rel_tol):
    if left is None or right is None:
        return {"status": "unavailable"}
    changed = [i for i, (a, b) in enumerate(zip(left, right))
               if not math.isclose(a, b, abs_tol=abs_tol, rel_tol=rel_tol)]
    return {"status": "different" if changed else "within_tolerance",
            "max_abs_difference": max((abs(a-b) for a, b in zip(left, right)), default=0.0),
            "changed_column_major_indices": changed}


def compare_nodes(left, right, abs_tol, rel_tol):
    left_map, right_map = left["node_name_map"], right["node_name_map"]
    comparisons = []
    for name, li, ri in unique_pairs(left_map, right_map):
        a, b = left["nodes"][li], right["nodes"][ri]
        local = matrix_difference(a["local_matrix"], b["local_matrix"], abs_tol, rel_tol)
        world = matrix_difference(a["world_matrix"], b["world_matrix"], abs_tol, rel_tol)
        ancestry_a, ancestry_b = a["normalized_ancestor_names_root_first"], b["normalized_ancestor_names_root_first"]
        hierarchy = "same_named_ancestor_chain" if ancestry_a == ancestry_b else "different_named_ancestor_chain"
        if None in ancestry_a or None in ancestry_b:
            hierarchy = "contains_unnamed_ancestors_not_fully_identified"
        comparisons.append({"normalized_name": name, "reference_index": li, "candidate_index": ri,
                            "local_rest_matrix": local, "world_rest_matrix": world,
                            "world_origin_distance": distance(a["world_translation"], b["world_translation"])
                                if a["world_translation"] is not None and b["world_translation"] is not None else None,
                            "hierarchy_status": hierarchy,
                            "reference_ancestor_names": ancestry_a, "candidate_ancestor_names": ancestry_b})
    return {"matched_unambiguous_names": len(comparisons),
            "only_in_reference": sorted(set(left_map)-set(right_map)),
            "only_in_candidate": sorted(set(right_map)-set(left_map)),
            "ambiguous_in_reference": left["ambiguous_normalized_node_names"],
            "ambiguous_in_candidate": right["ambiguous_normalized_node_names"],
            "unnamed_in_reference": left["unnamed_node_indices"], "unnamed_in_candidate": right["unnamed_node_indices"],
            "comparisons": comparisons}


def skin_pairs(left, right):
    pairs, remaining_left, remaining_right = [], set(range(len(left))), set(range(len(right)))
    for mode in ("unique_skin_name", "unique_equal_joint_name_set"):
        a_map, b_map = defaultdict(list), defaultdict(list)
        for indices, skins, destination in ((remaining_left, left, a_map), (remaining_right, right, b_map)):
            for i in sorted(indices):
                skin = skins[i]
                if mode == "unique_skin_name":
                    key = skin["name"].casefold() if isinstance(skin["name"], str) and skin["name"] else None
                else:
                    key = tuple(sorted(skin["joint_name_map"])) if not skin["ambiguous_normalized_names"] and not skin["unnamed_joint_indices"] else None
                if key:
                    destination[key].append(i)
        for key, values in a_map.items():
            if len(values) == 1 and len(b_map.get(key, [])) == 1:
                li, ri = values[0], b_map[key][0]
                pairs.append((li, ri, mode))
                remaining_left.remove(li)
                remaining_right.remove(ri)
    if len(remaining_left) == len(remaining_right) == 1:
        li, ri = next(iter(remaining_left)), next(iter(remaining_right))
        pairs.append((li, ri, "only_remaining_skin_explicitly_tentative"))
        remaining_left.clear()
        remaining_right.clear()
    return pairs, sorted(remaining_left), sorted(remaining_right)


def compare_skins(left, right, abs_tol, rel_tol):
    pairs, unpaired_left, unpaired_right = skin_pairs(left["skins"], right["skins"])
    reports = []
    for li, ri, reason in pairs:
        a, b = left["skins"][li], right["skins"][ri]
        a_by_node = {j["node_index"]: j for j in a["joints"]}
        b_by_node = {j["node_index"]: j for j in b["joints"]}
        joints = []
        for name, ai, bi in unique_pairs(a["joint_name_map"], b["joint_name_map"]):
            ja, jb = a_by_node[ai], b_by_node[bi]
            length_a, length_b = ja["bone_length_world_rest"], jb["bone_length_world_rest"]
            parent_a, parent_b = ja["parent_joint_normalized_name"], jb["parent_joint_normalized_name"]
            parent_status = "same" if parent_a == parent_b else "different"
            if ((ja["parent_joint_index"] is not None and parent_a is None)
                    or (jb["parent_joint_index"] is not None and parent_b is None)):
                parent_status = "unavailable_unnamed_parent"
            joints.append({"normalized_name": name, "reference_node_index": ai, "candidate_node_index": bi,
                           "reference_joint_slot": ja["joint_slot"], "candidate_joint_slot": jb["joint_slot"],
                           "reference_parent_joint_name": parent_a, "candidate_parent_joint_name": parent_b,
                           "parent_joint_status": parent_status,
                           "reference_bone_length": length_a, "candidate_bone_length": length_b,
                           "bone_length_difference": length_b-length_a if length_a is not None and length_b is not None else None,
                           "inverse_bind_matrix": matrix_difference(ja["inverse_bind_matrix"], jb["inverse_bind_matrix"], abs_tol, rel_tol)})
        reports.append({"reference_skin_index": li, "candidate_skin_index": ri, "pairing_basis": reason,
                        "reference_skin_name": a["name"], "candidate_skin_name": b["name"],
                        "only_in_reference": sorted(set(a["joint_name_map"])-set(b["joint_name_map"])),
                        "only_in_candidate": sorted(set(b["joint_name_map"])-set(a["joint_name_map"])),
                        "ambiguous_in_reference": a["ambiguous_normalized_names"],
                        "ambiguous_in_candidate": b["ambiguous_normalized_names"],
                        "unnamed_in_reference": a["unnamed_joint_indices"], "unnamed_in_candidate": b["unnamed_joint_indices"],
                        "joints": joints})
    return {"pairs": reports, "unpaired_reference_skin_indices": unpaired_left,
            "unpaired_candidate_skin_indices": unpaired_right,
            "note": "Inverse bind matrices are paired by unambiguous normalized JOINT NAME, never joint-array slot or node index."}


def compare_animations(left, right, abs_tol, rel_tol):
    def clip_map(asset):
        found = defaultdict(list)
        for animation in asset["animations"]:
            if isinstance(animation["name"], str) and animation["name"]:
                found[animation["name"].casefold()].append(animation["index"])
        return found

    a_map, b_map = clip_map(left), clip_map(right)
    reports = []
    for name in sorted(set(a_map) & set(b_map)):
        if len(a_map[name]) != 1 or len(b_map[name]) != 1:
            continue
        a, b = left["animations"][a_map[name][0]], right["animations"][b_map[name][0]]
        def channel_set(animation):
            return {(c.get("target_normalized_name"), c.get("path")) for c in animation["channels"]
                    if c.get("target_normalized_name") is not None}
        ca, cb = channel_set(a), channel_set(b)
        reports.append({"name_casefolded": name,
                        "reference_duration_seconds": a["inferred_clip_duration_seconds"],
                        "candidate_duration_seconds": b["inferred_clip_duration_seconds"],
                        "reference_duration_complete": a["duration_complete"], "candidate_duration_complete": b["duration_complete"],
                        "channels_only_in_reference": [list(c) for c in sorted(ca-cb)],
                        "channels_only_in_candidate": [list(c) for c in sorted(cb-ca)]})
    return {"names_only_in_reference": sorted(set(a_map)-set(b_map)),
            "names_only_in_candidate": sorted(set(b_map)-set(a_map)),
            "ambiguous_clip_names_in_reference": {k: v for k, v in a_map.items() if len(v) > 1},
            "ambiguous_clip_names_in_candidate": {k: v for k, v in b_map.items() if len(v) > 1},
            "same_name_clips": reports,
            "note": "No keyframe-by-keyframe equality or visual motion quality is asserted. Channel labels are glTF node/path names, not guaranteed Three.js PropertyBinding names."}


def compare_assets(left, right, abs_tol, rel_tol):
    nodes = compare_nodes(left, right, abs_tol, rel_tol)
    skins = compare_skins(left, right, abs_tol, rel_tol)
    differences = {
        "local_rest_matrices": sum(n["local_rest_matrix"]["status"] == "different" for n in nodes["comparisons"]),
        "world_rest_matrices": sum(n["world_rest_matrix"]["status"] == "different" for n in nodes["comparisons"]),
        "named_ancestor_chains": sum(n["hierarchy_status"] == "different_named_ancestor_chain" for n in nodes["comparisons"]),
        "inverse_bind_matrices": sum(j["inverse_bind_matrix"]["status"] == "different" for s in skins["pairs"] for j in s["joints"]),
        "joint_parent_links": sum(j["parent_joint_status"] == "different" for s in skins["pairs"] for j in s["joints"]),
        "named_nodes_only_in_reference": len(nodes["only_in_reference"]),
        "named_nodes_only_in_candidate": len(nodes["only_in_candidate"]),
    }
    incomplete = (left["measurement_status"] != "complete" or right["measurement_status"] != "complete"
                  or left["validation_status"] == "errors" or right["validation_status"] == "errors"
                  or bool(nodes["ambiguous_in_reference"] or nodes["ambiguous_in_candidate"]
                          or nodes["unnamed_in_reference"] or nodes["unnamed_in_candidate"])
                  or bool(skins["unpaired_reference_skin_indices"] or skins["unpaired_candidate_skin_indices"])
                  or not skins["pairs"]
                  or any(n["local_rest_matrix"]["status"] == "unavailable"
                         or n["world_rest_matrix"]["status"] == "unavailable" for n in nodes["comparisons"]))
    return {"reference_path": left["path"], "candidate_path": right["path"],
            "absolute_tolerance": abs_tol, "relative_tolerance": rel_tol,
            "structural_evidence_status": "incomplete" if incomplete else
                ("differences_detected" if any(differences.values()) else "no_differences_detected_in_performed_structural_checks"),
            "difference_counts": differences, "nodes": nodes, "skins": skins,
            "animations": compare_animations(left, right, abs_tol, rel_tol),
            "direct_track_reuse": {
                "decision": "not_certified_by_this_inspector",
                "required_review": [
                    "Resolve ambiguous/unnamed nodes and unavailable compressed measurements.",
                    "Review immediate/ancestor hierarchy, local rest matrices, world scale and inverse-bind differences; changed rest axes can require retargeting or an explicit transform adapter.",
                    "Map actual runtime track bindings, including GLTFLoader name sanitization and duplicate names.",
                    "Check source/target root-motion conventions, translation units, stance and interpolation on the actual two avatars.",
                    "Run a controlled animation test without IK first, then with the intended IK; this report does not validate skin weights, sole contacts or motion quality."]}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", type=Path, help="GLB files; the first is the comparison reference")
    parser.add_argument("-o", "--output", default="-", help="Output JSON path, or - for stdout (default)")
    parser.add_argument("--abs-tol", type=float, default=1e-5, help="Absolute matrix comparison tolerance")
    parser.add_argument("--rel-tol", type=float, default=1e-6, help="Relative matrix comparison tolerance")
    parser.add_argument("--max-accessor-values", type=int, default=10000000,
                        help="Maximum scalar components decoded per accessor")
    parser.add_argument("--allow-external-buffers", action="store_true",
                        help="Read local relative .bin files confined to each GLB directory; never fetch URLs")
    parser.add_argument("--strict", action="store_true", help="Return exit 2 for partial measurements or validation errors")
    args = parser.parse_args(argv)
    if any(not math.isfinite(v) or v < 0 for v in (args.abs_tol, args.rel_tol)):
        parser.error("Tolerances must be finite and nonnegative.")
    if args.max_accessor_values < 1:
        parser.error("--max-accessor-values must be positive.")
    assets, failures = [], []
    for path in args.paths:
        try:
            asset = GLB(path, args.allow_external_buffers, args.max_accessor_values).inspect()
            assets.append(asset)
        except (InspectionError, OSError, RecursionError) as exc:
            failures.append({"path": str(path.resolve()), "code": getattr(exc, "code", "unreadable_or_invalid_asset"),
                             "message": str(exc), **getattr(exc, "details", {})})
    comparisons = []
    reference = next((a for a in assets if a["path"] == str(args.paths[0].resolve())), None)
    if reference is not None:
        for asset in assets:
            if asset is not reference:
                comparisons.append(compare_assets(reference, asset, args.abs_tol, args.rel_tol))
    report = {"schema_version": VERSION, "name_normalization": NORMALIZATION,
              "matrix_convention": "glTF column-major; world = parentWorld * local; no automatic axis/unit conversion",
              "measurement_scope": "JSON rest hierarchy/transforms, skin bind data and animation accessors only. No mesh deformation, rendering, retargeting, installation or model modification.",
              "compression_policy": "EXT_meshopt_compression accessors are unavailable until an external decoder produces ordinary bufferViews; Draco mesh geometry is not inspected.",
              "assets": assets, "comparisons": comparisons, "failures": failures}
    text = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.output == "-":
        sys.stdout.write(text)
    else:
        output = Path(args.output)
        if output.resolve() in {path.resolve() for path in args.paths}:
            parser.error("Output must not overwrite an input GLB.")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding="utf-8")
        sys.stderr.write(f"Wrote {output.resolve()} ({len(assets)} assets, {len(comparisons)} comparisons, {len(failures)} failures).\n")
    strict_failure = args.strict and any(a["measurement_status"] != "complete" or a["validation_status"] == "errors" for a in assets)
    return 2 if failures or strict_failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
