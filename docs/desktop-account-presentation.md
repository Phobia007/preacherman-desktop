# Desktop account presentation

The account dock hides whenever navigation opens, whether signed in or signed out, and reappears using the existing fade when navigation closes. The Account form uses the same Clash Display family and weight as navigation, including headings, explanatory text, provider buttons, email input and Continue.

Only these two presentation changes were synchronized from the separate browser edition. The desktop retains its original fixed 1800x1000 logical stage, scaling, startup flow and native window controls.

TypeScript passed. Twenty targeted source checks passed; two older broad app-shell assertions remain stale against unchanged baseline files (native imports in useWindowActivity and the old ledger scene conditional). Browser interaction checks used isolated synthetic accounts and passed guest/member visibility, login typography, login recovery and both appearances. Native cold-start checks passed Home, Task, Gallery, Market, Account and Settings in both appearances, with no new console errors. The existing sidecar was reused and the previous executable/sidecar pair was backed up before replacement.

The regression script is `apps/preacherman-demo-host/tests/account-presentation.smoke.cjs`, using PLAYWRIGHT_MODULE and PRESENTATION_REPORT_DIR environment variables against the temporary 1420 preview. Native evidence, source check details and build logs are in `D:/preacherman/output/playwright/desktop-account-sync-20260917/`. The desktop build manifest records final hashes, timestamps, backup paths and resource checks.
