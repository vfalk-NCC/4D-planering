const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9886;
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
  const R = await page.evaluate(async () => {
    const out = {}; const O = l3.O;
    // sluttande berg: z = 0,4 · x (lokalt), punktmoln 20 x 20 m
    const P = []; for (let y = -10; y < 10; y += 0.25) for (let x = -10; x < 10; x += 0.25) P.push(x, y, 0.4 * x);
    const info = { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 1], format: 'test', n: P.length / 3, total: P.length / 3 };
    l3pcBuild({ id: 'pcSlope', name: 'Slänt' }, { info, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] });
    await new Promise(r => setTimeout(r, 600));
    out.lib = typeof SM !== 'undefined' && !!SM.stallningfri && !SM.stallningfri.hidden;
    const A = [O[0] - 8, O[1], O[2] - 3.2], Bp = [O[0] + 8, O[1], O[2] + 3.2];
    const p = placeNew('sm:stallningfri', A); p.pts = [A.slice(), Bp.slice()]; placements.push(p); placeTouch(p); l3AddPlacementMesh(p);
    out.n = stallningFriFollow(p, (x, y) => l3slZ(x, y, 0.8));
    out.z = p.pts.map(q => Math.round(q[2] * 10) / 10);
    out.zo = p.pts.map(q => q[3] == null ? null : Math.round(q[3] * 10) / 10);
    l3RebuildOne(p); await new Promise(r => setTimeout(r, 300));
    const g = l3.placeMeshes.get(p.id); let tris = 0, meshes = 0; g.traverse(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    const bb = new THREE.Box3().setFromObject(g); out.meshes = meshes; out.tris = Math.round(tris); out.h = Math.round((bb.max.z - bb.min.z) * 10) / 10; out.len = Math.round((bb.max.x - bb.min.x) * 10) / 10;
    // spegelvänd: knappen i objektpanelen flyttar ställningen till andra sidan
    const side0 = smF(p, 'sida'); const box0 = new THREE.Box3().setFromObject(l3.placeMeshes.get(p.id)); l3SelectIds([p.id]); await new Promise(r => setTimeout(r, 400));
    const btn = document.querySelector('[data-smact="spegla"]'); out.btn = !!btn; if (btn) btn.click(); await new Promise(r => setTimeout(r, 500));
    const box1 = new THREE.Box3().setFromObject(l3.placeMeshes.get(p.id)); out.mirror = { before: side0, after: smF(p, 'sida'), dy: Math.round((box1.getCenter(new THREE.Vector3()).y - box0.getCenter(new THREE.Vector3()).y) * 10) / 10 };
    out.parts = []; g.traverse(o => { if (o.isMesh) out.parts.push([(o.material && o.material.color ? '#' + o.material.color.getHexString() : '?'), Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3)]); });
    out.calc = stallningFriCalc(p).slice(0, 4).map(r => r.join('=')).join(' | ');
    out.fields = SM.stallningfri.fields.map(f => f[0]).join(',');
    return out;
  });
  if (process.env.SHOT) { await page.evaluate(async () => { const p = placements[placements.length - 1]; l3SelectIds([]); const t = l3.orbit.target; t.set(0, 0, 4); l3.camera.position.set(-6, -26, 14); l3.camera.up.set(0, 0, 1); l3.camera.lookAt(t); l3.orbit.update(); l3Render(); await new Promise(r => setTimeout(r, 800)); }); await page.screenshot({ path: process.env.SHOT }); }
  console.log(JSON.stringify(R));
  const ok = (c, m) => { if (!c) fail(m + ' ' + JSON.stringify(R)); };
  ok(R.lib, 'Ställningen ska finnas i biblioteket');
  ok(R.n >= 6, 'Markhöjd i varje fack'); ok(R.z[0] < -2 && R.z[R.z.length - 1] > 2 && R.z.every((v, i) => i === 0 || v >= R.z[i - 1] - 0.05), 'Höjderna ska följa slänten');
  ok(R.meshes >= 1 && R.tris > 500, 'Ställningen ska ritas'); ok(R.h > 12 && R.h < 20, 'Höjden = markens höjdskillnad + höjd över högsta punkten'); ok(R.len >= 15, 'Längd');
  ok(/Längd=1[5-7]/.test(R.calc), 'Beräknat');
  ok(R.btn && R.mirror.before === 'Vänster' && R.mirror.after === 'Höger' && R.mirror.dy < -0.2, 'Spegelvänd: ' + JSON.stringify(R.mirror));
  if (errors.length) fail('Fel: ' + errors.join('|'));
  console.log('OK: ställning som följer berget – markhöjd ur punktmolnet i varje fack, plattformar i jämna nivåer');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
