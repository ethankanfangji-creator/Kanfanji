# 產品分析

PostHog 只記錄動作。沒有地址、座標、筆記、聊天、檔名、email、分享 token。

## 同意

未選擇、按拒絕、或瀏覽器開了 Global Privacy Control：不載入 `posthog-js`、不 `init`。會清掉 `ph_` 與 `__ph_` 開頭的 cookie、localStorage、sessionStorage（包含 `ph_*_posthog`、`__ph_opt_in_out_*`，以及 session 裡的 window id）。只保留我們自己的 `kanfangji.analytics.consent.v1`。登入後的拒絕也會寫進 `user_metadata.analytics_consent`，伺服器的 `serverTrack` 依此決定要不要送。

同意之後才用 `localStorage+cookie`，並且不送 `$opt_in`。`save_referrer` 與 `save_campaign_params` 都是 false。

Esc 或點遮罩不算同意，下次進入非 `/privacy` 的頁面仍會再問。

## 機器人過濾

真人瀏覽器（包含 Cursor 的互動瀏覽器）的 `navigator.webdriver` 是 false，本來就會送出，不必關過濾。

`webdriver=true` 的自動化瀏覽器會被 PostHog 當成機器人，事件在進佇列前被丟掉。只有 Playwright 建置設 `NEXT_PUBLIC_ANALYTICS_ALLOW_AUTOMATION=1`，而且只在 `NEXT_PUBLIC_VERCEL_ENV` 不是 `production` 時生效。這個開關不進任何 Vercel 環境，Preview 的人工驗收也不需要它。

## 客戶端開關

遠端外掛在 `lib/analytics/client.ts` 的 `init` 關閉（flags、surveys、tours、conversations、web experiments、dead clicks、heatmaps、web vitals、exceptions、autocapture、session replay、自動 pageview）。`before_send` 刪掉網址類欄位，以及值本身像網址或含 `/s/`、`/c/`、`/invite/`、`/auth/reset` 的字串。`$host` 保留，用來分辨 Preview 和正式站。`utm_*` 鍵也會刪掉，因為 SDK 仍可能在 `$set_once` 放空的 campaign 欄位。

## 後台設定

PostHog 專案後台的 autocapture、heatmaps、dead clicks、web vitals、exception autocapture、session replay、surveys 必須由專案擁有者自行確認已關。程式關掉遠端載入，不代表後台開關已經關掉。
