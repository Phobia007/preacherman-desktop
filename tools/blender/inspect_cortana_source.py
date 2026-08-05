"""Inspect the Cortana source blend without modifying or saving it."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=Path)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def action_fcurves(action: bpy.types.Action) -> Iterable[bpy.types.FCurve]:
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def object_summary(obj: bpy.types.Object) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "name": obj.name,
        "type": obj.type,
        "data": obj.data.name if obj.data else None,
        "visible": obj.visible_get(),
        "hide_viewport": obj.hide_viewport,
        "hide_render": obj.hide_render,
        "parent": obj.parent.name if obj.parent else None,
        "parent_type": obj.parent_type,
        "parent_bone": obj.parent_bone or None,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "dimensions": list(obj.dimensions),
        "collections": [collection.name for collection in obj.users_collection],
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "object": (
                    modifier.object.name
                    if getattr(modifier, "object", None)
                    else None
                ),
                "show_viewport": modifier.show_viewport,
                "show_render": modifier.show_render,
            }
            for modifier in obj.modifiers
        ],
    }
    if obj.type == "MESH":
        summary.update(
            {
                "vertices": len(obj.data.vertices),
                "vertex_groups": len(obj.vertex_groups),
                "materials": [
                    slot.material.name if slot.material else None
                    for slot in obj.material_slots
                ],
            }
        )
    if obj.type == "ARMATURE":
        summary["bones"] = len(obj.data.bones)
        animation_data = obj.animation_data
        summary["active_action"] = (
            animation_data.action.name
            if animation_data and animation_data.action
            else None
        )
        summary["active_slot"] = (
            animation_data.action_slot.identifier
            if animation_data
            and animation_data.action
            and animation_data.action_slot
            else None
        )
    return summary


def action_summary(action: bpy.types.Action) -> dict[str, Any]:
    fcurves = list(action_fcurves(action))
    return {
        "name": action.name,
        "frame_range": [float(value) for value in action.frame_range],
        "is_action_layered": action.is_action_layered,
        "is_action_legacy": action.is_action_legacy,
        "slots": [
            {
                "identifier": slot.identifier,
                "target_id_type": slot.target_id_type,
                "name_display": slot.name_display,
            }
            for slot in action.slots
        ],
        "layers": len(action.layers),
        "fcurves": len(fcurves),
        "keyframes": sum(
            len(fcurve.keyframe_points) for fcurve in fcurves
        ),
        "curve_stats": [
            {
                "data_path": fcurve.data_path,
                "array_index": fcurve.array_index,
                "minimum": min(
                    point.co.y for point in fcurve.keyframe_points
                ),
                "maximum": max(
                    point.co.y for point in fcurve.keyframe_points
                ),
            }
            for fcurve in fcurves
            if fcurve.keyframe_points
        ],
        "data_paths": sorted({fcurve.data_path for fcurve in fcurves}),
    }


def main() -> None:
    arguments = script_arguments()
    scene = bpy.context.scene
    summary = {
        "blender": bpy.app.version_string,
        "blend": bpy.data.filepath,
        "gltf_export_properties": [
            property_definition.identifier
            for property_definition in bpy.ops.export_scene.gltf.get_rna_type().properties
        ],
        "fps": scene.render.fps,
        "fps_base": scene.render.fps_base,
        "frame_start": scene.frame_start,
        "frame_end": scene.frame_end,
        "objects": [
            object_summary(obj)
            for obj in sorted(scene.objects, key=lambda item: item.name)
        ],
        "actions": [
            action_summary(action)
            for action in sorted(bpy.data.actions, key=lambda item: item.name)
        ],
    }
    serialized = json.dumps(summary, ensure_ascii=False, indent=2)
    if arguments.json:
        arguments.json.parent.mkdir(parents=True, exist_ok=True)
        arguments.json.write_text(serialized + "\n", encoding="utf-8")
    print("CORTANA_INSPECT_BEGIN")
    print(serialized)
    print("CORTANA_INSPECT_END")


if __name__ == "__main__":
    main()
