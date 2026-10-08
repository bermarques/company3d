# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository instead.

## Security model

This repository is the web app. Sign-in, GitHub tokens, permissions, building settings and subscriptions are
handled by the API (worktown3d-api), whose SECURITY.md covers them.

- The browser only talks to this server. It serves the client and forwards `/api`, `/auth` and `/stripe` to the API
  (`API_URL`) unchanged, keeping the `Host` header and appending the client address to `X-Forwarded-For`, so the
  API's host check, CSRF check and `__Host-` session cookies all apply to this one origin. `API_URL` must be a
  private address: the API should never be reachable from the internet.
- Without `PUBLIC_URL` (local mode) it listens on `127.0.0.1` and only answers for `localhost` host names
  (DNS-rebinding protection). With `PUBLIC_URL` it only answers for that host name.
- Strict Content-Security-Policy (no inline script except the hashed import map, no framing), `nosniff`,
  `Referrer-Policy`, HSTS on https, and request time limits. Only files under `public/` and the Three.js build are
  served.
- All GitHub content is rendered as text (no `innerHTML`); external links must be `https://`.
- Card details never reach Worktown3D: people pay on Stripe Checkout and manage billing in Stripe's customer portal.
