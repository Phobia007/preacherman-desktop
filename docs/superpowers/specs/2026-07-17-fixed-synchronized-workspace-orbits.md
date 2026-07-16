# Fixed Synchronized Workspace Orbits Design

## Goal

Keep both large Workspace ellipse tracks permanently fixed in the approved visual pose while their four existing small nodes travel around the tracks. Both tracks complete one revolution in the same amount of time. The two nodes on each track remain diametrically opposite.

## Scope

Only the Workspace orbit geometry, orbit renderer timing constants, and directly related tests change. Existing node artwork, light/dark theme behavior, bridge commands, hover/focus pause behavior, front/back depth switching, and all other Workspace elements remain unchanged.

## Geometry

Each orbit keeps its current center and radii. The track orientation is fixed at the orbit definition's intended design tilt:

- `slow`: `-8deg`
- `secondary`: `13deg`

Track SVG paths are derived from these fixed tilt values and therefore return identical path data at every animation frame.

The node phase is the only time-varying geometric value. At elapsed time zero, the two nodes on each orbit use phase offsets `0` and `Math.PI`, placing their centers at the two opposite major-axis endpoints of the rotated ellipse. At every later time they remain separated by exactly `Math.PI`.

## Timing

Both orbit definitions use one shared revolution duration. A single `requestAnimationFrame` loop supplies the same frame delta to the two existing elapsed-time counters, so both tracks have the same cycle time and normal running speed.

The existing per-orbit hover/focus pause remains intact: pausing one orbit does not pause the other. After resuming, it continues at the same configured revolution speed, although its phase may no longer be synchronized with the other orbit because the user intentionally paused it.

Motion remains linear in phase so a complete revolution takes the same time on both ellipses. This requirement is cycle-time equality, not equal pixel distance per second on ellipses with different circumferences.

## Rendering and Interaction

The renderer continues to split each fixed track into front and back SVG paths and derives node depth from its phase. Existing semantic buttons, node labels, bridge dispatch commands, pointer hit areas, light/dark assets, and z-index behavior do not change.

`prefers-reduced-motion: reduce` retains the static initial presentation: fixed tracks with each node pair at opposite major-axis endpoints.

## Test Strategy

Tests must prove:

1. Both orbit definitions have the same revolution duration.
2. Each orbit's reported tilt remains its fixed design tilt at multiple elapsed times.
3. Track path data is unchanged across elapsed times.
4. At elapsed time zero, each node pair occupies the opposite major-axis endpoints.
5. At sampled times, every node stays on its ellipse and each pair remains separated by `Math.PI`.
6. Existing semantic node buttons and bridge dispatch behavior remain present.

Implementation follows TDD: add the fixed-track/equal-period assertions first and observe their failure against the current rotating-track/different-duration implementation, then apply the smallest geometry and initialization changes required to pass.

## Validation

Run the targeted Workspace orbit tests, Surface Skin typecheck and build/check, then rebuild the local Tauri preview executable. Refresh the existing desktop shortcut to the rebuilt executable and confirm the shortcut still targets the stable local path. Do not push.
