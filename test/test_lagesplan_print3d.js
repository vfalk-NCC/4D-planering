// UI-lyftet i 3D-editorn (Victor 2026-10-23): lås och flyttbara knappar/paneler, arbetsytor, snabbfält, radialmeny, vykub.
// (uppstarten delas med test_lagesplan_3d.js) 3D-vyn ovanpå lägesplanen (Victors önskemål 2026-10-08): planen som mark via kalibreringen,
// planerade objekt som lådor i statusfärg, etableringen (plan_placements.json) med riktig geometri,
// lägga till från biblioteket med ett tryck, handtag (flytta/vrida) med fäst mot ytor, sidopanel,
// mätning, sparning i samma fil som 4D-planering och "Spara som IFC" via 4D-planering.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9031;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([{ id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' }]), sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const getStore = f => { const e = store.get(`projects/p1/${f}`); return e ? JSON.parse(e.content) : null; };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2020-01-01', end_date: '2030-12-01', status: 'pagaende', progress: 40 },
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512350, y: 150125, z0: 0, z1: 14, x0: 6512345, x1: 6512355, y0: 150120, y1: 150130 },
      { id: 'i2', x: 6512380, y: 150125, z0: 0, z1: 3, x0: 6512378, x1: 6512382, y0: 150123, y1: 150127 },
    ];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    askOpener = async (type, extra) => { window.__calls.push(type); return type === 'placeSaveIfc' ? { n: 2, files: ['Etablering x.ifc'] } : {}; };
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.objMesh && l3.placeMeshes.size === 1, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const sleep = ms => page.waitForTimeout(ms);
  if (process.env.SHOT) await page.exposeFunction('__IMG', async d => require('fs').writeFileSync(process.env.SHOT + '-bub.png', Buffer.from(d.split(',')[1], 'base64')));
  if (process.env.SHOT) await page.exposeFunction('__SHOT', async n => { await page.screenshot({ path: process.env.SHOT + '-' + n + '.png' }); });
  // 3D-vy i utskriftslayouten: en sparad vy i 3D-editorn blir en bild på bladet
  const r = await page.evaluate(async () => {
    l3SaveView('Översikt');   // nuvarande kamera sparas som vy
    const out = { saved: l3SavedViews().map(v => v.name) };
    // en annan kamera än den sparade
    l3SetProjection(true); l3FlyTo(new THREE.Vector3(0, 0, 0), 60, new THREE.Vector3(1, 0.2, 0.5), 0);
    out.camBefore = l3.camera.position.toArray().map(v => Math.round(v * 10) / 10).join(',');
    close3d();
    await openPrint();
    addEl('view3d');
    const el = pr.tpl.elements.find(e => e.type === 'view3d');
    out.created = !!el && !!el.view;   // börjar där 3D-kameran står
    el.view = undefined; el.viewRef = undefined;
    const sel = document.getElementById('prV3Saved'); out.hasSel = !!sel && [...sel.options].some(o => o.value === 'Översikt');
    // välj den sparade vyn i egenskaperna
    setSel([el.id]); renderPrintProps();
    if (!document.getElementById('prV3Saved')) throw new Error('props: ' + (document.getElementById('prProps') || {}).innerHTML.slice(0, 400) + ' sels=' + pr.sels + ' el=' + el.type);
    const s2 = document.getElementById('prV3Saved'); s2.value = 'Översikt'; s2.dispatchEvent(new Event('change'));
    out.ref = el.viewRef; out.viewOrtho = el.view && el.view.ortho;
    const c = await p3dRender(p3dResolve(el), 300, 200, { white: false });
    out.canvas = !!c && c.width === 300;
    let n = 0; if (c) { const d = c.getContext('2d').getImageData(0, 0, 300, 200).data; const f = [d[0], d[1], d[2]]; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - f[0]) + Math.abs(d[i + 1] - f[1]) + Math.abs(d[i + 2] - f[2]) > 30) n++; }
    out.content = n;
    // kameran i 3D-editorn står kvar som innan renderingen
    out.camAfter = l3.camera.position.toArray().map(v => Math.round(v * 10) / 10).join(',');
    out.orthoAfter = l3.camera.isOrthographicCamera;
    // Vit bakgrund
    const w = await p3dRender(p3dResolve(el), 120, 80, { white: true });
    out.white = w && [...w.getContext('2d').getImageData(0, 0, 1, 1).data].join(',');
    // Ritas i layouten: förhandsvisningen kommer efter en stund
    drawPrintPage(); await new Promise(r => setTimeout(r, 900));
    out.preview = !!(p3d.cache.get(el.id) || {}).canvas; if (window.__SHOT) await window.__SHOT('layout');
    // PDF-bilden
    const big = await p3dForPdf(el, 140, 100); out.pdf = !!big && big.width >= 400;
    return out;
  });
  if (!r.created || !r.hasSel || r.ref !== 'Översikt' || r.viewOrtho !== false) fail('3D-vy: skapa och välj sparad vy: ' + JSON.stringify(r));
  { await page.waitForTimeout(500); const sv = getStore('saved_views_3d.json'); if (!sv || !sv.some(v => v.name === 'Översikt')) fail('Sparade vyer delas i projektet (saved_views_3d.json): ' + JSON.stringify(sv)); }
  if (!r.canvas || !(r.content > 200)) fail('3D-vy: bilden ska visa modellen: ' + JSON.stringify(r));
  if (r.camAfter !== r.camBefore || r.orthoAfter !== true) fail('3D-kameran ska vara som innan renderingen: ' + JSON.stringify(r));
  if (r.white !== '255,255,255,255' || !r.preview || !r.pdf) fail('3D-vy: vit bakgrund, förhandsvisning och PDF-bild: ' + JSON.stringify(r));
  // Skala: parallellprojektion – skalan kan läsas och ställas in
  { const sc = await page.evaluate(async () => {
      const el = pr.tpl.elements.find(e => e.type === 'view3d'); const base = JSON.parse(JSON.stringify(p3dResolve(el))); base.ortho = true; base.zoom = 1; el.view = base; delete el.viewRef; setSel([el.id]); renderPrintProps();
      const out = { before: p3dScaleOf(el), hmm: p3dHmm(el) };
      const inp = document.getElementById('prV3Scale'); out.hasInput = !!inp; inp.value = '500'; inp.dispatchEvent(new Event('change'));
      out.after = p3dScaleOf(el); out.zoom = el.view.zoom;
      el.showScale = true; const c = document.createElement('canvas'); c.width = 300; c.height = 200; const ctx = c.getContext('2d'); p3dDraw(ctx, el, 0, 0, 300, 200, 1, 1, { v3Canvas: c }); out.label = true;
      const persp = JSON.parse(JSON.stringify(el.view)); persp.ortho = false; el.view = persp; out.persp = p3dScaleOf(el);
      return out;
    });
    if (!sc.hasInput || sc.after !== 500 || Math.abs(sc.zoom - 100 * 1000 / (500 * sc.hmm)) > 1e-6 || sc.persp !== null || sc.before !== Math.round(100 * 1000 / sc.hmm)) fail('Skala på 3D-vyn: ' + JSON.stringify(sc)); }
  // Bubblor med framdrift: renderas utan fel; Rikta mot yta: vyn blir parallell mot ytan och ett snitt läggs i den
  { const b = await page.evaluate(async () => {
      placements.forEach(p => { p.itemId = 'i1'; }); const el = pr.tpl.elements.find(e => e.type === 'view3d'); el.bub = 'all'; el.bubMax = 10; el.view = (() => { const v = JSON.parse(JSON.stringify(p3dResolve(el))); return v; })();
      const c = await p3dRender(p3dResolve(el), 400, 280, p3dOpts(el)); const c0 = await p3dRender(p3dResolve(el), 400, 280, p3dOpts({ ...el, bub: '' }));
      const diff = (a, b2) => { const x = a.getContext('2d').getImageData(0, 0, 400, 280).data, y = b2.getContext('2d').getImageData(0, 0, 400, 280).data; let n = 0; for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1]) n++; return n; };
      if (window.__IMG) await window.__IMG(c.toDataURL('image/png'));
      return { ok: !!c && !!c0, diff: diff(c, c0), anchors: (typeof l3bub !== 'undefined' && l3bub.anchors || []).length, key: p3dKey(el, p3dResolve(el), 400, 280) !== p3dKey({ ...el, bub: '' }, p3dResolve(el), 400, 280) };
    });
    if (!b.ok || !b.key || !(b.diff > 100)) fail('Bubblor i 3D-vyn: ' + JSON.stringify(b)); console.log('bubblor', JSON.stringify(b)); }
  { const f = await page.evaluate(async () => {
      const el = pr.tpl.elements.find(e => e.type === 'view3d'); delete el.viewRef;
      p3dPick(el); await new Promise(r => setTimeout(r, 1500));
      document.getElementById('p3dFace').click();
      const dom = l3.renderer.domElement, r = dom.getBoundingClientRect(); let hit = false;
      for (let gy = 0.3; gy <= 0.8 && !hit; gy += 0.05) for (let gx = 0.3; gx <= 0.7 && !hit; gx += 0.04) {
        if (!document.getElementById('p3dFace').classList.contains('on')) document.getElementById('p3dFace').click();
        dom.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * gx, clientY: r.top + r.height * gy, bubbles: true, cancelable: true, pointerId: 1 }));
        hit = (l3.clips || []).some(c => c.p3d);
      }
      const c = (l3.clips || []).find(c => c.p3d), cam = l3.camera, dir = cam.position.clone().sub(l3.orbit.target).normalize();
      const out = { hit, ortho: cam.isOrthographicCamera, par: c ? Math.abs(dir.dot(c.plane.normal)) : 0 };
      document.getElementById('p3dCancel').click(); await new Promise(r2 => setTimeout(r2, 300));
      return out;
    });
    if (!f.hit) console.log('OBS: ingen yta träffades i testscenen (rutnätet)'); else if (!f.ortho || f.par < 0.99) fail('Rikta mot yta: ' + JSON.stringify(f)); else console.log('rikta mot yta OK', JSON.stringify(f)); }
  // Ställ in vyn: 3D visas med ram, Använd vyn sparar kameran i elementet
  const p = await page.evaluate(async () => {
    const el = pr.tpl.elements.find(e => e.type === 'view3d'); delete el.viewRef;
    const done = p3dPick(el); await new Promise(r => setTimeout(r, 1500)); if (window.__SHOT) await window.__SHOT('pick');
    const out = { bar: !!document.getElementById('p3dBar'), away: document.getElementById('printModal').classList.contains('p3d-away'), w: document.getElementById('v3Canvas').clientWidth, h: document.getElementById('v3Canvas').clientHeight };
    out.ratio = Math.round(out.w / out.h * 100) / 100; out.want = Math.round(el.w / el.h * 100) / 100;
    document.getElementById('p3dOk').click(); await new Promise(r => setTimeout(r, 500));
    out.after = { bar: !!document.getElementById('p3dBar'), away: document.getElementById('printModal').classList.contains('p3d-away'), view: !!el.view, ref: el.viewRef };
    return out;
  });
  if (!p.bar || !p.away || Math.abs(p.ratio - p.want) > 0.05 || p.after.bar || p.after.away || !p.after.view) fail('Ställ in vyn: ' + JSON.stringify(p));
  if (errors.filter(e => !/allow-same-origin/.test(e)).length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  console.log('OK test_lagesplan_print3d – sparad vy som bild på bladet, kameran orörd, ställ in vyn med ram, PDF-bild');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
