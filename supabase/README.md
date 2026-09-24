# Supabase migrations (CLI)

## Layout

| Path | Role |
| --- | --- |
| `supabase/config.toml` | Local CLI config (no secrets) |
| `supabase/migrations/` | **Source of truth** for forward schema changes |
| `supabase/schema.sql` | Current converged baseline (copied into first migration) |
| `supabase/migrate-*.sql` | **Legacy** one-off scripts (archive; prefer `migrations/`) |
| `docs/release-migration-runbook.md` | Historical remote apply order + RLS checks |

## Baseline

`20250901000000_baseline_current_schema.sql` is a snapshot of prod-shaped schema
(`schema.sql`): tables, RLS, storage policies, grants. Fresh local DBs apply it
first, then later migrations.

Already-provisioned **dev/prod** databases must **not** re-run the baseline.
Mark it applied (repair) once, then only push newer migrations.

## Local

```bash
# Optional: Docker local stack
npx supabase start

# Reset DB from migrations (destroys local data)
npx supabase db reset

# Or apply pending migrations to a linked remote
npx supabase link --project-ref <ref>
npx supabase db push
```

Use **kanfangji-dev** keys in `.env.local` for app runtime (see `DEPLOY.md`).

## Dev / Preview remote

```bash
npx supabase link --project-ref <kanfangji-dev-ref>
# First time only — baseline already exists on remote:
npx supabase migration repair 20250901000000 --status applied
npx supabase db push
```

Or apply a single SQL file via Dashboard / MCP `apply_migration` (no secrets in SQL).

## Production

1. Open PR with new files under `supabase/migrations/` only (never commit service role keys).
2. Review: idempotent where possible; RLS preserved; no `SECURITY DEFINER` in `public` without audit.
3. Apply after merge:

```bash
npx supabase link --project-ref <kanfangji-prod-ref>
# If baseline not yet recorded in remote migration history:
npx supabase migration repair 20250901000000 --status applied
npx supabase db push
```

4. Smoke: `docs/release-migration-runbook.md` verification queries + private media checks below.

## Private media (`viewing-media`)

- Bucket is **private** (`public = false`). Unauthenticated `/object/public/...` URLs must 400/404.
- App stores **storage paths** (`ownerId/viewingId/photos/...`), not public URLs.
- Reads use short-TTL **signed URLs**:
  - Owner/editor playback: `createSignedMediaUrl` / `POST /api/media/sign` (1h)
  - Share cards: `resolvePublicShare` + `POST /api/share/public/[token]/media` (30m, refreshable)
- Uploads: authenticated storage policies (owner folder or collaboration editor).

### Accept checks

```bash
# Must fail without a signature (replace HOST/PATH)
curl -sI "https://<PROJECT>.supabase.co/storage/v1/object/public/viewing-media/<owner>/<viewing>/photos/x.jpg"
# Expect 400/404 — not 200

# Authenticated app: open a viewing with media → image/audio loads via signed URL
# Share: open /s/<token> → photos load; after TTL, refresh via POST .../media
```

Legacy public objects (if any remain): migrate path rewriting in a follow-up PR;
`toStoragePath()` already accepts old public/signed URL forms.

## Adding a migration

```bash
npx supabase migration new short_description
# edit supabase/migrations/<timestamp>_short_description.sql
# never put secrets, API keys, or PII in migration SQL
```

## Related app code

- `lib/media.ts` — upload + signed URL helpers
- `lib/media-sign.ts` — TTL constants + path authorization
- `lib/media-paths.ts` — path extraction from legacy URLs
- `lib/share.ts` — share publication signing + refresh
