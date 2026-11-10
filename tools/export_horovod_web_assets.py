"""Export the approved Horovod controller geometry for the WebGL presentation.

Run through Blender against the final manufacturer-reference v13 scene.  The
export intentionally contains only the six CTRL-* assemblies; the 90 luminous
tubes stay procedural in Three.js so their colour and speed remain interactive.
"""

from pathlib import Path
import math

import bpy


OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "horovod"
    / "interactive"
    / "assets"
    / "horovod-controllers-v13.glb"
)


for obj in bpy.context.scene.objects:
    obj.select_set(False)

controllers = [obj for obj in bpy.context.scene.objects if obj.name.startswith("CTRL-")]
if not controllers:
    raise RuntimeError("No CTRL-* objects were found in the final Horovod scene")

for obj in controllers:
    obj.hide_render = False
    obj.hide_viewport = False
    # Several replicated pedestal objects in the render scene inherit invalid
    # evaluated bounds although their source mesh is sound.  Bake a clean copy
    # of the evaluated mesh and sanitize any non-finite coordinate before glTF
    # serialization; otherwise Blender's exporter rejects the whole assembly.
    if obj.type == "MESH":
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        clean_mesh = bpy.data.meshes.new_from_object(evaluated)
        for vertex in clean_mesh.vertices:
            for axis in range(3):
                if not math.isfinite(vertex.co[axis]):
                    vertex.co[axis] = 0.0
        obj.data = clean_mesh
    for vector in (obj.location, obj.rotation_euler, obj.scale):
        for axis in range(len(vector)):
            if not math.isfinite(vector[axis]):
                vector[axis] = 1.0 if vector is obj.scale else 0.0
    obj.select_set(True)

bpy.context.view_layer.objects.active = controllers[0]
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_animations=False,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)

print(f"HOROVOD_WEB_EXPORT={OUTPUT}")
