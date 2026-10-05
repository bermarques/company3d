// Small JSON settings file: which owner (org) is connected, which repos get floors, and repo-to-repo links.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data');
const FILE = path.join(DATA_DIR, 'config.json');

const DEFAULTS = { owner: null, demo: false, owners: {} };

let config = load();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2));
}

export function getConfig() {
  return config;
}

export function setConnection({ owner, demo }) {
  config.owner = owner || null;
  config.demo = !!demo;
  save();
}

/** Per-owner settings: { floors: string[] | null, links: [{from,to,kind}] } */
export function ownerSettings(owner) {
  const s = config.owners[owner] || {};
  return { floors: Array.isArray(s.floors) ? s.floors : null, links: Array.isArray(s.links) ? s.links : [] };
}

export function updateOwnerSettings(owner, patch) {
  const current = ownerSettings(owner);
  config.owners[owner] = { ...current, ...patch };
  save();
  return ownerSettings(owner);
}
