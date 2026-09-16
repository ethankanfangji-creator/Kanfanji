# KanFangJi full QA checklist

Last updated: 2026-09-15

Legend:

- `[x]` verified in the current automated/local test run
- `[ ]` requires manual browser/device verification

## Automated verification

- Final-run timestamp: `2026-09-16 13:56 UTC`
- `npm test`: `PASS — 46 files / 197 tests / 9.86s`
- `npm run test:e2e`: `PASS — Chromium only, 3 tests / 22.6s`
- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS`
- `npm run build`: `PASS — Next.js 16.3.4 production build`
- `git diff --check`: `PASS`
- Remote schema/RLS/policy/extension assertions: `PASS — read-only check at 2026-09-16 06:31 UTC`
- Remote fixture-based owner/editor/commenter/viewer/revoked role exercise:
  `PASS — isolated run kf-smoke-20260916135016-b0a03c7f; cleanup complete`
- Supabase security advisors: `2026-09-16 13:53 UTC — one WARN: leaked-password protection disabled`
- Supabase performance advisors: `2026-09-16 06:59 UTC — five INFO unused-index findings; retain through initial traffic and recheck`

The unit suite is expected to cover PDF privacy projection, selected annotations,
safe filenames, long-text rendering, bundled CJK/Thai fonts, hydration stability,
immutable publication, account-scoped drafts, quota denial, and offline cache
exclusions. The Chromium smoke suite covers the guest/local wizard, accessible
control names, manifest and offline routes, and public-share cache headers.

## Remote migration order

The following entries are already recorded remotely; do not reapply them:

1. `20260916061954 release_share_hardening` — `supabase/migrate-share-hardening.sql`
2. `20260916062018 release_sync_idempotency` — `supabase/migrate-sync-idempotency.sql`
3. `20260916062045 release_ai_quota_boundary` — `supabase/migrate-ai-boundary.sql`
4. `20260916062112 release_billing_audit_authorization` — `supabase/migrate-billing-audit-authorization.sql`
5. `20260916062531 release_advisor_risk_followup` — `supabase/migrate-advisor-risk-followup.sql`
6. `20260916062612 release_extension_hardening` — `supabase/migrate-extension-hardening.sql`
7. `20260916064503 release_sensitive_table_least_privilege` —
   `supabase/migrate-sensitive-table-least-privilege.sql`
8. `20260916134536 release_share_resolution_forward_fix`
9. `20260916134935 release_share_resolution_forward_fix` — idempotent replay
   recorded after the first approval response was lost; no schema divergence
10. `20260916134952 release_stripe_ordering_forward_fix`
11. `20260916134958 release_viewing_update_grants_forward_fix`

See `docs/release-migration-runbook.md` for database assertions, role-matrix
queries, advisor findings, and forward-fix guidance.

## Database smoke assertions

- [x] All eleven migration history entries above exist in order; the share
  resolution forward fix is recorded twice because an approval response was
  lost and the idempotent migration was replayed.
- [x] RLS is enabled on `viewings`, collaboration tables, `share_links`,
  `share_unlock_limits`, and `storage.objects`.
- [x] Anonymous users cannot read or mutate private viewing/share rows.
- [x] Owners can read/write their viewing; editors can update content and media;
  commenters can read/comment; viewers are read-only and cannot receive audio.
- [x] Revoked members lose row and new signed-URL access.
- [x] Published snapshots and media manifests cannot be changed in place;
  rotation revokes the old row and copies the immutable snapshot to a new row.
- [x] Share unlock and AI quota functions reject client roles and execute only
  through the server/service role.
- [x] `citext` is installed in `extensions`, not
  the exposed `public` schema.
- [x] Storage paths use `owner_id/viewing_id/folder/file`; cross-owner paths fail.
- [x] Stripe duplicate and out-of-order events do not regress subscription state
  (route/contract tests; no real Stripe event was emitted).

## PDF content and privacy

- [ ] Address and viewing date match the share-card preview.
- [ ] Unit, price, layout, area, management fee, listing URL and setup notes match the share card.
- [ ] Overall rating matches the share card, including the empty state.
- [ ] Pros, risks, facts, follow-up questions and action items include only selected entries.
- [ ] Unselected text cannot be found by searching or copying text from the generated PDF.
- [ ] Only selected photos appear.
- [ ] Photo tags and annotations match the share card.
- [ ] AI disclaimer and summary generation time appear.
- [ ] Very long address, notes and list items wrap without clipping or overlap.
- [ ] Multiple pages have no overlapping footer, text or photos.
- [ ] Portrait and landscape photos stay within page bounds.
- [ ] Failed photo loading shows an error and Retry; no PDF is silently produced with missing selected photos.
- [ ] Repeated export does not duplicate, freeze or leak stale blob URLs.

## iOS Safari

- **Release status: PENDING physical-device verification; not passed.**
- [ ] Open a local-only viewing and generate a PDF without network access.
- [ ] Export uses the native file share sheet when file sharing is supported.
- [ ] Fallback opens the PDF in a new tab when direct file sharing is unavailable.
- [ ] Chinese text, punctuation, currency and page breaks render correctly.
- [ ] Five selected photos export without Safari reloading or terminating the page.
- [ ] Returning from the share sheet keeps the draft and card preview intact.

## Android Chrome

- **Release status: PENDING physical-device verification; not passed.**
- [ ] Local-only PDF generation works offline.
- [ ] PDF downloads or opens through the native share flow.
- [ ] Chinese/Thai text and page breaks render correctly.
- [ ] Multiple selected photos and long annotations export successfully.
- [ ] Retry succeeds after intentionally interrupting photo preparation.

## Desktop Chrome

- [ ] `.pdf` downloads with a safe address/date filename.
- [ ] PDF opens in Chrome PDF Viewer and all expected sections are searchable.
- [ ] Long-text and multi-photo stress case has correct pagination.
- [ ] Export works after refresh restores the IndexedDB draft.

## Desktop Safari

- **Release status: PENDING physical-device verification; not passed.**
- [ ] `.pdf` downloads or opens in a new tab.
- [ ] CJK/Thai glyphs, links and page numbers render correctly.
- [ ] Multi-page text and images do not overlap.
- [ ] Export can be retried after a simulated image-fetch failure.

## Offline and draft recovery

- [ ] Create a new viewing while offline; setup, notes and media persist in IndexedDB.
- [ ] Refresh the page; wizard step, fields, AI summary and media restore.
- [ ] Generate and export the share-card PDF without signing in or syncing.
- [ ] Reconnect and sync; the same selected share-card content remains.

## Camera and microphone permissions

- [ ] App startup does not request camera or microphone access.
- [ ] Deny microphone permission; guidance and manual audio import remain available.
- [ ] Deny camera permission; guidance and gallery/file import remain available.
- [ ] Block/revoke permission in browser settings; UI exits capture safely and offers Retry.
- [ ] Unsupported and in-use states do not leave a recorder running.

## Recording and video persistence

- [ ] Stop audio recording; blob is saved before transcription starts.
- [ ] Background/lock/reload after stopping; pending audio restores safely.
- [ ] Stop or return from video capture; clip is immediately stored in IndexedDB.
- [ ] Cancel recording/video; no unintended media row remains.
- [ ] Audio and video remain available after moving between wizard steps.

## Multiple photo uploads

- [ ] Import/capture at least five photos in one viewing.
- [ ] Originals and thumbnails persist after refresh.
- [ ] Tags and annotations persist and appear only when their photo is selected.
- [ ] PDF image resizing preserves orientation and acceptable quality.

## Sync interruption and retry

- [ ] Interrupt the network during viewing upload; status becomes failed/pending, not falsely synced.
- [ ] Retry after reconnection uploads each media item once.
- [ ] Revision conflict does not silently overwrite another editor.
- [ ] PDF export remains available from the local snapshot during sync failure.

## AI generation failure

- [ ] Force transcription/AI API failure; original notes and media remain.
- [ ] Retry regenerates AI content without duplicating media.
- [ ] PDF can still export manually entered/previously saved selected content.
- [ ] AI disclaimer is present even after AI generation is retried.

## Share-link expiry and revocation

- [ ] Active link displays only the selected public projection.
- [ ] Expired link shows the expired state and no private payload.
- [ ] Revoked link stops resolving immediately.
- [ ] Password-protected link does not expose content before unlock.
- [ ] PDF never includes share password/hash, raw audio, transcript, member email or collaboration metadata.

## Release sign-off

- [ ] iOS Safari physical-device checks complete (**PENDING**).
- [ ] Android Chrome physical-device checks complete (**PENDING**).
- [ ] Desktop Chrome complete.
- [ ] Desktop Safari checks complete (**PENDING**).
- [ ] Product owner confirms PDF visual hierarchy and wording.

