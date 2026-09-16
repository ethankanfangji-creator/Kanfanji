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

## Desktop Chrome / Edge

- [ ] Mic: Allow → record → stop → timer accurate → transcript pipeline runs.
- [ ] Mic: Block → preflight/banner shows denied/blocked → import still works.
- [ ] Revoke mic mid-recording (site settings) → recording stops; blob saved if any data existed.
- [ ] Camera file input for video/photo: preflight then OS picker; cancel picker does not lock UI.

## Android Chrome

- [ ] Mic permission prompt only after Continue on preflight.
- [ ] Background the app mid-recording (home / switch app) → recording stops and is saved locally.
- [ ] Incoming call / screen lock mid-recording → local save (or pending process after return).
- [ ] Video via native camera (`capture=environment`): stop in camera app → file returns and persists to IndexedDB.
- [ ] Photo: take or choose from gallery; both persist before Vision returns.

## iOS Safari

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
