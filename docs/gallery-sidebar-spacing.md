# Gallery sidebar spacing

The Gallery category heading, category list and original search pill share the same left edge as the account avatar. The list has a consistent rhythm, with extra separation below the heading and above the search field. The search field sits about 47 logical pixels above the account.

The account component and its position, sizing, typography and menu visibility behavior are unchanged. Gallery fonts, colors, input appearance, category filters, character search, card orbit and detail navigation retain their existing behavior.

Verification: 19 focused tests and TypeScript passed. Browser regression checks covered both appearance modes, 1800×1000 and 1280×720 windows, alignment, account clearance, category filters, Pathfinder/Cortana search, card click and detail return. The production shortcut was cold-launched and checked through Home, Task, Gallery, Market, Account and Settings in both modes, then restarted normally. Only recorded legacy console diagnostics remain. The previous executable and unchanged sidecar were backed up together.

The reproducible browser checks and screenshots are in `D:/preacherman/output/playwright/gallery-sidebar-spacing-20260917/`; release hashes and resource checks are in the desktop build manifest.
