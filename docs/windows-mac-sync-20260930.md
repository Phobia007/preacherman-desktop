# Windows synchronization after Mac updates

The source was fast-forwarded from aeab7a8 to desktop/main 6623d28. The independent D:/preacherman checkout was preserved. The canonical Windows shortcut uses the self-contained production executable and unchanged verified Windows sidecar; no runtime HTTP asset dependency was introduced.

Native verification found an optional initSync call still unguarded in the root Gallery runtime. Both entry points are now patched consistently, with behavioral regression coverage. The first build was rolled back before the repaired release was deployed.

TypeScript and 18 initial focused tests passed; seven focused checks passed after the Gallery fix. Preview verification covered six routes in both appearances and eight viewport/theme combinations. Native checks covered the same routes, live companion motion, audio UI, the decorative ring, maximize/restore/minimize, and close with sidecar cleanup. The canonical shortcut was restarted normally after verification.

Live session refresh could not be verified: the saved account's Supabase token endpoint returned ERR_CONNECTION_CLOSED. The identical failure was reproduced on the previous verified executable. Credentials and local account data were preserved. Legacy embedded-content diagnostics remain recorded separately; no new page errors were observed after the Gallery fix.

The build manifest records source commit, production SHA-256 and timestamp, matching rollback pair, verification evidence and resource sample. Detailed evidence: D:/preacherman/output/playwright/mac-sync-20260930/.
