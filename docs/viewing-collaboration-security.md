# 家人協作權限與衝突規則

## 權限矩陣

- `owner`：讀寫案件、媒體、留言、成員與邀請；唯一可管理公開分享。
- `editor`：讀寫案件與媒體、留言；不可邀請、移除成員或管理公開分享。
- `commenter`：讀取案件與媒體、留言；不可修改案件正文。
- `viewer`：只讀案件與照片／影片；伺服器不查詢或傳送錄音路徑與逐字稿。

`viewings.user_id` 仍是唯一 owner 欄位，既有單人看房流程不需要建立 membership。

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
- 角色查詢位於未暴露的 `private` schema，以 security-definer helper 避免 RLS recursion。
- Storage 固定使用 `owner_id/viewing_id/folder/file`。Editor 上傳時仍寫入 owner prefix。
- Viewer 的 Storage policy 排除 `audios`；Commenter、Editor 與 Owner 才能取得錄音簽章。
- 撤銷 membership 後，案件與私有 bucket 的 signed URL 建立權立即失效；已簽發 URL 最長仍受既有 TTL 影響。
- 公開分享 API 仍以 `viewings.user_id = auth.uid()` 驗證，因此 editor 無法建立、輪替或撤銷公開連結。

## Revision 衝突

- 案件採整列整數 `revision`，起始值為 1。
- 協作 PATCH 必須帶 `If-Match: "<revision>"`。
- 更新使用 `WHERE id = ? AND revision = ?`；成功後 revision 加一。
- revision 不相符回傳 HTTP 409，UI 要求重新載入，絕不靜默覆寫。
- 既有 owner sync 在資料庫已有 revision 欄位時也會加一；尚未套 migration 時自動走舊欄位相容流程。

## 套用

先在測試環境執行：

`supabase/migrate-viewing-collaboration.sql`

驗證 owner、editor、commenter、viewer 與 revoked member 五種帳號後，再套用正式環境。

