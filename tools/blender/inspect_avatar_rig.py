"""Inspect an avatar rig from the current blend, FBX, GLB, or glTF file."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import bpy


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path)
    parser.add_argument("--json", required=True, type=Path)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def import_asset(path: Path) -> None:
    extension = path.suffix.lower()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if extension == ".fbx":
        result = bpy.ops.import_scene.fbx(filepath=str(path))
    elif extension in {".glb", ".gltf"}:
        result = bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise RuntimeError(f"Unsupported asset type: {extension}")
    if result != {"FINISHED"}:
        raise RuntimeError(f"Import failed for {path}: {result}")


def matrix_rows(matrix: Any) -> list[list[float]]:
    return [[float(value) for value in row] for row in matrix]


def armature_summary(obj: bpy.types.Object) -> dict[str, Any]:
    return {
        "object": obj.name,
        "data": obj.data.name,
        "location": [float(value) for value in obj.location],
        "rotation_euler": [float(value) for value in obj.rotation_euler],
        "scale": [float(value) for value in obj.scale],
        "dimensions": [float(value) for value in obj.dimensions],
        "bones": [
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "use_deform": bone.use_deform,
                "head_local": [float(value) for value in bone.head_local],
                "tail_local": [float(value) for value in bone.tail_local],
                "length": float(bone.length),
                "matrix_local": matrix_rows(bone.matrix_local),
            }
            for bone in obj.data.bones
        ],
    }


def main() -> None:
    arguments = script_arguments()
    source = arguments.input.resolve() if arguments.input else Path(bpy.data.filepath)
    if arguments.input:
        import_asset(source)

    armatures = [
        armature_summary(obj)
        for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name)
        if obj.type == "ARMATURE"
    ]
    summary = {
        "schemaVersion": "1.0.0",
        "blender": bpy.app.version_string,
        "source": str(source),
        "armatures": armatures,
        "meshes": [
            {
                "name": obj.name,
                "parent": obj.parent.name if obj.parent else None,
                "vertexGroups": [group.name for group in obj.vertex_groups],
                "shapeKeys": [
                    block.name
                    for block in obj.data.shape_keys.key_blocks
                    if block.name != "Basis"
                ] if obj.data.shape_keys else [],
            }
            for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name)
            if obj.type == "MESH"
        ],
        "actions": [
            {
                "name": action.name,
                "frameRange": [float(value) for value in action.frame_range],
                "slots": [slot.identifier for slot in action.slots],
            }
            for action in sorted(bpy.data.actions, key=lambda item: item.name)
        ],
    }
    arguments.json.parent.mkdir(parents=True, exist_ok=True)
    arguments.json.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "source": summary["source"],
                "armatures": [
                    {
                        "object": armature["object"],
                        "bones": len(armature["bones"]),
                    }
                    for armature in armatures
                ],
                "meshes": len(summary["meshes"]),
                "actions": len(summary["actions"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
