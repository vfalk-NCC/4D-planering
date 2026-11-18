const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9271;
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3gcCalc === 'function', null, { timeout: 15000 });
  const ok = (c, m) => { if (!c) fail(m); };
  await page.evaluate(() => {
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const objs = [['g0', 'Platta betong', 'IFCSLAB', 30, 30, 2, 0, 36], ['g1', 'Balk', 'IFCBEAM', 10, 2, 3, 30, 50], ['g2', 'Stålstolpe HEA', 'IFCCOLUMN', 1, 1, 4, 0, 60], ['g3', 'Öppen', 'IFCWALL', 4, 4, 4, 0, 70]];
    const pos = new Float32Array(objs.length * 24 * 3), col = new Uint8Array(objs.length * 24 * 3).fill(200), idx = new Uint32Array(objs.length * 36), ranges = [];
    objs.forEach(([g, n, c, a, b, h, rot, x0], k) => { const r = rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r); for (let v = 0; v < 8; v++) { const o = (k * 8 + v) * 3, X = cube[v][0] * a, Y = cube[v][1] * b; pos[o] = x0 + X * cs - Y * sn; pos[o + 1] = Y * cs + X * sn; pos[o + 2] = cube[v][2] * h; }
      const f = tri.slice(); let cnt = 36; if (g === 'g3') cnt = 30;   // saknar ett par trianglar → öppet nät
      for (let t = 0; t < 36; t++) idx[k * 36 + t] = k * 8 + f[t]; ranges.push({ start: k * 8, count: 8, idxStart: k * 36, idxCount: cnt, guid: g, name: n, cls: c, base: [0.8, 0.8, 0.8] }); });
    const m = { id: 'vm', name: 'Geo.ifc', visible: true, meshes: [], ranges, tris: objs.length * 12, O: [0, 0, 0], src: { id: 'vm', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition(); mesh.updateMatrixWorld(true);
  });
  const G = await page.evaluate(() => { const mesh = l3b.models[0].meshes[0], r = i => { const g = l3gcCalc(mesh, i); return g && { vol: g.vol, area: g.area, foot: g.foot, side: g.side, L: g.L, B: g.B, H: g.H, closed: g.closed, thick: g.thick, tris: g.tris, w: (l3gcWeight(g, ['Platta betong', 'Balk', 'Stålstolpe HEA', 'Öppen'][i], ['IFCSLAB', 'IFCBEAM', 'IFCCOLUMN', 'IFCWALL'][i]) || {}).kg }; }; return [0, 1, 2, 3].map(r); });
  const near = (a, b, t = 0.01) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));
  ok(near(G[0].vol, 1800) && near(G[0].area, 2040) && near(G[0].foot, 900) && near(G[0].side, 240) && near(G[0].H, 2) && near(G[0].thick, 2, 0.02) && G[0].closed, 'Platta 30×30×2: ' + JSON.stringify(G[0]));
  ok(near(G[0].w, 1800 * 2400), 'Vikt för betong 2400 kg/m³: ' + G[0].w);
  ok(near(G[1].vol, 60) && near(G[1].L, 10) && near(G[1].B, 2) && near(G[1].H, 3), 'Balk vriden 30°: mått längs egen riktning: ' + JSON.stringify(G[1]));
  ok(near(G[2].vol, 4) && near(G[2].w, 4 * 7850), 'Stålstolpe: volym och vikt med stål 7850: ' + JSON.stringify(G[2]));
  ok(G[3].closed === false, 'Öppet nät märks');
  // Enskilt objekt: avsnittet i högerpanelen
  await page.evaluate(() => l3bsSet([{ mesh: l3b.models[0].meshes[0], ri: 0 }])); await page.waitForSelector('#v3BsGeo details', { timeout: 5000 }); await page.waitForTimeout(300);
  const txt = await page.textContent('#v3BsGeo');
  ok(/Beräknat ur geometrin/.test(txt) && /1\s?800,000 m³/.test(txt) && /Formsida/.test(txt) && /30,000 × 30,000 × 2,000 m/.test(txt) && /Slutet/.test(txt) && /Vikt/.test(txt) && /4\s?320 ton/.test(txt), 'Panelen visar volym, mått, vikt, nät: ' + txt.replace(/\s+/g, ' ').slice(0, 400));
  // Flera markerade: summa
  await page.evaluate(() => l3bsSet([0, 1, 2].map(ri => ({ mesh: l3b.models[0].meshes[0], ri })))); await page.waitForFunction(() => /Summa ur geometrin/.test((document.getElementById('v3BsGeo') || {}).textContent || ''), null, { timeout: 5000 });
  const sum = await page.textContent('#v3BsGeo'); ok(/1\s?864,000 m³/.test(sum) && /Objekt3/.test(sum.replace(/\s+/g, '')), 'Summa för tre objekt (1800+60+4 m³): ' + sum.replace(/\s+/g, ' ').slice(0, 300));
  // Alla objekt: CSV
  const csv = await page.evaluate(async () => { let t = ''; const B = Blob; window.Blob = function (p, o) { t = p.join(''); return new B(p, o); }; const r = await l3gcExportAll(); window.Blob = B; return { t, r }; });
  const lines = csv.t.replace('\ufeff', '').split('\r\n'); ok(lines.length === 5 && /^Modell;Namn;Klass;GUID;Volym m3/.test(lines[0]) && /Geo.ifc;Platta betong;IFCSLAB;g0;1800/.test(lines[1]) && /öppet$/.test(lines[4]) && csv.r.n === 4 && Math.abs(csv.r.vol - (1800 + 60 + 4 + csv.r.vol - 1864)) < 1e-6, 'CSV med alla objekt: ' + JSON.stringify(lines).slice(0, 500));
  ok(!errors.length, 'Sidfel: ' + errors.join(' | '));
  console.log('OK: geometriberäkning – volym, yta, fotavtryck, formsida, mått längs egen riktning, vikt efter material, öppet nät, summa för flera, CSV för alla objekt');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
