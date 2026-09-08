# Gallery first-card media

The first Active Theory Gallery card (`secret-sky`, priority 0) uses the supplied Cortana introduction. Its display name and description now identify Cortana; the internal slug, ordering, model selection, shaders and transitions are unchanged.

- Source video: `E:/50/8月16日(1)/8月16日(1).mp4` (HEVC, 7680×4320, 120 fps, 77.670998 seconds). The original is not modified.
- Packaged playback copy: `apps/preacherman-demo-host/public/assets/gallery/cortana-intro.mp4` (H.264, 1920×1080, 30 fps, CRF 20, original AAC stream, faststart; full original duration).
- Playback SHA-256: `FE4DFA6198E24FAA80C19173DD60CC0148DE76C9F50DEC104F45E82DD23D9004`.
- Cover: `E:/50/8月16日(1)/8月16日(1)-封面.jpg`, copied byte-for-byte to `public/assets/gallery/cortana-intro-cover.jpg` within the Demo Host.
- Cover SHA-256: `697729D943269F922928E4DD3F8EA6B082E505F64A1C38465A25B6B2243E6E0B`.

The CMS entry owns both local media paths. The rail thumbnail uses that cover; the existing shared video decoder feeds the animated card and the reflective detail room. The optional foreground canvas mirrors the same decoder, using the supplied cover while decoded frames are unavailable. The cover is a poster, not an edit to the movie's opening frames. Closing the foreground canvas does not pause the room. Existing muted autoplay and loop behavior is preserved.

The media are packaged into Tauri, with no runtime dependency on the E: drive or a local UI HTTP server. Model preview/activation behavior is outside this change.

Verification: `tests/gallery-detail.test.mjs`, `tests/gallery-v3.test.mjs`, `tests/app-shell.test.mjs`, type checking, and sequential preview/native checks for both appearances. Desktop deployment evidence belongs in `desktop-build-manifest.json`.

## Cortana identity and logo

- Display name: Cortana (both the rotating card and detail).
- Detail metadata: 2003 / Microsoft / Preacherman Avatar. The year is the user's supplied value, not a claim about Halo's release date.
- Description: Cortana is from the Halo series. An advanced AI created from Dr. Catherine Halsey's neural architecture, she was initially tasked with system infiltration, intelligence analysis, and tactical support.
- Official symbol source: [Microsoft Learn branding assets](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps), [original SVG](https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.svg).
- Packaged rendering asset: `apps/preacherman-demo-host/public/assets/gallery/microsoft-logo.png`, rasterized from the adjacent source SVG. The four official rectangles and colors are unchanged; a transparent 2:1 canvas centers the square symbol in the incumbent 400×200 logo slot without stretching or a backing panel. PNG SHA-256: `F3ADA9D23989AF349DFF1E775896B6CE5677D65DAE489F5479D344C73B8E21DB`.
- The incumbent worker resolves image paths through `Thread.absolutePath`, which prepends the Gallery base even to root-relative paths. Use `../assets/gallery/microsoft-logo.png` so both HTML and worker decoding resolve to the packaged `/assets/gallery/` directory. The worker also uses `createImageBitmap(blob)`; RGBA PNG is its compatible texture format. Verification must exercise `ImageDecoder.decode` and check all four colors plus transparency, not just URL/HTML image loading.

The existing title sizing, font, uppercase presentation, line wrapping, logo material, reveal animation and detail positioning remain in the authored runtime, unchanged. Only first-record content and the logo asset change. The previous case-study link and the other 30 cards are outside this request and are retained. No external logo request is needed at runtime.
