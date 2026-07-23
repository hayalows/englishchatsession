# Changelog

All notable production changes are documented here.

This project follows [Semantic Versioning](https://semver.org/). Dates use ISO `YYYY-MM-DD` format.

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

[1.0.0]: https://github.com/hayalows/englishchatsession/releases/tag/v1.0.0
