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
- Sessions are sealed with AES-256-GCM (key derived from `SESSION_SECRET`) into an `HttpOnly`, `SameSite=Lax`,
  `Secure`, `__Host-` prefixed cookie with idle and absolute expiry. The browser holds only ciphertext: page scripts
  can't read the cookie, and it can't be read or altered without the key. GitHub tokens are refreshed when they
  expire (GitHub Apps) and revoked on sign-out, which also makes any copied cookie useless. The OAuth `state` and
  PKCE verifier travel the same way, so no server memory is needed (serverless-friendly).
- Access to a building requires active membership of that organization, re-checked every few minutes, so people
  who leave lose access. Company3D's own settings (floor layout, repo connections) can only be changed by org owners.
- Cached GitHub data is namespaced per user, so one person's private data never reaches another.
- Strict Content-Security-Policy (no inline script except the hashed import map, no framing), `nosniff`,
  `Referrer-Policy`, HSTS on https, rate limits on sign-in, API and writes, request size and time limits.
- All GitHub content is rendered as text (no `innerHTML`); external links must be `https://`.
- The unauthenticated demo runs in a private in-memory sandbox per visitor with size limits.

Keep `SESSION_SECRET` secret and long (32+ random characters). Rotating it signs everyone out.

Known limits: there's no server-side list of sessions, so "sign out everywhere" relies on revoking the GitHub token
(sign-out does this). There's no audit log yet.
