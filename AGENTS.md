# Preacherman project instructions

## Mandatory Light/Dark Theme Contract

Every user-facing page, dialog, overlay, desktop control, and interactive component must support both `light` and `dark` appearance modes.

- The single source of truth is `preacherman.preferences` in `apps/preacherman-demo-host/src/preferences.ts`.
- `applyPreferences` must continue to set `html[data-appearance]`, and `AppShell` must continue to expose `data-appearance`.
- New or changed Demo Host UI must use the semantic `--demo-theme-*` variables defined in `apps/preacherman-demo-host/src/styles.css`. Do not ship page chrome with only hard-coded light or dark colors.
- At minimum, each mode must provide deliberate values for page background, surface background, primary and muted text, borders, focus indicators, icons, hover/focus states, loading states, and error states.
- Persistent desktop controls, including minimize, maximize, and close, must remain readable and interactive in both modes on every page.
- 3D models, authored textures, videos, and other content assets do not need recoloring unless the user explicitly requests it. Their surrounding viewport, background, border, buttons, and status UI must still follow the active appearance.
- Preserve existing components, buttons, routes, and behavior unless the task explicitly asks to change them.
- Add or update regression tests for both appearance modes whenever theme-sensitive UI is introduced or changed.
- Before handing off a UI change, verify the affected state in both light and dark modes and check the browser console for errors.

## Mandatory Desktop Shortcut Synchronization Contract

The canonical user shortcut is `C:\Users\Administrator\Desktop\Preacherman Desktop Demo.lnk` and its canonical executable target is `apps/preacherman-demo-host/src-tauri/target/release/preacherman-demo-host.exe`.

- After every code, asset, configuration, or content change that affects the runnable Preacherman Demo, do not hand off the change until the latest verified desktop release has been deployed to the canonical executable target.
- Keep the shortcut pointed at the canonical release target. Never leave it pointing at a debug executable, recovery snapshot, temporary target directory, preview server, or stale build.
- Update `apps/preacherman-demo-host/desktop-build-manifest.json` with the deployed executable timestamp, byte size, SHA-256, source task, and verification status after each deployment.
- Verify that the shortcut target exists and that its executable hash matches the newly deployed release. Launch the shortcut once and confirm that the native window starts before reporting completion.
- If a release cannot be rebuilt or verified, state clearly that the workspace changed but the desktop shortcut was not updated; never imply that synchronization completed.

## Mandatory Desktop Shortcut Delivery Contract

Every completed change to the Preacherman Demo Host must also be delivered to the canonical desktop shortcut before handoff.

- The canonical shortcut is `C:\Users\Administrator\Desktop\Preacherman Desktop Demo.lnk`.
- Its canonical executable target is `D:\preacherman\apps\preacherman-demo-host\src-tauri\target\release\preacherman-demo-host.exe`.
- Do not deploy Preacherman Demo Host changes to `Jesper Landberg 本地作品集.lnk`.
- After any user-facing code, motion, font, image, video, model, configuration, or bundled-asset change, build the latest complete workspace state into a production Tauri executable and update the canonical executable target.
- Preserve a recoverable copy of the previously deployed executable before replacement.
- Do not change the default startup route: the shortcut must open the normal Home flow, and the user chooses Gallery from the application navigation unless explicitly requested otherwise.
- Before handoff, resolve the shortcut again, verify the deployed executable's timestamp and SHA-256 against the newly built artifact, launch through the shortcut itself, and smoke-test the changed flow.
- A source-only or browser-preview-only result is not complete when the task changes the Demo Host.

## Mandatory Lightweight Desktop Update Contract

All Demo Host updates must follow [docs/desktop-lightweight-update-contract.md](docs/desktop-lightweight-update-contract.md). In this project, "lightweight" means reusing verified build caches and rebuilding only the components affected by the source change. It never means moving packaged UI content behind a runtime local HTTP dependency.

- This contract applies to every current and future user-facing surface and route, not only Task, Gallery, and Settings. Home, Market, Ledger, Account, every navigation destination, and every newly added page inherit the same packaging, startup, interaction, appearance, verification, deployment, and rollback requirements.
- Keep the production Demo Host self-contained. Home models, Task, Gallery, Settings, fonts, media, and authored UI assets must remain available through the packaged Tauri application on the first cold launch.
- Do not reintroduce the reverted external-asset architecture from commit `a339a92`. In particular, do not serve packaged UI through `127.0.0.1:8788`, `/ui/`, `PREACHERMAN_UI_ROOT`, `runtimeAssetUrl`, a reduced `tauri-dist` shell, or a `preacherman-ui` resource directory owned by the sidecar.
- Achieve fast updates with incremental Cargo/Tauri output, preserved `target` caches, focused tests, and change-scoped builds. Do not run `cargo clean`, delete the release cache, rebuild the Windows sidecar when its source did not change, or build an installer when only the canonical release executable is required.
- Complete source checks before starting the single intended production build. Do not launch overlapping Cargo, Rust, Vite, or Tauri builds for the same target directory.
- Preserve a recoverable copy of both the deployed executable and sidecar before replacement. If either member of the pair changes, record both hashes and deploy a verified matching pair.
- A release is not verified by HTTP status or process existence alone. Cold-launch the desktop shortcut and visually verify every changed or newly added surface plus the core Home, Task, Gallery, Market, Ledger, and Settings navigation paths. Verification includes authored content and motion, interaction, both appearance modes, console errors, responsiveness, and abnormal sustained CPU usage.
- Missing content, a first-entry timeout, a white screen, a local-model error, loss of interaction, or sustained abnormal CPU use is an immediate release failure. Stop deployment, restore the last verified executable and sidecar together, and record the rollback in `desktop-build-manifest.json` and Git.
- Never hand off a build that depends on retrying, reloading, switching tabs, or waiting for a late sidecar in order to reveal its first usable content.

## Mandatory Background Process and Resource Management Contract

- Before starting a development server, preview, browser automation run, test watcher, or build, check whether an equivalent instance for this project is already running and reuse it when safe.
- Never start overlapping development servers or build/watch processes for the same project and port. Browser-based verification runs sequentially by default; Playwright uses one worker unless broader concurrency is explicitly required.
- Every browser automation script must use bounded navigation and assertion timeouts and must close every page, browser context, and browser it created from a `finally` block. Error, timeout, assertion, and early-return paths must perform the same cleanup as success paths.
- At the end of every verification or failed task, confirm that the task's Playwright `chrome-headless-shell`, Node, Python, preview server, watcher, Rust, linker, and other temporary children have exited. Do not leave an automated browser waiting indefinitely for a page state.
- Long-lived services must document their purpose, port, owner process, and stop method. Do not start a duplicate when a healthy matching service already exists.
- Never terminate Edge, Chrome, WebView2, Node, Python, Codex, or another shared process by name. Confirm ownership using the full command line, project path, parent-child chain, listening port, and start time, then stop only the exact project PID. Prefer the originating terminal or graceful stop; force termination is a last resort.
- During heavy builds or 3D/browser checks, limit concurrency and sample CPU, GPU, video memory, and RAM. Sustained abnormal utilization after the operation completes is a failed cleanup condition and blocks handoff.
- If process ownership is uncertain, preserve the process and report it instead of guessing.
