"""Export one classified action-library batch as a skeleton-only GLB pack."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy


REQUIRED_CLASSIFICATION_FIELDS = (
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
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--batches", required=True, type=Path)
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--output-glb", required=True, type=Path)
    parser.add_argument("--output-manifest", required=True, type=Path)
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


def action_fcurves(action: bpy.types.Action) -> Iterable[bpy.types.FCurve]:
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def main() -> None:
    arguments = script_arguments()
    catalog_path = arguments.catalog.resolve()
    batches_path = arguments.batches.resolve()
    output_glb = arguments.output_glb.resolve()
    output_manifest = arguments.output_manifest.resolve()
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
    for record in records:
        missing = [field for field in REQUIRED_CLASSIFICATION_FIELDS if field not in record]
        if missing:
            raise RuntimeError(
                f"Classification fields missing for {record.get('record_id')}: {missing}"
            )
        if not record["tags"]:
            raise RuntimeError(f"Classification tags are empty for {record['record_id']}")

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one source armature, received {len(armatures)}")
    armature = armatures[0]
    source_actions = {action.name: action for action in bpy.data.actions}
    expected_names = {record["action_name"] for record in records}
    actual_names = set(source_actions)
    if actual_names != expected_names:
        raise RuntimeError(
            "Batch actions do not match the immutable catalog: "
            f"missing={sorted(expected_names - actual_names)} "
            f"unexpected={sorted(actual_names - expected_names)}"
        )

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = source_actions[records[0]["action_name"]]

    output_glb.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        check_existing=False,
        export_format="GLB",
        export_materials="NONE",
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
        export_morph=False,
        export_extra_animations=False,
        will_save_settings=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")

    exported_records = [
        {field: record[field] for field in REQUIRED_CLASSIFICATION_FIELDS}
        for record in records
    ]
    manifest = {
        "schemaVersion": "1.0.0",
        "actionAssetId": "classified-actions",
        "actionAssetVersion": "v1",
        "batchId": batch["batch_id"],
        "category": batch["category"],
        "subcategory": batch["subcategory"],
        "categoryPath": batch["category_path"],
        "sourceRig": armature.name,
        "sourceBoneCount": len(armature.data.bones),
        "actionCount": len(records),
        "classificationPolicy": "preserve-verbatim",
        "catalogSha256": sha256(catalog_path),
        "glb": {
            "file": output_glb.name,
            "bytes": output_glb.stat().st_size,
            "sha256": sha256(output_glb),
        },
        "actions": exported_records,
        "animationStats": [
            {
                "action_name": action.name,
                "frame_range": [float(value) for value in action.frame_range],
                "fcurves": len(list(action_fcurves(action))),
            }
            for action in sorted(source_actions.values(), key=lambda item: item.name)
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
                "actions": len(records),
                "output": str(output_glb),
                "bytes": output_glb.stat().st_size,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
