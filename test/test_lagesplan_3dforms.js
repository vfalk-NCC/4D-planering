// Gjutform runt markerade fundament (Victor 2026-11-05): en fyrsidig gjutform (Gjutetapp) runt varje objekt, roterad efter objektets yta.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9036;
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
    const O = l3.O, ang = 30 * Math.PI / 180, mkBox = (cx, cy, z0, L, B, H, a, name) => { const pts = []; for (const [u, v] of [[-L / 2, -B / 2], [L / 2, -B / 2], [L / 2, B / 2], [-L / 2, B / 2]]) for (const z of [z0, z0 + H]) pts.push([cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a), z]); return { name, cls: 'IFCFOOTING', guid: 'g' + name, src: 'ifc', pts, tris: [] }; };
    const sel = [mkBox(O[0] + 5, O[1] + 3, 10, 3, 2, 1, ang, 'Fundament F1'), mkBox(O[0] + 12, O[1] + 3, 10, 2, 2, 0.5, 0, 'Fundament F2')];
    const n0 = placements.length, made = l3formCreate(sel, 0.1); await new Promise(r => setTimeout(r, 400));
    const out = made.map(p => { const g = l3.placeMeshes.get(p.id); let meshes = 0; if (g) g.traverse(o => { if (o.isMesh) meshes++; }); return { type: p.type, L: p.L, B: p.B, H: p.H, rot: p.rot, x: Math.round((p.x - O[0]) * 100) / 100, y: Math.round((p.y - O[1]) * 100) / 100, z: p.z, name: p.name, arm: p.f && p.f.arm, meshes, dirty: placeDirty.has(p.id) }; });
    return { n: placements.length - n0, out, btn: typeof l3bsMakeForms === 'function' };
  });
  console.log(JSON.stringify(R));
  const [a, b] = R.out; const ok = (c, m) => { if (!c) fail(m + ' ' + JSON.stringify(R)); };
  ok(R.n === 2 && R.btn, 'Två gjutformar ska skapas');
  ok(a.type === 'sm:gjutetapp' && Math.abs(a.L - 3.2) < 0.05 && Math.abs(a.B - 2.2) < 0.05 && Math.abs(a.rot - 30) < 0.5 && a.H === 1 && Math.abs(a.x - 5) < 0.05 && Math.abs(a.y - 3) < 0.05 && a.z === 10, 'Formen ska ligga runt F1 (rotation 30°, utstick 0,1 m)');
  ok(Math.abs(b.L - 2.2) < 0.05 && Math.abs(b.B - 2.2) < 0.05 && Math.abs(b.rot) < 0.5 && b.H === 0.5, 'Formen runt F2');
  ok(/Gjutform Fundament F1/.test(a.name) && a.arm === 'Dölj' && a.meshes >= 1 && b.meshes >= 1 && a.dirty && b.dirty, 'Namn, ritad och markerad för sparning (Trimble Connect)');
  console.log('OK test_lagesplan_3dforms');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
