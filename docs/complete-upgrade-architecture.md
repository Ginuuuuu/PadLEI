# PadLEI Complete Upgrade Architecture

## Canonical Identity

`users/{authUid}` contains:

- `uid`: current Firebase Authentication UID
- `ownerId`: stable owner used by all academic records
- `email` and `normalizedEmail`
- `role`, `approved`, and optional `mustChangePassword`
- profile, theme, and academic preference fields

`POST /api/account/sync` is called after Firebase local persistence restores the user. It verifies the ID token, finds user/approval records for the normalized email, chooses the existing owner, attaches the current UID, migrates legacy ownership, and records `accountMigrations/{ownerId}_{authUid}`.

Academic source records are not deleted. Normal records preserve their document IDs and update `userId`; legacy progress is retained while a canonical `{ownerId}_{pdfId}` progress document is merged.

## Login and Password Security

`loginRequests` accepts only `requestId`, `fullName`, `email`, `contactMethod`, `requestedRole`, `status`, and timestamps. Password-like fields are rejected by the API and Firestore rules.

Admin approval and manual user creation return a Firebase password-reset link only in the immediate response. Emergency temporary passwords are random, shown once, never stored, revoke refresh tokens, and require a password change.

Privileged APIs use Firebase Admin token verification and approval/role checks from `lib/server-auth.ts`.

## Academic Models

PDF organization fields:

- `semesterId`, `semesterName`
- `subjectId`, `subjectName`

`examTimetable` fields:

- `examId`, `userId`, title
- semester and subject IDs/names
- `examType`, `examDate`, `startTime`, `endTime`
- `status`, `createdAt`, `updatedAt`

No location or notes fields are stored for timetable entries.

`actualExamScores` fields:

- `scoreId`, `userId`
- semester and subject IDs/names
- `examName`, `examDate`
- obtained, maximum, percentage, pass mark, pass/fail
- optional grade and notes
- timestamps

## Calculations

- Percentage: `(obtainedMarks / maximumMarks) * 100`, rounded to two decimals.
- Pass/fail: obtained marks greater than or equal to pass mark.
- Subject, semester, mock, actual, and overall averages are arithmetic means of percentages.
- Strongest/weakest subjects are ranked by available combined mock and actual percentages.
- GPA/CGPA is intentionally not calculated without a configured university formula.

## Reports

Routes and report types:

- `/academics/reports`
- Individual mock-test report with detailed answer review
- Individual actual AVN report
- Selected AVN exam report
- Subject report
- Semester report
- Overall report

Only the individual mock report includes question-by-question details. Other reports include appropriate summaries and gracefully show insufficient data.

## Main Routes

- `/dashboard`, `/library`, `/upload`
- `/pdfs/[pdfId]`, `/study/[pdfId]`
- `/exam/setup`, `/exam/[pdfId]`, `/exam/result/[resultId]`
- `/academics`, `/academics/timetable`, `/academics/scores`, `/academics/reports`
- `/history`, `/settings`
- `/admin`, `/admin/users`, `/admin/login-requests`, `/admin/files`, `/admin/academics`

Old `/history` and `/upload` routes remain available.

## Security Boundaries

- Normal users can access records only when `userId == users/{authUid}.ownerId`.
- Admin users can view academic collections.
- Normal users cannot change role, approval, UID, owner ID, or normalized email.
- Migration records are server-controlled.
- Timetable and score structures are validated by Firestore rules.
- Cloudinary secrets remain server-side.
- Service workers cache only safe static assets.

## Migration

Dry-run:

```powershell
npm run migrate:accounts
```

Apply only after backup and review:

```powershell
$env:PADLEI_ALLOW_MIGRATION="true"
npm run migrate:accounts -- --apply
```

The guard prevents accidental production writes.
