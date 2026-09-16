# Share access security

## Runtime model (implemented)

Public share control is enforced **server-side** using:

1. `viewings.share_token` — unguessable CSPRNG hex URL token (not viewing id)
2. `viewings.property.shareAccess` — `{ linkId, status, expiresAt, passwordHash, … }`
3. Owner APIs under `/api/share/links*`
4. Public resolve via `resolvePublicShare()` → `PublicSharePayload` only
5. Password unlock → httpOnly cookie (`kf_su_<fingerprint>`), never in URL

Optional table `share_links` (see `supabase/migrate-share-links.sql`) is mirrored when present; MCP could not apply it in this environment — app works without it.

## Controls

| Control | Status |
|---|---|
| Unguessable token | Done (`generateShareToken` / `newShareToken`) |
| Read-only public page | Done |
| Expiry | Done (`shareAccess.expiresAt`, gate in resolve) |
| Password (hashed, cookie unlock) | Done (scrypt hash; cookie HMAC) |
| Revoke | Done (clears `share_token`, status=revoked) |
| Rotate | Done (new token; old URL fails) |
| Strip transcripts / audio / user_id | Done (`toPublicSharePayload`) |
| Analytics PII | None collected |
| Status + last updated UI | Done (`ShareAccessPanel`) |
| Error pages | Done (missing / expired / revoked / password / error) |

## API

See `lib/share-access/contract.ts`. Routes are live (no longer 501).

## Applying `share_links` migration (optional hardening)

When you have DB migration rights:

```bash
# apply supabase/migrate-share-links.sql in SQL editor or CLI
```

After apply, resolvers prefer `share_links` rows and keep `property.shareAccess` in sync.
