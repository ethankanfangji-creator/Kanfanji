This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Production guest AI needs `AI_GUEST_COOKIE_SECRET` in Vercel (server-only). Without it, guests get HTTP 503 `ai_identity_unavailable`. `SUPABASE_SERVICE_ROLE_KEY` can sign that cookie as a fallback, but do not use it as the only secret and never expose it to the client. See `DEPLOY.md` and `.env.example`.

## Billing (Stripe)

- Checkout: `POST /api/create-checkout-session`
- Customer portal: `POST /api/create-portal-session` (enable in Stripe Dashboard → Billing → Customer portal; configure return URL `${NEXT_PUBLIC_SITE_URL}/`; test/live separately)
- Manual sync: `POST /api/billing/sync`
- New viewings: `POST /api/viewings` (server free-tier / Pro gate). Apply `supabase/migrate-viewings-insert-gate.sql` after deploy.
- See `DEPLOY.md` for dual-env notes and acceptance checklist.
