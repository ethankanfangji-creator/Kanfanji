# Kanfangji product scope — Option A (Open House Recorder)

Last updated: 2026-10-04.

## Positioning

**看房記 KanFangJi = OPEN HOUSE RECORDER**

現場看房時，用文字／語音／照片快速**筆記**，整理成可分享的看房摘要；看完多間後用「問看房記」整理決策。差異化在**現場記錄與事後整理**，不是看前房源情報平台，也不是現場 AI 對話教練。

> 把現場觀察整理成可核對、可分享的看房決策摘要。  
> （A 版強調：現場筆記為主；listing 來源為選用進階。）

### Non-goals (MVP A)

- 現場 AI 一問一答／教練泡泡（已刪）
- 主動 scraping／全網可比搜尋
- 房仲 CRM／刊登／帶看排程
- 專業驗屋／估價／法律意見替代
- 以 property-facts／provider 數量當對外賣點
- 主路徑必經的 listing URL／PDF／多來源衝突確認

## Target main path

`確認地址` → `文字／語音／照片筆記` → `完成看房報告／分享` →（第二幕）`問看房記 /ask` →（可選）多間比較

## Keep / Hide / Cut

### Keep（主路徑一等公民）

| Capability | Where | A usage |
| --- | --- | --- |
| Address confirm / suggest | `ViewingChatApp` (start shell) | Entry gate only |
| Notes session | `ViewingSessionApp` `/viewings/[id]` | Core capture |
| Composer: text / mic / photo / file | `ViewingChatComposer` | Notes append |
| Notes → report | `/api/viewing-chat/report` | Finish viewing |
| Decision status | Session + portfolio scope | liked / shortlist / passed / revisit |
| Portfolio Ask | `/ask` | Second-act multi-home Q&A |
| History / search / media library | shell panels | Recorder chrome |
| Guest local → login to share | login gate | Safety story for A |
| Compare 2–5 viewings | `/compare` | Optional from Ask / history |
| Notifications (in-app + email) | bell + `/notifications` | Off-page only: share comments, collab invite create/accept |

### Cut（不再投資）

| Item | Why |
| --- | --- |
| `/api/viewing-chat/turn` + coach dialogue | Notes-first; no on-site chat bubbles |
| Agenda / opening AI bubbles | Coaching removed from main path |
| ChatMessageList as capture UI | Replaced by Session notes timeline |

## Ask analytics (privacy)

- **PostHog funnel** (enums only, no question/notes/address text): `ask_opened`, `ask_question_sent`, `ask_answer_received`, `ask_feedback`, `ask_rewrite`, `ask_compare_opened`, `decision_status_changed`; `compare_opened` may use `source=ask`; quota uses `endpoint=portfolio`.
- **First-party signals** (`portfolio_ask_signals`): rule-based `themes[]` per signed-in Ask (budget / risk / family_preference / …). No question body in that table; full turns stay in `portfolio_ask_turns` for the owner.
- Non-goals here: preference profile synthesis, listing recommendations, third-party free-text analytics.

## Related

- Stack inventory: `docs/STACK.md`
- Notes UI: `components/viewing-session/ViewingSessionApp.tsx`
- Ask: `components/portfolio/PortfolioAskApp.tsx`
- Home shell: `components/viewing-chat/ViewingChatApp.tsx` (address + history only)
