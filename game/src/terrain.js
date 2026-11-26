// terrain.js — the shape of Emberpass Valley. One height function is the
// single source of truth: the renderer samples it for the ground mesh, the
// flight model asks it for the ground under the wheels, and the scatter
// pass plants trees where it says the slope allows.

import { WORLD, PALETTE } from './config.js';
import { fbm2, makeRng, clamp, lerp } from './random.js';

const SEED = 20261126;

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// The river winds down the valley floor west of the strip.
export function riverCenterX(z) {
  return -460 + 190 * Math.sin(z * 0.00085) + 60 * Math.sin(z * 0.0021);
}

// Raw land height before the flats for the strip and the camp are pressed in.
function landHeight(x, z) {
  const ax = Math.abs(x);
  // Valley walls: gentle foothills, then the long climb to the ridges.
  let h = 640 * smoothstep(850, 3400, ax);
  h += 150 * smoothstep(2400, 4400, Math.abs(z) - 400) * smoothstep(300, 900, ax + 500);
  // Rolling detail on the walls and the floor alike.
  h += 64 * fbm2(x * 0.0011, z * 0.0011, SEED, 3) * smoothstep(60, 500, ax);
  h += 10 * fbm2(x * 0.006, z * 0.006, SEED + 7, 2);
  // The south end of the valley closes into a bowl; the north stays open
  // toward the pass, where the caldera cone stands east of the gap.
  h += 420 * smoothstep(2900, 4400, z);
  const dx = x - 2500, dz = z + 3700;
  const cone = Math.max(0, 1 - Math.hypot(dx, dz) / 1250);
  h += cone * cone * 560;
  return h;
}

// Ground height at any point, with the strip and camp flats and the river
// channel pressed into the land.
export function groundHeight(x, z) {
  let h = landHeight(x, z);
  // The strip flat: a generous apron so take-off and landing are honest.
  const stripFlat = Math.max(
    smoothstep(300, 130, Math.abs(x)),
    0,
  ) * smoothstep(1050, 620, Math.abs(z));
  h = lerp(h, WORLD.valleyFloor, clamp(stripFlat, 0, 1));
  // Ember Camp flat, a cleared shelf on the valley floor.
  const campD = Math.hypot(x - WORLD.camp.x, z - WORLD.camp.z);
  h = lerp(h, WORLD.valleyFloor + 2, smoothstep(300, 150, campD));
  // The river channel: carved below the floor, with soft banks.
  const riverD = Math.abs(x - riverCenterX(z));
  if (h < 90) {
    const carve = smoothstep(46, 16, riverD);
    h = lerp(h, -3.2, carve * smoothstep(120, 30, h));
  }
  return h;
}

export function isWater(x, z) {
  return groundHeight(x, z) < -1.2 && Math.abs(x - riverCenterX(z)) < 40;
}

// Is a point over the runway strip itself (for touchdown judging)?
export function isOnStrip(x, z) {
  return Math.abs(x - WORLD.stripCenter.x) <= WORLD.stripWidth / 2 &&
    Math.abs(z - WORLD.stripCenter.z) <= WORLD.stripLength / 2;
}

// Ground colour by height, slope and a little noise, in the dusk palette.
export function groundColor(x, z, h, slope) {
  const n = fbm2(x * 0.013, z * 0.013, SEED + 31, 2) * 0.5 + 0.5;
  let c;
  if (h < -1.2 && Math.abs(x - riverCenterX(z)) < 40) {
    c = PALETTE.river;
  } else if (h < 1.5 && Math.abs(x - riverCenterX(z)) < 58) {
    c = PALETTE.riverBank;
  } else if (slope > 0.62) {
    c = n > 0.5 ? PALETTE.rock : PALETTE.rockDark;
  } else if (h > 430) {
    c = PALETTE.snow;
  } else if (h > 300) {
    c = lerp3(PALETTE.rock, PALETTE.snow, (h - 300) / 130);
  } else if (h > 120) {
    c = lerp3(PALETTE.dryGrass, PALETTE.rock, (h - 120) / 180 + slope * 0.4);
  } else {
    c = lerp3(PALETTE.grassLow, PALETTE.grassHigh, n);
    if (slope > 0.34) c = lerp3(c, PALETTE.dryGrass, (slope - 0.34) * 1.6);
  }
  // The strip is drawn as its own object; keep the ground beneath it plain.
  if (isOnStrip(x, z)) c = PALETTE.dryGrass;
  return c;
}

function lerp3(a, b, t) {
  t = clamp(t, 0, 1);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Pine scatter: planted once from the seed, on ground a plane could not
// land on but a tree can grow on, clear of the strip, river and camp.
export const TREES = (() => {
  const rng = makeRng(SEED + 99);
  const trees = [];
  for (let i = 0; i < 2600 && trees.length < 850; i++) {
    const x = (rng() * 2 - 1) * 3900;
    const z = (rng() * 2 - 1) * 4300;
    const h = groundHeight(x, z);
    if (h < 3 || h > 300) continue;
    if (Math.abs(x) < 190 && Math.abs(z) < 800) continue;
    if (Math.abs(x - riverCenterX(z)) < 70) continue;
    if (Math.hypot(x - WORLD.camp.x, z - WORLD.camp.z) < 240) continue;
    const slope = Math.abs(groundHeight(x + 14, z) - h) + Math.abs(groundHeight(x, z + 14) - h);
    if (slope > 9) continue;
    trees.push({ x, z, h, s: 0.75 + rng() * 0.8, lean: rng() * 0.06 });
  }
  return trees;
})();

// Camp buildings: three cabins and a supply tent ring at Ember Camp.
export const CAMP_BUILDINGS = [
  { dx: -38, dz: -20, w: 16, d: 11, h: 6, hue: 0 },
  { dx: 30, dz: -34, w: 13, d: 10, h: 5, hue: 1 },
  { dx: 6, dz: 38, w: 18, d: 12, h: 6.5, hue: 0 },
  { dx: -52, dz: 30, w: 10, d: 10, h: 4.5, hue: 1 },
];
