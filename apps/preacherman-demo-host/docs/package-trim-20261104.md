# Packaged asset cleanup

The canonical release previously embedded 1,261,840,167 bytes from `public`.
`package-trim-20261104.json` records each removed file, its hash, recovery commit,
size and reason. These are tracked files and can be recovered from that commit.

Removed resources belong to retired numbered character templates, replaced
portraits, unused font sources, the removed jewelry introduction and the retired
bracelet scene. The standalone options footer already bypasses the bracelet
renderer and asset preloader. The production Market Details flow renders the
selected character through `InteractiveAvatarViewport`.

The duplicate Task video is redirected to its byte-identical canonical copy.
No model, skeleton, animation, authored texture, voice, speech model, service,
user data or active page was removed. All runtime assets remain packaged in
Tauri; this change adds no local server or first-launch download dependency.

The import manifest remains a historical provenance record. Its regression test
requires each asset either to match its original hash or to have an explicit,
hash-matched retirement entry and be absent. `package-assets.test.mjs` protects
the current character catalog, runtime models, fonts, speech files and size budget.
