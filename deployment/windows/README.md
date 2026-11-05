# Windows local services

The desktop installer includes these files under `service-setup` and creates the
**Preacherman Local Services** Start-menu shortcut. They are also available as
`Preacherman-Services.zip`. Extract that ZIP before running `Install-Services.cmd`.

## Setup

Requirements: Windows 10/11 x64, a current graphics driver, microphone, and Docker
Desktop with the WSL 2 Linux-container backend. Allow at least 15 GB free for
downloads, expanded models, Python and Docker images. 16 GB RAM is a practical
starting point, depending on the avatar and voice model. Breeze Q8 has a 3.57 GB
weight file and benefits from a Vulkan-capable GPU; CPU fallback is much slower.

Open **Preacherman Local Services** or double-click `Install-Services.cmd`, choose
a directory, then let setup finish. The private Python environment does not alter
system Python or PATH. Models and caches stay in your selected directory. Docker's
image disk is configured separately in Docker Desktop; select its disk before
pulling images if you need to keep those off C:.

Internet access is needed to GitHub, Hugging Face, PyPI, NuGet, Docker Hub and the
upstream motion archive. API costs belong to the user's own provider account.

```powershell
.\Install-Services.ps1 -Root 'D:\PreachermanRuntime'
# Optional, only after reviewing Breeze's research/non-commercial terms:
.\Install-Services.ps1 -Root 'D:\PreachermanRuntime' -IncludeBreeze -AcceptBreezeNonCommercialLicense
```

Pinned versions/hashes are in `runtime-assets.json`. Setup reuses verified
downloads; failed `.part` files are never installed. An incomplete setup does not
replace the desktop's installation record. If interrupted during motion extraction,
preserve any edited data and choose an empty directory: setup does not overwrite
an unverified library.

If Google Drive is unavailable, get `motion_data.zip` from the official mirror in
the manifest. Place it in a cache folder and pass `-DownloadCache 'D:\Downloads\Preacherman'`.
The same cache may contain other manifest downloads; every file is hash-checked.

## Configure conversation and voices

Restart the desktop, activate a character, and configure your API in **Asset >
Settings > Execution Mode > API / BYOK**. The bottom-right voice button sends
recognized speech to that character's configured AI. Replies are spoken; memories
remain associated with the activated character.

Windows speech works when the selected language's SAPI voice is installed. Add a
missing language through Windows language/speech settings. Optional Breeze voices
can be designed or saved from your own reference audio at `http://127.0.0.1:18760/`.
Use the exact character ID as the saved name (such as `cortana` or
`halo-mk-v-model`), or set `metadata.characterId`. IDs are listed in the source's
`apps/preacherman-demo-host/src/surfaces/asset/characters.json`.

Refresh/reconnect in **Appearance > Voice**, click a tile to preview, then hold
**Apply**. No maintainer API keys, clones, conversations or memories are installed.

## Operation and removal

These scripts are copied to the runtime directory:

```powershell
.\Start-Services.ps1
.\Check-Services.ps1
.\Stop-Services.ps1
```

| Service | Owner / port | Lifetime |
| --- | --- | --- |
| Application API | Desktop sidecar / 8787 | Owned by desktop |
| Speech recognition | Private Python child / no port | Released after idle |
| Speech2Motion | Docker / 18084 | Shared local service |
| Audio2Face | Docker / 18083 | Shared local service |
| Breeze | Native process / 18760 and 18761 | Shared local service |

All endpoints bind to loopback. Do not expose unauthenticated model services to
the internet. Closing the desktop leaves shared services running; stop scripts
verify ownership before stopping this installation. Logs are in component `logs`
directories. A conflicting installation/port is reported, never forcibly replaced.

`%USERPROFILE%\.preacherman-demo\runtime-installation.json` records the root, not
API keys. Advanced trusted-local overrides: `PREACHERMAN_RUNTIME_ROOT`,
`PREACHERMAN_RUNTIME_CONFIG`, `PREACHERMAN_DOCKER_EXECUTABLE`. Browser requests
cannot set these paths. Existing D:\AI / D:\Codex installs remain compatible
without an installation record.

Desktop uninstallation preserves user data and runtime models. To remove services,
stop their owning installation, privately back up memories/voices, then remove its
runtime directory and installation record. Manage Docker images separately. Do
not delete database volumes or run global Docker prune for routine updates.
