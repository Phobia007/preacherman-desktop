# Settings v3 visual QA

Source of truth: `C:\Users\Administrator\Desktop\打开 Gil Huybrecht 本地复刻.lnk`

Viewport: 1800 × 1000

Compared:

- Source capture: `C:\Users\Administrator\.codex\visualizations\2026\08\20\01a01e65-27b1-75f1-bc5d-4ff6ea4f3af9\gil-reference-1800x1000.png`
- Dark capture: `C:\Users\Administrator\.codex\visualizations\2026\08\20\01a01e65-27b1-75f1-bc5d-4ff6ea4f3af9\settings-cortana-overlay-dark.png`
- Light capture: `C:\Users\Administrator\.codex\visualizations\2026\08\20\01a01e65-27b1-75f1-bc5d-4ff6ea4f3af9\settings-cortana-overlay-light.png`
- Entry-state capture: `C:\Users\Administrator\.codex\visualizations\2026\08\20\01a01e65-27b1-75f1-bc5d-4ff6ea4f3af9\settings-gil-entry-350ms.png`

## Result

- The Settings layer uses the shortcut's local Gil Huybrecht HTML, project images, media, and authored styles.
- The original project grid geometry, image crops, typography, spacing, labels, and scroll behavior are preserved; its page background is deliberately transparent.
- The original header and percentage loader are absent from the mounted card layer while the project grid retains its original vertical offset.
- The copied document runtime is not executed, preventing its WebGL canvas and iframe backing surface from obscuring the shared scene.
- The shared AppShell scene remains mounted behind a transparent Settings shadow-DOM overlay.
- The Gil content layer uses full opacity; only the authored card media and capability copy cover the shared scene.
- The requested horizontal line and vertical pulse/unfold entrance remain isolated to Settings.
- First-paint inspection showed no loader, no iframe, and the first project card at its original vertical position.
- Both appearance modes retain readable persistent desktop controls while leaving the authored Gil content unchanged.
- Browser verification completed without console errors; only the existing Three.js clock deprecation warning remains.

final result: passed
