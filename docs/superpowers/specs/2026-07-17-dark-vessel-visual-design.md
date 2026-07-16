# Dark Vessel Visual Correction Design

## Objective

Correct the central Preacherman state vessel in Dark appearance without changing its interaction model, orbit geometry, animation timing, or navigation behavior. Remove the shared Alive status control from every implemented Home and Workspace surface.

## Source of truth

- The user-supplied `296 × 671` SVG is the source asset for the central human figure.
- Its embedded raster is localized into the repository; runtime code must not read the attachment path or any temporary URL.
- The source asset remains unchanged. Theme variants are derived from it without redrawing, cropping, stretching, or changing its internal geometry.
- The existing `592 × 1342` `281-538/human.png` is not treated as the authoritative visual for this correction because it is not byte-identical to the supplied source.

## Selected approach

Use explicit local theme variants rather than runtime CSS inversion:

- Light human: the supplied source recolored to black/deep-gray linework while preserving its original alpha and internal tonal hierarchy.
- Dark human: the same source recolored to white/silver-gray linework, centered on `#D7D9D8`, while preserving alpha and internal tonal hierarchy.
- The variants remain exactly `296 × 671` in layout and use the source aspect ratio.
- Asset generation is deterministic and performed during implementation; no online tools or runtime image processing are introduced.

This approach avoids the opaque white silhouette produced by the current occluder filter and keeps rendering consistent in Windows WebView2.

## Human and orbit layering

The existing front/back orbit illusion remains intact:

1. Back orbit arcs render behind the human.
2. A human-shaped occlusion mask uses the current theme canvas color, so it hides back arcs without becoming a visible silhouette.
3. The visible theme-specific human renders above the occlusion mask.
4. Front orbit arcs and front-layer nodes render above the human where the existing geometry calculation requires them.

The occlusion mask must not use the current hard-coded warm-white RGB intercepts in Dark appearance. Its fill follows the active canvas color.

## Orbit tracks

- Light: retain the current black track color.
- Dark: use white track color while preserving the existing per-orbit opacity difference.
- Preserve both ellipse definitions, dimensions, phase offsets, directions, durations, sampled paths, front/back segmentation, and reduced-motion behavior.
- Do not introduce a second animation implementation for Dark appearance.

## Four orbit nodes

- Light: retain the existing local halo assets and visual treatment.
- Dark: use local neutral-gray variants of the memory and skill node assets.
- Dark node base color is approximately `#8E9290`, with a restrained lighter silver-gray highlight.
- Preserve the four semantic node IDs, positions, opposite-node phase relationship, hit areas, labels, hover/focus scale, orbit pause behavior, depth ordering, and bridge commands.

## Alive removal

Remove `TopLiveStatus` from every implemented surface that currently renders it:

- Home flow surfaces
- Workspace conversation surface

Remove the `Alive` label, green trigger, breathing animation, empty popover, outside-click handler, Escape handler, and now-unused status styles and tests. Do not place a replacement element at the top center.

## Theme boundary

Theme selection remains owned by Demo Host. Surface Skin remains independent from Tauri and network APIs. The active appearance is communicated through the existing persistent host-shell theme boundary; no separate routing or state machine is added.

## Unchanged behavior

- Orbit requestAnimationFrame loop
- Orbit speed, direction, tilt, and geometry
- Front/back node and track layering calculations
- Node hover, focus, click, and pause behavior
- SurfaceHostBridge commands
- Home conversation triggers and page transitions
- Bottom navigation
- Window dragging and resizing
- Intro animation
- Contracts, backend handoff, and GitHub workflows

## Verification

Implementation is accepted only when all of the following are true:

1. Light shows the source-derived black/deep-gray human, black tracks, and existing Light node treatment.
2. Dark shows the source-derived white/silver-gray human without an opaque white silhouette.
3. Dark shows both tracks in white and all four nodes in neutral gray.
4. Back tracks remain occluded by the human while front tracks remain visible.
5. Node hover/focus still pauses the correct orbit, and blur/mouse-leave resumes it.
6. All four node bridge commands and hit areas remain unchanged.
7. Alive and its popover are absent from all implemented Home and Workspace surfaces.
8. Surface Skin typecheck, targeted vessel tests, orbit geometry tests, and Demo Host build pass.
9. A current Tauri release opens through the desktop shortcut with no temporary asset URL or generated tracked artifact.

## Scope

Only the central human theme assets/rendering, orbit and node theme visuals, Alive removal, directly related tests, and the local shortcut release are in scope. No other page design or interaction is changed.
