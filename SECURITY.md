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

The production app is intentionally stateless:

- No accounts or authentication.
- No application database.
- No server-side appointment-result history.
- No analytics or messaging integration.
- Browser results expire after 30 minutes.

Never commit `.env`, `.env.local`, API tokens, private volunteer information, student information, raw appointment-page archives, or captured network credentials. If a secret is committed, revoke it first, then remove it from the repository and history.
