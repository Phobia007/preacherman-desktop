# Gallery model import — 2026-09-10

The eight prepared avatars occupy cards 3–10 in upload order. Cards 1–2 remain Cortana and Zima. Card text, thumbnails, video, navigation, motion and activation behavior remain unchanged.

| Card | Model | GLB bytes |
| --- | --- | ---: |
| 3 | `jubilee-midnight-mutant` | 10,973,752 |
| 4 | `halo-mk-v-model` | 8,870,764 |
| 5 | `magik-soul-surfer` | 16,091,532 |
| 6 | `punk-magik` | 14,473,660 |
| 7 | `sanhua-wuthering-waves` | 2,843,316 |
| 8 | `black-cat-coastal-cat` | 16,151,704 |
| 9 | `clove-t-pose` | 2,226,236 |
| 10 | `black-widow-aquatic-assassin` | 16,159,096 |

## Asset preparation

Sources are the reviewed `.blend` files under `D:/preacherman/output/avatar-rig-20260910/ready`. Their hashes remain unchanged. Export includes visible character meshes and armature, excluding previously hidden weapons and props. Original mesh topology and colors are preserved. Models are normalized to 1.8 units in height and use the already prepared standing idle, with one embedded 10-second clip each. Seven source rigs are reused; Sanhua uses its prepared rig. Runtime export uses the strongest four normalized skin weights supported by the renderer.

Base-color textures are capped at 2048 and other maps at 1024, embedded as WebP quality 95. The native WebView2 and browser checks validate decoding. No external textures, full motion library, new facial binding or cloth physics are included. Existing source-material limitations remain; Sanhua's deep-knee skirt limitation is outside this default-idle delivery.

New models use their own materials with neutral local studio lighting/reflections. Only Cortana and Zima use the existing hologram shaders. All models share the current Canvas and bounded resource cache; one neighboring model is prefetched. Selecting a card previews it, and the existing Activate control selects the model for other pages.

## Verification and delivery

38 host and 26 renderer tests passed. Actual shipped GLBs animate for more than two loops with finite bounds, changing bone matrices and a single action. Browser and native tests cover all ten cards in both appearances, original card copy, shared Canvas, activation across core routes and reload, and returning from authored-color models to Cortana. Native minimize/restore suspends and resumes both the model and media; maximize/restore also passed.

No new console errors were observed against the exact previous template diagnostic strings. Preferences were restored, temporary verification processes exited, and the canonical shortcut was restarted normally into Home with debugging disabled. The previous executable and matching sidecar are backed up together; the unchanged sidecar was reused. No installer or sidecar rebuild was performed.

Detailed asset hashes and verification data are in `gallery-model-imports.json`. Full screenshots/logs are under `D:/preacherman/output/gallery-model-import-20260910`. The canonical executable timestamp, SHA-256, rollback paths and verification status are recorded in `apps/preacherman-demo-host/desktop-build-manifest.json`.
