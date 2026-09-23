# Dual environment (prod + dev)

## Branches
- `main` → Production (kanfangji-prod)
- `dev` → Preview / testing (kanfangji-dev)

## Local
1. Fill `.env.local` with **kanfangji-dev** Supabase keys
2. `npm run dev`

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
| STRIPE_* | live | test |
| NEXT_PUBLIC_SITE_URL | https://kanfangji.vercel.app | Preview URL / custom domain |

## Stripe Billing Portal
1. In Stripe Dashboard → **Settings → Billing → Customer portal**: turn the portal on (test and live separately).
2. Allow return URL `${NEXT_PUBLIC_SITE_URL}/` (and Preview URLs if needed).
3. App routes:
   - `POST /api/create-portal-session` — opens portal for the logged-in user's `subscriptions.stripe_customer_id`
   - `POST /api/billing/sync` — pulls Stripe subscription → upserts DB + `viewings.is_pro` (rate-limited)
4. After deploy, run SQL `supabase/migrate-viewings-insert-gate.sql` so authenticated clients can no longer INSERT viewings (create goes through `POST /api/viewings`).

## Manual acceptance
- Portal: Pro / prior-checkout user →「管理訂閱」→ return to site.
- Sync: set DB `subscriptions.status` out of sync with Stripe →「重新同步訂閱」→ status / isPro / `viewings.is_pro` match Stripe.
- Gate: logged-in non-Pro with ≥3 viewings → `POST /api/viewings` returns 402 `FREE_LIMIT_REACHED` even if UI is bypassed.
- Two users: user A cannot sync user B's customer (API only reads A’s row by `auth.uid()`).
- `#2` invariant: `/?checkout=success` alone never grants Pro.

