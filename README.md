# Preacherman Desktop

A desktop companion with character-specific conversation, memory, voice playback
and speech-driven animation. Bring your own AI provider API key.

## Install on Windows

1. Download [Preacherman-Setup.exe](https://github.com/Phobia007/preacherman-desktop/releases/latest/download/Preacherman-Setup.exe)
   from the [latest release](https://github.com/Phobia007/preacherman-desktop/releases/latest).
2. Run the installer. Models, fonts, interface assets and the local application
   service are included. Home does not depend on a development server.
3. For local speech and animation, install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   with the WSL 2 Linux-container backend. Open **Preacherman Local Services**
   from the Start menu and choose a runtime folder. D: is suggested when present.
4. In **Asset**, activate a character. Open **Settings > Execution Mode**, enter
   your own API endpoint, model and key, test the connection and save.
5. Click the voice button in the bottom-right corner. Voice responses use Windows
   speech or an optional Breeze voice selected in **Appearance > Voice**.

See [local service installation](deployment/windows/README.md) for voice setup,
downloads, hardware requirements, ports and troubleshooting. See
[release verification](docs/windows-installer-release.md) for versions/checksums.
A source-code push alone does not update the installer.

## Runtime

| Component | Location |
| --- | --- |
| Desktop UI, renderer and application service | Installed Windows application |
| Character memories, rules, history and provider configuration | Current user's `.preacherman-demo` directory |
| Speech recognition | Private Python environment, offline Whisper base model |
| Speech2Motion and Audio2Face | Local Docker containers, loopback ports only |
| Breeze TTS 2 (optional) | Native local runtime, explicitly opted in |
| AI response generation | The API configured by each user |

This is a **demo**, not a hosted multi-user service. Existing simulated account,
purchase and unfinished task workflows do not become production backend services
by installing these dependencies. Motion/face support depends on the character's
existing rig integration. Provider subscriptions are not included.

## Build from source

Windows prerequisites: Git, Node.js 24, Rust/MSVC, Visual Studio C++ Build Tools
and WebView2. From a checkout at any path:

```powershell
powershell.exe -NoProfile -File tools/Setup-WindowsSource.ps1
cd apps/preacherman-demo-host
npm run typecheck
npm run build:windows:installer
```

Output: `src-tauri/target/release/bundle/nsis/`, or the target selected by
`CARGO_TARGET_DIR`. `tools/Build-DesktopRelease.ps1` remains the maintainer's
canonical workstation delivery wrapper; contributors/CI use the portable command
above. For macOS source development see [the macOS guide](docs/macos-development.md).
The full local service installer currently targets **Windows x64**.

## Resources and private data

- API keys, personal memories, recordings, cloned voices and Docker volumes are
  not distributed. Never commit them or local `.env` files.
- Large inference assets come from pinned upstream downloads with SHA-256 checks.
  Authored interface/avatar assets remain packaged for offline Home startup.
- Third-party characters and assets retain their original terms; this repository
  does not grant additional rights in them.
- Breeze weights and self-hosted outputs have research/non-commercial terms.
  Its optional installer requires explicit acceptance; see
  [runtime notices](deployment/windows/THIRD_PARTY_NOTICES.md).
- The installer is unsigned. Verify the release's `SHA256SUMS.txt`.

See [GitHub distribution](docs/github-distribution.md) for source checks and release delivery.
