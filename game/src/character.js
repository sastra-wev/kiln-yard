// character.js — one fighter, human or bot: body, hitboxes, health and armour, movement physics
// and the mesh the others see. Movement is the shared tactical model: ground acceleration with
// friction (you stop fast, which is why stopping to shoot works), a slower crouch that steadies
// the gun, a jump that ruins accuracy, and circle-versus-box collision against the map.

import * as THREE from 'three';
import { resolveCollision } from './map.js';
import { WeaponState, WEAPONS } from './weapons.js';

const RADIUS = 0.35;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.16;

const bodyGeo = new THREE.BoxGeometry(0.58, 0.78, 0.34);
const legsGeo = new THREE.BoxGeometry(0.52, 0.62, 0.3);
const headGeo = new THREE.BoxGeometry(0.3, 0.32, 0.3);
const gunGeo = new THREE.BoxGeometry(0.09, 0.16, 0.78);
const armGeo = new THREE.BoxGeometry(0.13, 0.13, 0.5);

let nextId = 1;

export class Character {
  constructor(team, name, mats, isHuman = false) {
    this.id = nextId++;
    this.team = team; // 'atk' (Casters) or 'def' (Wardens)
    this.name = name;
    this.isHuman = isHuman;
    this.pos = new THREE.Vector3(0, 0, 0); // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.crouching = false;
    this.grounded = true;
    this.scoped = false;
    this.alive = true;
    this.health = 100;
    this.armor = 0;
    this.money = 800;
    this.kills = 0; this.deaths = 0;
    this.weapons = { sidearm: new WeaponState(WEAPONS.pistol), primary: null };
    this.currentSlot = 'sidearm';
    this.frags = 0; this.smokes = 0;
    this.hasBomb = false;
    this.speedTarget = new THREE.Vector3(); // scratch for movement
    this.bodyBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    this.headBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    this.mesh = this.buildMesh(mats);
    this.flashUntil = 0;
  }

  get weapon() { return this.weapons[this.currentSlot] || this.weapons.sidearm; }
  get eyeHeight() { return this.crouching ? EYE_CROUCH : EYE_STAND; }
  eye(out) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  get speedNow() { return Math.hypot(this.vel.x, this.vel.z); }

  buildMesh(mats) {
    const g = new THREE.Group();
    const uniform = this.team === 'atk' ? mats.uniformAtk : mats.uniformDef;
    const vest = this.team === 'atk' ? mats.vestAtk : mats.vestDef;
    const legs = new THREE.Mesh(legsGeo, mats.dark);
    legs.position.y = 0.31;
    const body = new THREE.Mesh(bodyGeo, uniform);
    body.position.y = 1.01;
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.38), vest);
    vestMesh.position.y = 1.06;
    const head = new THREE.Mesh(headGeo, mats.skin);
    head.position.y = 1.56;
    const gun = new THREE.Mesh(gunGeo, mats.dark);
    gun.position.set(0.18, 1.32, -0.42);
    const arm = new THREE.Mesh(armGeo, uniform);
    arm.position.set(0.18, 1.3, -0.2);
    for (const m of [legs, body, vestMesh, head, gun, arm]) { m.castShadow = true; g.add(m); }
    this.parts = { legs, body, head, gun };
    g.visible = false;
    return g;
  }

  /** Place at a spawn point, alive and reset for a new round (loadout and money are kept). */
  spawnAt(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouching = false;
    this.scoped = false;
    this.hasBomb = false;
    this.mesh.visible = !this.isHuman;
    this.syncMesh(0);
    this.updateHitboxes();
  }

  /**
   * Move one fixed step. wishDir is a unit vector on the ground plane (or zero), maxSpeed the
   * cap for the current weapon and stance, jump/crouch flags already resolved by the caller.
   */
  move(dt, wishDir, maxSpeed, wantJump) {
    const friction = this.grounded ? 9 : 0.4;
    const accel = this.grounded ? 42 : 6;
    // Friction first (source-engine style): bleed speed, then accelerate toward the wish.
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && speed > 0) {
      const drop = speed * friction * dt;
      const scale = Math.max(0, speed - drop) / speed;
      this.vel.x *= scale; this.vel.z *= scale;
    }
    const wishSpeed = Math.min(maxSpeed, maxSpeed); // cap for this stance/weapon
    const cur = this.vel.x * wishDir.x + this.vel.z * wishDir.z;
    const add = Math.min(accel * dt * wishSpeed, wishSpeed - cur);
    if (add > 0) { this.vel.x += wishDir.x * add; this.vel.z += wishDir.z * add; }
    if (wantJump && this.grounded) { this.vel.y = 7.4; this.grounded = false; }
    this.vel.y -= 24 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    const [cx, cz] = resolveCollision(this.pos.x, this.pos.z, RADIUS);
    this.pos.x = cx; this.pos.z = cz;
    this.pos.x = Math.max(-31.4, Math.min(31.4, this.pos.x));
    this.pos.z = Math.max(-23.4, Math.min(23.4, this.pos.z));
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.grounded = true; }
    this.updateHitboxes();
  }

  updateHitboxes() {
    const { x, y, z } = this.pos;
    const topBody = y + (this.crouching ? 1.04 : 1.4);
    this.bodyBox.minX = x - 0.33; this.bodyBox.maxX = x + 0.33;
    this.bodyBox.minZ = z - 0.33; this.bodyBox.maxZ = z + 0.33;
    this.bodyBox.minY = y; this.bodyBox.maxY = topBody;
    const headY = y + (this.crouching ? 1.06 : 1.42);
    this.headBox.minX = x - 0.2; this.headBox.maxX = x + 0.2;
    this.headBox.minZ = z - 0.2; this.headBox.maxZ = z + 0.2;
    this.headBox.minY = headY; this.headBox.maxY = headY + 0.36;
  }

  /** Copy the simulation state into the mesh (called once per render frame, not per step). */
  syncMesh() {
    if (this.isHuman) return;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const crouchScale = this.crouching ? 0.78 : 1;
    this.mesh.scale.y = crouchScale;
    this.parts.gun.rotation.x = this.pitch;
    if (!this.alive) {
      this.mesh.rotation.z = Math.PI / 2 * 0.92;
      this.mesh.position.y = 0.25;
    } else {
      this.mesh.rotation.z = 0;
    }
  }

  /** Apply damage that has already been through the gunplay model. Returns true if it killed. */
  takeDamage(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deaths++;
      return true;
    }
    return false;
  }

  resetLoadout() {
    this.weapons = { sidearm: new WeaponState(WEAPONS.pistol), primary: null };
    this.currentSlot = 'sidearm';
    this.frags = 0; this.smokes = 0;
    this.armor = 0;
  }
}
