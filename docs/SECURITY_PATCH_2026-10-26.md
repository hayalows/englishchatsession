# Security patch review (26 October 2026)

Scope: dependency advisories and Google Calendar redirect handling. No analytics data, secrets or production settings are changed in this patch.

## Threat boundaries and verification

- A student requests a calendar scan with an HTTPS Google booking link. It may redirect, but the server must contact **only** the two approved Google Calendar hosts at the default HTTPS port.
- An untrusted redirect, protocol change, credential-bearing URL or nonstandard port must fail without contacting the target host.
- Existing direct appointment URLs, public finder, admin login, analytics recording and saved reports must continue to work.
- Runtime dependencies must use security-patched Next.js, React and image-processing libraries. Regenerate `package-lock.json` through npm, rather than editing integrity hashes manually.
- Existing CI must pass lint, types, tests, and production build. Verify production separately after merge.

The redirect boundary is enforced with `redirect: "manual"` and pre-fetch validation, with a six-request maximum. Requests to Google Calendar's fixed RPC endpoint are unchanged.

## Open operational consideration: rate limits

The app's in-memory request limiter is per-process, not global across Vercel instances. It is best-effort and does not provide a distributed abuse boundary. Vercel's front-end `x-forwarded-for` is overwritten by Vercel to prevent IP spoofing in its infrastructure, but a WAF rate-limit rule or shared backend still needs to be configured for production. Do not claim the in-process limiter provides global protection. The Vercel Hobby firewall supports one WAF rate-limiting rule per project, so prioritise `/api/slots` and monitor sign-in separately, or use a shared store after an approved data-model change.

## Verifications

- Checks to run on the security PR: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev --audit-level=high`.
- After lockfile regeneration, compare installed package versions to the relevant GitHub advisories and inspect any remaining Dependabot alerts.
- Live E2E scenarios (not claimed as completed by this document): public finder loads, known schedule resolves, untrusted redirect is denied without outbound request, admin unauthenticated redirect works, and analytics remains inaccessible without its session. Use disposable inputs and avoid real credentials in testing.
- A passing build and unit suite do not prove redirect safety against all Google-origin redirect responses or production WAF limits.
