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

# Home batch 1 design QA

## Scope and source truth

- Figma file: `USA27mjAybt1oSFyhwwDaz`.
- New screen roots: `287:637`, `287:714`, `219:3`, `281:374`, `32:2`, and `412:728`.
- Acceptance viewport: 1440 x 900 client pixels. No responsive rules were added.
- Every source root was read individually and its Figma screenshot was opened before implementation.
- Forty-nine unique temporary Figma assets were localized under `src/assets/figma/home-batch-1`; `manifest.json` records their SHA-256 values and contains no temporary URL.

## Temporary comparison evidence

The following files are QA-only and are not committed:

| State | Figma source | Tauri implementation |
| --- | --- | --- |
| Status / State Trace | `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-batch-1\287-637.png` | `C:\Users\Administrator\AppData\Local\Temp\preacherman-qa-batch1\287-637-status-trace.png` |
| Current State cue | `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-batch-1\287-714.png` | `C:\Users\Administrator\AppData\Local\Temp\preacherman-qa-batch1\287-714-current-cue.png` |
| Current State detail | `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-batch-1\219-3.png` | `C:\Users\Administrator\AppData\Local\Temp\preacherman-qa-batch1\219-3-fixed.png` |
| Figure chat affordance | `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-batch-1\281-374.png` | `C:\Users\Administrator\AppData\Local\Temp\preacherman-qa-batch1\tauri-current.png` |
| Empty conversation | `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-batch-1\32-2.png` | `C:\Users\Administrator\AppData\Local\Temp\preacherman-qa-batch1\32-2-chat-empty.png` |
| Sent / reply state | `C:\Users\Administrator\AppData\Local\Temp\preacherman-figma-batch-1\412-728.png` | `C:\Users\Administrator\AppData\Local\Temp\preacherman-qa-batch1\412-728-fixed.png` |

Each pair was reviewed together at the same viewport and state. The full 1440 x 900 captures preserve enough resolution for the focused tooltip, composer, State Flow, and reply-text regions; no separately committed crop is needed.

## Interaction and state semantics

- `Status: live` opens the State Trace state.
- `current state: v 1.0.0` opens Current State detail. The hand-cursor frame is a QA cue, not an extra product route.
- Hovering or focusing the State figure shows `click to chat with her.`; clicking the figure opens the conversation.
- A non-empty composer value followed by Enter opens the sent/reply state. Shift+Enter remains available for a line break.
- `Turn into Task` records a local Demo action only because the destination Workspace frame is outside this batch.
- Direct `/__screens/:screenId` links exist only for QA. Pending entries are disabled and are not product navigation.
- Surface Skin has no Tauri or network import. Native window actions remain confined to `DemoHostBridge`; browser-preview window actions record `TAURI_UNAVAILABLE` instead of fake success.

## QA history and fixes

- The first Tauri pass exposed an overlapping hidden send control and `Turn into Task` control. The send control is now accessibility-only, Enter is the explicit send trigger, and the reply state no longer shows duplicate black controls.
- The first Current State detail comparison exposed `Deep Dive` where Figma says `Current Focus`, an incomplete focus node, an idle Session Start node, a missing Return to Chat icon, and horizontal/vertical offset in that control. All were corrected with localized Figma assets and regression tests.
- The first reply comparison exposed `Exploring` as the active session step and two black controls absent from Figma. The final implementation keeps Session Start active and removes those reply-state controls.
- The running dev process logged short-lived Vite pre-transform misses while the library build replaced `dist`; each was followed by successful CSS/JS reloads. The final server responds HTTP 200 and the Tauri process remains responsive.

## Remaining visible differences

- P3: Edge/WebView2 and Figma rasterize small text and one-pixel curves differently. This is visible in letter width, antialiasing, and a few 1-8 px line-wrap differences.
- P3: The translucent vessel, orbit strokes, and card shadows have small opacity/edge differences even though the source assets and measured layout are used.
- P3: The small information glyph uses the localized Figma circle plus its separate text layer; font rasterization differs slightly from Figma.
- P3: Orbit motion remains intentionally static pending local visual approval.
- No zero-difference claim is made. No remaining P0, P1, or P2 issue was observed in the accepted states.

## Final result

Passed
