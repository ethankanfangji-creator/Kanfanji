# Media permissions & capture — manual test checklist

Cross-browser checks for mic / camera / photo / video. Prefer real devices for iOS Safari and Android Chrome.

## Shared rules (all browsers)

- [ ] Cold start the app — **no** mic/camera prompt appears until a capture control is tapped.
- [ ] Tapping Record / Photo / Video shows a **preflight** sheet: purpose + IndexedDB / sync note, before the OS prompt.
- [ ] Only one capture path can run at a time (audio vs photo/video picker).
- [ ] After **Stop**, the file is in IndexedDB immediately (reload within seconds still shows media / pending process).
- [ ] **Cancel** discards the in-progress recording (no new note / no orphan intended clip).
- [ ] Denied / blocked states show settings guidance **and** “import file instead”.
- [ ] Import audio / pick gallery photo-video works without granting live mic/camera.

## Security and data boundaries

- Hardware permission and AI-processing consent are separate. The permission
  preflight explains capture and local persistence; transcription/vision must
  additionally receive the current versioned AI consent before bytes leave the
  browser.
- Declining AI consent leaves the original local media intact and does not send
  a request. Consent is scoped to the current viewing session/version, not
  inferred from camera or microphone permission.
- Guest AI calls use a signed httpOnly guest/device identity and atomic
  database-backed quota dimensions. Authenticated calls use the verified user
  identity. If quota storage is unavailable or exhausted, processing fails
  closed with retry guidance; there is no permissive local fallback.
- Request validation enforces MIME allowlists, byte/duration/context limits,
  locale/market enums, marker limits, and an upstream timeout before invoking AI.
- Local media, AI jobs, and sync queue records carry the current guest/user
  `accountScope`. Switching users must not expose or upload another scope.
- Raw audio/video/photos stay in IndexedDB first. Stable owner-scoped Storage
  paths are uploaded only through the authenticated sync flow; public sharing
  receives only explicitly selected photo paths in an immutable publication.
- Service-worker caching excludes all APIs, viewing/share/invite/compare pages,
  token/signature URLs, and cross-origin media. Signed media and AI responses
  must never be added to the offline shell cache.

Security regression checks:

- [ ] Decline AI consent, capture/import media, and verify no process/vision
  request is sent while the local file remains available.
- [ ] Exhaust a test guest quota and verify HTTP denial/retry metadata with no AI
  provider call.
- [ ] Sign in as account A, queue media, switch to account B, and verify A's
  media and queue are neither visible nor uploaded.
- [ ] Inspect Cache Storage after private/share/media use; no API response,
  `/s/*`, `/c/*`, signed URL, or media body is present.

## Desktop Chrome / Edge

- [ ] Mic: Allow → record → stop → timer accurate → transcript pipeline runs.
- [ ] Mic: Block → preflight/banner shows denied/blocked → import still works.
- [ ] Revoke mic mid-recording (site settings) → recording stops; blob saved if any data existed.
- [ ] Camera file input for video/photo: preflight then OS picker; cancel picker does not lock UI.

## Android Chrome

- **Release status: PENDING physical-device verification; not passed.**
- [ ] Mic permission prompt only after Continue on preflight.
- [ ] Background the app mid-recording (home / switch app) → recording stops and is saved locally.
- [ ] Incoming call / screen lock mid-recording → local save (or pending process after return).
- [ ] Video via native camera (`capture=environment`): stop in camera app → file returns and persists to IndexedDB.
- [ ] Photo: take or choose from gallery; both persist before Vision returns.

## iOS Safari

- **Release status: PENDING physical-device verification; not passed.**
- [ ] Mic: first Continue triggers Safari prompt; Deny → settings hint + import `.m4a` / voice memo.
- [ ] Mic: Allow → record → Stop/Cancel visible; timer updates while recording.
- [ ] Leave Safari mid-recording (app switcher) → on return, either saved pending audio or clear idle (no stuck “recording” UI).
- [ ] Reload mid/after stop → pending audio resumes Whisper if blob was saved.
- [ ] Video: system camera; stopping early still imports clip into the list and IDB.
- [ ] Photo: no surprise permission on page load; only after Add photo Continue.
- [ ] HTTPS or localhost only — confirm SecurityError / blocked copy if opened on insecure LAN IP without trust.

## Unsupported / in-use

- [ ] Browser without `mediaDevices` / `MediaRecorder`: status `unsupported`, import path only.
- [ ] Mic already held by another app: status `in-use`, retry after releasing other app.

## Regression

- [ ] Wizard Step 2 still keeps notes/photos/clips when moving Step 1 ↔ 2 ↔ 3.
- [ ] Sync banner retry still works after a failed upload of saved media.
