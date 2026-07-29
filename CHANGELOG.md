# Changelog

All notable production changes are documented here.

This project follows [Semantic Versioning](https://semver.org/). Dates use ISO `YYYY-MM-DD` format.

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

[1.2.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.2.0
[1.3.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.3.0
[1.1.1]: https://github.com/hayalows/englishchatsession/releases/tag/v1.1.1
[1.1.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.1.0
[1.0.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.0.0
