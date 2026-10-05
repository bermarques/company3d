// Room shell (floor, walls, windows, ceiling) and the elevator that connects every floor.
import * as THREE from 'three';
import { gradientMap, toon, roundedBox, box, plane, mesh, screenMaterial, noOutline, hitMaterial, cylinder, sphere } from '../engine/toon.js';
import { makeCanvas, canvasTexture, skyTexture, tileTexture } from '../engine/canvas.js';
import { drawElevatorIndicator, drawElevatorButtons } from './screens.js';
import { ceilingLamp } from './furniture.js';

export const WALL_T = 0.3;
export const DOOR_HALF = 0.8; // elevator opening half-width (z)
export const CEILING = 4.0;

/** Axis-aligned collider in the XZ plane. */
export function collider(minX, maxX, minZ, maxZ, extra = {}) {
  return { minX, maxX, minZ, maxZ, ...extra };
}

export function colliderFromObject(obj, pad = 0) {
  obj.updateWorldMatrix(true, true);
  const b = new THREE.Box3().setFromObject(obj);
  return collider(b.min.x - pad, b.max.x + pad, b.min.z - pad, b.max.z + pad);
}

/**
 * Build an empty room centered on the origin. The west wall (x = -W/2) has the elevator opening at z = 0.
 * @returns {{group: THREE.Group, colliders: object[], occluders: THREE.Object3D[], disposables: THREE.Texture[]}}
 */
export function buildRoom({ width: W, depth: D, height: H = CEILING, floorColors = ['#9fd3c7', '#8cc9bb'], floorKind = 'check', wallColor = '#fff3df', trimColor = '#ffb37a', windows = ['south', 'east'] }) {
  const group = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const disposables = [];

  // floor
  const floorTex = tileTexture(floorColors[0], floorColors[1], 256, floorKind).clone();
  floorTex.userData = {};
  floorTex.repeat.set(W / 2, D / 2);
  floorTex.needsUpdate = true;
  disposables.push(floorTex);
  const floorMat = new THREE.MeshToonMaterial({ color: '#ffffff', map: floorTex, gradientMap });
  noOutline(floorMat);
  const floor = mesh(new THREE.PlaneGeometry(W, D), floorMat, { rx: -Math.PI / 2, cast: false, parent: group });
  floor.name = 'floor';

  // ceiling + lamps
  const ceilMat = noOutline(new THREE.MeshBasicMaterial({ color: '#f3ede2' }));
  mesh(new THREE.PlaneGeometry(W + 1, D + 1), ceilMat, { y: H, rx: Math.PI / 2, cast: false, receive: false, parent: group });
  for (let x = -W / 2 + 3; x <= W / 2 - 2; x += 4) {
    for (let z = -D / 2 + 3; z <= D / 2 - 2; z += 4) {
      const lamp = ceilingLamp(1.4, 0.5);
      lamp.position.set(x, H - 0.04, z);
      group.add(lamp);
    }
  }

  const wallMat = toon(wallColor);
  const trimMat = toon(trimColor);
  const addWall = (cx, cz, sx, sz, h = H, y0 = 0) => {
    const w = mesh(box(sx, h, sz), wallMat, { x: cx, y: y0 + h / 2, z: cz, parent: group });
    w.castShadow = false;
    w.userData.keep = true; // raycast occluder: must survive static merging
    occluders.push(w);
    // colourful wainscot along the bottom
    mesh(box(sx + 0.02, Math.min(1.0, h), sz + 0.02), trimMat, { x: cx, y: y0 + Math.min(1.0, h) / 2, z: cz, cast: false, parent: group });
    return w;
  };
  // north / south
  addWall(0, -D / 2 - WALL_T / 2, W + WALL_T * 2, WALL_T);
  addWall(0, D / 2 + WALL_T / 2, W + WALL_T * 2, WALL_T);
  colliders.push(collider(-W / 2 - WALL_T, W / 2 + WALL_T, -D / 2 - WALL_T, -D / 2));
  colliders.push(collider(-W / 2 - WALL_T, W / 2 + WALL_T, D / 2, D / 2 + WALL_T));
  // east
  addWall(W / 2 + WALL_T / 2, 0, WALL_T, D);
  colliders.push(collider(W / 2, W / 2 + WALL_T, -D / 2, D / 2));
  // west, with the elevator opening
  const segLen = D / 2 - DOOR_HALF;
  const wx = -W / 2 - WALL_T / 2;
  addWall(wx, -DOOR_HALF - segLen / 2, WALL_T, segLen);
  addWall(wx, DOOR_HALF + segLen / 2, WALL_T, segLen);
  const header = mesh(box(WALL_T, H - 2.6, DOOR_HALF * 2), wallMat, { x: wx, y: 2.6 + (H - 2.6) / 2, parent: group });
  header.userData.keep = true;
  occluders.push(header);
  colliders.push(collider(-W / 2 - WALL_T, -W / 2, -D / 2, -DOOR_HALF));
  colliders.push(collider(-W / 2 - WALL_T, -W / 2, DOOR_HALF, D / 2));

  // windows: sky + skyline seen through big panes
  const sky = skyTexture();
  const addWindows = (side) => {
    const along = side === 'south' || side === 'north' ? W : D;
    const paneW = 2.6;
    const count = Math.max(1, Math.floor((along - 4) / (paneW + 0.5)));
    const total = count * paneW + (count - 1) * 0.5;
    for (let i = 0; i < count; i++) {
      const offset = -total / 2 + paneW / 2 + i * (paneW + 0.5);
      const tex = sky.clone();
      tex.userData = {};
      tex.repeat.set(paneW / 8, 1);
      tex.offset.set((i * paneW) / 8 + (side === 'east' ? 0.37 : 0), 0);
      tex.needsUpdate = true;
      disposables.push(tex);
      const win = new THREE.Group();
      mesh(plane(paneW, 2.0), screenMaterial(tex), { cast: false, receive: false, parent: win });
      mesh(roundedBox(paneW + 0.16, 0.12, 0.12, 0.03), toon('#ffffff'), { y: 1.04, parent: win });
      mesh(roundedBox(paneW + 0.24, 0.1, 0.24, 0.03), toon('#ffffff'), { y: -1.04, z: 0.05, parent: win });
      for (const sx of [-1, 0, 1]) mesh(box(0.08, 2.0, 0.08), toon('#ffffff'), { x: (sx * paneW) / 2, parent: win });
      if (side === 'south') {
        win.position.set(offset, 2.25, D / 2 - 0.01);
        win.rotation.y = Math.PI;
      } else if (side === 'north') {
        win.position.set(offset, 2.25, -D / 2 + 0.01);
      } else if (side === 'east') {
        win.position.set(W / 2 - 0.01, 2.25, offset);
        win.rotation.y = -Math.PI / 2;
      }
      group.add(win);
    }
  };
  windows.forEach(addWindows);

  return { group, colliders, occluders, disposables };
}

/**
 * Elevator cabin behind the west wall opening. The cabin is identical on every floor, so riding it
 * just swaps the floor around the player.
 */
export class Elevator {
  constructor({ x0, floorLabel, floorLabels }) {
    this.x0 = x0; // inner face of the west wall
    this.group = new THREE.Group();
    this.open = 0;
    this.locked = false; // forced closed while riding
    this.interactables = [];
    this.colliders = [];
    this.disposables = [];
    this.floorLabel = floorLabel;
    this.build(floorLabels);
  }

  get cabinMinX() {
    return this.x0 - WALL_T - 2.3;
  }

  isInside(x, z) {
    return x < this.x0 - WALL_T + 0.05 && x > this.cabinMinX && Math.abs(z) < 1.15;
  }

  build(floorLabels) {
    const g = this.group;
    const x0 = this.x0;
    const back = this.cabinMinX;
    const metal = toon('#c3cad8');
    const metalDark = toon('#8d95a8');
    const cabinH = 2.75;
    const depth = x0 - WALL_T - back;
    const cx = back + depth / 2;

    // cabin shell
    mesh(box(depth + 0.8, 0.06, 2.6), toon('#6b7085'), { x: cx, y: -0.02, cast: false, parent: g });
    mesh(new THREE.PlaneGeometry(depth, 2.3), noOutline(toon('#d9b38c').clone()), { x: cx, y: 0.012, rx: -Math.PI / 2, cast: false, parent: g });
    mesh(box(0.12, cabinH, 2.5), metal, { x: back - 0.06, y: cabinH / 2, parent: g });
    for (const s of [-1, 1]) mesh(box(depth + 0.1, cabinH, 0.12), metal, { x: cx, y: cabinH / 2, z: s * 1.21, parent: g });
    mesh(box(depth + 0.2, 0.12, 2.6), metalDark, { x: cx, y: cabinH + 0.06, parent: g });
    const light = ceilingLamp(1.2, 1.2);
    light.position.set(cx, cabinH - 0.02, 0);
    g.add(light);
    // wood panel accents + handrail
    mesh(roundedBox(0.04, 1.2, 1.9, 0.02), toon('#b07d4f'), { x: back + 0.02, y: 1.2, parent: g });
    mesh(cylinder(0.025, 0.025, 1.9, 8), toon('#e9ecef'), { x: back + 0.1, y: 0.95, rx: Math.PI / 2, parent: g });
    this.colliders.push(collider(back - 0.2, back + 0.02, -1.3, 1.3));
    this.colliders.push(collider(back - 0.2, x0 - WALL_T, 1.15, 1.35));
    this.colliders.push(collider(back - 0.2, x0 - WALL_T, -1.35, -1.15));

    // inner button panel (on the +z side wall, facing -z)
    const btn = makeCanvas(256, 512);
    drawElevatorButtons(btn.ctx, 256, 512, floorLabels, this.floorLabel);
    const btnTex = canvasTexture(btn.canvas);
    this.disposables.push(btnTex);
    const panel = new THREE.Group();
    panel.position.set(x0 - WALL_T - 0.45, 1.35, 1.14);
    panel.rotation.y = Math.PI;
    mesh(roundedBox(0.34, 0.64, 0.03, 0.01), metalDark, { parent: panel });
    mesh(plane(0.3, 0.6), screenMaterial(btnTex), { z: 0.017, cast: false, receive: false, parent: panel });
    const panelHit = mesh(box(0.5, 0.9, 0.3), hitMaterial, { cast: false, receive: false, parent: panel });
    panelHit.userData.interact = { label: 'Choose a floor', kind: 'elevator' };
    this.interactables.push(panelHit);
    g.add(panel);

    // doors (slide along z inside the wall)
    this.doors = [-1, 1].map((s) => {
      const d = mesh(roundedBox(0.06, 2.55, DOOR_HALF + 0.02, 0.015), toon('#aab3c5'), { x: x0 - WALL_T / 2, y: 1.275, z: (s * DOOR_HALF) / 2, parent: g });
      mesh(box(0.065, 2.4, 0.02), metalDark, { z: -s * (DOOR_HALF / 2 - 0.02), parent: d });
      d.userData.side = s;
      d.userData.dynamic = true;
      return d;
    });
    this.doorCollider = collider(x0 - WALL_T, x0, -DOOR_HALF, DOOR_HALF, { active: true });
    this.colliders.push(this.doorCollider);

    // frame around the opening on the room side
    const frame = toon('#5c6278');
    mesh(roundedBox(0.1, 2.75, 0.14, 0.03), frame, { x: x0 + 0.04, y: 1.375, z: -DOOR_HALF - 0.07, parent: g });
    mesh(roundedBox(0.1, 2.75, 0.14, 0.03), frame, { x: x0 + 0.04, y: 1.375, z: DOOR_HALF + 0.07, parent: g });
    mesh(roundedBox(0.1, 0.16, DOOR_HALF * 2 + 0.28, 0.03), frame, { x: x0 + 0.04, y: 2.68, parent: g });

    // floor indicators: above the door outside, and above the door inside
    const ind = makeCanvas(256, 96);
    this.indicator = ind;
    this.indicatorTex = canvasTexture(ind.canvas);
    this.disposables.push(this.indicatorTex);
    this.setIndicator(this.floorLabel);
    mesh(roundedBox(0.06, 0.34, 0.8, 0.02), toon('#2b2d3a'), { x: x0 + 0.04, y: 3.05, parent: g });
    mesh(plane(0.7, 0.26), screenMaterial(this.indicatorTex), { x: x0 + 0.075, y: 3.05, ry: Math.PI / 2, cast: false, receive: false, parent: g });
    mesh(plane(0.6, 0.22), screenMaterial(this.indicatorTex), { x: x0 - WALL_T - 0.01, y: 2.5, ry: -Math.PI / 2, cast: false, receive: false, parent: g });

    // call button outside
    const call = new THREE.Group();
    call.position.set(x0 + 0.02, 1.25, DOOR_HALF + 0.45);
    call.rotation.y = Math.PI / 2;
    mesh(roundedBox(0.18, 0.32, 0.03, 0.01), metal, { parent: call });
    this.callLight = mesh(sphere(0.045, 12, 8), noOutline(new THREE.MeshBasicMaterial({ color: '#ffe066' })), { y: 0.06, z: 0.02, parent: call });
    mesh(sphere(0.045, 12, 8), noOutline(new THREE.MeshBasicMaterial({ color: '#e9ecef' })), { y: -0.06, z: 0.02, parent: call });
    const callHit = mesh(box(0.4, 0.6, 0.3), hitMaterial, { cast: false, receive: false, parent: call });
    callHit.userData.interact = { label: 'Call the elevator · choose a floor', kind: 'elevator' };
    this.interactables.push(callHit);
    g.add(call);
  }

  setIndicator(label, dir = '') {
    drawElevatorIndicator(this.indicator.ctx, 256, 96, label, dir);
    this.indicatorTex.needsUpdate = true;
  }

  /** Doors open automatically when the player is close, unless the elevator is riding. */
  update(dt, playerPos, t) {
    const near = Math.abs(playerPos.z) < 2.2 && playerPos.x < this.x0 + 2.4 && playerPos.x > this.cabinMinX;
    const target = !this.locked && near ? 1 : 0;
    const speed = 1.6;
    this.open = target > this.open ? Math.min(target, this.open + dt * speed) : Math.max(target, this.open - dt * speed);
    const e = this.open * this.open * (3 - 2 * this.open);
    for (const d of this.doors) d.position.z = (d.userData.side * DOOR_HALF) / 2 + d.userData.side * e * (DOOR_HALF + 0.05);
    this.doorCollider.active = this.open < 0.85;
    this.callLight.material.color.set(Math.sin(t * 4) > 0 || this.open > 0 ? '#ffe066' : '#fab005');
  }

  get closed() {
    return this.open <= 0.001;
  }

  dispose() {
    for (const t of this.disposables) t.dispose();
  }
}
