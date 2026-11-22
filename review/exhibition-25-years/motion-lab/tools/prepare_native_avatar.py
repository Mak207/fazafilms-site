#!/usr/bin/env python3
"""Keep Avatar Studio's original outfit and native rig; remove unused payloads.

This deliberately narrow GLB utility is for the pinned Emma/Ethan source files
from memoriesrohit/avatar-studio, revision 2fd9ec82fbe1613d40ae38aadcca3f410725f740.
It does not retarget, resample, transform, simplify, quantize, or recompress data.
The source is never overwritten.  All retained bufferView bytes are copied
verbatim, and bone hierarchy/TRS, inverse bind matrices, native animation data,
base mesh attributes/indices, and image bytes are checked before output.

Usage:
  python prepare_native_avatar.py emma_casual.glb emma-native-original.glb \
      --report emma-native-original.json

Only zero-default morphs can be removed.  Animated morph-weight channels are
removed with their targets.  Keep the upstream MIT notices beside distributed
assets.  Run another rig/data audit after any subsequent external optimizer.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pathlib
import struct
import sys
from typing import Any


EXPECTED_CLIPS = [
    "Idle", "Walk", "Wave", "Talk", "Confident", "Argue", "Cheer",
    "Laugh", "Drink", "Clap", "Think", "Shrug", "Phone",
]
VISIBLE_PARTS = {"Body", "Hair", "Outfit_original", "Skin_original"}
HIDDEN_PARTS = {
    "Outfit_formal", "Skin_formal", "Top_shirt", "Skin_shirt",
    "Top_tee", "Skin_tee", "Trousers", "Shoes",
}
SUPPORTED_EXTENSIONS = {"EXT_texture_webp", "KHR_texture_transform"}
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_glb(data: bytes) -> tuple[dict[str, Any], bytes]:
    require(len(data) >= 20, "Truncated GLB header")
    magic, version, length = struct.unpack_from("<4sII", data)
    require(magic == b"glTF" and version == 2, "Expected a GLB 2.0 file")
    require(length == len(data), "GLB length does not match its header")
    document = None
    binary = None
    offset = 12
    while offset < length:
        require(offset + 8 <= length, "Truncated GLB chunk header")
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        require(size % 4 == 0 and offset + size <= length, "Invalid GLB chunk size")
        payload = data[offset:offset + size]
        offset += size
        if kind == JSON_CHUNK:
            require(document is None and binary is None, "Unexpected JSON chunk")
            document = json.loads(payload)
        elif kind == BIN_CHUNK:
            require(document is not None and binary is None, "Unexpected BIN chunk")
            binary = payload
        else:
            raise ValueError(f"Unsupported GLB chunk {kind:#x}")
    require(document is not None and binary is not None, "Expected JSON and BIN chunks")
    buffers = document.get("buffers", [])
    require(len(buffers) == 1 and "uri" not in buffers[0], "Expected one embedded buffer")
    require(0 <= len(binary) - buffers[0]["byteLength"] <= 3, "Invalid binary padding")
    return document, binary[:buffers[0]["byteLength"]]


def encode_glb(document: dict[str, Any], binary: bytes) -> bytes:
    js = json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    js += b" " * (-len(js) % 4)
    padded_binary = binary + b"\0" * (-len(binary) % 4)
    length = 12 + 8 + len(js) + 8 + len(padded_binary)
    return (struct.pack("<4sII", b"glTF", 2, length)
            + struct.pack("<II", len(js), JSON_CHUNK) + js
            + struct.pack("<II", len(padded_binary), BIN_CHUNK) + padded_binary)


def view_bytes(document: dict[str, Any], binary: bytes, index: int) -> bytes:
    view = document["bufferViews"][index]
    require(view.get("buffer", 0) == 0, "External bufferView is unsupported")
    start = view.get("byteOffset", 0)
    end = start + view["byteLength"]
    require(0 <= start <= end <= len(binary), "bufferView is outside the BIN chunk")
    return binary[start:end]


def accessor_views(accessor: dict[str, Any]) -> list[int]:
    result = [accessor["bufferView"]] if "bufferView" in accessor else []
    if "sparse" in accessor:
        result += [accessor["sparse"][kind]["bufferView"] for kind in ("indices", "values")]
    return result


def accessor_fingerprint(document: dict[str, Any], binary: bytes, index: int) -> dict[str, Any]:
    accessor = copy.deepcopy(document["accessors"][index])

    def replace(container: dict[str, Any]) -> None:
        if "bufferView" not in container:
            return
        view_index = container["bufferView"]
        view = copy.deepcopy(document["bufferViews"][view_index])
        view.pop("buffer", None)
        view.pop("byteOffset", None)
        container["bufferView"] = {"descriptor": view, "sha256": digest(view_bytes(document, binary, view_index))}

    replace(accessor)
    if "sparse" in accessor:
        replace(accessor["sparse"]["indices"])
        replace(accessor["sparse"]["values"])
    return accessor


def texture_infos(value: Any):
    """Yield standard material texture-info objects, including material extensions."""
    if isinstance(value, dict):
        for key, child in value.items():
            if key.endswith("Texture") and isinstance(child, dict) and "index" in child:
                yield child
            yield from texture_infos(child)
    elif isinstance(value, list):
        for child in value:
            yield from texture_infos(child)


def check_supported(document: dict[str, Any]) -> None:
    extensions = set(document.get("extensionsUsed", [])) | set(document.get("extensionsRequired", []))
    require(not extensions - SUPPORTED_EXTENSIONS,
            f"Unsupported extensions; use uncompressed upstream GLBs: {sorted(extensions - SUPPORTED_EXTENSIONS)}")
    require(not document.get("extensions"), "Root extension references are unsupported")
    for key in ("nodes", "scenes", "skins", "meshes", "accessors", "bufferViews", "animations", "images"):
        for obj in document.get(key, []):
            require(not obj.get("extensions"), f"Unsupported references in {key}.extensions")
    for mesh in document.get("meshes", []):
        for primitive in mesh["primitives"]:
            require(not primitive.get("extensions"), "Primitive extensions are unsupported")
    for animation in document.get("animations", []):
        for item in animation["channels"] + animation["samplers"]:
            require(not item.get("extensions"), "Animation extensions are unsupported")
    for texture in document.get("textures", []):
        require(set(texture.get("extensions", {})) <= {"EXT_texture_webp"}, "Unsupported texture extension")
    for image in document.get("images", []):
        require("uri" not in image or image["uri"].startswith("data:"), "External image URI is unsupported")


def rig_signature(document: dict[str, Any], binary: bytes) -> dict[str, Any]:
    nodes = document["nodes"]
    parent = {child: index for index, node in enumerate(nodes) for child in node.get("children", [])}
    joint_indices = {index for skin in document.get("skins", []) for index in skin["joints"]}
    names = {index: nodes[index].get("name") for index in joint_indices}
    require(all(names.values()) and len(set(names.values())) == len(names), "Joint names must be unique")
    bones = {}
    for index, name in names.items():
        node = nodes[index]
        bones[name] = {
            "parent": nodes[parent[index]].get("name") if index in parent else None,
            "children": [nodes[c].get("name") for c in node.get("children", [])],
            "transform": {key: node[key] for key in ("translation", "rotation", "scale", "matrix") if key in node},
        }
    skins = []
    for skin in document.get("skins", []):
        entry = copy.deepcopy(skin)
        entry["joints"] = [nodes[j].get("name") for j in skin["joints"]]
        if "skeleton" in skin:
            entry["skeleton"] = nodes[skin["skeleton"]].get("name")
        if "inverseBindMatrices" in skin:
            entry["inverseBindMatrices"] = accessor_fingerprint(document, binary, skin["inverseBindMatrices"])
        skins.append(entry)
    animations = []
    for animation in document.get("animations", []):
        channels = []
        for channel in animation["channels"]:
            target = channel["target"]
            if target.get("node") not in joint_indices or target.get("path") == "weights":
                continue
            entry = copy.deepcopy(channel)
            entry["target"]["node"] = nodes[target["node"]].get("name")
            sampler = copy.deepcopy(animation["samplers"][channel["sampler"]])
            for key in ("input", "output"):
                sampler[key] = accessor_fingerprint(document, binary, sampler[key])
            entry["sampler"] = sampler
            channels.append(entry)
        animations.append({"name": animation.get("name"), "channels": channels})
    return {"bones": bones, "skins": skins, "animations": animations}


def prepare(document: dict[str, Any], binary: bytes) -> tuple[dict[str, Any], bytes, dict[str, Any]]:
    check_supported(document)
    require([a.get("name") for a in document.get("animations", [])] == EXPECTED_CLIPS,
            "Expected the 13 native Avatar Studio clips in their original order")
    require(len(document.get("skins", [])) == 1 and len(document["skins"][0]["joints"]) == 80,
            "Expected the native 80-joint skin")
    before_rig = rig_signature(document, binary)
    result = copy.deepcopy(document)
    nodes = document["nodes"]
    mesh_names = [n.get("name") for n in nodes if "mesh" in n]
    require(set(mesh_names) == VISIBLE_PARTS | HIDDEN_PARTS and len(mesh_names) == 12,
            f"Unexpected outfit layout: {mesh_names}")
    remove = {i for i, node in enumerate(nodes) if node.get("name") in HIDDEN_PARTS and "mesh" in node}
    require(all(not nodes[i].get("children") for i in remove), "Hidden outfit nodes must be leaves")
    require(not remove.intersection(document["skins"][0]["joints"]), "Cannot remove a skin joint")
    kept_nodes = [i for i in range(len(nodes)) if i not in remove]
    node_map = {old: new for new, old in enumerate(kept_nodes)}
    result["nodes"] = [result["nodes"][i] for i in kept_nodes]
    for node in result["nodes"]:
        if "children" in node:
            node["children"] = [node_map[i] for i in node["children"] if i in node_map]
            if not node["children"]:
                node.pop("children")
        require(all(weight == 0 for weight in node.get("weights", [])), "Nonzero default node morph weights")
        node.pop("weights", None)
    for scene in result.get("scenes", []):
        scene["nodes"] = [node_map[i] for i in scene.get("nodes", []) if i in node_map]
    for skin in result["skins"]:
        skin["joints"] = [node_map[i] for i in skin["joints"]]
        if "skeleton" in skin:
            skin["skeleton"] = node_map[skin["skeleton"]]

    kept_meshes = sorted({node["mesh"] for node in result["nodes"] if "mesh" in node})
    mesh_map = {old: new for new, old in enumerate(kept_meshes)}
    result["meshes"] = [result["meshes"][i] for i in kept_meshes]
    removed_morph_sets = 0
    for node in result["nodes"]:
        if "mesh" in node:
            node["mesh"] = mesh_map[node["mesh"]]
    for mesh in result["meshes"]:
        require(all(weight == 0 for weight in mesh.get("weights", [])), "Nonzero default mesh morph weights")
        mesh.pop("weights", None)
        if isinstance(mesh.get("extras"), dict):
            mesh["extras"].pop("targetNames", None)
            if not mesh["extras"]:
                mesh.pop("extras")
        for primitive in mesh["primitives"]:
            removed_morph_sets += len(primitive.get("targets", []))
            primitive.pop("targets", None)

    removed_channels = 0
    for animation in result["animations"]:
        channels = []
        for channel in animation["channels"]:
            target = channel["target"]
            require("node" in target and target.get("path") in {"translation", "rotation", "scale", "weights"},
                    "Unsupported animation target")
            if target["path"] == "weights" or target["node"] not in node_map:
                removed_channels += 1
                continue
            target["node"] = node_map[target["node"]]
            channels.append(channel)
        require(channels, f"Removing all channels would lose clip {animation.get('name')}")
        kept_samplers = sorted({channel["sampler"] for channel in channels})
        sampler_map = {old: new for new, old in enumerate(kept_samplers)}
        animation["samplers"] = [animation["samplers"][i] for i in kept_samplers]
        for channel in channels:
            channel["sampler"] = sampler_map[channel["sampler"]]
        animation["channels"] = channels

    primitives = [p for mesh in result["meshes"] for p in mesh["primitives"]]
    kept_accessors = {i for p in primitives for i in p["attributes"].values()}
    kept_accessors.update(p["indices"] for p in primitives if "indices" in p)
    kept_accessors.update(s["inverseBindMatrices"] for s in result["skins"] if "inverseBindMatrices" in s)
    kept_accessors.update(s[key] for a in result["animations"] for s in a["samplers"] for key in ("input", "output"))
    accessor_map = {old: new for new, old in enumerate(sorted(kept_accessors))}
    result["accessors"] = [result["accessors"][i] for i in sorted(kept_accessors)]
    for primitive in primitives:
        primitive["attributes"] = {key: accessor_map[index] for key, index in primitive["attributes"].items()}
        if "indices" in primitive:
            primitive["indices"] = accessor_map[primitive["indices"]]
    for skin in result["skins"]:
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = accessor_map[skin["inverseBindMatrices"]]
    for animation in result["animations"]:
        for sampler in animation["samplers"]:
            for key in ("input", "output"):
                sampler[key] = accessor_map[sampler[key]]

    def subset(key: str, indices: set[int]) -> dict[int, int]:
        order = sorted(indices)
        mapping = {old: new for new, old in enumerate(order)}
        values = result.get(key, [])
        if order:
            result[key] = [values[i] for i in order]
        else:
            result.pop(key, None)
        return mapping

    material_map = subset("materials", {p["material"] for p in primitives if "material" in p})
    for primitive in primitives:
        if "material" in primitive:
            primitive["material"] = material_map[primitive["material"]]
    infos = list(texture_infos(result.get("materials", [])))
    texture_map = subset("textures", {info["index"] for info in infos})
    for info in infos:
        info["index"] = texture_map[info["index"]]
    textures = result.get("textures", [])
    image_refs = [texture for texture in textures if "source" in texture]
    image_refs += [texture["extensions"]["EXT_texture_webp"] for texture in textures
                   if "EXT_texture_webp" in texture.get("extensions", {})]
    image_map = subset("images", {ref["source"] for ref in image_refs})
    for ref in image_refs:
        ref["source"] = image_map[ref["source"]]
    sampler_map = subset("samplers", {t["sampler"] for t in textures if "sampler" in t})
    for texture in textures:
        if "sampler" in texture:
            texture["sampler"] = sampler_map[texture["sampler"]]

    needed_views = {v for accessor in result["accessors"] for v in accessor_views(accessor)}
    needed_views.update(image["bufferView"] for image in result.get("images", []) if "bufferView" in image)
    view_map = {old: new for new, old in enumerate(sorted(needed_views))}
    packed = bytearray()
    new_views = []
    for index in sorted(needed_views):
        packed.extend(b"\0" * (-len(packed) % 4))
        view = copy.deepcopy(document["bufferViews"][index])
        view["buffer"] = 0
        view["byteOffset"] = len(packed)
        payload = view_bytes(document, binary, index)
        packed.extend(payload)
        new_views.append(view)
    result["bufferViews"] = new_views
    result["buffers"][0]["byteLength"] = len(packed)
    for accessor in result["accessors"]:
        if "bufferView" in accessor:
            accessor["bufferView"] = view_map[accessor["bufferView"]]
        if "sparse" in accessor:
            for kind in ("indices", "values"):
                sparse = accessor["sparse"][kind]
                sparse["bufferView"] = view_map[sparse["bufferView"]]
    for image in result.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = view_map[image["bufferView"]]

    packed_bytes = bytes(packed)
    require(before_rig == rig_signature(result, packed_bytes), "Rig or native animation invariant failed")
    for old, new in accessor_map.items():
        require(accessor_fingerprint(document, binary, old) == accessor_fingerprint(result, packed_bytes, new),
                f"Retained accessor changed: {old}")
    for old, new in view_map.items():
        require(view_bytes(document, binary, old) == view_bytes(result, packed_bytes, new),
                f"Retained geometry/animation/image bytes changed: bufferView {old}")
    # Verify the serialized result, not just the in-memory representation.
    parsed, parsed_binary = parse_glb(encode_glb(result, packed_bytes))
    require(before_rig == rig_signature(parsed, parsed_binary), "Serialized rig invariant failed")
    report = {
        "removed_outfit_nodes": sorted(nodes[i]["name"] for i in remove),
        "retained_mesh_nodes": sorted(node.get("name") for node in result["nodes"] if "mesh" in node),
        "removed_primitive_morph_target_sets": removed_morph_sets,
        "removed_animation_channels": removed_channels,
        "counts_before": {key: len(document.get(key, [])) for key in ("nodes", "meshes", "accessors", "bufferViews", "images", "materials")},
        "counts_after": {key: len(result.get(key, [])) for key in ("nodes", "meshes", "accessors", "bufferViews", "images", "materials")},
        "clips": [{"name": a["name"], "channels": len(a["channels"])} for a in result["animations"]],
        "preserved": {"joint_count": 80, "joint_names_order_hierarchy_and_trs": True,
                      "inverse_bind_matrices_bytes": True, "bone_animation_channels_and_sampler_bytes": True,
                      "base_geometry_and_skin_attributes_bytes": True, "retained_image_bytes": True},
        "binary_bytes_before": len(binary), "binary_bytes_after": len(packed_bytes),
        "limitations": ["Default morph weights were zero; facial morph animation is removed.",
                        "This preserves the source-native avatar, not the separately modified exhibition rig.",
                        "Any later external compression/optimization requires another invariant audit.",
                        "Keep the upstream Microsoft Rocketbox and Avatar Studio MIT notices."],
    }
    return result, packed_bytes, report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--report", type=pathlib.Path, help="Optional JSON audit report; must not already exist")
    args = parser.parse_args()
    try:
        require(args.source.resolve() != args.output.resolve(), "The source cannot be overwritten")
        require(not args.output.exists(), "Output already exists; choose a new path")
        if args.report:
            require(args.report.resolve() not in {args.source.resolve(), args.output.resolve()}, "Report path must be distinct")
            require(not args.report.exists(), "Report already exists; choose a new path")
        original = args.source.read_bytes()
        document, binary = parse_glb(original)
        prepared, packed, report = prepare(document, binary)
        output = encode_glb(prepared, packed)
        report.update({"source": str(args.source), "output": str(args.output),
                       "source_sha256": digest(original), "output_sha256": digest(output),
                       "file_bytes_before": len(original), "file_bytes_after": len(output)})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("xb") as handle:
            handle.write(output)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            with args.report.open("x", encoding="utf-8") as handle:
                json.dump(report, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        print(f"prepare_native_avatar: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
