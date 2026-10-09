// Utskriftslayoutens lager (Victor 2026-10-07: "lite buggigt när man växlar … stabilisera"): varje
// ritning ritas med en egen kopia av sitt lagerläge, så tänd/släck under en pågående ritning hamnar
// rätt; ångra, lägesbyte (följ skärmen / eget urval / vy) och stängning lämnar skärmens lager orörda.
//
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8992;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + (process.env.DBG ? e.stack : '')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1000);
  page.on('dialog', d => d.accept());
  const r = await page.evaluate(async () => {
    const tick = (ms = 60) => new Promise(res => setTimeout(res, ms));
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
    ls('zones').visible = true; ls('objects').visible = true; ls('pdf').visible = true;
    await openPrint();
    const out = {};
    const A = pr.tpl.elements.find(e => e.type === 'map');
    A.layers = { follow: false, state: JSON.parse(JSON.stringify(layerState)) };
    const B = newMapEl(10, 10, 100, 80, 'A3'); B.layers = { follow: true }; pr.tpl.elements.push(B);
    setSel([A.id]); renderPrintProps(); await tick();
    out.held = !!prLayerHold && prLayerHold.el === A && !!document.querySelector('#prProps #layerList');
    // En ritning som håller på att ritas (PDF:en tar tid) – och under tiden släcker man zonerna i A.
    buildPdfPlate = async () => { await new Promise(res => setTimeout(res, 300)); return newCanvas(2, 2); };
    const job = renderMapCanvasNow(B, 100, 80, 200, 160, { preview: true });
    await tick(50);
    ls('zones').visible = false; saveLayerState();
    await job;
    out.aZones = A.layers.state.zones.visible; out.heldZones = ls('zones').visible; out.screenZones = prLayerHold.screen.zones.visible;
    out.bFollow = vpLayerState(B) === prLayerHold.screen;
    // Ångra medan panelen visar A: panelen följer med till den återställda ritningen.
    prUndo(); await tick();
    const A2 = pr.tpl.elements.find(e => e.id === A.id);
    out.undoZones = A2.layers.state.zones.visible; out.heldAfterUndo = !!prLayerHold && prLayerHold.el === A2;
    ls('objects').visible = false; saveLayerState();
    out.a2Obj = A2.layers.state.objects.visible; out.screenObj = prLayerHold.screen.objects.visible;
    // Byt läge: Följ skärmen -> panelen tillbaka, skärmens lager orörda.
    let sel = document.getElementById('prLayMode'); sel.value = 'follow'; sel.dispatchEvent(new Event('change')); await tick();
    const A3 = pr.tpl.elements.find(e => e.id === A.id);
    out.followMode = vpMode(A3) === 'follow' && !prLayerHold && !document.querySelector('#prProps #layerList') && !!document.querySelector('details.sec[data-sec="layers"] #layerList');
    out.screenAfterFollow = ls('objects').visible && ls('zones').visible;
    // Eget urval igen: börjar med det ritningen visade (skärmens lager).
    sel = document.getElementById('prLayMode'); sel.value = 'own'; sel.dispatchEvent(new Event('change')); await tick();
    const A4 = pr.tpl.elements.find(e => e.id === A.id);
    out.ownFromScreen = vpMode(A4) === 'own' && A4.layers.state.objects.visible === true && !!prLayerHold;
    // Förklaringens DXF-rader läser sin ritnings lager (inte skärmens).
    siteItems.push({ id: 'cx', type: 'cad', name: 'Utsättning', path: 'x/cx.json', colorMode: 'orig', layers: [{ name: '0', color: '#ff0000', n: 1 }], stats: { lines: 1, texts: 0, kb: 1 } });
    ls('cad:cx').visible = false; saveLayerState(); // släckt i ritningen
    const lg = pr.tpl.elements.find(e => e.type === 'legend'); lg.cad = true; lg.mapId = A.id;
    out.legendCad = legendItems(lg, true).some(i => i.key === 'cad:cx');
    out.screenCad = prLayerHold.screen['cad:cx'] ? prLayerHold.screen['cad:cx'].visible : true;
    // Stäng utskriften: skärmens lager tillbaka.
    pr.dirty = false; closePrint();
    out.closed = !prLayerHold && ls('zones').visible === true && ls('objects').visible === true;
    // Äldre mall (bara tänd/släckt per lager) blir ett eget urval.
    const m = migrateLayers({ follow: false, keys: { zones: false, objects: true, pdf: true } });
    out.migrated = !m.follow && m.state && m.state.zones.visible === false && m.state.objects.visible === true;
    return out;
  });
  const want = { held: true, aZones: false, heldZones: false, screenZones: true, bFollow: true, undoZones: true, heldAfterUndo: true, a2Obj: false, screenObj: true,
    followMode: true, screenAfterFollow: true, ownFromScreen: true, legendCad: false, screenCad: true, closed: true, migrated: true };
  const bad = Object.keys(want).filter(k => r[k] !== want[k]);
  if (bad.length) fail('Fel: ' + bad.map(k => `${k}=${JSON.stringify(r[k])}`).join(', '));
  console.log('OK: utskriftens lager – tänd/släck under en pågående ritning hamnar rätt, följ skärmen-ritningar använder skärmens lager, ångra, lägesbyte, förklaringen, stängning, äldre mallar');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
