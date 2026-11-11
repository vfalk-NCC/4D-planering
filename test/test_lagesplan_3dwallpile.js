const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9072;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const V = (x, y, z) => new THREE.Vector3(x, y, z), out = {};
    const run = (kind, patch = {}) => { l3SetPref('measure', 'wall'); l3t.mp = [V(5, 5, 10), V(15, 5, 10), V(15, 11, 10)]; l3swStart(); const s = l3sw.cur.spec; s.kind = kind; l3swpInit(s, true); Object.assign(s, patch); l3swPanel(); l3swDraw(); const res = l3sw.cur.res; const o = { n: res.parts.length, vol: res.parts.reduce((a, p) => a + p.vol, 0), names: res.parts.map(p => p.name), mass: res.parts.reduce((a, p) => a + (p.mass || 0), 0), panel: !!document.querySelector('[data-wpkind]'), ifc: res.parts.map(p => p.ifc), err: res.err || null }; l3swClose(); return o; };
    out.berlin = run('berlin'); out.sheetAZ = run('sheet'); out.sheetPU = run('sheet', { sel: 'PU 22', p_t: 'U', p_b: 0.6, p_h: 0.45, p_tf: 0.0121, p_tw: 0.0095, p_kgm2: 143.6 }); out.bored = run('bored'); out.tangent = run('bored', { sel: 'Tangentpåle Ø 620', p_D: 0.62, p_cc: 0.62 }); out.tube = run('tube'); out.conc = run('conc'); out.timber = run('timber'); out.slits = run('slits');
    // sheet: välj PU i katalogen via panelen
    l3SetPref('measure', 'wall'); l3t.mp = [V(5, 5, 10), V(15, 5, 10)]; l3swStart(); l3sw.cur.spec.kind = 'sheet'; l3swpInit(l3sw.cur.spec, true); l3swPanel(); const sel = document.querySelector('[data-wpstd]'); sel.value = 'PU 28'; sel.dispatchEvent(new Event('change')); out.afterSel = l3sw.cur.spec.sel; out.pw = l3sw.cur.spec.p_b;
    // skapa och kolla IFC
    l3sw.cur.spec.kind = 'berlin'; l3swpInit(l3sw.cur.spec, true); l3swPanel(); l3swDraw(); const nb = placements.length; l3swMake(); const made = placements.slice(nb); out.made = made.map(p => ({ n: p.name, ifc: p.m.ifc, closed: p.m.closed, faces: p.m.faces.length }));
    const ids = new Set(made.map(p => p.id)); const ifc = buildPlacementsIfc('T', ids); out.ifcCols = ifc ? (ifc.text.match(/IFCCOLUMN\(/g) || []).length : 0; out.ifcPlate = ifc ? (ifc.text.match(/IFCPLATE\(/g) || []).length : 0;
    return out;
  });
  await page.evaluate(() => { const V = (x, y, z) => new THREE.Vector3(x, y, z); l3SetPref('measure', 'wall'); l3t.mp = [V(5, 5, 10), V(15, 5, 10), V(15, 11, 10)]; l3swStart(); l3sw.cur.spec.kind = 'berlin'; l3swpInit(l3sw.cur.spec, true); l3swPanel(); l3swDraw(); l3FlyTo(V(10, 7, 8), 22, V(-0.5, -1, 0.8), 0); });
  await page.waitForTimeout(900); await page.screenshot({ path: '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/pile1.png' });
  await page.evaluate(() => { const s = l3sw.cur.spec; s.kind = 'sheet'; l3swpInit(s, true); s.sel = 'AZ 18-700'; l3swPanel(); l3swDraw(); }); await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/pile2.png' });
  await page.evaluate(() => l3swClose());
  console.log(JSON.stringify(r).slice(0, 1800));
  const e = (k, c, m) => { if (!c) fail(`${k}: ${m} ${JSON.stringify(r[k])}`); };
  e('berlin', r.berlin.n === 2 && r.berlin.vol > 0.1 && r.berlin.panel && r.berlin.ifc[0] === 'IFCCOLUMN' && r.berlin.ifc[1] === 'IFCPLATE', 'pelare + utfackning');
  e('sheetAZ', r.sheetAZ.n === 1 && r.sheetAZ.vol > 0.1 && r.sheetAZ.mass > 500 && r.sheetAZ.ifc[0] === 'IFCWALL', 'AZ spont');
  e('sheetPU', r.sheetPU.n === 1 && r.sheetPU.vol > 0.1, 'PU spont');
  e('bored', r.bored.n === 2 && r.bored.vol > 1, 'sekantpålar primär/sekundär');
  e('tangent', r.tangent.n === 1 && r.tangent.vol > 1, 'tangentpålar');
  e('tube', r.tube.n === 1 && r.tube.vol > 0.01 && r.tube.mass > 100, 'stålrör');
  e('conc', r.conc.n === 1 && r.conc.vol > 0.5, 'betongpålar');
  e('timber', r.timber.n === 1 && r.timber.vol > 0.1, 'träpålar');
  e('slits', r.slits.n === 1 && r.slits.vol > 5 && r.slits.ifc[0] === 'IFCWALL', 'slitsmur');
  if (r.afterSel !== 'PU 28' || r.pw !== 0.6) fail('katalogval: ' + JSON.stringify([r.afterSel, r.pw]));
  if (r.made.length !== 2 || !r.made.every(m => m.closed && m.faces > 10) || r.ifcCols < 1 || r.ifcPlate < 1) fail('skapa + IFC: ' + JSON.stringify([r.made, r.ifcCols, r.ifcPlate]));
  console.log('OK: spont och pålning – Berlinerspont, Larssen AZ/PU, sekant/tangent, stålrör, betong, trä, slitsmur; IFC-klasser och massa');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
