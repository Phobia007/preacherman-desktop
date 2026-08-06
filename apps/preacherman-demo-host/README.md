# Preacherman Demo Host

## Run locally

```bash
npm install
npm run dev
```

The UI runs at `http://127.0.0.1:1420` and the local Agent/voice service listens on port `8787` by default.

To use a different service port, start both processes with the same environment value:

```bash
PREACHERMAN_SERVICE_PORT=8790 npm run dev
```

Then open **Settings**, enter `8790`, and select **Save and test**. The port is only saved after its `/api/health` check succeeds.

## Configure providers

Settings stores provider values in the local application-data directory (`~/.preacherman-demo` by default) with owner-only file permissions. Keys are never returned to the UI after saving.

| Service | Required values | Used for |
| --- | --- | --- |
| DeepSeek | API key | Agent A conversation and Agent B PitchKit generation |
| Qwen ASR Realtime | DashScope API key and Beijing Workspace ID | Push-to-talk transcription |
| Qwen TTS Realtime | DashScope API key | Serena streaming speech output |

`Save and test` reports three independent results:

- **DeepSeek** validates authenticated model access.
- **Qwen ASR** opens the workspace-scoped realtime socket.
- **Qwen TTS** opens the DashScope realtime socket.

An unconfigured provider is reported as `Not configured`; it is not treated as a successful test.

For non-UI startup, copy `.env.local.example` to `.env.local` and fill the same values. Do not commit `.env.local`.

## Windows installer

The Windows deliverable is an x64 NSIS `Setup.exe`. It includes the local Agent and voice service sidecar, so an installed application does not need a separate Node.js installation or terminal command.

The repository builds it on a Windows runner through the **Build Windows installer** GitHub Actions workflow. Run that workflow manually, then download the `Preacherman-Windows-x64-setup` artifact. Release-tag pushes matching `v*` also create the artifact.

For a local Windows build, install Node.js 22 and Rust, then run:

```powershell
npm ci
npm run build:windows
```

The unsigned installer is created in `src-tauri/target/release/bundle/nsis/`. Before distributing it broadly, sign both the installer and the bundled service executable with a Windows code-signing certificate; otherwise Windows SmartScreen may show a warning.
