# Remove Workspace Orbits Design

## Goal

Remove the two large ellipse tracks and all four orbit nodes from the current Workspace surface so its center is empty and ready for a future design.

## Scope

This change applies only to the Workspace surface for Figma frame `281:538`.

Remove:

- The two Workspace ellipse tracks.
- The four Workspace orbit-node visuals and hit targets.
- Their animation, hover/focus pause behavior, depth switching, click dispatch, and `demo.orbit-node.select` command helper.
- Workspace-only orbit geometry, renderer components, CSS, and tests that require those elements.

Preserve:

- The Workspace surface container and its manifest mapping/fallback behavior.
- Persistent bottom navigation, window chrome, theme behavior, and every other page element.
- Home and State page orbit designs and their interactions.
- Existing localized Figma assets and manifests, including audited `281:538` orbit/halo source assets. They remain as source evidence and are not rendered by Workspace.
- All pre-existing working-tree changes outside this deletion boundary.

## Architecture

`WorkspaceConversationSurface` will render only its existing semantic `section` container. The obsolete `StateVessel`, `OrbitLayer`, and `orbitGeometry` modules will be deleted rather than hidden so no animation frame, pointer target, or bridge dispatch remains alive off-screen.

The Workspace-only orbit CSS block will be removed. Shared or similarly named orbit styles belonging to Home and State surfaces will not change.

## Behavior

The Workspace center becomes visually and interactively empty. Keyboard focus and pointer navigation can no longer reach the four removed nodes. No replacement artwork or placeholder is introduced.

## Test Strategy

TDD will first change the Workspace architecture regression tests to require:

1. `WorkspaceConversationSurface` contains no `StateVessel` or `OrbitLayer` rendering.
2. Workspace source contains no `data-orbit-*` hit targets or `demo.orbit-node.select` command.
3. Workspace CSS contains no `pm-workspace__orbit-*` rules.
4. The removed Workspace component and geometry files no longer exist.
5. Home and State orbit source remains present and unchanged.

The new assertions must fail against the current implementation before production files are removed. After implementation, run the targeted tests, the complete Surface Skin check, Demo Host build, and formal Tauri production build.

## Local Preview

After verification, copy the Tauri CLI production binary to the stable shortcut target, refresh the desktop shortcut, launch it normally, and keep the working application window open. The binary must load `http://tauri.localhost/`, not the Vite development URL.

## Git

Do not push. Do not stage or commit implementation files unless separately requested. The standalone design document may be committed without including existing working-tree changes.
