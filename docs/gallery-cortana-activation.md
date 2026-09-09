# Gallery character cards and activation

Cortana and Zima share the Gallery detail layout and controls. Card data supplies the character identity and media; the shared overlay owns the video mirror, close control, activation capsule, return arrow, and previous/next navigation.

- The first card (`secret-sky`) previews Cortana. The second (`watson-masters`) previews the existing packaged Zima model and shows the supplied English biography with `2019 / Alastair Reynolds / Preacherman Avatar`.
- Both cards have a Details link. Zima's link opens [the author's Zima Blue page](https://www.alastairreynolds.com/release/zima-blue/).
- Click Activate to apply that card's model to Home, Task, Market, Settings and other non-Gallery routes. Click Activated to save `activeModelId: null` and hide it on those routes.
- Browsing or switching cards never changes the applied character. Gallery detail previews remain independent of that preference. The outer Gallery defaults to Cortana; unassigned cards do not borrow the global model or expose activation.
- Both cards use the same transparent 163.2 by 49.6 CSS pixel capsule with 22px type, video-close behavior, and long return arrow. Closing the foreground video leaves the room's shared video playing.
- Fixed chevrons at the left and right edges navigate in Gallery card order. The previous control moves the current room, character, video and text right, then brings the previous content in from the left. Next reverses the direction. The first/last card disables the unavailable direction.
- A switch locks repeated input until its 280ms exit and 440ms arrival finish. It waits for the selected local model, supports keyboard activation and reduced motion, and cancels animations and observers when leaving Gallery.
- Return restores the original rail position. Long descriptions keep clear of the foreground video, and lateral navigation does not replay the initial depth or text-reveal animations.
- Explicit saved null survives reload; missing or invalid preferences still use the fresh-install Cortana default.

Verification covers both appearances, direct card entry, previous/next direction, video continuity, keyboard/reduced-motion controls, activation/deactivation, persistence and core navigation. Current evidence uses `output/playwright/zima-*`; earlier click-toggle evidence remains under `toggle-*`. The desktop manifest records the production executable, matching sidecar, recoverable pair, native results and cleanup.

The second card keeps its existing authored video and cover, now bundled as `/assets/gallery/zima-card-video.mp4` and `/assets/gallery/zima-card-cover.jpg`. Source URLs were the original Gallery CMS media `1516321800519.mp4` / `.jpg` on storage.googleapis.com/activetheory-v6.appspot.com/media. The model and biography are Zima; the film content is retained. Native validation requires both media to decode from the packaged application origin.
