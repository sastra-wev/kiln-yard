// map.js — Kiln Yard itself: an original foundry yard, 64 m by 48 m, built from box volumes.
// Two lanes (Smelter Row west, Coal Run east) and a crane pass through the middle join the
// Casters' yard in the south to two plant sites in the north: the Kiln Hall (A) and the Casting
// Yard (B). This file owns the layout data, the meshes, the collision boxes, the line-of-sight
// and bullet raycasts against those boxes, and the waypoint graph the bots navigate by.

import * as THREE from 'three';
import { COLORS } from './palette.js';

// A solid is { cx, cz, w, d, h, mat }: a box centred at (cx, cz), w wide (x), d deep (z), h tall.
const SOLIDS = [
  // Perimeter
  { cx: 0, cz: -24.5, w: 66, d: 1, h: 5.5, mat: 'brickDark' },
  { cx: 0, cz: 24.5, w: 66, d: 1, h: 5.5, mat: 'brickDark' },
  { cx: -32.5, cz: 0, w: 1, d: 50, h: 5.5, mat: 'brickDark' },
  { cx: 32.5, cz: 0, w: 1, d: 50, h: 5.5, mat: 'brickDark' },
  // Kiln Hall (site A): three walls with a south door and an east door
  { cx: -21, cz: -20.5, w: 15, d: 1, h: 4.6, mat: 'brick' },
  { cx: -28.5, cz: -13, w: 1, d: 16, h: 4.6, mat: 'brick' },
  { cx: -16.5, cz: -6, w: 7, d: 1, h: 4.6, mat: 'brick' },
  { cx: -24.5, cz: -6, w: 6, d: 1, h: 4.6, mat: 'brick' },
  { cx: -13.5, cz: -16.5, w: 1, d: 6, h: 4.6, mat: 'brick' },
  { cx: -13.5, cz: -8.5, w: 1, d: 5, h: 4.6, mat: 'brick' },
  // Casting Yard (site B): low pit walls and a gantry base, more open than A
  { cx: 21, cz: -20.5, w: 15, d: 1, h: 4.6, mat: 'brick' },
  { cx: 28.5, cz: -13, w: 1, d: 16, h: 4.6, mat: 'brick' },
  { cx: 13.5, cz: -13, w: 1, d: 8, h: 4.6, mat: 'brick' },
  { cx: 17, cz: -5.5, w: 8, d: 1, h: 1.15, mat: 'steel' },
  { cx: 25, cz: -5.5, w: 8, d: 1, h: 1.15, mat: 'steel' },
  // Smelter Row (west lane): furnace blocks leave a weaving path
  { cx: -25, cz: 10, w: 5, d: 6, h: 3.4, mat: 'steel' },
  { cx: -17.5, cz: 3, w: 4, d: 5, h: 3, mat: 'brickDark' },
  { cx: -25.5, cz: -2.5, w: 4.5, d: 4, h: 2.6, mat: 'steel' },
  // Coal Run (east lane): coal store and a shed
  { cx: 25, cz: 10, w: 5, d: 6, h: 2.2, mat: 'coal' },
  { cx: 17.5, cz: 3, w: 4, d: 5, h: 3, mat: 'woodDark' },
  { cx: 25.5, cz: -2.5, w: 4.5, d: 4, h: 2.6, mat: 'steel' },
  // Crane Pass (mid): crane legs and stacked crates make the mid fight
  { cx: -3.4, cz: -3, w: 1.2, d: 1.2, h: 6.5, mat: 'steel' },
  { cx: 3.4, cz: -3, w: 1.2, d: 1.2, h: 6.5, mat: 'steel' },
  { cx: 0, cz: 6.5, w: 6, d: 3, h: 2.4, mat: 'wood' },
  { cx: -8, cz: -9, w: 4, d: 3, h: 2.2, mat: 'brickDark' },
  { cx: 8, cz: -9, w: 4, d: 3, h: 2.2, mat: 'brickDark' },
  // South yard (attackers): foundry office and stores break up the spawn ground
  { cx: -12, cz: 17, w: 8, d: 4, h: 3.6, mat: 'plaster' },
  { cx: 12, cz: 17, w: 8, d: 4, h: 3.6, mat: 'plaster' },
  { cx: 0, cz: 15.5, w: 3, d: 2.4, h: 2.2, mat: 'wood' },
  // North mid (defenders): the watch office between the sites
  { cx: 0, cz: -18, w: 7, d: 4, h: 3.6, mat: 'plaster' },
  // Cover crates (1.15 m: crouch behind them and you are hidden; stand and you are not)
  { cx: -21, cz: 13, w: 1.3, d: 1.3, h: 1.15, mat: 'wood' },
  { cx: -19.6, cz: 13, w: 1.3, d: 1.3, h: 1.15, mat: 'woodDark' },
  { cx: 21, cz: 13, w: 1.3, d: 1.3, h: 1.15, mat: 'wood' },
  { cx: 19.6, cz: 13, w: 1.3, d: 1.3, h: 1.15, mat: 'woodDark' },
  { cx: -5.5, cz: -14, w: 1.3, d: 1.3, h: 1.15, mat: 'wood' },
  { cx: 5.5, cz: -14, w: 1.3, d: 1.3, h: 1.15, mat: 'wood' },
  { cx: -21, cz: -13, w: 1.3, d: 1.3, h: 2.3, mat: 'wood' },
  { cx: 22.5, cz: -16, w: 1.3, d: 1.3, h: 1.15, mat: 'woodDark' },
  { cx: 0, cz: -1, w: 1.3, d: 1.3, h: 1.15, mat: 'wood' },
  { cx: -11, cz: 7, w: 1.3, d: 1.3, h: 1.15, mat: 'woodDark' },
  { cx: 11, cz: 7, w: 1.3, d: 1.3, h: 1.15, mat: 'wood' },
];

export const SITES = [
  { id: 'A', name: 'Kiln Hall', x: -21, z: -13, r: 6.4, color: COLORS.siteA },
  { id: 'B', name: 'Casting Yard', x: 21, z: -13, r: 6.4, color: COLORS.siteB },
];

export const SPAWNS = {
  atk: [[-4, 20.5], [-2, 21], [0, 20.5], [2, 21], [4, 20.5]],
  def: [[-4, -21], [-2, -20.5], [0, -21], [2, -20.5], [4, -21]],
};

// Waypoint graph: named nodes the bots walk between. Edges are walked both ways.
export const NODES = {
  s_gate: [0, 17.5], s_west: [-13, 12], s_east: [13, 12],
  w_lane1: [-21, 15], w_lane2: [-21, 5.5], w_lane3: [-21, -3], w_door: [-21, -5.2],
  e_lane1: [21, 15], e_lane2: [21, 5.5], e_lane3: [21, -3], e_door: [21, -4.2],
  mid_s: [0, 10], mid: [0, -0.5], mid_n: [0, -11.5],
  cross_w: [-9, -3], cross_e: [9, -3],
  a_door: [-12.6, -13], a_site: [-21, -13], a_hold1: [-17.5, -17.5], a_hold2: [-25.5, -9.5],
  b_door: [12.6, -13], b_site: [21, -13], b_hold1: [17.5, -17.5], b_hold2: [24.5, -9.5],
  d_gate: [0, -15.5], d_west: [-7, -19], d_east: [7, -19],
};
const EDGES = [
  ['s_gate', 's_west'], ['s_gate', 's_east'], ['s_gate', 'mid_s'],
  ['s_west', 'w_lane1'], ['s_east', 'e_lane1'],
  ['w_lane1', 'w_lane2'], ['w_lane2', 'w_lane3'], ['w_lane3', 'w_door'], ['w_door', 'a_site'],
  ['e_lane1', 'e_lane2'], ['e_lane2', 'e_lane3'], ['e_lane3', 'e_door'], ['e_door', 'b_site'],
  ['mid_s', 'mid'], ['mid', 'mid_n'], ['mid', 'cross_w'], ['mid', 'cross_e'],
  ['cross_w', 'w_lane3'], ['cross_w', 'a_door'], ['cross_e', 'e_lane3'], ['cross_e', 'b_door'],
  ['a_door', 'a_site'], ['b_door', 'b_site'], ['mid_n', 'a_door'], ['mid_n', 'b_door'],
  ['mid_n', 'd_gate'], ['d_gate', 'd_west'], ['d_gate', 'd_east'],
  ['d_west', 'a_hold1'], ['d_east', 'b_hold1'], ['a_hold1', 'a_site'], ['b_hold1', 'b_site'],
  ['a_site', 'a_hold2'], ['b_site', 'b_hold2'], ['w_door', 'a_hold2'], ['e_door', 'b_hold2'],
];
export const GRAPH = (() => {
  const g = new Map(Object.keys(NODES).map((k) => [k, []]));
  for (const [a, b] of EDGES) { g.get(a).push(b); g.get(b).push(a); }
  return g;
})();

/** Breadth-first next hop from node `from` toward node `to` (precomputed per call; the graph is small). */
export function nextHop(from, to) {
  if (from === to) return to;
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of GRAPH.get(cur)) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        let node = to;
        while (prev.get(node) !== from) node = prev.get(node);
        return node;
      }
      queue.push(next);
    }
  }
  return from;
}

/** The node nearest to a point — where a bot "is" on the graph. */
export function nearestNode(x, z) {
  let best = null, bestD = Infinity;
  for (const [id, [nx, nz]] of Object.entries(NODES)) {
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// Colliders: solids expanded to min/max form once, shared by movement, LOS and bullets.
export const COLLIDERS = SOLIDS.map((s) => ({
  minX: s.cx - s.w / 2, maxX: s.cx + s.w / 2,
  minZ: s.cz - s.d / 2, maxZ: s.cz + s.d / 2,
  minY: 0, maxY: s.h,
}));

/** Push a circle (x, z, r) out of every collider it overlaps; returns the corrected [x, z]. */
export function resolveCollision(x, z, r) {
  for (const c of COLLIDERS) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r; z = nz + (dz / d) * r;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const left = x - c.minX, right = c.maxX - x, back = z - c.minZ, front = c.maxZ - z;
      const m = Math.min(left, right, back, front);
      if (m === left) x = c.minX - r; else if (m === right) x = c.maxX + r;
      else if (m === back) z = c.minZ - r; else z = c.maxZ + r;
    }
  }
  return [x, z];
}

const _box = { min: new THREE.Vector3(), max: new THREE.Vector3() };
/** Distance along the ray to the first collider hit, or Infinity. Slab test per box. */
export function rayHitWalls(origin, dir, maxDist) {
  let best = Infinity;
  for (const c of COLLIDERS) {
    _box.min.set(c.minX, c.minY, c.minZ);
    _box.max.set(c.maxX, c.maxY, c.maxZ);
    let tmin = 0, tmax = maxDist;
    let ok = true;
    for (const axis of ['x', 'y', 'z']) {
      const o = origin[axis], d = dir[axis];
      if (Math.abs(d) < 1e-9) {
        if (o < _box.min[axis] || o > _box.max[axis]) { ok = false; break; }
      } else {
        let t1 = (_box.min[axis] - o) / d, t2 = (_box.max[axis] - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < best) best = tmin;
  }
  // The ground plane.
  if (dir.y < -1e-9) {
    const t = -origin.y / dir.y;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

/** True when the straight line between two eye points touches no collider. */
const _dir = new THREE.Vector3();
export function losClear(a, b) {
  _dir.subVectors(b, a);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.divideScalar(dist);
  return rayHitWalls(a, _dir, dist) >= dist - 0.05;
}

function letterTexture(letter, color) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.strokeStyle = color; g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color;
  g.font = '700 150px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 128, 136);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

/** Build every mesh of the yard into the scene. Returns nothing; geometry is static. */
export function buildWorld(scene, mats) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(66, 50), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Darker worn patches on the lanes and sites.
  const patchGeo = new THREE.PlaneGeometry(13, 13);
  for (const [x, z] of [[-21, -13], [21, -13], [0, 0], [-21, 8], [21, 8]]) {
    const p = new THREE.Mesh(patchGeo, mats.groundDark);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.01, z);
    p.receiveShadow = true;
    scene.add(p);
  }
  const boxGeoCache = new Map();
  const geoFor = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  };
  for (const s of SOLIDS) {
    const mesh = new THREE.Mesh(geoFor(s.w, s.h, s.d), mats[s.mat]);
    mesh.position.set(s.cx, s.h / 2, s.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // The kiln itself: a brick cylinder with a steel cap and chimney, inside site A.
  const kiln = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 4.4, 20), mats.brickDark);
  kiln.position.set(-24.5, 2.2, -16.5);
  kiln.castShadow = true; kiln.receiveShadow = true;
  scene.add(kiln);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.4, 12), mats.steel);
  chimney.position.set(-24.5, 6, -16.5);
  chimney.castShadow = true;
  scene.add(chimney);
  COLLIDERS.push({ minX: -26.6, maxX: -22.4, minZ: -18.6, maxZ: -14.4, minY: 0, maxY: 4.4 });
  // The mid crane: a beam across the two legs that are already solids, plus a hook block.
  const beam = new THREE.Mesh(geoFor(8.4, 0.7, 1), mats.steelLight);
  beam.position.set(0, 6.6, -3);
  beam.castShadow = true;
  scene.add(beam);
  const hook = new THREE.Mesh(geoFor(0.8, 1.4, 0.8), mats.steel);
  hook.position.set(1.2, 5.4, -3);
  hook.castShadow = true;
  scene.add(hook);
  // Barrels: visual cylinders with small box colliders, in loose clusters.
  const barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.95, 12);
  for (const [x, z] of [[-14.5, -4.5], [-13.7, -4.9], [14.5, -4.5], [13.7, -4.9], [-6, 19.5], [6.2, 19.2], [-27, 18.5], [27.5, 18.8]]) {
    const b = new THREE.Mesh(barrelGeo, mats.steelLight);
    b.position.set(x, 0.48, z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);
    COLLIDERS.push({ minX: x - 0.34, maxX: x + 0.34, minZ: z - 0.34, maxZ: z + 0.34, minY: 0, maxY: 0.95 });
  }
  // The town beyond the walls: dark foundry silhouettes against the dusk, so the yard sits in a
  // place instead of a void. Pure backdrop — outside the perimeter, no colliders.
  const skylineGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, z, w, h, d] of [[-46, -38, 16, 15, 10], [-18, -42, 10, 10, 8], [8, -40, 14, 18, 10], [38, -36, 12, 12, 9], [-48, 6, 10, 9, 14], [48, 2, 10, 13, 12], [-40, 34, 14, 8, 9], [24, 38, 16, 11, 10], [46, 30, 9, 8, 9]]) {
    const m = new THREE.Mesh(skylineGeo, mats.dark);
    m.position.set(x, h / 2, z);
    m.scale.set(w, h, d);
    scene.add(m);
  }
  // Yard lamps: a pole, a warm head that reads at dusk, and real light at the two sites and mid.
  const lampPoleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.3, 8);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffc37a });
  for (const [x, z, withLight] of [[-14, -5.5, false], [14, -5.5, false], [0, 10.5, true], [-27.5, -19, true], [27.5, -19, true], [-6, 20, false], [6, 20, false]]) {
    const pole = new THREE.Mesh(lampPoleGeo, mats.steel);
    pole.position.set(x, 2.15, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), lampHeadMat);
    head.position.set(x, 4.35, z);
    scene.add(head);
    if (withLight) {
      const light = new THREE.PointLight(0xffb36b, 30, 17, 1.7);
      light.position.set(x, 4.2, z);
      scene.add(light);
    }
  }
  // Site markings: a painted ring and letter on the ground of each site.
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(site.r * 2, site.r * 2),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.id, site.id === 'A' ? '#e8a33d' : '#3fb8a6'), transparent: true, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    scene.add(ring);
  }
}
