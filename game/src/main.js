// main.js — Emberpass Airlift: boot, the game loop, the cameras and the
// state machine that walks title → briefing → flight → debrief for the
// three sorties. Every other file has one job; this one conducts them.

import { VIEW } from './config.js';
import { Renderer, makeCamera } from './render3d.js';
import { makePlane, stepPlane } from './aircraft.js';
import { makeSortie, updateSortie, objective, releaseCrate, SORTIES } from './missions.js';
import { initInput, readInput } from './input.js';
import { initAudio, setEngine, stopEngine, ringChime, dropAway, stallBeep, touchdownThud, successJingle, crashSound } from './audio.js';
import { drawScene } from './world.js';
import { drawHUD } from './hud.js';
import { drawCockpitPanel } from './cockpit.js';
import { drawTitle, drawBriefing, drawDebrief, drawCampaignEnd, drawPaused } from './screens.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const renderer = new Renderer(canvas);

const game = {
  state: 'title',
  plane: makePlane(),
  sortie: null,
  view: 'chase',
  camera: makeCamera([0, 200, 900], 0, -0.1, 0),
  time: 0,
  sortieIndex: 0,
  campaignScore: 0,
  results: [],
  objective: null,
  best: 0,
  camHeading: 0,
  camPitch: 0,
  lastTouchdown: null,
  stallBeepAt: 0,
};
try { game.best = Number(localStorage.getItem('emberpass-best') || 0) || 0; } catch { game.best = 0; }

initInput(canvas);
addEventListener('keydown', () => initAudio());
canvas.addEventListener('mousedown', () => initAudio());

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
if (shotName) {
  const shot = applyShot(shotName);
  game.plane = shot.plane;
  game.sortie = shot.sortie;
  game.view = shot.view;
  game.state = 'shot';
  game.camHeading = shot.plane.heading;
  game.camPitch = shot.plane.pitch;
}

function windNow() {
  if (!game.sortie) return [0, 0, 0];
  const base = game.sortie.def.wind;
  if (!game.sortie.def.gusts) return [...base];
  return [
    base[0] + Math.sin(game.time * 0.6) * 2.4 + Math.sin(game.time * 1.7) * 0.9,
    0,
    base[2] + Math.cos(game.time * 0.47) * 1.9,
  ];
}

function startSortie(index) {
  game.sortieIndex = index;
  game.sortie = makeSortie(index);
  game.plane = makePlane();
  game.view = 'chase';
  game.camHeading = 0;
  game.camPitch = 0;
  game.lastTouchdown = null;
  game.state = 'brief';
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// The chase camera trails behind and above, its angles lagging the plane's
// so it never snaps or fights; the cockpit camera sits at the pilot's head.
function updateCamera(dt) {
  const p = game.plane;
  if (game.state === 'title' || game.state === 'end') {
    const t = game.time * 0.045;
    const pos = [Math.sin(t) * 760, 210 + Math.sin(game.time * 0.13) * 26, Math.cos(t) * 760];
    const look = [0, 6, 0];
    const dir = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]];
    const heading = Math.atan2(dir[0], -dir[2]);
    const pitch = Math.atan2(dir[1], Math.hypot(dir[0], dir[2]));
    game.camera = makeCamera(pos, heading, pitch, 0);
    return;
  }
  const k = 1 - Math.pow(0.0015, dt);   // smooth, frame-rate independent
  game.camHeading = angleLerp(game.camHeading, p.heading, k);
  game.camPitch = angleLerp(game.camPitch, p.pitch * 0.82, k);
  const shake = p.shake * 0.012;
  const shX = (Math.random() - 0.5) * shake, shY = (Math.random() - 0.5) * shake;
  if (game.view === 'cockpit') {
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const fwd = [Math.sin(p.heading) * cp, sp, -Math.cos(p.heading) * cp];
    const up = [-Math.sin(p.heading) * sp, cp, Math.cos(p.heading) * sp];
    const pos = [
      p.pos[0] + up[0] * 1.06 + fwd[0] * 0.85 + shX,
      p.pos[1] + up[1] * 1.06 + fwd[1] * 0.85 + shY,
      p.pos[2] + up[2] * 1.06 + fwd[2] * 0.85,
    ];
    game.camera = makeCamera(pos, p.heading, p.pitch, p.roll * 0.94);
  } else {
    const ch = game.camHeading, cp = Math.cos(game.camPitch), sp = Math.sin(game.camPitch);
    const fwd = [Math.sin(ch) * cp, sp, -Math.cos(ch) * cp];
    const pos = [
      p.pos[0] - fwd[0] * 13.5 + shX,
      p.pos[1] - fwd[1] * 13.5 + 4.4 + shY,
      p.pos[2] - fwd[2] * 13.5,
    ];
    const look = [p.pos[0] + fwd[0] * 14, p.pos[1] + 1 + fwd[1] * 14, p.pos[2] + fwd[2] * 14];
    const dir = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]];
    const heading = Math.atan2(dir[0], -dir[2]);
    const pitch = Math.atan2(dir[1], Math.hypot(dir[0], dir[2]));
    const roll = p.roll * 0.38;
    game.camera = makeCamera(pos, heading, pitch, roll);
    // Keep the chase camera out of the ground on low passes.
    game.camera.pos[1] = Math.max(game.camera.pos[1], 2.2);
  }
}

function flyStep(input, dt) {
  const p = game.plane;
  const wind = windNow();
  if (input.camera) game.view = game.view === 'chase' ? 'cockpit' : 'chase';
  if (input.drop && releaseCrate(game.sortie, p)) dropAway();
  const sub = Math.max(1, Math.ceil(dt / (1 / 60)));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) stepPlane(p, input, wind, h);
  p.carrying = !!(game.sortie.crate && game.sortie.crate.state === 'aboard');
  const event = updateSortie(game.sortie, p, dt, wind, game.time);
  if (p.touchdown && p.touchdown !== game.lastTouchdown) {
    game.lastTouchdown = p.touchdown;
    touchdownThud(p.touchdown.sink > 4.2);
  }
  if (event === 'ring') ringChime();
  if (event === 'finish') {
    if (p.crashed) crashSound(); else successJingle();
    stopEngine();
    game.campaignScore += game.sortie.result.total;
    game.results[game.sortieIndex] = game.sortie.result;
    game.state = 'debrief';
  }
  if (p.stalled && game.time - game.stallBeepAt > 0.42) {
    game.stallBeepAt = game.time;
    stallBeep();
  }
  setEngine(p.throttle, Math.hypot(p.vel[0], p.vel[2]), !p.crashed);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.time += dt;
  const input = readInput();

  switch (game.state) {
    case 'title':
      if (input.confirm) { game.campaignScore = 0; game.results = []; startSortie(0); }
      break;
    case 'brief':
      if (input.confirm) game.state = 'fly';
      break;
    case 'fly':
      if (input.pause) { game.state = 'pause'; stopEngine(); }
      else flyStep(input, dt);
      break;
    case 'pause':
      if (input.pause || input.confirm) game.state = 'fly';
      if (input.restart) startSortie(game.sortieIndex);
      break;
    case 'debrief':
      if (input.confirm) {
        if (game.sortieIndex + 1 < SORTIES.length) startSortie(game.sortieIndex + 1);
        else {
          game.state = 'end';
          if (game.campaignScore > game.best) {
            game.best = game.campaignScore;
            try { localStorage.setItem('emberpass-best', String(game.best)); } catch { /* private mode */ }
          }
        }
      }
      if (input.restart) {
        game.campaignScore -= game.sortie.result.total;
        game.results[game.sortieIndex] = null;
        startSortie(game.sortieIndex);
      }
      break;
    case 'end':
      if (input.confirm) { game.campaignScore = 0; game.results = []; startSortie(0); }
      break;
    case 'shot':
      game.plane.propAngle += dt * 24;
      break;
  }

  game.objective = game.sortie && (game.state === 'fly' || game.state === 'shot')
    ? objective(game.sortie, game.plane)
    : null;

  updateCamera(dt);
  renderer.begin(game.camera);
  drawScene(renderer, game);
  renderer.flush();

  const w = canvas.width, h = canvas.height;
  if (game.state === 'fly' || game.state === 'shot' || game.state === 'pause') {
    const hud = drawHUD(ctx, game);
    if (game.view === 'cockpit') {
      drawCockpitPanel(ctx, game.plane, w, h, {
        headingDeg: hud.headingDeg, speedKt: hud.speedKt, altFt: hud.altFt,
        vsiFpm: hud.vsiFpm, targetBearingDeg: hud.targetBearing, time: game.time,
      });
    }
    if (game.state === 'pause') drawPaused(ctx, w, h);
  } else if (game.state === 'title') {
    drawTitle(ctx, w, h, game.best);
  } else if (game.state === 'brief') {
    drawBriefing(ctx, w, h, game.sortie);
  } else if (game.state === 'debrief') {
    drawDebrief(ctx, w, h, game.sortie, game.campaignScore, game.sortieIndex + 1 >= SORTIES.length);
  } else if (game.state === 'end') {
    drawCampaignEnd(ctx, w, h, game.campaignScore, game.results);
  }
}
requestAnimationFrame(frame);
