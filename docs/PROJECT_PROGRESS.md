# English Chat Finder project progress

This is the narrative companion to [`CHANGELOG.md`](../CHANGELOG.md). The changelog is the compact release record; this page explains the product problem behind each milestone and the implementation direction used to solve it.

## Current snapshot

- **Current release:** v1.8.0
- **Latest release date:** 2026-08-02
- **Canonical source:** [`main`](https://github.com/hayalows/englishchatsession/tree/main)
- **Latest v1.8 implementation merge:** [`62f1825`](https://github.com/hayalows/englishchatsession/commit/62f18254e244fa12c4d95a3814a282a81a721493)
- **Production branch:** `main`
- **Production site:** [englishchatsession.vercel.app](https://englishchatsession.vercel.app)

The product currently has two deliberately separate surfaces:

- The public student finder reads the official scheduling page, checks trusted Google Calendar appointment pages on demand, and keeps temporary scan state in the student's browser.
- The administrator console at `/admin` provides password-protected, bounded calendar-health audits and operational summaries. It does not turn the student finder into an account system, database, booking system, or server-side history store.

The v1.8.0 source was checked locally with `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, and `npm.cmd run build`. The observed result was 86 passing tests across 22 test files and a successful production build.

## Release timeline

### 2026-07-23 — [v1.0.0](https://github.com/hayalows/englishchatsession/releases/tag/v1.0.0): establish the student-first finder

**Why:** Create a dependable, low-risk path for students to find an English Chat appointment without introducing accounts, stored student searches, or a server-side booking workflow.

**What changed:** The first production finder discovered current volunteer links, checked the next 60 days of Google Calendar availability, supported bounded parallel scanning, cancellation, name search, local week filters, and temporary browser result restoration.

**How:** A Next.js application used the official scheduling page and the Google Calendar availability service as external sources of truth. Results were normalized in the browser, with no database, authentication, messaging, or scheduled notification layer.

### 2026-07-23 — [v1.1.0](https://github.com/hayalows/englishchatsession/releases/tag/v1.1.0) and [v1.1.1](https://github.com/hayalows/englishchatsession/releases/tag/v1.1.1): clarify the booking task

**Why:** Students needed to understand what the scan found, which opening to choose, and where booking actually finished.

**What changed:** The interface gained action-first scan receipts, clear result grouping, direct booking actions, compact mobile result selection, resumable scans, a simpler Inter-based visual language, and an explicit choice between scanning all volunteers and searching by name.

**How:** Result presentation was separated from scan execution. Local date grouping and post-scan focus were tested independently so the interface could guide the student without changing the Google Calendar adapter.

### 2026-07-23 — [v1.2.0](https://github.com/hayalows/englishchatsession/releases/tag/v1.2.0): make the main action immediate

**Why:** The finder was most useful when a student could start the right search without passing through an unnecessary confirmation step.

**What changed:** The hero became action-first, the scan surface handled choose, scanning, completed, stopped, expired, and source-error states, and results were disclosed progressively as they became useful.

**How:** The existing bounded worker pool and Google Calendar adapter were preserved while the React state model, action hierarchy, mobile spacing, focus behavior, and reduced-motion states were refined around the student's next decision.

### 2026-07-29 — [v1.3.0](https://github.com/hayalows/englishchatsession/commit/aff2c51): improve trust and failure clarity

**Why:** A failed external calendar check must never look like a confirmed empty calendar, and a public availability endpoint needs basic defensive controls.

**What changed:** Named no-opening summaries, automatic slowdown, retry-all recovery, endpoint rate limiting, request-size limits, redirect revalidation, normalized API errors, security headers, accessible completion announcements, and clearer **Couldn't verify** language were added.

**How:** Availability outcomes were kept separate from operational failures. The scanner and API now carry the checked range and explicit status categories through to the student-facing result, while security checks stay at the API boundary.

### 2026-07-29 — [v1.4.0](https://github.com/hayalows/englishchatsession/releases/tag/v1.4.0): make completed outcomes calm and honest

**Why:** A completed empty scan should explain what was actually checked without exposing a technical incident report or implying that unavailable calendars were confirmed empty.

**What changed:** Focused completed, empty, paused, and unreliable outcomes were added. Result cards appear only for bookable openings, and the empty state has one clear **Check again** action plus a quiet **New search** action.

**How:** A dedicated completed-scan outcome component and presentation tests separated public result language from internal link classifications and retry controls.

### 2026-07-29 — [v1.5.0](https://github.com/hayalows/englishchatsession/releases/tag/v1.5.0): make link health temporary and recoverable

**Why:** A calendar that fails once should not disappear forever, while a temporarily paused calendar should not make progress totals look misleading.

**What changed:** Browser-local link-health metadata gained expiry, last-check, last-success, failure-count, reason, and retry-after fields. Temporary failures and unavailable schedules received different cooldowns, automatic recovery, official-list reconciliation, saved-scan restoration, and progressive worker-pool coverage.

**How:** Link health remained in local storage and was reconciled against the current official URL list on each availability refresh. Paused links were excluded from the active visible total, and temporary provider/rate-limit outcomes were retried before a cooldown was recorded.

### 2026-07-29 — [v1.6.0](https://github.com/hayalows/englishchatsession/releases/tag/v1.6.0): make partial scans truthful

**Why:** Real scans finish unevenly. Confirmed openings should remain useful while other calendars are still running, and incomplete or legacy provider pages must not be presented as a confirmed empty result.

**What changed:** Progressive scan state, strict empty classification, active-range weekday filtering, first-appearance guidance, saved-scan recovery, and legacy organizer-page handling were strengthened. The release also added regression coverage around result visibility, paused calendars, and provider responses.

**How:** The scan tracks completed and queued work separately, derives `visibleTotal` from active work, keeps confirmed openings mounted during background checks, and treats an organizer landing page as unverified rather than permanently unavailable.

### 2026-08-01 — [v1.7.0](https://github.com/hayalows/englishchatsession/commit/c3b7264): add a separate administrator health console

**Why:** Students need a calm finder; operators need detailed calendar health information. Combining those concerns would expose operational noise and weaken the student-facing contract.

**What changed:** `/admin` gained password protection, expiring HTTP-only sessions, rate-limited login, bounded audits, availability snapshots, issue reports, recovery context, audited-volunteer lookup, and accessible copy-link actions.

**How:** The administrator console uses server-side audit and report modules while the public finder remains stateless and browser-local. The password is configured on the server, access fails closed when it is absent, and audit results are not persisted as a student history system.

### 2026-08-02 — [v1.7.1](https://github.com/hayalows/englishchatsession/commit/98d348b): organize the administrator workflow

**Why:** The first health console contained useful information but required too much scrolling and context switching.

**What changed:** Administrator work was organized into Overview, Availability, Issues, and Volunteers views. Availability, issue counts, audit completion, recovery context, and volunteer lookup became visible without reading the entire issue list.

**How:** The existing audit, authentication, student finder, and scanner contracts were preserved while the dashboard gained task-oriented navigation, responsive layout, and keyboard-accessible controls.

### 2026-08-02 — [v1.7.2](https://github.com/hayalows/englishchatsession/commit/9fa1830): refine hierarchy, branding, and interaction clarity

**Why:** The administrator console needed clearer status and audit priority, stronger mobile/desktop readability, and more obvious copy-link actions.

**What changed:** Current status and the audit action moved ahead of task navigation, action buttons and contrast were standardized, copy-link labels became visible to assistive technology and clearer in context, and the branded Student finder route was made explicit.

**How:** The dashboard, top navigation, copy control, and their regression tests were refined without changing authentication, audit semantics, or student finder behavior.

### 2026-08-02 — [v1.8.0](https://github.com/hayalows/englishchatsession/commit/62f1825): make administrator setup and long lists easier to use

**Why:** The administrator workflow still had a high reading load on sign-in and on audits with many openings or issues. The next improvement was progressive disclosure: show the useful first page, then let an operator expand it deliberately.

**What changed:** The sign-in page now explains what administrators can do, provides field guidance and show/hide password control, and gives a clear route back to the student finder. The dashboard received a platform-native typography and layout layer. Availability lists show five cards initially and issue lists show eight, with **Show more** and **Show fewer** controls. Copy-link states, touch targets, and mobile behavior were refined.

**How:** `AdminProgressiveLists` observes the existing audit sections and progressively hides or reveals article cards without changing the audit data. The v1.8 styles are scoped to the administrator experience, and regression tests cover the page wiring, typography tokens, list sizes, and state-reset behavior after audit content changes.

## Supporting updates between releases

These changes were not separate versioned releases, but they are part of the project history:

- **2026-07-24 — desktop branding:** corrected desktop logo alignment while preserving the mobile header.
- **2026-07-25 — analytics:** added Vercel Web Analytics for aggregate visits; appointment results and named student profiles remain outside analytics.
- **2026-07-29 — runtime maintenance:** moved GitHub Actions checks to Node.js 24 and kept the committed dependency/runtime boundary explicit.
- **2026-07-31 — named search clarity:** personalized no-opening outcomes for a searched volunteer while preserving the direct official calendar path.
- **2026-08-02 — administrator polish:** several small header, copy-control, sign-in, progressive-dashboard, and regression-test commits were consolidated into the v1.8.0 administrator experience.

## How progress is recorded from here

For each meaningful milestone, the repository should keep the same trail:

1. The code and tests land on a focused branch and merge into `main`.
2. [`CHANGELOG.md`](../CHANGELOG.md) records the concise user-visible change.
3. This page records the date, reason, implementation approach, and verification boundary.
4. [`docs/OPERATIONS.md`](OPERATIONS.md) records the release, live-check, and rollback procedure.
5. The GitHub commit or pull request remains the exact implementation record; the documentation should link to it when a milestone is released.

This keeps product progress understandable to a student, operator, contributor, or future maintainer without turning the public finder into a more complex product than it needs to be.
