// game.js — the match: one state machine for rounds, the bomb, the economy and every combat
// resolution, shared by the player and the bots. Phases run buy (12 s, frozen) → live (100 s) →
// planted (40 s fuse) → end (5 s), first team to 9 rounds takes the match. All state lives here;
// the HUD only reads it, the renderer only draws it.

import * as THREE from 'three';
import { SITES, SPAWNS, losClear } from './map.js';
import { Character } from './character.js';
import { BotMind } from './bots.js';
import { WEAPONS, WeaponState, PRICES, fireHitscan, shotDamage, Grenade } from './weapons.js';

export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const BOMB_TIME = 40;
export const WIN_SCORE = 9;

const ATK_NAMES = ['Raka', 'Bimo', 'Sinta', 'Dewa'];
const DEF_NAMES = ['Vex', 'Marlow', 'Ines', 'Kato', 'Rue'];
const ATK_ROUTES = {
  A: [['s_gate', 's_west', 'w_lane1', 'w_lane2', 'w_lane3', 'w_door', 'a_site'],
      ['s_gate', 'mid_s', 'mid', 'cross_w', 'a_door', 'a_site']],
  B: [['s_gate', 's_east', 'e_lane1', 'e_lane2', 'e_lane3', 'e_door', 'b_site'],
      ['s_gate', 'mid_s', 'mid', 'cross_e', 'b_door', 'b_site']],
};

export class Game {
  constructor(scene, mats, sounds, { demo = false } = {}) {
    this.scene = scene;
    this.mats = mats;
    this.sounds = sounds;
    this.demo = demo;
    this.time = 0;
    this.phase = 'buy';
    this.phaseT = BUY_TIME;
    this.round = 0;
    this.scoreAtk = 0;
    this.scoreDef = 0;
    this.lossStreak = { atk: 0, def: 0 };
    this.events = [];
    this.noise = []; // { x, z, at } gunfire and explosions, for bot hearing
    this.smokes = []; // { pos, r, until, mesh }
    this.grenades = []; // { g: Grenade, mesh }
    this.bomb = { state: 'carried', carrier: null, pos: new THREE.Vector3(), site: null, timer: 0 };
    this.plantChannel = 0;
    this.plantingChar = null;
    this.defuseChannel = 0;
    this.beepT = 0;
    this.matchWinner = null;

    this.characters = [];
    this.player = new Character('atk', 'You', mats, true);
    this.characters.push(this.player);
    this.minds = new Map();
    ATK_NAMES.forEach((n, i) => {
      const c = new Character('atk', n, mats);
      this.characters.push(c);
      this.minds.set(c, new BotMind(c, 0.9 + i * 0.06));
    });
    DEF_NAMES.forEach((n, i) => {
      const c = new Character('def', n, mats);
      this.characters.push(c);
      this.minds.set(c, new BotMind(c, 0.92 + i * 0.05));
    });
    if (demo) this.minds.set(this.player, new BotMind(this.player, 1));
    for (const c of this.characters) scene.add(c.mesh);

    this.bombMesh = this.buildBombMesh();
    scene.add(this.bombMesh);
    this.effects = new Effects(scene);
  }

  buildBombMesh() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.3), this.mats.dark);
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), this.mats.accent);
    cell.position.y = 0.14;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    lamp.position.set(0.12, 0.22, 0);
    g.add(box, cell, lamp);
    this.bombLamp = lamp;
    g.visible = false;
    return g;
  }

  // ---------- match and round flow ----------

  startMatch() {
    this.scoreAtk = 0; this.scoreDef = 0;
    this.round = 0;
    this.lossStreak = { atk: 0, def: 0 };
    this.matchWinner = null;
    for (const c of this.characters) { c.money = 800; c.kills = 0; c.deaths = 0; c.resetLoadout(); }
    this.startRound();
  }

  startRound() {
    this.round++;
    this.clearField();
    const atkSpawns = SPAWNS.atk, defSpawns = SPAWNS.def;
    let ai = 0, di = 0;
    for (const c of this.characters) {
      if (!c.alive && c.deaths > 0) c.resetLoadout();
      if (c.team === 'atk') { const [x, z] = atkSpawns[ai++ % atkSpawns.length]; c.spawnAt(x, z, 0); }
      else { const [x, z] = defSpawns[di++ % defSpawns.length]; c.spawnAt(x, z, Math.PI); }
      c.mesh.visible = !c.isHuman;
    }
    // The charge: the human carries it when there is one, else a random Caster bot.
    const carrier = !this.demo && this.player.alive ? this.player
      : this.randomOf(this.characters.filter((c) => c.team === 'atk'));
    this.bomb.state = 'carried';
    this.bomb.carrier = carrier;
    this.bomb.site = null;
    this.bomb.timer = 0;
    carrier.hasBomb = true;
    this.assignPlans();
    for (const c of this.characters) if (!c.isHuman || this.demo) this.botBuy(c);
    this.phase = 'buy';
    this.phaseT = BUY_TIME;
    this.events.push({ type: 'round', round: this.round });
  }

  assignPlans() {
    const siteId = Math.random() < 0.52 ? 'A' : 'B';
    const routes = ATK_ROUTES[siteId];
    let ri = 0;
    for (const c of this.characters) {
      const mind = this.minds.get(c);
      if (!mind) continue;
      if (c.team === 'atk') {
        mind.setPlan({ route: routes[ri++ % routes.length].slice(), role: 'push', holdNode: siteId === 'A' ? 'a_hold2' : 'b_hold2' });
      }
    }
    const defHolds = [
      { route: ['a_door'], role: 'hold', holdNode: 'a_hold1' },
      { route: ['a_door'], role: 'hold', holdNode: 'a_hold2' },
      { route: ['b_door'], role: 'hold', holdNode: 'b_hold1' },
      { route: ['b_door'], role: 'hold', holdNode: 'b_hold2' },
      { route: ['mid_n'], role: 'hold', holdNode: 'mid_n' },
    ];
    let hi = 0;
    for (const c of this.characters) {
      const mind = this.minds.get(c);
      if (!mind || c.team !== 'def') continue;
      const plan = defHolds[hi++ % defHolds.length];
      // Defenders start near their holds already: route from their nearest node.
      mind.setPlan({ route: plan.route.slice(), role: 'hold', holdNode: plan.holdNode });
    }
    this.targetSite = SITES.find((s) => s.id === siteId);
  }

  botBuy(c) {
    // A simple, honest policy: rifle if rich, SMG if not, armour and a grenade with what's left.
    if (!c.weapons.primary && c.money >= PRICES.rifle) this.applyBuy(c, 'rifle');
    else if (!c.weapons.primary && c.money >= PRICES.smg) this.applyBuy(c, 'smg');
    if (c.armor === 0 && c.money >= PRICES.armor) this.applyBuy(c, 'armor');
    if (c.frags === 0 && c.money >= 900) this.applyBuy(c, 'frag');
    if (c.smokes === 0 && c.money >= 1100) this.applyBuy(c, 'smoke');
  }

  /** Shared purchase logic for the player's menu and the bots' policy. Returns success. */
  applyBuy(c, item) {
    const price = PRICES[item];
    if (price === undefined || c.money < price) return false;
    if (item === 'armor') { if (c.armor > 0) return false; c.armor = 100; }
    else if (item === 'frag') { if (c.frags >= 2) return false; c.frags++; }
    else if (item === 'smoke') { if (c.smokes >= 1) return false; c.smokes++; }
    else if (item === 'ammo') {
      let used = false;
      for (const slot of ['primary', 'sidearm']) {
        const w = c.weapons[slot];
        if (w && w.reserve !== Infinity && w.reserve < w.def.reserve) { w.reserve = w.def.reserve; used = true; }
      }
      if (!used) return false;
    } else {
      const def = WEAPONS[item];
      if (c.weapons.primary && c.weapons.primary.def.id === item) return false;
      c.weapons.primary = new WeaponState(def);
      c.currentSlot = 'primary';
    }
    c.money -= price;
    return true;
  }

  clearField() {
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    for (const s of this.smokes) this.scene.remove(s.mesh);
    this.smokes = [];
    this.noise = [];
    this.plantChannel = 0; this.plantingChar = null;
    this.defuseChannel = 0;
    this.bombMesh.visible = false;
  }

  // ---------- the fixed step ----------

  step(dt, playerStep) {
    this.time += dt;
    this.phaseT -= dt;
    const canAct = this.phase === 'live' || this.phase === 'planted';

    if (this.phase === 'buy' && this.phaseT <= 0) { this.phase = 'live'; this.phaseT = ROUND_TIME; this.events.push({ type: 'phase', phase: 'live' }); }
    else if (this.phase === 'live' && this.phaseT <= 0) return this.endRound('def', 'Time expired — the charge was never planted');
    else if (this.phase === 'planted') {
      this.bomb.timer -= dt;
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = this.bomb.timer < 10 ? 0.25 : this.bomb.timer < 25 ? 0.5 : 1;
        if (!this.demo) this.sounds.beep(this.bomb.timer < 10);
        this.bombLamp.material.color.setHex(this.bombLamp.material.color.getHex() === 0xff4444 ? 0x661111 : 0xff4444);
      }
      if (this.bomb.timer <= 0) {
        this.effects.explosion(this.bomb.pos, this.scene);
        this.sounds.explosion();
        return this.endRound('atk', 'The charge detonated');
      }
    } else if (this.phase === 'end' && this.phaseT <= 0) {
      if (this.matchWinner) { this.startMatch(); return; }
      this.startRound();
      return;
    }

    // Fighters.
    if (playerStep) playerStep(dt, canAct);
    for (const [c, mind] of this.minds) mind.step(dt, this, canAct);
    for (const c of this.characters) c.weapon.step(dt);
    this.stepGrenades(dt);
    this.stepBombPickup();
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      if (this.time > this.smokes[i].until) { this.scene.remove(this.smokes[i].mesh); this.smokes.splice(i, 1); }
    }
    this.effects.step(dt);
    if (this.bomb.state === 'dropped') {
      this.bombMesh.visible = true;
      this.bombMesh.position.copy(this.bomb.pos).y = 0.12;
    } else if (this.bomb.state === 'planted') {
      this.bombMesh.visible = true;
      this.bombMesh.position.copy(this.bomb.pos).y = 0.12;
    } else this.bombMesh.visible = false;

    // Elimination check.
    if ((this.phase === 'live' || this.phase === 'planted')) {
      const atkAlive = this.aliveCount('atk'), defAlive = this.aliveCount('def');
      if (defAlive === 0) return this.endRound('atk', 'Wardens eliminated');
      if (atkAlive === 0 && this.phase === 'live') return this.endRound('def', 'Casters eliminated');
      if (atkAlive === 0 && this.phase === 'planted' && defAlive > 0) {
        // The charge is live: defenders must still defuse it. Nothing ends yet.
      }
    }
  }

  endRound(winner, reason) {
    const loser = winner === 'atk' ? 'def' : 'atk';
    if (winner === 'atk') this.scoreAtk++; else this.scoreDef++;
    this.lossStreak[winner] = 0;
    this.lossStreak[loser]++;
    const winPay = reason.includes('detonated') || reason.includes('defused') ? 3500 : 3000;
    const lossPay = Math.min(3400, 1400 + 500 * (this.lossStreak[loser] - 1));
    for (const c of this.characters) c.money += c.team === winner ? winPay : lossPay;
    if (this.scoreAtk >= WIN_SCORE) this.matchWinner = 'atk';
    if (this.scoreDef >= WIN_SCORE) this.matchWinner = 'def';
    this.phase = 'end';
    this.phaseT = 5;
    this.events.push({ type: 'roundEnd', winner, reason, matchWinner: this.matchWinner });
    if (!this.demo) { if ((winner === 'atk') === (this.player.team === 'atk')) this.sounds.roundWin(); else this.sounds.roundLose(); }
  }

  aliveCount(team) { return this.characters.filter((c) => c.team === team && c.alive).length; }
  randomOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  distanceTo(a, b) { return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); }

  // ---------- perception ----------

  canSee(observer, target) {
    const dist = this.distanceTo(observer, target);
    if (dist > 62) return false;
    if (dist > 5) {
      const fx = -Math.sin(observer.yaw), fz = -Math.cos(observer.yaw);
      const dx = (target.pos.x - observer.pos.x) / (dist || 1), dz = (target.pos.z - observer.pos.z) / (dist || 1);
      if (fx * dx + fz * dz < 0.34) return false; // outside a ~140° cone... tightened below by LOS
    }
    const eye = observer.eye(new THREE.Vector3());
    const chest = new THREE.Vector3(target.pos.x, target.pos.y + (target.crouching ? 0.8 : 1.15), target.pos.z);
    if (!losClear(eye, chest)) return false;
    // Smoke blinds: if the sight line passes through a cloud, nothing is seen.
    for (const s of this.smokes) {
      const mx = (eye.x + chest.x) / 2, my = (eye.y + chest.y) / 2, mz = (eye.z + chest.z) / 2;
      if (Math.hypot(mx - s.pos.x, my - 1.2, mz - s.pos.z) < s.r) return false;
    }
    return true;
  }

  recentNoise(pos, radius) {
    for (let i = this.noise.length - 1; i >= 0; i--) {
      const n = this.noise[i];
      if (this.time - n.at > 3) break;
      if (Math.hypot(n.x - pos.x, n.z - pos.z) < radius) return n;
    }
    return null;
  }

  // ---------- combat ----------

  aimDir(c, out) {
    const cp = Math.cos(c.pitch);
    return out.set(-cp * Math.sin(c.yaw), Math.sin(c.pitch), -cp * Math.cos(c.yaw));
  }

  tryFire(shooter) {
    if (this.phase !== 'live' && this.phase !== 'planted') return false;
    const w = shooter.weapon;
    if (w.reloading || w.cooldown > 0) return false;
    if (w.mag <= 0) {
      if (shooter.isHuman && !this.demo) this.sounds.dryFire();
      if (w.startReload()) this.onReloadStart(shooter);
      return false;
    }
    w.mag--;
    w.cooldown = 60 / w.def.rpm;
    w.recoilHeat = Math.min(1.4, w.recoilHeat + 0.34);
    const eye = shooter.eye(new THREE.Vector3());
    const aim = this.aimDir(shooter, new THREE.Vector3());
    const hit = fireHitscan(shooter, eye, aim, this.characters);
    const muzzle = eye.clone(); muzzle.y -= 0.12; muzzle.addScaledVector(aim, 0.55);
    this.effects.tracer(muzzle, hit.point, shooter.team);
    this.noise.push({ x: shooter.pos.x, z: shooter.pos.z, at: this.time });
    if (shooter.isHuman && !this.demo) this.sounds.shot(w.def.sound);
    else this.sounds.shot(w.def.sound);
    if (hit.target) {
      const dmg = shotDamage(w.def, hit.kind, hit.dist, hit.target);
      const died = hit.target.takeDamage(dmg);
      if (hit.target.isHuman && !this.demo) { this.sounds.hurt(); this.events.push({ type: 'hurt' }); }
      if (shooter.isHuman && !this.demo) {
        this.events.push({ type: 'hitmark', part: hit.kind });
        if (hit.kind === 'head') this.sounds.headshot(); else this.sounds.hit();
      }
      if (died) this.onKill(shooter, hit.target, w.def, hit.kind);
    } else if (hit.kind === 'wall') {
      this.effects.impact(hit.point);
    }
    if (shooter.isHuman && !this.demo) this.events.push({ type: 'playerFired' });
    return true;
  }

  onKill(killer, victim, def, part) {
    killer.kills++;
    killer.money += 300;
    if (victim.hasBomb) {
      victim.hasBomb = false;
      this.bomb.state = 'dropped';
      this.bomb.carrier = null;
      this.bomb.pos.copy(victim.pos);
    }
    this.events.push({ type: 'kill', killer, victim, weapon: def.name, part });
    victim.mesh.visible = true; // the body stays on the ground
  }

  onReloadStart(c) { if (c.isHuman && !this.demo) this.sounds.reloadStart(); }
  onWeaponSwitch() {}

  throwGrenade(shooter, kind, targetPos = null) {
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    if (kind === 'frag' && shooter.frags <= 0) return;
    if (kind === 'smoke' && shooter.smokes <= 0) return;
    if (kind === 'frag') shooter.frags--; else shooter.smokes--;
    const eye = shooter.eye(new THREE.Vector3());
    let dir;
    if (targetPos) {
      dir = new THREE.Vector3(targetPos.x - eye.x, 0.4, targetPos.z - eye.z).normalize();
    } else dir = this.aimDir(shooter, new THREE.Vector3());
    const g = new Grenade(kind, eye, dir, 13.5);
    g.thrownBy = shooter;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      kind === 'frag' ? this.mats.steel : this.mats.steelLight,
    );
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.grenades.push({ g, mesh });
  }

  stepGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const { g, mesh } = this.grenades[i];
      g.step(dt);
      mesh.position.copy(g.pos);
      if (!g.dead) continue;
      this.scene.remove(mesh);
      this.grenades.splice(i, 1);
      if (g.kind === 'frag') {
        this.effects.explosion(g.pos, this.scene, 0.55);
        this.sounds.explosion();
        this.noise.push({ x: g.pos.x, z: g.pos.z, at: this.time });
        for (const c of this.characters) {
          if (!c.alive) continue;
          const d = Math.hypot(c.pos.x - g.pos.x, c.pos.z - g.pos.z);
          if (d > 6.5) continue;
          const from = new THREE.Vector3(g.pos.x, 0.6, g.pos.z);
          const to = new THREE.Vector3(c.pos.x, c.pos.y + 0.9, c.pos.z);
          if (!losClear(from, to)) continue;
          const dmg = Math.round(92 * Math.max(0, 1 - d / 6.5));
          if (dmg > 0 && c.takeDamage(dmg)) this.onKill(g.thrownBy || c, c, { name: 'Frag grenade' }, 'body');
        }
      } else {
        // Smoke: a low cloud of soft spheres that blinds the perception check for 12 s.
        const group = new THREE.Group();
        const sm = new THREE.MeshStandardMaterial({ color: 0x9a938c, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
        for (let k = 0; k < 7; k++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(1.5 + Math.random() * 1.1, 10, 10), sm);
          s.position.set((Math.random() - 0.5) * 3.4, 0.9 + Math.random() * 0.9, (Math.random() - 0.5) * 3.4);
          group.add(s);
        }
        group.position.copy(g.pos);
        this.scene.add(group);
        this.smokes.push({ pos: g.pos.clone(), r: 3.6, until: this.time + 12, mesh: group });
      }
    }
  }

  // ---------- the charge ----------

  interact(c, dt) {
    // The human plants by holding E inside a site with the charge.
    if (!c.hasBomb || this.phase !== 'live') { this.plantChannel = 0; return; }
    const site = SITES.find((s) => Math.hypot(s.x - c.pos.x, s.z - c.pos.z) < s.r);
    if (!site) { this.plantChannel = 0; return; }
    this.plantingChar = c;
    this.plantChannel += dt;
    if (this.plantChannel >= 3) this.plantBomb(c, site);
  }

  botPlant(mind) {
    const c = mind.c;
    if (!c.hasBomb || this.phase !== 'live') return;
    const site = SITES.find((s) => Math.hypot(s.x - c.pos.x, s.z - c.pos.z) < s.r);
    if (!site) return;
    this.plantingChar = c;
    this.plantChannel += 1 / 60;
    if (this.plantChannel >= 3) this.plantBomb(c, site);
  }

  plantBomb(c, site) {
    c.hasBomb = false;
    this.bomb.state = 'planted';
    this.bomb.carrier = null;
    this.bomb.site = site;
    this.bomb.pos.set(c.pos.x, 0, c.pos.z);
    this.bomb.timer = BOMB_TIME;
    this.phase = 'planted';
    this.phaseT = BOMB_TIME;
    this.plantChannel = 0;
    c.money += 300;
    this.events.push({ type: 'planted', site });
    if (!this.demo) this.sounds.plantDone();
  }

  botDefuse(mind, dt) {
    if (this.phase !== 'planted') return;
    this.defuseChannel += dt;
    if (this.defuseChannel >= 5) {
      this.defuseChannel = 0;
      this.endRound('def', 'The charge was defused');
    }
  }

  stepBombPickup() {
    if (this.bomb.state !== 'dropped') return;
    for (const c of this.characters) {
      if (c.team !== 'atk' || !c.alive) continue;
      if (Math.hypot(c.pos.x - this.bomb.pos.x, c.pos.z - this.bomb.pos.z) < 1.3) {
        this.bomb.state = 'carried';
        this.bomb.carrier = c;
        c.hasBomb = true;
        // A bot who picks it up heads for the nearest site.
        const mind = this.minds.get(c);
        if (mind) {
          const site = this.bomb.pos.x < 0 ? 'A' : 'B';
          mind.setPlan({ route: ATK_ROUTES[site][0].slice(), role: 'push', holdNode: site === 'A' ? 'a_hold2' : 'b_hold2' });
          mind.routeIndex = 0;
        }
        break;
      }
    }
  }
}

/** Tracers, impact puffs and explosion flashes, all pooled and reused. */
class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.puffs = [];
    this.flashes = [];
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 });
      const line = new THREE.Line(tracerGeo.clone(), mat);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    const puffGeo = new THREE.OctahedronGeometry(0.09);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xd8c9a8, transparent: true, opacity: 0 }));
      m.visible = false;
      scene.add(m);
      this.puffs.push({ mesh: m, life: 0 });
    }
  }

  tracer(from, to, team) {
    const t = this.tracers.find((x) => x.life <= 0);
    if (!t) return;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(team === 'atk' ? 0xffc37a : 0x9fe8dc);
    t.line.material.opacity = 0.85;
    t.line.visible = true;
    t.life = 0.055;
  }

  impact(point) {
    const p = this.puffs.find((x) => x.life <= 0);
    if (!p) return;
    p.mesh.position.copy(point);
    p.mesh.material.opacity = 0.9;
    p.mesh.visible = true;
    p.life = 0.22;
  }

  explosion(pos, scene, scale = 1) {
    const light = new THREE.PointLight(0xffa050, 60 * scale, 18 * scale, 1.6);
    light.position.set(pos.x, 1.4, pos.z);
    scene.add(light);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 * scale, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.9 }),
    );
    ball.position.set(pos.x, 0.9, pos.z);
    scene.add(ball);
    this.flashes.push({ light, ball, life: 0.45, scale });
  }

  step(dt) {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.055) * 0.85;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.mesh.material.opacity = Math.max(0, p.life / 0.22) * 0.9;
      p.mesh.scale.setScalar(1 + (0.22 - p.life) * 5);
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const k = Math.max(0, f.life / 0.45);
      f.ball.scale.setScalar(1 + (1 - k) * 5 * f.scale);
      f.ball.material.opacity = k * 0.9;
      f.light.intensity = 60 * f.scale * k;
      if (f.life <= 0) {
        this.scene.remove(f.light); this.scene.remove(f.ball);
        this.flashes.splice(i, 1);
      }
    }
  }
}
