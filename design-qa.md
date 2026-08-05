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
