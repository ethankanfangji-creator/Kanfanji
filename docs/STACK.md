# Kanfangji stack & service boundaries

Last updated: 2026-09-19. Living inventory for agents and humans.

## Runtime stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | See `package.json` |
| Styling | Tailwind CSS 4 | Mobile-first wizard UI |
| Database | Supabase Postgres + RLS | SQL under `supabase/` |
| Auth | Supabase Auth (`@supabase/ssr`) | Cookie session; guest drafts in IndexedDB |
| Storage | Supabase Storage `viewing-media` | Private objects + signed URLs |
| Local draft | IndexedDB (`lib/idb`, `lib/draft-db`) | Guests can create/read without login |
| AI | OpenAI (`gpt-4o-mini`, Whisper) | **Server routes only** via `lib/ai-boundary` + `AiService` |
| Geocoding | BC Address Geocoder + OSM Nominatim | **Server only** via `AddressService` |
| Property intel | Property facts pipeline → projected intel; BC/Google/OSM/Bing evidence (+ optional ATTOM); DB cache | `/api/property-facts`, `/api/property-intel` — no crawling; LLM does not invent facts |
| Payments | Stripe Checkout + webhook | Server secrets only |
| i18n | `zh-Hant` / `zh-Hans` / `en` / `th` | `lib/i18n/*` — no hardcoded product copy in new UI |
| Tests | Vitest + Playwright | `npm test` / `npm run test:e2e` |

## Environment variables (names only)

### Public (safe in browser)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPPORT_EMAIL` (optional Contact support mailto)

### Server secrets (never ship to client)

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- `AI_GUEST_COOKIE_SECRET`, `AI_QUOTA_HASH_SECRET`
- `SHARE_COOKIE_SECRET`
- Optional quotas/timeouts: `AI_UPSTREAM_TIMEOUT_MS`, `AI_*_DAILY_LIMIT`, `AI_QUOTA_WINDOW_SECONDS`
- Optional property intel: `GOOGLE_MAPS_API_KEY`, `BING_SEARCH_API_KEY`, `ATTOM_API_KEY`, `PROPERTY_INTEL_CACHE_TTL_HOURS`

If a dedicated AI/share cookie secret is unset, code may fall back to `SUPABASE_SERVICE_ROLE_KEY` — configure dedicated secrets in production.

## Service interfaces (`lib/services/*`)

UI and route handlers should depend on these interfaces, not vendor SDKs.

| Service | Interface | Real adapter | Mock adapter | Status |
| --- | --- | --- | --- | --- |
| Sync | `ViewingSyncAdapter` (`lib/sync`) | Supabase | Mock | **Done** |
| Media permissions | `MediaPermissionAdapter` (`lib/media-permissions`) | Browser | Mock | **Done** (ChatComposer uses adapter) |
| AI | `AiService` | `createOpenAiService` | Mock | **Wired** `/api/integrate-input` |
| Address | `AddressService` | `createServerAddressService` | Mock | **Wired** suggest + lookup routes |
| Geolocation | `GeolocationService` | Browser | Mock | **Wired** ClientPage |
| Speech-to-text | `SpeechService` | Whisper via process-recording | Mock | Interface + mock; route still owns Whisper call (TODO thin wrap) |
| Storage upload | `MediaStorageService` | Supabase | Mock | Interface + mock; `lib/media.ts` remains (TODO wire) |
| Share | `ShareService` | share-access server | Mock | Interface + mock; APIs use share-access directly (TODO wire) |

**Rule:** never put API secrets in client components. Client calls `/api/*` or public Supabase keys only.

## Domain types (`lib/domain/*`)

Canonical product names (aliases over existing modules):

- `Viewing` → cloud + local session shapes
- `Address` → confirmed address + suggestion/lookup
- `PropertyBasics` → `PropertyBasicsSnapshot`
- `ViewingTicket` → Step-2 ticket / brief item
- `UserObservation` → composer / input-log observation
- `AIReport` → `ViewingReport`
- `ShareLink` → `ShareLinkRecord`

## Unconfigured behaviour

- Missing `OPENAI_API_KEY` → HTTP 503 `ai_unavailable` (no fake success)
- Missing Supabase public keys → guest local-only; share/export blocked with `loginGate.needCloud`
- Prefer mock adapters in tests; never invent “success” when upstream is down

## Async UX expectations

Every user-triggered async flow should expose:

1. `idle | loading | success | error`
2. Retry entry point when retryable
3. Cancellation or request-id race guard
4. Duplicate-submit protection (`lib/async/action-state.ts`)

## AI audit trail

- Original user text/transcript/media ids stay in `inputLog` / notes
- AI patches merge additively (`lib/viewing-wizard/input-integration.ts`)
- Report AI section must state originals are preserved

## Guest / free-tier policy

- Guests: 1 local viewing on-device (`GUEST_LOCAL_VIEWING_LIMIT`); second room → login gate
- Free authenticated: `FREE_VIEWING_LIMIT` (3) cloud viewings before paywall
- Share / export / Web Share: auth required (`loginGate.*`)
- Step 2 requires `viewingStarted` (Start CTA / `viewingStartedAt`) — address confirm alone is not enough

## Property facts pipeline (US / CA / TW)

Canonical path: **Address Normalizer → Geocoding → Country Orchestrator (9 lanes) → Evidence → Confidence/Conflict → FactCard → LLM report (read-only)**.

| Piece | Location |
| --- | --- |
| Types / ProvenancedField | `lib/property-facts/types.ts` |
| Orchestrator | `lib/property-facts/orchestrator.ts` |
| Resolve / merge | `lib/property-facts/resolve.ts` |
| Lanes | `lib/property-facts/lanes/*` |
| Project to legacy intel/basics | `lib/property-facts/project.ts` |
| API | `POST /api/property-facts`, `POST /api/property-intel` (projects FactCard) |

`POST /api/property-facts` returns:

- `factCard` — internal provenance card
- `report` — external DTO (`request` / `property` / `costs` / `market` / `location` / `risks` / `evidence` / `disclaimer`)
- `promptPayload` — compact LLM-safe summary

Confirmed values are bare in `report.property` / `report.market`. Cost fields use `{ value, basis, status, confidence, evidence_id }` so listing claims stay `needs_human` and never look like official fees. Gaps appear in `risks.data_gaps`.

Address → report pipeline stages:

1. Normalize + geocode (`place_id`, street components when Google is available)
2. Jurisdiction key selects adapters
3. Parallel lanes → Evidence → resolve + confidence
4. Address match (`exact_unit` / `exact_parcel` / `street` / …)
5. Distance enrich (straight-line + walking always; driving / peak via Distance Matrix when keyed)
6. Project `PropertyReport` DTO
7. Chat report LLM may only cite `evidence` ids from that report (`/api/viewing-chat/report`)

**Rules:** adapters write facts; Bing snippets are `public_web` evidence only; LLM must not invent listing fields; missing data is `not_found` / `needs_human`. Source precedence: `official > public_record > licensed_vendor > licensed_listing > crawl_service > public_web > listing_claim > area_statistic > user > model_estimate`. `listing_claim` and `model_estimate` never become a confirmed value. Confidence is a 0–1 score from source type, address match, freshness, and conflict — not a label the model assigns.

Jurisdiction keys (not one national feed):

- US: `us:{state}:{county}:{city}:{lane}`
- CA: `ca:{province}:{municipality}:{lane}` — Metro Vancouver open data only for BC metro municipalities
- TW: `tw:{縣市}:{行政區}:{地段}:{lane}`

Markets: property region `CA|US|TW|OTHER`; viewing/AI markets also allow `TH` (locale product).

Migration: `supabase/migrate-properties-multicountry.sql` (`country_code`, `admin1`, `city`, `postal_code`).

## Min vertical slice (done)

Address confirm → property basics → Start viewing → Step 2 one text input → ticket merge → Step 3 Report → guest share LoginGate.

Contract tests: `lib/viewing-wizard/vertical-slice.test.ts`.

## Viewing Chat Thread (2026-09-19)

Home UI is now Meta-AI style chat (`ViewingChatApp`):

- `viewings.messages` JSONB + `viewings.report` JSONB (migration `viewing_chat_messages`)
- Guest threads in `localStorage`; authenticated can persist via `/api/viewing-chat/*`
- Question bank = read-only projection from messages (`lib/viewing-chat/project-bank.ts`)
- APIs: `POST /api/viewing-chat/turn` (Whisper + fill/new_card), `POST /api/viewing-chat/report`

Legacy wizard `ClientPage` remains in repo but is no longer the home route.

## Quality TODOs (remaining / next slice)

1. Thin-wrap `/api/process-recording` behind `SpeechService`.
2. Wrap `lib/media.ts` uploads behind `MediaStorageService`.
3. Have `/api/share/*` call `ShareService`.
4. Migrate remaining ClientPage zh-TW sync literals into `lib/i18n`.
5. Expand e2e: GPS deny, free-tier paywall, login claim, share ACL.
6. Gradually harden GPS / mic / photo / long-image / history import UX (already partially present).
