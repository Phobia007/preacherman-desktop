# Windows installer delivery

[Windows Demo 0.2.0](https://github.com/Phobia007/preacherman-desktop/releases/tag/windows-v0.2.0) is the current Windows x64 release.

Use [Preacherman-Setup.exe](https://github.com/Phobia007/preacherman-desktop/releases/latest/download/Preacherman-Setup.exe) as the shareable download link. The stable asset name is preserved across Latest releases. A Git source push alone does not update this installer.

## Published artifacts

- Application source: `0c3973b896c5890223a01883d4e6183168d257e7`
- Installer: `Preacherman-Setup.exe`, 628,045,675 bytes
- Installer SHA-256: `5ffe15ede577cd8248c523d1200c6be04a4c6b786b1a1f89cc746c30bd60320e`
- Local service setup: `Preacherman-Services.zip`, also packaged in the application
- English NSIS installer, current-user scope, Windows x64
- Unsigned; Windows may display an unknown-publisher prompt
- Embedded WebView2 bootstrapper; missing WebView2 requires an internet connection

`SHA256SUMS.txt` and `windows-installer-manifest.json` accompany the release. The desktop includes interface assets, fonts, the current character library and the matching application service. Large inference weights, Python and Docker images are downloaded separately by **Preacherman Local Services**, using pinned versions and checksums.

## First use

Install Docker Desktop with the WSL 2 Linux-container backend, then open **Preacherman Local Services** from the Start menu. Choose a runtime folder. After setup, open the desktop, use the demo email sign-in in Account, activate a character and configure your own API in **Asset > Settings > Execution Mode**.

Windows speech is available when a suitable language voice is installed. Breeze is optional and requires explicit acceptance of its research/non-commercial model terms. Configure personal voices in **Appearance > Voice**. API keys, memories, recordings and personal clones are not distributed. See [service setup](../deployment/windows/README.md).

## Verification and limits

The executable and matching sidecar were deployed to the canonical desktop shortcut, with a verified rollback pair. Native cold startup, eight main routes, 27 character selection entries, Cortana detail, both themes, native window controls and console diagnostics passed. No new console errors were found relative to the existing baseline.

The actual installer was then installed in an isolated directory, launched through its shortcut, checked with a fresh profile and demo sign-in, and uninstalled. The Local Services shortcut and packaged setup files were verified. Prior registration, installation and the canonical shortcut were preserved. The installed executable differs only in Tauri's three-byte `UNK` to `NSS` installer marker; its sidecar matches exactly.

A fresh private Python installation loaded offline Whisper successfully. Isolated Docker deployments returned 96 motion frames with 54 joints and 60 facial frames with 51 blendshapes. Test containers, workers and profiles were removed. This was an isolated-directory test on the maintainer's Windows machine, not certification across every GPU or Windows installation.

Public release metadata and GitHub asset digests were verified. The local anonymous range-download probe hit a GitHub gateway timeout; this is recorded separately from the passed installation checks.

This remains a personal-use/evaluation demo. Existing simulated account, purchase and unfinished task workflows are not hosted production services. Character motion support depends on the current rig integration. No macOS installer is included.

Evidence: `output/github-release-20261105/` (ignored local output). Future CI builds create draft releases; native verification is required before publishing Latest. Published tags and artifacts remain immutable.
