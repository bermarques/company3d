# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository instead.

## Security model

**Local mode** (no `GITHUB_CLIENT_ID`): the server acts as whoever is signed in to the GitHub CLI on that machine.
It listens on `127.0.0.1` only, refuses requests whose `Host` isn't localhost (DNS-rebinding protection) and
requires a custom header plus same origin on every write (CSRF protection). Don't expose local mode to a network.

**Hosted mode** (`GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` + `PUBLIC_URL`):

- Everyone signs in with GitHub (OAuth web flow with `state` bound to the browser and PKCE). Every GitHub call is
  made with that person's own token, so GitHub enforces repository and organization permissions. The server never
  uses the GitHub CLI in this mode.
- Tokens live only in server memory, are never sent to the browser, are refreshed when they expire (GitHub Apps)
  and are revoked on sign-out. Sessions are random 256-bit ids in `HttpOnly`, `SameSite=Lax`, `Secure`
  (`__Host-` prefixed) cookies with idle and absolute expiry.
- Access to a building requires active membership of that organization, re-checked every few minutes, so people
  who leave lose access. Company3D's own settings (floor layout, repo connections) can only be changed by org owners.
- Cached GitHub data is namespaced per user, so one person's private data never reaches another.
- Strict Content-Security-Policy (no inline script except the hashed import map, no framing), `nosniff`,
  `Referrer-Policy`, HSTS on https, rate limits on sign-in, API and writes, request size and time limits.
- All GitHub content is rendered as text (no `innerHTML`); external links must be `https://`.
- The unauthenticated demo runs in a private in-memory sandbox per visitor with size limits.

Known limits: sessions are in memory (one instance; everyone signs in again after a restart), and there's no
audit log yet.
