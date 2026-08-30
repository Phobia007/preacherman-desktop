# Audio2Face local runtime

This integration runs the official Audio2Face service on port `18083` and
keeps its large source, environment, weights, logs, and generated captures under
`.runtime-tmp/audio2face`. The Demo Host exposes only a loopback proxy at
`/api/face/audio2face`.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/audio2face/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/audio2face/start.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/audio2face/health.ps1
```

The service accepts 16 kHz mono PCM16 and returns 30 FPS blendshape values. The
Demo Host resamples its 24 kHz TTS output before submitting the same audio that
is played to the user. Body and face streams share one interaction epoch, so a
barge-in cancels both.

Setup installs ONNX Runtime GPU when an NVIDIA driver is available, and startup
selects the CUDA profile automatically. Machines without CUDA continue through
the official CPU profile; a face timeout never blocks speech or body motion.

The current Cortana and Zima meshes contain no morph targets. The runtime and
renderer path are connected, but full facial deformation requires a future
asset revision containing compatible morph targets (or a facial-bone solver).
Cortana continues to use its audio-driven jaw bone as a safe fallback.
