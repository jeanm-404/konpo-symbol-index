/* ------------------------------------------------------------------
   Konpo Motion: plays a mark's motion recipe on its OWN svg parts with
   the Web Animations API. No lottie-web, no JSON scene, no second layer
   under the mark, so Turn / Explode / Notes act on the same elements.

   Recipe contract (same vocabulary as scripts/build_lottie.py):
     recipe(parts) -> one track set per part, in DOM order
       parts[k] = { el, c:[x,y], w, h }        mark coords (viewBox, centre 100,100)
       track set = {
         pivot: [x,y]          rotation/scale origin, mark coords (default: part centre)
         p: [[frame, [dx,dy], EASE], ...]      offset from rest, mark units
         r: [[frame, deg, EASE], ...]
         s: [[frame, pct, EASE], ...]          uniform scale, 100 = rest
         x: [[frame, deg, EASE], ...]          pitch about the horizontal line through
                                               the pivot (a coin flip); 180 = mirrored
       }
     The EASE on a keyframe shapes the interval that STARTS there; the
     last keyframe needs none. Before its first keyframe a track holds its
     first value, after its last it holds its last. Frames are 60fps.
     Frame 0 must equal the final frame (or be symmetric-equivalent).
------------------------------------------------------------------ */
(function (global) {
  const FPS = 60, TAIL = 8;               // TAIL: frames held after the last keyframe (op = last + 8)

  const EASE = {
    GLIDE:   [0.45, 0.00, 0.20, 1.00],    // slow leave, soft arrival
    SOFT:    [0.33, 0.00, 0.15, 1.00],    // settle home
    HOLD:    [0.30, 0.00, 0.70, 1.00],    // between identical values
    SNAP:    [0.20, 0.00, 0.35, 1.00],    // fast leave, firm catch
    SINE:    [0.42, 0.00, 0.58, 1.00],    // pendulum swing
    INERTIA: [0.60, 0.00, 0.22, 1.00],    // heavy spool-up, long glide
    POP:     [0.25, 0.00, 0.30, 1.00],    // quick scale pop
    DRIFT:   [0.40, 0.00, 0.60, 1.00],    // weightless hop
  };

  // cubic-bezier(x1,y1,x2,y2) as a function of progress, same maths as CSS
  function bezier([x1, y1, x2, y2]) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
    const dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {                    // Newton
        const e = X(t) - x, d = dX(t);
        if (Math.abs(e) < 1e-7) return Y(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1; t = x;                       // bisection fallback
      while (hi - lo > 1e-7) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return Y(t);
    };
  }
  const curve = name => { const e = EASE[name] || name; return e ? bezier(e) : (x => x); };

  // a track's value at a (fractional) frame
  function valueAt(track, f) {
    if (!track || !track.length) return null;
    if (f <= track[0][0]) return track[0][1];
    const last = track[track.length - 1];
    if (f >= last[0]) return last[1];
    let i = 0; while (track[i + 1][0] < f) i++;
    const [t0, v0, e] = track[i], [t1, v1] = track[i + 1];
    const k = curve(e)((f - t0) / (t1 - t0));
    return Array.isArray(v0) ? v0.map((a, j) => a + (v1[j] - a) * k) : v0 + (v1 - v0) * k;
  }

  // a part's state at frame f, in mark coords
  function stateAt(ts, f) {
    return {
      d: valueAt(ts.p, f) || [0, 0],
      r: valueAt(ts.r, f) ?? 0,
      s: (valueAt(ts.s, f) ?? 100) / 100,
      x: valueAt(ts.x, f) ?? 0,
    };
  }

  // mark-space transform T(pivot+d) R(r) S(s) T(-pivot), written in the part's
  // LOCAL space: wrapped marks (<g transform="translate scale">) are similarity
  // transforms, so pivot and offset just divide through by the wrapper scale
  function css(ts, st, W) {
    const px = (ts.pivot[0] - W.tx) / W.sc, py = (ts.pivot[1] - W.ty) / W.sc;
    const dx = st.d[0] / W.sc, dy = st.d[1] / W.sc;
    const n = v => +v.toFixed(4);
    // pitch foreshortens the height by cos(x); past 90 the negative y-scale is the flip
    const sy = st.s * Math.cos(st.x * Math.PI / 180);
    return `translate(${n(px + dx)}px, ${n(py + dy)}px) rotate(${n(st.r)}deg) scale(${n(st.s)}, ${n(sy)}) translate(${n(-px)}px, ${n(-py)}px)`;
  }

  // the mark's parts in DOM order, unwrapping single groups (the neutral <g>
  // svg() adds, and wrapper transforms like SYM-086's translate+scale)
  function partsOf(svgEl) {
    let els = [...svgEl.querySelectorAll('.mark > *')];
    const W = { tx: 0, ty: 0, sc: 1 };
    while (els.length === 1 && els[0].tagName.toLowerCase() === 'g' && els[0].children.length) {
      const m = els[0].transform.baseVal.consolidate();
      if (m) { const M = m.matrix; W.tx += M.e; W.ty += M.f; W.sc *= M.a; }
      els = [...els[0].children];
    }
    const parts = els.map(el => {
      const b = el.getBBox();
      return { el, c: [W.tx + W.sc * (b.x + b.width / 2), W.ty + W.sc * (b.y + b.height / 2)],
               w: W.sc * b.width, h: W.sc * b.height };
    });
    return { parts, W };
  }

  // compile one part's tracks to WAAPI keyframes. When every moving track
  // shares the same keyframe times and easings, the browser interpolates with
  // the real cubic-beziers (resolution-free); otherwise sample at 60fps.
  function keyframes(ts, W, op) {
    const moving = ['p', 'r', 's', 'x'].filter(k => ts[k] && ts[k].length > 1).map(k => ts[k]);
    const times = moving.length ? moving[0].map(k => k[0]) : [];
    // cos of an eased pitch is not a cubic-bezier: pitch always samples
    const shared = !(ts.x && ts.x.length > 1) && moving.every(tr => tr.length === times.length
      && tr.every((k, i) => k[0] === times[i] && (i === tr.length - 1 || String(k[2]) === String(moving[0][i][2]))));
    const frames = [];
    const push = (f, easing) => frames.push({ offset: f / op, transform: css(ts, stateAt(ts, f), W), easing });
    if (shared && moving.length) {
      push(0, 'linear');                                           // hold until the first keyframe
      moving[0].forEach(([t, , e], i) => {
        const E = EASE[e] || e;
        push(t, i < times.length - 1 && E ? `cubic-bezier(${E.join(',')})` : 'linear');
      });
      push(op, 'linear');
    } else {
      for (let f = 0; f <= op; f++) push(f, 'linear');
    }
    // a keyframe landing on frame 0 (or op) replaces the hold placeholder there
    const out = [];
    for (const k of frames) { if (out.length && out[out.length - 1].offset === k.offset) out[out.length - 1] = k; else out.push(k); }
    return { frames: out, mode: shared ? 'native' : 'sampled' };
  }

  // Build the animations (paused at frame 0). Returns a controller.
  function mount(svgEl, recipe) {
    const { parts, W } = partsOf(svgEl);
    const tracks = recipe(parts).map((ts, k) => ({ pivot: parts[k].c, ...ts }));
    const last = Math.max(0, ...tracks.flatMap(ts => ['p', 'r', 's', 'x'].flatMap(k => (ts[k] || []).map(x => x[0]))));
    const op = last + TAIL, ms = op / FPS * 1000;
    const modes = new Set();
    const anims = parts.map((pt, k) => {
      pt.el.style.transformBox = 'view-box';
      pt.el.style.transformOrigin = '0 0';
      const { frames, mode } = keyframes(tracks[k], W, op); modes.add(mode);
      const a = pt.el.animate(frames, { duration: ms, fill: 'none' });
      a.pause(); a.currentTime = 0;
      return a;
    });
    const ctl = {
      parts, tracks, W, op, ms, anims, mode: [...modes].join('+'),
      play(rate = 1) {
        anims.forEach(a => { a.playbackRate = rate; a.currentTime = 0; a.play(); });
        return Promise.all(anims.map(a => a.finished)).catch(() => {});
      },
      seek(frame) { anims.forEach(a => { a.pause(); a.currentTime = frame / FPS * 1000; }); },
      cancel() { anims.forEach(a => a.cancel()); },
      stateAt: (k, f) => stateAt(tracks[k], f),
    };
    return ctl;
  }

  /* ---------- Recipes: 1:1 ports of scripts/build_lottie.py choreograph() ---------- */
  const C = [100, 100];                                  // mark centre (comp 128,128)
  // stagger order around the dial: same atan2 convention as ang_rank()
  const angRank = parts => {
    const order = parts.map((_, k) => k)
      .sort((a, b) => Math.atan2(parts[a].c[0] - C[0], -(parts[a].c[1] - C[1]))
                    - Math.atan2(parts[b].c[0] - C[0], -(parts[b].c[1] - C[1])));
    const rank = []; order.forEach((k, r) => rank[k] = r); return rank;
  };

  const RECIPES = {
    // THE TUG: it's a chain. Both hooks yank apart fast, hit taut with a
    // two-shudder clink, hold the tension, then release home slow.
    'SYM-010': parts => parts.map(m => {
      const s = m.c[1] < C[1] ? -1 : 1;
      return { p: [[6, [0, 0], 'SNAP'], [16, [0, s * 5.2], 'SINE'], [21, [0, s * 4.55], 'SINE'],
                   [26, [0, s * 5.0], 'HOLD'], [38, [0, s * 5.0], 'GLIDE'], [64, [0, -s * 0.35], 'SOFT'],
                   [72, [0, 0]]] };
    }),
    // THE CLOSE: the corolla folds. Petals swirl inward about the flower's
    // heart in a spiral, each a beat behind the last, then unfold past rest.
    'SYM-024': parts => { const rank = angRank(parts); return parts.map((m, k) => {
      const t = 8 + rank[k] * 3;
      return { pivot: C,
        r: [[t, 0, 'GLIDE'], [t + 20, -9, 'HOLD'], [t + 26, -9, 'GLIDE'], [t + 44, 1.5, 'SOFT'], [t + 54, 0]],
        s: [[t, 100, 'GLIDE'], [t + 20, 93.5, 'HOLD'], [t + 26, 93.5, 'GLIDE'], [t + 44, 100.8, 'SOFT'], [t + 54, 100]] };
    }); },
    // THE SPIN: the whole globe rotates. Two-fold (rot-180 error 0.09u), so it
    // spools up, swings a half turn, overshoots three degrees, lands on itself.
    'SYM-086': parts => parts.map(() => ({ pivot: C,
      r: [[8, 0, 'GLIDE'], [22, -3, 'INERTIA'], [86, 183, 'SOFT'], [98, 180]] })),
  };

  /* ---------- Shape-first recipes (workflow 2026-09-25) ----------
     Each one was designed from a measured reading of the mark first
     (parts, symmetry, construction, character); pilot/shape-notes.json
     carries that reading and the reasoning behind every choice. */
  const SHAPE = {
    // THE HINGE CLAP: the 3.81u seam is Link's only full cut, so it is the hinge.
    // Both yokes swing open about the seam's right end (where the flat edge meets
    // the lobe arc), clap shut to exactly one module, rebound a hair, then repeat
    // the beat mirrored on the left end. One end of the cut always holds still.
    'SYM-010': parts => {
      const L = 20.52;                                       // C to seam end: flat edge meets the lobe arc at x = 100 +/- 20.52
      const TH = Math.asin(1.905 / (2 * L)) * 180 / Math.PI; // 2.661 deg over the 41.04u flat seam: 1 / 1.5 / 2 modules
      const IN = [0.55, 0, 0.9, 0.55];                       // accelerate into the clap
      const OUT = [0.2, 0.55, 0.4, 1];                       // rebound leaves with the clap's speed
      return parts.map(m => {
        const s = m.c[1] < C[1] ? -1 : 1;                    // top yoke -1, bottom yoke +1
        // turn u*TH about the seam end (100 + L*h, 100), expressed about C
        const k = (h, u) => { const a = u * TH * Math.PI / 180;
          return [[+(h * L * (1 - Math.cos(a))).toFixed(4), +(s * L * Math.sin(a)).toFixed(4)], +(-s * h * u * TH).toFixed(4)]; };
        const seq = [[6, 1, 0, 'GLIDE'], [24, 1, 1, 'HOLD'], [30, 1, 1, IN], [38, 1, 0, OUT], [43, 1, 0.18, 'SOFT'], [50, 1, 0, 'HOLD'],
                     [56, -1, 0, 'GLIDE'], [74, -1, 1, 'HOLD'], [80, -1, 1, IN], [88, -1, 0, OUT], [93, -1, 0.18, 'SOFT'], [100, -1, 0]];
        const p = [], r = [];
        for (const [f, h, u, e] of seq) { const [d, deg] = k(h, u); p.push(e ? [f, d, e] : [f, d]); r.push(e ? [f, deg, e] : [f, deg]); }
        return { pivot: C, p, r };
      });
    },
    // THE IRIS: the gaps are straight, parallel 1.27u slits, so every petal is a
    // blade. All five glide out at once along the slit they share with their
    // clockwise neighbour (36 deg off radial), the pentagonal eye opens and turns,
    // then the blades snap shut a hair past rest and settle. True D5 pivot (100.25, 102.6).
    'SYM-024': parts => {
      const PV = [100.25, 102.6], D = 3.08;
      return parts.map(m => {
        const raw = Math.atan2(m.c[1] - PV[1], m.c[0] - PV[0]) * 180 / Math.PI;
        const ax = 270 + 72 * Math.round(((((raw - 270) % 360) + 360) % 360) / 72);   // snap to the petal's true axis
        const a = (ax + 36) * Math.PI / 180;                                            // along the shared slit
        const at = k => [+(k * Math.cos(a)).toFixed(3), +(k * Math.sin(a)).toFixed(3)];
        return { pivot: PV, p: [[8, [0, 0], 'GLIDE'], [40, at(D), 'HOLD'], [54, at(D), 'SNAP'], [76, at(-0.3), 'SOFT'], [92, [0, 0]]] };
      });
    },
    // THE COIN FLIP: the equator is inscribed tangent to the rim at 9 and 3
    // o'clock, so the globe hangs on a horizontal axle. It turns over once on it:
    // slow spool-up, a one-frame vanish edge-on, and it lands mirrored, which the
    // D2 symmetry makes identical to rest (0.087u). The whole shape, per Jean.
    'SYM-086': parts => parts.map(() => ({ pivot: C, x: [[8, 0, 'INERTIA'], [72, 180]] })),
  };

  global.KonpoMotion = { mount, RECIPES, SHAPE, EASE, bezier, valueAt, FPS };
})(window);
