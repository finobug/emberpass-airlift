// render3d.js — a small software 3D renderer on a 2D canvas: project the
// world through the camera, flat-shade every polygon against the dusk sun,
// sort back to front and paint. No library, no GPU: the whole look of the
// game (one warm dusk style) is built from these shaded polygons.

import { VIEW, PALETTE, WORLD } from './config.js';
import { groundHeight, groundColor, TREES, CAMP_BUILDINGS } from './terrain.js';
import { clamp, lerp } from './random.js';

// Direction toward the low sun, west-northwest: long warm light, long shadows.
export const SUN_DIR = norm3([-0.52, 0.30, -0.80]);

export function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// A camera is a position plus heading, pitch and roll (the same angles the
// flight model uses, so chase and cockpit views agree with the physics).
export function makeCamera(pos, heading, pitch, roll) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fwd = [Math.sin(heading) * cp, sp, -Math.cos(heading) * cp];
  let right = norm3(cross3(fwd, [0, 1, 0]));
  if (!isFinite(right[0])) right = [Math.cos(heading), 0, Math.sin(heading)];
  let up = cross3(right, fwd);
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2 = [right[0] * cr + up[0] * sr, right[1] * cr + up[1] * sr, right[2] * cr + up[2] * sr];
    const u2 = [up[0] * cr - right[0] * sr, up[1] * cr - right[1] * sr, up[2] * cr - right[2] * sr];
    right = r2; up = u2;
  }
  return { pos, fwd, right, up };
}

function shadeColor(color, n, flat) {
  if (flat) return color;
  const d = Math.max(0, dot3(n, SUN_DIR));
  const s = 0.42 + 0.58 * d;
  return [color[0] * s, color[1] * s, color[2] * s];
}

function fogBlend(color, depth) {
  const t = clamp((depth - VIEW.fogStart) / (VIEW.fogEnd - VIEW.fogStart), 0, 1);
  const f = t * t * (3 - 2 * t);
  return [lerp(color[0], PALETTE.fog[0], f), lerp(color[1], PALETTE.fog[1], f), lerp(color[2], PALETTE.fog[2], f)];
}

function rgb(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.focal = (canvas.height / 2) / Math.tan(VIEW.fovY / 2);
    this.faces = [];
  }

  begin(camera) {
    this.cam = camera;
    this.faces.length = 0;
  }

  // Queue one polygon (3+ world points). Options: flat (no sun shading),
  // fog (0..1 strength), alpha, billboard is handled by callers.
  poly(points, color, opts = {}) {
    const cam = this.cam;
    const view = [];
    let depthSum = 0;
    for (const p of points) {
      const dx = p[0] - cam.pos[0], dy = p[1] - cam.pos[1], dz = p[2] - cam.pos[2];
      view.push([
        dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2],
        dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2],
        dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2],
      ]);
      depthSum += view[view.length - 1][2];
    }
    // Clip against the near plane so geometry can cross the camera safely.
    const clipped = clipNear(view, VIEW.near);
    if (clipped.length < 3) return;
    // Face normal in world space, from the original points.
    const ux = points[1][0] - points[0][0], uy = points[1][1] - points[0][1], uz = points[1][2] - points[0][2];
    const vx = points[2][0] - points[0][0], vy = points[2][1] - points[0][1], vz = points[2][2] - points[0][2];
    let n = norm3([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
    if (dot3(n, [cam.pos[0] - points[0][0], cam.pos[1] - points[0][1], cam.pos[2] - points[0][2]]) < 0) {
      n = [-n[0], -n[1], -n[2]];
    }
    let c = shadeColor(color, n, opts.flat);
    const depth = depthSum / points.length;
    if (opts.fog !== 0) c = fogBlend(c, depth);
    this.faces.push({ pts: clipped, color: c, depth, alpha: opts.alpha ?? 1 });
  }

  // A camera-facing quad centred at a world point (clouds, glow, pillars).
  billboard(center, w, h, color, opts = {}) {
    const cam = this.cam;
    const r = cam.right, u = cam.up;
    const hw = w / 2, hh = h / 2;
    const pts = [
      [center[0] - r[0] * hw - u[0] * hh, center[1] - r[1] * hw - u[1] * hh, center[2] - r[2] * hw - u[2] * hh],
      [center[0] + r[0] * hw - u[0] * hh, center[1] + r[1] * hw - u[1] * hh, center[2] + r[2] * hw - u[2] * hh],
      [center[0] + r[0] * hw + u[0] * hh, center[1] + r[1] * hw + u[1] * hh, center[2] + r[2] * hw + u[2] * hh],
      [center[0] - r[0] * hw + u[0] * hh, center[1] - r[1] * hw + u[1] * hh, center[2] - r[2] * hw + u[2] * hh],
    ];
    this.poly(pts, color, opts);
  }

  // Paint the sky first (gradient, sun, glow), then every queued polygon.
  flush() {
    const { ctx, canvas } = this;
    const cam = this.cam;
    // Sky: a vertical gradient that tips with the camera's pitch and roll.
    const horizonY = canvas.height / 2 + (cam.fwd[1] * this.focal) + canvas.height * 0.02;
    const g = ctx.createLinearGradient(0, horizonY - canvas.height * 0.9, 0, horizonY + canvas.height * 0.35);
    g.addColorStop(0, rgb(PALETTE.skyTop));
    g.addColorStop(0.72, rgb(PALETTE.skyHorizon));
    g.addColorStop(1, rgb(PALETTE.skyLow));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The sun: project a far point along SUN_DIR and draw disc + halo.
    const sp = [cam.pos[0] + SUN_DIR[0] * 6000, cam.pos[1] + SUN_DIR[1] * 6000, cam.pos[2] + SUN_DIR[2] * 6000];
    const dx = sp[0] - cam.pos[0], dy = sp[1] - cam.pos[1], dz = sp[2] - cam.pos[2];
    const cz = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
    if (cz > 0) {
      const cx = dx * cam.right[0] + dy * cam.right[1] + dz * cam.right[2];
      const cy = dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2];
      const sx = canvas.width / 2 + (cx * this.focal) / cz;
      const sy = canvas.height / 2 - (cy * this.focal) / cz;
      const r = canvas.height * 0.055;
      const halo = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 5);
      halo.addColorStop(0, 'rgba(255,190,110,0.55)');
      halo.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sx - r * 5, sy - r * 5, r * 10, r * 10);
      ctx.fillStyle = rgb(PALETTE.sun);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    // Polygons, far to near.
    this.faces.sort((a, b) => b.depth - a.depth);
    for (const f of this.faces) {
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = rgb(f.color);
      ctx.beginPath();
      for (let i = 0; i < f.pts.length; i++) {
        const p = f.pts[i];
        const sx = canvas.width / 2 + (p[0] * this.focal) / p[2];
        const sy = canvas.height / 2 - (p[1] * this.focal) / p[2];
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Sutherland–Hodgman clip of a view-space polygon against z = near.
function clipNear(poly, near) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ain = a[2] >= near, bin = b[2] >= near;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
    }
  }
  return out;
}

// ---- Scene pieces -------------------------------------------------------

// Terrain as adaptive rings of tiles around a centre point: fine near,
// coarse far, always sampled from terrain.js so looks and physics agree.
export function drawTerrain(r, cx, cz) {
  const rings = [
    { tile: 55, from: 0, to: 620 },
    { tile: 110, from: 620, to: 1350 },
    { tile: 220, from: 1350, to: VIEW.terrainRadius },
  ];
  for (const ring of rings) {
    const t = ring.tile;
    const x0 = Math.floor((cx - ring.to) / t) * t, x1 = cx + ring.to;
    const z0 = Math.floor((cz - ring.to) / t) * t, z1 = cz + ring.to;
    for (let x = x0; x < x1; x += t) {
      for (let z = z0; z < z1; z += t) {
        const ccx = x + t / 2, ccz = z + t / 2;
        const d = Math.hypot(ccx - cx, ccz - cz);
        if (d < ring.from - t || d > ring.to + t) continue;
        const h00 = groundHeight(x, z), h10 = groundHeight(x + t, z);
        const h01 = groundHeight(x, z + t), h11 = groundHeight(x + t, z + t);
        const hc = (h00 + h10 + h01 + h11) / 4;
        const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / t;
        const color = groundColor(ccx, ccz, hc, slope);
        r.poly([[x, h00, z], [x + t, h10, z], [x + t, h11, z + t]], color);
        r.poly([[x, h00, z], [x + t, h11, z + t], [x, h01, z + t]], color);
      }
    }
  }
}

export function drawTrees(r, cx, cz) {
  for (const tree of TREES) {
    const d = Math.hypot(tree.x - cx, tree.z - cz);
    if (d > 1500) continue;
    const s = tree.s;
    const top = tree.h + 13 * s;
    const mid = tree.h + 7 * s;
    const w = 4.6 * s;
    // A pine as two stacked cones (4-sided pyramids) over a short trunk.
    r.poly([[tree.x - 1, tree.h, tree.z], [tree.x + 1, tree.h, tree.z], [tree.x + 0.4, mid - 3 * s, tree.z], [tree.x - 0.4, mid - 3 * s, tree.z]], PALETTE.pineTrunk);
    cone(r, tree.x, tree.h + 2.5 * s, tree.z, w, mid, PALETTE.pineTop);
    cone(r, tree.x, mid - 2 * s, tree.z, w * 0.68, top, PALETTE.pineTop);
  }
}

function cone(r, x, yBase, z, w, yTop, color) {
  const pts = [[x - w, yBase, z], [x, yBase, z - w], [x + w, yBase, z], [x, yBase, z + w]];
  for (let i = 0; i < 4; i++) {
    r.poly([pts[i], pts[(i + 1) % 4], [x, yTop, z]], color);
  }
}

// The runway: slab, centreline dashes, threshold bars and amber edge lights.
export function drawStrip(r) {
  const { stripLength: L, stripWidth: W, stripCenter: C } = WORLD;
  const y = 0.22;
  r.poly([[C.x - W / 2, y, C.z - L / 2], [C.x + W / 2, y, C.z - L / 2], [C.x + W / 2, y, C.z + L / 2], [C.x - W / 2, y, C.z + L / 2]], PALETTE.strip, { flat: true });
  for (let z = -L / 2 + 60; z < L / 2 - 40; z += 55) {
    r.poly([[C.x - 1.1, y + 0.03, z], [C.x + 1.1, y + 0.03, z], [C.x + 1.1, y + 0.03, z + 26], [C.x - 1.1, y + 0.03, z + 26]], PALETTE.stripMark, { flat: true });
  }
  for (const end of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const bx = C.x + i * 5.4;
      const bz = C.z + end * (L / 2 - 26);
      r.poly([[bx - 1.6, y + 0.03, bz - end * 11], [bx + 1.6, y + 0.03, bz - end * 11], [bx + 1.6, y + 0.03, bz + end * 11], [bx - 1.6, y + 0.03, bz + end * 11]], PALETTE.stripMark, { flat: true });
    }
  }
  for (let z = -L / 2 + 12; z < L / 2; z += 47) {
    for (const side of [-1, 1]) {
      const lx = C.x + side * (W / 2 + 2.5);
      r.billboard([lx, y + 1.1, z], 1.5, 1.5, PALETTE.stripEdge, { flat: true, fog: 0.4 });
    }
  }
}

// A target ring: 14 segments around a circle, facing along its axis.
export function drawRing(r, ring, color) {
  const seg = 14, rad = ring.radius;
  const axis = norm3(ring.axis);
  const u = norm3(cross3(axis, [0, 1, 0]));
  const v = cross3(axis, u);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, rr) => [
      ring.center[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * rr,
      ring.center[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * rr,
      ring.center[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * rr,
    ];
    r.poly([p(a0, rad - 1.6), p(a1, rad - 1.6), p(a1, rad + 1.6), p(a0, rad + 1.6)], color, { flat: true, fog: 0.35 });
  }
  // A soft pillar of light so the next ring reads from far away.
  if (ring.beacon) {
    r.billboard([ring.center[0], ring.center[1] + 130, ring.center[2]], 7, 260, color, { flat: true, fog: 0.2, alpha: 0.16 });
  }
}

// Ember Camp: cabins with pitched roofs, plus the drop target on the flat.
export function drawCamp(r) {
  const { camp } = WORLD;
  for (const b of (drawCamp.buildings ??= CAMP_BUILDINGS)) {
    const x = camp.x + b.dx, z = camp.z + b.dz;
    const y = groundHeight(x, z);
    const wall = b.hue ? [150, 116, 78] : [128, 96, 66];
    const roof = [86, 58, 44];
    box(r, [x, y + b.h / 2, z], [b.w, b.h, b.d], 0, wall);
    const ridge = y + b.h + 2.6;
    r.poly([[x - b.w / 2 - 1, y + b.h, z - b.d / 2 - 1], [x + b.w / 2 + 1, y + b.h, z - b.d / 2 - 1], [x + b.w / 2 + 1, ridge, z], [x - b.w / 2 - 1, ridge, z]], roof);
    r.poly([[x - b.w / 2 - 1, y + b.h, z + b.d / 2 + 1], [x - b.w / 2 - 1, ridge, z], [x + b.w / 2 + 1, ridge, z], [x + b.w / 2 + 1, y + b.h, z + b.d / 2 + 1]], roof);
  }
}

// A simple oriented box: centre, size, heading. Used for buildings, the
// crate, and most of the aircraft.
export function box(r, c, s, heading, color, opts = {}) {
  const ch = Math.cos(heading), sh = Math.sin(heading);
  const loc = (lx, ly, lz) => [c[0] + lx * ch + lz * sh, c[1] + ly, c[2] - lx * sh + lz * ch];
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const A = loc(-hx, -hy, -hz), B = loc(hx, -hy, -hz), C = loc(hx, -hy, hz), D = loc(-hx, -hy, hz);
  const E = loc(-hx, hy, -hz), F = loc(hx, hy, -hz), G = loc(hx, hy, hz), H = loc(-hx, hy, hz);
  r.poly([A, B, C, D], color, opts);
  r.poly([E, H, G, F], color, opts);
  r.poly([A, E, F, B], color, opts);
  r.poly([B, F, G, C], color, opts);
  r.poly([C, G, H, D], color, opts);
  r.poly([D, H, E, A], color, opts);
}
