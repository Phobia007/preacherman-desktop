# DLP3D components for Preacherman

Installed and checked on 2026-11-03. This installs companion services and an
authoring tool; it does not change the packaged Preacherman executable or route
voice conversations through a second orchestrator.

## Selection

| Official repository | Role | Decision |
| --- | --- | --- |
| [dlp3d.ai](https://github.com/dlp3d-ai/dlp3d.ai) | Complete DLP3D browser application and entry point | Not installed. Preacherman already provides the desktop frontend and renderer. |
| [orchestrator](https://github.com/dlp3d-ai/orchestrator) | Coordinates ASR, LLM, TTS, memory, reactions and animation | Not installed. Preacherman already owns conversation scheduling, cancellation, DeepSeek and Breeze. Evaluate its emotion/reaction architecture separately when needed. |
| [web_backend](https://github.com/dlp3d-ai/web_backend) | DLP3D accounts, character settings, motion access and MongoDB-backed APIs | Not installed. It would introduce another account/configuration store and is not needed for the standalone services selected here. |
| [speech2motion](https://github.com/dlp3d-ai/speech2motion) | Retrieves and blends body motion | Existing installation and desktop integration retained. |
| [audio2face](https://github.com/dlp3d-ai/audio2face) | Converts PCM audio into timed facial coefficients | Installed, model downloaded, actual streaming inference verified. |
| [MotionDataViewer](https://github.com/dlp3d-ai/MotionDataViewer) | Previews, filters and edits motion-library metadata | Installed and production build verified with real model/motion playback. |

## Audio2Face

- Directory: `D:\Codex\audio2face`
- Source commit: `ceba323464d609759dc25ccefdef6c05179d980b`
- Image: `dlp3d/audio2face:latest@sha256:0376882ad687ba024b01554103a797aa849bd4763abc0323caf97e2dc4786517`
- Model: `weights/unitalker_v0.4.0_base.onnx` (approximately 372 MiB)
- Model SHA-256: `2F446CCAA0D5E901472E7214CDCCD2373619D9CC5542C42ABBA47B29FD1F3FCE`
- Model source: the download linked by the official repository README.
- Container: `preacherman-audio2face`, CPU inference, at most 4 CPUs / 4 GiB.
- Health: `http://127.0.0.1:18083/health`
- API docs: `http://127.0.0.1:18083/docs`
- WebSocket: `ws://127.0.0.1:18083/api/v1/streaming_audio2face/ws`
- Start: `powershell.exe -NoProfile -File D:\Codex\audio2face\Start-Audio2Face.ps1`
- Stop: `powershell.exe -NoProfile -File D:\Codex\audio2face\Stop-Audio2Face.ps1`

The Docker engine's existing disk is `D:\Docker\wsl\disk\docker_data.vhdx`.
Weights, source, logs and verification artifacts also live on D:. The container
uses `restart: unless-stopped`; Docker startup restarts it unless explicitly
stopped. Preacherman now reuses or starts this installed container when the desktop
opens, in parallel with its existing motion/voice startup. Missing services never
block Home. The sidecar owns startup only; Docker remains shared after app exit.

The original six MMD profiles remain available. The added `preacherman-arkit`
profile exposes 51 named UniTalker/ARKit channels at 30 fps, without MMD renaming.
Input is mono 16 kHz signed 16-bit PCM using the upstream protobuf start/body/end
protocol. Responses contain names, dtype, float arrays and a final end marker.

Actual test: a locally synthesized 6.175-second sentence returned 183 frames;
the 51-channel profile took 1.362 seconds in total and the original KQ MMD
profile returned 61 channels in 1.703 seconds. Inputs were supplied in a batch;
these are local service measurements, not end-to-end conversational latency.
Both outputs were finite and time-varying. See `deployment/verification.json`.

### Character integration boundary

Cortana now uses a reduced `preacherman-arkit` mapping during real spoken replies.
Her runtime GLB has no morph targets; its usable facial joints are `b_jaw`,
`b_l_eye` and `b_r_eye`. JawOpen/MouthClose drive bounded jaw opening and eye-look
channels drive subtle coherent gaze, with separate axes for the two eyeballs.
Eyebrows, eyelids and independent lip shapes are not fabricated. These need
authored facial deformation for a later full-expression pass.

The actual decoded playback audio is converted to mono 16 kHz PCM, sent through
the existing local binary proxy, and decoded from the service's float16 frames
(float32 is also supported). AudioContext playback time owns both facial and body
timelines. Barge-in discards unheard motion and fades the heard facial pose to
rest. Late/stale frames and other-character streams cannot drive Cortana.
Each frame restores the authored bones before applying one bounded offset, so
idle, body animation and the energy fallback cannot accumulate jaw rotation.
Body motion can be disabled independently of face motion. Missing/late face
output falls back to audio energy without delaying speech beyond the existing
160 ms preparation budget. No audio/transcripts are persisted by this adapter.

Focused checks and a live local PCM/face/playback/interrupt preview are recorded
in `output/cortana-face-20261103/`. Authored mesh, textures and calibrated body
retargeting remain intact. Other characters retain their existing behavior.

## Motion Data Viewer

- Directory: `D:\Codex\MotionDataViewer`
- Source commit: `bc3114da3b84dcb1a779489698e7fc744543598f`
- Desktop shortcut: `DLP3D Motion Viewer.lnk`
- Address: `http://127.0.0.1:18085`
- Start: `powershell.exe -NoProfile -File D:\Codex\MotionDataViewer\Start-Viewer.ps1`
- Stop: `powershell.exe -NoProfile -File D:\Codex\MotionDataViewer\Stop-Viewer.ps1`
- Owner: standalone Node process running `D:\Codex\MotionDataViewer\server.js`.
- PID and logs: `deployment/server.pid`, `logs/server.stdout.log`, `logs/server.stderr.log`.

The launcher reuses a healthy instance and rejects an occupied unrelated port.
The stop script verifies the exact command line before stopping its PID. It is
an on-demand tool, not a background dependency of the desktop application.

A production Vite build is served by the Express backend on one loopback port;
there is no development watcher. The upstream development-only Havok WASM path
was changed to an asset URL so physics works in the production build. Interface
defaults to English. Source motion descriptions/keywords remain verbatim.

The viewer has a separate editable copy at
`D:\Codex\MotionDataViewer\data\motion_database.db`. Motion files are read from
the existing `D:\Codex\speech2motion\data\motion_files`. There are 762 motion
records across six source rigs. Viewer edits do not silently change the live
Speech2Motion database. Publish reviewed library changes explicitly later.

This viewer shows the source models supplied by DLP3D. It does not already
contain Preacherman's Cortana model or her calibrated retargeting profile.
It is useful for selecting source clips and tagging their intended behavior;
final Cortana checks still belong in Preacherman.

Type checking and the production build passed. Real Ani motion #549 played
through the frame slider (441 frames); the scene loaded with no browser errors.
Verification artifacts: `output/dlp3d-components-20261103/`.
