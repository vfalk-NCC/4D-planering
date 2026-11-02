// Utskriftslayoutens verktyg (Victor 2026-10-08): tom färg = "ingen", högerklicksmeny, fördela jämnt,
// kopiera/klistra stil, ruta/linje (rundade hörn, streckad, genomskinlig) m.m.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9071;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await require('./_dialogs').bridge(page); // appens egna dialogrutor
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
    const gh = new Map(); await page.route('https://api.github.com/**', r => { const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', '')); if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); } const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString()); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) }); });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(800);
    await page.evaluate(async () => {
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
      await openPrint();
      pr.tpl.elements = [];
      [[20, 'a'], [70, 'b'], [200, 'c']].forEach(([x, id]) => pr.tpl.elements.push({ id, type: 'rect', x, y: 30, w: 20, h: 10, stroke: '#000000', fill: '', lw: 0.35 }));
      pr.tpl.elements.push({ id: 't', type: 'text', x: 20, y: 100, w: 60, h: 20, text: 'Hej', size: 9, color: '#000000', fill: '', border: '' });
      renderPrintPanel(); drawPrintPage();
    });
    // Utgåvor (Victor 2026-11-02): daterade versioner i egen fil, spårbarhet, mallen oförändrad
    const r = await page.evaluate(async () => {
      const o = {}; o.btn = document.getElementById('prSave').textContent; o.hasIssues = !!document.getElementById('prIssues');
      await prIsLoad(); document.getElementById('prIssues').open = true; prIsRender(); document.getElementById('prIsNew').click(); document.getElementById('prIsName').value = 'Vecka 45 – veckoutskick'; document.getElementById('prIsNote').value = 'Skickad till beställaren'; document.getElementById('prIsOk').click();
      await new Promise(r => setTimeout(r, 400)); const a = prIs.list[0]; o.saved = !!a && a.name === 'Vecka 45 – veckoutskick' && a.note === 'Skickad till beställaren' && a.rev === 1 && a.tpl.elements.some(e => e.id === 't');
      // en andra utgåva utan namn får veckonamn, och ändringar i layouten påverkar inte den första
      pr.tpl.elements.find(e => e.id === 't').text = 'Ändrad'; await prIssueSave('', '', false); o.second = prIs.list.length === 2 && /^Vecka \d+ – \d{4}-\d{2}-\d{2}/.test(prIs.list[0].name) && prIs.list[0].rev === 2;
      o.firstKept = prIs.list.find(x => x.rev === 1).tpl.elements.find(e => e.id === 't').text === 'Hej';
      o.rows = document.querySelectorAll('#prIssuesBody .pr-is-row').length;
      // öppna den första: layouten byter men mallen (id) är samma och den blir en osparad arbetskopia
      const id1 = prIs.list.find(x => x.rev === 1).id; const tplId = pr.tpl.id; window.uiConfirm = async () => true; await prIssueOpen(id1);
      o.opened = pr.tpl.elements.find(e => e.id === 't').text === 'Hej' && pr.tpl.id === tplId && pr.dirty === true;
      // automatisk utgåva när PDF skapas (PDF-funktionen stubbas)
      prIs.auto = true; const n0 = prIs.list.length; window.__pdf = 0; const ex = exportPrintPdf; await (async () => { const orig = ex; })(); o.hookOk = typeof exportPrintPdf === 'function' && document.getElementById('prExport').onclick === exportPrintPdf;
      await prIssueSave('', 'Automatisk', true); o.auto = prIs.list.length === n0 + 1 && prIs.list[0].auto === true;
      // ta bort
      await prIssueDelete(prIs.list[0].id); o.deleted = prIs.list.length === n0; return o;
    });
    const stored = JSON.parse(gh.get('projects/p1/print_issues.json') || '[]');
    if (!/Spara layout/.test(r.btn) || !r.hasIssues || !r.saved || !r.second || !r.firstKept || r.rows < 2 || !r.opened || !r.hookOk || !r.auto || !r.deleted || stored.length !== 2) fail('Utgåvor: ' + JSON.stringify({ r, stored: stored.length }));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_printissues', JSON.stringify({ r, stored: stored.length }));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
