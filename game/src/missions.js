// missions.js — the three sorties of the Emberpass campaign, their rules
// and their scoring. A sortie is: take off from the strip, fly the course
// (rings, and in sortie 2 a supply drop on Ember Camp), then land and stop
// on the strip. Rings reward precision, the drop rewards judgement, and
// the landing is scored on zone, sink rate and centreline — so throttle
// and turn discipline pay, exactly as the briefings promise.

import { WORLD } from './config.js';
import { groundHeight } from './terrain.js';
import { clamp } from './random.js';

function ring(x, y, z, radius = 27) { return { center: [x, y, z], radius }; }

export const SORTIES = [
  {
    name: 'Sortie 1 — First Light Run',
    sub: 'Learn the valley: eight rings out and back, then land.',
    brief: [
      'Take off north from Emberpass strip and fly the amber rings in order.',
      'The valley walls are high: stay over the floor until you know them.',
      'Finish by landing on the strip, either direction, and stopping.',
    ],
    wind: [1.2, 0, 0], gusts: 0, par: 300,
    rings: [
      ring(0, 70, -750), ring(-300, 100, -1500), ring(260, 130, -2250),
      ring(-80, 170, -3050), ring(480, 150, -3550), ring(-500, 110, -2600),
      ring(-250, 80, -1500), ring(150, 70, -600),
    ],
    dropZone: false,
  },
  {
    name: 'Sortie 2 — Ember Camp Airlift',
    sub: 'A supply crate for Ember Camp, dropped on the marked zone.',
    brief: [
      'You carry one supply crate. Follow the rings east to Ember Camp.',
      'Release the crate with F over the red target rings at the camp:',
      'low and slow scores best, and the parachute needs a moment to open.',
      'Then fly the last ring home and land on the strip.',
    ],
    wind: [3.0, 0, 1.0], gusts: 0, par: 330,
    rings: [
      ring(250, 110, -950), ring(750, 160, -1650), ring(1180, 140, -2150),
      ring(500, 150, -1350),
    ],
    dropZone: true,
  },
  {
    name: 'Sortie 3 — Ember Wind Run',
    sub: 'The pass wind is up: a slalom down the valley in a crosswind.',
    brief: [
      'Six rings weave across the valley in a stiff west crosswind.',
      'The wind will push you off every line: crab into it and plan turns.',
      'Finish through the low gate on the centreline, then land and stop.',
    ],
    wind: [-5.5, 0, 2.0], gusts: 1, par: 300,
    rings: [
      ring(-480, 95, -850), ring(500, 115, -1550), ring(-540, 145, -2300),
      ring(380, 125, -3050), ring(-80, 85, -1900), ring(60, 55, -950),
    ],
    dropZone: false,
  },
];

// Ring axes point along the course, from the previous mark to the next.
function withAxes(def) {
  const pts = [[0, 40, 500], ...def.rings.map((r) => r.center), [0, 40, 0]];
  return def.rings.map((r, i) => {
    const a = pts[i], b = pts[i + 2];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return { ...r, axis: [d[0] / l, d[1] / l, d[2] / l] };
  });
}

export function makeSortie(index) {
  const def = SORTIES[index];
  return {
    def, index,
    rings: withAxes(def),
    ringsPassed: 0,
    prevSide: null,
    crate: def.dropZone
      ? { state: 'aboard', pos: [0, 0, 0], vel: [0, 0, 0], age: 0, spin: 0, impact: null }
      : null,
    dropDone: false,
    dropScore: 0,
    elapsed: 0,
    finished: false,
    result: null,
    message: null,       // {text, until} transient event note for the HUD
  };
}

export function noteEvent(sortie, text, now) {
  sortie.message = { text, until: now + 2.6 };
}

// The current objective for the HUD: next ring, the drop zone, or the strip.
export function objective(sortie, plane) {
  if (sortie.ringsPassed < sortie.rings.length) {
    // In sortie 2 the drop comes after ring 3, before the home ring.
    if (sortie.def.dropZone && sortie.ringsPassed === 3 && !sortie.dropDone) {
      return { kind: 'drop', label: 'DROP THE CRATE ON EMBER CAMP', pos: [WORLD.camp.x, 60, WORLD.camp.z] };
    }
    const ring = sortie.rings[sortie.ringsPassed];
    return {
      kind: 'ring',
      label: `FLY THE RING — ${sortie.ringsPassed + 1} OF ${sortie.rings.length}`,
      pos: ring.center,
    };
  }
  return { kind: 'land', label: 'LAND ON THE STRIP AND STOP', pos: [0, 10, 0] };
}

export function releaseCrate(sortie, plane) {
  const c = sortie.crate;
  if (!c || c.state !== 'aboard' || plane.onGround) return false;
  c.state = 'falling';
  c.pos = [plane.pos[0], plane.pos[1] - 2.2, plane.pos[2]];
  c.vel = [...plane.vel];
  c.age = 0;
  return true;
}

function stepCrate(sortie, dt, wind) {
  const c = sortie.crate;
  if (!c || c.state !== 'falling') return;
  c.age += dt;
  c.spin += dt * 0.7;
  if (c.age < 0.8) {
    c.vel[1] -= 9.81 * dt;                       // ballistic until the chute opens
  } else {
    c.vel[1] += (-7 - c.vel[1]) * Math.min(1, 2.2 * dt);   // canopy: settle to 7 m/s
    c.vel[0] += (wind[0] - c.vel[0]) * Math.min(1, 0.8 * dt);
    c.vel[2] += (wind[2] - c.vel[2]) * Math.min(1, 0.8 * dt);
  }
  c.pos[0] += c.vel[0] * dt;
  c.pos[1] += c.vel[1] * dt;
  c.pos[2] += c.vel[2] * dt;
  const gh = groundHeight(c.pos[0], c.pos[2]);
  if (c.pos[1] <= gh + 1) {
    c.pos[1] = gh + 1;
    c.state = 'down';
    const dist = Math.hypot(c.pos[0] - WORLD.camp.x, c.pos[2] - WORLD.camp.z);
    const impactSpeed = Math.abs(c.vel[1]);
    let score = dist <= 15 ? 300 : dist <= 30 ? 240 : dist <= 55 ? 160 : dist <= 90 ? 80 : 0;
    if (impactSpeed > 13) score = Math.round(score / 2);   // arrived before the canopy: smashed
    c.impact = { dist, score, smashed: impactSpeed > 13 };
    sortie.dropScore = score;
    sortie.dropDone = true;
  }
}

// Advance the sortie: rings, crate, and the landing verdict. Returns an
// event string ('ring' | 'drop' | 'finish') or null, for sounds and notes.
export function updateSortie(sortie, plane, dt, wind, now) {
  if (sortie.finished) return null;
  if (plane.wasAirborne) sortie.elapsed += dt;
  let event = null;

  // Ring crossing: the sign of the along-axis offset flips as we pass.
  if (sortie.ringsPassed < sortie.rings.length) {
    const ring = sortie.rings[sortie.ringsPassed];
    const rel = [plane.pos[0] - ring.center[0], plane.pos[1] - ring.center[1], plane.pos[2] - ring.center[2]];
    const side = rel[0] * ring.axis[0] + rel[1] * ring.axis[1] + rel[2] * ring.axis[2];
    if (sortie.prevSide !== null && sortie.prevSide < 0 && side >= 0 && !plane.onGround) {
      const radial = Math.hypot(rel[0] - ring.axis[0] * side, rel[1] - ring.axis[1] * side, rel[2] - ring.axis[2] * side);
      if (radial <= ring.radius) {
        sortie.ringsPassed++;
        sortie.prevSide = null;
        noteEvent(sortie, `RING ${sortie.ringsPassed} OF ${sortie.rings.length} — +100`, now);
        event = 'ring';
      }
    }
    if (sortie.prevSide === null || Math.sign(side) !== Math.sign(sortie.prevSide)) {
      if (side < 0) sortie.prevSide = side;
    }
  }

  stepCrate(sortie, dt, wind);
  if (sortie.crate && sortie.crate.state === 'down' && !sortie.crate.noted) {
    sortie.crate.noted = true;
    const imp = sortie.crate.impact;
    noteEvent(sortie, imp.score > 0
      ? `CRATE DOWN ${imp.dist.toFixed(0)} M FROM THE CENTRE — +${imp.score}`
      : 'THE CRATE IS LOST IN THE VALLEY', now);
    event = 'drop';
  }

  if (plane.crashed || plane.landed) {
    sortie.finished = true;
    sortie.result = scoreSortie(sortie, plane);
    event = 'finish';
  }
  return event;
}

export function scoreSortie(sortie, plane) {
  const td = plane.touchdown;
  const parts = {
    rings: sortie.ringsPassed * 100,
    drop: sortie.dropScore,
    landing: 0, zone: 0, sink: 0, centreline: 0,
    time: 0, fuel: 0, damagePenalty: 0,
  };
  if (!plane.crashed && plane.landed && td) {
    if (td.onStrip) {
      parts.landing = 200;
      // Distance into the strip from the threshold the pilot approached.
      const fromSouth = Math.cos(td.heading) > 0;   // heading ~0: came over the south end
      const along = fromSouth ? (WORLD.stripLength / 2 - td.z) : (td.z + WORLD.stripLength / 2);
      parts.zone = Math.round(150 * clamp(1 - Math.max(0, along - 40) / 300, 0, 1));
      parts.sink = Math.round(100 * clamp(1 - (td.sink - 1.2) / 3.2, 0, 1));
      parts.centreline = Math.round(50 * clamp(1 - Math.abs(td.x) / (WORLD.stripWidth / 2), 0, 1));
    } else {
      parts.landing = 50;   // down safely in the valley, but it is not the strip
    }
    parts.time = Math.round(Math.min(120, Math.max(0, sortie.def.par - sortie.elapsed) * 1.2));
    parts.fuel = Math.round(Math.min(45, plane.fuel * 0.4));
  }
  parts.damagePenalty = Math.round(plane.damage * 1.5);
  const total = Math.max(0,
    parts.rings + parts.drop + parts.landing + parts.zone + parts.sink +
    parts.centreline + parts.time + parts.fuel - parts.damagePenalty);
  const verdict = plane.crashed
    ? (plane.crashReason || 'The sortie ends in the valley.')
    : total >= 800 ? 'Textbook flying. The valley approves.'
    : total >= 550 ? 'A solid sortie, cleanly flown.'
    : total >= 300 ? 'Home again — with room to polish.'
    : 'Down in one piece. The rings are still out there.';
  return { parts, total, verdict, crashed: !!plane.crashed };
}
