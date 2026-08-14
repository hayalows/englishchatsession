# Security Policy

## Supported version

The current production version on `main` is supported. Older tags are preserved for recovery but do not receive security fixes.

## Reporting a vulnerability

Do not open a public issue containing credentials, private data, exploit details, or a working proof of concept.

Use GitHub's **Security → Report a vulnerability** option when it is available. If private vulnerability reporting is unavailable, contact the maintainer through the [GitHub profile](https://github.com/hayalows) without publishing sensitive details.

Include:

- The affected page, endpoint, or commit.
- Clear reproduction steps.
- The expected and observed behavior.
- The likely impact.
- A safe suggestion for verification, if known.

## Data and secret boundaries

The public finder remains stateless with respect to student accounts and bookings:

- No accounts or authentication.
- No server-side appointment-result history.
- No messaging integration.
- Appointment results stay only in the student's browser and are removed after 24 hours.
- Vercel Web Analytics collects aggregate page-view and device information. It does not receive volunteer appointment results from the app.

An optional private analytics database stores only bounded `page_view`, `scan_started`, and active-time `engagement` events from the public finder at `/`, with pseudonymous browser/session IDs and coarse request metadata. One `scan_started` event represents one user scan request, not the individual calendars checked. It does not store raw IP addresses, student names, email addresses, volunteer search text, scanner results, or appointment results. The scanner never reads this table, analytics writes are fire-and-forget, and the client never waits for analytics before continuing. Keep `DATABASE_URL` server-only and apply [`docs/analytics.sql`](docs/analytics.sql) before enabling it.

The calendar-check endpoint accepts only HTTPS Google Calendar booking links, limits request size, applies a best-effort per-client request allowance, and does not store booking-page HTML.

Never commit `.env`, `.env.local`, API tokens, private volunteer information, student information, raw appointment-page archives, or captured network credentials. If a secret is committed, revoke it first, then remove it from the repository and history.
