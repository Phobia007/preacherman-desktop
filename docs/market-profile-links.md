# Market profile links removal

Removed the Instagram, LinkedIn and Email list from the shared Market profile component, covering both Market and all model Details overlays in the desktop and independent browser editions. English introduction, typefaces, optical shaders and open/close logic are unchanged.

Verification exposed a legacy Gallery initialization error when the optional sync helper is still promise-backed. The Gallery runtime now checks callability before invoking this optional helper; the regeneration script preserves the fix. A regression test checks missing, pending and callable helpers.

Type checking and ten regressions passed. Browser and cold native verification covered all six navigation destinations, both appearances and ten profile open/close checks per edition. Market main and Details have no social list or link controls. No new console errors occurred; pre-existing diagnostics are recorded separately. Browser dimensions and absence of native window controls remain verified. The initial failed verification report is retained as preview-before-initialization-fix.json.

The canonical desktop executable was rebuilt incrementally with the existing sidecar, backed up as a matching pair, deployed and launched through the canonical desktop shortcut. The manifest records the verified hashes and resources. The browser production files and preacherman-web.zip were refreshed; every archived file matches web-dist. No public website deployment was performed.

Evidence: D:/preacherman/output/playwright/market-profile-links-20260917/.
