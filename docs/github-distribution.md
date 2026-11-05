# GitHub distribution

The desktop release destination is `Phobia007/preacherman-desktop`; the separate
`origin` remote in the maintainer checkout is not the release destination.

Git contains source, lockfiles, deployment recipes, tests and existing authored
assets. Releases contain `Preacherman-Setup.exe`, `Preacherman-Services.zip`,
`SHA256SUMS.txt` and a verification manifest. Large inference weights, Python,
motion data and Docker images come from pinned upstream sources. Private state,
API keys, recordings, clones, logs and Docker volumes are never release assets.

Existing tracked avatar assets remain in Git: do not rewrite published history or
break packaged Home startup just to introduce LFS. Future large asset packs should
use a release download or deliberately configured Git LFS. A `binary` attribute
alone is not LFS. Ordinary Git blobs over 100 MiB fail release preflight.

## Release procedure

1. Review changes and stage an explicit file list; do not stage unrelated work.
2. Run `node tools/check-release-source.mjs`, focused tests and type checking.
3. Commit source. Use the canonical desktop/cache delivery contract on the
   maintainer machine; clean checkouts use `tools/Setup-WindowsSource.ps1` then
   `npm run build:windows:installer`.
4. Test isolated installation, cold launch, authored content, navigation, both
   themes, configuration, console errors, resource cleanup and uninstallation.
   Preserve the user's existing registration, shortcut and private data.
5. Upload tested artifacts/checksums to a versioned release and only then mark it
   Latest. Keep `Preacherman-Setup.exe` as the stable asset name and tags immutable.

The Windows workflow produces artifacts and a **draft** for version tags. CI
success alone is not native verification and must not automatically publish Latest.

## Cleanup

`tools/Clear-ProjectCaches.ps1` reports disposable caches; `-Apply` removes only
its explicit allowlist after checking processes, tracked files and reparse points.
Authored outputs, model weights, voices, Docker volumes, Git history and verified
build caches stay intact. Desktop backups use the existing bounded retention script.
