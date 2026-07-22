# English Chat Booking Finder

A stateless Next.js site that reads the public [BYU-Pathway English Chat scheduling page](https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0), checks trusted Google Calendar appointment pages on demand, and links students directly to booking.

## What it can verify

The scanner launches an isolated browser for one tutor per request. It reads the calendar dates Google renders and follows Google's “Jump to the next bookable date” control when present. Every result includes the displayed date range. An unreadable or changing Google page is reported as “Needs confirmation,” never as “No dates.” Exact appointment times and final availability are always confirmed on Google before booking.

Scan results are kept only in the student's browser for up to 30 minutes. There is no database, account, analytics, messaging, or server-side result history.

## Local setup

No secrets or environment variables are required.

1. Run `npm install`.
2. Run `npm run dev`.
3. Open `http://localhost:3000`.

## Deployment

The site deploys to Vercel with no database, authentication, cron job, or environment configuration.

## Commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run benchmark:scan -- --count=20 --concurrency=3
```

Production uses a fixed pool of three browser checks. The benchmark command measures a chosen development concurrency without changing that production value or storing page HTML, URLs, or secrets.
