# Task v3 · The Lookback reference specification

## Output plan

- Source: `http://127.0.0.1:8123/` (`/`, `/surf`, `/articles`, `/about`).
- Task component root: `src/task/`.
- Isolated preview: `src/task/preview/index.html`.
- Bundled, Task-only runtime: `public/task-lookback-v3/`.
- Formal host mount: intentionally out of scope. The integration window will later import
  `TaskSurface` and render it inside the existing `workspaceContent`.
- Shared files changed by this milestone: none.

## Required product changes

1. Mount into the Timeline state with no visible intro or entry choices.
2. Remove the music player and prevent all audio creation/playback. Video remains enabled.
3. Preserve Timeline, Surf, Index, About, article links, hover states, wheel/drag/touch motion,
   canvas work, and responsive behavior from the reference runtime.
4. Keep the Preacherman Cortana scene visible behind the authored archive.
5. On Task mount, draw a one-pixel white line from left to right, open a narrow horizontal
   aperture, retract once as a pulse, then open rapidly upward and downward.
6. Keep Preacherman chrome, brand navigation, drag regions, resize handles, and window controls
   above the Task layer and interactive.

## Page topology

### Host layer

- Real `AppShell` remains persistent.
- Cortana scene is at host z-index 0; screen content is z-index 2; chrome is z-index 20.
- Task uses an absolute, transparent root and does not use `position: fixed` in the parent page.
- The first 68 px remain visually clear for the desktop drag/chrome region.

### Task transition layer

- Interaction model: time-driven on mount.
- Scan line: left-origin `scaleX(0)` to `scaleX(1)`.
- Aperture: `clip-path: inset(50% 0 50%)` → `42%` → `46%` (pulse retract) → `36%` → `0`.
- Reduced motion: no scan/pulse; content opens immediately.

### Embedded archive layer

- Interaction model: Vue/Nuxt reference runtime inside a same-origin iframe.
- Desktop navigation: static, 19.2 px, top-left; source labels are Timeline, Surf, Index, About.
- Mobile navigation: fixed at `bottom: 20px`, centered, 16 px, four compact buttons.
- The root document and Nuxt canvas are transparent; an appearance-aware Task scrim preserves
  text contrast while leaving Cortana visible.

## Component specifications

### Timeline

- Desktop title: PP Neue Montreal Bold, approximately 117 px, line-height `.85`, centered.
- Desktop cards: horizontal carousel; active card class is `js-slide-active`; cards are 281 px
  wide at the source desktop scale with irregular image heights and 20 px gaps.
- Timeline ruler is pinned to the lower edge with mono month labels.
- Desktop interaction: wheel, pointer drag, touch, and keyboard arrows drive the timeline.
- Mobile title: 46.8 px, 39.78 px line-height; cards become a two-column flow.
- Mobile navigation is fixed above the bottom edge.

### Surf

- Large `TLB/2026` title centered at the top.
- Irregular photographic planes form a perspective arc across the viewport.
- Pointer/touch movement preserves the authored spatial motion.

### Index

- Large `TLB/2026` title centered at the top.
- Month groups use mono uppercase labels and irregular thumbnail rows.
- Article links and authored hover transitions remain active.

### About

- Black authored scene with white title and mono side labels.
- Keep the locally bundled `render-big.mp4` and authored page scroll.
- Do not recolor video or 3D authored content.

## Theme contract

- Task chrome uses inherited semantic variables only:
  `--demo-theme-task-canvas`, `--demo-theme-task-loading-canvas`,
  `--demo-theme-task-text`, `--demo-theme-text`, `--demo-theme-muted`,
  `--demo-theme-border`, `--demo-theme-focus`, `--demo-theme-loading`,
  `--demo-theme-error`, and `--demo-theme-surface-elevated`.
- The embedded authored photography/video is not recolored.
- Light and dark previews use the real AppShell `data-appearance` state.

## Runtime isolation and readiness

- All `/_nuxt`, `/assets`, `/_payload.json`, and video paths are namespaced under
  `/task-lookback-v3/`.
- Child navigation stays within the iframe and cannot navigate the parent.
- Runtime bootstrap clicks the exact `...or without` control only after the load mask is gone.
- `window.Audio` and audio `play()` are disabled before Nuxt starts; no mp3 file is bundled.
- The parent reveals the iframe only after a same-origin `task-lookback-v3-ready` message.
- Loading and error UI use semantic theme tokens.

## Verification

- Task-specific static/runtime contract test.
- TypeScript typecheck.
- Isolated preview at 1800 × 1000 in light and dark.
- Timeline, Surf, Index, About navigation; parent URL unchanged.
- No visible intro/music UI, no playing audio, no mp3 or external asset request.
- Window controls and Preacherman brand navigation remain above Task.
- Browser console contains no Task errors.
