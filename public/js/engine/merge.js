// Draw-call reduction: bake static meshes that share a material into one geometry.
// The toon outline pass doubles every draw call, so this keeps big floors smooth.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hitMaterial } from './toon.js';

function mergeable(o) {
  return (
    o.isMesh &&
    !o.userData.interact &&
    !o.userData.keep &&
    o.material !== hitMaterial &&
    !Array.isArray(o.material) &&
    o.children.length === 0 &&
    o.geometry.attributes.normal &&
    o.geometry.attributes.uv
  );
}

function bake(meshes, toLocal, parent) {
  const geos = meshes.map((m) => {
    // RoundedBoxGeometry is non-indexed while most others are indexed: de-index so they can share a buffer.
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.applyMatrix4(toLocal(m));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return false;
  const first = meshes[0];
  const out = new THREE.Mesh(merged, first.material);
  out.castShadow = first.castShadow;
  out.receiveShadow = first.receiveShadow;
  out.renderOrder = first.renderOrder;
  parent.add(out);
  for (const m of meshes) {
    m.removeFromParent();
    if (!m.geometry.userData.shared) m.geometry.dispose();
  }
  return true;
}

/**
 * Merge every static mesh under `root` (in root space) by material.
 * Subtrees flagged `userData.dynamic` (characters, doors, robots) and interactive meshes are left alone.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const visit = (o) => {
    if (o !== root && o.userData.dynamic) return;
    if (mergeable(o) && o.visible) {
      const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  const m = new THREE.Matrix4();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    bake(meshes, (mesh) => m.multiplyMatrices(inv, mesh.matrixWorld), root);
  }
}

/** Merge same-material mesh siblings inside each group, in that group's local space (keeps rigs animatable). */
export function mergeSiblings(root) {
  const groups = [];
  root.traverse((o) => {
    if (!o.isMesh) groups.push(o);
  });
  for (const g of groups) {
    const buckets = new Map();
    for (const c of g.children) {
      if (!mergeable(c) || !c.visible) continue;
      const key = `${c.material.uuid}|${c.castShadow}|${c.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    }
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      bake(
        meshes,
        (mesh) => {
          mesh.updateMatrix();
          return mesh.matrix;
        },
        g,
      );
    }
  }
}

/** Tiny details (eyes, buttons, books) don't need to cast shadows. */
export function trimShadows(root, minRadius = 0.07) {
  const s = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(s);
    if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < minRadius) o.castShadow = false;
  });
}
