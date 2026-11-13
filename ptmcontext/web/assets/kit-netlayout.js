/* The Network view's figure layout in the browser: the twin of ptmcontext/web/netlayout.py (read its docstring), for the
   views the build cannot make ahead (a selection, another score, number of proteins, sources or clusters). The same steps in
   the same order on the same numbers of iterations, without randomness, in plain floating-point arithmetic.
     K.netlayout.layout(view, variant, minCluster, maxShown) -> the figure of "desktop" or "phone"
     K.netlayout.positions / finish          -> its two halves (the second alone places labels again, for larger type)
     K.netlayout.shortName(term)             -> the name drawn on the figure
     K.netlayout.inWorker(view, variant, minCluster, maxShown) -> a Promise of the same, from a Web Worker (or here)
   view: { gene, sites, comm, edges: [[a, b, flags, ...]], labels: [{ term, q }] }.
   The whole layout is one self-contained function (netLayoutFactory), so that a worker can be made from its source. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  function netLayoutFactory() {
    const COLOURS = 8;
    const CONFUSABLE = new Set(
      [
        [1, 7],
        [2, 4],
        [2, 5],
        [2, 6],
        [2, 8],
        [3, 5],
        [3, 6],
        [4, 6],
        [4, 8],
        [5, 8],
        [6, 8],
      ].map((p) => p.join(','))
    );
    const GOLD = 2.399963,
      GOLD_COS = -0.7373687228988248,
      GOLD_SIN = 0.6754904636562651; // see netlayout.py: the spiral turns by repeated multiplication
    const shortName = (t) => {
      if (!t) return null;
      const s = t.replace(/\s*\([^)]*\)/g, '').split(/,?\s+via\s+|,\s+/)[0];
      return s.trim() || t;
    };
    const wrapAt = (s, width) => {
      const lines = [];
      let cur = '';
      for (const w of s.split(/\s+/).filter(Boolean)) {
        if (cur && cur.length + 1 + w.length > width) {
          lines.push(cur);
          cur = w;
        } else cur = (cur + ' ' + w).trim();
      }
      lines.push(cur);
      if (lines.length > 2 && width >= 28) {
        const rest = lines.slice(1).join(' '),
          cut = rest.slice(0, width);
        return [lines[0], (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '…'];
      }
      return lines;
    };
    const wrap2 = (s, width = 22) => {
      for (let wd = width; wd < width + 7; wd++) {
        const out = wrapAt(s, wd);
        if (out.length <= 2) return out;
      }
      return wrapAt(s, width + 6);
    };
    const radius = (sites, k) => k * Math.min(9, 2.6 + 0.95 * Math.sqrt(sites));
    const textW = (t, size, weight = 500) => t.length * size * (weight >= 600 ? 0.56 : 0.53);
    const badPair = (a, b, slots) => {
      const sa = slots[a],
        sb = slots[b];
      return sa === sb || CONFUSABLE.has(Math.min(sa, sb) + 1 + ',' + (Math.max(sa, sb) + 1));
    };
    const settings = (variant) => {
      const d = variant !== 'phone';
      return {
        k: d ? 1 : 0.5,
        aspect: d ? 1.55 : 0.8,
        L: d ? 15 : 7.5,
        gap: d ? 16 : 6,
        gapBad: d ? 40 : 15,
        fs: d ? 12.5 : 10,
        gfs: d ? 10.5 : 9.5,
      };
    };
    const r1 = (v) => Math.round(v * 10) / 10;
    // ---- one cluster
    function clusterLayout(r, edges, L) {
      const n = r.length;
      if (n === 1) return [[0, 0]];
      const deg = new Array(n).fill(0);
      for (const [a, b] of edges) {
        deg[a]++;
        deg[b]++;
      }
      const order = [...Array(n).keys()].sort((a, b) => deg[b] - deg[a] || a - b);
      const px = new Array(n).fill(0),
        py = new Array(n).fill(0);
      let ca = 1,
        sa = 0;
      order.forEach((k, rank) => {
        const d = L * 0.6 * Math.sqrt(rank);
        px[k] = d * ca;
        py[k] = d * sa;
        [ca, sa] = [ca * GOLD_COS - sa * GOLD_SIN, ca * GOLD_SIN + sa * GOLD_COS];
      });
      const L2 = L * L,
        T = 500;
      for (let t = 0; t < T; t++) {
        const temp = L * 1.2 * (1 - t / T) + 0.3,
          fx = new Array(n).fill(0),
          fy = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          const xi = px[i],
            yi = py[i],
            ri = r[i];
          for (let j = i + 1; j < n; j++) {
            const dx = xi - px[j],
              dy = yi - py[j],
              d2 = dx * dx + dy * dy,
              d = Math.sqrt(d2),
              rep = L2 / d2;
            let gx = dx * rep,
              gy = dy * rep;
            const ov = ri + r[j] + 2.2 - d;
            if (ov > 0) {
              const c = (ov / d) * 2.0;
              gx += dx * c;
              gy += dy * c;
            }
            fx[i] += gx;
            fy[i] += gy;
            fx[j] -= gx;
            fy[j] -= gy;
          }
        }
        for (const [a, b] of edges) {
          const vx = px[a] - px[b],
            vy = py[a] - py[b],
            f = (Math.sqrt(vx * vx + vy * vy) + 1e-9) / L;
          fx[a] -= f * vx;
          fy[a] -= f * vy;
          fx[b] += f * vx;
          fy[b] += f * vy;
        }
        const g = 0.04 + 0.0006 * n;
        for (let i = 0; i < n; i++) {
          fx[i] -= px[i] * g;
          fy[i] -= py[i] * g;
          const m = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) + 1e-9,
            s = Math.min(m, temp) / m;
          px[i] += fx[i] * s;
          py[i] += fy[i] * s;
        }
      }
      for (let pass = 0; pass < 80; pass++) {
        const ddx = new Array(n).fill(0),
          ddy = new Array(n).fill(0);
        let worst = 0;
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const dx = px[i] - px[j],
              dy = py[i] - py[j],
              d = Math.sqrt(dx * dx + dy * dy),
              ov = r[i] + r[j] + 2.2 - d;
            if (ov > 0) {
              worst = Math.max(worst, ov);
              const c = (ov / d) * 0.5;
              ddx[i] += dx * c;
              ddy[i] += dy * c;
              ddx[j] -= dx * c;
              ddy[j] -= dy * c;
            }
          }
        if (worst < 0.05) break;
        for (let i = 0; i < n; i++) {
          px[i] += ddx[i];
          py[i] += ddy[i];
        }
      }
      const mx = px.reduce((s, v) => s + v, 0) / n,
        my = py.reduce((s, v) => s + v, 0) / n;
      return px.map((x, i) => [x - mx, py[i] - my]);
    }
    // ---- the packing
    function pack(R, W, slots, aspect, gap, gapBad, seed) {
      const C = R.length,
        hub = W.map((row) => row.reduce((s, v) => s + v, 0)),
        idx = [...Array(C).keys()],
        order = idx.sort(seed < 8 ? (a, b) => R[b] - R[a] || a - b : (a, b) => hub[b] - hub[a] || a - b),
        sa = Math.sqrt(aspect),
        sb = 1 / Math.sqrt(aspect),
        X = idx.map(() => [0, 0]);
      order.forEach((c, k) => {
        const a = k * GOLD + (seed % 8) * 0.785,
          d = k === 0 ? 0 : (R[order[0]] + R[c]) * 0.9 * Math.sqrt(k);
        X[c] = [d * Math.cos(a) * sa, d * Math.sin(a) * sb];
      });
      const need = idx.map(() => new Array(C).fill(0));
      for (let a = 0; a < C; a++)
        for (let b = 0; b < C; b++) if (a !== b) need[a][b] = R[a] + R[b] + (badPair(a, b, slots) ? gapBad : gap);
      const wmax = Math.max(1, ...W.map((row) => Math.max(...row))),
        T = 1500;
      for (let t = 0; t < T; t++) {
        const fx = new Array(C).fill(0),
          fy = new Array(C).fill(0);
        for (let a = 0; a < C; a++)
          for (let b = a + 1; b < C; b++) {
            const vx = X[b][0] - X[a][0],
              vy = X[b][1] - X[a][1],
              d = Math.sqrt(vx * vx + vy * vy) + 1e-9,
              ux = vx / d,
              uy = vy / d,
              nd = need[a][b];
            let f;
            if (d < nd) f = (nd - d) * 0.5;
            else if (W[a][b]) f = -(d - nd) * 0.06 * (0.25 + W[a][b] / wmax);
            else continue;
            fx[a] -= ux * f;
            fy[a] -= uy * f;
            fx[b] += ux * f;
            fy[b] += uy * f;
          }
        const s = 0.4 + 0.6 * (1 - t / T);
        for (let c = 0; c < C; c++) {
          fx[c] -= (X[c][0] * 0.02) / aspect;
          fy[c] -= X[c][1] * 0.02 * aspect;
          X[c][0] += fx[c] * s;
          X[c][1] += fy[c] * s;
        }
      }
      return { X, need };
    }
    function packBest(R, W, slots, aspect, gap, gapBad) {
      const C = R.length;
      let best = null;
      for (let seed = 0; seed < 16; seed++) {
        const { X, need } = pack(R, W, slots, aspect, gap, gapBad, seed);
        let stretch = 0;
        for (let a = 0; a < C; a++)
          for (let b = a + 1; b < C; b++)
            stretch += W[a][b] * Math.max(0, Math.hypot(X[a][0] - X[b][0], X[a][1] - X[b][1]) - need[a][b]);
        let x0 = Infinity,
          x1 = -Infinity,
          y0 = Infinity,
          y1 = -Infinity;
        for (let c = 0; c < C; c++) {
          x0 = Math.min(x0, X[c][0] - R[c]);
          x1 = Math.max(x1, X[c][0] + R[c]);
          y0 = Math.min(y0, X[c][1] - R[c]);
          y1 = Math.max(y1, X[c][1] + R[c]);
        }
        const score = stretch + 0.02 * (x1 - x0) * (y1 - y0);
        if (best === null || score < best[0] - 1e-6) best = [score, X];
      }
      return best[1];
    }
    const convex = (points) => {
      const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (p.length < 3) return p;
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]),
        lo = [],
        up = [];
      for (const q of p) {
        while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
        lo.push(q);
      }
      for (const q of p.slice().reverse()) {
        while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
        up.push(q);
      }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    };
    const boxesHit = (a, b, pad = 2) =>
      !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);
    const circleBox = (cx, cy, r, b) => {
      const nx = Math.min(Math.max(cx, b[0]), b[2]),
        ny = Math.min(Math.max(cy, b[1]), b[3]);
      return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
    };
    const sizes = (view) => {
      const size = new Array(view.labels.length).fill(0);
      view.comm.forEach((c) => size[c]++);
      return size;
    };
    // ---- stages A to D
    function positions(view, variant = 'desktop', minCluster = 5, maxShown = 8) {
      const S = settings(variant),
        k = S.k,
        L = S.L,
        n = view.gene.length,
        { comm, sites } = view,
        size = sizes(view),
        shown = [...Array(view.labels.length).keys()].filter((c) => size[c] >= minCluster).slice(0, maxShown),
        posC = new Map(shown.map((c, i) => [c, i])),
        slots = shown.map((_, i) => i % COLOURS),
        r = sites.map((s) => radius(s, k)),
        members = new Map(shown.map((c) => [c, []])),
        other = [],
        localIx = new Map();
      for (let i = 0; i < n; i++) {
        if (members.has(comm[i])) {
          localIx.set(i, members.get(comm[i]).length);
          members.get(comm[i]).push(i);
        } else other.push(i);
      }
      const C = shown.length,
        intra = new Map(shown.map((c) => [c, []])),
        W = shown.map(() => new Array(C).fill(0)),
        inter = [];
      for (const [a, b] of view.edges) {
        const ca = comm[a],
          cb = comm[b];
        if (ca === cb && members.has(ca)) intra.get(ca).push([localIx.get(a), localIx.get(b)]);
        else if (members.has(ca) && members.has(cb)) {
          W[posC.get(ca)][posC.get(cb)]++;
          W[posC.get(cb)][posC.get(ca)]++;
          inter.push([a, b]);
        }
      }
      const local = [],
        R = [];
      for (const c of shown) {
        const idx = members.get(c),
          P = clusterLayout(
            idx.map((i) => r[i]),
            intra.get(c),
            L
          );
        local.push(P);
        R.push(Math.max(...idx.map((i, m) => Math.hypot(P[m][0], P[m][1]) + r[i])) + 10 * k);
      }
      const X = C ? packBest(R, W, slots, S.aspect, S.gap, S.gapBad) : [];
      const interBy = new Map();
      const addBy = (ci, p) => (interBy.get(ci) || interBy.set(ci, []).get(ci)).push(p);
      for (const [a, b] of inter) {
        addBy(posC.get(comm[a]), [a, b]);
        addBy(posC.get(comm[b]), [b, a]);
      }
      for (let pass = 0; pass < 2; pass++) {
        const cur = new Map();
        shown.forEach((c, ci) =>
          members.get(c).forEach((i, m) => cur.set(i, [local[ci][m][0] + X[ci][0], local[ci][m][1] + X[ci][1]]))
        );
        shown.forEach((c, ci) => {
          let best = null,
            bestA = 0;
          for (let q = 0; q < 36; q++) {
            const a = (q * Math.PI) / 18,
              ca = Math.cos(a),
              sa = Math.sin(a);
            let s = 0;
            for (const [i, j] of interBy.get(ci) || []) {
              const [lx, ly] = local[ci][localIx.get(i)],
                px = lx * ca - ly * sa + X[ci][0],
                py = lx * sa + ly * ca + X[ci][1];
              s += Math.hypot(px - cur.get(j)[0], py - cur.get(j)[1]);
            }
            if (best === null || s < best - 1e-6) {
              best = s;
              bestA = a;
            }
          }
          const ca = Math.cos(bestA),
            sa = Math.sin(bestA);
          local[ci] = local[ci].map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
        });
      }
      const xy = Array.from({ length: n }, () => [0, 0]);
      shown.forEach((c, ci) =>
        members.get(c).forEach((i, m) => (xy[i] = [local[ci][m][0] + X[ci][0], local[ci][m][1] + X[ci][1]]))
      );
      const groups = new Map();
      for (const i of other) (groups.get(comm[i]) || groups.set(comm[i], []).get(comm[i])).push(i);
      const gl = new Map();
      groups.forEach((idx) => idx.forEach((i, m) => gl.set(i, m)));
      const gedges = new Map();
      for (const [a, b] of view.edges)
        if (comm[a] === comm[b] && groups.has(comm[a]))
          (gedges.get(comm[a]) || gedges.set(comm[a], []).get(comm[a])).push([gl.get(a), gl.get(b)]);
      const inn = shown.flatMap((c) => members.get(c));
      let yTop = 0,
        x0 = 0,
        xMax = 900 * k;
      if (inn.length) {
        yTop = Math.max(...inn.map((i) => xy[i][1] + r[i])) + 46 * k;
        x0 = Math.min(...inn.map((i) => xy[i][0] - r[i]));
        xMax = Math.max(...inn.map((i) => xy[i][0] + r[i]));
      }
      let cx = x0 + 4,
        cy = yTop + 14 * k,
        rowh = 0;
      const small = [];
      for (const c of [...groups.keys()].sort((a, b) => a - b)) {
        const idx = groups.get(c),
          rr = idx.map((i) => r[i]),
          P = clusterLayout(rr, gedges.get(c) || [], L * 0.9),
          left = Math.min(...idx.map((_, m) => P[m][0] - rr[m])),
          w = Math.max(...idx.map((_, m) => P[m][0] + rr[m])) - left,
          top = Math.min(...idx.map((_, m) => P[m][1] - rr[m])),
          h = Math.max(...idx.map((_, m) => P[m][1] + rr[m])) - top;
        if (cx + w > xMax && cx > x0 + 4) {
          cx = x0 + 4;
          cy = cy + rowh + 22 * k;
          rowh = 0;
        }
        idx.forEach((i, m) => (xy[i] = [P[m][0] + cx - left, P[m][1] + cy - top]));
        small.push({ c, n: idx.length });
        cx += w + 26 * k;
        rowh = Math.max(rowh, h);
      }
      return { xy, r, shown, members, other, X, W, slots, size, small, yTop, x0, k };
    }
    // ---- the finish
    function finish(view, pos, variant = 'desktop', fsIn = null, gfsIn = null) {
      const S = settings(variant),
        fs = fsIn == null ? S.fs : fsIn,
        gfs = gfsIn == null ? S.gfs : gfsIn,
        k = pos.k,
        xy = pos.xy.map((p) => p.slice()),
        { r, shown, members, other, X, W, size } = pos,
        { labels, sites, gene } = view,
        posC = new Map(shown.map((c, i) => [c, i])),
        phone = variant === 'phone',
        pad = 9 * k,
        hulls = new Map();
      let yTop = pos.yTop;
      for (const c of shown) {
        const pts = [];
        for (const i of members.get(c))
          for (let a = 0; a < 12; a++) {
            const t = (a * Math.PI) / 6;
            pts.push([xy[i][0] + (r[i] + pad) * Math.cos(t), xy[i][1] + (r[i] + pad) * Math.sin(t)]);
          }
        hulls.set(c, convex(pts));
      }
      const inn = shown.flatMap((c) => members.get(c)),
        G = inn.length
          ? [inn.reduce((s, i) => s + xy[i][0], 0) / inn.length, inn.reduce((s, i) => s + xy[i][1], 0) / inn.length]
          : [0, 0];
      let obstacles = xy.map((p, i) => [p[0], p[1], r[i] + 2]);
      const hullInside = (c, p) => {
        const h = hulls.get(c);
        for (let m = 0; m < h.length; m++) {
          const a = h[m],
            b = h[(m + 1) % h.length];
          if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false;
        }
        return true;
      };
      const hullHitsBox = (box) => {
        for (const c of shown)
          for (const p of [
            [box[0], box[1]],
            [box[2], box[1]],
            [box[0], box[3]],
            [box[2], box[3]],
            [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
          ])
            if (hullInside(c, p)) return true;
        return false;
      };
      const edgePoint = (c, toward) => {
        const h = hulls.get(c),
          o = X[posC.get(c)],
          dx = toward[0] - o[0],
          dy = toward[1] - o[1];
        let best = 0;
        for (let m = 0; m < h.length; m++) {
          const a = h[m],
            b = h[(m + 1) % h.length],
            ex = b[0] - a[0],
            ey = b[1] - a[1],
            den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den,
            u = ((a[0] - o[0]) * dy - (a[1] - o[1]) * dx) / den;
          if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
        }
        return [o[0] + dx * best * 0.97, o[1] + dy * best * 0.97];
      };
      const placed = [],
        bundles = [];
      for (let a = 0; a < shown.length; a++)
        for (let b = a + 1; b < shown.length; b++) {
          if (W[a][b] < 6) continue;
          const ca = shown[a],
            cb = shown[b],
            pa = edgePoint(ca, X[b]),
            pb = edgePoint(cb, X[a]),
            dx = pb[0] - pa[0],
            dy = pb[1] - pa[1],
            ln = Math.hypot(dx, dy) || 1;
          let best = null;
          for (const f of [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3]) {
            const qx = (pa[0] + pb[0]) / 2 - (dy / ln) * f * ln,
              qy = (pa[1] + pb[1]) / 2 + (dx / ln) * f * ln;
            let hits = 0;
            for (let s = 1; s < 20; s++) {
              const t = s / 20,
                x = (1 - t) ** 2 * pa[0] + 2 * (1 - t) * t * qx + t * t * pb[0],
                y = (1 - t) ** 2 * pa[1] + 2 * (1 - t) * t * qy + t * t * pb[1];
              for (const c of shown) if (c !== ca && c !== cb && hullInside(c, [x, y])) hits++;
            }
            const cost = [hits, Math.abs(f)];
            if (best === null || cost[0] < best[0][0] || (cost[0] === best[0][0] && cost[1] < best[0][1]))
              best = [cost, [qx, qy]];
          }
          if (best[0][0] === 0) bundles.push({ a: ca, b: cb, n: W[a][b], p: [pa, best[1], pb] });
        }
      const bpts = [];
      for (const bd of bundles) {
        const [pa, q, pb] = bd.p;
        for (let s = 0; s <= 20; s++) {
          const t = s / 20;
          bpts.push([
            (1 - t) ** 2 * pa[0] + 2 * (1 - t) * t * q[0] + t * t * pb[0],
            (1 - t) ** 2 * pa[1] + 2 * (1 - t) * t * q[1] + t * t * pb[1],
          ]);
        }
      }
      const clabels = [];
      for (const c of shown.slice().sort((a, b) => size[b] - size[a] || a - b)) {
        const ci = posC.get(c),
          full = labels[c].term || null,
          term = shortName(full) || `Cluster ${c + 1}`;
        let lines, cnt, w, h;
        if (!phone) {
          lines = wrap2(term, 22);
          cnt = `${size[c]} proteins`;
          w = Math.max(Math.max(...lines.map((s) => textW(s, fs, 600))) + 14, textW(cnt, fs - 1.5) + 14);
          h = fs * 1.25 * lines.length + (fs - 1.5) * 1.3;
        } else {
          lines = [String(ci + 1)];
          cnt = '';
          w = h = fs * 1.7;
        }
        const ox = X[ci][0] - G[0],
          oy = X[ci][1] - G[1],
          base = Math.hypot(ox, oy) > 1 ? Math.atan2(oy, ox) : -Math.PI / 2,
          hull = hulls.get(c);
        let best = null;
        for (let step = 0; step < 25; step++) {
          for (const sgn of [1, -1]) {
            const a = base + (sgn * step * Math.PI) / 12;
            for (const extra of [6, 18, 32]) {
              const ux = Math.cos(a),
                uy = Math.sin(a);
              let sup = -Infinity;
              for (const p of hull) sup = Math.max(sup, (p[0] - X[ci][0]) * ux + (p[1] - X[ci][1]) * uy);
              const px = X[ci][0] + ux * (sup + extra),
                py = X[ci][1] + uy * (sup + extra),
                bx = px - (w * (1 - ux)) / 2,
                by = py - (h * (1 - uy)) / 2,
                box = [bx, by, bx + w, by + h];
              if (placed.some((q) => boxesHit(box, q))) continue;
              if (obstacles.some(([ox_, oy_, or_]) => circleBox(ox_, oy_, or_, box))) continue;
              if (hullHitsBox(box)) continue;
              const crosses = bpts.some(
                  ([x, y]) => box[0] - 5 < x && x < box[2] + 5 && box[1] - 5 < y && y < box[3] + 5
                ),
                cost = step * 1.0 + extra * 0.05 + (crosses ? 8 : 0);
              if (best === null || cost < best[0]) best = [cost, box, a];
            }
          }
          if (best && best[0] <= step) break;
        }
        if (best === null) {
          const ux = Math.cos(base),
            uy = Math.sin(base);
          let sup = -Infinity;
          for (const p of hull) sup = Math.max(sup, (p[0] - X[ci][0]) * ux + (p[1] - X[ci][1]) * uy);
          const bx = X[ci][0] + ux * (sup + 6) - (w * (1 - ux)) / 2,
            by = X[ci][1] + uy * (sup + 6) - (h * (1 - uy)) / 2;
          best = [0, [bx, by, bx + w, by + h], base];
        }
        const box = best[1];
        placed.push(box);
        let hp = null,
          hd = Infinity;
        for (const p of hull) {
          const d =
            (Math.min(Math.max(p[0], box[0]), box[2]) - p[0]) ** 2 +
            (Math.min(Math.max(p[1], box[1]), box[3]) - p[1]) ** 2;
          if (d < hd) {
            hd = d;
            hp = p;
          }
        }
        const nx = Math.min(Math.max(hp[0], box[0] + 4), box[2]),
          ny = Math.min(Math.max(hp[1], box[1]), box[3]);
        clabels.push({
          c,
          lines,
          count: cnt,
          box,
          leader: [hp[0], hp[1], nx, ny],
          short: shortName(full),
          full,
          q: labels[c].q == null ? null : labels[c].q,
        });
      }
      if (other.length) {
        const low = Math.max(...placed.map((b) => b[3]), yTop - 30 * k),
          shift = Math.max(0, low + 40 * k - yTop);
        if (shift) {
          for (const i of other) xy[i][1] += shift;
          obstacles = xy.map((p, i) => [p[0], p[1], r[i] + 2]);
          yTop += shift;
        }
      }
      const per = phone ? 0 : 3;
      let want = [];
      for (const c of shown)
        want = want.concat(
          members
            .get(c)
            .slice()
            .sort((a, b) => sites[b] - sites[a] || (gene[a] < gene[b] ? -1 : gene[a] > gene[b] ? 1 : 0))
            .slice(0, per)
        );
      want.sort((a, b) => sites[b] - sites[a] || (gene[a] < gene[b] ? -1 : gene[a] > gene[b] ? 1 : 0));
      const glabels = [];
      for (const i of want) {
        const t = gene[i],
          w = textW(t, gfs),
          h = gfs * 1.15,
          cx = xy[i][0],
          cy = xy[i][1],
          rr = r[i] + 2.5,
          cands = [
            [cx + rr, cy - h / 2, 'start'],
            [cx - rr - w, cy - h / 2, 'end'],
            [cx - w / 2, cy - rr - h, 'middle'],
            [cx - w / 2, cy + rr, 'middle'],
            [cx + rr * 0.7, cy - rr * 0.7 - h, 'start'],
            [cx - rr * 0.7 - w, cy - rr * 0.7 - h, 'end'],
            [cx + rr * 0.7, cy + rr * 0.7, 'start'],
            [cx - rr * 0.7 - w, cy + rr * 0.7, 'end'],
          ];
        for (const [bx, by, al] of cands) {
          const box = [bx, by, bx + w, by + h];
          if (placed.some((q) => boxesHit(box, q, 1))) continue;
          if (obstacles.some(([ox_, oy_, or_], j) => j !== i && circleBox(ox_, oy_, or_ - 1.5, box))) continue;
          placed.push(box);
          glabels.push({ i, t, box, align: al });
          break;
        }
      }
      const allb = placed.concat(xy.map((p, i) => [p[0] - r[i], p[1] - r[i], p[0] + r[i], p[1] + r[i]]));
      for (const c of shown) {
        const h = hulls.get(c);
        allb.push([
          Math.min(...h.map((p) => p[0])),
          Math.min(...h.map((p) => p[1])),
          Math.max(...h.map((p) => p[0])),
          Math.max(...h.map((p) => p[1])),
        ]);
      }
      if (!allb.length) allb.push([0, 0, 10, 10]);
      const mx0 = Math.min(...allb.map((b) => b[0])) - 12,
        my0 = Math.min(...allb.map((b) => b[1])) - 12,
        mx1 = Math.max(...allb.map((b) => b[2])) + 12,
        my1 = Math.max(...allb.map((b) => b[3])) + 12,
        T = (x, y) => [r1(x - mx0), r1(y - my0)],
        B = (b) => [r1(b[0] - mx0), r1(b[1] - my0), r1(b[2] - mx0), r1(b[3] - my0)];
      return {
        variant,
        w: r1(mx1 - mx0),
        h: r1(my1 - my0),
        k,
        fs,
        gfs,
        pos: xy.map((p) => T(p[0], p[1])),
        shown,
        centre: shown.map((_, ci) => T(X[ci][0], X[ci][1])),
        hulls: shown.map((c) => hulls.get(c).map((p) => T(p[0], p[1]))),
        clabels: clabels.map((l) => ({
          ...l,
          box: B(l.box),
          leader: [...T(l.leader[0], l.leader[1]), ...T(l.leader[2], l.leader[3])],
        })),
        glabels: glabels.map((l) => ({ ...l, box: B(l.box) })),
        bundles: bundles.map((b) => ({ a: b.a, b: b.b, n: b.n, p: b.p.map((q) => T(q[0], q[1])) })),
        small: pos.small,
        shelf: other.length ? T(pos.x0 + 4, yTop) : null,
      };
    }
    const layout = (view, variant = 'desktop', minCluster = 5, maxShown = 8) =>
      finish(view, positions(view, variant, minCluster, maxShown), variant);
    return { layout, positions, finish, shortName, wrap2, settings, radius };
  }
  const NL = netLayoutFactory();
  const src = netLayoutFactory.toString();
  let worker = null,
    seq = 0;
  const pending = new Map();
  // the layout in a Web Worker (the page stays responsive while a big selection is laid out); here when no worker can start
  const inWorker = (view, variant, minCluster, maxShown) =>
    new Promise((ok) => {
      const here = () => ok(NL.layout(view, variant, minCluster, maxShown));
      try {
        if (!worker) {
          const code = `const NL=(${src})();self.onmessage=(e)=>{const m=e.data;self.postMessage({id:m.id,out:NL.layout(m.view,m.variant,m.minCluster,m.maxShown)})}`;
          const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
          worker = new Worker(url);
          URL.revokeObjectURL(url);
          worker.onmessage = (e) => {
            const f = pending.get(e.data.id);
            pending.delete(e.data.id);
            if (f) f(e.data.out);
          };
          worker.onerror = () => {
            worker = null;
            pending.forEach((_, id) => pending.delete(id));
            here();
          };
        }
        const id = ++seq;
        pending.set(id, ok);
        worker.postMessage({ id, view, variant, minCluster, maxShown });
      } catch (e) {
        here();
      }
    });
  K.netlayout = { ...NL, inWorker };
});
