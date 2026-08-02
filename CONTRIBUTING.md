# Contributing

Thank you for helping keep English Chat Finder accurate, understandable, and reliable.

## Before starting

1. Check existing issues and pull requests.
2. Create a short-lived branch from the latest `main`.
3. Keep each pull request focused on one clear outcome.
4. Do not add student information, private appointment data, credentials, or raw booking-page archives.

## Local setup

Use Node.js 24 and install the committed dependency versions:

```powershell
npm.cmd ci
```

Run the development server:

```powershell
npm.cmd run dev
```

## Required checks

Before opening or updating a pull request, run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

For changes to availability detection, also test at least one real trusted Google Calendar booking page and record only the status, checked range, and expected date. Do not commit raw page HTML or booking URLs.

## Pull requests

Every pull request should explain:

- What changed and why.
- Student-facing impact.
- Whether the availability engine changed.
- How the change was tested.
- Any deployment, privacy, or external-provider risk.

Use a Vercel preview for visual changes. Test both narrow mobile and desktop layouts before merging.

## Design principles

- Put the student's next action first.
- Keep language simple and calm.
- Distinguish confirmed no openings from checks that failed.
- Maintain keyboard access, visible focus, sufficient contrast, and reduced-motion support.
- Avoid adding accounts, storage, messaging, or tracking without an explicit product and privacy decision.

## Availability-engine changes

The Google Calendar integration is an external dependency and deserves extra care.

- Preserve the trusted-host allowlist.
- Keep one tutor per `/api/slots` request.
- Never turn a provider failure into `none_in_view`.
- Keep the scan range visible to the student.
- Add or update tests for parser and slot-response behavior.
- Verify the production endpoint after deployment.

## Releases

The normal release path is:

1. Pull request into `main`.
2. Passing GitHub checks and Vercel preview.
3. Merge into `main`.
4. Automatic Vercel production deployment.
5. Live smoke test.
6. Version tag and GitHub Release for meaningful stable versions.

For every meaningful release or product milestone, update the documentation trail before merging:

- Add a concise entry to [CHANGELOG.md](CHANGELOG.md).
- Add the human-readable **when, why, what, how, and verification** summary to [docs/PROJECT_PROGRESS.md](docs/PROJECT_PROGRESS.md).
- Update the README's current-progress wording if the product boundary, production branch, or latest milestone changes.

Keep the progress page factual. Link the relevant commit or pull request, distinguish shipped behavior from future ideas, and do not claim a deployment or live behavior that was not checked.

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for the complete release and rollback runbook.
