#!/usr/bin/env python3
"""Export the eight pinned Rocketbox turns without changing the sampling method.

Run from the repository root with the existing Blender 4.5 installation:
  blender --background --factory-startup --python \
    review/exhibition-25-years/motion-lab/tools/export_rocketbox_world_samples.py \
    -- --input-dir /path/to/pinned-fbx --output-dir /path/to/world-samples

Lightweight input verification does not require Blender:
  python export_rocketbox_world_samples.py --input-dir /path/to/pinned-fbx \
    --verify-only

Input may be a flat download folder or a Microsoft-Rocketbox checkout. The
adjacent manifest supplies exact Git blob SHA-1, SHA-256, byte sizes and licenses.
Existing output files are never overwritten. No download or installation occurs.

The 54-bone Biped/Mixamo mapping follows the pinned MIT Avatar Studio rb_build.py;
both upstream license notices and revisions are in rocketbox-turns-manifest.json.
Use the existing pinned Three/UPF vendor and saved current rigs for the next
retargeting stage. This exporter does not retarget or load any target avatar.
"""
import argparse
import hashlib
import json
import math
import pathlib
import re
import sys

SOURCE_REVISION = "0943055db6ec570bcef9f2c8b41c9e5467c808f9"
SAMPLE_FPS = 60.0
MAP = {
    "Bip01 Pelvis": "Hips", "Bip01 Spine": "Spine",
    "Bip01 Spine1": "Spine1", "Bip01 Spine2": "Spine2",
    "Bip01 Neck": "Neck", "Bip01 Head": "Head",
    "Bip01 LEye": "LeftEye", "Bip01 REye": "RightEye",
}
for short, side in (("L", "Left"), ("R", "Right")):
    MAP.update({
        f"Bip01 {short} Clavicle": f"{side}Shoulder",
        f"Bip01 {short} UpperArm": f"{side}Arm",
        f"Bip01 {short} Forearm": f"{side}ForeArm",
        f"Bip01 {short} Hand": f"{side}Hand",
        f"Bip01 {short} Thigh": f"{side}UpLeg",
        f"Bip01 {short} Calf": f"{side}Leg",
        f"Bip01 {short} Foot": f"{side}Foot",
        f"Bip01 {short} Toe0": f"{side}ToeBase",
    })
    for i, finger in enumerate(("Thumb", "Index", "Middle", "Ring", "Pinky")):
        MAP[f"Bip01 {short} Finger{i}"] = f"{side}Hand{finger}1"
        MAP[f"Bip01 {short} Finger{i}1"] = f"{side}Hand{finger}2"
        MAP[f"Bip01 {short} Finger{i}2"] = f"{side}Hand{finger}3"


def hashes(path):
    size = path.stat().st_size
    blob = hashlib.sha1(f"blob {size}\0".encode("ascii"))
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            blob.update(chunk)
            digest.update(chunk)
    return {"bytes": size, "git_blob_sha1": blob.hexdigest(),
            "sha256": digest.hexdigest()}


def load_inputs(input_dir, manifest):
    if manifest.get("source_revision") != SOURCE_REVISION:
        raise ValueError("Manifest revision differs from the verified Rocketbox pin")
    expected = {
        f"{sex}_turn_{side}_{angle}.max.fbx"
        for sex in ("f", "m") for side in ("left", "right")
        for angle in (90, 180)
    }
    assets = manifest["assets"]
    if len(assets) != 8 or {a["filename"] for a in assets} != expected:
        raise ValueError("Manifest must contain exactly the eight used turn FBX files")
    verified = []
    for asset in assets:
        filename = asset["filename"]
        if not re.fullmatch(r"[fm]_turn_(left|right)_(90|180)\.max\.fbx", filename):
            raise ValueError("Unexpected asset filename")
        path = input_dir / filename
        if not path.is_file():
            relative = pathlib.PurePosixPath(asset["source_path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Unsafe source_path in manifest")
            path = input_dir.joinpath(*relative.parts)
        measured = hashes(path)
        for key in ("bytes", "git_blob_sha1", "sha256"):
            if measured[key] != asset[key]:
                raise ValueError(f"{filename}: {key} does not match the pinned manifest")
        verified.append((asset, path, measured))
    return verified


def write_new_json(path, document, compact=True):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(document, stream, ensure_ascii=False, allow_nan=False,
                  separators=(",", ":") if compact else None,
                  indent=None if compact else 2)
        stream.write("\n")


def export_one(bpy, Matrix, asset, path, measured, output_dir):
    # These operations match the previously verified exporter. Static import and
    # animated import are independent; frame zero is never substituted for rest.
    conversion = Matrix.Rotation(-math.pi / 2, 4, "X")

    def columns(matrix):
        return [float(matrix[row][column])
                for column in range(4) for row in range(4)]

    def rigid(matrix):
        return (Matrix.Translation(matrix.to_translation())
                @ matrix.to_quaternion().to_matrix().to_4x4())

    def import_fbx(animate):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=str(path),
                                automatic_bone_orientation=False,
                                use_anim=animate)
        armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
        if len(armatures) != 1:
            raise RuntimeError(f"{path.name}: expected one imported armature")
        return armatures[0]

    armature = import_fbx(False)
    fixed = armature.matrix_world.copy()
    source_names = [
        bone.name for bone in sorted(
            armature.data.bones, key=lambda bone: len(bone.parent_recursive))
        if bone.name in MAP
    ]
    if set(source_names) != set(MAP):
        raise RuntimeError(f"{path.name}: expected all 54 mapped bones")
    bones = []
    for name in source_names:
        bone = armature.data.bones[name]
        parent = bone.parent
        while parent and parent.name not in MAP:
            parent = parent.parent
        world = conversion @ fixed @ bone.matrix_local
        bones.append({
            "name": "mixamorig:" + MAP[name],
            "threeBindingName": "mixamorig" + MAP[name],
            "sourceName": name,
            "parent": "mixamorig:" + MAP[parent.name] if parent else None,
            "sourceParent": bone.parent.name if bone.parent else None,
            "restWorld": columns(world),
            "restWorldRigid": columns(rigid(world)),
            "worldScale": list(world.to_scale()),
        })
    static_reference = {
        "armature_name": armature.name,
        "armatureWorldBlender": columns(fixed),
        "bone_count_all": len(armature.data.bones),
        "rest_source": (
            "Separate FBX import use_anim=False; armature.matrix_world @ "
            "dataBone.matrix_local. This is FBX static reference, not asserted "
            "canonical bind."
        ),
    }

    armature = import_fbx(True)
    scene = bpy.context.scene
    if not armature.animation_data or not armature.animation_data.action:
        raise RuntimeError(f"{path.name}: no imported armature animation")
    action = armature.animation_data.action
    start, end = [float(value) for value in action.frame_range]
    source_fps = scene.render.fps / scene.render.fps_base
    duration = (end - start) / source_fps
    count = int(round(duration * SAMPLE_FPS)) + 1
    times = [i / SAMPLE_FPS for i in range(count)]
    if not times or duration <= 0 or abs(times[-1] - duration) > 1e-7:
        raise RuntimeError(f"{path.name}: duration does not fit the verified 60 Hz grid")

    samples, samples_rigid, object_world = [], [], []
    for time in times:
        frame = start + time * source_fps
        scene.frame_set(int(math.floor(frame)),
                        subframe=frame - math.floor(frame))
        evaluated = armature.evaluated_get(bpy.context.evaluated_depsgraph_get())
        object_world.append(columns(conversion @ evaluated.matrix_world))
        matrices = [
            conversion @ evaluated.matrix_world @ evaluated.pose.bones[name].matrix
            for name in source_names
        ]
        samples.append([columns(matrix) for matrix in matrices])
        samples_rigid.append([columns(rigid(matrix)) for matrix in matrices])

    record = {
        "format": "rocketbox-world-samples-v1",
        "source_filename": path.name,
        "sha256_fbx": measured["sha256"],
        "source_git_blob_sha1": measured["git_blob_sha1"],
        "source_url": asset["url"],
        "source_revision": SOURCE_REVISION,
        "license": "MIT",
        "coordinates": {
            "up": "+Y", "units": "metres", "matrix_layout": "column-major",
            "conversion": (
                "C=RotationX(-pi/2); "
                "world=C @ evaluatedArm.matrix_world @ poseBone.matrix"
            ),
            "raw_scale": (
                "samples/restWorld retain imported uniform scale .01; "
                "samplesRigid/restWorldRigid remove only per-matrix scale, "
                "retaining world positions and orientations"
            ),
        },
        "fps": SAMPLE_FPS, "source_fps": source_fps,
        "source_frame_range": [start, end], "duration": duration,
        "rest_import": static_reference, "bones": bones, "times": times,
        "samples": samples, "samplesRigid": samples_rigid,
        "animatedArmatureWorld": object_world,
        "exporter": {"blender_version": bpy.app.version_string,
                     "blender_build_hash": bpy.app.build_hash.decode("ascii")},
        "notes": [
            "Armature object motion included; no helper/object motion discarded.",
            "No upright correction, hand pose edits or target retarget applied.",
            "Static FBX reference is not asserted to be a canonical bind pose.",
        ],
    }
    output = output_dir / asset["filename"].replace(".max.fbx", ".json")
    write_new_json(output, record)
    first = Matrix([samples[0][0][row::4] for row in range(4)])
    reference = Matrix([bones[0]["restWorld"][row::4] for row in range(4)])
    last = Matrix([samples[-1][0][row::4] for row in range(4)])
    angle = math.degrees(
        (first.to_quaternion() @ reference.to_quaternion().inverted()).angle)
    item = {
        "file": output.name, "sha256": hashes(output)["sha256"],
        "bytes": output.stat().st_size, "source": asset["filename"],
        "bones": len(bones), "frames": count, "duration": duration,
        "source_fps": source_fps, "source_frame_range": [start, end],
        "hips_first_minus_reference_m": list(
            first.to_translation() - reference.to_translation()),
        "hips_first_vs_reference_deg": min(angle, 360 - angle),
        "hips_delta_first_to_last_m": list(
            last.to_translation() - first.to_translation()),
    }
    print("WORLD_SAMPLE_READY", json.dumps(item), flush=True)
    return item


def main(argv=None):
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output-dir", type=pathlib.Path,
                        help="External folder for eight JSON files and index.json")
    parser.add_argument("--manifest", type=pathlib.Path,
                        default=pathlib.Path(__file__).with_name("rocketbox-turns-manifest.json"))
    parser.add_argument("--verify-only", action="store_true",
                        help="Verify all eight pinned FBX hashes without importing Blender")
    args = parser.parse_args(argv)
    if not args.verify_only and args.output_dir is None:
        parser.error("--output-dir is required unless --verify-only is used")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    verified = load_inputs(args.input_dir.resolve(), manifest)
    print("PINNED_INPUTS_VERIFIED", json.dumps({
        "source_revision": SOURCE_REVISION, "files": len(verified),
        "bytes": sum(item[2]["bytes"] for item in verified)}), flush=True)
    if args.verify_only:
        return 0

    import bpy
    from mathutils import Matrix
    if bpy.app.version[:2] != (4, 5):
        raise RuntimeError("Use the existing Blender 4.5 installation for this verified pipeline")
    output_dir = args.output_dir.resolve()
    outputs = [output_dir / item[0]["filename"].replace(".max.fbx", ".json")
               for item in verified] + [output_dir / "index.json"]
    existing = [str(path) for path in outputs if path.exists()]
    if existing:
        raise FileExistsError("Refusing to overwrite existing outputs: " + ", ".join(existing))
    output_dir.mkdir(parents=True, exist_ok=True)
    index = [export_one(bpy, Matrix, asset, path, measured, output_dir)
             for asset, path, measured in verified]
    write_new_json(output_dir / "index.json", {
        "format": "rocketbox-world-samples-v1",
        "source_revision": SOURCE_REVISION,
        "source_manifest_sha256": hashes(args.manifest)["sha256"],
        "files": index,
    }, compact=False)
    print("WORLD_SAMPLES_COMPLETE", str(output_dir / "index.json"), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
