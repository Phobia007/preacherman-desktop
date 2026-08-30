"""Retarget one Speech2Motion V3 NPZ capture to a Preacherman avatar."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import bpy
import numpy as np
from mathutils import Matrix


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", required=True, type=Path)
    parser.add_argument("--restpose", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--speech-bone-map", required=True, type=Path)
    parser.add_argument("--target-bone-map", required=True, type=Path)
    parser.add_argument("--action-id", required=True)
    parser.add_argument("--output-glb", required=True, type=Path)
    parser.add_argument("--output-manifest", required=True, type=Path)
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def create_source_armature(restpose: Any) -> bpy.types.Object:
    armature = bpy.data.armatures.new("speech2motion-source")
    source = bpy.data.objects.new("speech2motion-source", armature)
    bpy.context.collection.objects.link(source)
    bpy.context.view_layer.objects.active = source
    source.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    joint_names = [str(name) for name in restpose["joint_names"]]
    parents = [str(name) for name in restpose["parents"]]
    heads = restpose["rest_heads"]
    tails = restpose["rest_tails"]
    rolls = restpose["rolls"]
    for index, name in enumerate(joint_names):
        bone = armature.edit_bones.new(name)
        bone.head = heads[index]
        bone.tail = tails[index]
        if (bone.tail - bone.head).length < 1e-5:
            bone.tail = bone.head + (0.0, 0.05, 0.0)
        bone.roll = float(rolls[index])
    for name, parent_name in zip(joint_names, parents):
        if parent_name and parent_name in armature.edit_bones:
            armature.edit_bones[name].parent = armature.edit_bones[parent_name]
    bpy.ops.object.mode_set(mode="OBJECT")
    return source


def create_source_action(
    source: bpy.types.Object,
    capture: Any,
    action_id: str,
) -> bpy.types.Action:
    action = bpy.data.actions.new(action_id)
    source.animation_data_create()
    source.animation_data.action = action
    joint_names = [str(name) for name in capture["joint_names"]]
    rotation_matrices = capture["joint_rotmat"]
    root_positions = capture["root_world_position"]
    root_origin = root_positions[0].copy()
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = rotation_matrices.shape[0]

    for frame_index in range(rotation_matrices.shape[0]):
        frame = frame_index + 1
        for joint_index, name in enumerate(joint_names):
            if name not in source.pose.bones:
                continue
            pose_bone = source.pose.bones[name]
            pose_bone.rotation_mode = "QUATERNION"
            pose_bone.rotation_quaternion = Matrix(
                rotation_matrices[frame_index, joint_index]
            ).to_quaternion()
            pose_bone.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=name
            )
        hips = source.pose.bones.get("Hips")
        if hips is not None:
            hips.location = root_positions[frame_index] - root_origin
            hips.keyframe_insert(data_path="location", frame=frame, group="Hips")
    return action


def import_target(path: Path) -> tuple[set[bpy.types.Object], bpy.types.Object]:
    before = set(bpy.data.objects)
    if path.suffix.lower() == ".fbx":
        result = bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        result = bpy.ops.import_scene.gltf(filepath=str(path))
    if result != {"FINISHED"}:
        raise RuntimeError(f"Target import failed: {result}")
    imported = set(bpy.data.objects).difference(before)
    armatures = [item for item in imported if item.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one target armature, received {len(armatures)}")
    return imported, armatures[0]


def compose_mapping(
    speech_map: dict[str, Any], target_map: dict[str, Any]
) -> dict[str, str]:
    canonical_to_target = target_map.get("bones")
    if target_map.get("mappingMode") == "identity":
        canonical_to_target = {
            canonical: canonical for canonical in speech_map["bones"].values()
        }
    return {
        speech_name: canonical_to_target[canonical]
        for speech_name, canonical in speech_map["bones"].items()
        if canonical in canonical_to_target
    }


def bone_depth(bone: bpy.types.Bone) -> int:
    depth = 0
    parent = bone.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def retarget(
    source: bpy.types.Object,
    target: bpy.types.Object,
    source_action: bpy.types.Action,
    mapping: dict[str, str],
    action_id: str,
) -> bpy.types.Action:
    target_action = bpy.data.actions.new(f"{action_id}-target")
    target.animation_data_create()
    target.animation_data.action = target_action
    source.animation_data.action = source_action
    source_rest = {
        name: source.data.bones[name].matrix_local.copy() for name in mapping
    }
    target_rest = {
        name: target.data.bones[name].matrix_local.copy() for name in mapping.values()
    }
    ordered = sorted(mapping.items(), key=lambda pair: bone_depth(target.data.bones[pair[1]]))
    translation_scale = target.dimensions.z / source.dimensions.z
    scene = bpy.context.scene

    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        for target_bone in target.pose.bones:
            target_bone.matrix_basis.identity()
            target_bone.rotation_mode = "QUATERNION"
        bpy.context.view_layer.update()
        for source_name, target_name in ordered:
            source_pose = source.pose.bones[source_name]
            target_pose = target.pose.bones[target_name]
            delta = (
                source_pose.matrix.to_quaternion()
                @ source_rest[source_name].to_quaternion().inverted()
            )
            desired = Matrix.Translation(target_pose.matrix.translation) @ (
                delta @ target_rest[target_name].to_quaternion()
            ).to_matrix().to_4x4()
            if source_name == "Hips":
                source_delta = (
                    source_pose.matrix.translation - source_rest[source_name].translation
                )
                desired.translation = (
                    target_rest[target_name].translation
                    + source_delta * translation_scale
                )
            target_pose.matrix = desired
            bpy.context.view_layer.update()
            target_pose.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=target_name
            )
            if source_name == "Hips":
                target_pose.keyframe_insert(
                    data_path="location", frame=frame, group=target_name
                )
    return target_action


def main() -> None:
    args = arguments()
    capture = np.load(args.capture.resolve(), allow_pickle=True)
    restpose = np.load(args.restpose.resolve(), allow_pickle=True)
    speech_map = load_json(args.speech_bone_map.resolve())
    target_map = load_json(args.target_bone_map.resolve())
    source = create_source_armature(restpose)
    source_action = create_source_action(source, capture, args.action_id)
    imported, target = import_target(args.target.resolve())
    preexisting_target_actions = set(bpy.data.actions).difference({source_action})
    mapping = compose_mapping(speech_map, target_map)
    missing_source = sorted(set(mapping).difference(source.data.bones.keys()))
    missing_target = sorted(set(mapping.values()).difference(target.data.bones.keys()))
    if missing_source or missing_target:
        raise RuntimeError(
            f"Bone map mismatch: source={missing_source}, target={missing_target}"
        )
    target_action = retarget(source, target, source_action, mapping, args.action_id)
    target.animation_data.action = target_action
    bpy.data.objects.remove(source, do_unlink=True)
    for old_action in [source_action, *preexisting_target_actions]:
        if old_action != target_action and old_action.name in bpy.data.actions:
            bpy.data.actions.remove(old_action)
    target_action.name = args.action_id

    for item in bpy.context.selected_objects:
        item.select_set(False)
    for item in imported:
        if item.name in bpy.data.objects:
            item.select_set(True)
    bpy.context.view_layer.objects.active = target
    output_glb = args.output_glb.resolve()
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_skins=True,
        export_morph=True,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")

    manifest = {
        "schemaVersion": "1.0.0",
        "actionId": args.action_id,
        "frameRate": 30,
        "frameCount": int(capture["joint_rotmat"].shape[0]),
        "mappedBoneCount": len(mapping),
        "modelAssetId": "zima" if args.target.suffix.lower() == ".fbx" else "cortana",
        "glb": output_glb.name,
    }
    output_manifest = args.output_manifest.resolve()
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    output_manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
