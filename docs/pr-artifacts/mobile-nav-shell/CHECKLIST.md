# Mobile-first navigation — manual checklist

Viewport: **390×844** (Chrome + Safari iOS if available). Desktop: ≥768px.

## Before / after

| | |
| --- | --- |
| Before (prod sidebar eats width) | [`before-390.png`](./before-390.png) |
| After (bottom tabs, full-width main) | [`after-390.png`](./after-390.png) |
| After — history drawer (default closed) | [`after-390-history-drawer.png`](./after-390-history-drawer.png) |

## Mobile (390×844)

- [ ] First paint: **no permanent left rail**; main address field uses full content width
- [ ] Bottom tabs visible with readable labels: 新物件 / 看房歷史 / 搜尋紀錄 / 媒體庫 / 帳號
- [ ] Each tab hit area roughly **≥44px** tall
- [ ] **看房歷史** opens a drawer overlay (does not permanently shrink main)
- [ ] Flow: confirm address → record or photo via composer → open 摘要/問答 without horizontal scroll to reach primary controls
- [ ] Focus the composer text field: bottom tabs **hide or sit above** the keyboard (do not cover the input)
- [ ] Home indicator / notch: content respects `env(safe-area-inset-*)`

## Desktop (≥ md)

- [ ] Left **IconRail** still available (collapsed / expanded)
- [ ] Bottom tab bar **not** shown
- [ ] Search / media panels offset for the rail (`md:ml-14` / expanded)

## Regression

- [ ] `npx vitest run components/viewing-chat/shell`
- [ ] `npx tsc --noEmit`
- [ ] Smoke `npm run build` (or rely on Vercel preview)
