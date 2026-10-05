// "Sign in with GitHub" for hosted mode (OAuth web flow). Works with a GitHub App (recommended: fine-grained
// permissions, expiring tokens, installed per organization) or a classic OAuth App.
// Nothing is kept in server memory between requests, so it also works on serverless hosts.
import crypto from 'node:crypto';
import { parseCookies, cookie, randomId } from './sessions.js';
import { safeEqual } from './security.js';

const GITHUB = 'https://github.com';
const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
const PENDING_TTL = 10 * 60_000;

/** Only same-site paths like "/" or "/o/my-org" may be used as a post-login destination. */
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?:o\/[A-Za-z0-9-]{1,39}\/?)?$/.test(next) ? next : '/';
}

// GitHub App refresh tokens are single-use: concurrent requests in this process share one refresh.
const refreshing = new Map();

export function createAuth({ publicUrl, clientId, clientSecret, scopes, sessions, secure }) {
  const redirectUri = `${publicUrl}/auth/callback`;
  const stateCookie = secure ? '__Host-c3d_oauth' : 'c3d_oauth';
  const { seal, open } = sessions.sealer;

  async function tokenRequest(params) {
    const res = await fetch(`${GITHUB}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Company3D' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error || !json.access_token) {
      const err = new Error(json.error_description || json.error || 'GitHub sign-in failed');
      err.status = 401;
      throw err;
    }
    const now = Date.now();
    return {
      access: json.access_token,
      refresh: json.refresh_token || null,
      // GitHub App tokens expire (8h) and come with a refresh token; OAuth App tokens don't expire.
      expiresAt: json.expires_in ? now + Number(json.expires_in) * 1000 : null,
      refreshExpiresAt: json.refresh_token_expires_in ? now + Number(json.refresh_token_expires_in) * 1000 : null,
    };
  }

  function redirect(res, location, cookies = []) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': cookies });
    res.end();
  }

  return {
    /** GET /auth/login?next=/o/org */
    login(req, res, url) {
      const state = randomId(24);
      const verifier = randomId(48);
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const authorize = new URL(`${GITHUB}/login/oauth/authorize`);
      authorize.searchParams.set('client_id', clientId);
      authorize.searchParams.set('redirect_uri', redirectUri);
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', challenge);
      authorize.searchParams.set('code_challenge_method', 'S256');
      authorize.searchParams.set('allow_signup', 'false');
      if (scopes) authorize.searchParams.set('scope', scopes); // ignored by GitHub Apps
      // state + PKCE verifier travel sealed in a cookie pinned to this browser, so a login link can't be
      // replayed in someone else's browser and no server memory is needed.
      const pending = seal({ state, verifier, next: safeNext(url.searchParams.get('next')), at: Date.now() });
      redirect(res, authorize.toString(), [cookie(stateCookie, pending, { maxAgeSec: PENDING_TTL / 1000, secure })]);
    },

    /** GET /auth/callback?code&state */
    async callback(req, res, url) {
      const clear = cookie(stateCookie, '', { maxAgeSec: 0, secure });
      const fail = (reason) => redirect(res, `/?login_error=${reason}`, [clear]);
      if (url.searchParams.get('error')) return fail('denied');
      const state = url.searchParams.get('state') || '';
      const code = url.searchParams.get('code') || '';
      const p = open(parseCookies(req.headers.cookie)[stateCookie] || '');
      if (!state || !code || !p || typeof p.state !== 'string' || !safeEqual(state, p.state) || Date.now() - p.at > PENDING_TTL) return fail('expired');

      let token;
      let user;
      try {
        token = await tokenRequest({ code, redirect_uri: redirectUri, code_verifier: p.verifier });
        const res2 = await fetch(`${API}/user`, {
          headers: { Authorization: `Bearer ${token.access}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Company3D' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res2.ok) throw new Error(`GitHub /user returned ${res2.status}`);
        const u = await res2.json();
        user = { id: u.id, login: u.login, name: u.name || null, avatarUrl: u.avatar_url };
      } catch (e) {
        console.warn('[auth] sign-in failed:', e.message);
        return fail('github');
      }

      // A brand-new session replaces whatever this browser had (no session fixation).
      const s = sessions.create({ kind: 'user', user, token, org: null });
      console.log(`[auth] @${user.login} signed in`);
      redirect(res, safeNext(p.next), [sessions.setCookie(s), clear]);
    },

    /** POST /auth/logout: also revokes the GitHub token so the sealed cookie is worthless even if copied. */
    async logout(req, res) {
      const s = sessions.get(req);
      if (s && s.token) {
        await fetch(`${API}/applications/${encodeURIComponent(clientId)}/token`, {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Company3D',
          },
          body: JSON.stringify({ access_token: s.token.access }),
          signal: AbortSignal.timeout(8_000),
        }).catch(() => {});
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': sessions.clearCookie() });
      res.end('{"ok":true}');
    },

    /** A usable access token, refreshing GitHub App tokens shortly before they expire (marks the session dirty). */
    async validToken(s) {
      const t = s.token;
      if (!t.expiresAt || t.expiresAt - Date.now() > 5 * 60_000) return t.access;
      if (!t.refresh || (t.refreshExpiresAt && t.refreshExpiresAt < Date.now())) {
        const err = new Error('Your GitHub sign-in expired. Please sign in again.');
        err.status = 401;
        throw err;
      }
      let job = refreshing.get(t.refresh);
      if (!job) {
        job = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
        refreshing.set(t.refresh, job);
        // keep the result briefly so requests that still carry the old cookie reuse it
        job.finally(() => setTimeout(() => refreshing.delete(t.refresh), 60_000).unref()).catch(() => {});
      }
      s.token = await job;
      s.dirty = true;
      return s.token.access;
    },
  };
}
