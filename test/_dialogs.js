// Testhjälp för appens egna dialogrutor (ui-dialog.js, Victor 2026-10-09): rutorna frågar
// window.__uiDialogBridge i stället för att visas. Samma hanterare som för page.on('dialog')
// fungerar: d.type(), d.message(), d.defaultValue(), d.accept(text), d.dismiss().
// Utan hanterare avvisas rutan (som Playwright gör med webbläsarens egna rutor).
// Kontrollerna kan ligga under "Fler inställningar" eller i en annan flik: klick och
// ifyllning visar dem först (som en användare), se _reveal.js.
function bridge(page, handler) {
  if (!page.__autoRevealed) { page.__autoRevealed = true; require('./_reveal').autoReveal(page); }
  const handlers = handler ? [handler] : [];
  page.__uiDialogHandlers = handlers;
  // page.on('dialog', h) gäller även appens rutor.
  const origOn = page.on.bind(page);
  page.on = (ev, fn) => { if (ev === 'dialog') handlers.push(fn); return origOn(ev, fn); };
  return page.exposeFunction('__uiDialogBridge', (type, message, def) => new Promise(resolve => {
    const d = { type: () => type, message: () => message, defaultValue: () => def,
      accept: v => { resolve({ ok: true, v: v === undefined ? def : v }); return Promise.resolve(); },
      dismiss: () => { resolve({ ok: false }); return Promise.resolve(); } };
    const hs = page.__uiDialogHandlers;
    if (!hs.length) { d.dismiss(); return; }
    try { hs.forEach(h => h(d)); } catch (e) { d.dismiss(); }
  }));
}
module.exports = { bridge };
