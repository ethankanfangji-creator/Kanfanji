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
