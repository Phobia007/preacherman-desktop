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

# Home code-rain update design QA

## Scope and visual truth

- User reference image: `D:\Temp\Administrator\codex-clipboard-b5b01c28-fa6d-4b61-81ad-23e3cf281dcd.png`.
- User reference video: `C:\Users\Administrator\Videos\NVIDIA\Desktop\Desktop 2026.07.20 - 05.27.40.02.mp4`.
- Extracted video contact sheet: `output/playwright/reference-video-samples.png`.
- Final light capture: `output/playwright/home-rain-light-final.png`.
- Final dark capture: `output/playwright/home-rain-dark-final.png`.
- Performance-optimized final capture: `output/playwright/home-rain-performance-final.png`.
- Same-input density comparison: `output/playwright/rain-reference-vs-final.png`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.
- The reference was used for rain density, depth, streak length, and motion character only. Existing light and dark theme colors were intentionally retained.

## Visual and interaction checks

- The central figure, all four orbs, and both large orbit rings are absent from the Home visual in source and in the rendered DOM.
- The Home visual now contains only its existing background/vignette and three shared-state code-rain canvases.
- Column spacing is densest through the center, then increases continuously toward both edges.
- The rain mask uses multiple symmetric opacity stops, so the curtain softens gradually instead of ending on a visible boundary.
- Fine vertical trails, blurred rear glyphs, glow accents, and sharp foreground glyphs produce the layered rain-curtain character visible in the supplied reference.
- Light-mode contrast is visibly stronger while preserving the existing warm gray palette; dark mode preserves the existing cool gray-blue palette.
- The sharp rain layer's computed transform changed from `translateY(731.963px)` to `translateY(744.562px)` over 500 ms, confirming continuous compositor motion.
- Microsoft Edge reported zero console errors on the accepted Home state.
- Existing Settings appearance control and Home navigation were exercised successfully. No original functional component or button was removed.
- Rendered DOM check: 3 rain canvases, 0 figures, 0 orbs, and 0 orbit-ring groups.

## QA history and fixes

- The first density pass increased configured columns but remained visually sparse because the low-opacity rear layer was heavily blurred.
- The accepted pass broadened the dense center profile, shortened the maximum spacing, increased usable light-mode contrast, lengthened streams, and added a fine trail to both rear and sharp layers.
- One Playwright session produced a flat capture while its live canvas still contained nonzero pixels; the accepted evidence was recaptured in a second Microsoft Edge session and visually inspected.
- The reference and final implementation were reviewed together in `rain-reference-vs-final.png`. The final intentionally omits the reference character and preserves the product's own colors.

## Performance optimization

- Before optimization, the rain hook cleared three full-screen canvases and repeated thousands of `fillText` calls on every JavaScript animation frame.
- The captured pre-fix sample contained 3 main-thread long tasks totaling 1933 ms, with a worst observed frame stall of 941.7 ms.
- The accepted implementation renders the three rain textures only on mount, theme change, or resize. Continuous motion is now a CSS compositor transform rather than a JavaScript draw loop.
- Internal rain texture scale is capped at 0.78 and the blurred rear layer omits duplicate glyph drawing.
- Foreground Microsoft Edge measurement at 1800 x 1000: 240.1 animation callbacks per second, 4.3 ms P95 frame interval, 4.4 ms maximum interval, and 0 long tasks over 3 seconds.
- Settings and Home navigation buttons were exercised while the rain animation was running; both transitions completed normally and the console reported zero errors.

## Remaining visible differences

- P3: The supplied reference is a compressed cinematic frame with volumetric blue haze. The implementation keeps the product's existing palette and binary glyph identity as requested.
- P3: Individual column positions are randomized on each mount, so exact stream placement differs between captures while the density profile remains stable.
- No remaining P0, P1, or P2 issue was observed.

## Final result

passed

# Gallery model activation flow QA

## Scope

- Gallery idle state: `output/playwright/gallery-activate-idle-light.png`.
- Gallery activated state with the persistent navigation open: `output/playwright/gallery-activated-with-nav-light.png`.
- Dark activated state: `output/playwright/gallery-activated-dark.png`.
- Home light state after activation: `output/playwright/home-activated-cortana-light.png`.
- Home dark state after activation: `output/playwright/home-activated-cortana-dark.png`.
- Gallery/Home side-by-side consistency evidence: `output/playwright/model-gallery-home-consistency.jpg`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.

## Interaction and persistence checks

- The detail action begins as `Activate` with `aria-pressed="false"` when no model is active.
- A normal click or an early release does not change the model state. Holding for 1.5 seconds fills the control from its center toward both edges, flashes briefly, and only then updates it to `Activated` with `aria-pressed="true"`.
- Holding the activated control for 1.5 seconds performs the inverse centerward contraction, flashes, clears `activeModelId`, and returns the control to `Activate` with `aria-pressed="false"`.
- Both directions use the same accelerating `cubic-bezier(0.72, 0, 1, 1)` timing. Runtime clip-path samples confirmed a slow first 0.5 seconds followed by progressively faster travel.
- The active model is stored in `preacherman.preferences` as `activeModelId: "cortana"` alongside the existing appearance and locale values.
- Home displays the activated model after navigation and after a full reload. After deactivation stores `activeModelId: null`, Home immediately returns to the existing background-only state.
- Gallery detail and Home render the same `CortanaModelStage` component. Both measured `x: 300`, `y: 76`, `width: 1200`, and `height: 838` at the acceptance viewport.
- The activated button measured `x: 1572`, `y: 840`, `width: 156`, and `height: 48`. The open bottom navigation began at `y: 946`, leaving a 58 px vertical gap.

## Visual checks

- The Activate control uses shared light/dark theme tokens, pill geometry, subtle depth, center-outward fill, centerward contraction, and a restrained completion flash. The previous status point is absent.
- Light mode transitions from white/black to black/white; dark mode transitions from white outline/text to white fill with black text.
- Idle and activated states remain readable in both appearances; hover, active, focus-visible, and reduced-motion behavior are defined.
- The Home and Gallery comparison confirms identical model pose, camera, scale, ground treatment, and position. Only page-specific controls differ.
- The code-rain background remains behind the model, and the bottom navigation remains above the page content.
- Microsoft Edge reported zero console errors. Existing Three.js/WebGL warnings did not affect rendering or interaction.

## Verification

- Demo Host: 43 tests passed.
- TypeScript and Vite production build passed.
- Microsoft Edge verified early-release cancellation, activation, deactivation, Home removal, and both appearance palettes with zero console errors.
- No original Gallery card, Back to Gallery action, bottom navigation action, theme behavior, or model interaction was removed.

## Final result

passed

# Tauri startup white-screen failsafe QA

## Scope

- User report: `D:\Temp\Administrator\codex-clipboard-32fa2d9e-bd3b-47fb-9ddc-c0d4c6b38c07.png`.
- Normal Release startup: `output/playwright/tauri-white-fix-normal-after-reload.png`.
- Stalled-animation simulation: `output/playwright/tauri-white-fix-failsafe-after-reload.png`.

## Findings and verification

- The packaged HTML, JavaScript, stylesheet, and WebView2 route loaded without resource failures or console errors.
- The startup splash previously depended entirely on the Web Animations `finished` promise. A WebView2 animation that never settled could therefore leave the splash visible indefinitely.
- The splash now owns an independent failsafe timer that completes the handoff one second after the normal startup sequence deadline.
- Normal startup timing and animation remain unchanged.
- With the animation `finished` promise deliberately held pending, the Release still removed the intro and exposed the application shell.
- Demo Host typecheck, production build, and all 40 tests passed.

## Final result

passed

# Cortana fixed-size interaction design QA

## Scope

- User reference: `D:\Temp\Administrator\codex-clipboard-ed4782ca-d478-4f91-a43f-8f3e16ba3039.png`.
- Fixed-size baseline: `output/playwright/cortana-fixed-size-before-wheel.png`.
- Wheel-in result: `output/playwright/cortana-fixed-size-after-wheel-in.png`.
- Wheel-out result: `output/playwright/cortana-fixed-size-after-wheel-out.png`.
- Drag-rotation result: `output/playwright/cortana-fixed-size-drag-rotation.png`.
- Dark appearance result: `output/playwright/cortana-fixed-size-dark-wheel.png`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.

## Interaction checks

- The interactive camera retains its accepted default position at `[0, 0.86, 3.35]`.
- OrbitControls wheel zoom is disabled while PresentationControls drag rotation remains enabled.
- Large wheel deltas in both directions left the model boundary and ground-contact position unchanged.
- A horizontal drag rotated Cortana to a side view, confirming that the requested model interaction remains available.
- The model material, pose, hand placement, world-space lighting, authored scale, and ground treatment were not changed.
- Light and dark appearances both reported zero console errors. The existing Three.js `Clock` deprecation warning remains unrelated to this change.

## Automated checks

- Avatar renderer: 12 tests passed.
- Demo Host: 40 tests passed.

## Final result

passed

# Gallery Home-background transplant design QA

## Scope and visual truth

- Home background source: `D:\Temp\Administrator\codex-clipboard-41941c67-09ea-4528-b442-87c824936f33.png`.
- Cortana detail source: `D:\Temp\Administrator\codex-clipboard-3b0e1ce6-8522-42ba-a201-75947cdb8461.png`.
- Gallery title source: `D:\Temp\Administrator\codex-clipboard-49d5297a-810a-4e5c-8007-1f0d4d6d4da2.png`.
- Final light detail: `output/playwright/gallery-detail-home-background-light.png`.
- Final dark detail: `output/playwright/gallery-detail-home-background-dark.png`.
- Final Gallery index: `output/playwright/gallery-title-left-light.png`.
- Full-view comparison: `output/playwright/gallery-background-comparison.jpg`.
- Focused title comparison: `output/playwright/gallery-title-comparison.jpg`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- The Cortana detail view reuses the exact Home visual component, including its light/dark palette, vignette, density profile, and three pre-rendered rain canvases.
- The previous detail-page inset frame is absent and the background reaches all four viewport edges.
- Runtime stacking inspection reported background `z-index: 0`, model viewport `z-index: 2`, background `pointer-events: none`, and model canvas `pointer-events: auto`; the background cannot cover or block the model.
- Gallery title is positioned at the upper-left inset while the Cortana card and carousel arrows retain their previous location and behavior.

## Required fidelity surfaces

- Fonts and typography: the existing Gallery serif family, weight, size, and line height are unchanged; only the title's horizontal placement changed.
- Spacing and layout rhythm: the card, arrows, model viewport, Back to Gallery control, and bottom indicator retain their existing dimensions and positions. Only the requested title margin and detail frame removal changed.
- Colors and visual tokens: the detail background uses the existing Home visual theme resolver, so both light and dark appearances remain consistent with Home.
- Image quality and asset fidelity: the Cortana portrait, interactive model, shaders, textures, camera, and lighting are unchanged.
- Copy and content: Gallery, Cortana, and Back to Gallery copy are unchanged.

## Comparison history

- The first rendered implementation had no visual P0/P1/P2 issue. A premature Gallery screenshot captured the existing startup splash; it was recaptured after the splash completed without changing product code.
- The accepted full-view comparison places both supplied detail references and both final theme states in one image. The focused comparison places the supplied Gallery index next to the final upper-left title state.
- Microsoft Edge reported zero console errors. One existing Three.js/WebGL warning remained and did not affect rendering or interaction.

## Final result

passed

# Gallery appearance contract design QA

## Scope and visual truth

- User reference: `D:\Temp\Administrator\codex-clipboard-d121b381-841d-4156-9a42-18ea9f4e0442.png`.
- Final light capture: `output/playwright/gallery-detail-light-final.png`.
- Final dark capture: `output/playwright/gallery-detail-dark-final.png`.
- Light/dark side-by-side review: `output/playwright/gallery-detail-light-dark-final.png`.
- Reference/dark side-by-side review: `output/playwright/gallery-detail-source-dark-final.png`.
- Window-control crops: `output/playwright/window-controls-light-final.png` and `output/playwright/window-controls-dark-final.png`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.
- The character model, texture, pose, camera controls, Gallery navigation, and existing window actions were preserved. The scope is the surrounding page background, chrome, borders, loading/error surfaces, and persistent window-control presentation.

## Visual and interaction checks

- Gallery and its detail view inherit the application appearance from the persistent `AppShell`.
- The light detail view uses the shared warm light canvas, dark text, dark control icons, and light borders.
- The dark detail view uses the shared dark canvas, light text, light control icons, and dark borders.
- The WebGL canvas remains transparent, so no fixed black rectangle overrides the page appearance; runtime inspection reported `alpha: true` and a clear value of `[0, 0, 0, 0]`.
- Minimize, maximize, and close retain their existing actions and source SVG paths. Their strokes are now visible at the rendered 15 px size and the shared icon filter changes with appearance.
- The final side-by-side review confirms that the model material is identical between light and dark modes while only its surrounding desktop UI changes.
- Microsoft Edge reported zero console errors in both accepted states. One existing Three.js/WebGL warning remained and did not affect rendering or input.

## QA history and fixes

- The first light-theme pass exposed the interactive Three.js scene's hard-coded black `scene.background`, which forced an opaque black rectangle even though the renderer requested an alpha channel. Removing that scene background restored the intended themed page background without touching model materials or lighting.
- The first window-control crop exposed one-unit SVG strokes becoming too faint after scaling from an 80-unit view box to 15 px. The same paths now use a four-unit stroke, preserving the controls while making them readable in both appearances.
- The user reference and the final dark view were reviewed together. The existing layout, navigation, model interaction, and model asset path remain intact; only theme inconsistencies in the surrounding interface were corrected.
- `AGENTS.md` now records a mandatory project-wide light/dark contract so future Codex tasks apply the same theme source, semantic tokens, model exception, preservation rule, and two-mode QA to every page and dialog.

## Remaining visible differences

- P3: The user reference includes an external performance overlay that is not part of the product UI.
- P3: Microsoft Edge/WebView2 and the source capture rasterize the animated model and small text slightly differently.
- No remaining P0, P1, or P2 theme issue was observed.

## Final result

passed
