# Task Lookback design QA

- Source visual truth: `D:\Temp\Administrator\codex-clipboard-7959fa17-f8b5-41bb-a4db-ec33c964b673.png`
- Entry state to remove: `D:\Temp\Administrator\codex-clipboard-05ed6457-37ce-49c5-a280-a1e1e5a97e63.png`
- Motion reference: `src/gallery/cortana-gallery.css` spatial reveal and scan sequence
- Source and implementation viewport: 1800 × 1000 CSS px at device scale factor 1
- Implementation URL: `http://127.0.0.1:1420/__surfaces/workspace`
- Timeline light screenshot: `D:\preacherman\output\playwright\task-timeline-final-light.png`
- Timeline dark screenshot: `D:\preacherman\output\playwright\task-timeline-final-dark.png`
- Index light screenshot: `D:\preacherman\output\playwright\task-index-final-light.png`

## Final state

- The Lookback iframe stays mounted and preloads while hidden; opening Task does not begin a cold iframe load.
- Task uses the Gallery spatial reveal and scan timing: 1100 ms with the same clip-path, scale, opacity, and easing stages.
- The persistent Preacherman mark remains in the upper-left, with Timeline, Surf, and Index immediately to its right.
- The workspace drag region begins after the visible navigation, so every link receives real pointer input.
- Timeline, Surf, and Index retain the original mirrored assets, layouts, and Vue Router transitions.
- Cortana remains visible behind the transparent black Lookback canvas.
- About, Better Off / THE LOOKBACK branding, music controls, and the sound/silent entry screen remain absent.

## Visual comparison

The supplied reference, Gallery motion source, and final captures were inspected together at the 1800 × 1000 baseline.

- [PASS] Timeline keeps the original horizontal archive composition, authored crops, typography, month labels, and motion assets.
- [PASS] Index renders the original month-grouped asset grid without recreating or replacing source assets.
- [PASS] Navigation begins 8 CSS px to the right of the 108 px Logo container at the design viewport and ends before the workspace drag region.
- [PASS] The spatial reveal matches Gallery frame-for-frame in authored keyframe values and duration.
- [PASS] Light and dark stored appearance modes keep the Logo, text, focus styling, and all three desktop window controls readable.
- [PASS] No sound-entry choice, original wordmark, music control, About link, or blank loading layer is visible.

## Interaction and performance evidence

- Preload before Task click: host `data-loaded=true`, iframe `data-task-lookback-ready=true`, override `v15`, hidden visibility state inactive.
- Real Edge pointer navigation: `/task-lookback/` → `/task-lookback/surf` → `/task-lookback/`; Index opens `/task-lookback/articles`.
- Entrance sampling at 120 ms reported `task-lookback-spatial-reveal` with an in-progress clip-path and opacity; at 1170 ms it reached `clip-path: inset(0)` and opacity 1.
- A PerformanceObserver recorded zero main-thread long tasks over 50 ms during the complete Task entrance.
- The hidden mirror drops requestAnimationFrame activity to roughly 8 fps after readiness and resumes immediately when active.
- DOM adaptation is bounded to initial loading; the prior full-document MutationObserver and repeated `body *` scan are gone.

## Automated evidence

- Task regression tests: 5/5 passed.
- Production build: passed (`tsc --noEmit` and Vite production build).
- `git diff --check`: passed.

## Console review

- No Task host crash, React exception, missing Task asset, or failed Timeline/Surf/Index navigation was observed.
- The copied static Nuxt runtime still reports its existing non-blocking route-rule lookup error, and the independently mirrored Gallery runtime reports its existing hydration mismatch. These do not affect the verified Task states or pointer navigation and remain P3 integration noise.

final result: passed

## Gallery model base and shared wordmark follow-up

- Gallery now keeps the Home companion scene mounted as its visual base; the mirrored portfolio canvas is transparent and remains layered above it.
- Task adds the same centered `Preacherman` Brother Signature wordmark at the Gallery position (`top: 48px`, centered) as a non-interactive overlay.
- Existing Task Timeline, Surf, Index, cards, model placement, and entrance motion were not changed.
- Existing Gallery card navigation and the 1100 ms spatial reveal were rechecked in Edge and remain active.
- Light and dark appearance states keep the persistent desktop controls visible; Gallery/Task colors continue to use semantic theme variables.
- Focused regressions: 38/38 passed. Production build, `git diff --check`, and the Impeccable layout detector passed.

Follow-up result: passed
