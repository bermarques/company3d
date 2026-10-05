// Company3D local server: serves the 3D client and exposes a small JSON API backed by the GitHub CLI.
// It only listens on localhost because it acts with your `gh` credentials.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectGh } from './server/gh.js';
import { createGithubProvider } from './server/github-provider.js';
import { createDemoProvider } from './server/demo-provider.js';
import { getConfig, setConnection, ownerSettings, updateOwnerSettings } from './server/config.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1';
const FORCE_DEMO = process.argv.includes('--demo');
const DEFAULT_FLOOR_COUNT = 15;

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const demoProvider = createDemoProvider();
let gh = { installed: false, authed: false };
let provider = demoProvider;

function selectProvider() {
  const cfg = getConfig();
  provider = !FORCE_DEMO && !cfg.demo && gh.authed ? createGithubProvider(gh) : demoProvider;
  cache.clear();
}

function currentOwner() {
  if (provider.mode === 'demo') return 'demo-co';
  return getConfig().owner;
}

// ---------------------------------------------------------------- cache
const cache = new Map();
function cached(key, ttlMs, fn, fresh = false) {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.promise;
  const promise = fn();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}
function invalidate(prefix) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

// ---------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function need(value, re, what) {
  if (typeof value !== 'string' || !re.test(value)) throw new HttpError(400, `Invalid ${what}`);
  return value;
}

function requireOwner() {
  const owner = currentOwner();
  if (!owner) throw new HttpError(409, 'No GitHub organization connected yet');
  return owner;
}

async function getWorld(fresh = false) {
  const owner = requireOwner();
  return cached(`${provider.mode}:${owner}:world`, 120_000, () => provider.getWorld(owner), fresh);
}

function floorsFor(world) {
  const settings = ownerSettings(world.owner.login);
  const names = new Set(world.repos.map((r) => r.name));
  if (settings.floors) return settings.floors.filter((n) => names.has(n));
  return world.repos.filter((r) => !r.isArchived).slice(0, DEFAULT_FLOOR_COUNT).map((r) => r.name);
}

function statusPayload() {
  const cfg = getConfig();
  return {
    mode: provider.mode,
    forcedDemo: FORCE_DEMO,
    chosenDemo: !!cfg.demo,
    gh: { installed: gh.installed, authed: gh.authed, version: gh.version || null, user: gh.user || null, error: gh.error || null },
    viewer: provider.viewer,
    owner: currentOwner(),
  };
}

// ---------------------------------------------------------------- API routes
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/status', async () => statusPayload());

route('POST', '/api/recheck', async () => {
  gh = await detectGh();
  selectProvider();
  return statusPayload();
});

// Owners always come from GitHub when gh is signed in, so you can leave demo mode from the browser.
route('GET', '/api/owners', async () => (gh.authed && !FORCE_DEMO ? createGithubProvider(gh).listOwners() : provider.listOwners()));

route('POST', '/api/connect', async ({ body }) => {
  if (body.demo) {
    setConnection({ owner: getConfig().owner, demo: true });
  } else {
    if (!gh.authed) throw new HttpError(409, 'GitHub CLI is not logged in. Run `gh auth login` first.');
    setConnection({ owner: need(body.owner, OWNER_RE, 'organization'), demo: false });
  }
  selectProvider();
  return statusPayload();
});

route('GET', '/api/world', async ({ query }) => {
  const world = await getWorld(query.get('fresh') === '1');
  const settings = ownerSettings(world.owner.login);
  return {
    mode: provider.mode,
    viewer: provider.viewer,
    owner: world.owner,
    repos: world.repos,
    memberCount: world.members ? world.members.length : null,
    members: world.members ? world.members.map((m) => ({ login: m.login, name: m.name })) : null,
    floors: floorsFor(world),
    links: settings.links,
  };
});

route('GET', '/api/floor/:repo', async ({ params, query }) => {
  const repo = need(params.repo, REPO_RE, 'repository name');
  const world = await getWorld();
  const fresh = query.get('fresh') === '1';
  return cached(`${provider.mode}:${world.owner.login}:floor:${repo}`, 30_000, () => provider.getFloor(world, repo), fresh);
});

route('GET', '/api/labels/:repo', async ({ params }) => {
  const repo = need(params.repo, REPO_RE, 'repository name');
  const owner = requireOwner();
  return cached(`${provider.mode}:${owner}:labels:${repo}`, 300_000, () => provider.listLabels(owner, repo));
});

route('PUT', '/api/settings', async ({ body }) => {
  const world = await getWorld();
  const patch = {};
  if (body.floors !== undefined) {
    if (!Array.isArray(body.floors)) throw new HttpError(400, 'floors must be an array');
    patch.floors = [...new Set(body.floors.map((f) => need(f, REPO_RE, 'repository name')))];
  }
  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) throw new HttpError(400, 'links must be an array');
    patch.links = body.links.map((l) => ({
      from: need(l.from, REPO_RE, 'repository name'),
      to: need(l.to, REPO_RE, 'repository name'),
      kind: String(l.kind || 'depends on').slice(0, 40),
    }));
  }
  const settings = updateOwnerSettings(world.owner.login, patch);
  return { floors: floorsFor(world), links: settings.links };
});

route('POST', '/api/repos', async ({ body }) => {
  const world = await getWorld();
  const name = need(body.name, REPO_RE, 'repository name');
  const created = await provider.createRepo(world, {
    name,
    description: String(body.description || '').slice(0, 350),
    isPrivate: body.isPrivate !== false,
    autoInit: body.autoInit !== false,
  });
  // Give the new project a floor right away.
  const floors = floorsFor(world);
  updateOwnerSettings(world.owner.login, { floors: [...floors.filter((f) => f !== created.name), created.name] });
  invalidate(`${provider.mode}:${world.owner.login}:world`);
  return created;
});

route('POST', '/api/issues/:repo', async ({ params, body }) => {
  const owner = requireOwner();
  const repo = need(params.repo, REPO_RE, 'repository name');
  const title = String(body.title || '').trim();
  if (!title) throw new HttpError(400, 'An issue needs a title');
  const assignees = (body.assignees || []).map((a) => need(a, LOGIN_RE, 'assignee'));
  const labels = (body.labels || []).map((l) => String(l).slice(0, 50));
  const created = await provider.createIssue(owner, repo, { title: title.slice(0, 256), body: String(body.body || ''), assignees, labels });
  invalidate(`${provider.mode}:${owner}:floor:${repo}`);
  invalidate(`${provider.mode}:${owner}:world`);
  return created;
});

route('PATCH', '/api/issues/:repo/:number', async ({ params, body }) => {
  const owner = requireOwner();
  const repo = need(params.repo, REPO_RE, 'repository name');
  const number = Number(params.number);
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, 'Invalid issue number');
  const patch = {};
  if (body.assignees) patch.assignees = body.assignees.map((a) => need(a, LOGIN_RE, 'assignee'));
  if (body.state) {
    if (!['open', 'closed'].includes(body.state)) throw new HttpError(400, 'Invalid state');
    patch.state = body.state;
  }
  const result = await provider.updateIssue(owner, repo, number, patch);
  invalidate(`${provider.mode}:${owner}:floor:${repo}`);
  invalidate(`${provider.mode}:${owner}:world`);
  return result;
});

route('POST', '/api/prs/:repo/:number/merge', async ({ params, body }) => {
  const owner = requireOwner();
  const repo = need(params.repo, REPO_RE, 'repository name');
  const number = Number(params.number);
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, 'Invalid pull request number');
  const method = ['merge', 'squash', 'rebase'].includes(body.method) ? body.method : 'squash';
  const result = await provider.mergePR(owner, repo, number, method);
  invalidate(`${provider.mode}:${owner}:floor:${repo}`);
  invalidate(`${provider.mode}:${owner}:world`);
  return result;
});

const avatarCache = new Map();
async function avatarRoute(res, login) {
  need(login, LOGIN_RE, 'login');
  let entry = avatarCache.get(login);
  if (!entry || Date.now() - entry.at > 6 * 3600_000) {
    let img = null;
    try {
      img = await provider.avatar(login);
    } catch {
      img = null;
    }
    entry = { at: Date.now(), img };
    if (avatarCache.size > 1000) avatarCache.clear();
    avatarCache.set(login, entry);
  }
  if (!entry.img) return send(res, 404, 'no avatar');
  res.writeHead(200, { 'Content-Type': entry.img.type, 'Cache-Control': 'max-age=3600' });
  res.end(entry.img.buffer);
}

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(res, baseDir, relPath) {
  const file = path.normalize(path.join(baseDir, relPath));
  if (!file.startsWith(baseDir + path.sep) && file !== baseDir) return send(res, 403, 'forbidden');
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- server
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);

const server = http.createServer(async (req, res) => {
  // Block DNS-rebinding and cross-site requests: this server holds the keys to your GitHub org.
  if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, 'forbidden host');
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'bad url');
  }

  if (pathname.startsWith('/api/')) {
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (req.headers['x-company3d'] !== '1' || (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, '')))) {
        return send(res, 403, { error: 'Cross-site request blocked' });
      }
    }
    if (req.method === 'GET' && pathname.startsWith('/api/avatar/')) {
      try {
        return await avatarRoute(res, pathname.slice('/api/avatar/'.length));
      } catch {
        return send(res, 400, 'bad login');
      }
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      try {
        const body = req.method === 'GET' ? {} : await readBody(req);
        const result = await r.handler({ params, query: url.searchParams, body });
        return send(res, 200, result ?? { ok: true });
      } catch (e) {
        const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
        if (status >= 500) console.error(`[api] ${req.method} ${pathname}:`, e.message);
        return send(res, status, { error: e.message || 'Something went wrong' });
      }
    }
    return send(res, 404, { error: 'Unknown API route' });
  }

  if (pathname.startsWith('/vendor/three/')) {
    const rel = pathname.slice('/vendor/three/'.length);
    if (!rel.startsWith('build/') && !rel.startsWith('examples/jsm/')) return send(res, 404, 'not found');
    return serveStatic(res, THREE_DIR, rel);
  }
  return serveStatic(res, PUBLIC, pathname === '/' ? 'index.html' : pathname);
});

gh = FORCE_DEMO ? gh : await detectGh();
selectProvider();

server.listen(PORT, HOST, () => {
  const s = statusPayload();
  console.log(`\n  🏢  Company3D is open at  http://localhost:${PORT}\n`);
  if (s.mode === 'github') {
    console.log(`  GitHub CLI ${s.gh.version} — signed in as @${s.gh.user.login}`);
    console.log(s.owner ? `  Connected organization: ${s.owner}` : '  Pick an organization in the browser to get started.');
  } else if (FORCE_DEMO) {
    console.log('  Running in demo mode (--demo) with a fictional company.');
  } else {
    console.log(`  Demo mode: ${gh.error || 'demo selected in the manager office'}`);
    if (!gh.installed) console.log('  Install the GitHub CLI (https://cli.github.com) and run `gh auth login` to use your real org.');
  }
  console.log('');
});
