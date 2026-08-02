# Changelog

All notable production changes are documented here.

This project follows [Semantic Versioning](https://semver.org/). Dates use ISO `YYYY-MM-DD` format.

## [1.8.0] - 2026-08-02

### Added

- Progressive administrator lists that show a manageable first page of availability cards and issues, with **Show more** and **Show fewer** controls.
- A dedicated administrator sign-in presentation with clear expectations, password visibility control, accessible field guidance, and a direct route back to the student finder.

### Changed

- Added a readable administrator typography and layout layer for the sign-in, dashboard, navigation, and mobile states.
- Kept administrator copy-link actions icon-led while improving labels, state feedback, focus behavior, and touch sizing.

### Fixed

- Reset progressive list state when audit content changes and added regression coverage for the v1.8 administrator experience.

## [1.7.2] - 2026-08-02

### Changed

- Refined the administrator console hierarchy so the current status and audit action come before task navigation.
- Improved mobile and desktop readability with clearer copy, consistent action buttons, stronger contrast, and visible copy-link labels.
- Made the Student finder route explicit in the branded administrator navigation while preserving the existing audit, authentication, and student behavior.

## [1.7.1] - 2026-08-02

### Changed

- Reorganized the administrator console into Overview, Availability, Issues, and Volunteers task views.
- Made availability, issue counts, audit completion, recovery context, and audited-volunteer lookup visible without scrolling through the full issue list.
- Preserved the v1.7.0 audit, authentication, student finder, and scanner behavior while improving responsive layout and keyboard-accessible task navigation.

## [1.7.0] - 2026-08-01

### Added

- Separate password-protected administrator console at `/admin` with explicit bounded calendar health audits, fault filters, human-readable issue reports, recovery visibility, availability snapshots, and audited-volunteer lookup.
- Server-side `ADMIN_PASSWORD` session protection with an expiring HTTP-only secure same-site cookie, login rate limiting, and fail-closed behavior when the password is not configured.
- Small accessible copy-link action on student and administrator calendar cards that copies the exact official Google booking URL.

### Changed

- Kept the student finder and scanner contracts unchanged while exposing operational health findings separately from browser-local student scan state.

## [1.6.0] - 2026-07-29

### Changed

- Made progressive scan results truthful when calendars finish at different times, are temporarily paused, or cannot be verified.
- Added active-range weekday filtering and first-appearance guidance so the result view follows the dates the student is actually viewing.
- Treated legacy organizer landing pages as unverified rather than permanently unavailable and strengthened saved-scan recovery and link-health coverage.

## [1.5.0] - 2026-07-29

### Added

- Expiring browser-local link health with last-check, last-success, consecutive-failure, reason, and retry-after metadata.
- Automatic recovery for booking URLs that work again after a temporary pause.
- Official-list URL reconciliation so a new or replaced volunteer link is checked immediately.
- Progressive worker-pool tests covering zero-based progress, per-request progress, early opening disclosure, continued background scanning, and cancellation.
- Saved scan restoration so completed results and interrupted progress remain useful after a page reload.

### Changed

- Replaced the permanent unavailable-link skip set with a 10-minute cooldown for temporary provider failures and an 8-hour cooldown for unavailable schedules.
- Excluded already-paused links from each scan's visible total without adding them to completed progress.
- Retried temporary provider and rate-limit results once before applying a cooldown.
- Expanded the initial **Find available sessions** action to the full finder width while keeping completed-result actions compact on desktop.
- Simplified the recommended scan mode to **Any volunteer** with **Search by name** retained as a secondary option.
- Renamed the source status to **volunteers listed** and placed the optional paused-calendar count inside the quiet availability explanation.

## [1.4.0] - 2026-07-29

### Added

- Calm completed-scan outcomes for available sessions, no current availability, paused scans, and searches that could not produce a reliable answer.
- Student-facing component tests that prevent unavailable-link counts and operational retry controls from returning to the empty state.
- Session-level memory for permanently unavailable booking links so they are not repeatedly requested during the same visit.

### Changed

- Reduced the completed empty state to one explanation, one **Check again** action, and one quiet **New search** action.
- Kept individual link problems and temporary provider failures out of the public results while preserving their internal classification.
- Showed result cards only when a bookable opening is available.
- Renamed the header action from **Find a time** to the more accurate **Check availability**.
- Standardized finder and result actions at 46–48px, content width on desktop, and full width only on small mobile screens.
- Removed the footer facts for free, 30-minute, twice-weekly, and online sessions.

## [1.3.0] - 2026-07-29

### Added

- Name-specific no-opening summaries with the volunteer, checked date range, direct Google link, and a clear next action.
- Automatic slowdown when rate limiting or repeated transient failures make a scan less reliable.
- Retry-all action for calendars that could not be verified.
- Best-effort endpoint rate limiting, request-size limits, redirect revalidation, normalized API errors, and production security headers.
- Accessible scan-completion announcement and focus handoff.
- Result freshness guidance that keeps recent context visible instead of abruptly removing it.

### Changed

- Replaced the technical scan-all label with **Find available sessions**.
- Renamed **Needs attention** to the clearer **Couldn’t verify** state and separated unavailable links from temporary failures.
- Moved the compact English Chat facts from the hero into the footer.
- Improved result summaries, localized date ranges, external-link labels, small-text contrast, mobile hierarchy, and action priority.
- Updated Next.js to a patched release and refreshed security and privacy documentation.

## [1.2.0] - 2026-07-23

### Added

- Action-first finder in the hero so scanning everyone or searching by name is immediately visible.
- Adaptive choose, scanning, completed, stopped, expired, and source-error states in one consistent surface.
- Native volunteer-name suggestions with clear match counts and a focused single-volunteer check.
- Progressive result disclosure that keeps filters, explanations, and result cards hidden until they are useful.

### Changed

- Moved the weekly instructions below the finder so the student’s main task comes first.
- Replaced the large weekly-goal card with a compact, scannable weekly-goal fact.
- Removed the unnecessary confirmation step before a full scan; scans remain cancellable and preserve completed checks.
- Kept result scope stable when starting another search so completed results do not unexpectedly disappear.
- Refined mobile spacing, touch targets, contrast, motion, reduced-motion behavior, result hierarchy, and failure guidance.
- Preserved the existing Google Calendar availability adapter and bounded worker pool without scanner-engine changes.

## [1.1.1] - 2026-07-23

### Changed

- Replaced Instrument Serif with Inter across the complete interface.
- Rewrote the hero around the student’s task of finding an available English Chat session.
- Reduced the volunteer-source status to a quiet utility row.
- Added an explicit choice between scanning all volunteers and searching by name.
- Strengthened result action hierarchy so the primary check or booking action is visually distinct from opening Google directly.

## [1.1.0] - 2026-07-23

### Added

- Editorial, mobile-first interface using Instrument Serif for the main hero.
- Action-first scan receipt with scope, checked range, completion time, useful counts, expiry guidance, and a clear next step.
- Automatic result focus in the order this week, next week, later, and needs attention.
- Independent volunteer result cards with clearer local appointment times and direct Google booking actions.
- Compact mobile result selector and collapsible no-opening results.
- Tested resume flow that continues only calendars left unfinished by a stopped scan.
- Presentation-level tests for local date grouping and post-scan result selection.

### Changed

- Replaced the large volunteer-count banner with a compact source-status row.
- Refined BYU-Pathway colors, contrast, focus states, touch targets, and reduced-motion behavior.
- Clarified student guidance and the distinction between confirmed no openings and failed checks.
- Updated the package version to `1.1.0`.

## [1.0.0] - 2026-07-23

### Added

- Student-first English Chat appointment finder.
- Current volunteer discovery from the official scheduling page.
- Direct Google Calendar availability checks covering the next 60 days.
- Bounded parallel scanning, cancellation, search, and reliable result categories.
- Monday-to-Sunday filters for this week and next week in the student's local timezone.
- Responsive desktop and mobile experience with accessible motion and contrast preferences.
- Temporary 30-minute browser result restoration without a database or account.
- Automated quality checks, maintenance guidance, and production recovery documentation.

### Removed

- Supabase persistence and authentication.
- Telegram and scheduled notification delivery.
- Chromium-based calendar scanning.

[1.5.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.5.0
[1.8.0]: https://github.com/hayalows/englishchatsession/commit/62f18254e244fa12c4d95a3814a282a81a721493
[1.7.2]: https://github.com/hayalows/englishchatsession/commit/9fa1830
[1.7.1]: https://github.com/hayalows/englishchatsession/commit/98d348b
[1.7.0]: https://github.com/hayalows/englishchatsession/commit/c3b7264
[1.6.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.6.0
[1.4.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.4.0
[1.2.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.2.0
[1.3.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.3.0
[1.1.1]: https://github.com/hayalows/englishchatsession/releases/tag/v1.1.1
[1.1.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.1.0
[1.0.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.0.0
