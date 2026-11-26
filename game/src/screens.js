// screens.js — the still screens between flights: title, sortie briefing,
// debrief with the score broken down, the crash card and the campaign end.
// All drawn as translucent panels over the live 3D scene, so the valley is
// always behind the words.

const INK = '#f2ecdc';
const AMBER = '#ffb042';
const DIM = 'rgba(242,236,220,0.72)';
const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function panel(ctx, w, h, pw, ph) {
  const x = (w - pw) / 2, y = (h - ph) / 2;
  ctx.fillStyle = 'rgba(12,12,18,0.78)';
  ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,176,66,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, pw, ph, 14); ctx.stroke();
  return { x, y };
}

function title(ctx, w, y, text, size, color = INK) {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, y);
}

function line(ctx, w, y, text, size = 15, color = DIM, bold = false) {
  ctx.font = `${bold ? '700' : '400'} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, y);
}

export function drawTitle(ctx, w, h, best) {
  title(ctx, w, h * 0.30, 'EMBERPASS AIRLIFT', 54, AMBER);
  line(ctx, w, h * 0.30 + 44, 'A bush-flying campaign in a volcanic valley at dusk', 17, INK);
  line(ctx, w, h * 0.30 + 78, 'Three sorties: a ring run, a supply drop on Ember Camp, and a slalom in the pass wind.', 14.5);
  line(ctx, w, h * 0.30 + 102, 'Land each one on the strip and stop. Rings, drops and landings all score.', 14.5);
  const controls = [
    'FLY — ↑ ↓ pitch · ← → bank · or hold the mouse and steer',
    'THROTTLE — SHIFT up · CTRL down · SPACE brake',
    'F — release the crate · C — chase / cockpit · P — pause',
  ];
  controls.forEach((c, i) => line(ctx, w, h * 0.52 + i * 26, c, 14.5, INK));
  line(ctx, w, h * 0.70, 'PRESS ENTER TO FLY SORTIE 1', 19, AMBER, true);
  if (best > 0) line(ctx, w, h * 0.70 + 34, `Best campaign so far: ${best}`, 14, DIM);
  line(ctx, w, h - 26, 'An original game built for make.fun — every rock, ring and rivet drawn in code.', 12, 'rgba(242,236,220,0.45)');
}

export function drawBriefing(ctx, w, h, sortie) {
  const { x, y } = panel(ctx, w, h, 720, 400);
  title(ctx, w, y + 64, sortie.def.name.toUpperCase(), 25, AMBER);
  line(ctx, w, y + 100, sortie.def.sub, 15, INK);
  sortie.def.brief.forEach((l, i) => line(ctx, w, y + 148 + i * 27, l, 14.5));
  const windKt = Math.round(Math.hypot(sortie.def.wind[0], sortie.def.wind[2]) * 1.944);
  line(ctx, w, y + 148 + sortie.def.brief.length * 27 + 14,
    `Wind ${windKt} kt${sortie.def.gusts ? ' and gusting' : ''} · Par ${Math.floor(sortie.def.par / 60)}:${String(sortie.def.par % 60).padStart(2, '0')} · Fuel full`, 13.5, DIM);
  line(ctx, w, y + 356, 'PRESS ENTER — ENGINE RUNNING', 16, AMBER, true);
  void x;
}

export function drawDebrief(ctx, w, h, sortie, campaignScore, isLast) {
  const r = sortie.result;
  const { y } = panel(ctx, w, h, 640, 470);
  title(ctx, w, y + 58, r.crashed ? 'SORTIE OVER' : 'SORTIE COMPLETE', 25, r.crashed ? '#ff5340' : AMBER);
  line(ctx, w, y + 92, r.verdict, 15, INK);
  const rows = [
    ['Rings flown', r.parts.rings],
    ...(sortie.def.dropZone ? [['Crate drop', r.parts.drop]] : []),
    ['Landing', r.parts.landing],
    ['Touchdown zone', r.parts.zone],
    ['Sink rate', r.parts.sink],
    ['Centreline', r.parts.centreline],
    ['Time bonus', r.parts.time],
    ['Fuel bonus', r.parts.fuel],
    ['Damage', -r.parts.damagePenalty],
  ];
  rows.forEach(([label, val], i) => {
    const ry = y + 132 + i * 27;
    ctx.font = `400 15px ${FONT}`;
    ctx.textAlign = 'left'; ctx.fillStyle = DIM;
    ctx.fillText(label, w / 2 - 190, ry);
    ctx.textAlign = 'right'; ctx.fillStyle = INK;
    ctx.fillText(`${val}`, w / 2 + 190, ry);
  });
  const ty = y + 132 + rows.length * 27 + 12;
  ctx.font = `700 19px ${FONT}`;
  ctx.textAlign = 'left'; ctx.fillStyle = AMBER;
  ctx.fillText('SORTIE SCORE', w / 2 - 190, ty);
  ctx.textAlign = 'right';
  ctx.fillText(`${r.total}`, w / 2 + 190, ty);
  ctx.textAlign = 'center';
  line(ctx, w, ty + 38, `Campaign so far: ${campaignScore}`, 14, DIM);
  line(ctx, w, y + 436, isLast ? 'PRESS ENTER FOR THE FINAL STANDINGS' : 'PRESS ENTER FOR THE NEXT SORTIE', 15, AMBER, true);
}

export function drawCampaignEnd(ctx, w, h, total, results) {
  const { y } = panel(ctx, w, h, 620, 420);
  title(ctx, w, y + 62, 'CAMPAIGN COMPLETE', 27, AMBER);
  results.forEach((r, i) => {
    const ry = y + 118 + i * 34;
    ctx.font = `400 16px ${FONT}`;
    ctx.textAlign = 'left'; ctx.fillStyle = DIM;
    ctx.fillText(`Sortie ${i + 1}`, w / 2 - 170, ry);
    ctx.textAlign = 'right'; ctx.fillStyle = INK;
    ctx.fillText(`${r.total}`, w / 2 + 170, ry);
  });
  ctx.font = `800 24px ${FONT}`;
  ctx.textAlign = 'left'; ctx.fillStyle = AMBER;
  ctx.fillText('TOTAL', w / 2 - 170, y + 118 + results.length * 34 + 22);
  ctx.textAlign = 'right';
  ctx.fillText(`${total}`, w / 2 + 170, y + 118 + results.length * 34 + 22);
  ctx.textAlign = 'center';
  line(ctx, w, y + 330, total >= 2100 ? 'The valley salutes you.' : total >= 1400 ? 'Fine flying, pilot.' : 'The valley keeps its secrets — fly it again.', 15, INK);
  line(ctx, w, y + 378, 'PRESS ENTER TO FLY THE CAMPAIGN AGAIN', 15, AMBER, true);
}

export function drawPaused(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,8,12,0.45)';
  ctx.fillRect(0, 0, w, h);
  title(ctx, w, h * 0.46, 'PAUSED', 34, AMBER);
  line(ctx, w, h * 0.46 + 40, 'P to resume · R to restart the sortie', 15, INK);
}
