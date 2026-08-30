"""Export the small rest-pose subset required by the browser retargeter."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--restpose", required=True, type=Path)
    parser.add_argument("--capture", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--id", required=True)
    arguments = parser.parse_args()

    restpose = np.load(arguments.restpose.resolve(), allow_pickle=True)
    capture = np.load(arguments.capture.resolve(), allow_pickle=True)
    names = [str(value) for value in restpose["joint_names"]]
    parents = [str(value) for value in restpose["parents"]]
    matrices = restpose["local_matrices"]
    requested = {str(value) for value in capture["joint_names"]}
    missing = sorted(requested.difference(names))
    if missing:
        raise RuntimeError(f"Capture joints missing from rest pose: {missing}")

    joints = []
    for index, name in enumerate(names):
        if name not in requested:
            continue
        joints.append({
            "name": name,
            "parent": parents[index] or None,
            "matrix": [float(value) for value in matrices[index].reshape(-1)],
        })

    payload = {
        "schemaVersion": "1.0.0",
        "id": arguments.id,
        "joints": joints,
    }
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"id": arguments.id, "jointCount": len(joints)}))


if __name__ == "__main__":
    main()
