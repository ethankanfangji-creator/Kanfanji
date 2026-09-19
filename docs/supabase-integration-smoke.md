# Supabase integration smoke test

This remote-only smoke test creates an isolated role matrix, exercises the
deployed application and Supabase APIs, and removes its fixtures in `finally`.
Do not point it at production unless the release operator has explicitly
approved creating short-lived Auth users and rows there.

## Prerequisites

- Node.js 22 or newer.
- The accepted release migrations, including
  `migrate-sensitive-table-least-privilege.sql`, are already applied to the
  target staging/branch project.
- The deployed app URL uses that same Supabase project and service-role key.
- Set these environment variables without placing values on the command line:
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_PUBLISHABLE_KEY` (or
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_SMOKE_APP_URL` (or `NEXT_PUBLIC_SITE_URL`)

For example, load an ignored environment file in the current shell and then
run:

```bash
npm run test:supabase:smoke
```

The script never prints keys, sessions, fixture passwords, or share tokens.
Each line is a `PASS`, `FAIL`, `SUCCESS`, or `CLEANUP` status labeled with a
unique `kf-smoke-...` run ID. A successful run exits zero only after cleanup.
An assertion or cleanup failure exits nonzero.

Cleanup is deliberately narrow: it removes only tracked Storage object names
whose filename starts with the run ID, rows tied to the one fixture viewing,
and the exact Auth user IDs created during that run. Cleanup still runs after
an assertion failure. If cleanup reports a failure, use the printed run ID to
inspect the staging project before rerunning; do not delete unrelated rows or
Storage prefixes.

## Collaboration contract

The least-privilege migration intentionally gives browser clients no direct
table privileges on `viewing_comments`, `viewing_members`, or
`viewing_invites`. The smoke test therefore asserts that a commenter's direct
table insert fails, then posts the comment through the deployed authenticated
comments API. That route checks the user's role and performs the atomic
comment/audit mutation with the service role. Direct `viewings` updates and
Storage operations remain client-facing contracts protected by grants and RLS,
so those checks use real owner/editor/commenter/viewer/revoked sessions.

## Grant metadata contract

`supabase/tests/release-grants-contract.sql` is a metadata-only assertion for
the least-privilege migration. Run it separately against staging with a
Postgres connection that can inspect grants. It starts a read-only transaction,
raises on any mismatch, and rolls back:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/release-grants-contract.sql
```

Do not run either remote test as part of local unit, lint, typecheck, or build
commands.
