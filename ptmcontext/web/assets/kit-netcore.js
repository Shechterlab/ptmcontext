/* The network view's arithmetic (website.network), without a document: Louvain clustering (Blondel et al. 2008), each
   cluster's most enriched term, and the network of a selection or of other options. It is the twin of ptmcontext/web/network.py
   (louvain, label_clusters, make_view): the same steps in the same order on the same integers, so that the page's network
   and the file the build wrote for the default agree; tests/test_network.py runs both on one graph. K.netcore =
   { louvain(n, edges, resolution), labelClusters(comm, ann, terms, opt), makeView(full, opt, select, enabled) }.
   A module of the site kit. */
(window.PTMC_MODULES ||= []).push((K) => {
  'use strict';
  const EPS = 1e-12;
  // communities of n nodes for edges [i, j, w] (integer weights): nodes in index order, a node moves to the neighbouring
  // community of the largest gain (ties to the lower number) and stays unless a move gains more than EPS; communities are
  // numbered by size, then by their lowest node index
  function louvain(n, edges, resolution) {
    const adj = Array.from({ length: n }, () => new Map());
    for (const [i, j, w] of edges) {
      if (i === j) continue;
      adj[i].set(j, (adj[i].get(j) || 0) + w);
      adj[j].set(i, (adj[j].get(i) || 0) + w);
    }
    const sorted = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]);
    let nbrs = adj.map(sorted),
      loop = new Array(n).fill(0),
      nodeComm = Array.from({ length: n }, (_, i) => i);
    for (let level = 0; level < 100; level++) {
      const size = nbrs.length,
        deg = nbrs.map((l, i) => l.reduce((s, [, w]) => s + w, 0) + loop[i]),
        m2 = deg.reduce((s, d) => s + d, 0);
      if (m2 === 0) break;
      const comm = Array.from({ length: size }, (_, i) => i),
        tot = deg.slice();
      let movedAny = false;
      for (let sweep = 0; sweep < 100; sweep++) {
        let moved = false;
        for (let i = 0; i < size; i++) {
          const ci = comm[i],
            wc = new Map();
          for (const [j, w] of nbrs[i]) wc.set(comm[j], (wc.get(comm[j]) || 0) + w);
          tot[ci] -= deg[i];
          let best = ci,
            bestGain = (wc.get(ci) || 0) - (resolution * tot[ci] * deg[i]) / m2;
          for (const c of [...wc.keys()].sort((a, b) => a - b)) {
            if (c === ci) continue;
            const gain = wc.get(c) - (resolution * tot[c] * deg[i]) / m2;
            if (gain > bestGain + EPS) {
              best = c;
              bestGain = gain;
            }
          }
          tot[best] += deg[i];
          comm[i] = best;
          if (best !== ci) moved = movedAny = true;
        }
        if (!moved) break;
      }
      if (!movedAny) break;
      const first = new Map();
      for (let i = 0; i < size; i++) if (!first.has(comm[i])) first.set(comm[i], i);
      const order = [...first.keys()].sort((a, b) => first.get(a) - first.get(b)),
        renum = new Map(order.map((c, k) => [c, k])),
        nxt = order.map(() => new Map()),
        nloop = new Array(order.length).fill(0);
      for (let i = 0; i < size; i++) {
        const ci = renum.get(comm[i]);
        nloop[ci] += loop[i];
        for (const [j, w] of nbrs[i]) {
          const cj = renum.get(comm[j]);
          if (ci === cj) nloop[ci] += w;
          else nxt[ci].set(cj, (nxt[ci].get(cj) || 0) + w);
        }
      }
      nodeComm = nodeComm.map((c) => renum.get(comm[c]));
      nbrs = nxt.map(sorted);
      loop = nloop;
    }
    const sizes = new Map(),
      low = new Map();
    nodeComm.forEach((c, i) => {
      sizes.set(c, (sizes.get(c) || 0) + 1);
      if (!low.has(c)) low.set(c, i);
    });
    const rank = new Map(
      [...sizes.keys()].sort((a, b) => sizes.get(b) - sizes.get(a) || low.get(a) - low.get(b)).map((c, k) => [c, k])
    );
    return nodeComm.map((c) => rank.get(c));
  }
  // a chosen number of clusters: of the resolutions 0.25 and then 24 steps of 15% (by repeated multiplication, as in
  // network.py), the partition whose number of clusters (communities of min_cluster or more proteins) is closest to the
  // target; of equal distance the resolution nearest the default one (in ratio), then the lower
  function communities(n, edges, opt) {
    if (!opt.clusters) return louvain(n, edges, opt.resolution);
    let best = null,
      res = 0.25;
    for (let k = 0; k < 24; k++, res = res * 1.15) {
      const comm = louvain(n, edges, res),
        size = new Map();
      comm.forEach((c) => size.set(c, (size.get(c) || 0) + 1));
      let count = 0;
      size.forEach((v) => v >= opt.min_cluster && count++);
      const d = Math.abs(count - opt.clusters),
        e = Math.abs(Math.log(res / opt.resolution));
      if (best === null || d < best[0] || (d === best[0] && e < best[1])) best = [d, e, comm];
    }
    return best[2];
  }
  // each cluster's term: the smallest q (Benjamini-Hochberg over the terms tested in the cluster; equal to 1e-9 relative)
  // among the terms with min_overlap or more of its proteins that annotate min_term or more of the network's N proteins and
  // at most max_fraction of them (one-sided hypergeometric p against all the network's proteins), a tie going to the deeper
  // term, then the smaller p, the term with fewer proteins, the name; no label above max_q. With opt.label set, only the
  // terms of that source (a term's second item)
  function labelClusters(comm, ann, terms, opt) {
    const N = comm.length,
      members = [];
    comm.forEach((c, i) => (members[c] ||= []).push(i));
    const count = new Map();
    ann.forEach((a) => a.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
    const ex = new Set(opt.exclude || []),
      ok = new Set();
    count.forEach((m, t) => {
      if (
        m >= opt.min_term &&
        m / N <= opt.max_fraction &&
        (opt.label == null || terms[t][1] === opt.label) &&
        !ex.has(terms[t][2]) &&
        !ex.has(terms[t][0])
      )
        ok.add(t);
    });
    return members.map((mem) => {
      const n = mem.length,
        kOf = new Map();
      mem.forEach((i) => ann[i].forEach((t) => ok.has(t) && kOf.set(t, (kOf.get(t) || 0) + 1)));
      const tested = [...kOf.keys()].filter((t) => kOf.get(t) >= opt.min_overlap).sort((a, b) => a - b);
      if (!tested.length) return { n, term: null };
      const ps = tested.map((t) => window.PTMC_STATS.hyperSF(kOf.get(t), N, count.get(t), n)),
        qs = window.PTMC_STATS.bh(ps);
      const dp = (j) => terms[tested[j]][3] || 0,
        cnt = (j) => count.get(tested[j]),
        nm = (j) => terms[tested[j]][0],
        // does tested[x] beat tested[y] on equal q: deeper, then smaller p, fewer proteins, name
        wins = (x, y) =>
          dp(x) !== dp(y)
            ? dp(x) > dp(y)
            : ps[x] !== ps[y]
              ? ps[x] < ps[y]
              : cnt(x) !== cnt(y)
                ? cnt(x) < cnt(y)
                : nm(x) < nm(y);
      let best = 0;
      for (let j = 1; j < tested.length; j++) {
        const same = Math.abs(qs[j] - qs[best]) <= 1e-9 * Math.max(qs[j], qs[best]);
        if (same ? wins(j, best) : qs[j] < qs[best]) best = j;
      }
      if (!(qs[best] <= opt.max_q)) return { n, term: null };
      const t = tested[best];
      return {
        n,
        term: terms[t][0],
        id: terms[t][2],
        source: terms[t][1],
        p: ps[best],
        q: qs[best],
        k: kOf.get(t),
        M: count.get(t),
        N,
      };
    });
  }
  // the network for the options. full: { sources, nodes: [[acc, gene, sites]], edges: [[a, b, flags, score]], terms, ann };
  // select: a Set of node indexes or null; enabled: the sources' indexes (default all)
  function makeView(full, opt, select, enabled) {
    const cfg = full.sources,
      en = enabled || cfg.map((_, i) => i),
      mask = en.reduce((m, i) => m | (1 << i), 0),
      pairsIx = cfg.findIndex((s) => s.kind === 'pairs'),
      pairsBit = pairsIx < 0 ? 0 : 1 << pairsIx,
      nodes = full.nodes;
    const cand = nodes.map((_, i) => i).filter((i) => !select || select.has(i));
    cand.sort((a, b) => {
      const x = nodes[a],
        y = nodes[b];
      return y[2] - x[2] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
    });
    const keep = new Set(cand.slice(0, opt.top)),
      edges = [];
    for (const [a, b, f0, score] of full.edges) {
      if (!keep.has(a) || !keep.has(b)) continue;
      let fl = f0 & mask,
        w = 0;
      if (fl & pairsBit && score >= opt.min_score) w = score;
      else fl &= ~pairsBit;
      cfg.forEach((s, i) => {
        if (s.kind === 'groups' && fl & (1 << i)) w = Math.max(w, s.weight);
      });
      if (w) edges.push([a, b, fl, score, w]);
    }
    const live = [...new Set(edges.flatMap((e) => [e[0], e[1]]))].sort((a, b) => a - b),
      pos = new Map(live.map((g, k) => [g, k])),
      comm = communities(
        live.length,
        edges.map((e) => [pos.get(e[0]), pos.get(e[1]), e[4]]),
        opt
      );
    return {
      nodes: live,
      edges: edges.map((e) => [pos.get(e[0]), pos.get(e[1]), e[2], e[3]]),
      comm,
      labels: labelClusters(
        comm,
        live.map((g) => full.ann[g]),
        full.terms,
        opt
      ),
    };
  }
  K.netcore = { louvain, communities, labelClusters, makeView };
});
