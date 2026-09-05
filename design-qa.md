# Cortana material color calibration — Design QA

## Comparison target

- Source visual truth:
  - User color/texture reference: `D:\Temp\Administrator\codex-clipboard-50547def-49a1-4a1e-b942-4e8220063af7.png`
  - Blender source baseline: `E:\虚拟人\_preacherman_avatar_viewer_v0\qa\blender-source-baseline.png`
- Rendered implementation:
  - Final Tauri Release, dark front: `E:\figma\output\playwright\cortana-color-release-dark-final.png`
  - Final Tauri Release, dark dragged side view: `E:\figma\output\playwright\cortana-color-release-dark-rotated.png`
  - World-fixed light, front: `E:\figma\output\playwright\cortana-world-light-front.png`
  - World-fixed light, side: `E:\figma\output\playwright\cortana-world-light-side.png`
  - World-fixed light, rear three-quarter: `E:\figma\output\playwright\cortana-world-light-back.png`
- Combined comparison evidence:
  - Focused source/implementation comparison: `E:\figma\output\playwright\cortana-color-comparison-dark-final.png`
  - Front/side/rear world-light comparison: `E:\figma\output\playwright\cortana-world-light-comparison.png`
- Viewport: 1800 × 1000 CSS pixels.
- State: Cortana detail view, dark appearance, default standby pose, front view.

## Findings

- No actionable P0, P1, or P2 findings remain.
- [P3] The supplied source image uses the original open-arm stance while the product requirement keeps the quiet standby pose with crossed hands. Geometry overlap, arm position, and camera framing therefore prevent a literal per-pixel image diff; color and texture were compared in focused face, torso, waist, and thigh regions instead.
- [P3] Blender Eevee and WebGL are different raster/shading engines. The implementation now uses a sampled reference grade and the original material inputs, but byte-identical output across the two engines is not technically possible.

## Required fidelity surfaces

- Fonts and typography: unchanged; this pass does not alter interface typography or labels.
- Spacing and layout rhythm: unchanged; the full-body framing, Back control, and standby silhouette remain intact.
- Colors and visual tokens: the hologram grade restores bright blue-white highlights, deep navy shadows, stronger midtone separation, and the source cyan/blue balance. The surrounding viewport remains transparent so it follows the application's deliberate light/dark theme tokens without recoloring the model.
- Image quality and asset fidelity: the real GLB, embedded diffuse/normal textures, four control maps, iris normal map, and scanline texture remain connected. No raster substitute, CSS effect, or placeholder replaces the model.
- Copy and content: unchanged.

## Full-view and focused comparison evidence

- The full Tauri Release capture confirms the model remains fully visible in the requested standby pose with no missing texture or flat fallback material.
- A focused torso comparison was required because the source and implementation poses differ. It confirms the same left-side blue-white highlight, right-side navy falloff, chest panel boundaries, abdomen circuitry, thigh circuitry, and horizontal scanlines.
- The front/side/rear comparison confirms mouse rotation still works while the fixed world-space light produces visibly different highlights across the face, shoulder, torso, hip, and back.
- The new front capture was compared against the prior calibrated front capture. Inside the model crop, only 58 of 232,400 pixels changed and the maximum channel difference was 1/255, confirming that moving the light out of the rotation group did not alter the default material render.

## Comparison history

1. Initial color review
   - [P1] The previous detail lighting used broad ambient and fill illumination. It lifted the dark navy regions, compressed the blue-white highlights, and reduced texture contrast relative to the source.
   - Fix: restored the original black-reference key/fill/rim/under light values and shared them between static and interactive renderers.
2. Rotation stability review
   - [P1] The canonical light rig was initially inside the same presentation transform as the model, so the highlight remained attached to the surface during drag.
   - Fix: moved the unchanged light rig into world space and left only the avatar inside the presentation transform. The model now rotates under a fixed front-left light.
3. Blender-source calibration
   - [P2] The legacy WebGL Viewer still rendered highlights below the Blender baseline and compressed saturation.
   - Fix: added a source-sampled display grade with a contrast exponent of 1.184, output gain of 1.98, and saturation of 1.08; retained the Blender Standard +0.25 exposure already encoded by the material reconstruction.
4. Final verification
   - Kept the model canvas transparent so the surrounding viewport follows the application's light/dark appearance contract; dark mode supplies the near-black reference environment used for source comparison.
   - Post-fix evidence: `cortana-color-comparison-dark-final.png`.
   - No actionable P0/P1/P2 color or texture mismatch remains at the available reference resolution and required standby pose.

## Primary interactions tested

- Open Cortana from the Gallery card.
- Model loads to `ready`.
- Horizontal mouse drag rotates the model to a side view.
- Fixed world-space lighting changes the highlight position in side and rear views.
- Material color, scanlines, circuitry, hair, face, and body textures remain present after rotation.
- Runtime, resource loading, and console errors checked: 0.

## Verification

- Avatar renderer typecheck/build/tests: passed, 10/10 tests.
- Demo Host typecheck/build/tests: passed, 40/40 tests.
- Tauri Release build: passed.
- Tauri Release front and dragged-side captures: passed.

final result: passed

# AI Providers minimalist distillation — Design QA (latest)

## Result

- Reduced the page from six explanatory sections to four working entries: `Providers`, `Keys`, `Routing`, and `Local`.
- Removed overview prose, endpoint and adapter exposition, nested provider cards, usage reporting, and the about panel.
- Kept the real provider catalog, credential write, provider test, routing status, health check, and local port controls unchanged.
- Replaced segmented panels with a quiet text navigation, hairline dividers, compact statuses, and one primary action; the selected provider uses only a one-pixel marker.
- Preserved the existing Settings split layout, Preacherman mark, native window controls, and `Back to Settings` interaction.

## Evidence

- Dark appearance: `apps/preacherman-demo-host/output/ai-providers-minimal-dark-final.png` (1800 × 1000 px).
- Light contract check: `apps/preacherman-demo-host/output/ai-providers-minimal-light-final.png` (1800 × 1000 px); the authored Settings canvas intentionally remains black.
- Packaged desktop view: `apps/preacherman-demo-host/output/ai-providers-native-minimal-release.png` confirms the minimal Providers surface through the canonical shortcut.
- Packaged Keys interaction: `apps/preacherman-demo-host/output/ai-providers-native-minimal-keys-release.png` confirms tab switching and the credential form.
- Packaged return flow: `apps/preacherman-demo-host/output/ai-providers-native-back-minimal-release.png` confirms `Back to Settings` returns to the unchanged overview.
- Impeccable static detector: zero findings.
- Settings and AI Providers regression tests: passed, 9/9.
- TypeScript and Vite production build: passed.
- Full Tauri Release, canonical executable hash, shortcut launch, native window response, and process cleanup: passed.

final result: passed

# Settings detail return control — Design QA (latest)

## Visual truth

- Requested detail state: `D:\Temp\Administrator\codex-clipboard-a800e69b-0008-422b-b3f1-c8ceb54648e0.png` (1800 × 1000 px).
- Verified dark implementation: `apps/preacherman-demo-host/output/playwright/settings-back-detail-dark.png` (1800 × 1000 px).
- Verified light implementation: `apps/preacherman-demo-host/output/playwright/settings-back-detail-light.png` (1800 × 1000 px).
- Verified packaged Tauri Release: `apps/preacherman-demo-host/output/playwright/settings-back-native.png` (1800 × 1000 px).
- State: AI Providers detail opened from the first Settings card.

## Findings and correction

- Added one compact `Back to Settings` control at the bottom-left of the existing empty column.
- The source and implementation were inspected together at the same viewport. The original split layout, title, description, logo, desktop controls, spacing, and black canvas remain unchanged.
- The control uses the existing semantic Settings border, text, canvas, and focus tokens. Hover, active, keyboard-focus, and reduced-motion states are deliberate.
- Clicking the control closes the detail and restores focus to the card that opened it. The existing Escape-key return remains available.
- Both stored `dark` and `light` appearances were rendered and verified; the authored Settings canvas intentionally remains black in both modes.
- Microsoft Edge reported the existing hydration-mismatch diagnostic during each app bootstrap; the return flow itself produced no page error or interaction failure.

## Verification

- Settings regression tests: passed, 6/6.
- TypeScript: passed.
- Microsoft Edge interaction check: detail opened as `AI Providers`, button box measured 138 × 44 px at x=64/y=900, detail closed on click, and opener focus was restored.
- Packaged Tauri WebView check: passed with zero captured console errors; the same detail-close and focus-restoration flow passed through the canonical desktop shortcut.

final result: passed

# Gallery model camera push — Design QA (latest)

## Comparison target

- Source visual truth: `D:\Temp\Administrator\codex-clipboard-14196f97-c0ea-4c9e-a517-451c185963cf.png` (680 × 534 px).
- Rendered implementation: verified at device-pixel scale in Microsoft Edge after the native-camera correction (1800 × 1000 application viewport).
- CSS viewport: 1800 × 1000 at device scale factor 1 in Microsoft Edge.
- State: Gallery route, dark scene, navigation closed, persistent Cortana standby model.
- Density normalization: the source is a cropped composition reference rather than a full desktop frame. Comparison therefore uses normalized headroom, center alignment, portrait scale, and lower-body crop instead of a literal whole-frame pixel diff.

## Full-view and focused comparison evidence

- The source reference and final implementation were opened together in one comparison input.
- Both views center the same real Cortana model against an uninterrupted black field and crop the lower body around the thighs.
- The final implementation deliberately adds more headroom than the initial reference, following the user's latest direction so the face and complete silhouette read as the focal point instead of pressing against the top edge.
- The close view is now rasterized directly by WebGL from the nearer camera position. Facial contours, scanlines, torso edges, and circuitry no longer inherit interpolation blur from enlarging an already-rendered canvas.
- A separate focused crop was unnecessary because the model is the only page content and its head, shoulders, torso, hands, and lower crop are all clearly legible in the full-resolution comparison.

## Required fidelity surfaces

- Fonts and typography: Gallery contains no page typography; the persistent Preacherman mark and native window controls remain unchanged.
- Spacing and layout rhythm: the model remains centered. Its final head begins roughly 14% below the viewport top, with the enlarged portrait continuing beyond the lower edge near the thighs.
- Colors and visual tokens: the authored near-black stage and existing blue hologram grade remain unchanged in both appearance settings.
- Image quality and asset fidelity: the real animated GLB/WebGL model is retained at the existing high-quality DPR cap and antialiasing settings. The canvas remains at native scale; no raster substitute, placeholder, redrawn asset, or extra overlay was introduced.
- Copy and content: Gallery remains intentionally empty apart from the shared model and persistent desktop chrome.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- [P3] The supplied reference omits the full desktop chrome and uses a smaller crop, so its absolute horizontal proportions are not a valid whole-window measurement. The implementation preserves the required desktop logo and window controls and matches the requested model-focused portrait relationship.

## Comparison history

1. Initial push-in
   - Applied a 1.9× scene scale with a 760 ms exponential ease-out and 20% downward framing offset.
   - [P2] The head sat too close to the top edge and excess lower leg remained visible.
2. Reference alignment
   - Increased the downward offset to 27%, aligning the top margin to the supplied crop.
   - The user requested still more headroom to concentrate attention on the virtual person.
3. Final headroom correction
   - Increased the downward offset to 31% without changing scale or motion timing.
   - Post-fix evidence: `apps/preacherman-demo-host/output/playwright/gallery-camera-push-headroom.png`.
   - Repeated Home → Gallery → Home → Gallery navigation confirmed that the transform reverses and replays without remounting the model.
4. Native-camera sharpness correction
   - Removed the 1.9× CSS canvas transform that enlarged the completed raster image.
   - Recreated the approved composition with a true camera move from `(0, 0.94, 4.35)` to `(0, 1.29, 2.21)`, preserving approximately 14% headroom and the established 760/520 ms perceived timing.
   - Device-pixel inspection confirmed a sharper close view with no new camera or WebGL console errors. Reduced-motion users receive the same final framing without the transition.

## Primary interactions and verification

- Entering Gallery pushes the shared model from the full-body view into the close portrait over 760 ms.
- Leaving Gallery returns to the original full-body framing over 520 ms.
- Re-entering Gallery replays the push-in and preserves the empty Gallery surface.
- `prefers-reduced-motion` keeps the final framing while removing transition time.
- Gallery-focused regression tests passed; the production browser preview introduced no new Gallery console error. The one captured hydration error belongs to the unchanged, always-prewarmed Task portfolio iframe.

final result: passed

# Settings top-region clearing — Design QA

## Comparison target

- Source visual truth: `D:\Temp\Administrator\codex-clipboard-077f6568-f946-4216-913b-63d4ccd54866.png` (1788 × 239 px).
- Rendered implementation: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-cleared-top-final.png` (1800 × 240 px).
- Full implementation view: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-cleared-full.png`.
- Dark-mode verification: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-cleared-top-dark.png`.
- CSS viewport: 1800 × 1000 at device scale factor 1 in Microsoft Edge.
- State: Settings route, page scroll position 0, reference Grid view.

## Full-view and focused comparison evidence

- The source and implementation top-band images were inspected together in one comparison input.
- The unwanted Gil header, Settings summary card, and Capabilities trigger are absent throughout the requested top band.
- The Preacherman logo remains at its prior upper-left position and all three persistent window controls remain at their prior upper-right position.
- A separate focused crop was unnecessary because the complete requested region is only 240 px tall and both preserved control groups are clearly legible at 1:1 density.

## Required fidelity surfaces

- Fonts and typography: no remaining text exists in the cleared region; typography below the region and inside the reference site is unchanged.
- Spacing and layout rhythm: the reference header uses `visibility: hidden`, so its DOM geometry is retained. The first project remains at y=500 before and after the change.
- Colors and visual tokens: the region is pure black in both light and dark appearance modes. The embedded scrollbar keeps its 15 px layout width but is visually black, avoiding horizontal reflow.
- Image quality and asset fidelity: the real Preacherman logo asset and native window-control assets remain unchanged; no asset was redrawn.
- Copy and content: only the explicitly requested Gil header and two host overlays were removed from view. All lower-page project content and copy remain present.

## Findings

- No actionable P0, P1, or P2 findings remain.
- The browser console still reports three pre-existing errors from the always-mounted Task Lookback and Gallery runtimes. No error originates from Settings or `settings-template`.

## Comparison history

1. Initial state
   - The top band contained the Gil header, Settings summary toolbar, Capabilities trigger, Preacherman logo, and window controls.
2. First clearing pass
   - Removed the two Settings host overlays from the Settings route.
   - Hid the reference site's `.js-sh` header without removing its layout node.
   - [P2] The native iframe scrollbar remained white in the otherwise black band.
3. Final clearing pass
   - Kept the scrollbar's 15 px geometry but made its track and thumb visually black/transparent.
   - Post-fix evidence confirms a continuous black field with only the logo and three window controls visible.

## Primary interactions tested

- Mouse wheel moved the embedded page from scrollY 0 to 1124.
- All 84 project entries remain mounted.
- Scroll was restored to 0 after verification.
- The lower content remains 5487 px tall and the first project remains at y=500.
- Light and dark appearance modes both preserve the same pure-black top band.

## Verification

- Settings regression tests: passed, 7/7.
- TypeScript: passed.
- Production build: passed.

final result: passed

# Settings full-site transplant — Design QA

## Comparison target

- Source visual truth: `C:\Users\Administrator\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\e8475b30-0948-4d03-9747-87d724ce1764\RECON\screenshots\clone-1440.png`.
- Rendered implementation: pending browser-rendered capture of `http://127.0.0.1:1420/__surfaces/settings`.
- Intended viewport: 1440 CSS pixels wide at device scale factor 1, matching the source capture width.
- State: initial portfolio index inside the desktop Settings surface; persistent Preacherman logo and window controls above the embedded page.

## Evidence available

- The complete local reference bundle was copied into `apps/preacherman-demo-host/public/settings-template`: 385 files, 58.72 MB.
- SHA-256 verification found 376 byte-identical files and nine text files changed only for the nested `/settings-template/` base path and local texture, sound, Basis, and route asset paths.
- Production build contains the same 385 reference files.
- Direct HTTP checks pass for the root document, Nuxt runtime, favicon, and each nested route document.
- The reference is hosted in an unsandboxed same-origin iframe so its authored JavaScript, WebGL, scrolling, hover states, buttons, media, and route transitions remain available.

## Required fidelity surfaces

- Fonts and typography: the original Lay Grotesk files and authored CSS are copied unchanged; visual confirmation is pending.
- Spacing and layout rhythm: the original HTML and CSS are copied unchanged into a full-surface iframe; same-viewport visual confirmation is pending.
- Colors and visual tokens: the original pure-black canvas and white foreground are unchanged. The surrounding Settings surface deliberately resolves to pure black in both light and dark appearance modes.
- Image quality and asset fidelity: every copied image, video, texture, sound, Basis transcoder asset, and Nuxt chunk is present; no visible asset was recreated or substituted.
- Copy and content: original page copy is unchanged apart from invisible local path prefixes.

## Findings

- [P1] Browser-rendered visual and interaction evidence is not yet available.
  - Location: Settings iframe and its route/hover/scroll states.
  - Evidence: build, file-integrity, and HTTP checks pass, but a real browser screenshot and console capture have not yet been taken.
  - Impact: exact visual fidelity and runtime interaction parity cannot be signed off from files alone.
  - Fix: after user approval, capture the source and implementation at the same viewport in Edge, combine them for comparison, exercise scroll/hover/navigation, and check console errors.

## Comparison history

1. Initial transplant
   - Removed the attempted Settings-specific category redesign.
   - Replaced the Settings body with the complete reference site in a full-size same-origin iframe.
   - Preserved the persistent desktop logo and controls and hid the unrelated 3D scene.
2. Static verification
   - TypeScript passed.
   - Targeted Settings regression tests passed, 7/7.
   - Production build passed.
   - Full repository tests still contain unrelated pre-existing failures; no new failure appeared in the targeted Settings suite.

## Implementation checklist

- Capture the reference and embedded implementation at the same viewport.
- Compare full view and typography/media-focused regions in one combined image.
- Test wheel scrolling, hover responses, primary page navigation, and route return behavior.
- Check network failures and browser console errors.

final result: blocked

# Cortana standby hand-layering correction — Design QA

## Scope and visual truth

- User clipping reference: `D:\Temp\Administrator\codex-clipboard-9cb37520-db49-4c83-98ba-8be514d66a6a.png`.
- Final dark front view: `E:\figma\output\playwright\cortana-hands-final-2-dark-front.png`.
- Final dark hand crop: `E:\figma\output\playwright\cortana-hands-final-2-dark-front-crop.png`.
- Final dark side checks: `E:\figma\output\playwright\cortana-hands-final-2-dark-side-a.png` and `E:\figma\output\playwright\cortana-hands-final-2-dark-side-b.png`.
- Final light front view: `E:\figma\output\playwright\cortana-hands-final-2-light-front.png`.
- Final Tauri Release: `E:\figma\output\playwright\cortana-hands-final-tauri-release.png`.
- Final Tauri Release hand crop: `E:\figma\output\playwright\cortana-hands-final-tauri-release-crop.png`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.

## Findings and correction

- The prior pose drove both hands toward one center point. The fingertips crossed and the upper thumb/index silhouette formed an unnatural closed ring.
- The corrected pose keeps the forearms converging naturally while placing the two palms in a shallow front/back stack.
- The four visible fingers now run in a quiet horizontal overlap. The upper thumb rests diagonally above the index with a small depth offset instead of closing into a ring or intersecting the other hand.
- Front and both side views were visually inspected. The hands read as touching and layered; no visible palm, finger, wrist, thigh, or abdomen intersection remains.
- The avatar material, texture bindings, shader grade, lighting rig, world-fixed-light hierarchy, camera, drag controls, legs, and Gallery UI were not changed in this pass.
- Dark and light appearances both loaded the full textured model. Microsoft Edge reported zero console errors in the accepted views; one existing Three.js/WebGL warning remained.

## Verification

- Avatar renderer typecheck/build/tests: passed, 11/11 tests.
- Demo Host typecheck/build/tests: passed, 40/40 tests.
- Tauri Release build and isolated WebView smoke test: passed; model load state reached `ready` with zero captured console errors.
- Added a regression assertion for the shallow front/back hand stack and relaxed upper thumb target.

final result: passed

# Cortana blended ground correction — Design QA

## Scope and evidence

- Final dark front view: `E:\figma\output\playwright\cortana-ground-dark-candidate-2.png`.
- Final light front view: `E:\figma\output\playwright\cortana-ground-light-candidate-2.png`.
- Final light side view: `E:\figma\output\playwright\cortana-ground-light-side.png`.
- Existing zoom interaction check: `E:\figma\output\playwright\cortana-ground-light-zoom.png`.
- Final Tauri Release: `E:\figma\output\playwright\cortana-ground-tauri-release.png`.
- Acceptance viewport: 1800 x 1000 CSS pixels in Microsoft Edge.

## Findings and implementation

- The model foot baseline and ground center both resolve to approximately page y=900 at the default camera, removing the prior floating read.
- The existing Gallery ground node is now enabled behind the transparent WebGL canvas. No second Three.js scene, floor mesh, model translation, or camera offset was introduced.
- A concentrated contact gradient directly under the feet and a broader low-opacity plane gradient create a readable support surface without a hard ellipse, platform edge, or game-style hologram pedestal.
- Light mode uses a restrained blue-gray contact shadow. Dark mode uses the same shape with a low-intensity cool-blue lift so it blends with the code-rain background.
- Front, side, and existing zoom states were visually inspected. The feet remain visually attached to the ground while the model rotates independently above the fixed support plane.
- The avatar model, hand pose, material, shader, texture bindings, light rig, camera, controls, and Gallery navigation were unchanged in this pass.
- Microsoft Edge reported zero console errors in both accepted theme states; one existing Three.js/WebGL warning remained.

## Verification

- Avatar renderer typecheck/build/tests: passed, 11/11 tests.
- Demo Host typecheck/build/tests: passed, 40/40 tests.
- Tauri Release build and isolated WebView smoke test: passed; model load state reached `ready`, the ground resolved to `display: block`, and zero console errors were captured.
- Theme regression coverage now requires both ground tokens and the enabled Gallery ground layer.

final result: passed

# Settings top-region clearing — Design QA (latest)

## Comparison target

- Source visual truth: `D:\Temp\Administrator\codex-clipboard-077f6568-f946-4216-913b-63d4ccd54866.png` (1788 × 239 px).
- Rendered implementation: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-cleared-top-final.png` (1800 × 240 px).
- Full implementation view: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-cleared-full.png`.
- Dark-mode verification: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-cleared-top-dark.png`.
- CSS viewport: 1800 × 1000 at device scale factor 1 in Microsoft Edge.
- State: Settings route, page scroll position 0, reference Grid view.

## Full-view and focused comparison evidence

- The source and implementation top-band images were inspected together in one comparison input.
- The unwanted Gil header, Settings summary card, and Capabilities trigger are absent throughout the requested top band.
- The Preacherman logo remains at its prior upper-left position and all three persistent window controls remain at their prior upper-right position.
- A separate focused crop was unnecessary because the complete requested region is only 240 px tall and both preserved control groups are clearly legible at 1:1 density.

## Required fidelity surfaces

- Fonts and typography: no remaining text exists in the cleared region; typography below the region and inside the reference site is unchanged.
- Spacing and layout rhythm: the reference header uses `visibility: hidden`, so its DOM geometry is retained. The first project remains at y=500 before and after the change.
- Colors and visual tokens: the region is pure black in both light and dark appearance modes. The embedded scrollbar keeps its 15 px layout width but is visually black, avoiding horizontal reflow.
- Image quality and asset fidelity: the real Preacherman logo asset and native window-control assets remain unchanged; no asset was redrawn.
- Copy and content: only the explicitly requested Gil header and two host overlays were removed from view. All lower-page project content and copy remain present.

## Findings

- No actionable P0, P1, or P2 findings remain.
- The browser console still reports three pre-existing errors from the always-mounted Task Lookback and Gallery runtimes. No error originates from Settings or `settings-template`.

## Comparison history

1. Initial state
   - The top band contained the Gil header, Settings summary toolbar, Capabilities trigger, Preacherman logo, and window controls.
2. First clearing pass
   - Removed the two Settings host overlays from the Settings route.
   - Hid the reference site's `.js-sh` header without removing its layout node.
   - [P2] The native iframe scrollbar remained white in the otherwise black band.
3. Final clearing pass
   - Kept the scrollbar's 15 px geometry but made its track and thumb visually black/transparent.
   - Post-fix evidence confirms a continuous black field with only the logo and three window controls visible.

## Primary interactions tested

- Mouse wheel moved the embedded page from scrollY 0 to 1124.
- All 84 project entries remain mounted.
- Scroll was restored to 0 after verification.
- The lower content remains 5487 px tall and the first project remains at y=500.
- Light and dark appearance modes both preserve the same pure-black top band.

## Verification

- Settings regression tests: passed, 7/7.
- TypeScript: passed.
- Production build: passed.

final result: passed

# Settings direct-entry loading bypass — Design QA (latest)

## Comparison target

- Source visual truth: `D:\Temp\Administrator\codex-clipboard-9dabb4b6-db6b-4933-8eaa-26ea11bd9548.png` (1800 × 1000 px).
- Rendered implementation: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-direct-entry-final.png` (1800 × 1000 px).
- Dark-mode verification: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-direct-entry-dark.png` (1800 × 1000 px).
- CSS viewport: 1800 × 1000 at device scale factor 1 in Microsoft Edge.
- State: Settings route at scroll position 0, 800–1200 ms after route entry.

## Full-view and focused comparison evidence

- The source and implementation screenshots were opened together in one comparison input at identical pixel dimensions.
- The source's blocking `10%` WebGL preload state is absent. The actual project grid is already visible in the implementation while the requested pure-black top region remains intact.
- The source's FPS/GPU/CPU overlay is absent from the rendered Settings document.
- A focused crop was unnecessary because the failure and its correction are clearly readable in the full 1800 × 1000 comparison.

## Required fidelity surfaces

- Fonts and typography: the reference site's original font, weights, sizing, labels, and numeric project indices render unchanged after direct entry.
- Spacing and layout rhythm: the existing top clearance, project grid, first-row baseline, and 5487 px document height are preserved.
- Colors and visual tokens: the top field remains pure black in both light and dark host appearances; the embedded content keeps its original black/white palette.
- Image quality and asset fidelity: the original local project images render directly; no visible asset was replaced, redrawn, or approximated.
- Copy and content: all 84 project entries remain mounted; only the loading/debug state was removed.

## Findings

- No actionable P0, P1, or P2 findings remain.
- Three pre-existing console errors originate from the always-mounted Task Lookback and Gallery runtimes. No accepted-view error originates from Settings or `settings-template`.

## Comparison history

1. Initial state
   - The desktop WebView enabled the reference site's `has-gl` path, showed `10%`, and never reached the project grid.
2. Final state
   - The copied reference entry points now opt out of `has-gl` before the Nuxt runtime starts.
   - The iframe load handler removes the class again as a defensive fallback.
   - Post-fix evidence shows the project grid immediately with no percent or performance labels.

## Primary interactions tested

- Mouse-wheel input moved the embedded page to scrollY 1125 of a 4487 px scroll range.
- All 84 project entries remain mounted and the document height remains 5487 px.
- The reference header remains hidden and the persistent Preacherman logo/window controls remain visible.
- Light and dark host appearances both enter without a loader.

## Verification

- Settings regression tests: passed, 7/7.
- Browser direct-entry checks: passed in Microsoft Edge.

final result: passed

# Settings native code reconstruction — Design QA (latest)

## Comparison target

- Source visual truth: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-direct-entry-final.png` (1800 × 1000 px), captured from the supplied Gil Huybrecht reference before its runtime copy was removed.
- Rendered implementation: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-native-final-light.png` (1800 × 1000 px).
- Dark-mode verification: `D:\preacherman\apps\preacherman-demo-host\output\playwright\settings-native-final-dark.png` (1800 × 1000 px).
- CSS viewport: 1800 × 1000 at device scale factor 1 in Microsoft Edge.
- State: Settings route, scroll position 0, 1500 ms after native route entry.

## Full-view and focused comparison evidence

- The source and final implementation screenshots were opened together in one comparison input at identical dimensions and density.
- The first project begins at x=16.796875, y=500 with a 237.9375 px card width and the complete native document remains 5487 px tall, matching the measured reference values.
- The project order, headings, indices, 14-column grid, image crops, pure-black top region, Preacherman logo, and persistent window controls align with the source.
- The autoplay video cards can show different frames at capture time; this is expected motion-state variation, not asset drift.
- The first visible two grid rows were legible at full resolution, so a separate crop was not needed.

## Required fidelity surfaces

- Fonts and typography: the original Lay Grotesk Medium font is bundled locally and used at the reference's responsive root scale, weight, line height, and antialiasing.
- Spacing and layout rhythm: the 14-column desktop grid, 16.8 px gaps, 90 px row rhythm, 500 px first-content offset, card aspects, footer spacing, and 5487 px document height match the reference measurements.
- Colors and visual tokens: Settings uses semantic `--demo-theme-settings-*` tokens; both light and dark host appearances intentionally resolve this authored page to pure black with white content.
- Image quality and asset fidelity: all 76 images and 8 videos are the original local files. All 84 runtime asset references exist, and no visible image was redrawn or approximated.
- Copy and content: all 84 entries, 19 project groups, numbering, footer links, newsletter copy, form fields, and legal note are present.
- Interactions and accessibility: wheel scrolling, autoplay/loop/muted video, media fade-in, newsletter open/close, Escape dismissal, form submission, semantic dialog markup, reduced-motion support, and persistent desktop controls were verified.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- The only capture variance is the exact frame shown by autoplaying videos.

## Comparison history

1. Previous implementation used a copied Nuxt site inside an iframe.
2. Native reconstruction replaced it with React/TypeScript/CSS, local media, and generated typed content data.
3. The old `public/settings-template` runtime and extraction helper were removed after asset and layout verification.
4. Final same-viewport comparison found no P0/P1/P2 mismatch; no additional visual correction was required after the final capture.

## Primary interactions tested

- Mouse wheel moved the native Settings scroller from 0 to 1100 within a 4487 px scroll range.
- 84 cards, 76 images, and 8 videos mounted; the page issued zero `settings-template` resource requests.
- No percent loader or FPS/GPU/CPU text appeared.
- Light and dark appearance modes both retained the black canvas, 84 cards, logo, and three window controls.
- Newsletter trigger, modal, fields, submit state, backdrop close, and Escape close were exercised.
- Browser console: zero errors in both final appearance checks.

## Verification

- Settings/theme regression tests: passed, 11/11.
- TypeScript and production build: passed.
- Native asset audit: 84/84 references present; old mirror absent.

final result: passed

# Task first-entry Timeline cards — Design QA (latest)

## Visual truth

- Reported empty first-entry state: `D:\Temp\Administrator\codex-clipboard-1c12a949-37ef-4d3f-a74b-013f2a07a563.png`.
- Prohibited loading state: `D:\Temp\Administrator\codex-clipboard-96662fe8-736d-435c-82dc-87b98fc9f03b.png`.
- Verified implementation: `apps/preacherman-demo-host/output/task-first-entry/17-final-task-8000ms.png`.
- Side-by-side comparison: `apps/preacherman-demo-host/output/task-first-entry/comparison-before-after.png`.

## Checks

- The visible `Opening The Lookback Timeline…` spinner and copy never appear.
- A fresh shortcut launch reaches Timeline cards without any user Surf interaction.
- The embedded Surf warm-up remains clipped inside the unopened Task aperture and is not exposed to the user.
- Timeline returns through its original route transition, preserving the authored card motion and animated media.
- The persistent Cortana scene, Task navigation, desktop controls, spacing, and source card assets remain unchanged.
- The full 413-test suite covers the light/dark semantic theme contract and passes.

final result: passed

# AI Providers CC Switch settings adaptation — Design QA (historical)

## Comparison target

- Source visual truth: `apps/preacherman-demo-host/output/settings-reference-audit/cc-switch-settings.png` (914 × 639 px).
- Rendered implementation, dark: `apps/preacherman-demo-host/output/ai-providers-dark-v2.png` (1800 × 1000 px).
- Rendered implementation, light contract check: `apps/preacherman-demo-host/output/ai-providers-light-v3.png` (1800 × 1000 px).
- Same-density focused comparison: `apps/preacherman-demo-host/output/ai-providers-comparison.png`; the implementation's 914 × 639 right-side content crop is placed beside the 914 × 639 CC Switch source.
- State: Settings → AI Providers → General, with the live local service returning two registered, unconfigured providers.

## Design translation

- Preserved the CC Switch information hierarchy: compact page heading, six-part segmented navigation, clear section headings, grouped controls, bordered configuration surfaces, and a single blue active state.
- Adapted the source's application-level preferences into Preacherman's actual provider workflow instead of copying irrelevant language, theme, and home-app choices into AI Providers.
- Preserved the existing Preacherman detail split, top-left mark, native window controls, and bottom-left `Back to Settings` behavior.
- The authored Settings canvas intentionally remains black in both stored appearance modes; all new chrome uses the semantic `--demo-theme-settings-*` tokens required by the application theme contract.

## Functional surfaces

- `General` reads the real provider catalog and status, switches between DeepSeek and DashScope, refreshes state, and exposes provider testing only when the selected provider is ready.
- `Routing` reflects the live first-party Chat, ASR, TTS, and Vision provider assignments.
- `Authentication` writes new credentials to the existing local service without ever reading a secret value back into the interface.
- `Advanced` validates and switches the local-service port only after a successful health check.
- `Usage` honestly reports only connection checks performed in the current session; it does not fabricate token or cost statistics.
- `About` explains the existing local-first runtime and restricted credential storage.

## Findings

- No actionable P0, P1, or P2 visual or interaction findings remain.
- [P3] The source is a standalone 914 px settings window, while the implementation occupies the right 63.5% of the existing 1800 px Preacherman detail layout. The focused comparison normalizes the content width; the blank left column is an intentional retained product surface, not a fidelity defect.
- [P3] DeepSeek and DashScope are currently unconfigured, so the accepted General state shows `0 connected · 2 registered` and disables the provider test button until credentials are supplied.

## Verification

- Settings and AI Providers regression tests: passed, 9/9.
- TypeScript and Vite production build: passed.
- Local-service health, provider catalog, and provider-settings reads: passed; two providers returned and zero secret-like fields were exposed.
- Dark and light appearance entry states rendered with readable controls and the same deliberate black Settings canvas.
- Packaged Tauri Release: `apps/preacherman-demo-host/output/ai-providers-native-detail-v2.png` confirms the General page and live DashScope model list through the canonical desktop shortcut.
- Native Authentication interaction: `apps/preacherman-demo-host/output/ai-providers-native-authentication.png` confirms the tab click, provider selector, password visibility control, workspace field, and save action render in the packaged app.
- Native `Back to Settings` returned to the existing overview. The new Demo/WebView2 process tree was then closed normally; all eight WebView2 descendants exited and port 1420 remained free.

final result: passed

# AI Providers right-panel refinement — 2026-09-05

- Scope: refine existing controls only. Original 36.5% / 63.5% split, one-pixel divider, blank left column, bottom-left return, and right content origin remain unchanged. At 1800px the right column starts at x657.
- Impeccable guided a bounded, reference-led refinement; independent final visual review passed. CC Switch reference informed grouped tabs and clear configuration actions, not the outer layout.
- Existing four areas remain Providers, Credentials, Routing, and Advanced. No new backend capabilities or fabricated usage statistics were added.
- Readable labels, shorter copy, grouped masked credential fields, keyboard tab navigation, and distinct Save/Test busy states preserve the existing service APIs.
- TypeScript and focused Settings / AI Providers tests: passed (9/9).
- Browser checks covered both stored appearances, Configure, empty credential validation, reveal/remask, four routing capabilities, Advanced, keyboard navigation, narrow viewport, and Back. Final screenshots: `apps/preacherman-demo-host/output/playwright/providers-refresh-dark.png` and `dashscope-refresh-dark.png` (light counterparts alongside). Both keep the deliberately black authored Settings canvas.
- No live credential write or billable provider test was performed; credentials remain user-supplied.
- Native delivery verification is recorded in `apps/preacherman-demo-host/desktop-build-manifest.json`.

# AI Providers inline CC Switch flow — 2026-09-05

- User correction: configuration must be immediately understandable, with provider selection and credentials in one place. The original Settings outer split, x657 divider, left blank, Back, and other pages remain untouched.
- Adapted CC Switch's MIT ApiKeyInput and ProviderPresetSelector components. Removed upstream app-specific dependencies and unsupported presets; kept controlled masked input and preset-to-inline-form interaction. Bundled attribution: `apps/preacherman-demo-host/public/licenses/cc-switch.txt`.
- The first viewport presents DeepSeek / DashScope presets, the selected provider's credential fields, Save & test, and Save only. Existing models, routing and local-service port are preserved under Advanced settings.
- Real API contract unchanged. Save & test awaits successful credential persistence before testing. A failed save retains the draft and never starts a test. A test failure after saving explicitly says the configuration was saved. Existing saved keys are never read back or overwritten by a blank field.
- DashScope workspace-only submission without any new or previously configured key is blocked. Workspace requirement for speech recognition is explained at the field; synthesis does not require it.
- TypeScript and focused source regression: 10/10 passed. Mechanical design detector: no findings.
- Batched browser screenshots: `output/playwright/inline-deepseek-dark.png`, `inline-dashscope-dark.png`, light counterparts and `inline-mobile.png`. Both appearance preferences retain the intentional authored black settings canvas.
- Browser fixture tests passed: save failure, PUT-before-POST, explicit saved/test-failed state, test saved credentials without rewriting them, Save only without testing, workspace validation, secret remasking, Advanced and Back. All test writes were intercepted synthetic fixtures; no user credentials were written and no billable provider call was made.
- Native delivery evidence and hashes are recorded in the desktop build manifest.

# Task metadata first template — 2026-09-05

- User confirmed only Nathan Riley, not Casa Di Solare. Impeccable's scoped-extension guidance preserves the authored sheet, two-column geometry, close interaction, shared companion, and other cards.
- The former creator heading is now an inline editable task name. Enter/blur saves locally by stable card slug, Escape cancels, blank edits preserve the previous name, and Chinese IME composition does not accidentally commit. Storage failures are visible.
- The biography is replaced by the honest empty task summary. No generated summary, conversation input, Codex execution, or fabricated task state is added in this step.
- The selected detail does not instantiate the original image stack, external-link pill, year/tags, awards, or scroll progress indicator. Original card artwork and other details remain unchanged.
- TypeScript and 10 focused Task metadata / Gallery regression tests passed. Mechanical detector returned no findings. Independent review identified focus contrast on the authored light sheet; the focus outline now uses the semantic dark text color in either preference.
- Browser screenshots confirmed the first entry and edited title. End-to-end browser runs encountered existing preview cold-load timing and retained-route selectors; final packaged native verification and its exact results are recorded in the desktop build manifest, not inferred from those partial browser runs.
