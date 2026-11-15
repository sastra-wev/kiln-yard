// palette.js — the game's one look: a brick foundry yard at dusk. Every material and light in the
// game comes from here, so the scene reads as one place: warm brick and sand under a low orange
// sun, charcoal steel, and the two team colours (Casters amber, Wardens teal) worn on vests and
// used for site paint, tracers and flashes.

import * as THREE from 'three';

export const COLORS = {
  sky: 0x3a241a,
  fog: 0x453025,
  sun: 0xffc38a,
  hemiSky: 0x8a6a58,
  hemiGround: 0x33241a,
  ground: 0x77644e,
  groundDark: 0x63523e,
  brick: 0x99573d,
  brickDark: 0x7c4430,
  plaster: 0xbb9a68,
  steel: 0x454b54,
  steelLight: 0x6a7076,
  wood: 0x84683f,
  woodDark: 0x66502f,
  coal: 0x232120,
  accent: 0xe8a33d,
  ally: 0x3fb8a6,
  siteA: 0xe8a33d,
  siteB: 0x3fb8a6,
  uniformAtk: 0x4a4038,
  uniformDef: 0x37424a,
  skin: 0xc9a186,
};

/** Shared materials, built once and reused by every mesh (no per-object allocation at load). */
export function buildMaterials() {
  const flat = (color, rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
  return {
    ground: flat(COLORS.ground, 1),
    groundDark: flat(COLORS.groundDark, 1),
    brick: flat(COLORS.brick),
    brickDark: flat(COLORS.brickDark),
    plaster: flat(COLORS.plaster),
    steel: flat(COLORS.steel, 0.6),
    steelLight: flat(COLORS.steelLight, 0.55),
    wood: flat(COLORS.wood),
    woodDark: flat(COLORS.woodDark),
    coal: flat(COLORS.coal, 1),
    accent: flat(COLORS.accent, 0.7),
    uniformAtk: flat(COLORS.uniformAtk),
    uniformDef: flat(COLORS.uniformDef),
    vestAtk: flat(COLORS.accent, 0.8),
    vestDef: flat(COLORS.ally, 0.8),
    skin: flat(COLORS.skin, 0.8),
    dark: flat(0x1c1a19, 0.9),
  };
}

/** The dusk light rig: one shadow-casting sun, one hemisphere fill. */
export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.7);
  sun.position.set(-28, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 36; sun.shadow.camera.bottom = -36;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.fog = new THREE.Fog(COLORS.fog, 70, 175);
  scene.background = new THREE.Color(COLORS.sky);
  return { hemi, sun };
}
