const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9083;
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
  const ok = (c, m) => { if (!c) fail(m); };
  const r = await page.evaluate(async () => {
    const O = l3.O, A = [O[0] + 5, O[1] + 5, 0], pl = MG.planeFrom([0, 0, 1], [0, 0, 0]), out = {};
    const bb = p => { const t = modParts(p, 0)[0].tris.pts, xs = t.map(q => q[0]), ys = t.map(q => q[1]), zs = t.map(q => q[2]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)]; };
    const s1 = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [2, 2])], d: 2 }, A), s2 = modCreate({ k: 'solid', pl: MG.planeFrom([0, 0, 1], [0, 0, 0]), loops: [MG.rect2([3, 1], [5, 3])], d: 2 }, [A[0], A[1], 1]);
    // Skala × 2
    l3dw.op = { type: 'xscale', p: s1, a: [s1.x, s1.y, 0], r0: 1, f: 2 }; l3dxScaleCommit(2); out.vol = modDims(s1).volume;
    // Spegla över x = anchor + 10, behåll original
    const b0 = bb(s1); l3dwSet('mirAxis', 'x'); l3dwSet('mirKeep', true); l3dw.op = { type: 'xmirror', p: s1, a: [s1.x, s1.y, 0], c: s1.x + 10 }; l3dxMirrorCommit();
    const mir = placements.find(p => /spegel/.test(p.name)); const b1 = bb(mir); out.mir = { b0, b1, vol: modDims(mir).volume, n: placements.filter(p => p.m).length };
    // Skär ytor: s1 (skalad) mot s2
    out.seg = l3dxIntersect(s1, s2).length;
    // Följ banan: profil 0,2 x 0,2 längs en L-formad linje
    const prof = { pl: MG.planeFrom([1, 0, 0], [0, 0, 0]), loops: [[[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]]] };
    const path = [[0, 0, 0], [3, 0, 0], [3, 3, 0]], P = path.map(q => [A[0] + 20 + q[0], A[1] + q[1], q[2]]);
    const pf = P[0], lp = [[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]]; const prl = MG.planeFrom([1, 0, 0], pf), ploop = lp.map(q => MG.to3(prl, q));
    const S = l3dxSweep(ploop, P, false), st = modMeshStats(S.pts, S.faces); out.sweep = { vol: st.volume, tris: S.faces.length };
    // Slå ihop / dela upp
    const a = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [1, 1])], d: 1 }, [A[0] + 40, A[1], 0]), b = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [1, 1])], d: 2 }, [A[0] + 42, A[1], 0]);
    l3SelectIds([a.id, b.id]); const n0 = placements.length; l3dxJoin(); const j = placements.find(p => p.m && p.m.k === 'mesh' && p.m.parts); out.join = { vol: modDims(j).volume, n: placements.length - n0 };
    l3SelectIds([j.id]); l3dxExplode(); out.explode = placements.length - n0;
    // Solid → ytor
    const c = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [1, 1])], d: 1 }, [A[0] + 60, A[1], 0]); l3SelectIds([c.id]); const n1 = placements.length; l3dxExplode(); out.faces = placements.length - n1 + 1;
    // Kontroll: fjärilskontur
    modCreate({ k: 'face', pl, loops: [[[0, 0], [2, 2], [2, 0], [0, 2]]] }, [A[0] + 80, A[1], 0]); out.val = l3dxValidate(false).res.map(x => x.msgs.join());
    // Radera
    const e = modCreate({ k: 'face', pl, loops: [MG.rect2([0, 0], [1, 1])] }, [A[0] + 90, A[1], 0]); l3dxRemove([e.id]); out.erased = !placements.some(p => p.id === e.id);
    return out;
  });
  console.log(JSON.stringify(r));
  ok(Math.abs(r.vol - 64) < 0.5, 'Skala × 2: volym 64, fick ' + r.vol);
  ok(Math.abs(r.mir.b1[0] - (2 * (r.mir.b0[0] + 10) - r.mir.b0[1])) < 0.01, 'Spegling: ' + JSON.stringify(r.mir));
  ok(Math.abs(r.mir.vol - 64) < 0.5 && r.mir.n >= 3, 'Spegelkopia har samma volym: ' + JSON.stringify(r.mir));
  ok(r.seg > 0, 'Skärning ger linjer: ' + r.seg);
  ok(r.sweep.vol > 0.04 * 5.5 && r.sweep.vol < 0.04 * 6.5, 'Följ banan: volym ≈ 0,04 × 6 m: ' + JSON.stringify(r.sweep));
  ok(Math.abs(r.join.vol - 3) < 0.01 && r.join.n === -1, 'Slå ihop: ' + JSON.stringify(r.join));
  ok(r.explode === 0, 'Dela upp nät: ' + r.explode);
  ok(r.faces === 6, 'Kropp → 6 ytor: ' + r.faces);
  ok(r.val.some(t => /korsar/.test(t)), 'Kontroll hittar korsande kontur: ' + JSON.stringify(r.val));
  ok(r.erased, 'Radera');
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  console.log('OK: skala, spegla, skär ytor, följ banan, slå ihop/dela upp, kontroll, radera');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
