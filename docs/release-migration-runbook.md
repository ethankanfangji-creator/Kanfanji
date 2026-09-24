# Release migration runbook

Last verified: 2026-09-24

**CLI workflow (preferred going forward):** see [`supabase/README.md`](../supabase/README.md).
New changes live in `supabase/migrations/`. Legacy `supabase/migrate-*.sql` files remain as
historical apply scripts; do not add new one-offs there.

This runbook still records remote history for forensics. It is not authorization to
replay or edit an applied migration.

## Least-privilege forward fix

`supabase/migrate-sensitive-table-least-privilege.sql` was applied after the
first six migrations below. It revokes inherited/direct `PUBLIC`, `anon`, and
`authenticated` privileges on the sensitive application tables, then restores
only:

- authenticated column-level `INSERT`/`UPDATE` and allowlisted `SELECT` on
  `viewings` for browser sync, including create-only `idempotency_key` and
  mutable `revision` after the pending grants forward fix;
- authenticated `SELECT (user_id, status, plan)` on `subscriptions`;
- service-role access to all seven tables.

It intentionally grants no client table privileges on `properties`,
`viewing_members`, `viewing_invites`, `viewing_comments`, or
`viewing_audit_events`. Share/collaboration routes authenticate with the user
client and perform database mutations through the service-role client.

## Applied order

1. `20260916061954 release_share_hardening`
   (`supabase/migrate-share-hardening.sql`)
2. `20260916062018 release_sync_idempotency`
   (`supabase/migrate-sync-idempotency.sql`)
3. `20260916062045 release_ai_quota_boundary`
   (`supabase/migrate-ai-boundary.sql`)
4. `20260916062112 release_billing_audit_authorization`
   (`supabase/migrate-billing-audit-authorization.sql`)
5. `20260916062531 release_advisor_risk_followup`
   (`supabase/migrate-advisor-risk-followup.sql`)
6. `20260916062612 release_extension_hardening`
   (`supabase/migrate-extension-hardening.sql`)
7. `20260916064503 release_sensitive_table_least_privilege`
   (`supabase/migrate-sensitive-table-least-privilege.sql`)
8. `20260916134536 release_share_resolution_forward_fix`
9. `20260916134935 release_share_resolution_forward_fix`
10. `20260916134952 release_stripe_ordering_forward_fix`
11. `20260916134958 release_viewing_update_grants_forward_fix`

The first five entries are the functional release set. Extension hardening
moves `citext` into the non-exposed `extensions` schema, and the seventh entry
removes inherited client grants. Remote inspection also shows installed
`pgcrypto` and `uuid-ossp` in `extensions`.

## Applied additive forward-fix order

These files were applied through the reviewed release path in this order:

1. `supabase/migrate-share-resolution-forward-fix.sql`
2. `supabase/migrate-stripe-ordering-forward-fix.sql`
3. `supabase/migrate-viewing-update-grants-forward-fix.sql`

The share resolution migration appears twice in remote history because the
first approval response was lost and the idempotent migration was replayed.
Both entries resolved to the same function and grant definitions; do not remove
or rewrite either history row.

The first adds CAS share mutations and a service-role-only publication resolver.
The second orders same-second Stripe events by `(created, safety rank, event id)`;
non-entitled states outrank active/trialing, so cancellation cannot be undone by
a same-second active event. The third removes authenticated `UPDATE` privileges
for `idempotency_key`, `is_pro`, and `property_id`.

Fresh provisioning is a composed workflow: run `supabase/schema.sql`, then all
of the following in order:

1. `migrate-viewing-collaboration.sql`
2. `migrate-collaboration-sensitive-columns.sql`
3. `migrate-notes-share-private-media.sql`
4. `migrate-share-hardening.sql`
5. `migrate-sync-idempotency.sql`
6. `migrate-ai-boundary.sql`
7. `migrate-billing-audit-authorization.sql`
8. `migrate-advisor-risk-followup.sql`
9. `migrate-extension-hardening.sql`
10. `migrate-sensitive-table-least-privilege.sql`
11. `migrate-share-resolution-forward-fix.sql`
12. `migrate-stripe-ordering-forward-fix.sql`
13. `migrate-viewing-update-grants-forward-fix.sql`
14. `migrate-properties-multicountry.sql` (country_code / admin1 / city / postal_code on properties)
15. `migrate-property-domain.sql` then `migrate-property-report-created-by.sql` (report snapshots + `created_by` owner scope)

The base schema already incorporates the older auth, property, subscription,
and initial share-link migrations. `schema.sql` alone intentionally does not
install the collaboration tables/policies.

## Pre-release and post-release verification

Record the output, timestamp, project reference, and operator for each run:

```sql
select version, name
from supabase_migrations.schema_migrations
where version >= '20260916061954'
order by version;

select e.extname, n.nspname as extension_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('citext', 'pgcrypto', 'uuid-ossp')
order by e.extname;

select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relname in (
    'viewings', 'viewing_members', 'viewing_invites', 'viewing_comments',
    'viewing_audit_events', 'share_links', 'share_unlock_limits', 'objects'
  )
order by n.nspname, c.relname;
```

Expected after release: all seven migration entries appear exactly once and in
the order above. All listed relations have RLS enabled; the three extensions
are not in `public`.

Verify privileged functions are not client-callable:

```sql
select p.oid::regprocedure as function_name,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'execute') as service_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'consume_ai_quota_internal',
    'consume_share_unlock_attempt',
    'find_or_create_property',
    'mutate_viewing_with_audit',
    'process_stripe_subscription_event',
    'rotate_share_link'
  )
order by p.proname;
```

Expected: `anon_execute=false`, `authenticated_execute=false`, and
`service_execute=true` for every listed function.

## RLS and Storage role matrix

First inventory effective policies and grants:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and tablename in (
    'viewings', 'viewing_members', 'viewing_invites', 'viewing_comments',
    'viewing_audit_events', 'share_links', 'share_unlock_limits', 'objects'
  )
order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_schema, table_name, grantee, privilege_type;

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('viewings', 'subscriptions')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type, column_name;
```

Table grants are not proof of access; RLS must be exercised with fixtures. Use
dedicated staging owner/editor/commenter/viewer/revoked/outsider users and run
each case inside a rolled-back transaction:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<USER_UUID>';

select id, user_id, address, photo_urls, video_urls
from public.viewings
where id = '<VIEWING_UUID>';

select id, body
from public.viewing_comments
where viewing_id = '<VIEWING_UUID>';

select name
from storage.objects
where bucket_id = '<PRIVATE_BUCKET>'
  and name like '<OWNER_UUID>/<VIEWING_UUID>/%';
rollback;
```

Expected matrix:

- Owner: read/write viewing and media, manage members/invites, read audit,
  manage public links.
- Editor: read/update viewing, append photo/video/audio, comment; cannot manage
  membership or public links.
- Commenter: read viewing/media and add comments; cannot update viewing.
- Viewer: read viewing/photo/video; audio paths and signed audio access denied.
- Revoked member and outsider: no viewing, collaboration, or Storage rows.
- Anonymous: no private rows; public share content is available only through
  the server resolver and immutable published projection.

For Storage, additionally exercise upload, update, select, and signed-URL
creation through the same server/API path used by the app. Confirm object names
use `owner_id/viewing_id/folder/file`, editor uploads retain the owner prefix,
viewer audio signing fails, and revoked users cannot obtain a new signed URL.

## Application-level database smoke

- Publish a share and save its `published_snapshot`/`media_manifest`; mutate the
  source viewing and confirm the public response is unchanged.
- Attempt to update either published field in place and expect rejection.
- Rotate the link; confirm the old token fails and the new row contains the same
  immutable snapshot. Revoke it and confirm it stops resolving immediately.
- Submit duplicate and older Stripe event IDs; confirm ledger outcomes are
  duplicate/out-of-order and active subscription state does not regress.
- Repeat an idempotent viewing/media operation; confirm no duplicate media and
  no unintended revision increment.
- Exhaust test-only AI/share-unlock quota keys; confirm denial and retry timing,
  with no fallback that bypasses the database-backed limiter.

## Rollback and forward-fix strategy

These migrations have already been applied and contain data/security cutovers.
Do not edit or re-run their files, and do not use a destructive down migration
during an incident.

1. Stop or disable only the affected application feature.
2. Preserve rows, audit events, snapshots, and migration history.
3. Capture the failing SQL/API response, advisor output, and affected IDs.
4. Create a new additive, idempotent forward-fix migration.
5. Validate it on a Supabase branch/staging project with the role matrix above.
6. Back up affected data, apply through the normal reviewed release path, then
   rerun database and application smoke checks.

If application rollback is required, deploy code compatible with the additive
schema. Never restore legacy public-share resolution that bypasses immutable
snapshots or password gating.

## Advisor status and remaining dashboard action

Security advisor result at the timestamp above: no database-object finding;
one external Auth warning remains:

- **Leaked Password Protection Disabled** — enable it in the Supabase Dashboard
  Auth password-security settings, then rerun advisors. This is a dashboard
  setting, not a SQL migration. See
  <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>.

Performance advisor result: five INFO-level unused-index findings
(`viewings_property_id_idx`, `subscriptions_stripe_customer_id_idx`,
`viewings_client_updated_at_idx`, `viewing_members_user_active_idx`,
and `stripe_webhook_events_received_at_idx`). These indexes are new and have
not seen normal traffic. Retain them for release, gather usage after
representative traffic, then reassess with
<https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>.
