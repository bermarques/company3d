// Ground floor: reception, building directory, team wall and the glass-walled Manager's Office.
import * as THREE from 'three';
import { toon, toonUnique, roundedBox, box, plane, mesh, hitMaterial, noOutline, screenMaterial, sphere, cylinder, capsule, disposeTree } from '../engine/toon.js';
import { makeCanvas, canvasTexture, FONT, DISPLAY_FONT } from '../engine/canvas.js';
import { buildRoom, Elevator, collider, colliderFromObject } from './building.js';
import { plant, couch, coffeeTable, rug, wallBoard, bookshelf, officeChair, arrowDecal, PALETTE } from './furniture.js';
import { mergeStatic, trimShadows } from '../engine/merge.js';
import { drawDirectory, drawOrgSign, drawTeamWall, drawRepoMap, drawManagerMonitor } from './screens.js';

export class LobbyFloor {
  constructor({ world, floorLabels }) {
    this.kind = 'lobby';
    this.world = world;
    this.floorLabel = 'G';
    this.group = new THREE.Group();
    this.colliders = [];
    this.occluders = [];
    this.interactables = [];
    this.disposables = [];
    this.boards = [];
    this.build(floorLabels);
  }

  board(w, h, cw, ch, draw, { frame = '#2b2d3a', tray = false } = {}) {
    const { canvas, ctx } = makeCanvas(cw, ch);
    const tex = canvasTexture(canvas, { anisotropy: 16 });
    this.disposables.push(tex);
    const entry = { canvas, ctx, tex, draw };
    this.boards.push(entry);
    this.redraw(entry);
    const g = wallBoard(w, h, tex, { frame, tray });
    g.userData.entry = entry;
    return g;
  }

  redraw(entry) {
    entry.draw(entry.ctx, entry.canvas.width, entry.canvas.height);
    entry.tex.needsUpdate = true;
  }

  build(floorLabels) {
    const W = 32;
    const D = 26;
    this.bounds = { W, D };
    const room = buildRoom({ width: W, depth: D, floorColors: ['#f0c993', '#e6bb82'], floorKind: 'planks', trimColor: '#5c7cfa', windows: ['south', 'east'] });
    this.group.add(room.group);
    this.colliders.push(...room.colliders);
    this.occluders.push(...room.occluders);
    this.disposables.push(...room.disposables);

    this.elevator = new Elevator({ x0: -W / 2, floorLabel: 'G', floorLabels });
    this.group.add(this.elevator.group);
    this.colliders.push(...this.elevator.colliders);
    this.interactables.push(...this.elevator.interactables);

    // building directory next to the elevator
    const dir = this.board(2.6, 2.2, 1280, 1083, (ctx, w, h) => drawDirectory(ctx, w, h, { world: this.world }));
    dir.position.set(-W / 2 + 0.05, 0.9, -3.4);
    dir.rotation.y = Math.PI / 2;
    this.group.add(dir);
    dir.userData.face.userData.interact = { label: 'Building directory · choose a floor', kind: 'elevator' };
    this.interactables.push(dir.userData.face);

    // big org sign on the north wall
    const orgSign = this.board(7.5, 1.7, 2048, 464, (ctx, w, h) => drawOrgSign(ctx, w, h, { world: this.world }), { frame: '#2b2d3a' });
    orgSign.position.set(-5.5, 2.0, -D / 2 + 0.05);
    this.group.add(orgSign);

    // reception desk + robot
    const rec = new THREE.Group();
    rec.position.set(-5.5, 0, -D / 2 + 5);
    mesh(roundedBox(4.4, 1.05, 0.9, 0.2), toon('#ffffff'), { y: 0.525, parent: rec });
    mesh(roundedBox(4.5, 0.08, 1.0, 0.04), toon(PALETTE.woodDark), { y: 1.08, parent: rec });
    mesh(roundedBox(4.0, 0.5, 0.05, 0.02), toon('#5c7cfa'), { y: 0.55, z: 0.46, parent: rec });
    mesh(sphere(0.09, 14, 8), toon('#fab005'), { x: 1.6, y: 1.16, sy: 0.6, parent: rec });
    this.group.add(rec);
    this.colliders.push(colliderFromObject(rec));
    this.robot = this.buildRobot();
    this.robot.position.set(-5.5, 0, -D / 2 + 3.6);
    this.group.add(this.robot);

    // team wall on the south wall
    const team = this.board(9, 3.0, 2048, 683, (ctx, w, h) => drawTeamWall(ctx, w, h, { world: this.world }), { frame: '#ffa94d' });
    team.position.set(-5, 0.9, D / 2 - 0.05);
    team.rotation.y = Math.PI;
    this.group.add(team);

    // lounge
    const lounge = new THREE.Vector3(-6, 0, 5);
    const r = rug(6, 4.6, '#d0bfff');
    r.position.copy(lounge);
    this.group.add(r);
    for (const s of [-1, 1]) {
      const c = couch(s < 0 ? '#ff8787' : '#4dabf7', 2.6);
      c.position.set(lounge.x, 0, lounge.z + s * 1.7);
      c.rotation.y = s < 0 ? 0 : Math.PI;
      this.group.add(c);
      this.colliders.push(colliderFromObject(c));
    }
    const t = coffeeTable(1.6, 0.8);
    t.position.copy(lounge);
    this.group.add(t);
    this.colliders.push(colliderFromObject(t));

    for (const [x, z] of [[-W / 2 + 0.8, -D / 2 + 0.8], [-W / 2 + 0.8, D / 2 - 0.8], [2.6, D / 2 - 0.8], [2.6, -D / 2 + 0.8], [W / 2 - 0.8, D / 2 - 0.8]]) {
      const pl = plant(1.4, { tall: true });
      pl.position.set(x, 0, z);
      this.group.add(pl);
      this.colliders.push(colliderFromObject(pl, -0.05));
    }

    this.buildManagerOffice(W, D);

    // floor arrows guiding to the manager's office
    for (let i = 0; i < 4; i++) {
      const a = arrowDecal('#ffd43b');
      a.position.set(-W / 2 + 4 + i * 4.2, 0.02, -2.6);
      a.rotation.z = -Math.PI / 2;
      this.group.add(a);
    }

    this.spawn = { x: -W / 2 + 1.6, z: 0, yaw: -Math.PI / 2 };

    trimShadows(this.group, 0.1);
    mergeStatic(this.group);
  }

  buildManagerOffice(W, D) {
    // Office spans x ∈ [ox, W/2], z ∈ [-D/2, oz]
    const ox = 4;
    const oz = -1.5;
    const doorMin = -5.2;
    const doorMax = -3.0;
    const glass = noOutline(toonUnique('#a5d8ff', { opacity: 0.28 }));
    const frame = toon('#3d4155');
    const H = 3.2;
    const glassWall = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      if (!alongX) g.rotation.y = Math.PI / 2;
      mesh(box(len, H, 0.04), glass, { y: H / 2, cast: false, receive: false, parent: g });
      mesh(box(len, 0.1, 0.12), frame, { y: H, parent: g });
      mesh(box(len, 0.1, 0.12), frame, { y: 0.05, parent: g });
      for (let i = 0; i <= Math.round(len / 1.5); i++) mesh(box(0.08, H, 0.12), frame, { x: -len / 2 + (i * len) / Math.round(len / 1.5), y: H / 2, parent: g });
      this.group.add(g);
      this.colliders.push(alongX ? collider(Math.min(x1, x2), Math.max(x1, x2), cz - 0.08, cz + 0.08) : collider(cx - 0.08, cx + 0.08, Math.min(z1, z2), Math.max(z1, z2)));
    };
    glassWall(ox, -D / 2, ox, doorMin);
    glassWall(ox, doorMax, ox, oz);
    glassWall(ox, oz, W / 2, oz);
    // header above the door with a sign
    mesh(box(0.12, 0.6, doorMax - doorMin), frame, { x: ox, y: H - 0.3, z: (doorMin + doorMax) / 2, parent: this.group });
    const { canvas, ctx } = makeCanvas(512, 128);
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 128, 30);
    ctx.fill();
    ctx.fillStyle = '#1b1b24';
    ctx.font = `700 60px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("👔 Manager's Office", 256, 68);
    const signTex = canvasTexture(canvas);
    this.disposables.push(signTex);
    mesh(plane(2.0, 0.5), screenMaterial(signTex), { x: ox - 0.07, y: H - 0.3, z: (doorMin + doorMax) / 2, ry: -Math.PI / 2, cast: false, receive: false, parent: this.group });

    const r = rug(6.5, 5.5, '#b2f2bb');
    r.position.set((ox + W / 2) / 2, 0, (-D / 2 + oz) / 2);
    this.group.add(r);

    // big desk: manager sits on the east side looking toward the door
    const desk = new THREE.Group();
    desk.position.set(ox + 6.2, 0, (-D / 2 + oz) / 2 + 0.3);
    mesh(roundedBox(1.2, 0.08, 2.6, 0.04), toon(PALETTE.woodDark), { y: 0.76, parent: desk });
    mesh(roundedBox(1.1, 0.72, 0.08, 0.03), toon('#3d4155'), { y: 0.36, z: -1.2, parent: desk });
    mesh(roundedBox(1.1, 0.72, 0.08, 0.03), toon('#3d4155'), { y: 0.36, z: 1.2, parent: desk });
    mesh(roundedBox(0.08, 0.6, 2.4, 0.03), toon('#3d4155'), { x: -0.5, y: 0.42, parent: desk });
    // mug
    mesh(cylinder(0.06, 0.055, 0.13, 14), toon('#ff6b6b'), { x: 0.2, y: 0.865, z: 0.9, parent: desk });
    this.group.add(desk);
    this.colliders.push(colliderFromObject(desk));

    // monitor, facing the manager's chair (+x) — and a second one facing the visitor side
    const monCanvas = makeCanvas(640, 400);
    this.monitor = { ...monCanvas, tex: canvasTexture(monCanvas.canvas), last: -1 };
    this.disposables.push(this.monitor.tex);
    for (const facing of [1, -1]) {
      const mon = new THREE.Group();
      mon.position.set(desk.position.x + (facing > 0 ? 0.05 : -0.05), 0.8, desk.position.z + (facing > 0 ? -0.3 : 0.6));
      mon.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      mesh(roundedBox(1.0, 0.64, 0.05, 0.02), toon('#212529'), { y: 0.55, parent: mon });
      mesh(plane(0.94, 0.58), screenMaterial(this.monitor.tex), { y: 0.55, z: 0.027, cast: false, receive: false, parent: mon });
      mesh(cylinder(0.03, 0.03, 0.25, 8), toon('#495057'), { y: 0.12, parent: mon });
      mesh(roundedBox(0.3, 0.02, 0.2, 0.01), toon('#495057'), { y: 0.01, parent: mon });
      const hit = mesh(box(1.2, 0.9, 0.5), hitMaterial, { y: 0.5, cast: false, receive: false, parent: mon });
      hit.userData.interact = { label: 'Open the Manager Console', kind: 'manager' };
      this.interactables.push(hit);
      this.group.add(mon);
    }
    this.drawMonitor(0);

    const chair = officeChair('#2b2d3a');
    chair.scale.setScalar(1.25);
    chair.position.set(desk.position.x + 1.0, 0, desk.position.z);
    chair.rotation.y = -Math.PI / 2;
    this.group.add(chair);
    for (const dz of [-0.7, 0.7]) {
      const v = officeChair('#ffa94d');
      v.position.set(desk.position.x - 1.2, 0, desk.position.z + dz);
      v.rotation.y = Math.PI / 2;
      this.group.add(v);
    }

    // repo connection map on the office's north wall
    const map = this.board(5.2, 2.6, 1600, 800, (ctx, w, h) => drawRepoMap(ctx, w, h, { world: this.world }), { frame: '#3d4155' });
    map.position.set((ox + W / 2) / 2 + 0.6, 0.9, -D / 2 + 0.05);
    this.group.add(map);
    map.userData.face.userData.interact = { label: 'Edit repo connections', kind: 'managerLinks' };
    this.interactables.push(map.userData.face);

    const shelf = bookshelf(2.2, 2.2);
    shelf.position.set(W / 2 - 0.25, 0, -D / 2 + 5);
    shelf.rotation.y = -Math.PI / 2;
    this.group.add(shelf);
    this.colliders.push(colliderFromObject(shelf));
    const pl = plant(1.5, { tall: true });
    pl.position.set(W / 2 - 0.8, 0, oz - 0.8);
    this.group.add(pl);
    this.colliders.push(colliderFromObject(pl, -0.05));
    const c = couch('#20c997', 2.2);
    c.position.set(ox + 1.6, 0, oz - 0.75);
    c.rotation.y = Math.PI;
    this.group.add(c);
    this.colliders.push(colliderFromObject(c));
  }

  buildRobot() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.2;
    g.add(body);
    mesh(capsule(0.32, 0.45), toon('#f1f3f5'), { y: 0.62, parent: body });
    mesh(roundedBox(0.7, 0.5, 0.55, 0.18), toon('#f1f3f5'), { y: 1.32, parent: body });
    const { canvas, ctx } = makeCanvas(256, 160);
    ctx.fillStyle = '#1b1f3b';
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = '#63e6be';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    for (const x of [80, 176]) {
      ctx.beginPath();
      ctx.arc(x, 82, 26, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(128, 100, 30, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    const tex = canvasTexture(canvas);
    this.disposables.push(tex);
    mesh(plane(0.55, 0.34), screenMaterial(tex), { y: 1.32, z: 0.28, cast: false, receive: false, parent: body });
    mesh(cylinder(0.015, 0.015, 0.2, 6), toon('#868e96'), { y: 1.66, parent: body });
    this.robotLight = mesh(sphere(0.05, 10, 8), noOutline(new THREE.MeshBasicMaterial({ color: '#ff6b6b' })), { y: 1.78, parent: body });
    for (const s of [-1, 1]) mesh(capsule(0.07, 0.3), toon('#ced4da'), { x: s * 0.4, y: 0.75, rz: s * 0.3, parent: body });
    mesh(cylinder(0.3, 0.38, 0.12, 20), toon('#5c7cfa'), { y: 0.06, parent: g });
    const hit = mesh(box(0.9, 2.0, 0.9), hitMaterial, { y: 1.0, cast: false, receive: false, parent: g });
    hit.userData.interact = { label: 'Say hi to the front-desk bot', kind: 'robot' };
    this.interactables.push(hit);
    this.colliders.push(collider(-5.5 - 0.45, -5.5 + 0.45, -13 + 3.6 - 0.45, -13 + 3.6 + 0.45));
    g.userData.body = body;
    g.userData.dynamic = true;
    return g;
  }

  drawMonitor(t) {
    drawManagerMonitor(this.monitor.ctx, 640, 400, { world: this.world, t });
    this.monitor.tex.needsUpdate = true;
    this.monitor.last = t;
  }

  update(dt, t, camera) {
    this.elevator.update(dt, camera.position, t);
    if (t - this.monitor.last > 0.33) this.drawMonitor(t);
    const body = this.robot.userData.body;
    body.position.y = 0.2 + Math.sin(t * 2) * 0.05;
    body.rotation.y = Math.sin(t * 0.6) * 0.4;
    this.robotLight.material.color.set(Math.sin(t * 3) > 0 ? '#ff6b6b' : '#ffe066');
  }

  setWorld(world) {
    this.world = world;
    for (const b of this.boards) this.redraw(b);
  }

  refreshAvatars() {
    for (const b of this.boards) this.redraw(b);
  }

  dispose() {
    this.elevator.dispose();
    for (const t of this.disposables) t.dispose();
    disposeTree(this.group);
  }
}
