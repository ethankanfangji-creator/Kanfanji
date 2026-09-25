# Dual environment (prod + dev)

Stack inventory, service interfaces, and env var roles: see [`docs/STACK.md`](./docs/STACK.md).
Schema / CLI migrations: see [`supabase/README.md`](./supabase/README.md).

## Branches
- `main` → Production (kanfangji-prod)
- `dev` → Preview / testing (kanfangji-dev)

## Local
1. Fill `.env.local` with **kanfangji-dev** Supabase keys
2. Optional DB: `npx supabase start` then `npx supabase db reset` (applies `supabase/migrations/`)
3. `npm run dev`

### Schema changes (local → remote)
1. `npx supabase migration new <name>` — edit the new SQL under `supabase/migrations/`
2. Apply locally with `npx supabase db reset` (or `db push` to a linked remote)
3. Open PR; after merge, push to **dev** then **prod** (`supabase db push` or Dashboard / MCP). Do not put secrets in SQL.
4. Private media: confirm `viewing-media` stays `public=false` (migration `ensure_private_viewing_media`).

## Deploy flow
```bash
# develop on dev
git checkout dev
# ... make changes ...
git add -A && git commit -m "..." && git push origin dev
# → Vercel Preview (dev Supabase)

# promote to prod when OK
git checkout main
git merge dev
git push origin main
# → Vercel Production (prod Supabase)
```

## Vercel env mapping
| Variable | Production | Preview |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | kanfangji-prod | kanfangji-dev |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | prod | dev |
| SUPABASE_SERVICE_ROLE_KEY | prod | dev |
| OPENAI_API_KEY | (shared or separate) | (shared or separate) |
| AI_GUEST_COOKIE_SECRET | **required** (own secret; do not rely only on the service role key) | set a separate value |
| STRIPE_* | live | test |
| NEXT_PUBLIC_SITE_URL | https://kanfanji.vercel.app | Preview URL / custom domain |

## Stripe Billing Portal
1. In Stripe Dashboard → **Settings → Billing → Customer portal**: turn the portal on (test and live separately).
2. Allow return URL `${NEXT_PUBLIC_SITE_URL}/` (and Preview URLs if needed).
3. App routes:
   - `POST /api/create-portal-session` — opens portal for the logged-in user's `subscriptions.stripe_customer_id`
   - `POST /api/billing/sync` — pulls Stripe subscription → upserts DB + `viewings.is_pro` (rate-limited)
4. After deploy, ensure insert gate is applied (`viewings` INSERT is service-role / `POST /api/viewings` only) — see `supabase/migrations/` and the release runbook.

## Media (private bucket)
- Bucket `viewing-media` is private; clients must not rely on `/object/public/...`.
- Playback uses signed URLs (`lib/media.ts`, `POST /api/media/sign`).
- Share cards use short TTL signed URLs; refresh with `POST /api/share/public/[token]/media`.

## Manual acceptance
- Portal: Pro / prior-checkout user →「管理訂閱」→ return to site.
- Sync: set DB `subscriptions.status` out of sync with Stripe →「重新同步訂閱」→ status / isPro / `viewings.is_pro` match Stripe.
- Gate: logged-in non-Pro with ≥3 viewings → `POST /api/viewings` returns 402 `FREE_LIMIT_REACHED` even if UI is bypassed.
- Two users: user A cannot sync user B's customer (API only reads A’s row by `auth.uid()`).
- `#2` invariant: `/?checkout=success` alone never grants Pro.
- Media: unauthenticated public object URL fails; signed URL from an authorized session plays.
