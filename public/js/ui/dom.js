// Tiny DOM builder. Strings always become text nodes, so GitHub content can never inject HTML.
import { api } from '../api.js';
import { personColor, initials } from '../engine/canvas.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // custom properties (--x) only work through setProperty
      for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function safeUrl(url) {
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
}

/** External link that only renders when the URL is a real https URL (demo data has none). */
export function ghLink(url, label = 'Open on GitHub ↗', cls = 'link') {
  const safe = safeUrl(url);
  if (!safe) return null;
  return h('a', { href: safe, target: '_blank', rel: 'noopener noreferrer', class: cls }, label);
}

let realAvatars = false;
export function setRealAvatars(on) {
  realAvatars = on;
}

export function avatarEl(login, size = 32) {
  const fallback = () =>
    h('span', { class: 'avatar avatar-initials', style: { width: `${size}px`, height: `${size}px`, background: personColor(login), fontSize: `${Math.round(size * 0.42)}px` }, title: login }, initials(login));
  if (!realAvatars) return fallback();
  const img = h('img', { class: 'avatar', src: api.avatarUrl(login), width: size, height: size, alt: '', title: login, loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

export function labelPill(label) {
  const hex = (label.color || 'cccccc').replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const light = r * 0.299 + g * 0.587 + b * 0.114 > 150;
  return h('span', { class: 'pill', style: { background: `#${hex}`, color: light ? '#1b1b24' : '#fff' } }, label.name);
}
