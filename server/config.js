// Settings storage.
//  - Local mode: which owner (org) is connected, in data/config.json.
//  - Per-org building settings (which repos get floors, their order, and repo-to-repo links), in either:
//      * Upstash Redis (KV_REST_API_URL + KV_REST_API_TOKEN, as set by Vercel's Upstash integration), or
//      * a JSON file in DATA_DIR (default ./data; /tmp/company3d on Vercel, whose disk is otherwise read-only).
import fs from 'node:fs';
import path from 'node:path';

const ON_VERCEL = !!process.env.VERCEL;
const DATA_DIR = path.resolve(process.env.DATA_DIR || (ON_VERCEL ? '/tmp/company3d' : 'data'));
const FILE = path.join(DATA_DIR, 'config.json');

const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const SETTINGS_BACKEND = KV_URL && KV_TOKEN ? 'redis' : ON_VERCEL && !process.env.DATA_DIR ? 'temporary file' : 'file';

let config = load();

function load() {
  const empty = { owner: null, demo: false, owners: Object.create(null) };
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const owners = Object.create(null);
    if (raw.owners && typeof raw.owners === 'object') {
      for (const [k, v] of Object.entries(raw.owners)) if (v && typeof v === 'object') owners[k] = v;
    }
    return { owner: typeof raw.owner === 'string' ? raw.owner : null, demo: !!raw.demo, owners };
  } catch {
    return empty;
  }
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // write-then-rename so a crash mid-write can't leave a corrupt file
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, FILE);
}

export function getConfig() {
  return config;
}

/** Local mode only: the org shown when the app opens. */
export function setConnection({ owner, demo }) {
  config.owner = owner || null;
  config.demo = !!demo;
  save();
}

const key = (owner) => owner.toLowerCase();
const normalize = (s) => ({ floors: s && Array.isArray(s.floors) ? s.floors : null, links: s && Array.isArray(s.links) ? s.links : [] });

// ---------------------------------------------------------------- Upstash Redis (REST, no SDK needed)
async function redis(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`Settings storage error: ${json.error || res.status}`);
  return json.result;
}

const redisKey = (owner) => `company3d:settings:${key(owner)}`;

/** Per-org building settings, shared by everyone in that org. Async so it can live in Redis. */
export function settingsStore(owner) {
  if (SETTINGS_BACKEND === 'redis') {
    return {
      async get() {
        const raw = await redis(['GET', redisKey(owner)]);
        try {
          return normalize(raw ? JSON.parse(raw) : null);
        } catch {
          return normalize(null);
        }
      },
      async update(patch) {
        const next = { ...(await this.get()), ...patch };
        await redis(['SET', redisKey(owner), JSON.stringify(next)]);
        return normalize(next);
      },
    };
  }
  return {
    async get() {
      return normalize(Object.hasOwn(config.owners, key(owner)) ? config.owners[key(owner)] : null);
    },
    async update(patch) {
      config.owners[key(owner)] = { ...(await this.get()), ...patch };
      save();
      return normalize(config.owners[key(owner)]);
    },
  };
}

/** Settings kept in memory only, for each hosted visitor's private demo sandbox. */
export function memorySettingsStore() {
  let s = normalize(null);
  return {
    get: async () => ({ ...s }),
    async update(patch) {
      s = { ...s, ...patch };
      return { ...s };
    },
  };
}
