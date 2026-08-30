"""Retarget one classified action batch onto a target avatar and export GLB."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix


CLASSIFICATION_FIELDS = (
    "record_id",
    "action_name",
    "category",
    "subcategory",
    "category_path",
    "tags",
    "classification_rule",
    "needs_review",
)


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--model-asset-id", required=True)
    parser.add_argument("--bone-map", required=True, type=Path)
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--batches", required=True, type=Path)
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--output-glb", required=True, type=Path)
    parser.add_argument("--output-manifest", required=True, type=Path)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--include-model", action="store_true")
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def import_target(path: Path) -> set[bpy.types.Object]:
    before = set(bpy.data.objects)
    extension = path.suffix.lower()
    if extension == ".fbx":
        result = bpy.ops.import_scene.fbx(filepath=str(path))
    elif extension in {".glb", ".gltf"}:
        result = bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise RuntimeError(f"Unsupported target asset type: {extension}")
    if result != {"FINISHED"}:
        raise RuntimeError(f"Target import failed: {result}")
    return set(bpy.data.objects).difference(before)


def bone_depth(bone: bpy.types.Bone) -> int:
    depth = 0
    parent = bone.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def retarget_action(
    source: bpy.types.Object,
    target: bpy.types.Object,
    source_action: bpy.types.Action,
    mapping: dict[str, str],
    root_source: str,
    root_target: str,
    translation_scale: float,
) -> bpy.types.Action:
    temporary_name = f"__retarget__{source_action.name}"
    target_action = bpy.data.actions.new(temporary_name)
    if source.animation_data is None:
        source.animation_data_create()
    if target.animation_data is None:
        target.animation_data_create()
    source.animation_data.action = source_action
    target.animation_data.action = target_action

    ordered_pairs = sorted(
        mapping.items(),
        key=lambda pair: bone_depth(target.data.bones[pair[1]]),
    )
    source_rest = {
        name: source.data.bones[name].matrix_local.copy() for name in mapping
    }
    target_rest = {
        name: target.data.bones[name].matrix_local.copy() for name in mapping.values()
    }
    start = int(source_action.frame_range[0])
    end = int(source_action.frame_range[1])
    scene = bpy.context.scene
    scene.frame_start = min(scene.frame_start, start)
    scene.frame_end = max(scene.frame_end, end)

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for pose_bone in target.pose.bones:
            pose_bone.matrix_basis.identity()
            pose_bone.rotation_mode = "QUATERNION"
        bpy.context.view_layer.update()

        for source_name, target_name in ordered_pairs:
            source_pose = source.pose.bones[source_name]
            target_pose = target.pose.bones[target_name]
            source_delta = (
                source_pose.matrix.to_quaternion()
                @ source_rest[source_name].to_quaternion().inverted()
            )
            target_rotation = source_delta @ target_rest[target_name].to_quaternion()
            current_translation = target_pose.matrix.translation.copy()
            desired = Matrix.Translation(current_translation) @ target_rotation.to_matrix().to_4x4()
            if source_name == root_source and target_name == root_target:
                source_translation_delta = (
                    source_pose.matrix.translation
                    - source_rest[source_name].translation
                )
                desired.translation = (
                    target_rest[target_name].translation
                    + source_translation_delta * translation_scale
                )
            target_pose.matrix = desired
            bpy.context.view_layer.update()
            target_pose.keyframe_insert(
                data_path="rotation_quaternion",
                frame=frame,
                group=target_name,
            )
            if source_name == root_source and target_name == root_target:
                target_pose.keyframe_insert(
                    data_path="location",
                    frame=frame,
                    group=target_name,
                )

    return target_action


def main() -> None:
    arguments = script_arguments()
    target_path = arguments.target.resolve()
    bone_map_path = arguments.bone_map.resolve()
    catalog_path = arguments.catalog.resolve()
    batches_path = arguments.batches.resolve()
    output_glb = arguments.output_glb.resolve()
    output_manifest = arguments.output_manifest.resolve()
    bone_map = load_json(bone_map_path)
    catalog = load_json(catalog_path)
    batches = load_json(batches_path)

    batch = next(
        (item for item in batches["batches"] if item["batch_id"] == arguments.batch_id),
        None,
    )
    if batch is None:
        raise RuntimeError(f"Unknown batch id: {arguments.batch_id}")
    records_by_id = {record["record_id"]: record for record in catalog["records"]}
    records = [records_by_id[record_id] for record_id in batch["record_ids"]]
    if arguments.limit is not None:
        if arguments.limit < 1:
            raise RuntimeError("--limit must be greater than zero")
        records = records[: arguments.limit]
    for record in records:
        if any(field not in record for field in CLASSIFICATION_FIELDS):
            raise RuntimeError(f"Classification contract failed for {record['record_id']}")
        if not record["tags"]:
            raise RuntimeError(f"Classification tags are empty for {record['record_id']}")

    source_armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(source_armatures) != 1:
        raise RuntimeError(f"Expected one source armature, received {len(source_armatures)}")
    source = source_armatures[0]
    source_actions = {action.name: action for action in bpy.data.actions}
    expected_names = {record["action_name"] for record in records}
    missing_actions = expected_names.difference(source_actions)
    if missing_actions:
        raise RuntimeError(f"Source actions missing from batch: {sorted(missing_actions)}")

    imported_objects = import_target(target_path)
    target_armatures = [obj for obj in imported_objects if obj.type == "ARMATURE"]
    if len(target_armatures) != 1:
        raise RuntimeError(f"Expected one target armature, received {len(target_armatures)}")
    target = target_armatures[0]
    if bone_map.get("mappingMode") == "identity":
        mapping = {
            name: name
            for name in source.data.bones.keys()
            if name in target.data.bones
        }
    else:
        mapping = bone_map["bones"]
    missing_source_bones = sorted(set(mapping).difference(source.data.bones.keys()))
    missing_target_bones = sorted(set(mapping.values()).difference(target.data.bones.keys()))
    if missing_source_bones or missing_target_bones:
        raise RuntimeError(
            f"Bone map mismatch: source={missing_source_bones} target={missing_target_bones}"
        )
    translation_scale = target.dimensions.z / source.dimensions.z
    source_bone_count = len(source.data.bones)
    target_bone_count = len(target.data.bones)

    preexisting_target_actions = set(bpy.data.actions).difference(source_actions.values())
    if target.animation_data is not None:
        target.animation_data.action = None
    new_actions: list[tuple[bpy.types.Action, str]] = []
    for record in records:
        source_action = source_actions[record["action_name"]]
        target_action = retarget_action(
            source,
            target,
            source_action,
            mapping,
            bone_map["root"]["source"],
            bone_map["root"]["target"],
            translation_scale,
        )
        new_actions.append((target_action, source_action.name))

    target.animation_data.action = None
    bpy.data.objects.remove(source, do_unlink=True)
    for action in list(source_actions.values()) + list(preexisting_target_actions):
        if action.name in bpy.data.actions:
            bpy.data.actions.remove(action)
    for action, final_name in new_actions:
        action.name = final_name
    target.animation_data.action = new_actions[0][0]

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    export_objects = (
        [obj for obj in imported_objects if obj.name in bpy.data.objects]
        if arguments.include_model
        else [target]
    )
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = target

    output_glb.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_frame_range=False,
        export_force_sampling=False,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_def_bones=False,
        export_leaf_bone=False,
        export_optimize_animation_size=False,
        export_skins=True,
        export_morph=True,
        export_morph_animation=True,
        export_extra_animations=False,
        will_save_settings=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")

    manifest = {
        "schemaVersion": "1.0.0",
        "actionAssetId": "classified-actions",
        "actionAssetVersion": "v1",
        "modelAssetId": arguments.model_asset_id,
        "modelAssetVersion": "v1",
        "batchId": batch["batch_id"],
        "actionCount": len(records),
        "classificationPolicy": "preserve-verbatim",
        "catalogSha256": sha256(catalog_path),
        "boneMapSha256": sha256(bone_map_path),
        "sourceBoneCount": source_bone_count,
        "targetBoneCount": target_bone_count,
        "mappedBoneCount": len(mapping),
        "translationScale": translation_scale,
        "packType": "model-preview" if arguments.include_model else "skeleton-only",
        "glb": {
            "file": output_glb.name,
            "bytes": output_glb.stat().st_size,
            "sha256": sha256(output_glb),
        },
        "actions": [
            {field: record[field] for field in CLASSIFICATION_FIELDS}
            for record in records
        ],
    }
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    output_manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "batchId": batch["batch_id"],
                "model": arguments.model_asset_id,
                "actions": len(records),
                "mappedBones": len(mapping),
                "output": str(output_glb),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
