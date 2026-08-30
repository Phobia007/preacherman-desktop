"""Export the authored Zima FBX as the browser-ready GLB used by Preacherman."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def main() -> None:
    arguments = script_arguments()
    source = arguments.input.resolve()
    output = arguments.output.resolve()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.fbx(filepath=str(source))
    if result != {"FINISHED"}:
        raise RuntimeError(f"Import failed for {source}: {result}")

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1 or not meshes:
        raise RuntimeError(
            f"Expected one armature and at least one mesh; got {len(armatures)} armatures and {len(meshes)} meshes"
        )

    actions = list(bpy.data.actions)
    if len(actions) != 1:
        raise RuntimeError(f"Expected one authored Zima action; got {len(actions)}")
    actions[0].name = "zima.idle.v1"

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for obj in [*armatures, *meshes]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armatures[0]

    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        check_existing=False,
        export_format="GLB",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"Export failed for {output}: {result}")

    print(
        {
            "source": str(source),
            "output": str(output),
            "armature": armatures[0].name,
            "bones": len(armatures[0].data.bones),
            "meshes": len(meshes),
            "action": actions[0].name,
        }
    )


if __name__ == "__main__":
    main()
