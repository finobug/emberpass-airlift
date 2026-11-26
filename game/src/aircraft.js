// aircraft.js — the flight model and the aeroplane itself. The model is a
// velocity-vector simulation with a real lift curve: climbs bleed speed,
// dives gain it, the wing stalls if you haul the nose up too slowly, and a
// banked turn needs throttle to hold height. That is the discipline the
// missions score. Pure maths here (no DOM), so it can be flown headlessly.

import { PLANE, PALETTE } from './config.js';
import { groundHeight, isOnStrip, isWater } from './terrain.js';
import { clamp } from './random.js';

const G = 9.81;
const RHO = 1.225;

export function makePlane() {
  return {
    pos: [0, 1.6, 430],       // on the strip, south end, facing north
    vel: [0, 0, 0],
    heading: 0, pitch: 0, roll: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    onGround: true,
    crashed: false,
    landed: false,
    stalled: false,
    propAngle: 0,
    shake: 0,
    touchdown: null,           // filled at the moment of a landing
    wasAirborne: false,
    airTime: 0,
  };
}

// Orientation basis: forward, right, up unit vectors for heading/pitch/roll.
export function planeBasis(p) {
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const fwd = [Math.sin(p.heading) * cp, sp, -Math.cos(p.heading) * cp];
  let right = [Math.cos(p.heading), 0, Math.sin(p.heading)];
  const up0 = [-Math.sin(p.heading) * sp, cp, Math.cos(p.heading) * sp];
  const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
  const up = [
    up0[0] * cr + right[0] * sr,
    up0[1] * cr + right[1] * sr,
    up0[2] * cr + right[2] * sr,
  ];
  right = [
    right[0] * cr - up0[0] * sr,
    right[1] * cr - up0[1] * sr,
    right[2] * cr - up0[2] * sr,
  ];
  return { fwd, right, up };
}

export function airspeed(p, wind) {
  const ax = p.vel[0] - wind[0], ay = p.vel[1] - wind[1], az = p.vel[2] - wind[2];
  return Math.hypot(ax, ay, az);
}

export function groundSpeed(p) { return Math.hypot(p.vel[0], p.vel[2]); }

// One physics step. input: {pitch, roll, throttleDelta, brake} each -1..1
// or booleans; wind: [x, y, z] m/s. dt is clamped by the caller.
export function stepPlane(p, input, wind, dt) {
  if (p.crashed) return;
  const basis = planeBasis(p);

  // Controls: bank toward the aileron demand, pitch toward the elevator's.
  const targetRoll = input.roll * PLANE.maxBank;
  const rollErr = targetRoll - p.roll;
  p.roll += clamp(rollErr, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  p.throttle = clamp(p.throttle + input.throttleDelta * dt * 0.55, 0, 1);

  // Coordinated turn: heading rate from bank and lift, as in a real turn.
  const spd = airspeed(p, wind);
  const liftFactor = clamp((spd * spd) / (PLANE.stallSpeed * PLANE.stallSpeed), 0, 1.6);
  if (!p.onGround) {
    p.heading += (G * Math.tan(p.roll) / Math.max(spd, 16)) * dt * clamp(liftFactor, 0.25, 1);
    // The nose sinks in a turn unless the pilot holds it: pitch follows the
    // elevator plus a sink term from the bank, plus velocity alignment.
    const velPitch = Math.atan2(p.vel[1], Math.hypot(p.vel[0], p.vel[2]) + 1e-6);
    let pitchRate = input.pitch * PLANE.pitchRate;
    pitchRate += clamp((velPitch - p.pitch) * 0.30, -0.25, 0.25);
    pitchRate -= (1 - Math.cos(p.roll)) * 0.35 * Math.sign(p.pitch >= velPitch ? 1 : -1) * 0; // bank sink handled by lift loss below
    p.pitch += clamp(pitchRate, -1.4, 1.4) * dt;
    if (p.stalled) p.pitch -= 0.55 * dt;   // a stalled wing drops the nose
    p.pitch = clamp(p.pitch, PLANE.minPitch, PLANE.maxPitch);
  } else {
    // On the ground: steer with the rudder (roll input), pitch only to rotate.
    p.heading += input.roll * clamp(groundSpeed(p) / 22, 0, 1) * 0.5 * dt;
    p.roll *= Math.max(0, 1 - 6 * dt);
    if (spd > PLANE.stallSpeed * 0.92) {
      p.pitch += clamp(input.pitch * PLANE.pitchRate - p.pitch * 1.4, -1, 1) * dt;
    } else {
      p.pitch = Math.max(0, p.pitch - 2.2 * dt);
    }
    p.pitch = clamp(p.pitch, 0, PLANE.maxPitch);
  }

  // Aerodynamics in the air-velocity frame.
  const air = [p.vel[0] - wind[0], p.vel[1] - wind[1], p.vel[2] - wind[2]];
  const v = Math.max(Math.hypot(air[0], air[1], air[2]), 0.01);
  const vhat = [air[0] / v, air[1] / v, air[2] / v];
  // Angle of attack: between the nose and the airflow, in the lift plane.
  const cosA = clamp(basis.fwd[0] * vhat[0] + basis.fwd[1] * vhat[1] + basis.fwd[2] * vhat[2], -1, 1);
  const alpha = Math.acos(cosA) * (dotSign(basis, vhat) >= 0 ? 1 : -1);
  let cl = clamp(alpha * 5.2, -1.1, 1.45);
  p.stalled = !p.onGround && alpha > 0.30 && v < PLANE.cruiseSpeed + 14;
  if (alpha > 0.30) cl *= Math.max(0.35, 1 - (alpha - 0.30) * 2.4);  // lift falls off past the stall
  const cd = 0.032 + 0.055 * cl * cl + (p.onGround ? 0.012 : 0) + (input.brake && !p.onGround ? 0.05 : 0);
  const q = 0.5 * RHO * v * v * PLANE.wingArea;
  // Lift direction: perpendicular to airflow, toward the wing's up.
  let liftDir = [
    basis.up[0] - vhat[0] * (basis.up[0] * vhat[0] + basis.up[1] * vhat[1] + basis.up[2] * vhat[2]),
    basis.up[1] - vhat[1] * (basis.up[0] * vhat[0] + basis.up[1] * vhat[1] + basis.up[2] * vhat[2]),
    basis.up[2] - vhat[2] * (basis.up[0] * vhat[0] + basis.up[1] * vhat[1] + basis.up[2] * vhat[2]),
  ];
  const ll = Math.hypot(liftDir[0], liftDir[1], liftDir[2]);
  if (ll > 1e-5) liftDir = [liftDir[0] / ll, liftDir[1] / ll, liftDir[2] / ll];
  const lift = q * cl, drag = q * cd;
  const engineOn = p.fuel > 0 && p.damage < 100;
  const thrust = engineOn ? p.throttle * PLANE.maxThrust : 0;

  let fx = basis.fwd[0] * thrust + liftDir[0] * lift - vhat[0] * drag;
  let fy = basis.fwd[1] * thrust + liftDir[1] * lift - vhat[1] * drag - PLANE.mass * G;
  let fz = basis.fwd[2] * thrust + liftDir[2] * lift - vhat[2] * drag;

  if (p.onGround) {
    // Rolling friction and brakes; the ground carries the weight.
    const gs = groundSpeed(p);
    const rollFriction = 26 + (input.brake ? 300 : 0) + (isOnStrip(p.pos[0], p.pos[2]) ? 0 : 190);
    if (gs > 0.01) {
      fx += (-p.vel[0] / gs) * rollFriction;
      fz += (-p.vel[2] / gs) * rollFriction;
    }
    fy = Math.max(fy, 0);
    // Lift-off: enough lift and a nose-up attitude lets the ground go.
    if (lift * liftDir[1] > PLANE.mass * G * 0.98 && p.pitch > 0.045 && v > PLANE.stallSpeed) {
      p.onGround = false;
    }
  }

  p.vel[0] += (fx / PLANE.mass) * dt;
  p.vel[1] += (fy / PLANE.mass) * dt;
  p.vel[2] += (fz / PLANE.mass) * dt;
  p.pos[0] += p.vel[0] * dt;
  p.pos[1] += p.vel[1] * dt;
  p.pos[2] += p.vel[2] * dt;

  // Fuel and wear.
  if (engineOn) p.fuel = Math.max(0, p.fuel - p.throttle * PLANE.fuelBurnFull * dt);
  if (!p.onGround) {
    p.wasAirborne = true;
    p.airTime += dt;
    if (v > PLANE.maxSpeed) p.damage += (v - PLANE.maxSpeed) * 0.30 * dt;
  }
  p.shake = p.stalled ? 1 : Math.max(0, p.shake - 2.4 * dt);
  p.propAngle += (2 + p.throttle * 55) * dt * (engineOn ? 1 : 0.25);

  handleGroundContact(p);
}

function dotSign(basis, vhat) {
  // Sign of the angle of attack: is the airflow below the nose (positive)?
  const crossY = basis.fwd[2] * vhat[0] - basis.fwd[0] * vhat[2];
  const side = basis.right[0] * crossY;
  const up = basis.up[0] * vhat[0] + basis.up[1] * vhat[1] + basis.up[2] * vhat[2];
  return up <= 0 ? 1 : -1; // airflow from below the wing plane reads positive alpha
}

function handleGroundContact(p) {
  const gh = groundHeight(p.pos[0], p.pos[2]);
  const gear = 1.6;
  if (p.pos[1] - gear > gh + 0.02) {
    if (!p.onGround) return;
    // Rolled off a rise: become airborne with what speed we have.
    if (p.vel[1] <= 0 && airspeed(p, [0, 0, 0]) < PLANE.stallSpeed * 0.9) {
      p.pos[1] = gh + gear;
      return;
    }
    p.onGround = false;
    return;
  }
  // Contact.
  const sink = -p.vel[1];
  const spd = Math.hypot(p.vel[0], p.vel[2]);
  const onStrip = isOnStrip(p.pos[0], p.pos[2]);
  const water = isWater(p.pos[0], p.pos[2]);
  if (!p.onGround && p.wasAirborne) {
    p.touchdown = {
      sink, speed: spd, onStrip, water,
      x: p.pos[0], z: p.pos[2],
      heading: p.heading,
      gentle: sink <= 2.6,
    };
    if (water || sink > 8.6 || (spd > 30 && !onStrip && slopeTooSteep(p.pos[0], p.pos[2]))) {
      p.crashed = true;
      p.crashReason = water ? 'Ditched in the river.' : 'Came down too hard.';
      return;
    }
    if (sink > 4.2) p.damage += (sink - 4.2) * 10;
    if (!onStrip && spd > 22) p.damage += (spd - 22) * 0.5;
    if (p.damage >= 100) { p.crashed = true; p.crashReason = 'The airframe gave up.'; return; }
  }
  p.onGround = true;
  p.pos[1] = gh + gear;
  if (p.vel[1] < 0) p.vel[1] = 0;
  if (spd < 0.4 && p.throttle < 0.03) {
    p.vel[0] = 0; p.vel[2] = 0;
    p.landed = p.wasAirborne;   // a full stop after flight ends the sortie
  }
}

function slopeTooSteep(x, z) {
  const h = groundHeight(x, z);
  return Math.abs(groundHeight(x + 12, z) - h) > 7 || Math.abs(groundHeight(x, z + 12) - h) > 7;
}

// ---- Drawing ------------------------------------------------------------

function localToWorld(p, basis, lx, ly, lz) {
  return [
    p.pos[0] + basis.right[0] * lx + basis.up[0] * ly - basis.fwd[0] * lz,
    p.pos[1] + basis.right[1] * lx + basis.up[1] * ly - basis.fwd[1] * lz,
    p.pos[2] + basis.right[2] * lx + basis.up[2] * ly - basis.fwd[2] * lz,
  ];
}

function partBox(r, p, basis, c, s, color, opts = {}) {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const A = localToWorld(p, basis, c[0] - hx, c[1] - hy, c[2] - hz), B = localToWorld(p, basis, c[0] + hx, c[1] - hy, c[2] - hz);
  const C = localToWorld(p, basis, c[0] + hx, c[1] - hy, c[2] + hz), D = localToWorld(p, basis, c[0] - hx, c[1] - hy, c[2] + hz);
  const E = localToWorld(p, basis, c[0] - hx, c[1] + hy, c[2] - hz), F = localToWorld(p, basis, c[0] + hx, c[1] + hy, c[2] - hz);
  const G = localToWorld(p, basis, c[0] + hx, c[1] + hy, c[2] + hz), H = localToWorld(p, basis, c[0] - hx, c[1] + hy, c[2] + hz);
  r.poly([A, B, C, D], color, opts); r.poly([E, H, G, F], color, opts);
  r.poly([A, E, F, B], color, opts); r.poly([B, F, G, C], color, opts);
  r.poly([C, G, H, D], color, opts); r.poly([D, H, E, A], color, opts);
}

// The whole aeroplane, for the chase view: a high-wing bush plane in cream
// and ember orange, built from shaded boxes so it reads as a made thing.
export function drawAircraft(r, p) {
  const basis = planeBasis(p);
  const body = PALETTE.planeBody, trim = PALETTE.planeTrim, dark = PALETTE.planeDark;
  partBox(r, p, basis, [0, 0, 0.5], [1.45, 1.45, 5.4], body);              // fuselage
  partBox(r, p, basis, [0, -0.05, -2.6], [1.25, 1.25, 1.3], trim);          // engine cowl
  partBox(r, p, basis, [0, 0.62, -0.7], [1.3, 0.75, 1.9], [38, 48, 62]);    // cabin glass
  partBox(r, p, basis, [0, 0.98, -0.2], [10.9, 0.16, 1.75], body);          // main wing
  partBox(r, p, basis, [-5.15, 0.98, -0.2], [0.6, 0.18, 1.75], trim);       // wing tips
  partBox(r, p, basis, [5.15, 0.98, -0.2], [0.6, 0.18, 1.75], trim);
  partBox(r, p, basis, [0, 0.3, 3.15], [3.5, 0.13, 1.15], body);            // tailplane
  partBox(r, p, basis, [0, 0.95, 3.15], [0.15, 1.5, 1.25], trim);           // fin
  partBox(r, p, basis, [-0.85, -1.05, -0.7], [0.34, 0.62, 0.34], dark);     // wheels
  partBox(r, p, basis, [0.85, -1.05, -0.7], [0.34, 0.62, 0.34], dark);
  partBox(r, p, basis, [0, -0.72, 3.2], [0.2, 0.34, 0.2], dark);            // tail wheel
  partBox(r, p, basis, [-0.8, -0.62, -0.7], [0.09, 0.7, 0.09], dark);       // gear legs
  partBox(r, p, basis, [0.8, -0.62, -0.7], [0.09, 0.7, 0.09], dark);
  drawProp(r, p, basis);
}

// Propeller: two blurred blades and a translucent disc, spinner in front.
export function drawProp(r, p, basis) {
  const c = localToWorld(p, basis, 0, -0.05, -3.32);
  const a = p.propAngle;
  for (const off of [0, Math.PI / 2]) {
    const dx = Math.cos(a + off) * 1.55, dy = Math.sin(a + off) * 1.55;
    const tip1 = localToWorld(p, basis, dx, -0.05 + dy, -3.32);
    const tip2 = localToWorld(p, basis, -dx, -0.05 - dy, -3.32);
    r.poly([c, tip1, tip2], PALETTE.planeDark, { alpha: 0.30, fog: 0 });
  }
  partBox(r, p, basis, [0, -0.05, -3.38], [0.34, 0.34, 0.3], PALETTE.planeTrim);
}

// Just the nose and prop, drawn from the pilot's seat in cockpit view.
export function drawNose(r, p) {
  const basis = planeBasis(p);
  partBox(r, p, basis, [0, -0.42, -2.55], [1.3, 0.62, 1.5], PALETTE.planeTrim);
  drawProp(r, p, basis);
}
