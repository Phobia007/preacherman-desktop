"""Build source or model-bound runtime packs from the classified action ZIP."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LIBRARY = (
    PROJECT_ROOT
    / "asset-library"
    / "digital-humans"
    / "assets"
    / "classified-actions"
    / "v1"
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--library-root", type=Path, default=DEFAULT_LIBRARY)
    parser.add_argument("--blender", type=Path)
    parser.add_argument("--mode", choices=("source", "cortana", "zima"), required=True)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--batch-id", action="append")
    selection.add_argument("--all", action="store_true")
    parser.add_argument("--limit", type=int)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def blender_path(explicit: Path | None) -> Path:
    candidates = [
        explicit,
        Path(found) if (found := shutil.which("blender")) else None,
        Path("D:/blender.exe"),
    ]
    for candidate in candidates:
        if candidate and candidate.is_file():
            return candidate.resolve()
    raise RuntimeError("Blender executable was not found; pass --blender explicitly")


def batch_blend_entries(archive: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    with zipfile.ZipFile(archive) as bundle:
        for name in bundle.namelist():
            if "/assets/" not in name or not name.lower().endswith(".blend"):
                continue
            stem = Path(name).stem
            batch_id = stem.rsplit("_", 3)[-3:]
            key = "_".join(batch_id)
            entries[key] = name
    return entries


def output_root(library: Path, mode: str) -> Path:
    if mode == "source":
        return library / "runtime" / "source"
    return library / "bindings" / mode / "runtime"


def target_configuration(library: Path, mode: str) -> tuple[Path, Path]:
    digital_humans = library.parents[2]
    if mode == "cortana":
        target = digital_humans / "assets" / "cortana" / "v1" / "runtime" / "model" / "cortana-runtime.glb"
    elif mode == "zima":
        target = digital_humans / "assets" / "zima" / "v1" / "source" / "model" / "zima.fbx"
    else:
        raise RuntimeError(f"No model target for source mode: {mode}")
    return target, library / "bindings" / mode / "bone-map.json"


def run_batch(
    blender: Path,
    library: Path,
    mode: str,
    batch_id: str,
    blend: Path,
    limit: int | None,
) -> Path:
    destination = output_root(library, mode) / "packs"
    destination.mkdir(parents=True, exist_ok=True)
    suffix = f"-first-{limit}" if limit else ""
    output_glb = destination / f"{batch_id}{suffix}.glb"
    output_manifest = destination / f"{batch_id}{suffix}.json"
    common = [
        str(blender),
        "--factory-startup",
        "-b",
        str(blend),
    ]
    if mode == "source":
        script = PROJECT_ROOT / "tools" / "blender" / "export_classified_action_pack.py"
        if limit:
            raise RuntimeError("--limit is only supported for model-bound packs")
        command = common + [
            "--python",
            str(script),
            "--",
            "--catalog",
            str(library / "metadata" / "actions.json"),
            "--batches",
            str(library / "metadata" / "batches.json"),
            "--batch-id",
            batch_id,
            "--output-glb",
            str(output_glb),
            "--output-manifest",
            str(output_manifest),
        ]
    else:
        target, bone_map = target_configuration(library, mode)
        script = PROJECT_ROOT / "tools" / "blender" / "retarget_classified_action_pack.py"
        command = common + [
            "--python",
            str(script),
            "--",
            "--target",
            str(target),
            "--model-asset-id",
            mode,
            "--bone-map",
            str(bone_map),
            "--catalog",
            str(library / "metadata" / "actions.json"),
            "--batches",
            str(library / "metadata" / "batches.json"),
            "--batch-id",
            batch_id,
            "--output-glb",
            str(output_glb),
            "--output-manifest",
            str(output_manifest),
        ]
        if limit:
            command.extend(("--limit", str(limit)))
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)
    return output_manifest


def write_index(library: Path, mode: str) -> Path:
    root = output_root(library, mode)
    manifest_paths = sorted((root / "packs").glob("*.json"))
    manifests = [(path, load_json(path)) for path in manifest_paths]
    index = {
        "schemaVersion": "1.0.0",
        "actionAssetId": "classified-actions",
        "actionAssetVersion": "v1",
        "mode": mode,
        "classificationPolicy": "preserve-verbatim",
        "batchCount": len(manifests),
        "actionCount": sum(item["actionCount"] for _, item in manifests),
        "packs": [
            {
                "batchId": item["batchId"],
                "manifest": path.relative_to(root).as_posix(),
                "glb": f"packs/{item['glb']['file']}",
                "actionCount": item["actionCount"],
                "sha256": item["glb"]["sha256"],
            }
            for path, item in manifests
        ],
    }
    path = root / "index.json"
    path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> None:
    options = arguments()
    library = options.library_root.resolve()
    blender = blender_path(options.blender)
    batches = load_json(library / "metadata" / "batches.json")["batches"]
    selected = [item["batch_id"] for item in batches] if options.all else options.batch_id
    archive = library / "source" / "Cortana_Action_Library.zip"
    entries = batch_blend_entries(archive)
    missing = sorted(set(selected).difference(entries))
    if missing:
        raise RuntimeError(f"Batch blends missing from archive: {missing}")

    with tempfile.TemporaryDirectory(prefix="preacherman-actions-") as temporary:
        temporary_root = Path(temporary)
        with zipfile.ZipFile(archive) as bundle:
            for batch_id in selected:
                blend = temporary_root / f"{batch_id}.blend"
                with bundle.open(entries[batch_id]) as source, blend.open("wb") as target:
                    shutil.copyfileobj(source, target)
                run_batch(blender, library, options.mode, batch_id, blend, options.limit)
    index = write_index(library, options.mode)
    print(f"Built {len(selected)} {options.mode} pack(s); index={index}")


if __name__ == "__main__":
    main()
