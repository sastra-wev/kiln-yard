// weapons.js — the arsenal and the gunplay model. Four guns and two grenades, all hitscan or
// simple projectiles, all resolved against the map's colliders and the characters' two hitboxes
// (head and body). The model is the tactical part: damage falls off with range, the head pays
// four times the body, and spread — the cone your shots scatter in — grows sharply while you
// move or jump and shrinks when you crouch or walk, so stopping to aim is worth real damage.

import * as THREE from 'three';
import { rayHitWalls } from './map.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 Sidearm', slot: 'sidearm', price: 0, damage: 26, headMult: 4, rpm: 340, mag: 12, reserve: Infinity, reloadTime: 1.1, spread: 0.011, moveSpread: 2.4, recoil: 0.011, range: 42, falloff: 0.55, speed: 4.6, auto: false, pellets: 1, sound: 'pistol' },
  smg: { id: 'smg', name: 'Viper SMG', slot: 'primary', price: 1500, damage: 22, headMult: 4, rpm: 800, mag: 30, reserve: 90, reloadTime: 1.9, spread: 0.017, moveSpread: 2.0, recoil: 0.007, range: 34, falloff: 0.5, speed: 4.9, auto: true, pellets: 1, sound: 'smg' },
  rifle: { id: 'rifle', name: 'KR-7 Rifle', slot: 'primary', price: 2700, damage: 34, headMult: 4, rpm: 600, mag: 30, reserve: 90, reloadTime: 2.3, spread: 0.008, moveSpread: 2.6, recoil: 0.013, range: 60, falloff: 0.7, speed: 4.35, auto: true, pellets: 1, sound: 'rifle' },
  sniper: { id: 'sniper', name: 'Longshot', slot: 'primary', price: 4750, damage: 110, headMult: 2, rpm: 42, mag: 5, reserve: 25, reloadTime: 3.1, spread: 0.055, moveSpread: 3.2, recoil: 0.05, range: 120, falloff: 0.95, speed: 3.9, auto: false, pellets: 1, sound: 'sniper', scopedSpread: 0.0006, scope: true },
};

export const BUY_MENU = [
  { key: 'Digit1', kind: 'weapon', id: 'smg', label: 'Viper SMG', desc: 'Fast, close-range shredder' },
  { key: 'Digit2', kind: 'weapon', id: 'rifle', label: 'KR-7 Rifle', desc: 'The all-round rifle' },
  { key: 'Digit3', kind: 'weapon', id: 'sniper', label: 'Longshot', desc: 'One shot, scoped, bolt-action' },
  { key: 'Digit4', kind: 'armor', id: 'armor', label: 'Kevlar vest + helm', desc: 'Halves body damage taken' },
  { key: 'Digit5', kind: 'frag', id: 'frag', label: 'Frag grenade', desc: '90 damage at the core' },
  { key: 'Digit6', kind: 'smoke', id: 'smoke', label: 'Smoke grenade', desc: '12 s of blind ground' },
  { key: 'Digit7', kind: 'ammo', id: 'ammo', label: 'Reserve ammo', desc: 'Refill every magazine' },
];
export const PRICES = { smg: 1500, rifle: 2700, sniper: 4750, armor: 650, frag: 300, smoke: 200, ammo: 150 };

/** One shooter's live weapon: definition plus magazine, reserve, cooldown and reload state. */
export class WeaponState {
  constructor(def) {
    this.def = def;
    this.mag = def.mag;
    this.reserve = def.reserve;
    this.cooldown = 0;
    this.reloadLeft = 0;
    this.recoilHeat = 0;
  }
  get reloading() { return this.reloadLeft > 0; }
  startReload() {
    if (this.reloading || this.mag >= this.def.mag || this.reserve <= 0) return false;
    this.reloadLeft = this.def.reloadTime;
    return true;
  }
  step(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoilHeat = Math.max(0, this.recoilHeat - dt * 3.2);
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const take = Math.min(this.def.mag - this.mag, this.reserve);
        this.mag += take;
        if (this.reserve !== Infinity) this.reserve -= take;
      }
    }
  }
}

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

/**
 * Fire one hitscan shot. `shooter` is a character (for spread state), `from` the eye point,
 * `aim` the unit direction before scatter. Returns { kind: 'wall'|'body'|'head'|'none', point,
 * dist, target } — damage is the caller's to apply, so bots and the player share one model.
 */
export function fireHitscan(shooter, from, aim, characters) {
  const def = shooter.weapon.def;
  const scoped = def.scope && shooter.scoped;
  let spread = scoped ? def.scopedSpread : def.spread;
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  if (speed > 0.6) spread *= 1 + (def.moveSpread - 1) * Math.min(1, speed / 4.6);
  if (!shooter.grounded) spread *= 4;
  if (shooter.crouching) spread *= 0.62;
  spread *= 1 + shooter.weapon.recoilHeat * 1.6;

  _dir.copy(aim);
  // Scatter inside a cone: two small random tilts, preallocated vector math only.
  _dir.x += (Math.random() * 2 - 1) * spread;
  _dir.y += (Math.random() * 2 - 1) * spread;
  _dir.z += (Math.random() * 2 - 1) * spread;
  _dir.normalize();

  const wallDist = rayHitWalls(from, _dir, 160);
  let best = wallDist, bestChar = null, bestPart = null;
  for (const c of characters) {
    if (c === shooter || !c.alive) continue;
    for (const part of ['head', 'body']) {
      const box = part === 'head' ? c.headBox : c.bodyBox;
      const t = rayVsBox(from, _dir, box);
      if (t !== null && t < best) { best = t; bestChar = c; bestPart = part; }
    }
  }
  _origin.copy(from).addScaledVector(_dir, best);
  if (bestChar) return { kind: bestPart, point: _origin.clone(), dist: best, target: bestChar, dir: _dir.clone() };
  if (wallDist < Infinity) return { kind: 'wall', point: _origin.clone(), dist: wallDist, target: null, dir: _dir.clone() };
  return { kind: 'none', point: _origin.clone(), dist: best, target: null, dir: _dir.clone() };
}

const _e = { min: new THREE.Vector3(), max: new THREE.Vector3() };
function rayVsBox(origin, dir, box) {
  _e.min.set(box.minX, box.minY, box.minZ);
  _e.max.set(box.maxX, box.maxY, box.maxZ);
  let tmin = 0, tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis], d = dir[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < _e.min[axis] || o > _e.max[axis]) return null;
    } else {
      let t1 = (_e.min[axis] - o) / d, t2 = (_e.max[axis] - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/** Damage after range falloff, the head multiplier and the victim's armour. */
export function shotDamage(def, part, dist, victim) {
  const fall = dist <= def.range * 0.45 ? 1 : Math.max(def.falloff, 1 - (dist - def.range * 0.45) / def.range);
  let dmg = def.damage * fall * (part === 'head' ? def.headMult : 1);
  if (victim.armor > 0) dmg *= part === 'head' ? 0.75 : 0.5;
  return Math.round(dmg);
}

/** A thrown grenade: gravity arc, two bounces, then it settles and its fuse runs. */
export class Grenade {
  constructor(kind, from, dir, power) {
    this.kind = kind; // 'frag' | 'smoke'
    this.pos = from.clone();
    this.vel = dir.clone().multiplyScalar(power);
    this.vel.y += 3.2;
    this.fuse = kind === 'frag' ? 1.5 : 1.1;
    this.settled = false;
    this.dead = false;
    this.bounced = false;
  }
  step(dt) {
    if (this.dead) return;
    if (!this.settled) {
      this.vel.y -= 16 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= 0.25) {
        this.pos.y = 0.25;
        if (Math.abs(this.vel.y) > 2 && !this.bounced) {
          this.vel.y *= -0.35; this.vel.x *= 0.6; this.vel.z *= 0.6;
          this.bounced = true;
        } else { this.settled = true; this.vel.set(0, 0, 0); }
      }
      // Walls stop a grenade dead (simple axis clamp against the yard bounds is enough at this size).
      this.pos.x = Math.max(-31.5, Math.min(31.5, this.pos.x));
      this.pos.z = Math.max(-23.5, Math.min(23.5, this.pos.z));
    }
    this.fuse -= dt;
    if (this.fuse <= 0) this.dead = true;
  }
}
