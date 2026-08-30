# Speech2Motion local test integration

This directory keeps the reproducible Preacherman-side setup for the local
Speech2Motion test service. The upstream checkout, Python environment, motion
database, logs, and generated motion data live under `.runtime-tmp/speech2motion`
and are intentionally excluded from Git.

The integration does not add provenance or licensing fields to Preacherman
motion records. Motion identities exposed to the application remain owned by
the Preacherman asset contract.

## Setup

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/speech2motion/setup.ps1
```

The setup script clones the official service, creates an isolated Python
environment, installs its dependencies, downloads the offline motion database,
and extracts it into the upstream checkout.

## Run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/speech2motion/start.ps1
```

The service listens on `http://127.0.0.1:18084`. V2 and V3 motion streams use
WebSocket endpoints even though FastAPI's generated OpenAPI page only lists the
HTTP routes.

## Verify

With the service running in another terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/speech2motion/health.ps1
.runtime-tmp/speech2motion/.venv/Scripts/python.exe tools/speech2motion/smoke_v3.py
.runtime-tmp/speech2motion/.venv/Scripts/python.exe tools/speech2motion/smoke_v3.py `
  --output .runtime-tmp/speech2motion/captures/thinking.npz
```

The V3 smoke test sends one Chinese speech segment and verifies that the service
returns a skeleton descriptor, motion bytes, and a terminal stream message.
When `--output` is supplied, the streamed matrices, root translation, cutoff
marks, and timeline are decoded into a self-describing NPZ capture. The
`dlp3d-to-preacherman-rig.json` map defines the shared humanoid targets used by
Cortana and Zima retargeting.

To run the complete selection-to-avatar proof for both model assets:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/speech2motion/build-smoke.ps1
```

This produces one decoded capture and separate Cortana/Zima GLB previews under
`.runtime-tmp/speech2motion/previews`. These files are test outputs and do not
alter the canonical action library.
