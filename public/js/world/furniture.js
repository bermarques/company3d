// Low-poly cartoon props. Each builder returns a THREE.Group whose origin sits on the floor.
import * as THREE from 'three';
import { toon, roundedBox, box, sphere, cylinder, cone, torus, plane, mesh, screenMaterial, noOutline, toonUnique } from '../engine/toon.js';

export const PALETTE = {
  wood: '#f2c98a',
  woodDark: '#c98f55',
  metal: '#7c8296',
  metalLight: '#c7cdd9',
  black: '#2b2d3a',
  white: '#fbfaf7',
  leaf: '#6cc070',
  leafDark: '#3f9a52',
  pot: '#e8835f',
  cream: '#fff3df',
};

/** Desk for one person. Local frame: the person sits at the origin facing +z; the desk is in front. */
export function workstation({ chairColor = '#4dabf7', dividerColor = '#ffd43b', divider = true, laptopScreen } = {}) {
  const g = new THREE.Group();
  const deskTop = mesh(roundedBox(1.4, 0.06, 0.75, 0.025), toon(PALETTE.wood), { y: 0.66, z: 0.6, parent: g });
  deskTop.name = 'deskTop';
  for (const sx of [-0.62, 0.62]) {
    mesh(roundedBox(0.06, 0.64, 0.66, 0.02), toon(PALETTE.metal), { x: sx, y: 0.32, z: 0.6, parent: g });
  }
  // low privacy divider at the far edge
  if (divider) mesh(roundedBox(1.4, 0.32, 0.05, 0.02), toon(dividerColor), { y: 0.85, z: 0.99, parent: g });

  const chair = officeChair(chairColor);
  g.add(chair);

  const laptop = laptopProp(laptopScreen);
  laptop.position.set(0, 0.69, 0.5);
  laptop.rotation.y = Math.PI; // screen faces the sitter
  g.add(laptop);

  // a few desk knick-knacks for life
  const mug = mesh(cylinder(0.045, 0.04, 0.1, 12), toon('#ffffff'), { x: 0.45, y: 0.74, z: 0.5, parent: g });
  mug.name = 'deskMug';
  if (Math.random() < 0.5) {
    mesh(sphere(0.06, 10, 8), toon(PALETTE.leaf), { x: -0.5, y: 0.8, z: 0.8, parent: g });
    mesh(cylinder(0.05, 0.04, 0.08, 10), toon(PALETTE.pot), { x: -0.5, y: 0.73, z: 0.8, parent: g });
  }
  g.userData.laptop = laptop;
  g.userData.chair = chair;
  return g;
}

export function officeChair(color = '#4dabf7') {
  const g = new THREE.Group();
  mesh(roundedBox(0.5, 0.09, 0.48, 0.04), toon(color), { y: 0.4, parent: g });
  mesh(roundedBox(0.5, 0.52, 0.08, 0.04), toon(color), { y: 0.72, z: -0.25, rx: -0.08, parent: g });
  mesh(cylinder(0.035, 0.035, 0.32, 10), toon(PALETTE.metal), { y: 0.2, parent: g });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    mesh(roundedBox(0.05, 0.04, 0.3, 0.015), toon(PALETTE.black), { x: Math.sin(a) * 0.14, y: 0.04, z: Math.cos(a) * 0.14, ry: a, parent: g });
  }
  return g;
}

/** Laptop with an open lid. Origin at the bottom-center of the base; screen faces +z. */
export function laptopProp(screenTexture) {
  const g = new THREE.Group();
  mesh(roundedBox(0.66, 0.025, 0.44, 0.01), toon(PALETTE.metalLight), { y: 0.0125, parent: g });
  mesh(plane(0.56, 0.22), noOutline(new THREE.MeshBasicMaterial({ color: '#3a3d4d' })), { y: 0.026, z: 0.04, rx: -Math.PI / 2, cast: false, parent: g });
  const lid = new THREE.Group();
  lid.position.set(0, 0.025, -0.21);
  lid.rotation.x = -0.28;
  g.add(lid);
  mesh(roundedBox(0.66, 0.42, 0.02, 0.01), toon(PALETTE.metalLight), { y: 0.21, parent: lid });
  if (screenTexture) {
    const screen = mesh(plane(0.62, 0.3875), screenMaterial(screenTexture), { y: 0.21, z: 0.0115, cast: false, receive: false, parent: lid });
    screen.name = 'screen';
    g.userData.screen = screen;
  }
  return g;
}

export function plant(scale = 1, { tall = false } = {}) {
  const g = new THREE.Group();
  mesh(cylinder(0.22 * scale, 0.17 * scale, 0.36 * scale, 16), toon(PALETTE.pot), { y: 0.18 * scale, parent: g });
  mesh(cylinder(0.2 * scale, 0.2 * scale, 0.03 * scale, 16), toon('#6b4a2f'), { y: 0.35 * scale, parent: g });
  if (tall) {
    mesh(cylinder(0.025 * scale, 0.035 * scale, 0.9 * scale, 8), toon(PALETTE.woodDark), { y: 0.8 * scale, parent: g });
    const leaves = [
      [0, 1.35, 0, 0.32],
      [0.18, 1.15, 0.05, 0.24],
      [-0.16, 1.1, -0.06, 0.22],
      [0.05, 1.55, -0.08, 0.2],
    ];
    for (const [x, y, z, r] of leaves) mesh(sphere(r * scale, 14, 10), toon(PALETTE.leaf), { x: x * scale, y: y * scale, z: z * scale, parent: g });
  } else {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = mesh(sphere(0.13 * scale, 10, 8), toon(i % 2 ? PALETTE.leaf : PALETTE.leafDark), {
        x: Math.cos(a) * 0.12 * scale,
        y: (0.55 + (i % 3) * 0.08) * scale,
        z: Math.sin(a) * 0.12 * scale,
        sy: 1.6,
        rz: Math.cos(a) * 0.4,
        rx: Math.sin(a) * 0.4,
        parent: g,
      });
      leaf.castShadow = true;
    }
  }
  return g;
}

export function couch(color = '#748ffc', width = 2.2) {
  const g = new THREE.Group();
  mesh(roundedBox(width, 0.4, 0.9, 0.12), toon(color), { y: 0.25, parent: g });
  mesh(roundedBox(width, 0.55, 0.25, 0.1), toon(color), { y: 0.62, z: -0.34, parent: g });
  for (const s of [-1, 1]) mesh(roundedBox(0.24, 0.55, 0.9, 0.1), toon(color), { x: s * (width / 2 - 0.12), y: 0.37, parent: g });
  const cushion = new THREE.Color(color).offsetHSL(0, 0, 0.08);
  const n = Math.max(2, Math.round(width / 1.0));
  for (let i = 0; i < n; i++) {
    const w = (width - 0.5) / n;
    mesh(roundedBox(w - 0.04, 0.12, 0.62, 0.05), toon(cushion), { x: -width / 2 + 0.25 + w * (i + 0.5), y: 0.5, z: 0.06, parent: g });
  }
  return g;
}

export function coffeeTable(w = 1.2, d = 0.7) {
  const g = new THREE.Group();
  mesh(roundedBox(w, 0.06, d, 0.03), toon(PALETTE.woodDark), { y: 0.42, parent: g });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(cylinder(0.03, 0.03, 0.4, 8), toon(PALETTE.black), { x: sx * (w / 2 - 0.08), y: 0.2, z: sz * (d / 2 - 0.08), parent: g });
  return g;
}

export function standingTable() {
  const g = new THREE.Group();
  mesh(cylinder(0.45, 0.45, 0.05, 24), toon(PALETTE.white), { y: 1.05, parent: g });
  mesh(cylinder(0.04, 0.04, 1.0, 10), toon(PALETTE.metal), { y: 0.52, parent: g });
  mesh(cylinder(0.25, 0.28, 0.04, 20), toon(PALETTE.metal), { y: 0.02, parent: g });
  return g;
}

/** Kitchen counter running along +x with a coffee machine and cups. */
export function coffeeCounter(length = 4) {
  const g = new THREE.Group();
  mesh(roundedBox(length, 0.9, 0.7, 0.04), toon('#ffffff'), { y: 0.45, parent: g });
  mesh(roundedBox(length + 0.04, 0.05, 0.74, 0.02), toon(PALETTE.woodDark), { y: 0.92, parent: g });
  for (let i = 0; i < Math.floor(length / 0.6); i++) {
    mesh(box(0.02, 0.6, 0.01), toon('#d6d8e0'), { x: -length / 2 + 0.6 * (i + 1), y: 0.45, z: 0.351, parent: g });
  }
  // coffee machine
  const m = new THREE.Group();
  m.position.set(-length / 2 + 0.6, 0.945, 0);
  g.add(m);
  mesh(roundedBox(0.5, 0.6, 0.45, 0.06), toon('#e03131'), { y: 0.3, parent: m });
  mesh(roundedBox(0.36, 0.1, 0.25, 0.03), toon(PALETTE.black), { y: 0.5, z: 0.12, parent: m });
  mesh(cylinder(0.03, 0.03, 0.08, 8), toon(PALETTE.metal), { y: 0.38, z: 0.18, parent: m });
  mesh(cylinder(0.05, 0.045, 0.1, 12), toon('#ffffff'), { y: 0.05, z: 0.18, parent: m });
  mesh(sphere(0.035, 10, 8), noOutline(new THREE.MeshBasicMaterial({ color: '#69db7c' })), { x: 0.16, y: 0.48, z: 0.23, parent: m });
  // cups and a fruit bowl
  for (let i = 0; i < 4; i++) mesh(cylinder(0.045, 0.04, 0.1, 12), toon(['#ffd43b', '#4dabf7', '#ff8787', '#69db7c'][i]), { x: -length / 2 + 1.2 + i * 0.14, y: 1.0, z: 0.15, parent: g });
  mesh(sphere(0.18, 16, 8), toon('#ffffff'), { x: length / 2 - 0.5, y: 0.95, sy: 0.45, parent: g });
  for (let i = 0; i < 4; i++) mesh(sphere(0.07, 10, 8), toon(['#ff6b6b', '#ffd43b', '#ff922b', '#69db7c'][i]), { x: length / 2 - 0.5 + Math.cos(i * 1.6) * 0.08, y: 1.02, z: Math.sin(i * 1.6) * 0.08, parent: g });
  return g;
}

export function waterCooler() {
  const g = new THREE.Group();
  mesh(roundedBox(0.4, 0.95, 0.4, 0.05), toon('#e9ecef'), { y: 0.475, parent: g });
  mesh(cylinder(0.17, 0.17, 0.45, 18), toonUnique('#74c0fc', { opacity: 0.75 }), { y: 1.2, parent: g });
  mesh(sphere(0.17, 18, 8), toonUnique('#74c0fc', { opacity: 0.75 }), { y: 1.42, sy: 0.4, parent: g });
  mesh(box(0.06, 0.05, 0.05), toon('#4dabf7'), { x: -0.08, y: 0.75, z: 0.21, parent: g });
  mesh(box(0.06, 0.05, 0.05), toon('#ff6b6b'), { x: 0.08, y: 0.75, z: 0.21, parent: g });
  return g;
}

export function bookshelf(width = 1.8, height = 2.0) {
  const g = new THREE.Group();
  const shelves = 4;
  mesh(roundedBox(width, height, 0.4, 0.03), toon(PALETTE.woodDark), { y: height / 2, parent: g });
  const colors = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ffa94d', '#20c997', '#f783ac'];
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let s = 0; s < shelves; s++) {
    const y0 = 0.1 + (s * (height - 0.2)) / shelves;
    mesh(box(width - 0.1, 0.03, 0.36), toon(PALETTE.wood), { y: y0, z: 0.03, parent: g });
    let x = -width / 2 + 0.1;
    while (x < width / 2 - 0.2) {
      const bw = 0.05 + rand() * 0.06;
      const bh = 0.22 + rand() * 0.16;
      mesh(box(bw, bh, 0.26), toon(colors[Math.floor(rand() * colors.length)]), { x: x + bw / 2, y: y0 + 0.015 + bh / 2, z: 0.07, cast: false, parent: g });
      x += bw + 0.01;
    }
  }
  return g;
}

export function rug(w, d, color) {
  const g = new THREE.Group();
  mesh(roundedBox(w, 0.02, d, 0.01), toon(color), { y: 0.011, cast: false, parent: g });
  mesh(roundedBox(w - 0.3, 0.021, d - 0.3, 0.01), toon(new THREE.Color(color).offsetHSL(0, 0, 0.08)), { y: 0.0115, cast: false, parent: g });
  return g;
}

/** Wall board (whiteboard/kanban/sign). Faces +z, origin at the bottom-center of the frame. */
export function wallBoard(width, height, texture, { frame = '#5c5f73', tray = true, depth = 0.08 } = {}) {
  const g = new THREE.Group();
  mesh(roundedBox(width + 0.16, height + 0.16, depth, 0.04), toon(frame), { y: height / 2, parent: g });
  const face = mesh(plane(width, height), screenMaterial(texture), { y: height / 2, z: depth / 2 + 0.003, cast: false, receive: false, parent: g });
  face.name = 'face';
  if (tray) {
    mesh(roundedBox(width * 0.6, 0.05, 0.12, 0.02), toon(frame), { y: -0.04, z: 0.07, parent: g });
    const markerColors = ['#e03131', '#1971c2', '#2f9e44', '#212529'];
    markerColors.forEach((c, i) => mesh(capsule2(0.018, 0.12), toon(c), { x: -0.3 + i * 0.12, y: 0.005, z: 0.08, rz: Math.PI / 2, parent: g }));
  }
  g.userData.face = face;
  return g;
}

function capsule2(r, l) {
  return cylinder(r, r, l, 8);
}

export function ceilingLamp(width = 1.2, depth = 0.5) {
  const g = new THREE.Group();
  mesh(roundedBox(width, 0.06, depth, 0.02), noOutline(new THREE.MeshBasicMaterial({ color: '#fffbe6' })), { cast: false, receive: false, parent: g });
  return g;
}

export function trashBin() {
  const g = new THREE.Group();
  mesh(cylinder(0.16, 0.13, 0.38, 14), toon('#868e96'), { y: 0.19, parent: g });
  return g;
}

export function arrowDecal(color = '#ffd43b') {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.5);
  shape.lineTo(0.4, 0);
  shape.lineTo(0.15, 0);
  shape.lineTo(0.15, -0.5);
  shape.lineTo(-0.15, -0.5);
  shape.lineTo(-0.15, 0);
  shape.lineTo(-0.4, 0);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const m = new THREE.Mesh(geo, noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  return m;
}

export { torus, cone };
