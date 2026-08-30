# Preacherman Digital Human Asset Library

This directory stores models and action libraries as independent, peer-level assets. A character is not the library itself, and an action library is not owned by one character.

## Assets

- `cortana/v1`: the current Cortana runtime model and its six runtime shader inputs.
- `zima/v1`: the newly supplied Zima model source.
- `classified-actions/v1`: the shared classified action source, its authoritative metadata, and per-model binding state.
- `realtime-performance/v1`: the shared live body/face stream profile and authoritative source rest pose.

## Layout contract

Model assets own their model-specific files:

- `source/model`: authoring or interchange model files.
- `runtime/model`: model exported for application use.
- `runtime/textures`: runtime texture inputs.
- `metadata`: existing upstream manifests and reports.
- `asset.json`: authoritative asset identity and compatibility state.
- `checksums.json`: hashes for material binary inputs.

The action asset owns the original action archive and the authoritative classification catalog. Cortana and Zima both reference this action asset through model-specific bindings. Retargeted runtime motions may differ by rig, but the following selection metadata must remain unchanged so the future voice-interaction model can select actions deterministically:

- `record_id`
- `action_name`
- `category`
- `subcategory`
- `category_path`
- `tags`
- `classification_rule`
- `needs_review`

Do not silently drop, rename, or infer replacements for these fields. If a motion cannot be bound to a model, record the failure in that model's binding instead of removing its classification record.

## Runtime pack build

Blender 5.1.2 has verified the source-pack exporter and both model bindings on representative Idle and Run actions. Build one batch with:

```powershell
python tools/assets/build_classified_action_packs.py --mode source --batch-id loc_idle_002
python tools/assets/build_classified_action_packs.py --mode cortana --batch-id loc_idle_002
python tools/assets/build_classified_action_packs.py --mode zima --batch-id loc_idle_002
```

Build all 40 batches for a model by replacing `--batch-id ...` with `--all`. Generated GLB files are binary build outputs and remain ignored by ordinary Git; their adjacent JSON manifests retain the original action IDs, categories, tags, catalog hash, and GLB hash.

Large binary files are deliberately ignored by ordinary Git. Use a dedicated binary store or Git LFS if these files must be published.

The abandoned 412-motion runtime is not part of this library.
