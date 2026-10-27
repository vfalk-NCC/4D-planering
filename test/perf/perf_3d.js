const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', '..', 'docs');
const PORT = 9031;
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
  await require('../_dialogs').bridge(page);
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
  const N = Number(process.env.BOXES || 120000), MODELS = Number(process.env.MODELS || 3);
  const CELL = Number(process.env.CELL || 6000);
  await page.evaluate(({ N, MODELS, CELL }) => {
    // Syntetiska "tunga" IFC-modeller: många små objekt (lådor) per bit, flera bitar per modell.
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    l3b.models = [];
    for (let mi = 0; mi < MODELS; mi++) {
      const m = { id: 'syn' + mi, name: 'Syn ' + mi, visible: true, meshes: [], ranges: [], tris: 0, O: [0, 0, 0], src: { id: 'syn' + mi, version: 'v1' } };
      const per = CELL, parts = Math.ceil(N / per);
      for (let p = 0; p < parts; p++) {
        const n = Math.min(per, N - p * per), pos = new Float32Array(n * 24), col = new Uint8Array(n * 24), nrm = new Int8Array(n * 24), idx = new Uint32Array(n * 36), ranges = [];
        for (let b = 0; b < n; b++) {
          const x = rnd() * 400 - 200, y = rnd() * 300 - 150, z = rnd() * 60, sk = Math.pow(rnd(), 3), w = 0.05 + sk * 3, h = 0.05 + sk * 3 * rnd(), d = 0.05 + sk * 6 * rnd(), c = [Math.floor(120 + rnd() * 120), Math.floor(120 + rnd() * 120), Math.floor(120 + rnd() * 120)];
          for (let v = 0; v < 8; v++) { const o = (b * 8 + v) * 3; pos[o] = x + cube[v][0] * w; pos[o + 1] = y + cube[v][1] * h; pos[o + 2] = z + cube[v][2] * d; col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; nrm[o] = 0; nrm[o + 1] = 0; nrm[o + 2] = 127; }
          for (let t = 0; t < 36; t++) idx[b * 36 + t] = b * 8 + tri[t];
          ranges.push({ start: b * 8, count: 8, idxStart: b * 36, idxCount: 36, guid: 'g' + mi + '_' + p + '_' + b, name: 'Obj ' + b, cls: 'IFCBEAM', base: [c[0] / 255, c[1] / 255, c[2] / 255] });
        }
        const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null);
        m.meshes.push(mesh); m.ranges.push(...ranges); m.tris += n * 12;
      }
      m.meshes.forEach(x => l3.groups.bldg.add(x));
      l3b.models.push(m);
    }
    l3bPosition(); l3bRecolor(); l3Frame && l3Frame(true); l3Render();
  }, { N, MODELS, CELL });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({ tris: l3b.models.reduce((a, m) => a + m.tris, 0), meshes: l3b.models.reduce((a, m) => a + m.meshes.length, 0), calls: l3.renderer.info.render.calls, rtris: l3.renderer.info.render.triangles, pr: l3.renderer.getPixelRatio() }));
  console.log('scen', JSON.stringify(info));
  // Operationer på den tunga scenen (JS-tid, utan ritning)
  await page.evaluate(() => { window.__realRender = l3.renderer.render.bind(l3.renderer); l3.renderer.render = () => {}; });
  await page.waitForTimeout(2000);
  const ops = await page.evaluate(async () => {
    const T = {}; const time = (k, f) => { const a = performance.now(); const r = f(); T[k] = Math.round(performance.now() - a); return r; };
    const m0 = l3b.models[0], mesh = m0.meshes[0], u = mesh.userData.l3b;
    time('bvh klart?', () => 0); T.bvh = l3b.models.every(m => m.meshes.every(x => x.geometry.boundsTree)) ? 'ja' : 'nej';
    time('l3bRecolor', () => l3bRecolor());
    time('markera 1 objekt', () => l3bsSet([{ mesh, ri: 5 }]));
    time('markera 500 objekt', () => l3bsSet(Array.from({ length: 500 }, (_, i) => ({ mesh, ri: i }))));
    time('dölj markerade (500)', () => l3bsHide());
    time('visa alla', () => l3bShowAllRanges());
    time('isolera 500', () => { l3bsSet(Array.from({ length: 500 }, (_, i) => ({ mesh, ri: i }))); l3bsIsolate(); });
    time('visa alla igen', () => { l3.hidden.clear(); l3bShowAllRanges(); l3UpdateHidden && l3UpdateHidden(); });
    time('tint 2000 + alpha', () => { const sel = Array.from({ length: 2000 }, (_, i) => ({ mesh, ri: i })); l3bsSet(sel); l3tApply({ color: '#ef4444', alpha: 0.5 }, 'x'); });
    time('rensa tint', () => l3tApply({ color: null, alpha: 1 }, 'y'));
    time('modell av', () => l3bShow(l3b.models[1].id, false));
    time('modell på', () => l3bShow(l3b.models[1].id, true));
    time('l3Frame', () => l3Frame(true));
    time('l3bViewApply(force)', () => l3bViewApply(true));
    time('l3Surfaces', () => { for (let i = 0; i < 20; i++) l3Surfaces(); });
    { const t0 = performance.now(); while (!l3b.models.every(m => m.meshes.every(x => x.geometry.boundsTree)) && performance.now() - t0 < 60000) await new Promise(r => setTimeout(r, 200)); T['BVH-bygge efter ändringar (ms)'] = Math.round(performance.now() - t0); }
    time('20 raycast', () => { const el = l3.renderer.domElement, r = el.getBoundingClientRect(); for (let i = 0; i < 20; i++) l3Ray({ clientX: r.left + 300 + i * 20, clientY: r.top + 300 }, l3Surfaces()); });
    return T;
  });
  console.log('\nOPERATIONER (ms)', JSON.stringify(ops, null, 1));
  await page.evaluate(() => { l3.renderer.render = window.__realRender; });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  const run = async (label, fn, frames = 60) => {
    await cdp.send('Profiler.start');
    const r = await page.evaluate(async ({ fn, frames }) => {
      const f = eval(fn); const t0 = performance.now(), ts = [];
      for (let i = 0; i < frames; i++) { const a = performance.now(); await f(i); await new Promise(r => requestAnimationFrame(r)); ts.push(performance.now() - a); }
      ts.sort((a, b) => a - b); return { total: performance.now() - t0, med: ts[Math.floor(ts.length / 2)], p95: ts[Math.floor(ts.length * 0.95)] };
    }, { fn, frames });
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id), k = n.callFrame.functionName + ' ' + (n.callFrame.url.split('/').pop() || '') + ':' + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => (v / 1000).toFixed(0).padStart(6) + ' ms  ' + k);
    console.log(`\n== ${label}: median ${r.med.toFixed(1)} ms/bild, p95 ${r.p95.toFixed(1)} ms, totalt ${r.total.toFixed(0)} ms`); console.log(top.join('\n'));
    return r;
  };
  if (!process.env.SKIPFRAMES) {
    const orbit = `(i) => { const c = l3.camera, t = l3.orbit.target; const d = c.position.clone().sub(t); d.applyAxisAngle(new THREE.Vector3(0,0,1), 0.03); c.position.copy(t).add(d); c.lookAt(t); l3.orbit.update(); l3Render(); }`;
    await page.evaluate(() => { l3.renderer.render = window.__realRender; l3SetPref('lod', true); });
    await run('orbit, förenklad bild PÅ', orbit, 12);
    await page.evaluate(() => { l3SetPref('lod', false); l3lodApply(-1); });
    await run('orbit, förenklad bild AV', orbit, 12);
    await page.evaluate(() => { l3SetPref('lod', true); });
    await run('hover (musen rör sig)', `(i) => { const el = l3.renderer.domElement, r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 200 + i * 5, clientY: r.top + 300 + i * 2, bubbles: true, pointerId: 1 })); }`, 40);
  }
  console.log('\nframes', JSON.stringify(await page.evaluate(() => ({ calls: l3.renderer.info.render.calls, rtris: l3.renderer.info.render.triangles, geoms: l3.renderer.info.memory.geometries, pr: l3.renderer.getPixelRatio() }))));
  if (errors.length) console.log('FEL', errors.slice(0, 3));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
