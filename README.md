# PadLEI

PadLEI is a production-style medical study workspace built with Next.js, Firebase, Cloudinary, and native Android/iOS WebView wrappers. It converts MCQ PDFs into structured questions, preserves diagrams, supports study and mock-test workflows, organizes academic material, and tracks actual AVN performance.

Live website: https://avn-study.vercel.app

## Features

- Secure Google and email/password authentication for approved users
- Password-free public access requests with WhatsApp or email notification
- Canonical academic owner identity so one approved email keeps the same data across devices and providers
- Cloudinary PDF storage, browser/server extraction, OCR fallback, diagrams, manual question correction, and default PDFs
- Study progress, learned questions, bookmarks, weak questions, shuffled choices, and mock-test result review
- Semester/subject PDF Library with custom catalog entries and move-in-place organization
- Exam timetable with status controls and in-app 7/3/1/0-day reminders
- Actual AVN score tracker with automatic percentage and pass/fail calculation
- Mock-versus-actual subject comparison and accessible trend summaries
- Separate A4 PDF reports for mock tests, actual AVNs, selected AVNs, subjects, semesters, and overall performance
- Profile, signed Cloudinary profile photos, bio, academic preferences, light/dark/system themes, and quote controls
- PWA plus Android and iOS wrappers with persistent login, file upload, external links, and report downloads

## Architecture

- `app/`: Next.js App Router pages and protected API routes
- `components/`: responsive UI, study/exam flows, Library, Academics, reports, and Settings
- `lib/account.ts`: normalized email and canonical owner helpers
- `lib/server-auth.ts`: Firebase ID-token, approval, role, and owner verification
- `app/api/account/sync/route.ts`: login-time canonical account synchronization
- `lib/academic.ts`: validation, percentage, summary, timetable, and reminder utilities
- `firestore.rules`: canonical owner and administrator access rules
- `firestore.indexes.json`: indexes for library and academic queries
- `android/` and `ios/`: native persistent WebView wrappers

All academic records store the canonical owner in their existing `userId` field. The current Firebase Authentication UID remains in `users.uid`; `users.ownerId` is stable.

## Environment

Create `.env.local` from `.env.example`.

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL=

FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Use the three Firebase Admin values on Vercel. `FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH` is intended for local development only. Never expose Admin or Cloudinary secrets through `NEXT_PUBLIC_*`.

Cloudinary PDF and profile-image uploads share the same account credentials. Profile images use the protected path `padlei/users/{ownerId}/profile`, allow JPG/PNG/WebP, and are limited to 2 MB.

## Authentication

1. A student requests access with name, email, and contact method only.
2. Admin approval creates or enables the Firebase Auth user and returns a password setup/reset link once.
3. No current password or reset link is stored in Firestore.
4. Emergency temporary passwords are returned once, revoke refresh tokens, and set `mustChangePassword`.
5. Password users reauthenticate before changing their password in Settings.
6. Google-only users can request a Firebase password setup email.

The account sync endpoint verifies the ID token, resolves approved records by normalized email, assigns a stable owner, migrates legacy records idempotently, and records completion in `accountMigrations`.

## Firestore Data

Primary collections:

- `users`, `approvals`, `loginRequests`, `accountMigrations`
- `pdfs`, `questions`, `progress`, `examResults`
- `semesters`, `subjects`
- `examTimetable`, `actualExamScores`
- `quotes`, `userPreferences`

Existing PDFs without organization fields are assigned to `Uncategorized / General`. Moving a PDF changes only its semester/subject metadata; the PDF ID, questions, progress, bookmarks, results, and URL remain unchanged.

See [docs/complete-upgrade-architecture.md](docs/complete-upgrade-architecture.md) for field details, calculations, routes, and security boundaries.

## Migration

The migration is dry-run by default:

```powershell
npm run migrate:accounts
```

Review the counts. To apply:

```powershell
$env:PADLEI_ALLOW_MIGRATION="true"
npm run migrate:accounts -- --apply
```

Precautions:

- Back up Firestore first.
- Run the dry-run against the intended Firebase project.
- The migration does not delete legacy academic records.
- Progress is copied/merged into canonical `{ownerId}_{pdfId}` documents.
- Password fields are deleted from legacy login requests.
- The command is safe to rerun and records successful owner migrations.

## Firebase Deployment

Install the Firebase CLI and authenticate, then deploy:

```powershell
firebase use <project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Verify Authentication authorized domains for the production site and local development host. Enable Google and email/password providers as required.

## Reports

Reports are generated locally with `@react-pdf/renderer`; student data is not sent to an unknown report service. Reports always use a light A4 print theme, page numbers, generated time, readable tables, wrapped content, and fallback profile initials.

Android reports save to `Downloads/PadLEI`. iOS reports open the native share/save sheet. Browser and PWA builds use the normal download flow.

## PWA and Native Wrappers

`public/sw.js` caches only the offline shell and static assets. It does not cache authenticated API responses, private reports, profile data, admin pages, or academic records.

Android uses DOM storage, persistent cookies/storage, file chooser support, Download Manager, external WhatsApp/email handling, and a native base64 report bridge.

iOS uses `WKWebsiteDataStore.default()`, file chooser support, external links, back/forward gestures, and a native report share bridge. Build iOS on macOS with Xcode; iOS does not use APK files.

## Development

```powershell
npm install
npm run dev
```

The local app runs on `http://localhost:3001`.

Verification:

```powershell
npm run typecheck
npm run build
```

Android:

```powershell
npm run apk:debug
npm run apk:release
```

Additional platform guides are in `docs/`.
