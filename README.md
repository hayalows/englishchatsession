# English Chat Finder

[![Quality checks](https://github.com/hayalows/englishchatsession/actions/workflows/ci.yml/badge.svg)](https://github.com/hayalows/englishchatsession/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-English_Chat_Finder-006f7a)](https://englishchatsession.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-0f2942)](LICENSE)

English Chat Finder helps BYU-Pathway Worldwide students find open 30-minute English Chat appointments with volunteers. It reads the public English Chat scheduling page, checks trusted Google Calendar appointment pages on demand, and sends students to Google to complete the booking.

**Live site:** [englishchatsession.vercel.app](https://englishchatsession.vercel.app)

> This is an independent student-built helper. The official scheduling page and Google Calendar remain the final sources of truth.

## What the app does

- Loads the current volunteer booking links from the official scheduling page.
- Checks Google Calendar's machine-readable appointment service for the next 60 days.
- Places the scan-all and search-by-name actions directly beside the main introduction.
- Adapts the same finder surface from setup to progress to a plain-language outcome.
- Groups confirmed openings into this week, next week, and later dates using the student's local timezone.
- Shows bookable openings immediately and reduces a completed empty scan to one calm explanation and one clear action.
- Scans volunteers through a bounded worker pool instead of opening every calendar at once.
- Keeps unavailable links and temporary provider failures out of the student-facing results, while never counting them as **No sessions available**.
- Keeps results in the student's browser for reference, marks them for rechecking after 10 minutes, and removes them after 24 hours.
- Restores completed results after a page reload and safely turns an interrupted saved scan into a resumable paused state.
- Slows the current scan when repeated provider failures or rate limiting suggest that reliability is at risk.
- Temporarily pauses unavailable schedules for 8 hours and provider failures for 10 minutes, then checks them again automatically.
- Treats a changed or newly listed volunteer URL as new so it can be checked immediately.
- Provides a separate password-protected `/admin` operations console for explicit calendar health audits, issue reports, and availability snapshots.
- Optionally records privacy-respecting first-party finder opens, one scan-start action per user request, and coarse visible-time engagement milestones; it shows the report at `/analytics` without recording individual calendar checks.

The public student finder has no student account system, booking database, messaging service, cron job, or server-side appointment-result history. An optional first-party analytics database stores only bounded `page_view`, `scan_started`, and active-time `engagement` events from the public finder at `/`; a scan start is one user-level request rather than one event per calendar, and no search text, result, or booking choice is recorded. Tracking is fire-and-forget, the scanner does not depend on the database or read analytics data, and the finder works when analytics is unavailable. The administrator console and visitor analytics use one server-configured password with separate login entries and expiring session cookies. Link-health data stays in the student's browser and contains only operational booking-URL status; it does not contain student identities, searches, or appointment choices. Vercel Web Analytics records aggregate visits separately. Exact appointment times and final availability must always be confirmed on Google before booking.

## Current progress

The current production line is **v1.8.0**, released on **2026-08-02**. GitHub `main` is the canonical application source, and Vercel deploys production from that branch.

For an easy-to-scan record of the project:

- [Project progress](docs/PROJECT_PROGRESS.md) explains what changed, when it changed, why each milestone mattered, and how it was implemented.
- [Changelog](CHANGELOG.md) is the concise release-by-release record.
- [Operations and recovery](docs/OPERATIONS.md) describes the source-of-truth rules, release checks, live verification, and rollback path.
- [GitHub commit history](https://github.com/hayalows/englishchatsession/commits/main) shows the exact implementation sequence.

The latest milestone focuses on making the administrator workflow easier to understand and operate: guided sign-in, readable hierarchy, progressive availability and issue lists, stronger mobile behavior, and regression coverage. The student finder, availability engine, privacy boundary, and browser-local result model remain intact.

## How it works

```text
Official scheduling page
        |
        v
GET /api/availability ---> trusted volunteer booking links
        |
        v
Student starts a scan
        |
        v
POST /api/slots -------> Google Calendar availability service
        |
        v
Temporary browser results and direct booking links
```

The main implementation lives in:

- `src/lib/link-health.ts` — temporary booking-link cooldown, expiry, recovery, and official-list reconciliation.
- `src/lib/progressive-scan.ts` — bounded progressive worker pool and zero-based progress reporting.
- `src/lib/slot-request.ts` — browser-to-API request retry behavior.
- `src/lib/saved-scan.ts` — safe restoration of completed or interrupted browser scans.

- `src/components/availability-board.tsx` — student interface, scan queue, filters, and temporary browser storage.
- `src/components/completed-scan-outcome.tsx` — focused completed, empty, and unreliable search outcomes.
- `src/lib/monitoring/availability.ts` — official scheduling-page fetch.
- `src/lib/monitoring/parser.ts` — trusted booking-link extraction.
- `src/lib/monitoring/slots.ts` — direct Google Calendar availability check.
- `src/lib/date-window.ts` — local Monday-to-Sunday week filters.
- `src/lib/result-presentation.ts` — local result grouping, appointment ordering, and next-view selection.

## Local development

Requirements:

- Node.js 24
- npm 11 or a compatible npm version

The public student finder requires no secrets or environment variables. To enable the administrator console and visitor analytics locally, set a long random `ADMIN_PASSWORD` in `.env.local`; the server checks it and stores only a signed, expiring HTTP-only session cookie. First-party analytics is optional: set `DATABASE_URL` to a Neon PostgreSQL connection string and run [`docs/analytics.sql`](docs/analytics.sql) once. The scanner does not depend on this database, and analytics failures never block a scan.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`.

The administrator console is at `http://localhost:3000/admin`. Visitor analytics is at `http://localhost:3000/analytics`, with a separate login entry at `http://localhost:3000/analytics/login`. Both use the same `ADMIN_PASSWORD`; if it is not configured, protected access fails closed.

## Validation

Run the complete pre-release validation:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

The development-only scan benchmark is:

```powershell
npm.cmd run benchmark:scan -- --count=20 --concurrency=3
```

Production starts with a fixed pool of ten direct checks and can reduce the active pool to three when repeated failures or rate limiting occur. It never increases beyond the tested maximum. The benchmark measures a chosen development concurrency without changing the production value or storing page HTML, booking URLs, or secrets.

## Deployment

Vercel is connected to this GitHub repository.

- Production branch: `main`
- Framework: Next.js
- Root directory: repository root
- Build command: `npm run build`
- Node.js: 24.x
- Production URL: [englishchatsession.vercel.app](https://englishchatsession.vercel.app)
- Production environment: set `ADMIN_PASSWORD` in Vercel Environment Variables before using `/admin` or `/analytics`; do not commit the password or put it in client code.
- Optional analytics environment: set `DATABASE_URL` only after applying [`docs/analytics.sql`](docs/analytics.sql) to the Neon database. Do not expose the connection string to client code.

Pull requests receive GitHub quality checks and a Vercel preview. Merging a tested pull request into `main` is the normal production release path. Manual production deployments should be reserved for recovery situations.

See [Operations and recovery](docs/OPERATIONS.md) for the release checklist, live verification, rollback procedure, and maintenance schedule.

## Contributing and security

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.
- Report security concerns through the process in [SECURITY.md](SECURITY.md).
- User-interface bugs belong in GitHub Issues. Appointment or volunteer-list questions belong on the [official scheduling page](https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0).

## Project stewardship

Built and maintained by **Papa Kojo Mensah**.

This repository is the canonical source for the application. Stable production versions are preserved as GitHub Releases and version tags.

## License

[MIT](LICENSE)
