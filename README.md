# English Chat Booking Finder

A stateless Next.js site that reads the public [BYU-Pathway English Chat scheduling page](https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0) whenever a visitor refreshes it. It shows the current trusted Google Calendar booking-page links and saves nothing.

## What it can verify

The source page lists tutor booking pages. Google Calendar renders appointment times inside each booking page and does not provide a stable public server API for this project to read individual slots. The site therefore labels links honestly: open one to see and book its current available times. It does not infer availability from the presence of a link.

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
```
