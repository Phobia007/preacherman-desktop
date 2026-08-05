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
