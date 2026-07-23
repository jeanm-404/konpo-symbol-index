#!/usr/bin/env python3
"""SYM-001..004 marks -> Lottie scenes (assemble-settle, transparent, 60fps).

Follows the text-to-lottie skill contract:
- comp preserves the tile viewBox (-28 -28 256 256 -> shifted to 0 0 256 256)
- one shape layer per <path> part, anchored at its own bbox center
- entrance: opacity entrance-sharp (12f), position+scale settle-soft (34f),
  center-out stagger 5f, >=20f final hold, final frame == exact lockup
- keyframes: o on start kf, i on destination kf
- shared `markColor` slot on every fill
"""
import re, json, math, os

SRC = os.path.expanduser('~/konpo-symbol-index/symbol-index.html')
PLAYER = None  # session player dir, gone; site output only
SITE = os.path.expanduser('~/konpo-symbol-index/anim')

SHIFT = 28.0          # viewBox -28 -> comp 0
CENTER = (128.0, 128.0)  # mark center: (100,100) in mark coords (viewBox midpoint), shifted
NUM = re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')

def parse_path(d):
    """Parse an SVG path d into subpaths of cubic segments (absolute)."""
    tokens = re.findall(r'[MmCcLlHhVvZzSsQqTtAa]|' + NUM.pattern, d)
    i, cur, start = 0, (0.0, 0.0), (0.0, 0.0)
    subs, sub = [], None  # sub: {'v': [...], 'o': [...], 'i': [...], 'c': bool}
    cmd = None
    def num():
        nonlocal i
        v = float(tokens[i]); i += 1; return v
    while i < len(tokens):
        if re.match(r'[A-Za-z]', tokens[i]):
            cmd = tokens[i]; i += 1
            if cmd in 'Zz':
                if sub: sub['c'] = True
                cmd = None
                continue
        if cmd is None:
            raise ValueError('number with no command')
        rel = cmd.islower()
        C = cmd.upper()
        if C == 'M':
            x, y = num(), num()
            if rel: x, y = cur[0]+x, cur[1]+y
            if sub: subs.append(sub)
            sub = {'v': [[x, y]], 'o': [[0, 0]], 'i': [[0, 0]], 'c': False}
            cur = start = (x, y)
            cmd = 'l' if rel else 'L'  # subsequent pairs are implicit lineto
        elif C == 'L':
            x, y = num(), num()
            if rel: x, y = cur[0]+x, cur[1]+y
            sub['v'].append([x, y]); sub['o'].append([0, 0]); sub['i'].append([0, 0])
            cur = (x, y)
        elif C == 'H':
            x = num()
            if rel: x = cur[0]+x
            sub['v'].append([x, cur[1]]); sub['o'].append([0, 0]); sub['i'].append([0, 0])
            cur = (x, cur[1])
        elif C == 'V':
            y = num()
            if rel: y = cur[1]+y
            sub['v'].append([cur[0], y]); sub['o'].append([0, 0]); sub['i'].append([0, 0])
            cur = (cur[0], y)
        elif C == 'C':
            x1, y1, x2, y2, x, y = (num() for _ in range(6))
            if rel:
                x1, y1, x2, y2, x, y = cur[0]+x1, cur[1]+y1, cur[0]+x2, cur[1]+y2, cur[0]+x, cur[1]+y
            # outgoing tangent of previous vertex, incoming of the new one (relative)
            sub['o'][-1] = [x1-cur[0], y1-cur[1]]
            sub['v'].append([x, y]); sub['o'].append([0, 0]); sub['i'].append([x2-x, y2-y])
            cur = (x, y)
        else:
            raise ValueError(f'unsupported command {cmd}')
    if sub: subs.append(sub)
    return subs

def shift(subs, tx=0.0, ty=0.0, sc=1.0):
    """Into comp coords, honoring an optional wrapper translate/scale (e.g. SYM-086)."""
    for s in subs:
        s['v'] = [[round(SHIFT+tx+sc*x, 3), round(SHIFT+ty+sc*y, 3)] for x, y in s['v']]
        s['o'] = [[round(sc*x, 3), round(sc*y, 3)] for x, y in s['o']]
        s['i'] = [[round(sc*x, 3), round(sc*y, 3)] for x, y in s['i']]
    return subs

def curve_pts(sub, n=12):
    pts = []
    V, O, I = sub['v'], sub['o'], sub['i']
    m = len(V)
    for k in range(m - 1 + (1 if sub['c'] else 0)):
        a = V[k]; b = V[(k+1) % m]
        c1 = [a[0]+O[k][0], a[1]+O[k][1]]; c2 = [b[0]+I[(k+1) % m][0], b[1]+I[(k+1) % m][1]]
        for i in range(n):
            t = i/n; mt = 1-t
            pts.append((mt**3*a[0]+3*mt*mt*t*c1[0]+3*mt*t*t*c2[0]+t**3*b[0],
                        mt**3*a[1]+3*mt*mt*t*c1[1]+3*mt*t*t*c2[1]+t**3*b[1]))
    return pts

def part_meta(subs):
    pts = [p for s in subs for p in curve_pts(s, 8)]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return {'c': ((min(xs)+max(xs))/2, (min(ys)+max(ys))/2),
            'w': max(xs)-min(xs), 'h': max(ys)-min(ys)}

def bbox_center(subs):
    return part_meta(subs)['c']

def ease(kf_start, kf_end, bez):  # bez = (x1,y1,x2,y2)
    # bodymovin serialization: the interval's start keyframe carries BOTH handles
    # (o = outgoing from it, i = incoming to the next kf). Skottie requires this.
    kf_start['o'] = {'x': [bez[0]], 'y': [bez[1]]}
    kf_start['i'] = {'x': [bez[2]], 'y': [bez[3]]}

GLIDE = (0.45, 0.00, 0.20, 1.00)  # slow leave, soft arrival — zero velocity at both ends
SOFT  = (0.33, 0.00, 0.15, 1.00)  # settle home
HOLD  = (0.30, 0.00, 0.70, 1.00)  # between identical values (a beat of stillness)
SNAP    = (0.20, 0.00, 0.35, 1.00)  # fast leave, firm catch (a chain hitting taut)
SINE    = (0.42, 0.00, 0.58, 1.00)  # pendulum physics — symmetric swing
INERTIA = (0.60, 0.00, 0.22, 1.00)  # heavy spool-up, long glide to a stop
POP     = (0.25, 0.00, 0.30, 1.00)  # quick scale pop
DRIFT   = (0.40, 0.00, 0.60, 1.00)  # weightless hop (the swarm)

def prop(seq):
    """seq: [(t, value, ease_to_next), ...] -> lottie property. One entry = static."""
    if len(seq) == 1:
        return {'a': 0, 'k': seq[0][1]}
    kfs = [{'t': t, 's': v} for (t, v, _) in seq]
    for i in range(len(seq) - 1):
        ease(kfs[i], kfs[i + 1], seq[i][2])
    return {'a': 1, 'k': kfs}

def off(c, dx, dy):
    return [round(c[0] + dx, 3), round(c[1] + dy, 3), 0]

def slide(c, vx, vy, out, t0=8):
    """rest -> glide out -> beat -> settle back through rest. Ends where it began."""
    rest = off(c, 0, 0)
    return prop([(t0, rest, GLIDE), (t0 + 24, off(c, vx * out, vy * out), HOLD),
                 (t0 + 30, off(c, vx * out, vy * out), GLIDE),
                 (t0 + 52, off(c, -vx * out * 0.09, -vy * out * 0.09), SOFT),
                 (t0 + 60, rest, None)])

def swingr(t0, peak, anticipate=-3.0, past=-0.4):
    """Rotation cycle about the mark center: rest -> lean back -> swing -> settle home."""
    return prop([(t0, [0.0], GLIDE), (t0 + 10, [anticipate], GLIDE),
                 (t0 + 34, [peak], GLIDE), (t0 + 54, [past], SOFT), (t0 + 62, [0.0], None)])

def still(c):
    return {'p': {'a': 0, 'k': off(c, 0, 0)}, 'r': {'a': 0, 'k': 0}, 'a': off(c, 0, 0)}

def pivot_rot(pivot, seq):
    """Rigid rotation of a part about an arbitrary pivot (rock, spin, orbit)."""
    ctr = [round(pivot[0], 3), round(pivot[1], 3), 0]
    return {'p': {'a': 0, 'k': ctr}, 'r': prop(seq), 'a': ctr}

def scale_seq(seq):
    """seq of (t, pct, ease) -> uniform scale property."""
    return prop([(t, [v, v, 100], e) for (t, v, e) in seq])

def scale_pulse(c, seq):
    """A part that only breathes in scale about its own center."""
    rest = off(c, 0, 0)
    return {'p': {'a': 0, 'k': rest}, 'r': {'a': 0, 'k': 0}, 'a': rest, 's': scale_seq(seq)}

def orbiter(t0, peak, **kw):
    ctr = [CENTER[0], CENTER[1], 0]
    return {'p': {'a': 0, 'k': ctr}, 'r': swingr(t0, peak, **kw), 'a': ctr}

def radial(c, out_u, t0):
    d = math.hypot(c[0]-CENTER[0], c[1]-CENTER[1])
    vx, vy = ((c[0]-CENTER[0])/d, (c[1]-CENTER[1])/d) if d > 1 else (0, 0)
    if d <= 1: return still(c)
    return {'p': slide(c, vx, vy, out_u, t0=t0), 'r': {'a': 0, 'k': 0}, 'a': off(c, 0, 0)}

def ang_rank(meta, reverse=False):
    """Stagger order around the dial, from the top, clockwise (or ccw)."""
    idx = [k for k in range(len(meta))]
    def a(k):
        c = meta[k]['c']
        ang = math.atan2(c[0]-CENTER[0], -(c[1]-CENTER[1]))  # 0 at top, clockwise
        return -ang if reverse else ang
    order = sorted(idx, key=a)
    return {k: r for r, k in enumerate(order)}

def choreograph(sym_id, meta):
    """Per-symbol motion: returns per-part dicts {p, r, a}. Frame 0 == final frame."""
    centers = [m['c'] for m in meta]
    out, CX, CY = [], CENTER[0], CENTER[1]
    if sym_id == 'SYM-001':
        # the clasp: the O slides out of the C's embrace and reseats; the C gives way a breath
        o_idx = 0 if centers[0][0] > centers[1][0] else 1
        for k, c in enumerate(centers):
            rest = off(c, 0, 0)
            p = slide(c, 1, 0, 7.0) if k == o_idx else slide(c, -1, 0, 1.6)
            out.append({'p': p, 'r': {'a': 0, 'k': 0}, 'a': rest})
    elif sym_id == 'SYM-002':
        # the junction opens: a ripple around the crossing, clockwise from the top
        import math as _m
        angs = [_m.atan2(c[1] - CY, c[0] - CX) for c in centers]
        buckets = []          # identical-angle parts (stacked paths) share a beat
        for a in angs:
            if not any(abs(a - b) < 0.02 for b in buckets): buckets.append(a)
        buckets.sort()
        for c, a in zip(centers, angs):
            st = min(range(len(buckets)), key=lambda i: abs(buckets[i] - a))
            d = _m.hypot(c[0] - CX, c[1] - CY)
            vx, vy = (c[0] - CX) / d, (c[1] - CY) / d
            out.append({'p': slide(c, vx, vy, 4.5, t0=8 + st * 3), 'r': {'a': 0, 'k': 0}, 'a': off(c, 0, 0)})
    elif sym_id == 'SYM-003':
        # the constellation swings: every part arcs 9 degrees about the cluster
        # center. The body rotates too — its center sits on the axis (so it
        # barely moves) but its fused bottom lobe orbits like a 4th satellite.
        for k, c in enumerate(centers):
            t0 = 8 + k * 3
            r = prop([(t0, [0], GLIDE), (t0 + 26, [9], HOLD), (t0 + 32, [9], GLIDE),
                      (t0 + 54, [-0.5], SOFT), (t0 + 62, [0], None)])
            ctr = [CX, CY, 0]
            out.append({'p': {'a': 0, 'k': ctr}, 'r': r, 'a': ctr})  # rotate about the mark center
    elif sym_id == 'SYM-004':
        # the bracket breathes: jaws part vertically — rails reach, squares follow at half depth
        for c in centers:
            dyc = c[1] - CY
            sign = 1 if dyc > 0 else -1
            amp = 5.0 if abs(dyc) > 25 else 2.5
            out.append({'p': slide(c, 0, sign, amp), 'r': {'a': 0, 'k': 0}, 'a': off(c, 0, 0)})

    elif sym_id == 'SYM-010':
        # THE TUG — it's a chain: both hooks yank apart fast, hit taut with a
        # two-shudder clink, hold the tension, then release home slow.
        for m in meta:
            c = m['c']; sign = -1 if c[1] < CY else 1
            rest = off(c, 0, 0)
            p = prop([(6, rest, SNAP), (16, off(c, 0, sign*5.2), SINE),
                      (21, off(c, 0, sign*4.55), SINE), (26, off(c, 0, sign*5.0), HOLD),
                      (38, off(c, 0, sign*5.0), GLIDE), (64, off(c, 0, -sign*0.35), SOFT),
                      (72, rest, None)])
            out.append({'p': p, 'r': {'a': 0, 'k': 0}, 'a': rest})
    elif sym_id == 'SYM-012':
        # ROLL CALL — the pentad is counted: each disc pops once, in strict
        # order around the dial. Pure scale, nothing travels.
        rank = ang_rank(meta)
        for k, m in enumerate(meta):
            t0 = 8 + rank[k] * 7
            out.append(scale_pulse(m['c'], [(t0, 100, POP), (t0+7, 86, POP),
                                            (t0+14, 107, SOFT), (t0+22, 100, None)]))
    elif sym_id == 'SYM-015':
        # SETTING THE TILES — a press sweeps the mosaic corner to corner,
        # tamping each tessera into the mortar as it passes.
        order = sorted(range(len(meta)), key=lambda k: meta[k]['c'][0] + meta[k]['c'][1])
        rank = {k: r for r, k in enumerate(order)}
        for k, m in enumerate(meta):
            t0 = 8 + rank[k] * 5
            out.append(scale_pulse(m['c'], [(t0, 100, POP), (t0+6, 93, POP),
                                            (t0+13, 101.5, SOFT), (t0+21, 100, None)]))
    elif sym_id == 'SYM-022':
        # THE HOVER — every dot wanders its own three-hop drift, no shared
        # bearing, no shared beat, and the whole swarm is home by the end.
        di = 0
        for m in meta:
            c = m['c']
            if m['w'] < 2 or m['h'] < 2:  # invisible connector strokes hold still
                out.append(still(c)); continue
            rest = off(c, 0, 0)
            t0 = 6 + (di % 4) * 2
            amp = 2.4 + (di * 7 % 3) * 0.55
            if math.hypot(c[0]-CX, c[1]-CY) < 1: amp *= 0.55   # the queen barely stirs
            seq = [(t0, rest, DRIFT)]
            for h in range(3):
                a = math.radians((di * 137.5 + h * 111.3) % 360)
                r = amp * (1.0 - 0.22 * h)
                seq.append((t0 + 30 * (h + 1), off(c, r*math.cos(a), r*math.sin(a)), DRIFT))
            seq.append((t0 + 118, rest, None))
            out.append({'p': prop(seq), 'r': {'a': 0, 'k': 0}, 'a': rest})
            di += 1
    elif sym_id == 'SYM-024':
        # THE CLOSE — the corolla folds: petals swirl inward about the flower's
        # heart in a spiral, each a beat behind the last, then unfold past rest.
        rank = ang_rank(meta)
        for k, m in enumerate(meta):
            t0 = 8 + rank[k] * 3
            d = pivot_rot(CENTER, [(t0, [0.0], GLIDE), (t0+20, [-9.0], HOLD),
                                   (t0+26, [-9.0], GLIDE), (t0+44, [1.5], SOFT),
                                   (t0+54, [0.0], None)])
            d['s'] = scale_seq([(t0, 100, GLIDE), (t0+20, 93.5, HOLD), (t0+26, 93.5, GLIDE),
                                (t0+44, 100.8, SOFT), (t0+54, 100, None)])
            out.append(d)
    elif sym_id == 'SYM-026':
        # THE ORBIT — the four moons are identical and 90° apart, so they glide
        # a true quarter-revolution and land exactly on each other's places
        # (seamless). The core inhales as they pass.
        for m in meta:
            if m['w'] > 50:
                out.append(scale_pulse(m['c'], [(10, 100, GLIDE), (45, 102.5, GLIDE),
                                                (80, 100, None)]))
            else:
                out.append(pivot_rot(CENTER, [(10, [0.0], INERTIA), (80, [90.0], None)]))
    elif sym_id == 'SYM-038':
        # THE LUCKY SPIN — the clover is perfectly four-fold (rot-90 error
        # 0.04u), so it turns a real quarter and lands on itself: lean back,
        # sweep, overshoot two degrees, click home.
        out.append(pivot_rot(CENTER, [(8, [0.0], GLIDE), (22, [-4.0], INERTIA),
                                      (66, [92.0], SOFT), (78, [90.0], None)]))
    elif sym_id == 'SYM-048':
        # THE GUST — one breath of wind travels the wreath clockwise: each leaf
        # lifts off its bearing and twists as the wave passes, then lies back.
        for m in meta:
            c = m['c']
            d = math.hypot(c[0]-CX, c[1]-CY)
            vx, vy = ((c[0]-CX)/d, (c[1]-CY)/d) if d > 1 else (0, 0)
            ang = math.atan2(c[0]-CX, -(c[1]-CY)) % (2*math.pi)
            t0 = 8 + round(ang / (2*math.pi) * 66)
            rest = off(c, 0, 0)
            p = prop([(t0, rest, GLIDE), (t0+12, off(c, vx*2.5, vy*2.5), SOFT), (t0+26, rest, None)])
            r = prop([(t0, [0.0], GLIDE), (t0+12, [7.0], SOFT), (t0+26, [0.0], None)])
            out.append({'p': p, 'r': r, 'a': rest})
    elif sym_id == 'SYM-050':
        # THE APERTURE — the dahlia's two interleaved quads counter-twist about
        # the heart (cardinals clockwise, diagonals counter), breathe at the
        # extreme, and cross home through a degree and a half.
        for m in meta:
            c = m['c']
            ang = math.degrees(math.atan2(c[0]-CX, -(c[1]-CY))) % 360
            sign = 1 if round(ang / 45) % 2 == 0 else -1
            out.append(pivot_rot(CENTER, [(8, [0.0], GLIDE), (34, [sign*10.0], HOLD),
                                          (40, [sign*10.0], GLIDE), (62, [-sign*1.5], SOFT),
                                          (72, [0.0], None)]))
    elif sym_id == 'SYM-086':
        # THE TURN OF THE GLOBE — all four latitudes slide east together, rigid
        # as a sphere, the equator pair travelling farthest, and swing back west
        # through a sliver of overshoot. The meridian ring holds.
        for m in meta:
            c = m['c']
            if m['w'] > 80:
                out.append(still(c)); continue
            amp = 5.0 - 0.14 * abs(c[1]-CY)
            rest = off(c, 0, 0)
            p = prop([(8, rest, GLIDE), (34, off(c, amp, 0), HOLD), (42, off(c, amp, 0), GLIDE),
                      (66, off(c, -amp*0.08, 0), SOFT), (74, rest, None)])
            out.append({'p': p, 'r': {'a': 0, 'k': 0}, 'a': rest})
    elif sym_id == 'SYM-089':
        # THE ROCK — the whole cradle sways about a point beneath its base and
        # swings itself to sleep: a true damped pendulum, every pass smaller.
        pivot = (CX, 170.0)
        seq = [(6, [0.0], SINE), (26, [3.2], SINE), (46, [-2.4], SINE), (64, [1.6], SINE),
               (80, [-0.8], SINE), (94, [0.3], SINE), (108, [0.0], None)]
        for m in meta:
            out.append(pivot_rot(pivot, seq))
    elif sym_id == 'SYM-095':
        # THE REVOLUTION — the rotor is two-fold (rot-180 error 0.25u), so it
        # spools up, swings a full half turn counterclockwise, and lands exactly
        # on itself. Slow to start, heavy to stop.
        seq = [(8, [0.0], GLIDE), (24, [4.0], INERTIA), (88, [-184.0], SOFT), (102, [-180.0], None)]
        for m in meta:
            out.append(pivot_rot(CENTER, seq))
    return out

def build(sym_id, name, mark):
    # honor an optional wrapper transform (e.g. SYM-086's translate+scale group)
    tx = ty = 0.0; sc = 1.0
    wrap = re.match(r'<g transform="translate\(([\d.]+)[ ,]+([\d.]+)\) scale\(([\d.]+)\)">', mark)
    if wrap:
        tx, ty, sc = float(wrap.group(1)), float(wrap.group(2)), float(wrap.group(3))
    paths = re.findall(r'<path[^>]*? d="([^"]+)"', mark) or re.findall(r'<path d="([^"]+)"', mark)
    parts = [shift(parse_path(d), tx, ty, sc) for d in paths]
    meta = [part_meta(p) for p in parts]
    centers = [m['c'] for m in meta]
    layers = []
    last_end = 0
    motion = choreograph(sym_id, meta)
    for k, (subs, (cx, cy)) in enumerate(zip(parts, centers)):
        m = motion[k]
        p_prop, r_prop, anchor = m['p'], m['r'], m['a']
        s_prop = m.get('s', {'a': 0, 'k': [100, 100, 100]})
        if s_prop.get('a') == 1:
            last_end = max(last_end, s_prop['k'][-1]['t'])
        for pr in (p_prop, r_prop):
            if pr.get('a') == 1:
                last_end = max(last_end, pr['k'][-1]['t'])
        group_items = [{'ty': 'sh', 'ks': {'a': 0, 'k': {'v': s['v'], 'o': s['o'], 'i': s['i'], 'c': s['c']}}} for s in subs]
        group_items.append({'ty': 'fl', 'c': {'a': 0, 'k': [1, 1, 1, 1], 'sid': 'markColor'}, 'o': {'a': 0, 'k': 100}, 'r': 1})
        group_items.append({'ty': 'tr', 'p': {'a': 0, 'k': [0, 0]}, 'a': {'a': 0, 'k': [0, 0]},
                            's': {'a': 0, 'k': [100, 100]}, 'r': {'a': 0, 'k': 0}, 'o': {'a': 0, 'k': 100}})
        shape_items = [{'ty': 'gr', 'nm': f'part-{k+1}-shapes', 'it': group_items}]
        layers.append({
            'ddd': 0, 'ind': k+1, 'ty': 4, 'nm': f'part-{k+1}',
            'ks': {'o': {'a': 0, 'k': 100}, 'r': r_prop,
                   'p': p_prop, 'a': {'a': 0, 'k': anchor},
                   's': s_prop},
            'ip': 0, 'op': 999, 'st': 0, 'shapes': shape_items})
    op = last_end + 8
    for l in layers: l['op'] = op
    return {'v': '5.7.4', 'fr': 60, 'ip': 0, 'op': op, 'w': 256, 'h': 256,
            'nm': f'{sym_id} — {name}', 'assets': [],
            'slots': {'markColor': {'p': {'a': 0, 'k': [1, 1, 1, 1]}}},
            'layers': layers}

def main():
    src = open(SRC).read()
    os.makedirs(SITE, exist_ok=True)
    for n in [1, 2, 4, 10, 12, 15, 22, 24, 26, 38, 48, 50, 86, 89, 95]:
        m = re.search(r'"id": "(SYM-%03d)",\n  "name": "([^"]+)".*?"mark": "(.*?)",\n' % n, src, re.S)
        sym_id, name, mark_raw = m.group(1), m.group(2), m.group(3)
        mark = mark_raw.encode().decode('unicode_escape')
        anim = build(sym_id, name, mark)
        out = f'{SITE}/sym-{n:03d}.json'
        json.dump(anim, open(out, 'w'))
        print(f'{sym_id}: {len(anim["layers"])} parts, op={anim["op"]}, {os.path.getsize(out)}b')

if __name__ == '__main__':
    main()
