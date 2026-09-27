#!/usr/bin/env node
// Measures every mark's construction from its own path data, so the Notes layer can draw
// what is really there instead of what someone typed. For each mark it finds:
//   circles and arcs (fitted per curve segment, merged across the mark), axis-aligned ellipses,
//   straight edges, parts and holes, repeated parts with their orbit and pitch, rotational and
//   mirror symmetry, circle relations (concentric, equal, centred on another's edge, tangent),
//   ring weights, contacts and small gaps between parts, and simple ratios.
// It then checks every number in the current spec and corner notes against those measurements.
//
//   node scripts/measure-marks.mjs              all marks: scripts/data/measure.json + measure-report.md
//   node scripts/measure-marks.mjs 058 075      only these ids, report printed to the terminal
//
// Units are the house viewBox units (u). The mark sits on centre (100,100).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const a = html.indexOf('const S = [') + 10, b = html.indexOf('\n];', a);
const S = JSON.parse(html.slice(a, b + 2));

const TOL = 0.35;                       // u: two centres or radii closer than this are the same
const r2 = n => Math.round(n * 100) / 100, r1 = n => Math.round(n * 10) / 10;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ---------- markup: paths with their transforms ----------
function readMarkup(markup){
  const out = [], stack = [[1, 0, 0, 1, 0, 0]];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const parseT = t => {
    let m = [1, 0, 0, 1, 0, 0];
    for (const [, fn, args] of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
      const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
      if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
      else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
      else if (fn === 'matrix') m = mul(m, v);
      else if (fn === 'rotate') { const r = v[0] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); m = mul(m, [c, s, -s, c, 0, 0]); }
    }
    return m;
  };
  for (const [, close, tag, attrs, self] of markup.matchAll(/<(\/?)([a-z]+)\b([^>]*?)(\/?)>/g)) {
    if (tag !== 'g' && tag !== 'path') continue;
    if (close) { if (tag === 'g') stack.pop(); continue; }
    const at = k => (attrs.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const m = mul(stack[stack.length - 1], at('transform') ? parseT(at('transform')) : [1, 0, 0, 1, 0, 0]);
    if (tag === 'g') { if (!self) stack.push(m); continue; }
    const style = at('style') || '';
    const sw = Number((style.match(/stroke-width:\s*([\d.]+)/) || [])[1] || at('stroke-width') || 0);
    out.push({ d: at('d'), m, stroked: /\bstroked\b/.test(at('class') || ''), strokeWidth: sw * Math.hypot(m[0], m[1]) || null, evenodd: at('fill-rule') === 'evenodd' });
  }
  return out;
}

// ---------- path data: absolute segments ----------
function parseD(d, m){
  const tf = ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  const subs = []; let cur = null, pt = [0, 0], start = [0, 0], cmd = null, i = 0;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const P = (x, y) => rel ? [pt[0] + x, pt[1] + y] : [x, y];
    if (C === 'M') { pt = P(num(), num()); start = pt; cur = { segs: [], closed: false }; subs.push(cur); cmd = rel ? 'l' : 'L'; continue; }
    if (C === 'Z') { if (dist(pt, start) > 1e-6) cur.segs.push({ t: 'L', p: [tf(pt), tf(start)] }); cur.closed = true; pt = start; continue; }
    if (C === 'L') { const q = P(num(), num()); cur.segs.push({ t: 'L', p: [tf(pt), tf(q)] }); pt = q; continue; }
    if (C === 'H') { const x = num(), q = [rel ? pt[0] + x : x, pt[1]]; cur.segs.push({ t: 'L', p: [tf(pt), tf(q)] }); pt = q; continue; }
    if (C === 'V') { const y = num(), q = [pt[0], rel ? pt[1] + y : y]; cur.segs.push({ t: 'L', p: [tf(pt), tf(q)] }); pt = q; continue; }
    if (C === 'C') { const c1 = P(num(), num()), c2 = P(num(), num()), q = P(num(), num()); cur.segs.push({ t: 'C', p: [tf(pt), tf(c1), tf(c2), tf(q)] }); pt = q; continue; }
    throw new Error('unsupported path command ' + cmd);
  }
  return subs;
}
const bez = (p, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]); };
const segLen = s => s.t === 'L' ? dist(s.p[0], s.p[1]) : (() => { let L = 0, q = s.p[0]; for (let k = 1; k <= 16; k++) { const r = bez(s.p, k / 16); L += dist(q, r); q = r; } return L; })();
const sample = (s, n) => s.t === 'L' ? Array.from({ length: n + 1 }, (_, k) => [0, 1].map(j => s.p[0][j] + (s.p[1][j] - s.p[0][j]) * k / n)) : Array.from({ length: n + 1 }, (_, k) => bez(s.p, k / n));

// ---------- fits ----------
function solve3(M, v){
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d0 = det(M); if (Math.abs(d0) < 1e-12) return null;
  return [0, 1, 2].map(k => det(M.map((row, i) => row.map((x, j) => j === k ? v[i] : x))) / d0);
}
function fitCircle(pts){                  // Kasa: x² + y² + Dx + Ey + F = 0
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  for (const [x, y] of pts) { const row = [x, y, 1], w = -(x * x + y * y); for (let i = 0; i < 3; i++) { v[i] += row[i] * w; for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j]; } }
  const s = solve3(M, v); if (!s) return null;
  const cx = -s[0] / 2, cy = -s[1] / 2, r = Math.sqrt(cx * cx + cy * cy - s[2]);
  if (!(r > 0)) return null;
  const err = Math.max(...pts.map(p => Math.abs(dist(p, [cx, cy]) - r)));
  return { cx, cy, r, err };
}
function fitEllipse(pts){                 // axis-aligned: A x² + C y² + D x + E y = 1
  const rows = pts.map(([x, y]) => [x * x, y * y, x, y]);
  const M = [...Array(4)].map(() => Array(4).fill(0)), v = Array(4).fill(0);
  for (const r of rows) for (let i = 0; i < 4; i++) { v[i] += r[i]; for (let j = 0; j < 4; j++) M[i][j] += r[i] * r[j]; }
  // Gaussian elimination
  const A = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < 4; c++) { let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-14) return null; for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; } }
  const [Aa, Cc, D, E] = A.map((r, i) => r[4] / r[i]);
  if (!(Aa * Cc > 0)) return null;                     // same sign: an ellipse (the sign flips when it sits off the origin)
  const cx = -D / (2 * Aa), cy = -E / (2 * Cc), k = 1 + Aa * cx * cx + Cc * cy * cy;
  if (!(k / Aa > 0)) return null;
  const rx = Math.sqrt(k / Aa), ry = Math.sqrt(k / Cc);
  const err = Math.max(...pts.map(([x, y]) => { const t = Math.atan2((y - cy) / ry, (x - cx) / rx); return dist([x, y], [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }));
  return { cx, cy, rx, ry, err };
}

// ---------- geometry helpers ----------
function polyArea(pts){ let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; } return A / 2; }
function inside(pt, poly){ let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function hash(pts, cell = 1){ const g = new Map(); for (const p of pts) { const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); if (!g.has(k)) g.set(k, []); g.get(k).push(p); } return g; }
function nearest(g, p, cell = 1, reach = 3){ let best = Infinity; const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
  for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) { const l = g.get((cx + dx) + ',' + (cy + dy)); if (l) for (const q of l) { const d = dist(p, q); if (d < best) best = d; } } return best; }
const FRACTIONS = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [1, 8], [3, 8], [5, 8], [7, 8]];
function ratioName(x){
  for (const [n, d] of FRACTIONS) if (Math.abs(x - n / d) < 0.006) return `${n}/${d}`;
  if (Math.abs(x - 0.618) < 0.006) return 'golden (0.618)';
  if (Math.abs(x - Math.SQRT1_2) < 0.006) return '1/√2';
  return null;
}

const M_stroked = contours => contours.some(c => c.stroked);

// ---------- measure one mark ----------
function measure(s){
  const paths = readMarkup(s.mark);
  const contours = [];
  for (const [pi, p] of paths.entries()) for (const sub of parseD(p.d, p.m)) {
    const pts = [];
    for (const sg of sub.segs) { const n = Math.max(2, Math.ceil(segLen(sg) / 0.5)); const sp = sample(sg, n); pts.push(...(pts.length ? sp.slice(1) : sp)); }
    contours.push({ path: pi, sub, pts, stroked: p.stroked, strokeWidth: p.strokeWidth, area: polyArea(pts), len: sub.segs.reduce((t, sg) => t + segLen(sg), 0) });
  }
  // parts and holes by nesting depth (filled at even depth)
  for (const c of contours) {
    c.depth = contours.filter(o => o !== c && Math.abs(o.area) > Math.abs(c.area) && inside(c.pts[0], o.pts)).length;
    c.hole = !c.stroked && c.depth % 2 === 1;
  }
  const parts = contours.filter(c => c.stroked || !c.hole).map(c => {
    const holes = contours.filter(h => h.hole && h.depth === c.depth + 1 && inside(h.pts[0], c.pts));
    const all = [c, ...holes].flatMap(k => k.pts);
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const net = Math.abs(c.area) - holes.reduce((t, h) => t + Math.abs(h.area), 0);
    const per = c.len + holes.reduce((t, h) => t + h.len, 0);
    const cen = c.pts.reduce((q, p) => [q[0] + p[0], q[1] + p[1]], [0, 0]).map(v => v / c.pts.length);
    return { c, holes, box, area: net, per, cen };
  });

  // arcs: each run of curves between straight edges is tried whole as one circle, then as one
  // axis-aligned ellipse, then piece by piece; a curve that is really straight counts as an edge
  const arcs = [], ellipses = [], lines = [];
  const circOK = (f, pts) => f && f.r < 400 && f.err < Math.max(0.06, f.r * 0.003);
  const sweepOf = (f, pts) => { let t = 0; for (let k = 1; k < pts.length; k++) { let d = Math.atan2(pts[k][1] - f.cy, pts[k][0] - f.cx) - Math.atan2(pts[k - 1][1] - f.cy, pts[k - 1][0] - f.cx); d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; t += d; } return Math.abs(t) * 180 / Math.PI; };
  const straight = sg => { if (sg.t === 'L') return true; const f = fitCircle(sample(sg, 8)); return !f || f.r > 1500; };
  const addLine = (sg, c) => { const L = segLen(sg); if (L < 0.4) return; const [p, q] = [sg.p[0], sg.p[sg.p.length - 1]];
    lines.push({ p, q, len: L, ang: ((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI) + 360) % 180, contour: c }); };
  function takeRun(run, c){
    if (!run.length) return;
    const pts = run.flatMap((sg, k) => sample(sg, 12).slice(k ? 1 : 0));
    const f = fitCircle(pts);
    if (circOK(f, pts)) { arcs.push({ ...f, sweep: sweepOf(f, pts), pts, contour: c }); return; }
    if (run.length >= 2) {
      const e = fitEllipse(pts);
      if (e && e.err < 0.1 && Math.abs(e.rx - e.ry) > 0.6 && e.rx < 300 && e.ry < 300) { ellipses.push({ ...e, pts, contour: c }); return; }
      // split the run where it stops being one circle: grow each piece while it still fits
      let piece = [run[0]];
      for (let k = 1; k < run.length; k++) {
        const test = [...piece, run[k]], tp = test.flatMap((sg, j) => sample(sg, 12).slice(j ? 1 : 0));
        if (circOK(fitCircle(tp), tp)) piece = test; else { takeRun(piece, c); piece = [run[k]]; }
      }
      if (piece.length < run.length) { takeRun(piece, c); return; }
    }
    for (const sg of run) { const q = sample(sg, 12), g = fitCircle(q); if (g && g.r < 400) arcs.push({ ...g, sweep: sweepOf(g, q), pts: q, contour: c, loose: !circOK(g, q) }); }
  }
  for (const c of contours) {
    let run = [];
    for (const sg of c.sub.segs) { if (straight(sg)) { takeRun(run, c); run = []; addLine(sg, c); } else run.push(sg); }
    takeRun(run, c);
  }
  // circles: arcs clustered by centre and radius
  // an arc joins a circle when its points lie on it; the circle is then refitted on all its points
  const circles = [];
  for (const arc of [...arcs].sort((p, q) => q.sweep - p.sweep)) {
    const on = k => Math.max(...arc.pts.map(p => Math.abs(dist(p, [k.cx, k.cy]) - k.r))) < Math.max(0.15, k.r * 0.004);
    let hit = circles.find(on);
    if (!hit) { circles.push({ cx: arc.cx, cy: arc.cy, r: arc.r, sweep: arc.sweep, arcs: [arc], pts: [...arc.pts] }); continue; }
    hit.arcs.push(arc); hit.pts.push(...arc.pts); hit.sweep = Math.min(360, hit.sweep + arc.sweep);
    const f = fitCircle(hit.pts); if (f) Object.assign(hit, { cx: f.cx, cy: f.cy, r: f.r });
  }
  circles.sort((p, q) => q.r - p.r);
  const big = k => k.r >= 4 && k.sweep >= 30;                          // corner fillets stay out of the story
  const bigCircles = circles.filter(big), fillets = circles.filter(k => !big(k));
  // circles of one radius: an orbit when three or more sit evenly on a ring of centres
  const radiusGroups = [];
  for (const c of bigCircles) { const g = radiusGroups.find(g => Math.abs(g.r - c.r) < TOL); if (g) g.list.push(c); else radiusGroups.push({ r: c.r, list: [c] }); }
  for (const g of radiusGroups) {
    if (g.list.length < 3) continue;
    const f = fitCircle(g.list.map(c => [c.cx, c.cy]));
    if (!f || f.err > 0.5 || f.r < 3) continue;
    const ang = g.list.map(c => (Math.atan2(c.cy - f.cy, c.cx - f.cx) * 180 / Math.PI + 360) % 360).sort((x, y) => x - y);
    const steps = ang.map((v, i) => ((ang[(i + 1) % ang.length] - v) + 360) % 360 || 360);
    g.orbit = { cx: f.cx, cy: f.cy, r: f.r, even: Math.max(...steps) - Math.min(...steps) < 1.5, pitch: 360 / g.list.length, start: ang[0] };
  }

  // whole-mark box and outline centroid
  const cloud = contours.flatMap(c => c.pts);
  const xs = cloud.map(p => p[0]), ys = cloud.map(p => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const W = box[2] - box[0], H = box[3] - box[1];
  const cen = cloud.reduce((q, p) => [q[0] + p[0], q[1] + p[1]], [0, 0]).map(v => v / cloud.length);

  // symmetry: rotations and mirrors about the outline centroid (and the bbox centre)
  const g = hash(cloud);
  const err = f => { let t = 0, n = 0; for (let k = 0; k < cloud.length; k += 3) { t += nearest(g, f(cloud[k])); n++; } return t / n; };
  const sym = { rot: [], mirror: [] };
  for (const c0 of [cen, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]]) {
    for (let n = 2; n <= 12; n++) {
      const t = 2 * Math.PI / n, C = Math.cos(t), Sn = Math.sin(t);
      const e = err(([x, y]) => [c0[0] + (x - c0[0]) * C - (y - c0[1]) * Sn, c0[1] + (x - c0[0]) * Sn + (y - c0[1]) * C]);
      if (e < 0.25 && !sym.rot.some(r => r.n === n)) sym.rot.push({ n, err: r2(e), about: c0.map(r1) });
    }
    for (let deg = 0; deg < 180; deg += 7.5) {
      const t = deg * Math.PI / 180, C = Math.cos(2 * t), Sn = Math.sin(2 * t);
      const e = err(([x, y]) => { const dx = x - c0[0], dy = y - c0[1]; return [c0[0] + dx * C + dy * Sn, c0[1] + dx * Sn - dy * C]; });
      if (e < 0.25 && !sym.mirror.some(m => m.deg === deg)) sym.mirror.push({ deg, err: r2(e), about: c0.map(r1) });
    }
  }
  // keep only the highest rotation orders that aren't implied by another (n=6 implies 2 and 3)
  sym.rot = sym.rot.filter(r => !sym.rot.some(o => o.n > r.n && o.n % r.n === 0));

  // repeated parts: same area and perimeter
  const groups = [];
  for (const p of parts) {
    const hit = groups.find(gp => Math.abs(gp[0].area - p.area) / Math.max(1, gp[0].area) < 0.015 && Math.abs(gp[0].per - p.per) / gp[0].per < 0.015);
    if (hit) hit.push(p); else groups.push([p]);
  }
  const repeats = groups.filter(gp => gp.length > 1).map(gp => {
    const c0 = cen, ang = gp.map(p => (Math.atan2(p.cen[1] - c0[1], p.cen[0] - c0[0]) * 180 / Math.PI + 360) % 360).sort((x, y) => x - y);
    const steps = ang.map((v, i) => ((ang[(i + 1) % ang.length] - v) + 360) % 360 || 360);
    const orbit = gp.map(p => dist(p.cen, c0));
    const even = Math.max(...steps) - Math.min(...steps) < 1.5 && Math.max(...orbit) - Math.min(...orbit) < 0.8;
    return { count: gp.length, area: r1(gp[0].area), size: [r1(gp[0].box[2] - gp[0].box[0]), r1(gp[0].box[3] - gp[0].box[1])],
      ...(even ? { orbit: r1(orbit.reduce((t, v) => t + v, 0) / orbit.length), pitch: r1(360 / gp.length) } : { centres: gp.map(p => p.cen.map(r1)) }) };
  });

  // circle relations, each kind reported once per pair of radii
  const rel = [], relSeen = new Set();
  const say = (key, text) => { if (!relSeen.has(key)) { relSeen.add(key); rel.push(text); } };
  for (const g of radiusGroups) if (g.orbit) say('orbit' + r1(g.r), `${g.list.length} × R ${r1(g.r)} on an orbit R ${r1(g.orbit.r)} about ${r1(g.orbit.cx)},${r1(g.orbit.cy)}${g.orbit.even ? `, pitch ${r1(g.orbit.pitch)}°` : ', uneven spacing'}`);
  const inOrbit = c => radiusGroups.some(g => g.orbit && g.list.includes(c));
  const K = bigCircles.slice(0, 16);
  for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
    const p = K[i], q = K[j], d = Math.hypot(p.cx - q.cx, p.cy - q.cy), pr = `${r1(p.r)}|${r1(q.r)}`;
    const tag = `R ${r1(p.r)} & R ${r1(q.r)}`, off = v => v < 0.05 ? '' : ` (${r2(v)}u off)`;
    if (d < TOL) { say('con' + pr, `${tag}: concentric, ring weight ${r1(p.r - q.r)}`); continue; }
    if (!(inOrbit(p) && inOrbit(q))) say('cc' + pr + r1(d), `${tag}: c–c ${r1(d)}${Math.abs(p.r - q.r) < TOL ? ' (equal radii)' : ''}`);
    if (Math.abs(d - p.r) < TOL) say('edge' + pr, `${tag}: centre of R ${r1(q.r)} sits on the edge of R ${r1(p.r)}${off(Math.abs(d - p.r))}`);
    if (Math.abs(d - q.r) < TOL) say('edge2' + pr, `${tag}: centre of R ${r1(p.r)} sits on the edge of R ${r1(q.r)}${off(Math.abs(d - q.r))}`);
    if (Math.abs(d - (p.r + q.r)) < TOL) say('to' + pr, `${tag}: tangent outside${off(Math.abs(d - (p.r + q.r)))}`);
    if (Math.abs(d - Math.abs(p.r - q.r)) < TOL) say('ti' + pr, `${tag}: tangent inside${off(Math.abs(d - Math.abs(p.r - q.r)))}`);
    if (d < p.r + q.r - TOL && d > Math.abs(p.r - q.r) + TOL) {
      const x = (d * d + p.r * p.r - q.r * q.r) / (2 * d), h = Math.sqrt(Math.max(0, p.r * p.r - x * x));
      say('ov' + pr + r1(d), `${tag}: overlap, lens ${r1(p.r + q.r - d)} wide, ${r1(2 * h)} tall`);
    }
  }
  // ellipse against circles: stress (thick at one axis, thin at the other)
  for (const e of ellipses) {
    const k = bigCircles.find(c => Math.hypot(c.cx - e.cx, c.cy - e.cy) < TOL * 2 && c.r > Math.max(e.rx, e.ry));
    if (k) say('el' + r1(e.rx) + r1(e.ry) + r1(k.r), `ellipse ${r1(e.rx)} × ${r1(e.ry)} inside R ${r1(k.r)}: weight ${r1(k.r - e.rx)} at the sides, ${r1(k.r - e.ry)} top and bottom`);
  }

  // contacts and small gaps between parts (and between a part and a hole it doesn't own)
  const gaps = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const P = parts[i], Q = parts[j];
    if (P.box[0] > Q.box[2] + 8 || Q.box[0] > P.box[2] + 8 || P.box[1] > Q.box[3] + 8 || Q.box[1] > P.box[3] + 8) continue;
    const gq = hash([Q.c, ...Q.holes].flatMap(k => k.pts));
    let best = Infinity; for (const p of [P.c, ...P.holes].flatMap(k => k.pts)) { const d = nearest(gq, p, 1, 8); if (d < best) best = d; }
    if (best < 8) gaps.push({ parts: [i, j], gap: r2(best) });
  }
  const gapValues = [...new Set(gaps.map(gp => r1(gp.gap)))].sort((x, y) => x - y);

  // stroked marks: where the centrelines cross (within a stroke and between strokes)
  let crossings = null;
  if (M_stroked(contours)) {
    const segs = [];
    contours.filter(c => c.stroked).forEach((c, ci) => { for (let k = 1; k < c.pts.length; k++) segs.push({ a: c.pts[k - 1], b: c.pts[k], ci, k }); });
    const hits = [];
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const P = segs[i], Q = segs[j];
      if (P.ci === Q.ci && Math.abs(P.k - Q.k) < 4) continue;          // neighbours along the same line
      const d1 = [P.b[0] - P.a[0], P.b[1] - P.a[1]], d2 = [Q.b[0] - Q.a[0], Q.b[1] - Q.a[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-9) continue;
      const t = ((Q.a[0] - P.a[0]) * d2[1] - (Q.a[1] - P.a[1]) * d2[0]) / den, u = ((Q.a[0] - P.a[0]) * d1[1] - (Q.a[1] - P.a[1]) * d1[0]) / den;
      if (t >= 0 && t < 1 && u >= 0 && u < 1) { const x = [P.a[0] + t * d1[0], P.a[1] + t * d1[1]]; if (!hits.some(h => dist(h, x) < 2)) hits.push(x); }
    }
    crossings = hits.map(h => h.map(r1));
  }

  // straight edges: distinct directions and the long ones
  const dirs = [...new Set(lines.filter(l => l.len > 3).map(l => Math.round(l.ang * 2) / 2))].sort((x, y) => x - y);

  // simple ratios worth checking against a design intent
  const ratios = [];
  const note = (label, x) => { const n = ratioName(x); if (n) ratios.push(`${label} = ${n} (${x.toFixed(3)})`); };
  if (K.length >= 2) for (let i = 0; i < Math.min(K.length, 5); i++) for (let j = i + 1; j < Math.min(K.length, 5); j++) note(`R ${r1(K[j].r)} / R ${r1(K[i].r)}`, K[j].r / K[i].r);
  note('height / width', Math.min(W, H) / Math.max(W, H));

  return { s, paths, parts, contours, arcs, circles: bigCircles, radiusGroups, fillets, crossings, ellipses, lines, box, W, H, cen, sym, repeats, rel, gaps, gapValues, dirs, ratios };
}

// ---------- claim check: every number in the spec and corner notes ----------
function claims(s, M){
  const notes = [...(s.con || '').matchAll(/<text(?![^>]*class="lbl")[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).filter(t => !/[a-z]{4,}/.test(t));
  const texts = [s.spec || '', ...notes];
  const lengths = new Set(), angles = new Set(), counts = new Set();
  M.circles.forEach(c => { lengths.add(c.r); lengths.add(2 * c.r); });
  M.ellipses.forEach(e => { lengths.add(e.rx); lengths.add(e.ry); lengths.add(2 * e.rx); lengths.add(2 * e.ry); });
  [M.W, M.H, M.W / 2, M.H / 2].forEach(v => lengths.add(v));
  lengths.add(Math.max(...M.contours.flatMap(c => c.pts).map(p => dist(p, M.cen))));   // reach from the centre
  M.parts.forEach(p => { lengths.add(p.box[2] - p.box[0]); lengths.add(p.box[3] - p.box[1]); });
  M.repeats.forEach(r => { if (r.orbit) lengths.add(r.orbit); if (r.pitch) angles.add(r.pitch); counts.add(r.count); r.size.forEach(v => lengths.add(v)); });
  M.gaps.forEach(g => lengths.add(g.gap));
  M.radiusGroups.forEach(g => { counts.add(g.list.length); if (g.orbit) { lengths.add(g.orbit.r); angles.add(g.orbit.pitch); } });
  for (const c of M.circles) for (const k of M.circles) if (c !== k) { const d = Math.hypot(c.cx - k.cx, c.cy - k.cy); lengths.add(d); lengths.add(Math.abs(c.r - k.r)); lengths.add(c.r + k.r - d); }
  for (const e of M.ellipses) for (const c of M.circles) if (Math.hypot(c.cx - e.cx, c.cy - e.cy) < 0.7) { lengths.add(c.r - e.rx); lengths.add(c.r - e.ry); }
  // offsets from the centre line and between parallel edges
  M.lines.forEach(l => { lengths.add(l.len); if (Math.abs(l.ang) < 0.5 || Math.abs(l.ang - 180) < 0.5) lengths.add(Math.abs(l.p[1] - 100)); if (Math.abs(l.ang - 90) < 0.5) lengths.add(Math.abs(l.p[0] - 100)); });
  for (const c of M.circles) M.lines.forEach(l => { if (Math.abs(l.ang) < 0.5 || Math.abs(l.ang - 180) < 0.5) lengths.add(Math.abs(l.p[1] - c.cy)); if (Math.abs(l.ang - 90) < 0.5) lengths.add(Math.abs(l.p[0] - c.cx)); });
  M.sym.rot.forEach(r => { angles.add(360 / r.n); counts.add(r.n); });
  M.dirs.forEach(d => angles.add(d)); M.dirs.forEach(d => angles.add(90 - d)); M.dirs.forEach(d => angles.add(Math.abs(d - 90)));
  counts.add(M.parts.length); if (M.crossings) counts.add(M.crossings.length);
  M.parts.forEach(p => counts.add(p.holes.length)); counts.add(M.parts.reduce((t, p) => t + p.holes.length, 0)); counts.add(M.circles.filter(c => c.sweep > 300).length); counts.add(M.contours.length);
  const has = (set, v, rel) => [...set].some(x => Math.abs(x - v) <= Math.max(0.35, rel * v));
  const out = [];
  for (const t of texts) for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(°|u\b|U\b)?/g)) {
    const v = Number(m[1]), unit = m[2] || '', before = t.slice(Math.max(0, m.index - 12), m.index), after = t.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const int = Number.isInteger(v);
    let kind = unit === '°' || /^\s*°/.test(after) ? 'angle'
      : int && (/^\s*×\s*(R\b|□|[a-z]{3,})/i.test(after) || /^\s*[a-z]{3,}/i.test(after)) ? 'count' : 'length';
    if (/\/\s*$/.test(before) || /^\s*\//.test(after)) kind = 'ratio';
    const ok = kind === 'angle' ? has(angles, v, 0.01) : kind === 'count' ? counts.has(v) || has(lengths, v, 0.01) : kind === 'ratio' ? null : has(lengths, v, 0.012);
    out.push({ text: t.trim(), value: m[0].trim(), kind, ok });
  }
  // dedupe (the spec and the notes repeat each other)
  const seen = new Set(); return out.filter(c => { const k = c.value + c.kind; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------- report ----------
function report(M){
  const { s } = M, L = [];
  L.push(`## ${s.id} ${s.name} (${s.cat})`);
  L.push(`spec: ${s.spec}`);
  L.push(`box ${r1(M.box[0])},${r1(M.box[1])} to ${r1(M.box[2])},${r1(M.box[3])}  ·  ${r1(M.W)} × ${r1(M.H)}u  ·  outline centre ${M.cen.map(r1).join(',')}`);
  L.push(`parts ${M.parts.length}${M.parts.some(p => p.holes.length) ? ` (holes: ${M.parts.map(p => p.holes.length).join('/')})` : ''}${M.paths.some(p => p.stroked) ? `  ·  stroked, weight ${[...new Set(M.paths.map(p => p.strokeWidth && r2(p.strokeWidth)).filter(Boolean))].join('/') || '2'}` : ''}`);
  if (M.circles.length) L.push('circles: ' + M.radiusGroups.map(g => g.list.length > 3 ? `${g.list.length} × R ${r2(g.r)} (${Math.round(Math.min(...g.list.map(c => c.sweep)))}–${Math.round(Math.max(...g.list.map(c => c.sweep)))}°)`
    : g.list.map(c => `R ${r2(c.r)} @ ${r1(c.cx)},${r1(c.cy)} (${Math.round(c.sweep)}°)`).join('  ·  ')).join('  ·  '));
  if (M.fillets.length) L.push(`fillets: ${[...new Set(M.fillets.map(f => r2(f.r)))].join(', ')}`);
  if (M.ellipses.length) L.push('ellipses: ' + M.ellipses.map(e => `${r2(e.rx)} × ${r2(e.ry)} @ ${r1(e.cx)},${r1(e.cy)}`).join('  ·  '));
  if (M.dirs.length) L.push(`straight edges at: ${M.dirs.join('°, ')}°  (${M.lines.filter(l => l.len > 3).length} edges over 3u)`);
  if (M.repeats.length) L.push('repeats: ' + M.repeats.map(r => `${r.count} × part ${r.size.join('×')}u` + (r.orbit ? ` on orbit ${r.orbit}u, pitch ${r.pitch}°` : r.centres.length <= 6 ? ` at ${r.centres.map(c => c.join(',')).join(' / ')}` : ' (not on one orbit)')).join('  ·  '));
  if (M.crossings) L.push(`stroke crossings: ${M.crossings.length}${M.crossings.length ? ' at ' + M.crossings.map(c => c.join(',')).join(' / ') : ''}`);
  L.push(`symmetry: ${M.sym.rot.length ? M.sym.rot.map(r => `${r.n}-fold`).join(', ') : 'no rotation'}; ${M.sym.mirror.length ? 'mirror at ' + M.sym.mirror.map(m => m.deg + '°').join(', ') : 'no mirror'}`);
  if (M.rel.length) L.push('relations:\n  ' + M.rel.join('\n  '));
  if (M.gaps.length) L.push(`contacts/gaps between parts: ${M.gaps.map(g => g.gap < 0.05 ? `${g.parts.join('-')} touch` : `${g.parts.join('-')} ${g.gap}u`).join(', ')}`);
  if (M.ratios.length) L.push(`ratios: ${M.ratios.join('; ')}`);
  const C = claims(s, M);
  if (C.length) L.push('claims: ' + C.map(c => `${c.value}${c.kind === 'count' ? ' (count)' : ''} ${c.ok === true ? '✓' : c.ok === false ? '✗' : '?'}`).join('  '));
  return { text: L.join('\n'), claims: C };
}

const ids = process.argv.slice(2).map(x => 'SYM-' + x.replace(/^SYM-/i, '').padStart(3, '0'));
const list = ids.length ? S.filter(s => ids.includes(s.id)) : S;
const results = list.map(s => { try { const M = measure(s); const R = report(M); return { M, R }; } catch (e) { return { err: `${s.id}: ${e.message}` }; } });
const text = results.map(r => r.err || r.R.text).join('\n\n');
if (ids.length) { console.log(text); process.exit(0); }
const failed = results.filter(r => r.R && r.R.claims.some(c => c.ok === false));
const head = `# Mark measurements\n\nGenerated by scripts/measure-marks.mjs from index.html. ${list.length} marks. ✓ = the number is in the geometry, ✗ = it is not (to check), ? = a ratio, checked by eye.\n\n${failed.length} marks have at least one ✗: ${failed.map(r => r.M.s.id.slice(4) + ' ' + r.M.s.name).join(', ')}\n\n`;
fs.mkdirSync(path.join(ROOT, 'scripts/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scripts/data/measure-report.md'), head + text + '\n');
fs.writeFileSync(path.join(ROOT, 'scripts/data/measure.json'), JSON.stringify(results.filter(r => r.M).map(({ M, R }) => ({
  id: M.s.id, name: M.s.name, box: M.box.map(r2), size: [r2(M.W), r2(M.H)], centre: M.cen.map(r2), parts: M.parts.length,
  circles: M.circles.map(c => ({ cx: r2(c.cx), cy: r2(c.cy), r: r2(c.r), sweep: Math.round(c.sweep) })),
  ellipses: M.ellipses.map(e => ({ cx: r2(e.cx), cy: r2(e.cy), rx: r2(e.rx), ry: r2(e.ry) })),
  edges: M.dirs, repeats: M.repeats, symmetry: M.sym, relations: M.rel, gaps: M.gaps, ratios: M.ratios, claims: R.claims,
})), null, 1));
console.log(`measured ${list.length} marks → scripts/data/measure-report.md, measure.json · ${failed.length} with claims to check`);
for (const r of results.filter(r => r.err)) console.log('error', r.err);
