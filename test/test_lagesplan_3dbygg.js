const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9099;
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
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1000);
    const okm = r => r.parts.length && r.parts.every(p => p.vol > 0 && p.mesh.faces.length && p.mesh.faces.every(f => f.every(i => i >= 1 && i <= p.mesh.pts.length)));
    const mk = (kind, extra, pts) => { const sp = { ...L3SW_DEF, kind, ...(extra || {}) }; return { sp, r: l3swBuild(pts || [[0, 0, 100], [6, 0, 100]], sp) }; };
    const has = (x, re) => x.r.parts.some(p => re.test(p.name) && p.vol > 0);
    const errs = [];
    const T = (k, f) => { try { out[k] = !!f(); } catch (e) { out[k] = false; errs.push(k + ': ' + e.message); } };
    T('stud', () => { const x = mk('stud', { open: '1,5 0,9 2,1 0\n4 1,2 1,2 0,9', fa: 'gips13', fb: 'vind9', ins: true }); return okm(x.r) && has(x, /Reglar/) && has(x, /Syll/) && has(x, /Överstycken/) && has(x, /Gips/) && has(x, /Vindskydd/) && has(x, /Isolering/) && x.r.list.length > 3; });
    T('studPlain', () => { const a = mk('stud', { open: '' }), b = mk('stud', { open: '2 1 2 0' }); const n = x => +x.r.parts[0].name.match(/(\d+) st/)[1]; return okm(a.r) && n(a) >= 10 && has(b, /Överstycken/); });
    T('joist', () => { const x = mk('joist', { B: 4 }); return okm(x.r) && has(x, /Bjälkar/) && has(x, /Randbalkar/) && has(x, /Kortlingar/) && has(x, /golvskiva/) && Math.abs(x.r.area - 24) < 1e-6; });
    T('truss', () => { const a = mk('truss', { span: 8, form: 'sadel' }, [[0, 0, 100], [6, 0, 100]]), b = mk('truss', { span: 6, form: 'pult' }); return okm(a.r) && has(a, /Takstolar sadel/) && has(a, /Åsar/) && okm(b.r) && has(b, /pulpet/); });
    T('sheets', () => { const x = mk('sheets', { H: 2.5, mat: 'gips13', fmt: '1200x2400', ori: 'stand' }), y = mk('sheets', { H: 2.5, ori: 'lag', fmt: '1200x2400', tilt: 90 }); return okm(x.r) && /skivor \((\d+) hela/.test(x.r.parts[0].name) && okm(y.r) && x.r.area > 14 && x.r.area < 15.1; });
    T('facade', () => ['lock', 'lagg', 'plat', 'puts'].every(t => { const x = mk('facade', { typ: t, H: 3 }); return okm(x.r) && Math.abs(x.r.area - 18) < 1e-6; }));
    T('roof', () => ['pann', 'plat', 'papp'].every(t => { const x = mk('roofcover', { typ: t, len: 5, ang: 27 }); return okm(x.r) && x.r.area === 30; }));
    T('layers', () => { const x = mk('layers', { layers: 'Gips 13:13:#e5e7eb;Isolering:145:#fde047', ori: 'wall' }), y = mk('layers', { layers: 'Betong:100;Parkett:14', ori: 'floor', H: 4 }); return okm(x.r) && x.r.parts.length === 2 && okm(y.r) && y.r.area === 24; });
    T('ceiling', () => { const x = mk('ceiling', { B: 4 }); return okm(x.r) && has(x, /Skenor/) && has(x, /Hängare/) && has(x, /Gips/) && x.r.area === 24; });
    T('room', () => { const x = mk('room', { name: 'Rum 7', H: 2.5 }, [[0, 0, 100], [5, 0, 100], [5, 4, 100], [0, 4, 100]]); return okm(x.r) && /20 m²/.test(x.r.parts[0].name) && /50 m³/.test(x.r.parts[0].name); });
    T('service', () => ['kanal', 'stege', 'rund', 'rorp', 'rorv'].every(t => { const x = mk('service', { typ: t, hang: true }); return okm(x.r); }));
    // panel + skapa + redigera igen
    l3SetPref('measure', 'wall'); l3SetTool('measure'); await w(200);
    const sp = { ...L3SW_DEF, kind: 'stud' }; l3swOpen({ pts: [[6512330, 150130, 100], [6512336, 150130, 100]], spec: sp }); await w(400);
    const pn = document.getElementById('v3WallPanel'); out.panel = !!pn.querySelector('[data-bkind]') && !!pn.querySelector('[data-bk="dim"]') && !!pn.querySelector('[data-bklist]');
    const ks = pn.querySelector('[data-bkind]'); ks.value = 'sheets'; ks.dispatchEvent(new Event('change')); await w(300); out.switch = l3sw.cur.spec.kind === 'sheets' && l3sw.cur.res.parts.length === 1 && !!document.querySelector('#v3WallPanel [data-bk="fmt"]');
    document.querySelector('#v3WallPanel [data-bklist]').click(); await w(200); out.list = !!document.querySelector('#v3SwbList tbody tr'); l3DlgClose('v3SwbList');
    ks.value = 'stud'; l3sw.cur.spec.kind = 'stud'; l3sw.cur.spec._bk = null; l3swPanel(); l3swDraw(); await w(200);
    const n0 = placements.length; l3swMake(); await w(300); const made = placements.filter(q => q.wsrc && q.wsrc.spec.kind === 'stud'); out.made = made.length >= 3 && placements.length === n0 + made.length;
    l3SelectIds([made[0].id]); await w(300); const eb = document.querySelector('#v3Side [data-swedit]'); out.eBtn = !!eb; eb.click(); await w(400); out.eOpen = !!l3sw.cur && l3sw.cur.spec.kind === 'stud' && !!document.querySelector('#v3WallPanel [data-bk="dim"]'); l3swClose();
    // förhandsvisningen går att fästa mot och vrida runt: strålen träffar den (stödmur/byggdel och 3D-text)
    { l3SetPref('measure', 'wall'); l3SetTool('measure'); await w(100); const sp2 = { ...L3SW_DEF, kind: 'stud' }; l3swOpen({ pts: [[6512330, 150130, 100], [6512336, 150130, 100]], spec: sp2 }); await w(300);
      const O = l3.O; l3.camera.position.set(6512333 - O[0] + 0.5, 150130 - O[1] - 6, 101.3 - O[2]); l3.orbit.target.set(6512333 - O[0], 150130 - O[1], 101.2 - O[2]); l3.orbit.update(); l3.camera.updateMatrixWorld(); l3Render();
      const R = l3.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(6512333 - O[0], 150130 - O[1], 101.2 - O[2]).project(l3.camera), e = { clientX: R.left + (v.x + 1) / 2 * R.width, clientY: R.top + (1 - v.y) / 2 * R.height };
      const hit = l3Ray(e, l3Surfaces())[0]; out.hitPreview = !!hit && l3.groups.wall.children.some(c => { let o = hit.object; while (o) { if (o === c) return true; o = o.parent; } return false; }); const pp = l3PivotPoint(e); out.pivot = Math.abs(pp.y - (150130 - O[1])) < 0.5; l3swClose(); }
    // biblioteket
    out.errs = errs.join(' | ') || true; l3RenderLib(); await w(100); const dbgLib = [!!document.getElementById('v3Lib'), document.getElementById('v3Lib') && document.getElementById('v3Lib').innerHTML.length, !!document.getElementById('v3Bygg'), typeof l3RenderLib, String(l3RenderLib).slice(0,60)]; out.lib = !!document.querySelector('#v3Bygg [data-bygg="truss"]'); if (!out.lib) return out; document.querySelector('#v3Bygg [data-bygg="truss"]').click(); await w(100); out.card = l3.tool === 'measure' && l3sw.last.kind === 'truss';
    out.errs = errs.join(' | ') || true; return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 600)); process.exit(1); }
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(x => x[0]); if (bad.length) { console.error('FAIL byggdelar: ' + bad.join(',')); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: byggdelar – regelvägg, bjälklag, takstolar, skivor, fasad, tak, skikt, undertak, rum, installationer');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
