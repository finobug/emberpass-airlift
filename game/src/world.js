// world.js — builds and draws the living scene around the flight model:
// terrain, strip, camp, the active sortie's rings and drop target, the
// falling crate, and the dusk clouds. Missions own the rules; this file
// owns what the player sees of them.

import { PALETTE, WORLD } from './config.js';
import { drawTerrain, drawTrees, drawStrip, drawRing, drawCamp, box } from './render3d.js';
import { drawAircraft, drawNose } from './aircraft.js';
import { groundHeight } from './terrain.js';
import { makeRng } from './random.js';

// Cloud puffs: fixed clusters of soft billboards drifting very slowly.
export const CLOUDS = (() => {
  const rng = makeRng(777);
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const cx = (rng() * 2 - 1) * 4200;
    const cz = (rng() * 2 - 1) * 4600;
    const cy = 640 + rng() * 260;
    const puffs = [];
    const n = 4 + (rng() * 4 | 0);
    for (let j = 0; j < n; j++) {
      puffs.push({
        dx: (rng() * 2 - 1) * 150, dy: (rng() * 2 - 1) * 22, dz: (rng() * 2 - 1) * 90,
        w: 150 + rng() * 190, h: 34 + rng() * 30,
      });
    }
    clouds.push({ cx, cy, cz, puffs });
  }
  return clouds;
})();

export function drawClouds(r, time) {
  const drift = time * 1.1;
  for (const c of CLOUDS) {
    for (const puff of c.puffs) {
      r.billboard(
        [c.cx + puff.dx + drift % 400, c.cy + puff.dy, c.cz + puff.dz],
        puff.w, puff.h, [246, 178, 148], { flat: true, fog: 0.55, alpha: 0.85 },
      );
    }
  }
}

// The drop target at Ember Camp: three flat rings on the ground and a
// pillar of light, pulsing so it reads from altitude.
export function drawTargetZone(r, time) {
  const { camp } = WORLD;
  const y = groundHeight(camp.x, camp.z) + 0.35;
  const pulse = 0.75 + 0.25 * Math.sin(time * 3.2);
  for (const [rad, w] of [[26, 3.2], [15, 2.4], [5.5, 2]]) {
    const seg = 18;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const pt = (a, rr) => [camp.x + Math.cos(a) * rr, y, camp.z + Math.sin(a) * rr];
      r.poly([pt(a0, rad - w / 2), pt(a1, rad - w / 2), pt(a1, rad + w / 2), pt(a0, rad + w / 2)],
        PALETTE.targetZone, { flat: true, alpha: pulse });
    }
  }
  r.billboard([camp.x, y + 90, camp.z], 6, 180, PALETTE.targetZone, { flat: true, alpha: 0.13, fog: 0.2 });
}

// The supply crate: a crate box in flight, a parachute canopy once it has
// fallen a moment, and a soft shadow blob on the ground beneath it.
export function drawCrate(r, crate) {
  if (!crate || crate.state === 'aboard') return;
  const [x, y, z] = crate.pos;
  box(r, [x, y, z], [2.4, 2.0, 2.4], crate.spin, [168, 128, 78]);
  if (crate.state === 'falling' && crate.age > 0.8) {
    const cy = y + 5.2;
    const seg = 8, rad = 4.4;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      r.poly([
        [x + Math.cos(a0) * rad, cy, z + Math.sin(a0) * rad],
        [x + Math.cos(a1) * rad, cy, z + Math.sin(a1) * rad],
        [x, cy + 2.2, z],
      ], PALETTE.planeTrim, {});
    }
  }
  const gy = groundHeight(x, z);
  r.billboard([x, gy + 0.5, z], 5, 1.6, [30, 26, 24], { flat: true, alpha: 0.35, fog: 0.3 });
}

// The whole 3D scene for one frame. view: 'chase' | 'cockpit'.
export function drawScene(r, game) {
  const p = game.plane;
  const camPos = game.camera.pos;
  drawTerrain(r, camPos[0], camPos[2]);
  drawTrees(r, camPos[0], camPos[2]);
  drawStrip(r);
  drawCamp(r);
  const sortie = game.sortie;
  if (sortie) {
    sortie.rings.forEach((ring, i) => {
      const state = i < sortie.ringsPassed ? 'done' : i === sortie.ringsPassed ? 'next' : 'idle';
      const color = state === 'done' ? PALETTE.ringDone : state === 'next' ? PALETTE.ringNext : PALETTE.ringIdle;
      drawRing(r, { ...ring, beacon: state === 'next' }, color);
    });
    if (sortie.def.dropZone && !sortie.dropDone) drawTargetZone(r, game.time);
    if (sortie.crate) drawCrate(r, sortie.crate);
  }
  drawClouds(r, game.time);
  if (game.view === 'cockpit') drawNose(r, p);
  else drawAircraft(r, p);
}
