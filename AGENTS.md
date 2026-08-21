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
