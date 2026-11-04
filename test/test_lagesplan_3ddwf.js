const { chromium } = require('playwright'); const fflate = require('../docs/vendor/three/fflate.min.js');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9874;
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


  const dwf = require('./_dwfsample')().toString('base64');
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), file = new File([bytes], 'test.dwf');
    const d = await l3dwfOpen(file); const out = {};
    if (!d) return { err: 'ingen dialog', st: document.body.innerText.slice(-300) };
    out.parts = d.r.parts.length; out.geoms = d.r.geoms.length; out.tris = d.tris; out.unit = d.r.unit; out.names = [...new Set(d.r.parts.map(p => p.name))].join('|');
    out.dlg = !!document.querySelector('.v3-dw'); out.rows = document.querySelectorAll('.v3-dw-r').length; out.sel = l3dwfSelected(d).length;
    out.m0 = d.r.parts[0].m.map(x => +x.toFixed(4)).join(','); out.col = JSON.stringify(d.r.parts[0].color);
    // IFC
    let got = null; const oD = l3msDeliver; l3msDeliver = async r => { got = r; return r; };
    await l3dwfToIfc(d, l3dwfSelected(d), 'test.dwf'); l3msDeliver = oD; out.ifcParts = got && got.n; out.ifcTris = got && got.tris; out.ifcText = !!(got && /Skruv & mutter|Skruv &amp; mutter/.test(got.text));
    // 3D
    const m = await l3dwfShow3d(d, l3dwfSelected(d), 'test.dwf'); out.m3 = { tris: m.tris, unit: m.unit, ext: m.ext };
    const bb = new THREE.Box3().setFromObject(m.root); out.bb = [bb.min.x, bb.max.x].map(v => Math.round(v));
    return out;
  }, dwf);
  console.log(JSON.stringify(r), errors.join('|'));
  const ok = (c, m) => { if (!c) fail(m + ' ' + JSON.stringify(r)); };
  ok(r.parts === 2 && r.geoms === 1, 'delar/geometrier');   // 2 instanser av en komponent (fyrhörning + kub i samma segment)
  ok(r.tris === 2 * (2 + 12), 'trianglar');
  ok(r.unit === 'ft' && /Skruv & mutter/.test(r.names), 'enhet/namn');
  ok(r.dlg && r.rows >= 1 && r.sel === 2, 'dialog/urval');
  ok(r.col === '[200,40,40]', 'färg');
  ok(r.ifcParts === 2 && r.ifcText, 'IFC-export');
  ok(r.m3.ext === 'dwf' && r.m3.tris === 28 && Math.abs(r.m3.unit - 0.3048) < 1e-6, 'visning i 3D');
  if (errors.length) fail('Fel: ' + errors.join('|'));
  console.log('OK: DWF (3D) – delar, Edgebreaker, instanser, namn, urvalsdialog, IFC och visning i 3D');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
