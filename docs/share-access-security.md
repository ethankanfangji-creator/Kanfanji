# Share access security

## Runtime model (implemented)

Public share control is enforced **server-side** using:

1. `share_links` is the sole authority; legacy `viewings.share_token` and
   `property.shareAccess` are not public resolution paths.
2. The URL contains an unguessable CSPRNG token, never the viewing ID.
3. Owner APIs under `/api/share/links*` publish and manage links.
4. Link creation builds an allowlisted `published_snapshot` and stable-path
   `media_manifest`. Local/blob/data URLs cannot be published.
5. Public resolve gates missing/revoked/expired/password states before returning
   a `PublicSharePayload`.
6. Password unlock uses scrypt verification, a database-backed attempt limiter,
   and an httpOnly signed cookie (`kf_su_<fingerprint>`), never URL state.

## Controls

- Unguessable read-only token: implemented.
- Expiry and immediate revocation gates: implemented.
- Password hash, cookie unlock, and atomic rate limiting: implemented.
- Immutable publication: database trigger blocks in-place changes to
  `published_snapshot` and `media_manifest`.
- Rotation: atomically revokes the old row and creates a new token carrying the
  same immutable publication.
- Least-privilege DTO: built from selected fields; recursively rejects account
  IDs, audio, transcripts, questions, password/hash, and collaboration metadata.
- Selected photos: only stable uploaded paths are retained; signed URLs are
  generated at resolve time and are not stored in the snapshot.
- Owner-only management: editors cannot create, rotate, update, or revoke links.
- Status and error UI: active, missing, expired, revoked, password, and error.
- Analytics PII: none collected by this feature.

## API

See `lib/share-access/contract.ts`. Public pages and all `/api` requests are
excluded from the service-worker cache. `/s/*`, `/c/*`, invite, viewing, and
comparison pages are also excluded so public/private projections and signed
media cannot be replayed from the app shell cache. Responses must retain
`private`, `no-store`, or `no-cache` semantics in the Chromium smoke test.

## Verification

- Publish, then change the source viewing: public output must not change.
- Attempt an in-place snapshot/media update: the database must reject it.
- Rotate: old token fails; new token returns the same snapshot.
- Revoke: token stops resolving immediately.
- Password failures consume the shared database limit and never fall back to an
  in-memory bypass.
- Search the public JSON for every forbidden key and for unselected text/media.

The applied release migration is `release_share_hardening`; do not replay or
edit it. See `docs/release-migration-runbook.md` for remote state and forward-fix
policy.
