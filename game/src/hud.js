// hud.js — the head-up display drawn over both views: altitude, speed and
// heading readouts, a compass ribbon with the target caret, the objective
// and its distance, fuel and damage bars, event notes and the big centre
// warnings (STALL, PULL UP, LOW FUEL) a pilot cannot afford to miss.

import { PLANE } from './config.js';
import { groundHeight } from './terrain.js';
import { clamp } from './random.js';

const INK = '#f2ecdc';
const AMBER = '#ffb042';
const RED = '#ff5340';
const GREEN = '#7dd87d';
const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function bearingTo(from, to) {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  return ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
}

export function drawHUD(ctx, game) {
  const { plane: p, sortie } = game;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const altFt = p.pos[1] * 3.281;
  const speedKt = Math.hypot(p.vel[0], p.vel[1], p.vel[2]) * 1.944;
  const headingDeg = ((p.heading * 180 / Math.PI) % 360 + 360) % 360;
  const obj = game.objective;
  const targetBearing = obj ? bearingTo(p.pos, obj.pos) : null;

  ctx.save();
  // Top-left readouts.
  ctx.textBaseline = 'alphabetic';
  readout(ctx, 26, 40, 'ALT', `${Math.round(altFt)} FT`);
  readout(ctx, 26, 76, 'SPD', `${Math.round(speedKt)} KT`);
  readout(ctx, 26, 112, 'HDG', `${String(Math.round(headingDeg)).padStart(3, '0')}°`);
  const agl = p.pos[1] - groundHeight(p.pos[0], p.pos[2]);
  readout(ctx, 26, 148, 'AGL', `${Math.round(agl * 3.281)} FT`);

  // Top-right: sortie, running score and clock.
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(sortie ? sortie.def.name.toUpperCase() : '', w - 26, 40);
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = AMBER;
  const running = sortie ? sortie.ringsPassed * 100 + sortie.dropScore : 0;
  ctx.fillText(`${running}`, w - 26, 72);
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = 'rgba(242,236,220,0.75)';
  ctx.fillText(sortie ? `TIME ${formatTime(sortie.elapsed)} · PAR ${formatTime(sortie.def.par)}` : '', w - 26, 96);
  ctx.fillText(`DMG ${Math.round(p.damage)}%`, w - 26, 118);
  ctx.textAlign = 'left';

  // Compass ribbon, top centre, with the target caret.
  drawCompass(ctx, w / 2, 34, 380, headingDeg, targetBearing);

  // Objective line under the compass.
  if (obj) {
    const dist = Math.hypot(obj.pos[0] - p.pos[0], obj.pos[2] - p.pos[2]);
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.fillText(obj.label, w / 2, 86);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = AMBER;
    ctx.fillText(dist >= 1000 ? `${(dist / 1000).toFixed(2)} KM` : `${Math.round(dist)} M`, w / 2, 110);
    ctx.textAlign = 'left';
  }

  // Bottom-left bars (the cockpit panel carries its own, so chase only).
  if (game.view === 'chase') {
    bar(ctx, 26, h - 58, 190, 'FUEL', p.fuel / PLANE.fuelCapacity, p.fuel < PLANE.fuelCapacity * 0.22 ? RED : GREEN);
    bar(ctx, 26, h - 32, 190, 'DAMAGE', p.damage / 100, p.damage > 45 ? RED : AMBER);
    ctx.fillStyle = 'rgba(242,236,220,0.8)';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`THROTTLE ${Math.round(p.throttle * 100)}%`, 26, h - 72);
  }

  // Controls hint, bottom-right, fading once the sortie is under way.
  const hintAlpha = sortie && sortie.elapsed > 30 ? 0.34 : 0.75;
  ctx.fillStyle = `rgba(242,236,220,${hintAlpha})`;
  ctx.font = `12.5px ${FONT}`;
  ctx.textAlign = 'right';
  const hints = [
    '↑↓ pitch · ←→ bank · SHIFT/CTRL throttle',
    'SPACE brake · F drop crate · C camera · P pause',
  ];
  hints.forEach((line, i) => ctx.fillText(line, w - 26, h - 44 + i * 20));
  ctx.textAlign = 'left';

  // Event note (ring, crate) centre-top.
  if (sortie && sortie.message && game.time < sortie.message.until) {
    ctx.font = `700 21px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = GREEN;
    ctx.fillText(sortie.message.text, w / 2, 150);
    ctx.textAlign = 'left';
  }

  // Warnings, centre screen, impossible to miss.
  const warnings = [];
  if (p.stalled) warnings.push(['STALL', RED]);
  if (!p.onGround && agl < 130 && p.vel[1] < -6.5) warnings.push(['PULL UP', RED]);
  if (p.fuel <= 0 && !p.onGround) warnings.push(['ENGINE OUT — GLIDE', AMBER]);
  else if (p.fuel < PLANE.fuelCapacity * 0.16 && !p.onGround) warnings.push(['LOW FUEL', AMBER]);
  warnings.forEach(([text, color], i) => {
    if (Math.sin(game.time * 9) > -0.35) {
      ctx.font = `800 34px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, h * 0.34 + i * 42);
      ctx.textAlign = 'left';
    }
  });
  ctx.restore();

  return { altFt, speedKt, headingDeg, targetBearing, vsiFpm: p.vel[1] * 196.85 };
}

function readout(ctx, x, y, label, value) {
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = 'rgba(242,236,220,0.62)';
  ctx.fillText(label, x, y);
  ctx.font = `700 21px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(value, x + 44, y);
}

function bar(ctx, x, y, width, label, frac, color) {
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = 'rgba(242,236,220,0.62)';
  ctx.fillText(label, x, y - 4);
  ctx.fillStyle = 'rgba(10,10,14,0.55)';
  ctx.fillRect(x + 52, y - 10, width, 9);
  ctx.fillStyle = color;
  ctx.fillRect(x + 53, y - 9, (width - 2) * clamp(frac, 0, 1), 7);
}

function drawCompass(ctx, cx, y, width, headingDeg, targetBearingDeg) {
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - width / 2, y - 14, width, 28); ctx.clip();
  ctx.fillStyle = 'rgba(10,10,14,0.5)';
  ctx.fillRect(cx - width / 2, y - 14, width, 28);
  ctx.font = `600 13px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pxPerDeg = 3.6;
  for (let d = -55; d <= 55; d += 5) {
    const deg = ((Math.round(headingDeg + d) % 360) + 360) % 360;
    const x = cx + d * pxPerDeg;
    if (deg % 30 === 0) {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      ctx.fillStyle = INK;
      ctx.fillText(names[deg] ?? `${deg / 10}`, x, y);
    } else {
      ctx.fillStyle = 'rgba(242,236,220,0.45)';
      ctx.fillRect(x - 0.5, y - 6, 1, 12);
    }
  }
  if (targetBearingDeg !== null) {
    let rel = ((targetBearingDeg - headingDeg + 540) % 360) - 180;
    const x = cx + clamp(rel, -52, 52) * pxPerDeg;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(x, y + 12); ctx.lineTo(x - 6, y + 20); ctx.lineTo(x + 6, y + 20);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx, y - 20); ctx.lineTo(cx - 6, y - 12); ctx.lineTo(cx + 6, y - 12);
  ctx.closePath(); ctx.fill();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
