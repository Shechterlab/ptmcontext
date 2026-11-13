"""The Network view's figure layout (website.network): where each protein, cluster outline, label and bundle of links goes.

Group-in-a-box: every cluster is laid out on its own links (a force layout with collisions), the clusters are packed as
discs (clusters of confusable colours kept further apart, the cluster with the most links to the others in the middle),
each cluster is turned so that its proteins with links to other clusters face them, the smaller clusters go on one shelf,
and labels are placed outside the outlines where they touch nothing. The steps run in a fixed order on fixed numbers of
iterations without randomness, in plain floating-point arithmetic, so this module and kit-netlayout.js (its twin, which lays
out the views the build cannot make) give the same figure to within rounding. Nothing here reads a file.

    layout(view, variant) -> the figure of one variant ('desktop' or 'phone'); view: {gene, sites, comm, edges, labels, nodes}
    positions(view, variant) and finish(view, pos, variant, fs, gfs) are its two halves: the first is the costly one, the
    second places the labels (so that a figure with larger type, for a printed page, needs only the second)
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

COLOURS = (
    8  # the categorical slots; a view with more clusters than this reuses them, the clusters of one slot kept apart
)
# pairs of colour slots (1-based) that fail the all-pairs colour-vision and normal-vision floors in the light or the dark
# palette (checked with the data-viz validator, two colours at a time): such clusters are not packed side by side
CONFUSABLE = {(1, 7), (2, 4), (2, 5), (2, 6), (2, 8), (3, 5), (4, 6), (4, 8), (5, 8), (6, 8)}
GOLD = 2.399963
# cos and sin of GOLD as numbers: the seed spiral turns by repeated multiplication, which gives the same figure in Python and
# in JavaScript (the two do not agree on the last digit of cos and sin, and a force layout amplifies that)
GOLD_COS, GOLD_SIN = -0.7373687228988248, 0.6754904636562651


def short_name(t):
    """A term's name for the figure: without parentheses and without the mechanism clause or anything after the first
    comma ('RNA splicing, via transesterification reactions ...' -> 'RNA splicing'); the hover and the table keep the
    whole name."""
    if not t:
        return None
    s = re.sub(r'\s*\([^)]*\)', '', t)
    s = re.split(r',?\s+via\s+|,\s+', s)[0]
    return s.strip() or t


def _wrap(s, width):
    words, lines, cur = s.split(), [], ''
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + ' ' + w).strip()
    lines.append(cur)
    if len(lines) > 2 and width >= 28:
        rest = ' '.join(lines[1:])
        lines = [lines[0], rest[:width].rsplit(' ', 1)[0] + '…']
    return lines


def wrap2(s, width=22):
    """At most two lines, at the narrowest width from `width` to `width` + 6 that fits."""
    for wd in range(width, width + 7):
        out = _wrap(s, wd)
        if len(out) <= 2:
            return out
    return _wrap(s, width + 6)


def radius(sites, k=1.0):
    return k * min(9.0, 2.6 + 0.95 * math.sqrt(sites))


def text_w(t, size, weight=500):
    return len(t) * size * (0.56 if weight >= 600 else 0.53)


def slot_of(rank):
    return rank % COLOURS


def bad_pair(a, b, slots):
    """Do the colours of clusters a and b (their ranks among the shown) look alike: the same slot, or a confusable pair."""
    sa, sb = slots[a], slots[b]
    return sa == sb or (min(sa, sb) + 1, max(sa, sb) + 1) in CONFUSABLE


# ---- 1. one cluster: a force layout with collisions -------------------------------------------------------------------
def cluster_layout(r, edges, L):
    """Positions (a list of [x, y], centred) for len(r) circles of radii r joined by `edges` (local index pairs)."""
    n = len(r)
    if n == 1:
        return [[0.0, 0.0]]
    deg = [0] * n
    for a, b in edges:
        deg[a] += 1
        deg[b] += 1
    order = sorted(range(n), key=lambda k: (-deg[k], k))  # hubs in the middle of the seed spiral
    px, py = [0.0] * n, [0.0] * n
    ca, sa = 1.0, 0.0
    for rank, k in enumerate(order):
        d = L * 0.6 * math.sqrt(rank)
        px[k], py[k] = d * ca, d * sa
        ca, sa = ca * GOLD_COS - sa * GOLD_SIN, ca * GOLD_SIN + sa * GOLD_COS
    L2 = L * L
    T = 500
    for t in range(T):
        temp = L * 1.2 * (1 - t / T) + 0.3
        fx, fy = [0.0] * n, [0.0] * n
        for i in range(n):
            xi, yi, ri = px[i], py[i], r[i]
            for j in range(i + 1, n):
                dx, dy = xi - px[j], yi - py[j]
                d2 = dx * dx + dy * dy
                d = math.sqrt(d2)
                rep = L2 / d2
                gx, gy = dx * rep, dy * rep
                ov = ri + r[j] + 2.2 - d
                if ov > 0:
                    c = ov / d * 2.0
                    gx += dx * c
                    gy += dy * c
                fx[i] += gx
                fy[i] += gy
                fx[j] -= gx
                fy[j] -= gy
        for a, b in edges:
            vx, vy = px[a] - px[b], py[a] - py[b]
            dl = math.sqrt(vx * vx + vy * vy) + 1e-9
            f = dl / L
            fx[a] -= f * vx
            fy[a] -= f * vy
            fx[b] += f * vx
            fy[b] += f * vy
        g = 0.04 + 0.0006 * n  # gravity keeps the cluster round and compact
        for i in range(n):
            fx[i] -= px[i] * g
            fy[i] -= py[i] * g
            m = math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) + 1e-9
            s = min(m, temp) / m
            px[i] += fx[i] * s
            py[i] += fy[i] * s
    for _ in range(80):  # collisions only
        dx_, dy_ = [0.0] * n, [0.0] * n
        worst = 0.0
        for i in range(n):
            for j in range(i + 1, n):
                dx, dy = px[i] - px[j], py[i] - py[j]
                d = math.sqrt(dx * dx + dy * dy)
                ov = r[i] + r[j] + 2.2 - d
                if ov > 0:
                    worst = max(worst, ov)
                    c = ov / d * 0.5
                    dx_[i] += dx * c
                    dy_[i] += dy * c
                    dx_[j] -= dx * c
                    dy_[j] -= dy * c
        if worst < 0.05:
            break
        for i in range(n):
            px[i] += dx_[i]
            py[i] += dy_[i]
    mx, my = sum(px) / n, sum(py) / n
    return [[px[i] - mx, py[i] - my] for i in range(n)]


# ---- 2. pack the clusters ----------------------------------------------------------------------------------------------
def _pack(R, W, slots, aspect, gap, gap_bad, seed):
    C = len(R)
    hub = [sum(row) for row in W]
    if seed < 8:
        order = sorted(range(C), key=lambda c: (-R[c], c))
    else:
        order = sorted(range(C), key=lambda c: (-hub[c], c))
    sa, sb = aspect**0.5, 1 / aspect**0.5
    X = [[0.0, 0.0] for _ in range(C)]
    for k, c in enumerate(order):
        a = k * GOLD + (seed % 8) * 0.785
        d = 0.0 if k == 0 else (R[order[0]] + R[c]) * 0.9 * math.sqrt(k)
        X[c] = [d * math.cos(a) * sa, d * math.sin(a) * sb]
    need = [[0.0] * C for _ in range(C)]
    for a in range(C):
        for b in range(C):
            if a != b:
                need[a][b] = R[a] + R[b] + (gap_bad if bad_pair(a, b, slots) else gap)
    wmax = max(1, max(max(row) for row in W))
    T = 1500
    for t in range(T):
        fx, fy = [0.0] * C, [0.0] * C
        for a in range(C):
            for b in range(a + 1, C):
                vx, vy = X[b][0] - X[a][0], X[b][1] - X[a][1]
                d = math.sqrt(vx * vx + vy * vy) + 1e-9
                ux, uy = vx / d, vy / d
                nd = need[a][b]
                if d < nd:
                    f = (nd - d) * 0.5
                elif W[a][b]:  # linked clusters pull together, more links pull harder
                    f = -(d - nd) * 0.06 * (0.25 + W[a][b] / wmax)
                else:
                    continue
                fx[a] -= ux * f
                fy[a] -= uy * f
                fx[b] += ux * f
                fy[b] += uy * f
        s = 0.4 + 0.6 * (1 - t / T)
        for c in range(C):
            fx[c] -= X[c][0] * 0.02 / aspect  # anisotropic gravity: the packing takes the box's aspect
            fy[c] -= X[c][1] * 0.02 * aspect
            X[c][0] += fx[c] * s
            X[c][1] += fy[c] * s
    return X, need


def pack_best(R, W, slots, aspect, gap, gap_bad):
    """The packing from 16 fixed starts (the spiral turned by k x 45 degrees; the second eight start with the cluster of
    most links to the others in the middle): the one whose links between clusters are shortest, with a small cost for a
    box larger than needed."""
    C = len(R)
    best = None
    for seed in range(16):
        X, need = _pack(R, W, slots, aspect, gap, gap_bad, seed)
        stretch = 0.0
        for a in range(C):
            for b in range(a + 1, C):
                stretch += W[a][b] * max(0.0, math.hypot(X[a][0] - X[b][0], X[a][1] - X[b][1]) - need[a][b])
        x0 = min(X[c][0] - R[c] for c in range(C))
        x1 = max(X[c][0] + R[c] for c in range(C))
        y0 = min(X[c][1] - R[c] for c in range(C))
        y1 = max(X[c][1] + R[c] for c in range(C))
        score = stretch + 0.02 * (x1 - x0) * (y1 - y0)
        if best is None or score < best[0] - 1e-6:
            best = (score, X)
    return best[1]


def convex(points):
    p = sorted(points)
    if len(p) < 3:
        return p

    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lo, up = [], []
    for q in p:
        while len(lo) > 1 and cr(lo[-2], lo[-1], q) <= 0:
            lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) > 1 and cr(up[-2], up[-1], q) <= 0:
            up.pop()
        up.append(q)
    return lo[:-1] + up[:-1]


def boxes_hit(a, b, pad=2):
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])


def circle_box(cx, cy, r, b):
    nx, ny = min(max(cx, b[0]), b[2]), min(max(cy, b[1]), b[3])
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r


def settings(variant):
    d = variant != 'phone'
    return {
        'k': 1.0 if d else 0.5,
        'aspect': 1.55 if d else 0.8,
        'L': 15.0 if d else 7.5,
        'gap': 16.0 if d else 6.0,
        'gap_bad': 40.0 if d else 15.0,
        'fs': 12.5 if d else 10.0,
        'gfs': 10.5 if d else 9.5,
    }


def shown_of(view, min_cluster, max_shown):
    """The clusters drawn in colour: the communities with `min_cluster` or more proteins, in order (largest first), at most
    `max_shown`; the others go on the shelf."""
    size = Counter(view['comm'])
    out = [c for c in range(len(view['labels'])) if size[c] >= min_cluster]
    return out[:max_shown], size


# ---- the positions: stages A to D --------------------------------------------------------------------------------------
def positions(view, variant='desktop', min_cluster=5, max_shown=8):
    """Positions of the proteins (before the figure is fitted to its box): the layout of each cluster, their packing and
    turning, and the shelf of the smaller ones."""
    S = settings(variant)
    k, L = S['k'], S['L']
    n = len(view['gene'])
    comm, sites = view['comm'], view['sites']
    shown, size = shown_of(view, min_cluster, max_shown)
    pos_c = {c: i for i, c in enumerate(shown)}
    slots = [slot_of(i) for i in range(len(shown))]
    r = [radius(s, k) for s in sites]
    members = {c: [i for i in range(n) if comm[i] == c] for c in shown}
    other = [i for i in range(n) if comm[i] not in members]
    local_ix = {}
    for c in shown:
        for m, i in enumerate(members[c]):
            local_ix[i] = m
    intra = defaultdict(list)
    C = len(shown)
    W = [[0] * C for _ in range(C)]
    inter = []
    for a, b, *_ in view['edges']:
        ca, cb = comm[a], comm[b]
        if ca == cb and ca in members:
            intra[ca].append((local_ix[a], local_ix[b]))
        elif ca in members and cb in members:
            W[pos_c[ca]][pos_c[cb]] += 1
            W[pos_c[cb]][pos_c[ca]] += 1
            inter.append((a, b))
    local, R = [], []
    for c in shown:
        idx = members[c]
        P = cluster_layout([r[i] for i in idx], intra[c], L)
        local.append(P)
        R.append(max(math.hypot(P[m][0], P[m][1]) + r[i] for m, i in enumerate(idx)) + 10 * k)
    X = pack_best(R, W, slots, S['aspect'], S['gap'], S['gap_bad']) if C else []
    # two passes of turning each cluster against the current places of its partners
    inter_by = defaultdict(list)
    for a, b in inter:
        inter_by[pos_c[comm[a]]].append((a, b))
        inter_by[pos_c[comm[b]]].append((b, a))
    for _ in range(2):
        cur = {}
        for ci, c in enumerate(shown):
            for m, i in enumerate(members[c]):
                cur[i] = (local[ci][m][0] + X[ci][0], local[ci][m][1] + X[ci][1])
        for ci, c in enumerate(shown):
            best, best_a = None, 0.0
            for q in range(36):
                a = q * math.pi / 18
                ca, sa = math.cos(a), math.sin(a)
                s = 0.0
                for i, j in inter_by.get(ci, []):
                    lx, ly = local[ci][local_ix[i]]
                    px, py = lx * ca - ly * sa + X[ci][0], lx * sa + ly * ca + X[ci][1]
                    s += math.hypot(px - cur[j][0], py - cur[j][1])
                if best is None or s < best - 1e-6:
                    best, best_a = s, a
            ca, sa = math.cos(best_a), math.sin(best_a)
            local[ci] = [[x * ca - y * sa, x * sa + y * ca] for x, y in local[ci]]
    xy = [[0.0, 0.0] for _ in range(n)]
    for ci, c in enumerate(shown):
        for m, i in enumerate(members[c]):
            xy[i] = [local[ci][m][0] + X[ci][0], local[ci][m][1] + X[ci][1]]
    # the smaller clusters: one shelf under the packing, left to right with wrapping
    groups = defaultdict(list)
    for i in other:
        groups[comm[i]].append(i)
    gl = {i: m for c in groups for m, i in enumerate(groups[c])}
    gedges = defaultdict(list)
    for a, b, *_ in view['edges']:
        if comm[a] == comm[b] and comm[a] in groups:
            gedges[comm[a]].append((gl[a], gl[b]))
    inn = [i for c in shown for i in members[c]]
    if inn:
        y_top = max(xy[i][1] + r[i] for i in inn) + 46 * k
        x0 = min(xy[i][0] - r[i] for i in inn)
        x_max = max(xy[i][0] + r[i] for i in inn)
    else:
        y_top, x0, x_max = 0.0, 0.0, 900.0 * k
    cx, cy, rowh = x0 + 4, y_top + 14 * k, 0.0
    small = []
    for c in sorted(groups):
        idx = groups[c]
        rr = [r[i] for i in idx]
        P = cluster_layout(rr, gedges[c], L * 0.9)
        left = min(P[m][0] - rr[m] for m in range(len(idx)))
        w = max(P[m][0] + rr[m] for m in range(len(idx))) - left
        top = min(P[m][1] - rr[m] for m in range(len(idx)))
        h = max(P[m][1] + rr[m] for m in range(len(idx))) - top
        if cx + w > x_max and cx > x0 + 4:
            cx, cy, rowh = x0 + 4, cy + rowh + 22 * k, 0.0
        for m, i in enumerate(idx):
            xy[i] = [P[m][0] + cx - left, P[m][1] + cy - top]
        small.append({'c': c, 'n': len(idx)})
        cx += w + 26 * k
        rowh = max(rowh, h)
    return {
        'xy': xy,
        'r': r,
        'shown': shown,
        'members': members,
        'other': other,
        'X': X,
        'W': W,
        'slots': slots,
        'size': size,
        'small': small,
        'y_top': y_top,
        'x0': x0,
        'k': k,
    }


# ---- the finish: outlines, labels, bundles, the fit ------------------------------------------------------------------
def finish(view, pos, variant='desktop', fs=None, gfs=None):
    """The figure of `variant` from the positions: outlines, bundles of the links between clusters, cluster labels placed
    outside the outlines, gene labels for the proteins with most sites, the shelf under the labels, and the box. fs and
    gfs are the type sizes in layout units (default: the variant's)."""
    S = settings(variant)
    fs = S['fs'] if fs is None else fs
    gfs = S['gfs'] if gfs is None else gfs
    k = pos['k']
    n = len(view['gene'])
    xy = [list(p) for p in pos['xy']]
    r, shown, members, other, X, W = pos['r'], pos['shown'], pos['members'], pos['other'], pos['X'], pos['W']
    size, y_top = pos['size'], pos['y_top']
    labels, sites, gene = view['labels'], view['sites'], view['gene']
    pos_c = {c: i for i, c in enumerate(shown)}
    phone = variant == 'phone'
    pad = 9 * k
    hulls = {}
    for c in shown:
        pts = []
        for i in members[c]:
            for a in range(12):
                t = a * math.pi / 6
                pts.append((xy[i][0] + (r[i] + pad) * math.cos(t), xy[i][1] + (r[i] + pad) * math.sin(t)))
        hulls[c] = convex(pts)
    inn = [i for c in shown for i in members[c]]
    G = (sum(xy[i][0] for i in inn) / len(inn), sum(xy[i][1] for i in inn) / len(inn)) if inn else (0.0, 0.0)
    obstacles = [(xy[i][0], xy[i][1], r[i] + 2) for i in range(n)]

    def hull_inside(c, p):
        h = hulls[c]
        for m in range(len(h)):
            a, b = h[m], h[(m + 1) % len(h)]
            if (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0:
                return False
        return True

    def hull_hits_box(box):
        for c in shown:
            for p in (
                (box[0], box[1]),
                (box[2], box[1]),
                (box[0], box[3]),
                (box[2], box[3]),
                ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2),
            ):
                if hull_inside(c, p):
                    return True
        return False

    def edge_point(c, toward):
        h, o = hulls[c], X[pos_c[c]]
        dx, dy = toward[0] - o[0], toward[1] - o[1]
        best = 0.0
        for m in range(len(h)):
            a, b = h[m], h[(m + 1) % len(h)]
            ex, ey = b[0] - a[0], b[1] - a[1]
            den = dx * ey - dy * ex
            if abs(den) < 1e-9:
                continue
            t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den
            u = ((a[0] - o[0]) * dy - (a[1] - o[1]) * dx) / den
            if t > 0 and 0 <= u <= 1:
                best = max(best, t)
        return (o[0] + dx * best * 0.97, o[1] + dy * best * 0.97)

    placed = []  # label boxes
    # bundles: one curve per pair of clusters with 6 or more links, bent to keep out of a third cluster
    bundles = []
    for a in range(len(shown)):
        for b in range(a + 1, len(shown)):
            if W[a][b] < 6:
                continue
            ca, cb = shown[a], shown[b]
            pa, pb = edge_point(ca, X[b]), edge_point(cb, X[a])
            dx, dy = pb[0] - pa[0], pb[1] - pa[1]
            ln = math.hypot(dx, dy) or 1.0
            best = None
            for f in (0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3):
                qx, qy = (pa[0] + pb[0]) / 2 - dy / ln * f * ln, (pa[1] + pb[1]) / 2 + dx / ln * f * ln
                hits = 0
                for s_ in range(1, 20):
                    t = s_ / 20
                    x = (1 - t) ** 2 * pa[0] + 2 * (1 - t) * t * qx + t * t * pb[0]
                    y = (1 - t) ** 2 * pa[1] + 2 * (1 - t) * t * qy + t * t * pb[1]
                    hits += sum(1 for c in shown if c not in (ca, cb) and hull_inside(c, (x, y)))
                cost = (hits, abs(f))
                if best is None or cost < best[0]:
                    best = (cost, (qx, qy))
            if best[0][0] == 0:
                bundles.append({'a': ca, 'b': cb, 'n': W[a][b], 'p': [pa, best[1], pb]})
    bpts = []
    for b_ in bundles:
        pa, q, pb = b_['p']
        for s_ in range(21):
            t = s_ / 20
            bpts.append(
                (
                    (1 - t) ** 2 * pa[0] + 2 * (1 - t) * t * q[0] + t * t * pb[0],
                    (1 - t) ** 2 * pa[1] + 2 * (1 - t) * t * q[1] + t * t * pb[1],
                )
            )
    clabels = []
    for c in sorted(shown, key=lambda c: (-size[c], c)):
        ci = pos_c[c]
        full = labels[c].get('term')
        term = short_name(full) or f'Cluster {c + 1}'
        if not phone:
            lines = wrap2(term, 22)
            cnt = f'{size[c]} proteins'
            w = max(max(text_w(s, fs, 600) for s in lines) + 14, text_w(cnt, fs - 1.5) + 14)
            h = fs * 1.25 * len(lines) + (fs - 1.5) * 1.3
        else:  # a numbered badge: the list under the figure names the clusters
            lines, cnt = [str(ci + 1)], ''
            w = h = fs * 1.7
        ox, oy = X[ci][0] - G[0], X[ci][1] - G[1]
        base = math.atan2(oy, ox) if math.hypot(ox, oy) > 1 else -math.pi / 2
        best = None
        for step in range(25):
            for sgn in (1, -1):
                a = base + sgn * step * math.pi / 12
                for extra in (6, 18, 32):
                    ux, uy = math.cos(a), math.sin(a)
                    sup = max((p[0] - X[ci][0]) * ux + (p[1] - X[ci][1]) * uy for p in hulls[c])
                    px, py = X[ci][0] + ux * (sup + extra), X[ci][1] + uy * (sup + extra)
                    bx, by = px - w * (1 - ux) / 2, py - h * (1 - uy) / 2
                    box = (bx, by, bx + w, by + h)
                    if any(boxes_hit(box, q) for q in placed):
                        continue
                    if any(circle_box(ox_, oy_, or_, box) for ox_, oy_, or_ in obstacles):
                        continue
                    if hull_hits_box(box):
                        continue
                    crosses = any(box[0] - 5 < x < box[2] + 5 and box[1] - 5 < y < box[3] + 5 for x, y in bpts)
                    cost = step * 1.0 + extra * 0.05 + (8 if crosses else 0)
                    if best is None or cost < best[0]:
                        best = (cost, box, a)
            if best and best[0] <= step:
                break
        if best is None:  # nowhere free: beside the outline, over whatever is there
            ux, uy = math.cos(base), math.sin(base)
            sup = max((p[0] - X[ci][0]) * ux + (p[1] - X[ci][1]) * uy for p in hulls[c])
            bx, by = X[ci][0] + ux * (sup + 6) - w * (1 - ux) / 2, X[ci][1] + uy * (sup + 6) - h * (1 - uy) / 2
            best = (0.0, (bx, by, bx + w, by + h), base)
        cost, box, a = best
        placed.append(box)
        hp = min(
            hulls[c],
            key=lambda p: (min(max(p[0], box[0]), box[2]) - p[0]) ** 2 + (min(max(p[1], box[1]), box[3]) - p[1]) ** 2,
        )
        nx, ny = min(max(hp[0], box[0] + 4), box[2]), min(max(hp[1], box[1]), box[3])
        clabels.append(
            {
                'c': c,
                'lines': lines,
                'count': cnt,
                'box': list(box),
                'leader': [hp[0], hp[1], nx, ny],
                'short': short_name(full),
                'full': full,
                'q': labels[c].get('q'),
            }
        )
    # the shelf of smaller clusters goes below every cluster label
    if other:
        low = max([b[3] for b in placed] + [y_top - 30 * k])
        shift = max(0.0, low + 40 * k - y_top)
        if shift:
            for i in other:
                xy[i][1] += shift
            obstacles = [(xy[i][0], xy[i][1], r[i] + 2) for i in range(n)]
            y_top += shift
    # gene labels: the proteins with most sites of each cluster (none on a phone), with no collisions
    per = 0 if phone else 3
    want = []
    for c in shown:
        want += sorted(members[c], key=lambda i: (-sites[i], gene[i]))[:per]
    want.sort(key=lambda i: (-sites[i], gene[i]))
    glabels = []
    for i in want:
        t = gene[i]
        w, h = text_w(t, gfs), gfs * 1.15
        cx, cy, rr = xy[i][0], xy[i][1], r[i] + 2.5
        cands = [
            (cx + rr, cy - h / 2, 'start'),
            (cx - rr - w, cy - h / 2, 'end'),
            (cx - w / 2, cy - rr - h, 'middle'),
            (cx - w / 2, cy + rr, 'middle'),
            (cx + rr * 0.7, cy - rr * 0.7 - h, 'start'),
            (cx - rr * 0.7 - w, cy - rr * 0.7 - h, 'end'),
            (cx + rr * 0.7, cy + rr * 0.7, 'start'),
            (cx - rr * 0.7 - w, cy + rr * 0.7, 'end'),
        ]
        for bx, by, al in cands:
            box = (bx, by, bx + w, by + h)
            if any(boxes_hit(box, q, 1) for q in placed):
                continue
            if any(circle_box(ox_, oy_, or_ - 1.5, box) for j, (ox_, oy_, or_) in enumerate(obstacles) if j != i):
                continue
            placed.append(box)
            glabels.append({'i': i, 't': t, 'box': list(box), 'align': al})
            break
    # the box: nodes, outlines and labels start at a margin
    allb = list(placed) + [(xy[i][0] - r[i], xy[i][1] - r[i], xy[i][0] + r[i], xy[i][1] + r[i]) for i in range(n)]
    for c in shown:
        hx = [p[0] for p in hulls[c]]
        hy = [p[1] for p in hulls[c]]
        allb.append((min(hx), min(hy), max(hx), max(hy)))
    if not allb:
        allb = [(0.0, 0.0, 10.0, 10.0)]
    mx0, my0 = min(b[0] for b in allb) - 12, min(b[1] for b in allb) - 12
    mx1, my1 = max(b[2] for b in allb) + 12, max(b[3] for b in allb) + 12

    def T(x, y):
        return [round(x - mx0, 1), round(y - my0, 1)]

    shelf = None
    if other:
        shelf = T(pos['x0'] + 4, y_top)
    return {
        'variant': variant,
        'w': round(mx1 - mx0, 1),
        'h': round(my1 - my0, 1),
        'k': k,
        'fs': fs,
        'gfs': gfs,
        'pos': [T(*xy[i]) for i in range(n)],
        'shown': shown,
        'centre': [T(*X[ci]) for ci in range(len(shown))],
        'hulls': [[T(*p) for p in hulls[c]] for c in shown],
        'clabels': [
            dict(
                lb,
                box=[
                    round(lb['box'][0] - mx0, 1),
                    round(lb['box'][1] - my0, 1),
                    round(lb['box'][2] - mx0, 1),
                    round(lb['box'][3] - my0, 1),
                ],
                leader=T(lb['leader'][0], lb['leader'][1]) + T(lb['leader'][2], lb['leader'][3]),
            )
            for lb in clabels
        ],
        'glabels': [
            dict(
                lb,
                box=[
                    round(lb['box'][0] - mx0, 1),
                    round(lb['box'][1] - my0, 1),
                    round(lb['box'][2] - mx0, 1),
                    round(lb['box'][3] - my0, 1),
                ],
            )
            for lb in glabels
        ],
        'bundles': [{'a': b['a'], 'b': b['b'], 'n': b['n'], 'p': [T(*q) for q in b['p']]} for b in bundles],
        'small': pos['small'],
        'shelf': shelf,
    }


def layout(view, variant='desktop', min_cluster=5, max_shown=8):
    return finish(view, positions(view, variant, min_cluster, max_shown), variant)
