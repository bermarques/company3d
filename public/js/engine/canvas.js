// Canvas drawing helpers shared by every in-world screen, sign and board, plus the avatar cache.
import * as THREE from 'three';
import { api } from '../api.js';

export const FONT = "'Nunito', 'Segoe UI', system-ui, sans-serif";
export const DISPLAY_FONT = "'Fredoka', 'Nunito', 'Segoe UI', system-ui, sans-serif";

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas, { anisotropy = 8, repeat } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRound(ctx, x, y, w, h, r, fill, stroke, lineWidth = 2) {
  roundRect(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Word-wrap `text` into at most `maxLines` lines, adding an ellipsis when it doesn't fit. */
export function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines);
    let last = lines[lines.length - 1] || '';
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last.trimEnd() + '…';
  }
  // A single very long word can still overflow — hard-cut it.
  return lines.map((l) => {
    if (ctx.measureText(l).width <= maxWidth) return l;
    let s = l;
    while (s && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
  });
}

export function fitText(ctx, text, maxWidth) {
  let s = String(text || '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERSON_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#20c997'];
export function personColor(login) {
  return PERSON_COLORS[hash(login || '') % PERSON_COLORS.length];
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (86400 * 30))}mo ago`;
}

/** Pick black or white text for a hex background (GitHub label colors). */
export function contrastText(hex) {
  const h = (hex || 'cccccc').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#1b1b24' : '#ffffff';
}

// ---------------------------------------------------------------- avatars
const avatars = new Map(); // login -> { img, ok }
const listeners = new Set();
let avatarsEnabled = false;
let notifyTimer = null;

export function setAvatarsEnabled(on) {
  avatarsEnabled = on;
}

export function onAvatarsLoaded(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function scheduleNotify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    for (const fn of listeners) fn();
  }, 250);
}

export function getAvatar(login) {
  if (!login || !avatarsEnabled) return null;
  let entry = avatars.get(login);
  if (!entry) {
    const img = new Image();
    entry = { img, ok: false };
    avatars.set(login, entry);
    img.onload = () => {
      entry.ok = true;
      scheduleNotify();
    };
    img.onerror = () => {
      entry.ok = false;
    };
    img.src = api.avatarUrl(login);
  }
  return entry.ok ? entry.img : null;
}

/** Circle avatar: real GitHub picture when available, otherwise colored initials. */
export function drawAvatar(ctx, login, cx, cy, radius, { ring = '#ffffff', ringWidth } = {}) {
  const img = getAvatar(login);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  if (img) {
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = personColor(login);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(radius * 0.95)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(login), cx, cy + radius * 0.05);
  }
  ctx.restore();
  if (ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = ringWidth || Math.max(2, radius * 0.12);
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
}

export function initials(login) {
  const parts = String(login || '?').split(/[-_.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(login || '?').slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------- shared decorative textures
let skyTex = null;
export function skyTexture() {
  if (skyTex) return skyTex;
  const { canvas, ctx } = makeCanvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#6ec6ff');
  g.addColorStop(0.7, '#c9ecff');
  g.addColorStop(1, '#fff4d6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  const rand = seeded(42);
  // fluffy clouds
  for (let i = 0; i < 7; i++) {
    const x = rand() * 1024;
    const y = 50 + rand() * 170;
    const s = 30 + rand() * 30;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(x + (k - 2) * s * 0.8, y + Math.sin(k * 1.7) * s * 0.25, s * (k === 2 ? 1.1 : 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // distant skyline
  const colors = ['#8fb3d9', '#7aa0c9', '#93b9dd'];
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < 1024) {
      const w = 40 + rand() * 70;
      const h = 80 + rand() * (layer ? 150 : 210);
      ctx.fillStyle = colors[(layer + Math.floor(rand() * 3)) % 3];
      ctx.fillRect(x, 512 - h, w - 6, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let wy = 512 - h + 12; wy < 500; wy += 22) for (let wx = x + 8; wx < x + w - 16; wx += 16) if (rand() > 0.4) ctx.fillRect(wx, wy, 7, 10);
      x += w;
    }
  }
  skyTex = canvasTexture(canvas, { repeat: [1, 1] });
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.userData.shared = true;
  return skyTex;
}

const patternCache = new Map();
/** Soft two-tone tile pattern used for carpets and floors. */
export function tileTexture(base, alt, size = 256, kind = 'check') {
  const key = `${base}|${alt}|${kind}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = alt;
  if (kind === 'check') {
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  } else if (kind === 'planks') {
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(0, (i * size) / 4, size, 3);
      ctx.fillRect(((i % 2) * size) / 2 + size / 4, (i * size) / 4, 3, size / 4);
    }
  } else if (kind === 'dots') {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.beginPath();
      ctx.arc((x + 0.5) * (size / 4), (y + 0.5) * (size / 4), size / 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = canvasTexture(canvas, { repeat: [1, 1] });
  t.userData.shared = true;
  patternCache.set(key, t);
  return t;
}
