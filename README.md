# Study + Mock Test Platform

A production-ready Next.js + Firebase web app for approved students to upload MCQ PDFs, extract questions, study them, take mock tests, and track performance.

## Features

- Login-only access with Google and email/password.
- Admin-approved users only, with role-based admin/user protection.
- Firebase Authentication and Firestore for accounts/data.
- Cloudinary PDF storage with local fallback for development.
- PDF upload with server processing, permanent per-user metadata, and delete flow.
- MCQ extraction API using PDF text parsing and local rendered-page OCR for scanned PDFs.
- Question review/edit screen.
- Study mode with answer reveal, search, bookmarks, learned state, and progress.
- Exam setup with PDF, question range, count, random/sequential order, timer, marks, and optional negative marks.
- Exam runner with palette, marked review, auto-submit timer, and confirmation.
- Result page with score, percentage, grade, answer review, explanations, retake, print/download.
- Exam history and admin stats/files/performance pages.
- Responsive Tailwind UI ready for Vercel.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill your Firebase web config.

3. Create Firebase Authentication providers:
   - Google
   - Email/password

4. First admin access:

   The email in `NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL` can create its admin profile automatically on first login. For this project, that is `reshin0026@gmail.com`.

   If you prefer manual setup, create the first admin user in Firestore:

   Collection: `users`

   Document id: the Firebase Auth UID of the admin

   ```json
   {
     "uid": "AUTH_UID",
     "email": "admin@example.com",
     "name": "Admin",
     "role": "admin",
     "approved": true,
     "createdAt": "2026-06-18T00:00:00.000Z"
   }
   ```

5. Add Cloudinary free storage:

   Create a free Cloudinary account, then copy these from Cloudinary Dashboard > Programmable Media > API keys:

   ```bash
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   ```

   The app uses Cloudinary for PDF storage, so Firebase Storage billing is not required. If these keys are missing locally, the app saves PDFs under `data/local-pdfs`.

6. Deploy Firestore rules:

   ```bash
   firebase deploy --only firestore:rules
   ```

   Admin user creation note: the app admin panel can create Firebase Authentication users automatically only when `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` are set in `.env.local` or Vercel. Without those values, Firebase Admin cannot create Auth users from the app.

7. Run locally:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3001`.

   If Firebase shows `auth/unauthorized-domain`, add `localhost` and `127.0.0.1` in Firebase Console > Authentication > Settings > Authorized domains.

## Vercel Deployment

1. Push the project to GitHub, GitLab, or Bitbucket.

   Do not commit `.env.local` or Firebase service-account JSON files. This repo ignores `*-firebase-adminsdk-*.json`, but check your Git changes before pushing.

2. In Vercel, create a new project and import the repository.

   Keep the defaults:

   ```text
   Framework Preset: Next.js
   Install Command: npm install
   Build Command: npm run build
   Output Directory: Next.js default
   ```

3. Add these Vercel Environment Variables for Production, Preview, and Development:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL=reshin0026@gmail.com

   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   OCR_MAX_PAGES=60

   FIREBASE_ADMIN_PROJECT_ID=
   FIREBASE_ADMIN_CLIENT_EMAIL=
   FIREBASE_ADMIN_PRIVATE_KEY=
   ```

   Do not use `FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH` on Vercel. Paste the private key into `FIREBASE_ADMIN_PRIVATE_KEY`; if Vercel stores it with escaped line breaks, the app converts `\n` back to real newlines.

4. In Firebase Console, add the deployed Vercel domain:

   Authentication > Settings > Authorized domains > Add domain

   Add:

   ```text
   your-project.vercel.app
   ```

   Add your custom domain too if you connect one later.

5. Deploy Firestore rules from this project:

   ```bash
   firebase deploy --only firestore:rules
   ```

6. Deploy on Vercel.

7. Test production in this order:
   - Login with the bootstrap admin email.
   - Add/approve one user in Admin.
   - Upload the sample PDF.
   - Open Study and Mock Test.
   - If an older PDF card still shows review errors, click the reprocess button on that card.

OCR note: text-based PDFs process fastest. Scanned/image-only PDFs use local page rendering plus Tesseract OCR, so very large PDFs can hit Vercel function time limits. Keep `OCR_MAX_PAGES` lower for large scanned PDFs or use a Vercel plan with longer function duration.

## PDF Extraction Notes

The API route at `app/api/extract-pdf/route.ts` parses selectable PDF text and detects common MCQ patterns:

```text
1. Question text
A. Option
B. Option
C. Option
D. Option
Answer: B
Explanation: Optional explanation
```

Text-based PDFs are parsed directly. For scanned PDFs, the app renders PDF pages locally and runs `tesseract.js` OCR. `OCR_MAX_PAGES` controls the maximum scanned pages per PDF, defaulting to 60.

## Firebase Collections

- `users`
- `pdfs`
- `questions`
- `examResults`
- `quotes`
- `progress`

## Contact Displayed On Login

- Email: reshin0026@gmail.com
- Instagram: reshin.___
- WhatsApp: 8807905821
- Developer: Ginu
