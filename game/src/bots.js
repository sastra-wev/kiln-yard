// bots.js — the nine AI fighters. Each bot runs the same loop a player does: perceive, decide,
// move, shoot — through the same Character physics and the same gunplay model, so a bot that
// fires on the move sprays just like a player would. Perception is a vision cone plus line of
// sight plus hearing: gunfire is a noise event on the game, and a bot that hears a shot turns
// toward it. Plans come from game.js each round (push a site, hold a site, retake); inside a
// plan the bot picks its own next node on the map's waypoint graph.

import { NODES, nearestNode, nextHop } from './map.js';

const TURN_RATE = 3.4; // rad/s while navigating
const AIM_RATE = 6.5; // rad/s while engaging

function yawToward(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class BotMind {
  constructor(character, skill = 1) {
    this.c = character;
    this.skill = skill; // reaction/aim multiplier; varied per bot so fights are not metronomes
    this.plan = { route: [], role: 'hold', holdNode: null };
    this.routeIndex = 0;
    this.state = 'advance';
    this.perceiveT = Math.random() * 0.12;
    this.visible = null;
    this.lastSeen = null; // { x, z, at }
    this.seenFor = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.aimPitch = 0;
    this.stuckT = 0;
    this.lastX = 0; this.lastZ = 0;
    this.scanYaw = character.yaw;
    this.scanT = 0;
    this.threwSmoke = false;
  }

  setPlan(plan) {
    this.plan = plan;
    this.routeIndex = 0;
    this.state = plan.role === 'hold' ? 'hold' : 'advance';
    this.lastSeen = null;
    this.visible = null;
    this.threwSmoke = false;
  }

  step(dt, game, canAct) {
    const c = this.c;
    if (!c.alive) return;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.12;
      this.perceive(game);
    }
    if (!canAct) { c.move(dt, { x: 0, z: 0 }, 0, false); return; }

    const now = game.time;
    // State selection, most urgent first.
    if (this.visible) this.state = 'engage';
    else if (this.state === 'engage') this.state = this.lastSeen && now - this.lastSeen.at < 4 ? 'seek' : this.plan.role === 'hold' ? 'hold' : 'advance';

    if (game.phase === 'planted') {
      if (c.team === 'def') this.state = this.visible ? 'engage' : 'retake';
      else if (this.state !== 'engage') this.state = 'holdsite';
    }

    switch (this.state) {
      case 'engage': this.doEngage(dt, game); break;
      case 'seek': this.moveToward(dt, this.lastSeen, game, true); break;
      case 'retake': this.doRetake(dt, game); break;
      case 'holdsite': this.doHoldSite(dt, game); break;
      case 'hold': this.doHold(dt, game); break;
      default: this.doAdvance(dt, game);
    }
  }

  perceive(game) {
    const c = this.c;
    let best = null, bestDist = Infinity;
    for (const e of game.characters) {
      if (e.team === c.team || !e.alive) continue;
      const d = game.distanceTo(c, e);
      if (d > 62) continue;
      if (!game.canSee(c, e)) continue;
      if (d < bestDist) { bestDist = d; best = e; }
    }
    if (best) {
      if (this.visible !== best) this.seenFor = 0;
      this.visible = best;
      this.lastSeen = { x: best.pos.x, z: best.pos.z, at: game.time };
    } else {
      this.visible = null;
      // Hearing: a recent shot near enough turns the bot toward the noise.
      const noise = game.recentNoise(c.pos, 26);
      if (noise && (!this.lastSeen || game.time - this.lastSeen.at > 2.5)) {
        this.lastSeen = { x: noise.x, z: noise.z, at: game.time };
        if (this.state === 'hold') this.scanYaw = yawToward(c.pos, noise);
      }
    }
  }

  doEngage(dt, game) {
    const c = this.c, e = this.visible;
    this.seenFor += dt;
    // Aim at the chest, drifting to the head as the bot settles; turn fast, fire in bursts, and
    // stand still while firing — the spread model rewards it exactly as it rewards the player.
    const settle = Math.min(1, this.seenFor / 0.7);
    const aimY = e.pos.y + (e.crouching ? 0.85 : 1.12) + settle * 0.32;
    const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(aimY - (c.pos.y + c.eyeHeight), dist);
    c.yaw += Math.max(-AIM_RATE * dt, Math.min(AIM_RATE * dt, angDiff(wantYaw, c.yaw)));
    this.aimPitch += Math.max(-AIM_RATE * dt, Math.min(AIM_RATE * dt, angDiff(wantPitch, this.aimPitch)));
    c.pitch = this.aimPitch + (Math.random() - 0.5) * 0.012 * (1.4 - settle) / this.skill;
    c.yaw += (Math.random() - 0.5) * 0.01 * (1.4 - settle) / this.skill;
    c.crouching = dist > 16 && settle > 0.5;
    c.move(dt, { x: 0, z: 0 }, 0, false);
    // Fire control: reaction delay, then bursts of 3–5 with a thinking pause between.
    if (this.seenFor < 0.32 / this.skill) return;
    if (c.weapon.reloading) return;
    if (c.weapon.mag === 0) { if (c.weapon.startReload()) game.onReloadStart(c); return; }
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (this.burstLeft <= 0) this.burstLeft = 3 + Math.floor(Math.random() * 3);
    if (game.tryFire(c)) {
      this.burstLeft--;
      if (this.burstLeft <= 0) this.burstPause = 0.34 + Math.random() * 0.3;
    }
    if (c.weapon.mag <= 4 && Math.random() < 0.3) { if (c.weapon.startReload()) game.onReloadStart(c); }
  }

  doAdvance(dt, game) {
    const c = this.c;
    const route = this.plan.route;
    if (this.routeIndex >= route.length) {
      // Arrived: the carrier plants; everyone else takes a hold posture near the site.
      if (c.hasBomb) { game.botPlant(this); return; }
      this.state = 'hold';
      this.doHold(dt, game);
      return;
    }
    const nodeId = route[this.routeIndex];
    const [nx, nz] = NODES[nodeId];
    if (Math.hypot(nx - c.pos.x, nz - c.pos.z) < 1.6) { this.routeIndex++; return; }
    // One graph hop at a time from wherever the bot actually is.
    const here = nearestNode(c.pos.x, c.pos.z);
    const hop = here === nodeId ? nodeId : nextHop(here, nodeId);
    const [hx, hz] = NODES[hop];
    this.moveToward(dt, { x: hx, z: hz }, game, false);
    // A smoke across mid covers the crossing, once a round.
    if (!this.threwSmoke && c.smokes > 0 && Math.abs(c.pos.z) < 9 && Math.abs(c.pos.x) < 9) {
      this.threwSmoke = true;
      game.throwGrenade(c, 'smoke', { x: c.pos.x * 0.4, z: -6 });
    }
  }

  doHold(dt, game) {
    const c = this.c;
    const holdId = this.plan.holdNode;
    if (holdId && NODES[holdId]) {
      const [hx, hz] = NODES[holdId];
      const dist = Math.hypot(hx - c.pos.x, hz - c.pos.z);
      if (dist > 6) {
        // Far away: walk the graph, not a straight line through walls.
        const hop = nextHop(nearestNode(c.pos.x, c.pos.z), holdId);
        const [px, pz] = NODES[hop];
        this.moveToward(dt, { x: px, z: pz }, game, false);
        return;
      }
      if (dist > 1.8) { this.moveToward(dt, { x: hx, z: hz }, game, false); return; }
    }
    // Settled: crouch behind the angle, scan slowly across the approach.
    c.crouching = true;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1.6 + Math.random() * 1.6; this.scanYaw = c.yaw + (Math.random() - 0.5) * 1.5; }
    c.yaw += Math.max(-1.1 * dt, Math.min(1.1 * dt, angDiff(this.scanYaw, c.yaw)));
    c.pitch = 0;
    c.move(dt, { x: 0, z: 0 }, 0, false);
    if (c.weapon.mag < c.weapon.def.mag * 0.5 && c.weapon.startReload()) game.onReloadStart(c);
  }

  doHoldSite(dt, game) {
    // Attackers after the plant: stay near the charge, watch the doors.
    const c = this.c;
    const bomb = game.bomb;
    const d = Math.hypot(bomb.pos.x - c.pos.x, bomb.pos.z - c.pos.z);
    if (d > 9) { this.moveToward(dt, bomb.pos, game, false); return; }
    this.doHold(dt, game);
  }

  doRetake(dt, game) {
    // Defenders after the plant: get to the charge; the nearest one defuses.
    const c = this.c;
    const bomb = game.bomb;
    const d = Math.hypot(bomb.pos.x - c.pos.x, bomb.pos.z - c.pos.z);
    if (d > 1.4) { this.moveToward(dt, bomb.pos, game, true); return; }
    c.move(dt, { x: 0, z: 0 }, 0, false);
    c.yaw = yawToward(c.pos, bomb.pos);
    game.botDefuse(this, dt);
  }

  moveToward(dt, target, game, cautious) {
    const c = this.c;
    const dx = target.x - c.pos.x, dz = target.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantYaw = Math.atan2(-dx, -dz);
    c.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, angDiff(wantYaw, c.yaw)));
    c.pitch = 0;
    c.crouching = false;
    const facing = Math.abs(angDiff(wantYaw, c.yaw)) < 0.5;
    const speed = c.weapon.def.speed * (cautious && dist < 6 ? 0.55 : 1);
    const wish = facing ? { x: -Math.sin(c.yaw), z: -Math.cos(c.yaw) } : { x: 0, z: 0 };
    c.move(dt, wish, speed, false);
    // Stuck detection: if we are barely moving while trying, sidestep for a moment.
    const moved = Math.hypot(c.pos.x - this.lastX, c.pos.z - this.lastZ);
    if (facing && moved < dt * 0.4) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) {
        c.yaw += 0.9;
        this.stuckT = 0;
      }
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    this.lastX = c.pos.x; this.lastZ = c.pos.z;
  }
}
