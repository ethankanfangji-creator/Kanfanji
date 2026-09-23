# Kanfangji product scope — Option A (Open House Recorder)

Last updated: 2026-09-22.

## Positioning

**看房記 KanFangJi = OPEN HOUSE RECORDER**

現場看房時，用文字／語音／照片快速記錄，並整理成可分享的看房摘要。差異化在**現場引導與缺口提醒**，不是看前房源情報平台。

> 把房源資料與現場觀察，整理成可核對、可分享的看房決策摘要。  
> （A 版強調：現場觀察為主；listing 來源為選用進階。）

### Non-goals (MVP A)

- 主動 scraping／全網可比搜尋
- 房仲 CRM／刊登／帶看排程
- 專業驗屋／估價／法律意見替代
- 以 property-facts／provider 數量當對外賣點
- 主路徑必經的 listing URL／PDF／多來源衝突確認

## Target main path

`確認地址` → `入場 checklist／要問的問題` → `文字／語音／照片現場記錄` → `依缺口動態提醒` → `完成看房報告／分享` →（第二幕）多間比較

## Keep / Hide / Cut

### Keep（主路徑一等公民）

| Capability | Where | A usage |
| --- | --- | --- |
| Address confirm / suggest | `ViewingChatApp` + address APIs | Only entry gate |
| Composer: text / mic / photo / file | `ViewingChatComposer` | Core capture; photos = on-site evidence |
| Chat turn | `/api/viewing-chat/turn` | On-site dialogue engine |
| Question bank | `project-bank` / sidebar | Project from chat; visible without ingest |
| Finish report + share | header CTA / share | Copy = finish viewing / report; input = on-site log |
| History / search / media library | sidebar panels | Required for a recorder |
| Guest local → login to share | login gate | Safety story for A |
| Compare 2–5 viewings | `/compare` | Second act |
| `ViewingChecklist` / `QuestionsToAskList` | was inside initial report | Prefer entry + during capture |
| On-site quick prompts | `ReportQuickActions` (ask agent, checklist, photo check) | Show in `viewing_preparation`, not only after report |

### Hide（code may stay; not default UX）

| Capability | Where | Notes |
| --- | --- | --- |
| Forced post-address source guidance | was `sourceGuidance` | Replaced by on-site guidance |
| `CollectionQuickActions` | paste URL / screenshot / HOA / skip | Behind optional “add listing” |
| `/api/property-source/ingest` as mainline | URL / PDF / vision / HOA | Advanced only |
| Soft-fail / SSRF recovery CTAs | `SourceSoftFailActions` | Only if user opened listing intake |
| `ConflictingDataAlert` | multi-source conflicts | Rare without multi-source |
| Full `InitialReportCard` (completeness %, sources) | chat message type | Optional when sources exist |
| `ConfidenceBadge` / completeness score | report chrome | Intel metric, not recorder core |
| Pre-viewing `RiskPriorityCard` | initial report | Prefer on-site high-priority checks |
| Auto URL/image → ingest in composer | `onSubmit` branches | Default = chat turn |
| Stages `awaiting_property_source` … `extracting_data` | `stage.ts` | Enter only via optional listing intake |
| `PropertyIntelCard` / external enrich | intel pipeline | Sidebar hint at most |

### Cut（stop investing for MVP A）

| Item | Why |
| --- | --- |
| Listing URL fetch required on main path | Opposite of A; expands SSRF / untrusted HTML |
| “Initial listing analysis report” as success metric | Success = on-site notes → viewing report |
| Intel-style quick prompts as default (biggest risk / holding cost / unverified) | B framing; prefer next-room / photo / ask agent |
| HOA PDF as entry collection | Due diligence, not recorder entry |
| Multi-source conflict UX as primary flow | No multi-source on default path |
| `meetsMinimumReportCriteria` (sources + core fields) as gate for on-site report | A gate = address + on-site content (UI) |
| Empty states that demand link/text/screenshot before analysis | Replace with on-site capture copy |

## Stage policy (A)

Default after address:

`address_received` → (**guidance**) → `viewing_preparation` → … → `report_ready`

Optional advanced:

`viewing_preparation` → `awaiting_property_source` → `collecting_sources` → … → (may attach `InitialPropertyReport`)

Report generation:

- Default: `POST /api/viewing-chat/report` from messages
- Only if `sources.length > 0`: may use property-source ingest to build initial listing report

## Implementation checklist

1. Default stage → `viewing_preparation` after address confirm
2. Hide collection chips; optional “add listing” reveals them
3. Composer does not auto-ingest URL/image
4. i18n: on-site guidance / empty / report CTA
5. Freeze property-source as main-path dependency (module remains for advanced / tests)
6. **Done (MVP coach):** entry asks only 1 agenda item; `integrateChatTurn` `ask_at_most: 1` + agenda actions; progress panel; finish soft-warn for high-priority gaps
7. **Done (SOP catalog):** universal first-visit agenda (`agenda-catalog.ts`) + US/CA/TW packs + red-flag probes; market inferred from address
8. **Done:** top checklist UI removed — coaching is chat-only; next question text forced from agenda (not LLM); short replies pin to active item
9. Next: property-type packs (condo vs SFH), photo→probe templates, revisit prompts

## Related

- Stack inventory: `docs/STACK.md`
- Stage machine: `lib/viewing-chat/stage.ts`
- Chat UI: `components/viewing-chat/ViewingChatApp.tsx`
- Advanced ingest: `lib/property-source/`, `app/api/property-source/ingest/`
