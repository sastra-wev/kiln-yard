// player.js — the human behind one Character: mouse look, WASD movement, firing, reloading,
// weapon and grenade keys, the interact hold, and the first-person view model (the gun you see).
// It turns input into intents and lets game.js resolve them, so the player and the bots are
// judged by exactly the same rules.

import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const SENS = 0.0022;

export class PlayerController {
  constructor(character, camera, mats) {
    this.c = character;
    this.camera = camera;
    this.bobPhase = 0;
    this.interactHeld = false;
    this.viewModel = this.buildViewModel(mats);
    this.muzzleFlash = null;
    camera.add(this.viewModel);
    this.flashLight = new THREE.PointLight(0xffc37a, 0, 9, 1.8);
    camera.add(this.flashLight);
    this.flashLight.position.set(0.25, -0.15, -1.1);
  }

  buildViewModel(mats) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.62), mats.dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), mats.steelLight);
    barrel.position.set(0, 0.05, -0.48);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.1), mats.woodDark);
    grip.position.set(0, -0.16, 0.08);
    grip.rotation.x = 0.35;
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false }),
    );
    flash.position.set(0, 0.05, -0.72);
    g.add(body, barrel, grip, flash);
    g.position.set(0.26, -0.24, -0.55);
    this.muzzleFlash = flash;
    return g;
  }

  /**
   * One fixed step of human control. `game` resolves fire/grenade/interact intents.
   * Frozen phases pass canAct=false: you may look around but not move or shoot.
   */
  step(dt, input, game, canAct) {
    const c = this.c;
    if (!c.alive) return;
    const look = input.takeLook();
    c.yaw -= look.dx * SENS;
    c.pitch -= look.dy * SENS;
    c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch));

    const pressed = input.consumePressed();
    c.crouching = input.down('ControlLeft') || input.down('KeyC');
    const walking = input.down('ShiftLeft');
    this.interactHeld = input.down('KeyE');

    let wx = 0, wz = 0;
    if (canAct) {
      const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      const r = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      const sin = Math.sin(c.yaw), cos = Math.cos(c.yaw);
      wx = -sin * f + cos * r;
      wz = -cos * f - sin * r;
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
    }
    const def = c.weapon.def;
    let maxSpeed = def.speed;
    if (c.crouching) maxSpeed *= 0.45;
    else if (walking) maxSpeed *= 0.52;
    if (c.scoped) maxSpeed *= 0.4;
    c.move(dt, { x: wx, z: wz }, canAct ? maxSpeed : 0, canAct && input.down('Space'));

    // Scoping: right mouse with the Longshot.
    c.scoped = !!(def.scope && input.mouseDownRight && !c.weapon.reloading);
    this.camera.fov = c.scoped ? 22 : 78;
    this.camera.updateProjectionMatrix();

    if (!canAct) return;

    if (game.phase !== 'buy' && pressed.has('Digit1') && c.weapons.primary) { c.currentSlot = 'primary'; game.onWeaponSwitch(c); }
    if (game.phase !== 'buy' && pressed.has('Digit2')) { c.currentSlot = 'sidearm'; game.onWeaponSwitch(c); }
    if (pressed.has('KeyR') && c.weapon.startReload()) game.onReloadStart(c);
    if (pressed.has('Digit4') && c.frags > 0) game.throwGrenade(c, 'frag');
    if (pressed.has('Digit5') && c.smokes > 0) game.throwGrenade(c, 'smoke');

    const wantFire = def.auto ? input.firing : (input.firing && !this.wasFiring);
    this.wasFiring = input.firing;
    if (wantFire) game.tryFire(c);
    if (this.interactHeld) game.interact(c, dt);
  }

  /** Per-frame: put the camera at the eyes, work the view model's bob, sway and recoil. */
  syncView(dt) {
    const c = this.c;
    const eyeY = c.pos.y + c.eyeHeight;
    this.camera.position.set(c.pos.x, eyeY, c.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = c.yaw;
    this.camera.rotation.x = c.pitch + c.weapon.recoilHeat * 0.012;
    this.camera.rotation.z = 0;
    const speed = c.speedNow;
    this.bobPhase += dt * (2 + speed * 1.6);
    const bob = Math.min(1, speed / 4) * 0.016;
    this.viewModel.position.y = -0.24 + Math.sin(this.bobPhase * 2) * bob - (c.weapon.reloading ? 0.13 : 0);
    this.viewModel.position.x = 0.26 + Math.sin(this.bobPhase) * bob * 0.6;
    this.viewModel.rotation.x = (c.weapon.reloading ? 0.7 : 0) - c.weapon.recoilHeat * 0.06;
    this.viewModel.visible = c.alive && !c.scoped;
    const flashT = Math.max(0, (this.flashUntil || 0) - performance.now()) / 70;
    this.muzzleFlash.material.opacity = flashT * 0.95;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    this.flashLight.intensity = flashT * 14;
  }

  showMuzzleFlash() { this.flashUntil = performance.now() + 70; }
}
