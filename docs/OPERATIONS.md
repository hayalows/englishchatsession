# Operations and recovery

This runbook keeps GitHub, Vercel, and the live English Chat Finder aligned.

## Sources of truth

| Concern | Source of truth |
| --- | --- |
| Application code | GitHub `main` |
| Dependency versions | `package-lock.json` |
| Production configuration | Vercel project `englishchatsession` |
| Current volunteers | Official English Chat scheduling page |
| Appointment availability | Google Calendar booking service |
| Stable restore points | GitHub tags and Releases |

Vercel deployments are executable artifacts, not the canonical source-code backup.

## Production configuration

- GitHub repository: `hayalows/englishchatsession`
- Production branch: `main`
- Vercel project: `mensahpkaygmailcoms-projects/englishchatsession`
- Vercel project ID: `prj_2gmuQpj5AEMvGS4FqlWkwVx7OyXq`
- Framework: Next.js
- Root directory: `.`
- Node.js: `24.x`
- Production alias: `https://englishchatsession.vercel.app`
- Required environment variables: none

The local `.vercel/project.json` link is intentionally ignored by Git. A fresh checkout should be linked to the existing Vercel project rather than committing account-specific project metadata.

## Standard release

1. Create a short-lived branch from the latest `main`.
2. Make focused changes.
3. Run:

   ```powershell
   npm.cmd ci
   npm.cmd run lint
   npm.cmd run typecheck
   npm.cmd test
   npm.cmd run build
   ```

4. Push the branch and open a pull request into `main`.
5. Confirm GitHub quality checks and the Vercel preview.
6. Merge the pull request.
7. Wait for the automatic Vercel production deployment.
8. Perform the live verification below.
9. Update `CHANGELOG.md` and create a version tag for a meaningful release.

Do not use `vercel --prod` for routine releases. A manual production deployment can publish a branch that is not yet the GitHub source of truth.

## Live verification

Verify all of the following after production becomes ready:

1. `https://englishchatsession.vercel.app` returns HTTP 200.
2. The page contains the current week and next week filters.
3. `/api/availability` returns the current volunteer list.
4. A trusted volunteer booking URL can be posted to `/api/slots`.
5. The response status is one of `available`, `none_in_view`, `unknown`, or `failed`.
6. The response reports the checked date range.
7. If a known opening exists, compare the returned date with Google Calendar.

Never log or publish the complete tutor URL list during routine verification.

## Rollback

Prefer a reversible rollback:

1. Identify the last verified GitHub Release and Vercel deployment.
2. In Vercel, promote the known-good deployment or use the documented rollback action.
3. Create a GitHub pull request that reverts the faulty commit.
4. Run the complete validation suite.
5. Merge the revert so GitHub and Vercel agree again.
6. Repeat the live verification.

Do not force-push or reset `main`. Production history should remain auditable.

## External dependency failure

The app depends on two public external systems:

- The official Google Sites scheduling page.
- Google Calendar's appointment-booking service.

If all or many checks begin failing:

1. Confirm the official scheduling page still loads.
2. Check whether its volunteer-link markup changed.
3. Check one Google Calendar booking page manually.
4. Inspect Vercel function logs for HTTP status patterns.
5. Reduce scanning pressure if rate limiting appears.
6. Keep failures classified as **Needs attention**; never present them as confirmed no openings.
7. Add a regression test before changing parsing or slot logic.

## Maintenance schedule

Monthly:

- Review Dependabot pull requests.
- Run the full validation suite.
- Check the official page still produces a reasonable volunteer count.
- Confirm one real available or unavailable calendar result.

Quarterly:

- Review Node.js, Next.js, React, and Vercel runtime support.
- Review accessibility on mobile and desktop.
- Confirm repository rules and CODEOWNERS still match the maintainer.
- Download or create a separate repository backup.

Before the scheduling program changes:

- Re-read the official student instructions.
- Verify the required number and duration of sessions.
- Update student-facing language separately from availability-engine changes.

## Backup

GitHub is the primary repository. Keep at least one additional recoverable copy:

```powershell
git clone --mirror https://github.com/hayalows/englishchatsession.git englishchatsession-backup.git
```

Store the mirror outside the normal working folder. Refresh it periodically with `git remote update`.
