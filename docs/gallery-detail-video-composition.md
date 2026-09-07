# Gallery detail: video room and companion layering

## Scope

Only the opened Gallery card changes. The rotating rail, current media, labels,
fonts, companion motion, conversation bridge and other surfaces remain intact.
The normal Home startup route is unchanged.

The room's existing shared video texture is moved to its rear wall; its cube
reflection continues sampling the same render. The persistent companion is
composited above this room. The optional foreground canvas mirrors that same
HTMLVideoElement, so there is no second decoder or independently playing audio.
Closing the small window does not pause, seek or destroy the shared video.

The bridge saves the original rail scroll position before entering detail.
Wheel input no longer exits detail. The lower-right back control (aligned to
the existing chat input) restores that position. Each new entry restores the
small window; changing surfaces removes its overlay and callbacks.

## Implementation boundaries

- `gallery/detail-bridge.js` owns the detail lifecycle and camera-projected
  foreground geometry. `patch-gallery-detail.mjs` applies guarded, idempotent
  edits to the existing authored bundle; it fails on unexpected source drift.
- GalleryDetailOverlay owns only mirroring, presentation and controls. It
  releases video callbacks, timers, listeners and RAF on teardown.
- `isolateCompanion` is false by default. In Gallery detail it hides cinematic
  backdrop geometry and clears the scene background/alpha, while preserving
  lighting, platform, model materials and animations. Merely removing R3F's
  color attachment was insufficient: attachment cleanup can restore an older
  opaque background. The scene explicitly clears it during isolation.
- The app resolves the renderer from its own workspace source. Its existing
  node_modules junction otherwise resolves the package in D:/preacherman.
  All 22 baseline renderer source files matched before these changes; no
  junction or source files in that other worktree were rewritten.
- Both appearance modes define semantic control tokens. Authored videos and
  room textures keep their original colors. Existing original video URLs are
  unchanged; no media download, API configuration or backend change is made.

## Verification and rollback

Focused tests cover the shared-video lifecycle, wheel/back behavior, exact
scroll restoration, reopening, minified hooks, semantic themes and renderer
isolation. Sequential preview checks additionally cover real video playback,
closing only the foreground window, leaving/reentering Gallery, both themes,
keyboard controls and the existing scaled-stage behavior at smaller sizes.
Native results and artifact hashes are recorded in desktop-build-manifest.json.

The first native candidate was rejected after its exact return-position check
failed following wheel input. The previous verified pair was restored and its
core navigation rechecked before revision. The bridge now cancels room wheel
default behavior (chat scrolling is excluded), pins the saved rail position
through the entire return transition, and uses preventScroll when restoring
iframe focus. A regression test injects late scroll/route changes during entry
and return, then confirms normal rail scrolling resumes afterward.

Source baseline: 183731ffef4482854426d3c537f54a03f73986a8.
Before deployment, the verified executable, unchanged sidecar and manifest
were copied to the canonical release directory's
`deployment-backups/gallery-detail-before-20260907-1827/`.
The previous executable SHA-256 is
`D4D3494575AC5241CDEFC7BE8FBDBD0C654D972B10B89CEB4EC7B1B5CB08B64C`;
the matching sidecar SHA-256 is
`2465A32CAF878D0D6109C0975E5254F98CC1FA27CC7202FE574F5A367F90902E`.
Restore the pair together if native verification fails. D:/preacherman's
preexisting source edits are outside this change.
