// PDF-underlag (Victors önskemål 2026-10-06): ett block för att lägga in PDF:er som vanliga lager i
// arbetsytan (som DXF), utan att skapa en ny arbetsyta. PDF:en placeras ungefärligt och kalibreras
// sedan med två punktpar: en punkt i den nya PDF:en och samma punkt på arbetsytans ritning.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8985;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      if (kind === 37) { const [x, y] = v.convertToViewportPoint(140, 160), w = 20 * v.transform[0]; c.fillStyle = '#ff0000'; c.fillRect(x, y, w, w); }
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PID = 'p1', store = new Map(); let n = 0;
store.set(`projects/${PID}/status_plans.json`, { content: JSON.stringify([{ id: 'A', name: 'Grundplan', file_path: `projects/${PID}/status_plans/A.pdf`, zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }]), sha: 's0' });
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  require('./_reveal').autoReveal(page); // flikar och menyer (UI-översynen 2026-10-09)
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Markplan rev B' : undefined));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha, download_url: 'x' }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'PUT') { const b = JSON.parse(req.postData() || '{}'); if (e && b.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' }); const sha = 's' + (++n); store.set(f, { content: Buffer.from(b.content, 'base64').toString(/\.json$/.test(f) ? 'utf8' : 'latin1'), sha }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) }); }
    if (req.method() === 'DELETE') { store.delete(f); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    r.fulfill({ status: 405, body: '' });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = JSON.parse(JSON.stringify(plans.length ? plans : [{ id: 'A', name: 'Grundplan', file_path: 'projects/p1/status_plans/A.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }]));
    pdfCache.set('A', new Uint8Array([1]).buffer);
    await openPlan('A'); renderLayerPanel();
    document.querySelector('details.sec[data-sec="pdfu"]').open = true;
  });
  const sp = async m => page.evaluate(m => { const r = $('viewport').getBoundingClientRect(), s = stageToScreen(mToPx(m)); return [r.left + s[0], r.top + s[1]]; }, m);

  // 1) Lägg till: laddas upp, blir ett tänt PDF-lager (inte en arbetsyta), ungefärligt placerad, kalibreringen startar.
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 1)]);
  await page.setInputFiles('#pdfuInput', { name: 'Markplan.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForFunction(() => typeof pdfuCal !== 'undefined' && pdfuCal, null, { timeout: 8000 });
  const a = await page.evaluate(() => { const u = plans.find(p => p.underlay); return { u: !!u, id: u && u.id, prov: !!(u && u.calib && u.calib.provisional), opts: [...$('planSelect').options].map(o => o.textContent), row: !!document.querySelector(`#layerList .layer-row[data-layer="pdfp:${u.id}"]`), on: ls('pdfp:' + u.id).visible, op: ls('pdfp:' + u.id).opacity, hint: $('pdfuHint').textContent, info: $('pdfuInfo').textContent }; });
  const saved = JSON.parse(store.get(`projects/${PID}/status_plans.json`).content);
  if (!a.u || !a.prov || a.opts.length !== 1 || a.opts[0] !== 'Grundplan' || !a.row || !a.on || a.op !== 70) fail('Underlaget ska bli ett tänt lager, inte en arbetsyta: ' + JSON.stringify(a));
  if (!saved.some(p => p.underlay && p.base === 'A' && p.file_path === `projects/${PID}/status_plans/${a.id}.pdf`) || !store.has(`projects/${PID}/status_plans/${a.id}.pdf`)) fail('Underlaget och filen ska sparas');
  if (!/steg 1 av 4/.test(a.hint) || !/NYA PDF/.test(a.hint)) fail('Kalibreringen ska starta med en tydlig instruktion: ' + a.hint);
  console.log('OK: PDF:en blir ett tänt lager i arbetsytan (ingen ny arbetsyta), sparas, kalibreringen startar');

  // 2) Kalibrera: två punkter i underlaget (q1, q2 i dess PDF) och samma punkter på arbetsytan (modell b1, b2).
  const q = [[100, 100], [900, 400]], b = [[12, 20], [76, 52]];
  const ovModel = await page.evaluate(q => { const u = plans.find(p => p.underlay), A = calibAffine(u.calib), I = affInv(A); return q.map(([x, y]) => [I[0] * x + I[2] * y + I[4], I[1] * x + I[3] * y + I[5]]); }, q);
  for (let i = 0; i < 2; i++) {
    const s1 = await sp(ovModel[i]); await page.mouse.click(s1[0], s1[1]); await page.waitForTimeout(80);
    const s2 = await sp(b[i]); await page.mouse.click(s2[0], s2[1]); await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);
  const c = await page.evaluate(q => { const u = plans.find(p => p.underlay), I = affInv(calibAffine(u.calib)); return { cal: u.calib, back: q.map(([x, y]) => [I[0] * x + I[2] * y + I[4], I[1] * x + I[3] * y + I[5]]), busy: !!pdfuCal, hint: $('pdfuHint').classList.contains('hidden'), info: $('pdfuInfo').textContent }; }, q);
  const near = (p, r, tol) => Math.hypot(p[0] - r[0], p[1] - r[1]) < tol;
  if (c.busy || !c.hint || c.cal.provisional || !near(c.back[0], b[0], 0.2) || !near(c.back[1], b[1], 0.2)) fail('Två punktpar ska kalibrera underlaget: ' + JSON.stringify(c));
  if (!/Kalibrerad/.test(c.info)) fail('Blocket ska visa att underlaget är kalibrerat: ' + c.info);
  const sv = JSON.parse(store.get(`projects/${PID}/status_plans.json`).content).find(p => p.underlay);
  if (!sv.calib || sv.calib.provisional || !near(sv.calib.model[0], b[0], 0.2)) fail('Kalibreringen ska sparas: ' + JSON.stringify(sv.calib));
  console.log('OK: två punktpar (underlaget → arbetsytan) kalibrerar och sparar underlaget');

  // 3) Esc avbryter; underlaget öppnas aldrig som arbetsyta; byt namn och ta bort.
  await page.click('#btnPdfuCalib'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  if (await page.evaluate(() => !!pdfuCal)) fail('Esc ska avbryta kalibreringen');
  await page.evaluate(async id => { await openPlan(id); }, a.id);
  if ((await page.evaluate(() => plan.id)) !== 'A') fail('Ett underlag ska inte öppnas som arbetsyta');
  await page.click('#btnPdfuRename'); await page.waitForTimeout(400);
  if (!JSON.parse(store.get(`projects/${PID}/status_plans.json`).content).some(p => p.underlay && p.name === 'Markplan rev B')) fail('Namnbytet ska sparas');
  await page.click('#btnPdfuDelete'); await page.waitForTimeout(500);
  const d = await page.evaluate(id => ({ plans: plans.length, row: !!document.querySelector(`#layerList .layer-row[data-layer="pdfp:${id}"]`), box: $('pdfuSettings').classList.contains('hidden') }), a.id);
  if (d.plans !== 1 || d.row || !d.box || JSON.parse(store.get(`projects/${PID}/status_plans.json`).content).length !== 1 || store.has(`projects/${PID}/status_plans/${a.id}.pdf`)) fail('Ta bort ska ta bort lagret och filen: ' + JSON.stringify(d));
  console.log('OK: Esc avbryter, underlaget öppnas aldrig som arbetsyta, byt namn och ta bort');

  // 4) Arbetsytan okalibrerad: tydligt besked i stället för en felplacerad PDF.
  const msg = await page.evaluate(async () => { const saved = plan.calib; plan.calib = null; let m = ''; const o = window.alert; window.alert = t => { m = t; }; await addPdfUnderlays([new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })]); window.alert = o; plan.calib = saved; return m; });
  if (!/Kalibrera arbetsytan först/.test(msg)) fail('Okalibrerad arbetsyta ska ge besked: ' + msg);
  console.log('OK: okalibrerad arbetsyta ger ett tydligt besked');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
