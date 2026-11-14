/* Reads the selection's files off the page's thread (kit-seldata.js starts it): each file of data/sel/ is fetched and
   parsed here and sent back whole, one message per file, so the page only unpacks a file at a time. */
/* global self */
'use strict';
self.onmessage = async (e) => {
  const { base, files } = e.data;
  let next = 0;
  const lane = async () => {
    while (next < files.length) {
      const f = files[next++];
      try {
        const r = await fetch(base + f);
        if (!r.ok) throw new Error(`${r.status} ${f}`);
        self.postMessage({ f, data: await r.json() });
      } catch (err) {
        self.postMessage({ f, error: String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, lane));
  self.postMessage({ done: true });
};
