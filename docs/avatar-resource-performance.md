# Existing avatar resource performance plan

Scope: improve the two installed characters (Cortana/Zima), their existing videos,
412-motion library, and shared Gallery navigation. Preserve authored quality,
Activate semantics, normal Home startup and self-contained desktop packaging.

1. Record native before/after samples in both appearances: frame intervals,
   first/repeated switches, Canvas identity, JS heap and hidden Gallery playback.
2. Reuse the WebGL Canvas while replacing only the character's scene resources.
   Keep at most two recently fetched model files (24 MiB); prefetch only the
   existing neighbouring character after the current model is ready.
3. Bound decoded animation packs by both count and bytes. Retain only requested
   clips in each live adapter, and retire inactive actions after their fades.
4. Pause the hidden Gallery after its authored first-entry initialization and
   pause the avatar when the document is hidden. Resume without reloading.
5. Evaluate lossless compression of the existing motion files against size and
   loading evidence. Preserve every decoded byte and all 412 actions if applied.
6. Add focused lifecycle/cache/regression checks, run sequential browser/native
   checks and repeated switches, then produce one incremental Tauri release.
   Back up and verify the executable/sidecar pair, deploy the canonical shortcut,
   cold launch all core routes in both appearances, and restart normally.

Evidence and completion results will be appended here after verification.

Implementation decisions:
- Raw model source cache: two entries, 24 MiB. Parsed model GPU resources remain
  exclusively owned by the mounted character and are disposed on replacement.
- Animation cache: two completed packs, 96 MiB of distinct track buffers. A file
  above the budget is usable without being retained. Queued decodes are serial;
  failed requests are removed and retryable. Active actions/fades temporarily
  retain their clips; inactive actions settle to eight recent motions plus idle.
- Character scene is keyed, Canvas is stable. Skeleton bone textures and the
  complete useTexture array cache key are released when a character leaves.
- Hidden Gallery pauses after the existing entry reveal finishes. Its active
  videos resume on return; closing the foreground mirror still leaves playback
  running while Gallery is visible. Avatar rendering pauses on document hide.
- Frame diagnostics are bounded to 1,024 intervals and published to the existing
  Canvas dataset every two seconds, without adding visible UI.
- Compression experiment: core.glb 10,583,072 bytes -> gzip 8,627,253 bytes (18.5%
  smaller). A new decode path was not adopted for that limited sample benefit.
  All model/video/motion files remain byte-for-byte unchanged. This update targets
  loading/resource stability; it does not claim a smaller installer or deletion
  of any motions. The asset audit is reproducible with
  `node apps/preacherman-demo-host/scripts/audit-avatar-resources.mjs`.

Source verification:
- 28 renderer tests passed (including cache budgets, coalescing, retries, serial
  loads, clip retirement/replay, and shared skeleton texture disposal).
- 29 focused Demo Host tests passed (Gallery, activation, light/dark, activity).
- Full browser flows passed in both appearances, including video, card identity,
  keyboard and reduced-motion switching, activation persistence, Home, Task,
  Gallery, Market/ledger, Settings and Account; no new console errors.
- Browser stress: 20 switches per appearance retained the same Canvas. Cortana
  returned to 13 geometries / 18 textures / 11 programs; Zima used 9 / 11 / 7.
  No accumulation was observed over those 40 switches. These are resource counts,
  not GPU byte measurements or a guarantee for arbitrary future model assets.

Native before/after measurements and delivery hashes follow in the deployment
manifest and the final evidence record after desktop verification.
