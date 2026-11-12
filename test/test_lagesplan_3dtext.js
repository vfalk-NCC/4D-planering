const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9091;
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
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1200);
    out.btn = !!document.getElementById('v3TextBtn'); document.getElementById('v3TextBtn').click(); await w(300);
    out.dlg = !!document.getElementById('v3TextDlg') && !document.getElementById('v3TextDlg').classList.contains('hidden');
    const d = l3tx.d; d.text = 'F18 (2)'; d.h = 0.5; d.t = 0.1; d.x = 6512330; d.y = 150130; d.z = 100; l3txDraw(); await w(300);
    const B = l3tx.last; out.tris = B.tris.length; out.size = [Math.round(B.w * 100) / 100, Math.round(B.hgt * 100) / 100];
    const n0 = placements.length; const p = l3txCommit(); out.made = !!p && placements.length === n0 + 1 && !!p.txt3d;
    const st = modMeshStats(p.m.pts, p.m.faces.map(f => [f[0], f[1], f[2]])); out.vol = Math.round(Math.abs(st.volume) * 1000) / 1000; out.closed = p.m.closed === true;
    // flytthandtag före skapandet: dra i sidled och höjdled
    { l3SelectIds([]); l3txOpen(); const dd = l3tx.d; dd.text = 'MOVE'; dd.x = 6512400; dd.y = 150100; dd.z = 100; l3txDraw(); l3txGizmo(true); out.gizmo = !!l3.gizmoT && l3.gizmoT.object === l3tx.proxy;
      const O = l3.O; l3tx.proxy.position.set(6512403 - O[0], 150102 - O[1], 105 - O[2]); l3.gizmoT.dispatchEvent({ type: 'objectChange' });
      out.moved = Math.abs(dd.x - 6512403) < 0.01 && Math.abs(dd.y - 150102) < 0.01 && Math.abs(dd.z - 105) < 0.01 && /X 6512403/.test(document.querySelector('.v3-tx-pos').textContent.replace(/\s/g, ' ').replace(',00', ''));
      const pp = l3txCommit(); out.atPos = Math.abs(pp.x - 6512403) < 0.6 && Math.abs(pp.y - 150102) < 0.6 && Math.abs(pp.z - 105) < 0.1; out.gone = !l3.gizmoT.object; }
    // redigera efteråt: knapp i panelen, flyttat objekt behåller sitt nya läge, ny storlek, höjd-slider och vridhjul
    { l3SelectIds([p.id]); await w(500); const btn = document.querySelector('#v3Side [data-txedit]'); out.editBtn = !!btn; p.x += 5; placeTouch(p); l3RebuildOne(p); btn.click(); await w(400);
      out.editOpen = !!l3tx.editId && l3tx.d.text === 'F18 (2)' && Math.abs(l3tx.d.x - (6512330 + 5)) < 0.01; out.slider = !!document.querySelector('#v3TextDlg input[type=range][data-txf="h"]');
      const dial = document.querySelector('#v3TextDlg .v3-tx-dial'), r0 = dial.getBoundingClientRect(); out.dial = !!dial;
      const ptr = (x, y, t) => dial.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1, buttons: 1 }));
      dial.setPointerCapture = () => {}; ptr(r0.left + r0.width / 2, r0.top + 2, 'pointerdown'); out.rot90 = Math.abs(l3tx.d.rot - 90) <= 2; ptr(r0.left + r0.width / 2, r0.top + r0.height - 2, 'pointerdown'); out.rot270 = Math.abs(l3tx.d.rot - 270) <= 2;
      l3tx.d.rot = 0; l3tx.d.text = 'AB'; l3tx.d.h = 1; l3txDraw(); const n1 = placements.length, mp = l3txCommit();
      out.edited = placements.length === n1 && mp.id === p.id && Math.abs(mp.x - (6512330 + 5)) < 0.01 && mp.txt3d.text === 'AB'; let zr = [Infinity, -Infinity], xr = [Infinity, -Infinity]; mp.m.pts.forEach(pp => { zr = [Math.min(zr[0], pp[2]), Math.max(zr[1], pp[2])]; xr = [Math.min(xr[0], pp[0]), Math.max(xr[1], pp[0])]; }); out.resized = xr[1] - xr[0] > 1.2;
      out.shown = l3.placeMeshes.get(p.id).visible !== false; }
    // hål: "O" är en ring, inte en skiva
    l3txOpen(); const d2 = l3tx.d; d2.text = 'O'; d2.font = 'Arial'; d2.bold = true; d2.h = 1; d2.t = 0.1; d2.x = 6512340; d2.y = 150130; d2.z = 100; l3txDraw(); const C = l3tx.last; const q = l3txCommit();
    const st2 = modMeshStats(q.m.pts, q.m.faces.map(f => [f[0], f[1], f[2]])), bb = C.w * C.hgt * 0.1; out.ring = Math.abs(st2.volume) < bb * 0.75 && Math.abs(st2.volume) > bb * 0.2; out.ringClosed = q.m.closed === true;
    // stående text: höjden ligger i z
    l3txOpen(); const d3 = l3tx.d; d3.text = 'AB'; d3.mode = 'standing'; d3.h = 0.5; d3.x = 6512350; d3.y = 150130; d3.z = 100; l3txDraw(); const s3 = l3txCommit(); let zr = [Infinity, -Infinity]; s3.m.pts.forEach(pp => { zr = [Math.min(zr[0], pp[2]), Math.max(zr[1], pp[2])]; }); out.stand = zr[1] - zr[0] > 0.4 && zr[1] - zr[0] < 0.7;
    // bakplatta
    l3txOpen(); const d4 = l3tx.d; d4.text = 'X'; d4.plate = true; d4.margin = 0.1; d4.x = 6512360; d4.y = 150130; d4.z = 100; l3txDraw(); const s4 = l3txCommit(); out.plate = s4.m.closed === true;
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 400)); process.exit(1); }
  if (!r.btn || !r.dlg || r.tris < 200 || !r.made || r.vol <= 0 || !r.closed || !r.ring || !r.ringClosed || !r.stand || !r.plate || !r.editBtn || !r.editOpen || !r.slider || !r.dial || !r.rot90 || !r.rot270 || !r.edited || !r.resized || !r.shown || !r.gizmo || !r.moved || !r.atPos || !r.gone) { console.error('FAIL 3D-text: ' + JSON.stringify(r)); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: 3D-text – slutna kroppar med hål, liggande/stående, bakplatta');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
