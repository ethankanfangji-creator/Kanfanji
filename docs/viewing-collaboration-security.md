# 家人協作權限與衝突規則

## 權限矩陣

- `owner`：讀寫案件、媒體、留言、成員與邀請；唯一可管理公開分享。
- `editor`：讀寫案件與媒體、留言；不可邀請、移除成員或管理公開分享。
- `commenter`：讀取案件與媒體、留言；不可修改案件正文。
- `viewer`：只讀案件與照片／影片；伺服器不查詢或傳送錄音路徑與逐字稿。

`viewings.user_id` 仍是唯一 owner 欄位，既有單人看房流程不需要建立 membership。

## 本機帳號隔離

- IndexedDB 的 viewing、note、media、AI job 與 sync queue 都帶
  `accountScope`，格式只允許 `guest:<installation-id>` 或 `user:<auth-user-id>`。
- Guest installation ID 固定保存在本機；登入狀態改變不會把其他帳號資料
  自動視為目前帳號資料。
- Guest 資料只能經明確的 claim 流程轉入目前已驗證的 user scope；repository
  的讀寫與 queue 處理都會再次套用 scope。
- 登出或切換帳號後，另一個 user scope 的草稿、媒體與待同步工作不可見且
  不會被目前 sync runtime 上傳。

## 邀請

- 邀請 token 使用 256-bit 隨機值，資料庫只保存 SHA-256 hash。
- 預設 7 天到期；同案件、同 email 同時只允許一筆 pending 邀請。
- 接受邀請前必須登入，且登入帳號 email 必須與邀請 email 完全一致（不分大小寫）。
- Owner 可以撤銷 pending 邀請或 active membership。
- v1 不依賴郵件供應商；建立邀請後由 owner 複製連結傳給家人。

## RLS 與媒體

- `viewings` 的既有 owner RLS 擴充為 active member 可讀、editor 可寫。
- `notes`、`audio_urls`、`share_token` 與含 `shareAccess` 的 `property`
  不授予 authenticated 直接 SELECT；案件 API 先套 RLS，再由 server-only
  client 讀取並移除敏感欄位。
- 新增或同步案件不再產生或寫入 `viewings.share_token`；公開 capability
  唯一來源是 `share_links.token`。舊列欄位只保留資料相容性，不可解析公開分享。
- 角色查詢位於未暴露的 `private` schema，以 security-definer helper 避免 RLS recursion。
- Storage 固定使用 `owner_id/viewing_id/folder/file`。Editor 上傳時仍寫入 owner prefix。
- Viewer 的 Storage policy 排除 `audios`；Commenter、Editor 與 Owner 才能取得錄音簽章。
- 撤銷 membership 後，案件與私有 bucket 的 signed URL 建立權立即失效；已簽發 URL 最長仍受既有 TTL 影響。
- 公開分享 API 仍以 `viewings.user_id = auth.uid()` 驗證，因此 editor 無法建立、輪替或撤銷公開連結。
- 公開分享保存的是發佈當下的 allowlisted immutable snapshot；協作者之後修改
  案件不會改寫已發佈內容。更新公開內容必須由 owner 撤銷／建立新發佈。
- Service worker 不快取 `/viewings`、`/compare`、`/s`、`/c`、`/invite`
  或任何 `/api`、token、signature URL，避免跨帳號或撤銷後回放。

## Revision 衝突

- 案件採整列整數 `revision`，起始值為 1。
- 協作 PATCH 必須帶 `If-Match: "<revision>"`。
- 更新使用 `WHERE id = ? AND revision = ?`；成功後 revision 加一。
- revision 不相符回傳 HTTP 409，UI 要求重新載入，絕不靜默覆寫。
- 既有 owner sync 在資料庫已有 revision 欄位時也會加一；尚未套 migration 時自動走舊欄位相容流程。
- 同一個 media path 重試時是 idempotent，不重複 append，也不產生假的
  revision；協作 mutation 與 audit event 在同一交易內完成。

## 驗證

- 以 owner、editor、commenter、viewer、revoked member、outsider 六種 staging
  身份驗證 row、mutation、Storage upload/read/signing。
- 特別確認 viewer 回應沒有 `audio_urls`、notes/transcript、share token 或
  `property.shareAccess`，revoked member 無法再取得新的 signed URL。
- 驗證 owner-only invitation/member/share 操作、editor content/media、
  commenter comment-only、viewer read-only。
- 驗證兩個瀏覽器帳號與 guest scope 互不顯示草稿與 queue。

既有遠端 release migration 已套用；不可重跑或修改。新的 table-grant
forward fix 尚待正常 release 流程套用；順序與驗證見
`docs/release-migration-runbook.md`。

