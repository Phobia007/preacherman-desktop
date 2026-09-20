# Preacherman Desktop Lightweight Update Contract

Status: mandatory for every change that can affect the runnable Preacherman Desktop Demo.

Scope: every current and future user-facing page, surface, dialog, overlay, and navigation route. The named examples in this document are minimum checks, not a closed list. Home, Task, Gallery, Market, Ledger, Settings, Account, and any later page all inherit this contract automatically.

## Purpose

Desktop updates must be fast to produce without weakening cold-start reliability or changing the authored frontend. Build speed comes from incremental compilation, cache reuse, focused verification, and rebuilding only what changed. The production application must continue to open as one self-contained desktop experience from `C:\Users\Administrator\Desktop\Preacherman Desktop Demo.lnk`.

## Rejected architecture

The external UI asset route introduced in commit `a339a92` and reverted in `162d576` is permanently rejected.

That route reduced the embedded executable by moving models and surface content to a sidecar-owned HTTP server. On a real cold start, the WebView could request the Home model, Task, and Gallery before the asset server was ready. Simultaneous heavy preloading then amplified contention. The observable failures included a missing local model, Task timeouts, empty content, white or black screens, unavailable interaction, and abnormal CPU use. A later HTTP `200` did not repair the already-failed first render.

Do not recreate any equivalent design, including:

- `127.0.0.1:8788` or another local HTTP origin for packaged UI assets;
- `/ui/` runtime asset paths;
- `PREACHERMAN_UI_ROOT` or a sidecar-selected UI root;
- production-only URL rewriting such as `runtimeAssetUrl`;
- a reduced `tauri-dist` shell that excludes Home, Task, Gallery, Settings, models, fonts, or media;
- copying the full frontend to a `preacherman-ui` runtime resource directory served by the sidecar;
- treating a successful service response, process start, or browser preview as proof that the native cold start works.

## Approved fast update workflow

1. Start from a known Git commit and inspect the worktree. Commit or preserve unrelated user changes before touching deployment files.
2. Make the smallest source change that satisfies the request. Preserve existing routes, visual assets, motion, interaction, appearance modes, and startup behavior unless the request explicitly changes them.
3. Run focused regression tests and type checking before the production build. Use a browser preview for rapid iteration, but do not treat it as desktop delivery.
4. Rebuild only affected components:
   - frontend change: run the frontend production build;
   - Rust/Tauri host change: use the existing incremental release target;
   - sidecar/server change: rebuild the sidecar once;
   - unchanged sidecar: reuse the verified sidecar;
   - installer: skip unless the user explicitly needs an installer.
5. Preserve all valid build caches. Do not run `cargo clean`, delete `src-tauri/target`, or create a second target directory merely to force a fresh build.
6. Run at most one intended production release build after source verification. Do not overlap Cargo, Rust, Vite, Tauri, or sidecar builds against the same output directory.
7. Before deployment, copy the currently deployed executable and sidecar to the release `backups` directory. Record their hashes so the pair can be restored together.
8. Deploy only to `D:\preacherman\apps\preacherman-demo-host\src-tauri\target\release`. Keep the desktop shortcut pointed at the canonical release executable.
9. Update `apps/preacherman-demo-host/desktop-build-manifest.json` with build and deployment timestamps, byte sizes, SHA-256 hashes, source task, backup paths, and verification results.
10. Commit the source and deployment record at a useful checkpoint. Do not leave the canonical desktop state represented only by an uncommitted worktree.

## Required native verification

Verify the production executable through the desktop shortcut after a true cold start. Do not reuse a preview server or a previously running sidecar.

Always verify the surface changed by the current task and every newly introduced surface. In addition, smoke-test the core navigation paths below so a new page cannot silently damage an existing page. If Market and Gallery are separate destinations in the current product state, verify both independently; if they intentionally share a route, verify the user-visible destination and its navigation label.

- Home opens through the normal startup flow.
- The local companion model reaches `ready` and no local-model error is visible.
- Task reaches `ready` on first entry, shows its cards through the authored animation, and does not require Surf/Timeline toggling, retrying, or reloading.
- Gallery reaches its complete state, shows authored content over the persistent model, remains interactive, and never exposes a white screen, loading-timeout page, or internal error page.
- Settings opens immediately and remains usable.
- Market, Ledger, Account, and every changed or newly added page open on first entry, display their complete authored content, and remain interactive without retrying, reloading, or visiting another page first.
- Persistent minimize, maximize, and close controls work on every surface.
- Light and dark modes remain deliberate and readable.
- The browser console contains no new errors.
- The native window remains responsive and CPU use settles after startup instead of remaining abnormally saturated.
- The shortcut target exists and its hash matches the manifest.

Process existence, a listening port, or an HTTP success response is only supporting evidence. Visual and interactive verification of the native window is required.

## Browser automation and process cleanup

Local verification is complete only after the resources created by that verification have been released.

- Reuse an existing healthy preview or development server instead of starting a duplicate for the same project and port.
- Run Playwright and other browser automation sequentially with one worker by default. Every run must have bounded timeouts.
- Create browsers and contexts inside a lifecycle guarded by `try/finally`; close the browser in `finally` so failures, timeouts, assertions, and early returns cannot strand `chrome-headless-shell` processes.
- After verification, inspect the task's process tree and confirm its browser, Node, preview, watcher, Rust, linker, and temporary test children have exited.
- A completed browser run that leaves sustained CPU/GPU use or orphan processes is a failed verification and must be cleaned before another build or test starts.
- Identify ownership using command line, project path, parent PID, port, and start time. Never use a process-name-wide kill against shared Edge, Chrome, WebView2, Node, Python, or Codex processes.

## Failure and rollback rule

Any missing model, page, or surface, first-entry timeout, blank or white screen, lost interaction, unexpected loading/error UI, shortcut mismatch, or sustained abnormal CPU usage blocks delivery. This rule applies equally to named core pages and pages added in the future.

When this happens:

1. stop the new desktop process and its sidecar;
2. preserve the failed executable and sidecar for diagnosis;
3. restore the last verified executable and sidecar as a matching pair;
4. launch the canonical shortcut normally and repeat Home, Task, Gallery, and Settings verification;
5. update the deployment manifest with the restored hashes and process verification;
6. revert or disable the failed source architecture and commit the rollback;
7. report the exact boundary between restored desktop behavior and any newer source work that remains undeployed.

Never leave the user on a broken release while a speculative build fix continues in the background.

## Incident baseline

The 2026-08-26 recovery is the reference incident for this contract:

- rejected change: `a339a92 build(demo)-externalize-local-ui-media`;
- architecture revert: `162d576 Revert "build(demo)-externalize-local-ui-media"`;
- restored deployment record: `e32d0cc` and `e81953e`;
- current verified executable and sidecar hashes: use `apps/preacherman-demo-host/desktop-build-manifest.json` as the source of truth.

Future optimization work may improve compilation or staged loading, but it must satisfy this contract before replacing the canonical desktop release.

## Bounded desktop backup retention

The user requested removal of unnecessary files on 2026-09-19 after old desktop deployment backups grew to approximately 90 GiB. This section adds a retention limit to the existing backup requirements; it does not remove the requirement for a verified matching rollback pair.

- Keep the newest three complete, hash-verified desktop backup sets across the canonical release `deployment-backups` and `backups` directories. Always preserve the rollback pair referenced by the current `desktop-build-manifest.json`.
- A normal backup contains the desktop executable, matching sidecar, and deployment manifest. Never recursively copy the release directory, its previous backups, or the entire Cargo target tree into a new backup.
- After a successful deployment and native verification, update the canonical manifest and run `powershell.exe -NoProfile -File D:\preacherman\tools\Prune-DesktopBackups.ps1 -Apply`. Without `-Apply`, the script only reports the proposed cleanup.
- The pruning script verifies current and retained executable hashes, rejects reparse points and active build processes, and preserves newly created backup entries for one hour. It deletes only older release backup entries; it does not delete source, user assets, the current release, or current release compilation caches.
- If pruning fails, record the reason and fix the manifest or backup mismatch before the next deployment. Do not bypass its checks or create unlimited additional backup copies.
- Use existing build targets during ordinary iterations. Remove obsolete alternate/debug targets and temporary verification profiles once they are no longer needed; do not accumulate a separate full target tree for each fix.
