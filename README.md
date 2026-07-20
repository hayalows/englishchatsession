# English Chat Session Monitor

A private Next.js monitor for the BYU–Pathway English Chat scheduling page. It records published Google Calendar booking links, detects new, reopened, changed, and unavailable listings, and can email alerts through Resend.

## What it monitors

The configured source is the public [English Chat Student Center scheduling page](https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0). At the time this project was built, the page exposed booking links and tutor names but no individual appointment dates, times, or source timezone. The parser deliberately stores those fields as `null`; it does not infer a timezone.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. In Supabase, open **Project settings → API** (or the **Connect** dialog) and copy the Project URL and legacy `anon` key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. In **Project settings → API Keys → Legacy API Keys**, copy `service_role` into `SUPABASE_SERVICE_ROLE_KEY`. Keep this only in `.env.local` and Vercel server-side environment variables.
4. In Resend, create an API key and verify the domain used by `ALERT_EMAIL_FROM`; set `ALERT_EMAIL_TO` to the inbox that should receive alerts.
5. Generate a random secret of at least 24 characters for `CRON_SECRET`.
6. Run `npm run dev`, then open `http://localhost:3000`.

## Supabase auth setup

The dashboard uses Supabase email magic links. In **Authentication → URL Configuration**, set the Site URL and an additional redirect URL to your deployed Vercel URL. Sign in once with the private email address, then disable public email signups if this should remain single-user.

## Deployment

`vercel.json` registers `/api/cron/monitor` for `*/15 * * * *`. Add every value from `.env.example` to Vercel before deployment. Vercel secures the cron invocation with `CRON_SECRET` in its `Authorization` header.

Vercel Hobby only permits cron jobs once daily; the 15-minute schedule requires a non-Hobby team. The application lock prevents overlapping monitor invocations regardless of trigger source.

## Commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
