# Desktop GitHub sign-in

Preacherman Desktop uses the same Supabase project as `https://preachermanai.com`:
`https://gzqmjzybaosxhkfgbxaz.supabase.co`. The GitHub OAuth application's homepage
can remain the website URL. Its authorization callback must remain
`https://gzqmjzybaosxhkfgbxaz.supabase.co/auth/v1/callback`.

Supabase's redirect allowlist additionally needs exactly
`preacherman://auth/callback`. This is the native desktop return address, not a
website or a replacement for GitHub's HTTPS callback. New users also require
Supabase's user signup switch to be enabled.

## Implementation

- Account's existing GitHub button starts the official Supabase PKCE flow in the
  system browser. No repository scopes are requested.
- Tauri registers the `preacherman` protocol for its current executable. The
  single-instance plugin forwards the callback to the already-running window and
  brings it forward. Both cold-start and running-window callbacks are supported.
- The controller initializes independently of the Account page. It validates the
  scheme, host, path, one-use code, pending attempt and timeout before exchanging
  the code. It then verifies the user with the server before showing the account.
- The Supabase SDK persists and refreshes its session in this app's WebView
  localStorage. It is not an OS credential vault. GitHub provider access/refresh
  tokens are discarded from persisted session data. No privileged project key or
  GitHub Client Secret is bundled, logged or requested in the desktop UI.
- Cancelled and expired attempts remove their PKCE verifier state. Duplicate and
  unsolicited callbacks are ignored. Signing out uses local scope so other
  devices remain signed in.
- Network requests have bounded timeouts. Account waiting, failure, identity and
  sign-out states use the existing theme tokens and typography.

Google/email remain explicitly unavailable. This change adds GitHub login only;
it does not migrate local chats/preferences, grant paid avatars, or implement
payments/cloud synchronization. Sharing a Supabase user ID is the foundation for
those later features, not evidence that they already synchronize.

## Verification

`tests/account-auth.test.mjs` checks controller security and lifecycle behavior.
The browser verification exercises the real pinned SDK with synthetic HTTP
responses, validates the PKCE challenge against the exchanged verifier, and
checks both appearances, cancellation, provider denial, callback after leaving
Account, restoring a session, and local logout. These checks do not substitute
for a real GitHub authorization round trip in the packaged application.

Native delivery evidence and the explicit live-auth verification result belong
in `desktop-build-manifest.json` and the corresponding `output/playwright` report.
