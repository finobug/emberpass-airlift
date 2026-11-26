// cockpit.js — the instrument panel drawn over the lower windshield in
// cockpit view: a lit attitude indicator, airspeed and altimeter dials, a
// compass ribbon, vertical speed, throttle and fuel, and the warning
// lamps. Everything is drawn from the flight model's own numbers, so the
// panel always agrees with the HUD and the physics.

import { PLANE } from './config.js';
import { clamp } from './random.js';

const INK = '#e8e2d2';
const AMBER = '#ffb042';
const RED = '#ff5340';
const GREEN = '#7dd87d';

export function drawCockpitPanel(ctx, plane, w, h, opts) {
  const panelH = Math.round(h * 0.335);
  const top = h - panelH;
  // Panel body with a glareshield lip.
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, '#2b2b31');
  g.addColorStop(0.12, '#1d1d22');
  g.addColorStop(1, '#131316');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, top + 26);
  ctx.quadraticCurveTo(w / 2, top - 16, w, top + 26);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,176,66,0.20)';
  ctx.fillRect(0, top + 24, w, 2);
  // Windshield posts.
  ctx.fillStyle = '#17171a';
  ctx.save();
  ctx.translate(30, 0); ctx.rotate(0.10); ctx.fillRect(-16, 0, 32, top + 30); ctx.restore();
  ctx.save();
  ctx.translate(w - 30, 0); ctx.rotate(-0.10); ctx.fillRect(-16, 0, 32, top + 30); ctx.restore();

  const cy = top + panelH * 0.56;
  const cx = w / 2;
  drawCompass(ctx, cx, top + 40, 340, opts.headingDeg, opts.targetBearingDeg);
  drawAttitude(ctx, cx, cy + 16, 86, plane);
  drawDial(ctx, cx - 215, cy + 16, 62, {
    label: 'AIRSPEED', unit: 'KT', value: opts.speedKt, max: 120,
    digital: `${Math.round(opts.speedKt)}`,
    ticks: [0, 20, 40, 60, 80, 100, 120], redFrom: 92,
  });
  drawDial(ctx, cx + 215, cy + 16, 62, {
    label: 'ALTIMETER', unit: 'FT ×100', value: (opts.altFt % 1000) / 10, max: 100,
    digital: `${Math.round(opts.altFt)} FT`,
    ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  });
  drawVsi(ctx, cx + 330, cy + 16, 40, opts.vsiFpm);
  drawThrottleFuel(ctx, cx - 330, cy + 16, plane);
  drawLamps(ctx, cx, top + panelH - 24, plane, opts.time);
}

function drawCompass(ctx, cx, y, width, headingDeg, targetBearingDeg) {
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - width / 2, y - 13, width, 26); ctx.clip();
  ctx.fillStyle = 'rgba(10,10,14,0.72)';
  ctx.fillRect(cx - width / 2, y - 13, width, 26);
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const pxPerDeg = 3.4;
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round(headingDeg + d) % 360) + 360) % 360;
    const x = cx + d * pxPerDeg;
    if (deg % 30 === 0) {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      ctx.fillStyle = INK;
      ctx.fillText(names[deg] ?? `${deg / 10}`, x, y);
    } else {
      ctx.fillStyle = 'rgba(232,226,210,0.5)';
      ctx.fillRect(x - 0.5, y - 6, 1, 12);
    }
  }
  if (targetBearingDeg !== null && targetBearingDeg !== undefined) {
    let rel = ((targetBearingDeg - headingDeg + 540) % 360) - 180;
    const x = cx + clamp(rel, -58, 58) * pxPerDeg;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(x, y + 11); ctx.lineTo(x - 6, y + 19); ctx.lineTo(x + 6, y + 19);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx, y - 19); ctx.lineTo(cx - 6, y - 11); ctx.lineTo(cx + 6, y - 11);
  ctx.closePath(); ctx.fill();
}

function drawAttitude(ctx, cx, cy, r, plane) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#101014';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchPx = clamp(plane.pitch, -0.6, 0.6) * (r / 0.5);
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f6d9e';   // sky
  ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
  ctx.fillStyle = '#7a5a38';   // ground
  ctx.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.4;
  for (const deg of [-20, -10, 10, 20]) {
    const y = -(deg * Math.PI / 180) * (r / 0.5);
    const half = deg % 20 === 0 ? 26 : 17;
    ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(half, y); ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r * 1.6, -1, r * 3.2, 2);
  ctx.restore();
  // Fixed aircraft symbol and bezel.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 10, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx + 34, cy);
  ctx.stroke();
  ctx.strokeStyle = '#3a3a41';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '600 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, cy + r + 16);
}

function drawDial(ctx, cx, cy, r, o) {
  ctx.save();
  const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.25);
  glow.addColorStop(0, 'rgba(255,190,100,0.13)');
  glow.addColorStop(1, 'rgba(255,190,100,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
  ctx.fillStyle = '#101014';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a3a41'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of o.ticks) {
    const a = a0 + (t / o.max) * (a1 - a0);
    const x1 = cx + Math.cos(a) * (r - 7), y1 = cy + Math.sin(a) * (r - 7);
    const x2 = cx + Math.cos(a) * (r - 13), y2 = cy + Math.sin(a) * (r - 13);
    ctx.strokeStyle = o.redFrom && t >= o.redFrom ? RED : INK;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(`${t}`, cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22));
  }
  if (o.redFrom) {
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r - 3, a0 + (o.redFrom / o.max) * (a1 - a0), a1); ctx.stroke();
  }
  const a = a0 + clamp(o.value / o.max, 0, 1) * (a1 - a0);
  ctx.strokeStyle = AMBER; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16)); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '700 15px ui-monospace, monospace';
  ctx.fillText(o.digital, cx, cy + r * 0.52);
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(232,226,210,0.65)';
  ctx.fillText(`${o.label} · ${o.unit}`, cx, cy + r + 14);
  ctx.restore();
}

function drawVsi(ctx, cx, cy, r, fpm) {
  ctx.save();
  ctx.fillStyle = '#101014';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a3a41'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  // -2000..2000 fpm across 240 degrees, zero at the top-left rest.
  const frac = clamp(fpm / 2000, -1, 1);
  const a = -Math.PI * 0.75 + (frac + 1) / 2 * Math.PI * 1.5;
  ctx.strokeStyle = fpm < -900 ? RED : AMBER;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '600 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VERT SPEED', cx, cy + r + 12);
  ctx.fillText('100 FT/MIN', cx, cy + r * 0.55);
  ctx.restore();
}

function drawThrottleFuel(ctx, cx, cy, plane) {
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  // Throttle quadrant: an arc the lever climbs with the setting.
  ctx.strokeStyle = '#3a3a41'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, 34, Math.PI * 0.7, Math.PI * 1.9); ctx.stroke();
  const a = Math.PI * 0.7 + plane.throttle * Math.PI * 1.2;
  const lx = cx + Math.cos(a) * 34, ly = cy + Math.sin(a) * 34;
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lx, ly); ctx.stroke();
  ctx.fillStyle = '#c33';
  ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText('THROTTLE', cx - 30, cy + 52);
  // Fuel bar.
  const frac = plane.fuel / PLANE.fuelCapacity;
  ctx.fillStyle = '#101014';
  ctx.fillRect(cx - 34, cy + 62, 68, 9);
  ctx.fillStyle = frac < 0.22 ? RED : GREEN;
  ctx.fillRect(cx - 33, cy + 63, 66 * frac, 7);
  ctx.fillStyle = INK;
  ctx.fillText(`FUEL ${Math.round(plane.fuel)} L`, cx - 30, cy + 84);
  ctx.restore();
}

function drawLamps(ctx, cx, y, plane, time) {
  const lamps = [
    { text: 'STALL', on: plane.stalled, color: RED, blink: true },
    { text: 'LOW FUEL', on: plane.fuel < PLANE.fuelCapacity * 0.22, color: AMBER, blink: false },
    { text: 'DAMAGE', on: plane.damage > 45, color: RED, blink: false },
    { text: 'CRATE', on: !!plane.carrying, color: GREEN, blink: false },
  ];
  ctx.save();
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lamps.forEach((lamp, i) => {
    const x = cx + (i - (lamps.length - 1) / 2) * 92;
    const lit = lamp.on && (!lamp.blink || Math.sin(time * 10) > -0.2);
    ctx.fillStyle = lit ? lamp.color : 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(x - 40, y - 10, 80, 20, 4); ctx.fill();
    ctx.fillStyle = lit ? '#14100c' : 'rgba(232,226,210,0.35)';
    ctx.fillText(lamp.text, x, y + 1);
  });
  ctx.restore();
}
