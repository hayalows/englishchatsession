# Changelog

All notable production changes are documented here.

This project follows [Semantic Versioning](https://semver.org/). Dates use ISO `YYYY-MM-DD` format.

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

[1.1.1]: https://github.com/hayalows/englishchatsession/releases/tag/v1.1.1
[1.1.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.1.0
[1.0.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.0.0
