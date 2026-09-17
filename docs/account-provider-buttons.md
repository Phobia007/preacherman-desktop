# Apple and Codex Account buttons

Added Apple and Codex below Google and GitHub in the desktop and independent browser Account forms. Buttons share the existing 52 px height, 12 px gaps, navigation typeface, hover and keyboard focus styles. Locally bundled monochrome icons follow the GitHub light/dark filter.

Apple, Codex and Google display provider-specific not-connected feedback. Email feedback still confirms nothing was sent or saved. The GitHub authorization controller, credentials and account database are unchanged. This update adds the requested options; it does not enable new identity providers.

Both editions passed type checking; 16 focused Account/Auth regressions passed for desktop and 20 for browser. Browser and cold native checks cover all six navigation destinations, both appearances and existing profile effects. New runtime checks verify all four button dimensions, fonts, gaps, loaded icons, keyboard activation, dialog copy, close/focus restoration and hover styling. No new console errors; existing diagnostics remain recorded in the reports.

The production desktop was built incrementally with the existing sidecar. The matching previous executable and sidecar were backed up, then the canonical shortcut was cold-launched and verified. The manifest records the deployed hashes, timestamps and resource measurements. Browser production files and the deployable ZIP were refreshed, with every archived file verified against web-dist. No public website was deployed.

Evidence: D:/preacherman/output/playwright/account-providers-20260917/.
