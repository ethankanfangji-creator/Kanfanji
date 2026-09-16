# KanFangJi full QA checklist

Last updated: 2026-09-15

Legend:

- `[x]` verified in the current automated/local test run
- `[ ]` requires manual browser/device verification

## Automated verification

- [x] TypeScript typecheck passes.
- [x] PDF privacy projection excludes unselected text and photos.
- [x] Selected photo tags and annotations remain in the PDF model.
- [x] PDF filename removes unsafe filesystem characters.
- [x] Long-text stress fixture renders a non-empty multi-page PDF.
- [x] Bundled Traditional/Simplified Chinese font renders successfully.
- [x] Bundled Thai font renders successfully.
- [x] Desktop Chromium local flow reaches the real PDF success state with Traditional Chinese content.
- [x] Existing unit tests pass.
- [x] Production build completes.

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

- [ ] Open a local-only viewing and generate a PDF without network access.
- [ ] Export uses the native file share sheet when file sharing is supported.
- [ ] Fallback opens the PDF in a new tab when direct file sharing is unavailable.
- [ ] Chinese text, punctuation, currency and page breaks render correctly.
- [ ] Five selected photos export without Safari reloading or terminating the page.
- [ ] Returning from the share sheet keeps the draft and card preview intact.

## Android Chrome

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

- [ ] iOS Safari complete.
- [ ] Android Chrome complete.
- [ ] Desktop Chrome complete.
- [ ] Desktop Safari complete.
- [ ] Product owner confirms PDF visual hierarchy and wording.

