# Cortana detail activation

The Gallery activation button is a single-click toggle for the companion displayed outside Gallery.

- Click Activate to apply that card's model to Home, Task, Market, Settings and the other non-Gallery routes.
- Click Activated to save `activeModelId: null` and hide the companion on those routes. The button remains enabled while active.
- Gallery previews are independent of this preference. Opening the Cortana card shows Cortana even when the global companion is disabled or a different model is applied. Toggling does not replace or hide the current preview.
- The current outer Gallery defaults to Cortana. Only the Cortana card (`secret-sky`) has a real avatar mapping; unassigned cards do not borrow the global companion or expose an activation button.
- An explicit saved null survives reload. Missing or invalid preferences still use the fresh-install Cortana default.
- Native button click, Enter and Space toggle immediately. The 1.6-second outline pulse is feedback only and never delays or locks the change.
- The capsule remains transparent, 163.2 by 49.6 CSS pixels, with 22px Clash Display type. HALO 4 metadata, the Microsoft logo, Details link, media, arrow geometry and right alignment are preserved.

Verification covers activation, deactivation, switching from an applied Zima, independent Gallery preview and outer rail, hidden/shown companions across core routes, both appearance modes, keyboard and reduced-motion interaction, and persistence after reload. Source checks and desktop delivery evidence are recorded in the deployment manifest; browser/native evidence for this change uses the `output/playwright/toggle-*` prefix.
Desktop delivery on 2026-09-09 passed both native appearance flows and a normal canonical-shortcut restart. The raw console gate and its exact preexisting-template CSP attribution remain available in the qualified report; the deployment manifest records artifact hashes, the recoverable pair, and process cleanup.
