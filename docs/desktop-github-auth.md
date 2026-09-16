# Desktop GitHub sign-in

Preacherman Desktop uses the same Supabase project as `https://preachermanai.com`:
`https://gzqmjzybaosxhkfgbxaz.supabase.co`. The GitHub OAuth application's homepage
can remain the website URL. Its authorization callback must remain
`https://gzqmjzybaosxhkfgbxaz.supabase.co/auth/v1/callback`.

Supabase's redirect allowlist needs `http://127.0.0.1:43821/auth/callback**` for
the temporary desktop return listener and keeps `preacherman://auth/callback`
for deep-link compatibility. Neither replaces GitHub's HTTPS provider callback.
New users also require Supabase's user signup switch to be enabled.

## Implementation

- Account's existing GitHub button starts the official Supabase PKCE flow in the
  system browser. No repository scopes are requested.
- New browser attempts return through a temporary loopback listener (below).
  Tauri also registers the `preacherman` protocol for its current executable. The
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


## Browser return transport (2026-09-17)

The browser completed Supabase authorization with the correct deep-link redirect stored,
but never delivered it to Windows. New attempts use a temporary native listener on
`127.0.0.1:43821` instead. Add `http://127.0.0.1:43821/auth/callback**` to Supabase Auth's
redirect allowlist. Keep the existing website Site URL and GitHub HTTPS provider callback.

The listener starts before the browser opens, accepts only the attempt's random nonce,
and forwards the one-use authorization code to the existing PKCE exchange and server-side
user verification. It stops on return, cancellation, timeout, shutdown or local sign-out.
Pending attempts retain their nonce/verifier across a desktop restart. Stale cancellation
cannot stop a newer attempt. Host/path validation, bounded headers/timeouts and no CORS
prevent the endpoint from becoming a general local HTTP service. Codes and tokens are not
logged or reflected in the script-free completion page, which follows the desktop theme.

This is only OAuth return transport. No model, font, page, application asset or production
UI depends on a local HTTP server. The packaged desktop remains self-contained. The
existing custom protocol stays registered for compatible callers.
