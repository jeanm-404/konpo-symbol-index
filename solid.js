// Solid 3D hover. index.html fetches it as the index reveals (never before the intro ends).
// Every mark is built from its own SVG: parts that are true discs become spheres, a disc
// with a flat cut becomes a sliced sphere, outline (stroked) parts become round wire, and
// everything else is extruded with a bevel. Each mark turns once about its own axis
// (seeded by its id, inside GUARD), inflating out of the drawing as it starts and folding
// back into it as it lands, so the first and last frames ARE the drawing.
// One renderer is shared by the whole field: its canvas moves into whichever tile plays,
// or, for the arrival wave, spans the field and draws every visible tile in its own viewport.
// Prototyped in pilot/solid-gallery.html.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FOV = 60.8, D = 128 / Math.tan(FOV * Math.PI / 360);   // the tile's framing: 256 units at the mark plane
const DEPTH = 6;

const bez = (x1, x2) => { const y1 = 0, y2 = 1; const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { let t = x; for (let i = 0; i < 6; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } t = Math.min(1, Math.max(0, t)); return ((ay * t + by) * t + cy) * t; }; };

// the guardrails every mark's own version stays inside: one full turn (so it always lands
// on the drawing), an axis that never lies flat in the plane or points at the camera, and
// a pace and curve near the card motion (cubic-bezier .66,0,.34,1 over 2.2s)
const GUARD = { tilt: [30, 80], dur: [1900, 2600], twistChance: 0.4, x1: [0.56, 0.74], x2: [0.26, 0.44] };
const rng = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
function signature(id){
  const r = rng(id + ':0'); for (let i = 0; i < 4; i++) r();   // stir: similar ids start far apart
  const lerp = ([a, b]) => a + (b - a) * r();
  const tilt = lerp(GUARD.tilt), az = r() * 360, T = tilt * Math.PI / 180, A = az * Math.PI / 180;
  const sig = { dir: r() < 0.5 ? -1 : 1, dur: lerp(GUARD.dur),
    twist: r() < GUARD.twistChance ? (r() < 0.5 ? -1 : 1) : 0, ease: bez(lerp(GUARD.x1), lerp(GUARD.x2)) };
  sig.axis = new THREE.Vector3(Math.sin(T) * Math.cos(A), Math.sin(T) * Math.sin(A), Math.cos(T));
  return sig;
}
const Z = new THREE.Vector3(0, 0, 1), REST = new THREE.Quaternion();
const poseAt = (k, sig) => new THREE.Quaternion().setFromAxisAngle(sig.axis, sig.dir * k * 2 * Math.PI)
  .multiply(new THREE.Quaternion().setFromAxisAngle(Z, sig.twist * k * 2 * Math.PI));
// how "3D" the mark is through a run: 0 = the flat drawing, 1 = full solid
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const solidity = u => Math.min(smooth(u / 0.24), smooth((1 - u) / 0.34));

// a part is a disc when it is one closed outline, no holes, and stays round all the way
function discOf(shape){
  if (shape.holes.length) return null;
  const pts = shape.getSpacedPoints(120);        // evenly spaced: curve-dense sampling made a rounded bar look round
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rs = pts.map(p => Math.hypot(p.x - cx, p.y - cy)), r = rs.reduce((s, v) => s + v, 0) / rs.length;
  const dev = Math.max(...rs.map(v => Math.abs(v - r))) / r;
  const area = Math.abs(THREE.ShapeUtils.area(shape.getPoints(64)));     // and it must fill its circle
  return dev < 0.035 && Math.abs(area / (Math.PI * r * r) - 1) < 0.06 ? { cx, cy, r } : null;
}

// a disc with straight cuts (Dune): the curved part of the outline is one circle and every
// straight edge is a chord of it, so it can be a sphere sliced by flat planes
function sliceOf(shape){
  if (shape.holes.length) return null;
  const chords = [], arc = [];
  let curved = 0;
  for (const c of shape.curves) {
    if (c.getLength() < 0.5) continue;
    if (c.isLineCurve) chords.push([c.v1, c.v2]); else { arc.push(...c.getSpacedPoints(24)); curved += c.getLength(); }
  }
  // the round edge has to be most of the outline: a bar with rounded tips stays a bar
  if (!chords.length || arc.length < 48 || curved < 0.6 * shape.getLength()) return null;
  // least-squares circle through the curved points: x² + y² + ax + by + c = 0
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  for (const p of arc) { const row = [p.x, p.y, 1], w = -(p.x * p.x + p.y * p.y);
    for (let i = 0; i < 3; i++) { v[i] += row[i] * w; for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j]; } }
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d0 = det(M); if (!d0) return null;
  const sol = [0, 1, 2].map(k => det(M.map((row, i) => row.map((x, j) => j === k ? v[i] : x))) / d0);
  const cx = -sol[0] / 2, cy = -sol[1] / 2, r = Math.sqrt(cx * cx + cy * cy - sol[2]);
  if (!(r > 0)) return null;
  if (Math.max(...arc.map(p => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r))) / r > 0.035) return null;
  const pts = shape.getPoints(64), K = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(pts.length);
  let expect = Math.PI * r * r;
  for (const [a, b] of chords) {
    if ([a, b].some(p => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) / r > 0.035)) return null;
    // signed distance from the centre to the chord, positive when the centre is on the kept side
    const nx = -(b.y - a.y), ny = b.x - a.x, L = Math.hypot(nx, ny), side = Math.sign((K.x - a.x) * nx + (K.y - a.y) * ny);
    const h = side * ((cx - a.x) * nx + (cy - a.y) * ny) / L;
    if (h < 0) return null;                 // at least half the ball: a thin sliver cap reads as a chip
    expect -= r * r * Math.acos(Math.max(-1, Math.min(1, h / r))) - h * Math.sqrt(Math.max(0, r * r - h * h));
  }
  if (Math.abs(Math.abs(THREE.ShapeUtils.area(pts)) / expect - 1) > 0.06) return null;
  return { cx, cy, r, chords, K };
}

export function createSolid(){
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'solid-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2000); camera.position.set(0, 0, D);
  // a soft key high-left, a sky-to-floor fill (spheres shade top to bottom) and a purple rim from behind
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-140, 180, 200); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.9));
  const rim = new THREE.DirectionalLight(0xb8aaff, 1.4); rim.position.set(180, -60, -220); scene.add(rim);

  const faceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // edges sit darker than the white face so the thickness reads
  const sideMat = new THREE.MeshPhysicalMaterial({ color: 0x9c9c9c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const built = new Map();

  function build(s){
    if (built.has(s.id)) return built.get(s.id);
    const group = new THREE.Group(), lit = [], clips = [];
    // round forms only read through light; at rest they glow flat white like the drawing
    const roundMat = () => { const m = new THREE.MeshPhysicalMaterial({ color: 0xe8e8e8, roughness: 0.3, clearcoat: 1,
      emissive: 0xffffff, emissiveIntensity: 1 }); lit.push(m); return m; };
    const g3 = p => new THREE.Vector3(p.x - 100, -(p.y - 100), 0);
    // the site draws .stroked parts as outlines through a class, which SVGLoader can't see
    const src = s.mark.replace(/class="stroked"/g, 'fill="none" stroke="#fff"');
    for (const path of new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg">${src}</svg>`).paths) {
      const style = path.userData.style;
      if (style.fill === 'none' && style.stroke && style.stroke !== 'none') {
        // an outline becomes round wire: flattened at rest it is a ribbon exactly the stroke's width
        const w = style.strokeWidth || 2;
        for (const sub of path.subPaths) {
          const len = sub.getLength(); if (len < 0.5) continue;
          const pts = sub.getSpacedPoints(Math.max(32, Math.ceil(len / 1.2))).map(p => g3(p).setZ(-w / 2));
          const closed = pts[0].distanceTo(pts[pts.length - 1]) < 0.01;
          if (closed) pts.pop();
          const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0);   // tension 0: straight through the samples
          group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, w / 2, 12, closed), roundMat()));
        }
        continue;
      }
      for (const sh of SVGLoader.createShapes(path)) {
        const disc = discOf(sh), slice = disc ? null : sliceOf(sh);
        if (disc) {
          // centre set back so its silhouette at rest is exactly the drawn disc
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(disc.r, 48, 32), roundMat());
          mesh.position.set(disc.cx - 100, -(disc.cy - 100), D - Math.hypot(D, disc.r));
          group.add(mesh);
        } else if (slice) {
          // each cut is a plane through its chord and the camera, so the cut face is seen
          // edge-on and the silhouette at rest is the drawing; pose() re-aims the planes as
          // the depth collapses and carries them with the group (clipping is world space)
          const S = new THREE.Vector3(slice.cx - 100, -(slice.cy - 100), D - Math.hypot(D, slice.r)), K = g3(slice.K);
          const ball = roundMat(); ball.side = THREE.DoubleSide;     // the inside fills any hairline at the cut
          const cuts = slice.chords.map(([a, b]) => ({ A: g3(a), B: g3(b), K, S, r: slice.r, local: new THREE.Plane(), world: new THREE.Plane() }));
          ball.clippingPlanes = cuts.map(c => c.world);
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(slice.r, 64, 40), ball); mesh.position.copy(S); group.add(mesh);
          cuts.forEach((c, i) => {          // the flat cut faces: unit discs sized into their planes
            const m = roundMat(); m.side = THREE.DoubleSide; m.clippingPlanes = cuts.filter((_, j) => j !== i).map(o => o.world);
            c.cap = new THREE.Mesh(new THREE.CircleGeometry(1, 96), m); group.add(c.cap);
          });
          clips.push(...cuts);
        } else {
          // the bevel scales with the part's stroke width (2·area/perimeter)
          const area = Math.abs(THREE.ShapeUtils.area(sh.getPoints(64))) - sh.holes.reduce((t, h) => t + Math.abs(THREE.ShapeUtils.area(h.getPoints(64))), 0);
          const per = sh.getLength() + sh.holes.reduce((t, h) => t + h.getLength(), 0);
          const w = 2 * area / per, bs = Math.min(0.6, 0.12 * w), bt = Math.min(0.9, 0.18 * w);
          const g = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, curveSegments: 24, bevelEnabled: bs > 0.05, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: 2 });
          g.rotateX(Math.PI);               // y-down to y-up, front cap onto the mark plane
          g.translate(-100, 100, bs > 0.05 ? -bt : 0);
          group.add(new THREE.Mesh(g, [faceMat, sideMat]));
        }
      }
    }
    const b = { group, lit, clips, sig: signature(s.id) };
    built.set(s.id, b);
    return b;
  }

  const Q = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Vector3();
  function pose(b, quat, light){ apply(b, quat, light); renderer.render(scene, camera); }
  function apply(b, quat, light){
    const { group } = b;
    group.quaternion.copy(quat);
    group.scale.z = Math.max(0.002, light);                   // thickness, in the mark's own frame
    b.lit.forEach(m => { m.emissiveIntensity = 1 - 0.92 * light; });
    if (b.clips.length) {
      group.updateMatrixWorld(true);
      Q.set(0, 0, D / group.scale.z);
      for (const c of b.clips) {
        n.subVectors(c.B, c.A).cross(q.subVectors(Q, c.A)).normalize();
        c.local.set(n, -n.dot(c.A)); if (c.local.distanceToPoint(c.K) < 0) c.local.negate();
        const d = c.local.distanceToPoint(c.S), rho = Math.sqrt(Math.max(0, c.r * c.r - d * d));
        c.cap.position.copy(c.S).addScaledVector(c.local.normal, -d);
        c.cap.quaternion.setFromUnitVectors(Z, q.copy(c.local.normal).negate());
        c.cap.scale.set(rho, rho, 1);
        c.world.copy(c.local).applyMatrix4(group.matrixWorld);
      }
    }
  }

  // one run at a time: a tile that asks while another is still turning waits for it to land.
  // A run lives in its tile; if the tile opens into a card mid-turn, the run moves onto the
  // card's mark and finishes there (the card grows around it) instead of being cut off
  let cur = null, queued = null;
  const waiters = new Map();                                // tile -> callbacks for when its turn lands
  const release = tile => { const w = waiters.get(tile); if (w) { waiters.delete(tile); w.forEach(f => f()); } };
  function finish(){
    const c = cur; cur = null;
    if (c) {
      c.tile.classList.remove('solid-live', 'solid-handback'); c.host.classList.remove('solid-live', 'solid-handback');
      canvas.remove(); canvas.style.cssText = ''; scene.remove(c.b.group);
    }
    const nx = queued; queued = null;
    if (nx && nx.ok()) play(nx.tile, nx.s, nx.done, nx.ok);
    else if (nx) release(nx.tile);                          // dropped: nothing left to wait for
    if (c && !(cur && cur.tile === c.tile)) release(c.tile);
  }
  // put the canvas over the run's mark: the whole tile, or the card's stage mark
  let bufSize = 0;
  function place(run){
    const stage = run.tile.classList.contains('expanded') && run.tile.querySelector('.xc-stage');
    const host = stage || run.tile, svg = host.querySelector(':scope > svg');
    if (!svg) return false;
    if (run.host && run.host !== host) run.host.classList.remove('solid-live', 'solid-handback');
    run.host = host; run.svg = svg; run.carried = !!stage;
    canvas.style.cssText = '';
    svg.after(canvas);
    host.classList.add('solid-live');
    fit(run);
    return true;
  }
  function fit(run){
    let size = run.tile.offsetWidth;                        // layout size: the field's transforms don't count
    if (run.carried) {
      // the card's mark is centred in its stage: track its box (the stage may sit under the
      // field's zoom scale, so measure in the stage's own pixels)
      // While the card grows, the svg box is narrower than it is tall (flex shrink) and the
      // mark is drawn centred in it: cover the drawn square, not the box's top
      const hr = run.host.getBoundingClientRect(), sr = run.svg.getBoundingClientRect(), k = hr.width / run.host.offsetWidth || 1;
      const side = Math.min(sr.width, sr.height);
      size = side / k;
      const left = (sr.left + (sr.width - side) / 2 - hr.left) / k, top = (sr.top + (sr.height - side) / 2 - hr.top) / k;
      canvas.style.cssText = `position:absolute;pointer-events:none;left:${left}px;top:${top}px;width:${size}px;height:${size}px`;
    }
    if (size !== bufSize) { renderer.setSize(size, size, false); bufSize = size; }
  }
  function play(tile, s, done, ok = () => true, from = 0){
    if (waving) {                                           // the wave owns the renderer for now
      const r = waving.get(tile);
      if (r) r.done = done; else queued = { tile, s, done, ok };   // turning already: annotate when it lands
      return;
    }
    if (cur && cur.tile === tile) return;                   // mid-run: it finishes from where it is
    if (cur) { queued = { tile, s, done, ok }; return; }
    const b = build(s);
    const run = cur = { tile, b, host: null };
    bufSize = 0;
    if (!place(run)) { cur = null; return; }
    scene.add(b.group);
    const T = b.sig.dur, t0 = performance.now() - from, u0 = Math.min(1, from / T);
    pose(b, poseAt(b.sig.ease(u0), b.sig), solidity(u0));  // the drawing (or, handed over, where it was)
    const step = now => {
      if (cur !== run) return;
      if (!tile.isConnected || !run.host.isConnected) { finish(); return; }
      if (tile.classList.contains('expanded') !== run.carried && !place(run)) { finish(); return; }   // opened or closed mid-turn
      if (run.carried) fit(run);
      const u = Math.min(1, (now - t0) / T);
      pose(b, poseAt(b.sig.ease(u), b.sig), solidity(u));
      if (u < 1) { requestAnimationFrame(step); return; }
      // flat and front-on now: dissolve into the drawing, then drop the canvas
      pose(b, REST, 0); run.host.classList.add('solid-handback');
      setTimeout(() => { if (cur === run) { finish(); if (done) done(); } }, 200);
    };
    requestAnimationFrame(step);
  }
  // the arrival wave: every tile in view turns once, all starting together, each on its own
  // axis and pace. One field-sized canvas, one viewport per tile, drawn tile by tile each
  // frame; a tile hands back to its drawing the moment it lands flat. A card opening ends it
  // for the others (the card grows over them), and the opened mark carries on in its card
  let waving = null, waveTake = null;
  function wave(list, host){
    if (waving || cur || !list.length) return;
    const runs = new Map();
    for (const [tile, s] of list) {
      if (!tile.querySelector(':scope > svg')) continue;
      try { runs.set(tile, { tile, s, b: build(s), done: null }); } catch (e) {}
    }
    if (!runs.size) return;
    waving = runs;
    const W = host.clientWidth, H = host.clientHeight, dpr = renderer.getPixelRatio();
    // a full-screen buffer at 2x on a big display is huge: cap the pixel count
    renderer.setPixelRatio(Math.min(dpr, Math.sqrt(8e6 / (W * H))));
    renderer.setSize(W, H, false);
    canvas.classList.add('solid-wave');
    host.appendChild(canvas);
    renderer.setScissorTest(true);
    runs.forEach(r => r.tile.classList.add('solid-live'));
    const land = r => { runs.delete(r.tile); r.tile.classList.remove('solid-live'); if (r.done) r.done(); release(r.tile); };
    const end = handoff => {
      runs.forEach(land);
      renderer.setScissorTest(false); renderer.setPixelRatio(dpr);
      renderer.setViewport(0, 0, W, H);                     // setSize (in play) resets it, but keep it honest
      canvas.classList.remove('solid-wave'); canvas.remove();
      waving = null; waveTake = null;
      if (handoff) { play(handoff.tile, handoff.s, null, () => true, handoff.at); return; }
      const nx = queued; queued = null;
      if (nx && nx.ok()) play(nx.tile, nx.s, nx.done, nx.ok);
    };
    const t0 = performance.now();
    // a card opened: the others land at once, the opened one carries on in its card
    waveTake = tile => { waveTake = null; const r = runs.get(tile), at = performance.now() - t0;
      end(r && at < r.b.sig.dur ? { tile: r.tile, s: r.s, at } : null); };
    const step = now => {
      if (waving !== runs) return;
      const ex = host.querySelector('.tile.expanded');
      if (ex) { waveTake(ex); return; }
      const hr = host.getBoundingClientRect();
      renderer.setScissor(0, 0, W, H); renderer.clear();
      for (const r of [...runs.values()]) {
        const u = (now - t0) / r.b.sig.dur;
        if (u >= 1 || !r.tile.isConnected) { land(r); continue; }
        const tr = r.tile.getBoundingClientRect();
        if (tr.right < hr.left || tr.left > hr.right || tr.bottom < hr.top || tr.top > hr.bottom) continue;
        const x = tr.left - hr.left, y = hr.bottom - tr.bottom;       // viewports count from the bottom
        renderer.setViewport(x, y, tr.width, tr.height); renderer.setScissor(x, y, tr.width, tr.height);
        scene.add(r.b.group);
        apply(r.b, poseAt(r.b.sig.ease(u), r.b.sig), solidity(u));
        renderer.render(scene, camera);
        scene.remove(r.b.group);
      }
      if (runs.size) requestAnimationFrame(step); else end();
    };
    requestAnimationFrame(step);
  }

  // build a mark's geometry ahead of time (idle time after the reveal, or on hover)
  const prepare = s => { try { build(s); } catch (e) {} };
  // called the moment a tile opens into its card, so the turn moves over without a frame
  // of the flat drawing in between. True when the tile was turning
  function carry(tile){
    if (cur && cur.tile === tile) { if (!place(cur)) finish(); return true; }
    if (waving && waving.has(tile) && waveTake) { waveTake(tile); return true; }
    if (waving && waveTake) waveTake(tile);                // a card over the field ends the wave
    return false;
  }
  // resolves once no turn is running (or waiting to run) on this tile: the card's
  // controls act on the drawing, so they hold until the canvas has handed back
  function whenLanded(tile){
    const busy = (cur && cur.tile === tile) || (queued && queued.tile === tile) || (waving && waving.has(tile));
    if (!busy) return Promise.resolve();
    return new Promise(r => { if (!waiters.has(tile)) waiters.set(tile, []); waiters.get(tile).push(r); });
  }
  return { play, prepare, wave, carry, whenLanded };
}
