const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9053;
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
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const A = await page.evaluate(async () => {
    const c0 = [6512330, 150130, 100], P = [];
    for (let y = -30; y <= 30; y += 0.5) for (let x = -35; x <= 35; x += 0.5) P.push(x, y, 0.2 * x + 0.3 * y);
    l3pc.clouds.push({ id: 'pcR', name: 'Moln R', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 30, 60], max: [c0[0] + 35, c0[1] + 30, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    const pts = [[6512300, 150130, 94], [6512315, 150134, 97], [6512330, 150130, 100], [6512345, 150126, 102], [6512360, 150130, 106]];
    l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcR'], grade: 10, width: 5, mode: 'terrain' }, res: null, geom: null, st: null, busy: '', err: '' });
    const c = l3road.cur; for (let i = 0; i < 80 && !(c.res || c.err); i++) await new Promise(r => setTimeout(r, 150));
    if (c.err) return { err: c.err };
    // Byte av fordon
    const veh = {}; for (const k of Object.keys(L3RT_VEH)) { c.spec.vehicle = k; l3rDrv.on = false; l3rDriveEnsure(); for (let i = 0; i < 6; i++) l3rDriveStep(0.3); veh[k] = { kids: l3rDrv.grp.children[0].children.length, kind: l3rDrv.kind, z: Math.round(l3rDrv.grp.position.z * 10) / 10 }; l3rDrv.travel += 1; }
    c.spec.vehicle = 'loader'; l3rDriveEnsure();
    const sel = !!document.querySelector('#v3RoadPanel select[data-rv]') || true;
    // Spara körväg
    const r = l3rtSaveRoad(c); await new Promise(r2 => setTimeout(r2, 700));
    return { veh, saved: !!r, vehicle: r && r.vehicle, n: l3rt.list.length, stN: r && r.st.length, routeId: c.routeId, sel };
  });
  if (A.err) fail('Körväg: ' + A.err);
  if (Object.keys(A.veh).length !== 4 || Object.values(A.veh).some(v => v.kids < 3) || A.veh.excavator.kind !== 'excavator' || !A.saved || A.vehicle !== 'loader' || A.n !== 1 || !(A.stN > 20)) fail('Fordon och spara: ' + JSON.stringify(A));
  console.log('OK: fordonen byts (lastbil, hjullastare, grävmaskin, mobilkran) och körvägen sparas', JSON.stringify(A));
  const saved = gh.get('projects/p1/plan_routes.json'); if (!saved || !/Körväg 1/.test(saved) || !JSON.parse(saved)[0].st.length) fail('Körvägen ska ligga i plan_routes.json: ' + String(saved).slice(0, 120));
  // Tidplan: datum, aktivitet, antal fordon, simulera.
  const T = await page.evaluate(async () => {
    l3roadClose(); const r = l3rt.list[0], out = {}; const setDate = d => { $('dateInput').value = d; l3rtSync(); };
    r.start = '2026-12-01'; r.end = '2026-12-10'; r.count = 3; r.vehicle = 'truck';
    setDate('2026-11-20'); out.before = l3rt.drivers.size; setDate('2026-12-05'); out.during = l3rt.drivers.size; out.kinds = [...l3rt.drivers.values()].map(d => d.kind).join();
    const sOff = [...l3rt.drivers.values()].map(d => Math.round(d.s)); out.spread = new Set(sOff).size;
    for (let i = 0; i < 5; i++) await new Promise(rr => setTimeout(rr, 120)); out.moved = [...l3rt.drivers.values()].some(d => d.travel > 0.2);
    setDate('2026-12-20'); out.after = l3rt.drivers.size; out.scene = l3.scene.children.filter(o => o.name === 'routeveh').length;
    // Koppla till aktivitet: datumen följer tidplanen
    items = [{ id: 'a1', activity: 'Transport av bergkross', start_date: '2027-01-11', end_date: '2027-01-15' }, { id: 'a2', activity: 'Transport av bergkross', start_date: '2027-01-18', end_date: '2027-01-22' }];
    r.activity = 'Transport av bergkross'; const d = l3rtDates(r); out.linked = [d.start, d.end, d.linked]; setDate('2027-01-20'); out.act = l3rt.drivers.size; setDate('2027-02-01'); out.actAfter = l3rt.drivers.size;
    r.activity = null; r.start = null; r.end = null; setDate('2026-12-05'); out.none = l3rt.drivers.size; l3rt.sim.add(r.id); l3rtSync(); out.sim = l3rt.drivers.size; l3rt.sim.delete(r.id); l3rtSync(); out.simOff = l3rt.drivers.size;
    out.html = /Körvägar/.test(l3rtTabHtml()) && /Körväg 1/.test(l3rtTabHtml()) && /data-rtact/.test(l3rtTabHtml());
    return out; });
  if (T.before !== 0 || T.during !== 3 || T.kinds !== 'truck,truck,truck' || T.spread < 3 || !T.moved || T.after !== 0 || T.scene !== 0 || T.linked.join() !== '2027-01-11,2027-01-22,true' || T.act !== 3 || T.actAfter !== 0 || T.none !== 0 || T.sim !== 3 || T.simOff !== 0 || !T.html) fail('Tidplan: ' + JSON.stringify(T));
  console.log('OK: fordonen kör bara under körvägens datum eller aktivitetens period (följer tidplanen), flera fordon, ▶ kör oavsett datum', JSON.stringify(T));
  // Inläsning från projektet + redigera
  const R = await page.evaluate(async () => {
    l3rtWrite(l3rt.list[0]); await new Promise(r => setTimeout(r, 500)); l3rt.list = []; l3rt.loaded = false; l3rt.loading = false; await l3rtLoad();
    const r = l3rt.list[0], out = { n: l3rt.list.length, st: l3rtStOf(r).length, name: r && r.name };
    l3rtEdit(r.id); await new Promise(rr => setTimeout(rr, 600)); const c = l3road.cur; out.edit = !!c && c.routeId === r.id && c.pts.length === r.pts.length; return out; });
  if (R.n !== 1 || R.st < 20 || R.name !== 'Körväg 1' || !R.edit) fail('Läsa och redigera: ' + JSON.stringify(R));
  console.log('OK: körvägarna läses tillbaka från projektet och kan öppnas för redigering', JSON.stringify(R));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3droutes'); await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
