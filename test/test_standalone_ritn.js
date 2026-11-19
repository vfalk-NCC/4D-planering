const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9321;
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


  const PDFMOCK = () => { window.pdfjsLib.getDocument = () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ view: [0, 0, 600, 400] }) }) });
    window.pdfObjParse = async () => [{ kind: 'path', d: [['M', 0, 0], ['L', 600, 0], ['L', 600, 400], ['L', 0, 400], ['Z']], stroke: '#000000', fill: null }, { kind: 'path', d: [['M', 0, 0], ['L', 600, 400]], stroke: '#ff0000', fill: null }]; };
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } }), gh = [];
  const open = async () => { const pg = await ctx.newPage(); await pg.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); }); pg.on('pageerror', e => errors.push(e.message)); await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await pg.route('https://api.github.com/**', r => { gh.push(r.request().url()); r.fulfill({ status: 404, body: '{}' }); }); await pg.goto(`http://localhost:${PORT}/lagesplan.html?fristaende=1`);
    await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3rdImportFiles === 'function', null, { timeout: 25000 }); await pg.evaluate(PDFMOCK); return pg; };
  const errors = []; const ok = (c, m) => { if (!c) fail(m); };
  const p1 = await open();
  const made = await p1.evaluate(async () => { const f = new File([new Uint8Array([37, 80, 68, 70])], 'Lokal.pdf', { type: 'application/pdf' }); const r = await l3rdImportFiles([f], { plane: 'plan', scale: 500, page: 1, allPages: false }); await l3rdFlush(); const d = r[0]; d.opacity = 0.4; l3rdTouch(d); await l3rdFlush(); return { n: l3rd.list.length, id: d.id, local: !!d.local, path: d.path }; });
  ok(made.n === 1 && !made.local, 'Ritning inläst i fristående läge och sparad lokalt: ' + JSON.stringify(made));
  await p1.close(); const p2 = await open();   // ny sida = som att starta programmet igen
  await p2.waitForFunction(() => l3rd.list.length === 1 && l3rd.list[0]._e, null, { timeout: 15000 });
  const again = await p2.evaluate(() => ({ name: l3rd.list[0].name, op: l3rd.list[0].opacity, segs: l3rd.list[0]._e.S.seg.length / 4 }));
  ok(again.name === 'Lokal' && Math.abs(again.op - 0.4) < 1e-9 && again.segs === 5, 'Ritningen finns kvar efter omstart: ' + JSON.stringify(again));
  // Säkerhetskopia av allt till en fil och tillbaka (efter att den lokala databasen rensats)
  const bk = await p2.evaluate(async () => {
    const blob = await sbBackup(), file = new File([blob], 'kopia.4dlokal'); const head = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 8).arrayBuffer()));
    const keys = (await sbAllKv()).map(x => x[0]), before = keys.filter(k => /drawings3d/.test(k)).length;
    const db = await sbOpen(); await new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = res; });
    const emptied = (await sbAllKv()).length; const r = await sbRestore(file, true); const after = (await sbAllKv()).map(x => x[0]).filter(k => /drawings3d/.test(k)).length;
    const reg = await ghReadJSON(token, l3rdPath()); return { head, size: blob.size, before, emptied, restored: r.kv, after, reg: Array.isArray(reg) ? reg.length : -1, bin: (await sbAllKv()).some(x => /\.pdf$/.test(x[0]) && x[1].b64) };
  });
  ok(bk.head === '4DLOKAL1' && bk.before === 2 && bk.emptied === 0 && bk.after === 2 && bk.reg === 1 && bk.bin, 'Säkerhetskopia och återställning: ' + JSON.stringify(bk));
  ok(gh.length === 0 || gh.every(u => !/contents/.test(u)), 'Inga anrop mot GitHubs data: ' + gh.join(','));
  ok(!errors.length, 'Sidfel: ' + errors.join(' | '));
  console.log('OK: fristående läge – RITNINGAR sparas och finns kvar utan GitHub');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
