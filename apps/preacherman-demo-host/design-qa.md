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

## Asset Overview — 2026-10-23

Source: user-supplied Marvel Rivals layout (`914021eefd7e5130c8feb2e53d0e879c.png`, 1920 × 1080), existing Preacherman Asset screenshots, and the user's subsequent close-up, bottom-edge, and text-only-tab corrections. Only the layout hierarchy is transferred; existing Preacherman typography, semantic appearance tokens, character copy, and packaged models remain the visual source.

Evidence directory: `D:/preacherman/output/playwright/asset-overview-20261023/`. Desktop browser captures are 1920 × 1032 (the available desktop client area); additional layouts checked at 1100 × 740 and 700 × 850. The app uses its existing scaled desktop coordinate system. Source and implementation were visually compared side by side.

Five fidelity surfaces:

- Layout: passed. Top navigation, left name/source/description, right live model, retained right character rail. Default portrait camera ends at the desktop bottom edge. Asset grid and normal Home startup retained.
- Typography: passed. Existing thin Preacherman font, large character title, quieter source and description; long names have a smaller authored size. Tab selection changes text color only, with no border or underline.
- Color and appearance: passed. Both light and dark chrome, text, loading/error states, focus, and desktop controls use existing semantic tokens. Model textures are preserved.
- Assets: passed. Current packaged character models and original idle motions replace the old static detail portrait. Character descriptions and card thumbnails remain sourced from the existing catalog.
- Interaction and motion: passed. Default close-up, scroll down to full body and up to portrait, keyboard zoom, character switch reset, back/focus restoration, and the existing spatial lens were exercised. Previewing does not change the equipped Home character. Hidden companion rendering pauses and resumes.

Iteration record: corrected the initial full-body camera initialization; corrected viewport sizing to use the app's scaled height; removed bottom padding; removed tab rules/selection underline following user feedback; added synchronous model capture so the existing spatial lens preserves the live character. The four future tabs are visibly reserved and disabled; only Overview is implemented in this scope.

Validation: TypeScript passed; 26 focused regressions passed. Browser checks had no page exceptions. Preview-only connection-refused messages occurred with the native backend intentionally stopped; native console verification is recorded separately in the desktop deployment manifest. Five failures in the older persistent-companion source-pattern suite were reproduced unchanged against pristine HEAD and are recorded in `baseline-tests.log`; they are not regressions from this change.

Visual evidence: `preview-light-close.png`, `preview-light-full.png`, `preview-dark-close.png`, `preview-dark-full.png`, `preview-compact.png`, `preview-narrow.png`, `lens-capture.png`; native verification and screenshots are added before desktop handoff.

Asset Overview visual result: passed. Desktop deployment verification: passed. The canonical shortcut was cold-launched; all 17 models and 8 navigation destinations passed in both modes, including bottom-edge bounds and text-only tab assertions. Native screenshots, console checks, window-control checks, resource samples, hashes, and backup pair are recorded in desktop-build-manifest.json and the evidence directory.

final result: passed

## Asset return arrow follow-up — 2026-10-23

Reference: user screenshot `D:/Temp/Administrator/codex-clipboard-b80a4907-19e5-479c-925b-61e95cc61f35.png` and explicit request for a single thin elongated arrow aligned with the adjacent navigation text. The circular border/background is removed; the SVG uses a 1px stroke and a 34px shaft. The existing 44 × 48px pointer target remains.

Preview captures at 1920 × 1032 in `D:/preacherman/output/playwright/asset-arrow-20261023/`: `preview-light-overview.png`, `preview-dark-overview.png`, and corresponding `*-header.png` crops. Both appearances were visually checked. The arrow and text vertical centers differ by 0.21px. Border, rounded shape, and background are absent in both modes; hover and focus use semantic colors. Pointer return, keyboard return, focus restoration, and existing portrait/full-body zoom passed. TypeScript and 11 focused theme/Asset regressions passed.

Arrow follow-up visual result: passed. Arrow follow-up desktop verification: passed. The canonical shortcut was cold-launched, the arrow checked in both appearances, all eight navigation destinations verified, and window controls/resource cleanup checked. Evidence and hashes are in the desktop manifest.

final result: passed

## Asset activation follow-up — 2026-10-23

Reference: user screenshot `D:/Temp/Administrator/codex-clipboard-0aa05098-63e6-4472-9241-5aff17567ca7.png` and requested relocation from Gallery to the lower-left of Asset Overview. Gallery activation markup, props, and styles are removed; its character preview and navigation remain.

The 160 × 54px capsule aligns with the existing left copy at the marked position. Following the user's additional reference `codex-clipboard-8f702f4d-18e0-4f37-ab43-1efc8d1c3a1d.png`, its inactive resting state shows only text; hover or keyboard focus draws a fine capsule outline in 680ms using the directory's easing. A continuous 1600ms hold fills symmetrically from the center, using progress raised to 2.4 for a slow start and accelerating finish, plus a slight pressed scale for resistance. Light appearance fills dark with light lettering; dark appearance fills light with dark lettering, using existing semantic theme tokens. Completion shows a drawn check for 720ms before revealing Activated; the reverse action shows the same check before Activate.

Unfinished charging retraces the same progress curve and elapsed duration on release, pointer leave, or focus loss, rather than disappearing. Repressing during this return resumes from the current visible charge. Completion blocks repeated input until confirmation finishes. Animation frames, pointer capture, and the confirmation timer are cleaned up on unmount.

Evidence: `D:/preacherman/output/playwright/asset-activation-20261023/`. Preview captures at 1920 × 1032 include both themes at rest, 300/800/1250ms charging, and activated. Position, unchanged typography, center-out text inversion, and contrast were visually checked against the reference. Tifa's longer copy was checked at 1100 × 740 and 700 × 850; the narrow layout places the button between copy and model without overlap.

Interaction checks passed in both themes: quick clicks and short keypresses do not activate; release, pointer leave, character change, and navigation cancel unfinished holds; full pointer and Space holds change the persisted companion; Home loads that companion; Gallery preview never changes it. Reduced-motion mode retains the hold requirement. Unit coverage additionally checks focus loss, hidden document, pointer cancellation/lost capture, Escape, unmount cleanup, and repeated keydown events.

Validation: TypeScript and 45 focused regressions passed. Preview checks both themes for hover outline, reverse progress, check-before-label in both directions, and persistent activation, with no page exceptions. Backend connection-refused messages in preview occur because the native backend is intentionally stopped. Native console diagnostics are checked against previously verified records before release. The first temporary build was superseded by the user's additional interaction requirements before handoff; its previous verified pair was restored and recorded in the manifest. Native automation explicitly foregrounds the owned window and awaits its target page so background frame throttling is not mistaken for a failed charge animation.

Asset activation visual result: passed. Asset activation desktop verification: pending.
