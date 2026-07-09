# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `sti-cam/`:

```bash
pnpm dev          # Dev server at http://localhost:5173/sti_cam/ (mobile accessible on same LAN)
pnpm build        # Production build → dist/
pnpm preview      # Preview production build locally
pnpm deploy       # Build + publish to GitHub Pages (gh-pages)
```

No test suite — this is a PWA, not a library.

**Environment setup:** Copy `.env.example` to `.env` and set the `VITE_FIREBASE_*` vars (from the Firebase project's Web app config — the same Firebase project backs Sti-platform, so login is shared). These values are intentionally public (frontend Firebase config). Without them, the app runs in demo mode (login simulated, uploads faked).

## Architecture

**STI-Cam** is a React 18 + Vite PWA for construction-site photo documentation. Photos are captured and uploaded directly to Google Drive, with a Google Sheets row appended per photo. The architecture is layered:

```
Screens (AuthScreen, HomeScreen, CameraScreen)
  → Hooks (useAuth, useCamera, useUploadQueue)
    → Domain (Photo entity, UploadManager)
      → Infrastructure (GoogleAuth, GoogleDrive, GoogleSheets, CameraService, OfflineQueue, Logger)
```

### Key data flows

**Capture → Upload:**
1. `CameraService` (getUserMedia wrapper) captures a full-resolution frame via ImageCapture API
2. `createPhoto()` in `domain/Photo.js` builds the entity — filename format: `STI_{prefix}_{ISO}_{seq}.jpg`
3. `useUploadQueue` immediately persists the photo to IndexedDB (ArrayBuffer, not Blob — iOS PWA compatibility), then enqueues to `UploadManager`
4. `UploadManager` runs max 2 concurrent uploads (`MAX_CONCURRENT=2`), retrying transient failures at 3s / 10s / 30s (`RETRY_DELAYS`). On success it calls `sheetsService.appendPhotoRow()` to log the photo in the project's Google Sheet

**Auth lifecycle:**
- `GoogleAuth.js` uses Firebase Authentication (`signInWithPopup` + `GoogleAuthProvider`) for login/identity — the same Firebase project that backs Sti-platform (see `config/firebase.js`). Firebase's own ID token isn't used for Drive/Sheets calls; the raw Google OAuth access token is extracted from the sign-in credential via `GoogleAuthProvider.credentialFromResult()` instead
- Token + user persisted in `localStorage` key `sti-cam-auth` (schema `v2`, incompatible with the pre-Firebase GIS-era sessions — old entries are ignored, forcing one clean re-login); restored on load even if expired (offline-safe)
- Firebase doesn't return an `expires_in` for the provider access token, so a fixed ~3600s lifetime is assumed (same buffer logic as before)
- **PWA background renewal is intentionally disabled**: `getAccessToken()` detects `display-mode: standalone` and throws `interaction_required` instead of attempting a popup (Firebase has no silent/iframe renewal path for the Google access token, and background popups are blocked in installed PWAs anyway). The module-level `silentRenewalFailed` flag short-circuits further attempts. It resets on sign-out (`revokeToken`) or token clear (`clearToken`)
- Background API callers (thumbnail loading, Drive helpers) call `getAccessToken()` with no args; user-initiated actions pass `forceConsent=true` to force a popup (`prompt:'consent'`)

**Offline resilience:**
- `App.jsx` owns the sync orchestration: listens to `online`, `offline`, and `visibilitychange` events
- On reconnect, retries with delays `[0, 2s, 5s, 10s]` (iOS fires `online` before the radio is usable)
- A 30s periodic interval catches cases where the `online` event never fires
- If the token is expired and silent renewal is blocked (PWA), a "Sesión expirada" banner is shown requiring a manual user gesture to re-authenticate
- The HomeScreen header "Drive" status dot reflects the same connectivity/auth state: red (`colors.error`) when offline / no user / Firebase not configured, amber (`colors.warning`) when signed in but the session is expired (driven by the `sessionExpired` prop = `needsReauth || offlineBanner?.needsAuth`), green (`colors.success`) when connected with a valid token

**Project sync:**
- `config/projects.js` keeps a localStorage cache (`sti-cam-projects`) as the fast path, with Drive as source-of-truth (`sti-cam-projects.json` in the `STI-Fotos` root folder)
- Merges local + remote on init; writes to Drive fire-and-forget

### Infrastructure notes

- `OfflineQueue.js`: IndexedDB v1, stores photos as ArrayBuffers. Has backward-compatible handling for corrupted Blob entries from a previous schema
- `Logger.js`: Ring buffer (last 200 entries), subscribable. Mirrored to console. Accessible in-app via the ⓘ button (bottom-right) → `DebugOverlay`
- `GoogleSheets.js`: Each project gets one sheet named `STI_000_{ProjectName}`. `syncSheetFromDrive()` backfills rows for photos uploaded before the sheet existed
- Workbox service worker caches all app assets. All `googleapis.com`, `accounts.google.com`, `oauth2.googleapis.com`, `identitytoolkit.googleapis.com`, and `securetoken.googleapis.com` URLs are `NetworkOnly` — never cached

### Firebase / Google Cloud requirements

The app needs:
- A **Firebase project** (shared with Sti-platform) with the **Google** sign-in provider enabled under Authentication → Sign-in method, and `localhost` + the deployed domain listed under Authentication → Settings → Authorized domains
- Since a Firebase project sits on a GCP project, that GCP project also needs: **Google Drive API** and **Google Sheets API** enabled, and the `drive.file` + `spreadsheets` scopes added under OAuth consent screen → Scopes (these are additional sensitive scopes beyond Firebase Auth's default profile/email — easy to miss, and without them sign-in succeeds but Drive/Sheets calls fail with 401/403)
- The user's email added as a test user on the OAuth consent screen, if it's in Testing mode
