// Hosted-mode sessions, sealed into an encrypted cookie (AES-256-GCM) instead of server memory.
// Any copy of the server can read them, so they work on serverless hosts (Vercel) and survive restarts and deploys.
// The browser stores only ciphertext in an HttpOnly cookie: it can't read or change the GitHub token inside.
import crypto from 'node:crypto';

const IDLE_MS = 7 * 24 * 3600_000;
const ABSOLUTE_MS = 30 * 24 * 3600_000;
const DEMO_IDLE_MS = 2 * 3600_000;
const TOUCH_EVERY_MS = 6 * 3600_000; // refresh the "last seen" stamp at most this often
const MAX_COOKIE = 3800;

export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

export function cookie(name, value, { maxAgeSec, secure }) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const randomId = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Authenticated encryption for small JSON payloads stored in cookies. */
export function createSealer(secret) {
  const key = crypto.createHash('sha256').update(`company3d-cookie-v1:${secret}`).digest();
  return {
    seal(obj) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
    },
    open(str) {
      try {
        const raw = Buffer.from(String(str), 'base64url');
        if (raw.length < 29) return null;
        const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        d.setAuthTag(raw.subarray(12, 28));
        return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
      } catch {
        return null; // tampered, wrong key, or garbage
      }
    },
  };
}

// fields that are written into the cookie (everything else on a session object is per-request scratch space)
const PERSISTED = ['id', 'kind', 'user', 'token', 'org', 'createdAt', 'lastSeen'];

export function createSessionStore({ secure, secret }) {
  // __Host- prefix: the browser refuses to set it without Secure, Path=/ and no Domain.
  const name = secure ? '__Host-c3d_session' : 'c3d_session';
  const sealer = createSealer(secret);

  function expired(s, now = Date.now()) {
    const idle = s.kind === 'demo' ? DEMO_IDLE_MS : IDLE_MS;
    return !s.lastSeen || !s.createdAt || now - s.lastSeen > idle || now - s.createdAt > ABSOLUTE_MS;
  }

  return {
    cookieName: name,
    sealer,

    /** New session; remember to send setCookie(s). */
    create(data) {
      const now = Date.now();
      return { ...data, id: randomId(16), createdAt: now, lastSeen: now, dirty: true };
    },

    /** The session carried by this request, or null. Marks it dirty when its "last seen" stamp needs refreshing. */
    get(req) {
      const value = parseCookies(req.headers.cookie)[name];
      if (!value || value.length > 6000) return null;
      const s = sealer.open(value);
      if (!s || typeof s !== 'object' || !['user', 'demo'].includes(s.kind) || expired(s)) return null;
      if (Date.now() - s.lastSeen > TOUCH_EVERY_MS) {
        s.lastSeen = Date.now();
        s.dirty = true;
      }
      return s;
    },

    setCookie(s) {
      const payload = {};
      for (const k of PERSISTED) if (s[k] !== undefined) payload[k] = s[k];
      let value = sealer.seal(payload);
      if (value.length > MAX_COOKIE && payload.user) {
        // keep under browser cookie limits: the avatar URL and display name are nice-to-have
        payload.user = { id: payload.user.id, login: payload.user.login };
        value = sealer.seal(payload);
      }
      return cookie(name, value, { maxAgeSec: Math.floor(ABSOLUTE_MS / 1000), secure });
    },

    clearCookie: () => cookie(name, '', { maxAgeSec: 0, secure }),
  };
}
