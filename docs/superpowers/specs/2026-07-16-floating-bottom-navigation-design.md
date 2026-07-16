# Floating Bottom Navigation Design

## Goal

Turn the existing seven-item bottom navigation into one persistent floating panel shared by every implemented Preacherman surface. The panel must not touch the window edge and must appear only while the pointer is in the bottom reveal area or while a navigation item has keyboard focus.

## Scope

- Keep all seven existing entries together: Home, Workspace, Lab, State Gallery, Test Zone, State Ledger, and Settings.
- Reuse the existing `BottomNavigation` component on Home, Workspace, and future implemented surfaces.
- Keep every existing label, command, dispatch path, active state, and semantic button unchanged.
- Preserve the fixed 1440 by 900 acceptance baseline.
- Do not add routes, product pages, assets, network access, or Tauri dependencies.

## Structure

`BottomNavigation` will render one screen-anchored reveal zone containing the existing semantic `nav` element. The reveal zone owns visibility behavior; the `nav` remains the single visual panel and contains all seven buttons.

The reveal zone is positioned at the bottom of the shared surface shell so page content does not reflow when the navigation appears. Because all implemented surfaces already reuse `BottomNavigation`, the interaction remains identical across page changes.

## Layout and Visual Treatment

- Reveal zone: full surface width and approximately 88 pixels high, anchored to the bottom edge.
- Floating panel: 820 pixels wide, approximately 50 pixels high, horizontally centered.
- Bottom clearance: 16 pixels between the panel and the window edge.
- Shape: one rectangular panel with a 14-pixel radius on all four corners.
- Surface: retain the existing warm navigation background and subtle border.
- Elevation: add a small, soft downward shadow so the panel reads as detached from the page.
- The seven entries remain in their current order and distribute within the 820-pixel panel.

## Interaction

- Default state: the panel is visually hidden and does not intercept pointer input.
- Reveal: entering the bottom reveal zone shows the complete panel.
- Hide: leaving the reveal zone hides the complete panel without a dwell delay.
- Motion: a short opacity and upward-translation transition, approximately 180 milliseconds.
- Keyboard: `:focus-within` keeps the panel visible while a navigation button is focused.
- The reveal zone itself is invisible and must not introduce a visible strip, layout shift, or scrollbar.

CSS `:hover` and `:focus-within` are preferred over React pointer state because the behavior is purely presentational and deterministic. No page-level mouse tracking or new shared state is required.

## Testing and QA

- Add a failing architecture test before implementation that requires one reveal-zone wrapper and one seven-item navigation panel.
- Assert the CSS contract for 820-pixel width, 16-pixel bottom clearance, four-corner radius, shadow, hidden default state, and hover/focus reveal selectors.
- Run Surface Skin typecheck, build, and all tests.
- Run Demo Host typecheck, build, and all tests.
- Rebuild the standalone Tauri executable.
- Verify at 1440 by 900 that the panel is absent outside the bottom region, appears as one floating panel inside the region, remains usable across implemented screens, and introduces no console errors.

## Non-goals

- No responsive rules.
- No changes to navigation destinations or backend behavior.
- No new animation outside this explicitly requested reveal transition.
- No changes to contracts, backend handoff, workflows, Figma, or unrelated page styling.
