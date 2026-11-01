const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9090;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
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
  const R = await page.evaluate(async () => {
    const o = {}, O = l3.O, wait = ms => new Promise(r => setTimeout(r, ms)); o.menuBtn = !!document.getElementById('v3RebarBtn');
    // IFC-liknande markering: platta 10 x 4 x 0,25 m, vriden 30°, som en bit med ett objektsintervall
    const a = 30 * Math.PI / 180, pos = [], P = [[0, 0], [10, 0], [10, 4], [0, 4]]; [0, 0.25].forEach(z => P.forEach(([x, y]) => pos.push(10 + (x - 5) * Math.cos(a) - (y - 2) * Math.sin(a), 10 + (x - 5) * Math.sin(a) + (y - 2) * Math.cos(a), z + 1)));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); mesh.userData.l3b = { ranges: [{ start: 0, count: 8, name: 'Bjälklag 1', cls: 'IFCSLAB', guid: 'g1' }] }; l3.scene.add(mesh);
    l3bs.sel = [{ mesh, ri: 0, key: 'k' }];
    l3rbToggle(true); await wait(100); o.panel = !!document.getElementById('v3Rb'); const txt = document.getElementById('v3Rb').textContent; o.badge = /EXPERIMENTELL/.test(txt) && /inte dimensionerad/.test(txt);
    o.sel = l3rb.sel.length; const ob = l3rbObb(l3rb.sel[0].pts); o.obb = [ob.L, ob.B, ob.H, Math.round(ob.yaw * 180 / Math.PI)]; o.guess = l3rbGuess('IFCSLAB', ob);
    document.querySelector('#v3Rb [data-rb="gen"]').click(); o.sets = l3rb.sets.length; const s = l3rb.sets[0]; o.type = s.type; const sm = l3rbSummary(l3rbSetBars(s)); o.bars = sm.n; o.kgm3 = Math.round(sm.kg / l3rbVolume(s.obb)); o.group = l3rb.group.children.length;
    // alla stavar ligger inom elementets låda (±1 cm)
    const W = l3rbSetWorld(s); let out = 0; W.forEach(b => b.w.forEach(p => { const dx = p[0] - s.obb.cx, dy = p[1] - s.obb.cy, c = Math.cos(-s.obb.yaw), sn = Math.sin(-s.obb.yaw), u = dx * c - dy * sn, v = dx * sn + dy * c; if (Math.abs(u) > s.obb.L / 2 + 0.01 || Math.abs(v) > s.obb.B / 2 + 0.01 || p[2] < s.obb.z0 - 0.01 || p[2] > s.obb.z0 + s.obb.H + 0.01) out++; })); o.outside = out;
    o.cmp = /mot schablon/.test(document.getElementById('v3Rb').textContent);
    document.getElementById('rb_act').value = '1100'; document.querySelector('#v3Rb [data-rb="exp"]').click(); o.exp = (l3Prefs().rbExp || []).length; o.schSrc = l3rbSchablon('platta').src; l3SetPref('rbExp', []);
    // lista och export
    const csv = l3rbCsvText([s]); o.csv = /Armeringsförslag/.test(csv) && /TOTALT/.test(csv) && csv.split('\r\n').length > 6; const dxf = l3rbDxfText([s]); o.dxf = dxf.startsWith('0\nSECTION') && dxf.trim().endsWith('EOF') && (dxf.match(/POLYLINE/g) || []).length >= sm.n;
    // manuellt: frys, rita stav, serie, bygel
    document.querySelector('#v3Rb [data-rb="freeze"]').click(); o.kind = s.kind; const n0 = s.bars.length;
    l3rbDrawStart(); l3rb.draw.pts.push([s.obb.cx, s.obb.cy, s.obb.z0 + 0.05], [s.obb.cx + 2, s.obb.cy, s.obb.z0 + 0.05]); l3rbDrawStop(false); o.drawn = s.bars.length - n0;
    const n1 = s.bars.length; l3rbSeries(s, 5, 150, false); o.series = s.bars.length - n1; const n2 = s.bars.length; l3rbStirrupsAround(s, 10, 300, 35); o.stirr = s.bars.length - n2;
    // misslyckas: för litet element → "Fortsätt manuellt"
    l3rb.sets = []; l3rb.active = null; l3rbRender(); const tiny = [[0, 0, 0], [0.04, 0, 0], [0.04, 0.04, 0], [0, 0.04, 0.03]].map(p => [p[0] + 100, p[1] + 200, p[2]]); const r = l3rbFromSelection({ name: 'Liten', cls: 'IFCSLAB', pts: tiny }); o.fail = !!r.err; l3rb.fail = { sel: { name: 'Liten', cls: 'IFCSLAB', pts: tiny }, r }; l3rbRender();
    document.querySelector('#v3Rb [data-rb="manual-from-fail"]').click(); o.manualFromFail = l3rb.sets.length === 1 && l3rb.sets[0].kind === 'manual';
    // spara/läsa
    let saved = null; window.ghWriteJSON = async (t, p, fn) => { saved = fn([]); }; window.ghReadJSON = async () => JSON.parse(JSON.stringify(saved)); window.dataPath = f => 'p/' + f; if (typeof token === 'undefined') window.token = 't';
    l3rb.sets = [s]; delete s._bars; l3rbSave(); await wait(1100); o.saved = !!saved && saved.length === 1 && !JSON.stringify(saved).includes('_bars'); l3rb.sets = []; l3rb.loaded = false; await l3rbLoad(); o.loaded = l3rb.sets.length === 1 && l3rb.sets[0].bars.length === s.bars.length;
    return o;
  });
  if (!R.menuBtn || !R.panel || !R.badge) fail('Panelen/varning: ' + JSON.stringify(R));
  if (R.sel !== 1 || R.obb[0] !== 10 || R.obb[1] !== 4 || Math.abs(R.obb[3] - 30) > 1 || R.guess !== 'platta') fail('Elementets låda: ' + JSON.stringify(R));
  if (R.sets !== 1 || R.type !== 'platta' || R.bars < 100 || R.kgm3 < 50 || R.kgm3 > 160 || !R.group || R.outside) fail('Autoarmering: ' + JSON.stringify(R));
  if (!R.cmp || R.exp !== 1 || !/medel av 1/.test(R.schSrc)) fail('Schablon/erfarenhet: ' + JSON.stringify(R));
  if (!R.csv || !R.dxf) fail('Export: ' + JSON.stringify(R));
  if (R.kind !== 'manual' || R.drawn !== 1 || R.series !== 5 || R.stirr < 10) fail('Manuell: ' + JSON.stringify(R));
  if (!R.fail || !R.manualFromFail) fail('Misslyckad autoarmering → manuell: ' + JSON.stringify(R));
  if (!R.saved || !R.loaded) fail('Spara/läsa: ' + JSON.stringify(R));
  console.log('OK: armering (experimentell) – OBB, autoarmering, schablon, export, manuell, reservväg, spara/läsa', JSON.stringify(R));
  if (process.env.SHOT) { await page.evaluate(async () => { const o = l3rb.sets[0]; l3rb.sets = []; const a = 30 * Math.PI / 180; const sel = l3rb.sel[0]; l3rbGenerateAll(); l3rb.active = l3rb.sets[0] && l3rb.sets[0].id; l3rbRender(); const O = l3.O, c = l3rb.sets[0].obb; l3.orbit.target.set(c.cx - O[0], c.cy - O[1], c.z0 - O[2]); l3.camera.position.set(c.cx - O[0] + 6, c.cy - O[1] - 12, c.z0 - O[2] + 9); l3.camera.lookAt(l3.orbit.target); l3.orbit.update(); l3Render(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
