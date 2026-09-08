# Gallery first-card media

The first Active Theory Gallery card (`secret-sky`, priority 0) now uses the supplied Cortana introduction. Only its media changes; names, descriptions, card ordering, model selection, shaders and transitions are unchanged.

- Source video: `E:/50/8月16日(1)/8月16日(1).mp4` (HEVC, 7680×4320, 120 fps, 77.670998 seconds). The original is not modified.
- Packaged playback copy: `apps/preacherman-demo-host/public/assets/gallery/cortana-intro.mp4` (H.264, 1920×1080, 30 fps, CRF 20, original AAC stream, faststart; full original duration).
- Playback SHA-256: `FE4DFA6198E24FAA80C19173DD60CC0148DE76C9F50DEC104F45E82DD23D9004`.
- Cover: `E:/50/8月16日(1)/8月16日(1)-封面.jpg`, copied byte-for-byte to `public/assets/gallery/cortana-intro-cover.jpg` within the Demo Host.
- Cover SHA-256: `697729D943269F922928E4DD3F8EA6B082E505F64A1C38465A25B6B2243E6E0B`.

The CMS entry owns both local media paths. The rail thumbnail uses that cover; the existing shared video decoder feeds the animated card and the reflective detail room. The optional foreground canvas mirrors the same decoder, using the supplied cover while decoded frames are unavailable. The cover is a poster, not an edit to the movie's opening frames. Closing the foreground canvas does not pause the room. Existing muted autoplay and loop behavior is preserved.

The media are packaged into Tauri, with no runtime dependency on the E: drive or a local UI HTTP server. Model preview/activation behavior is outside this change.

Verification: `tests/gallery-detail.test.mjs`, `tests/gallery-v3.test.mjs`, `tests/app-shell.test.mjs`, type checking, and sequential preview/native checks for both appearances. Desktop deployment evidence belongs in `desktop-build-manifest.json`.
