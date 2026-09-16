# Permanent member identity

The app-wide Account dock and signed-in navigation item share the server-verified
Supabase identity. The profile is fetched once per account, cancelled on sign-out
and guarded against late responses from another account. Both entries open Account.

`profiles.member_number` is a permanent server-assigned number. A private counter
and signup trigger allocate numbers atomically; failed transactions roll back the
allocation, and deleted numbers are never reused. The existing GitHub member is
number 1. By explicit user choice, the older email test account stays unnumbered.
New registrations start at 2. Desktop and website use the same Supabase project.

Per-user profile RLS and column write privileges prevent clients reading other
profiles or setting numbers. The allocator is a non-exposed, non-callable private
trigger with an empty search path. Its counter deliberately has no client RLS
policy or privileges (default deny). Metadata is used for display only.

GitHub avatar HTTPS origin is narrowly allowed by CSP; unavailable images use the
outlined user icon. Pending/failed lookups never invent a number. Account provides
an explicit retry. The original shell font and all existing routes are retained.

Validation: TypeScript and 23 focused account/member/appearance/lens tests pass.
Real database transactional checks verify #1 bootstrap, #2/#3 registration,
login idempotence, own-profile RLS, denied number writes and anonymous reads,
counter privacy and non-reuse. Synthetic users were rolled back; counter is 1.
Security advisor has only the deliberate private default-deny INFO and the
pre-existing leaked-password-protection warning.

The wider app-shell suite has two pre-existing stale assertions: it assumes
tauriClient is the sole native API import (useWindowActivity already imports it)
and an older `activeSurfaceType !== "ledger"` condition in unchanged App.tsx.
These files and assertions predate this change; they are not adjusted here.

Deployment and native evidence: desktop-build-manifest.json and
`D:/preacherman/output/playwright/account-member-20260917`.
