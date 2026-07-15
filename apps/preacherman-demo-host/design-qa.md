# Frame 281:538 design QA

## Scope and baseline

- Source: Figma file `USA27mjAybt1oSFyhwwDaz`, frame `281:538` (`Page 6 工作区 / conversation workspace`).
- Acceptance viewport: 1440 × 900 CSS pixels. No responsive behavior was introduced.
- The 17 hidden top-level Figma nodes remain hidden.
- Orbit artwork is intentionally static until motion parameters are approved.
- The implementation uses localized Figma assets and locally bundled Inter 400/600/700 fonts.

## Visual comparison

Temporary comparison artifacts (not committed):

- Figma: `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-281-538\reference.png`
- Vite: `C:\Users\Administrator\AppData\Local\Temp\preacherman-vite-281-538.png`
- Tauri client area: `C:\Users\Administrator\AppData\Local\Temp\preacherman-tauri-client-281-538.png`
- Vite overlay: `C:\Users\Administrator\AppData\Local\Temp\preacherman-vite-overlay.png`
- Vite difference image: `C:\Users\Administrator\AppData\Local\Temp\preacherman-vite-diff.png`
- Tauri overlay: `C:\Users\Administrator\AppData\Local\Temp\preacherman-tauri-overlay.png`

Measured at 1440 × 900:

| Comparison | Mean absolute channel difference | P95 channel difference | Pixels with channel difference > 4 |
| --- | ---: | ---: | ---: |
| Figma → Vite | 0.8407 | 5 | 6.1533% |
| Figma → Tauri | 0.8306 | 5 | 6.0067% |
| Vite → Tauri | 0.0554 | 0 | 0.1556% |

The Tauri WebView client area is exactly 1440 × 900. The Windows outer window measured 1456 × 909 because the operating system adds a non-client resize border/shadow around the undecorated, resizable client area.

## Interaction QA

- Window close, minimize, and maximize/restore actions are dispatched by the Surface and executed only by the Demo Host bridge.
- Maximize/restore changed the native `IsZoomed` state in both directions and logged `result.ok: true`.
- Minimize changed the native `IsIconic` state from false to true and logged `result.ok: true`.
- Notification, user, and all seven bottom navigation controls produced local action-log entries without changing `http://127.0.0.1:1420/`.
- Window controls and the icon-only notification control expose hover descriptions. No interaction creates a route or a second page.
- The browser-preview bridge reports `TAURI_UNAVAILABLE` for window actions instead of claiming native success.
- The audited Figma frame has no prototype reactions. Its hidden top-level nodes are legacy navigation-rail layers rather than separate screens or active overlays.

## Remaining differences

- P3: Figma's renderer and Edge/WebView2 rasterize small Inter text and one-pixel antialiased edges slightly differently. This accounts for the remaining low-level pixel differences around the top status, account text, bottom navigation, orbit edges, and translucent figure.
- P3: The native outer window includes the Windows resize border/shadow described above; the visual acceptance target is the exact 1440 × 900 client area.
- No remaining P0, P1, or P2 visual issue was observed. This is not a claim of zero pixel difference; the measured residuals above remain.
