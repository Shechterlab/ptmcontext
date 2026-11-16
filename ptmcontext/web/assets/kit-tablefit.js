/* Wide tables: a table wider than its card scrolls sideways, and a small hint above it says so (it goes once the reader
   has scrolled). The edge fade and the scrollbar that stays are the style sheet's. A module of the site kit: it watches
   the page and marks each scrolling table (.has-x). */
(window.PTMC_MODULES ||= []).push(() => {
  'use strict';
  if (typeof MutationObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') return; // not in a page
  let queued = false;
  const hintOf = (el) =>
    el.previousElementSibling?.classList.contains('scroll-hint') ? el.previousElementSibling : null;
  function scan() {
    queued = false;
    document.querySelectorAll('.tbl-card, .tbl-wrap').forEach((el) => {
      if (el.classList.contains('tbl-card') && el.querySelector('.tbl-wrap')) return; // the inner wrapper scrolls
      const x = el.scrollWidth > el.clientWidth + 2;
      el.classList.toggle('has-x', x);
      let h = hintOf(el);
      if (x && !h) {
        h = document.createElement('p');
        h.className = 'scroll-hint';
        h.setAttribute('aria-hidden', 'true');
        h.textContent = 'Scroll sideways for more columns →';
        el.before(h);
      }
      if (h) h.hidden = !x || el.scrollLeft > 8;
      if (!el.dataset.fit) {
        el.dataset.fit = '1';
        el.addEventListener(
          'scroll',
          () => {
            const k = hintOf(el);
            if (k) k.hidden = el.scrollLeft > 8;
          },
          { passive: true }
        );
      }
    });
  }
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(scan);
    }
  };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', queue);
  queue();
});
