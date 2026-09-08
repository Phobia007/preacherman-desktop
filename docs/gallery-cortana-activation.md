# Cortana detail actions

- The first Gallery card (internal slug `secret-sky`) previews Cortana independently of the globally applied avatar. Browsing never changes preferences; leaving detail restores the applied avatar before the exit frame.
- Its transparent Activate capsule uses the existing navigation's Clash Display Light typeface and charge/word-light motion language. The outline stays visible in both appearance modes. Two paths start at the top midpoint and charge outward with two eased pulses over 1.6 seconds.
- Primary pointer or Enter/Space must remain held until completion. Release, moving outside, cancellation, focus/window loss, hidden document, navigation and unmount cancel an incomplete hold.
- Completion updates the existing `preacherman.preferences.activeModelId` through App state. An already applied Cortana reads Activated immediately; there is no fake unselected state or toggle-to-disable.
- The return arrow has no visible border or fill and retains its hit area, chat baseline and explicit-back behavior. The capsule and arrow share a right edge.
- Only Cortana's existing Medium Case Study label becomes Details; the existing destination, underline, font and 800ms reveal delay remain unchanged.
- Other Gallery cards have no Activate button until assigned an actual model. No new catalog assignments, logo, media, shader or route changes are included.

Verification: focused Node regressions, real pointer/keyboard interruption and completion, preview/equip separation, persistence after reload, paired native shortcut smoke tests in both appearances. The original desktop executable and sidecar must be preserved before deployment.
