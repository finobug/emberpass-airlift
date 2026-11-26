// shots.js — deterministic scenes for the entry's screenshots. Each shot
// parks the aeroplane, the camera and the sortie in a composed moment of
// real gameplay (same world, same physics state, HUD on), so the pictures
// in screenshots/ are honest renders of the game itself, reproducible
// from shots.json's query strings: ?shot=<name>&seed=1.

import { makePlane } from './aircraft.js';
import { makeSortie } from './missions.js';

function pose(plane, pos, heading, pitch, roll, speed, throttle) {
  plane.pos = [...pos];
  plane.heading = heading;
  plane.pitch = pitch;
  plane.roll = roll;
  const cp = Math.cos(pitch);
  plane.vel = [
    Math.sin(heading) * cp * speed,
    Math.sin(pitch) * speed,
    -Math.cos(heading) * cp * speed,
  ];
  plane.throttle = throttle;
  plane.onGround = false;
  plane.wasAirborne = true;
  plane.fuel = 96;
  return plane;
}

// Returns {plane, sortie, view} for a shot name.
export function applyShot(name) {
  if (name === 'cockpit') {
    const plane = pose(makePlane(), [5, 105, 1180], 0.03, -0.055, 0.02, 35, 0.24);
    const sortie = makeSortie(0);
    sortie.ringsPassed = sortie.rings.length;   // the objective is the landing
    sortie.elapsed = 212;
    return { plane, sortie, view: 'cockpit' };
  }
  if (name === 'rings') {
    const plane = pose(makePlane(), [238, 126, -2122], 0.14, 0.03, -0.42, 46, 0.66);
    const sortie = makeSortie(0);
    sortie.ringsPassed = 2;                     // ring 3 dead ahead, lit amber
    sortie.elapsed = 96;
    return { plane, sortie, view: 'chase' };
  }
  if (name === 'drop') {
    const plane = pose(makePlane(), [1120, 205, -1860], 0.62, -0.03, 0.14, 44, 0.58);
    plane.carrying = true;
    const sortie = makeSortie(1);
    sortie.ringsPassed = 3;
    sortie.crate.state = 'falling';
    sortie.crate.pos = [1235, 128, -2010];
    sortie.crate.vel = [16, -7, -22];
    sortie.crate.age = 2.4;
    sortie.elapsed = 141;
    return { plane, sortie, view: 'chase' };
  }
  // 'cover' and anything else: the hero shot — banking over the river
  // toward the second ring, valley and caldera in frame.
  const plane = pose(makePlane(), [-120, 150, -1080], -0.30, 0.04, -0.52, 47, 0.7);
  const sortie = makeSortie(0);
  sortie.ringsPassed = 1;
  sortie.elapsed = 54;
  return { plane, sortie, view: 'chase' };
}
