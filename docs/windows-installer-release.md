# Windows installer delivery

The Windows x64 demo installer is published at [Windows Demo 0.1.0](https://github.com/Phobia007/preacherman-desktop/releases/tag/windows-v0.1.0).

## Website download button

Use this public asset URL as the Windows download button's destination:

```text
https://github.com/Phobia007/preacherman-desktop/releases/latest/download/Preacherman-Setup.exe
```

It downloads the installer directly without a GitHub account or source-code deployment. The website itself was not changed as part of this release. Keep the asset name `Preacherman-Setup.exe` on future Latest releases to preserve this URL. A source push to `main` alone does not replace the published installer.

For this exact version, use [the version-pinned installer](https://github.com/Phobia007/preacherman-desktop/releases/download/windows-v0.1.0/Preacherman-Setup.exe).

## Published artifact

- Tag: `windows-v0.1.0`
- Source snapshot: `4626e62b5e4c62445a53826fdd502b36ab389260`
- Application source commit: `fdc02c321f72770b5487c2e5eb06940583fd95c6`
- File: `Preacherman-Setup.exe`
- Size: 696,889,586 bytes (approximately 697 MB)
- SHA-256: `8144a294202e8831120328d433c909ed5691bacc2f2262a00dd2df502ace45da`
- Installer: NSIS, Windows x64, current-user installation, English/Simplified Chinese
- Signature: unsigned; Windows may display unknown-publisher or SmartScreen prompts
- WebView2: embedded bootstrapper; an internet connection is required to install the runtime when it is missing

The application, matching local service, models, fonts and authored media are included. This remains a demo build; simulated account and purchase flows are not production services. No macOS artifact is included.

## Verification

The published file was installed in an isolated directory, launched through a shortcut, and uninstalled successfully. Both appearance modes, Home, Task, Gallery, Market/Ledger, Settings, Account, Asset and Extension, account guide actions, demo sign-in/sign-out, resizing and native window controls were checked. Console diagnostics were compared with the recorded verified cold-launch baseline; existing blocked external-resource diagnostics remain, with no new diagnostics detected.

The installed executable differs from the verified standalone desktop executable only in Tauri's three-byte `UNK` to `NSS` installer marker. The sidecar is identical. Original application registration, the previous installation and the canonical desktop shortcut were preserved. The canonical shortcut was reopened and resource/process cleanup was verified.

Anonymous HTTP range requests to both the Latest and version-pinned URLs returned the expected Windows executable header and total size. GitHub's asset SHA-256 matches the local installer. Public `SHA256SUMS.txt` and `windows-installer-manifest.json` files accompany the release.

Local verification evidence is in `output/windows-installer-20261009/` (ignored build output). The desktop deployment manifest records the public release and installer hashes separately from the standalone executable.

## Future updates

This release was packaged from the verified Windows build cache and uploaded manually. It does not establish an automatic build or publishing pipeline. A future release must package and test the updated application, upload an asset named `Preacherman-Setup.exe` with checksums, and explicitly mark that tested release as Latest. Keep published version tags and installers immutable so existing version-pinned links remain reproducible.
