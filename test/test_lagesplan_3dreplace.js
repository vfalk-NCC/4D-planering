const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9071;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => { const O = l3.O; const mk = (type, x) => { const p = placeNew(type, [x, 0, 0]); placements.push(p); placeTouch(p); l3AddPlacementMesh(p); return p; };
    const a = mk('container', 6512300), b = mk('container', 6512310); a.rot = 33; a.dz = 0.4; a.color = '#ff00aa'; a.itemId = 'i-77'; a.start = '2026-11-01'; a.end = '2026-12-01'; a.name = 'Min container'; a.opacity = 0.7; a.tex = { id: 'betong', s: 1, k: 1 }; a.L = 7; a.B = 3; a.H = 3;
    window.__ids = [a.id, b.id]; l3SelectIds([a.id]); });
  await page.waitForTimeout(600);
  await page.waitForSelector('[data-v3replace]');
  const opts = await page.$$eval('[data-v3replace] option', l => l.length); if (opts < 8) fail('Typlistan: ' + opts);
  const target = await page.$$eval('[data-v3replace] option', l => { const o = l.find(x => /Bod/.test(x.textContent)); return o ? o.value : null; }); if (!target) fail('Hittar inte "Bod"');
  await page.selectOption('[data-v3replace]', target); await page.waitForTimeout(300);
  const r1 = await page.evaluate(() => { const p = placements.find(x => x.id === window.__ids[0]); return { type: p.type, rot: p.rot, dz: p.dz, color: p.color, item: p.itemId, start: p.start, end: p.end, name: p.name, op: p.opacity, tex: p.tex && p.tex.id, L: p.L, x: p.x, mesh: l3.placeMeshes.has(p.id), n: placements.length, sel: [...l3.sel].join() === p.id }; });
  if (r1.type !== target || r1.rot !== 33 || r1.dz !== 0.4 || r1.color !== '#ff00aa' || r1.item !== 'i-77' || r1.start !== '2026-11-01' || r1.name !== 'Min container' || r1.op !== 0.7 || r1.tex !== 'betong' || !r1.mesh || r1.n !== 2) fail('Smart Replace: ' + JSON.stringify(r1));
  // Ångra ger tillbaka containern
  await page.evaluate(() => l3Undo()); await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => { const p = placements.find(x => x.id === window.__ids[0]); return { type: p.type, L: p.L }; }); if (r2.type !== 'container' || r2.L !== 7) fail('Ångra: ' + JSON.stringify(r2));
  // Flera markerade, automatiskt namn byts
  await page.evaluate(() => l3SelectIds(window.__ids)); await page.waitForTimeout(500);
  await page.waitForSelector('[data-v3replace]'); await page.selectOption('[data-v3replace]', target); await page.waitForTimeout(400);
  const r3 = await page.evaluate(() => placements.filter(p => window.__ids.includes(p.id)).map(p => [p.type, p.name].join('|')));
  const t3 = await page.evaluate(() => placements.filter(p => window.__ids.includes(p.id)).every(p => p.type !== 'container')); if (!t3) fail('Flera ersatta: ' + JSON.stringify(r3));
  console.log('OK: Smart Replace (ett och flera objekt, behåller egenskaper, Ångra)', JSON.stringify(r1));
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
