// Importgranskningen som HTML: sammanfattning, sorterad förskjutning, framdrift, sök och filter.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const p = await b.newPage();
  const fail = m => { throw new Error(m); };
  await p.setContent('<html><body></body></html>'); await p.addScriptTag({ path: path.join(__dirname, '..', 'docs', 'import-report-html.js') });
  const html = await p.evaluate(() => {
    const A = 'PRODUKTION / 742 Sikthall', B = 'PRODUKTION / 751 Rågodsinfrakt';
    const u = (n, a, s0, s1, e0, e1, p0, p1) => ({ 'Ändrat': 'x', 'Kod/namn': n, 'Område': a, 'Start före': s0, 'Start efter': s1, 'Slut före': e0, 'Slut efter': e1, 'Framdrift % före': p0, 'Framdrift % efter': p1, 'Status före': 'Planerad', 'Status efter': 'Planerad' });
    return planImportReportHtml('P.xlsx', [['Sammanfattning', [{ Vad: 'Nya objekt', Antal: 0 }]], ['Uppdateras', [u('Liten', A, '2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07', 0, 0), u('Stor', B, '2026-07-29', '2026-11-15', '2026-08-11', '2026-11-29', 10, 10), u('Pelare', A, '2026-10-12', '2026-10-12', '2026-10-17', '2026-10-17', 40, 67)]]]);
  });
  await p.setContent(html);
  const order = await p.evaluate(() => [...document.querySelectorAll('#datum tbody tr b')].map(x => x.textContent).filter(t => ['Liten', 'Stor'].includes(t)).join(','));
  if (order !== 'Stor,Liten') fail('största förskjutning först: ' + order);
  if (!(await p.$('#framdrift .bar'))) fail('framdrift ska visa staplar');
  await p.fill('#q', 'pelare'); const n1 = await p.evaluate(() => document.querySelectorAll('tbody tr:not(.hide)').length); if (n1 !== 1) fail('sök: ' + n1);
  await p.fill('#q', ''); await p.selectOption('#a', 'PRODUKTION / 751 Rågodsinfrakt'); const n2 = await p.evaluate(() => [...document.querySelectorAll('#datum tbody tr:not(.hide)')].length); if (n2 !== 1) fail('områdesfilter: ' + n2);
  console.log('ALLA TESTER OK'); await b.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
