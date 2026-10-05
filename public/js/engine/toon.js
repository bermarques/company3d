// Cartoon look: toon materials with a 4-step light ramp, rounded boxes and shared geometry/material caches.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 165, 225, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const matCache = new Map();
const sharedMats = new WeakSet();

/** Shared toon material for a flat color. Do not mutate the result; use toonUnique() for that. */
export function toon(color, opts = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive || ''}|${opts.opacity ?? 1}|${opts.side || 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = toonUnique(color, opts);
    matCache.set(key, m);
    sharedMats.add(m);
  }
  return m;
}

export function toonUnique(color, { emissive, emissiveIntensity = 1, opacity, side, map } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap, map: map || null });
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = emissiveIntensity;
  }
  if (opacity !== undefined && opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
  if (side) m.side = side;
  return m;
}

/** Unlit material for screens, signs and windows — no outline, always readable. */
export function screenMaterial(map, { transparent = false } = {}) {
  const m = new THREE.MeshBasicMaterial({ map, transparent, toneMapped: false });
  return noOutline(m);
}

export function noOutline(material) {
  material.userData.outlineParameters = { visible: false };
  return material;
}

/** Thicker or thinner outline for a specific material. */
export function outline(material, thickness) {
  material.userData.outlineParameters = { thickness };
  return material;
}

/** Material that is invisible but still hit by raycasts (interaction hit boxes). */
export const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });

const geoCache = new Map();
function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

const r3 = (n) => Math.round(n * 1000) / 1000;

export function roundedBox(w, h, d, radius = 0.04, segments = 2) {
  const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return cachedGeo(`rb${r3(w)}|${r3(h)}|${r3(d)}|${r3(r)}|${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, Math.max(r, 0.001)));
}
export function box(w, h, d) {
  return cachedGeo(`b${r3(w)}|${r3(h)}|${r3(d)}`, () => new THREE.BoxGeometry(w, h, d));
}
export function sphere(r, ws = 20, hs = 14) {
  return cachedGeo(`s${r3(r)}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}
export function capsule(r, len, cs = 6, rs = 14) {
  return cachedGeo(`c${r3(r)}|${r3(len)}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs));
}
export function cylinder(rt, rb, h, seg = 20) {
  return cachedGeo(`cy${r3(rt)}|${r3(rb)}|${r3(h)}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}
export function cone(r, h, seg = 12) {
  return cachedGeo(`co${r3(r)}|${r3(h)}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
}
export function torus(r, tube, rs = 8, ts = 24, arc = Math.PI * 2) {
  return cachedGeo(`t${r3(r)}|${r3(tube)}|${rs}|${ts}|${r3(arc)}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
}
export function plane(w, h) {
  return cachedGeo(`p${r3(w)}|${r3(h)}`, () => new THREE.PlaneGeometry(w, h));
}

/** Create a mesh, place it, and turn on shadows. */
export function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true, receive = true, parent } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (parent) parent.add(m);
  return m;
}

/** Dispose everything under `root` that isn't a shared cached resource. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (sharedMats.has(m) || m === hitMaterial) continue;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    }
  });
}
