// Testhjälp för UI:t efter översynen 2026-09-30: många kontroller ligger i
// flikar, "Filter ▾", "⋯"-menyer, radmenyer eller "Mer" i formuläret.
// autoReveal(page) gör så att klick/ifyllning först anropar appens
// revealElement() för elementet (byter flik / öppnar menyn), precis som en
// användare skulle göra – och sedan utför själva åtgärden som vanligt.
const ACTIONS = new Set(['click', 'dblclick', 'fill', 'check', 'uncheck', 'selectOption', 'setInputFiles', 'type', 'press', 'setChecked', 'hover', 'focus']);
const reveal = el => { if (window.revealElement) window.revealElement(el); };
function wrapLocator(loc) {
  return new Proxy(loc, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      if (ACTIONS.has(p)) return async (...a) => { await t.evaluate(reveal).catch(() => {}); return v.apply(t, a); };
      return (...a) => { const r = v.apply(t, a); return r && r.constructor && r.constructor.name === 'Locator' ? wrapLocator(r) : r; };
    }
  });
}
function autoReveal(page) {
  const origLocator = page.locator.bind(page);
  page.locator = (...a) => wrapLocator(origLocator(...a));
  for (const m of ACTIONS) {
    if (typeof page[m] !== 'function') continue;
    const orig = page[m].bind(page);
    page[m] = async (sel, ...a) => {
      if (typeof sel === 'string') await page.$eval(sel, reveal).catch(() => {});
      return orig(sel, ...a);
    };
  }
  return page;
}
module.exports = { autoReveal };
