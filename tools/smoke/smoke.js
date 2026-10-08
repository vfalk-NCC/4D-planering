// Röktest med projektets riktiga data (Victor 2026-10-07: "Det allra viktigaste är stabiliteten").
//
// Öppnar 4D-planering och Lägesplan i en webbläsare mot en lokal kopia av 4D-data och går igenom
// allt som går att göra utan att ändra något: varje flik, plan, lager, zonlager, sparad vy,
// utskriftsmall och ritning, exporter (byggs men laddas inte ner) m.m. Minsta sidfel eller fel i
// konsolen = underkänt. Inget skrivs någonsin: alla skrivningar mot GitHub fångas upp och kastas.
//
//   node tools/smoke/smoke.js [--data /home/user/4d-data] [--project TlX0-hA7k9o] [--only lagesplan|planering]
//
// Datat läses ur den lokala klonen av 4D-data (git show origin/main:…) och hamnar aldrig i repot.
// Biblioteken som annars kommer från cdnjs hämtas en gång från npm till tools/smoke/.cache.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), { execFileSync } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DATA = arg('data', process.env.FOURD_DATA || '/home/user/4d-data');
const PID = arg('project', 'TlX0-hA7k9o');
const ONLY = arg('only', '');
const DOCS = path.join(__dirname, '..', '..', 'docs');
const CACHE = path.join(__dirname, '.cache');
const PORT = 9031;

if (!fs.existsSync(path.join(DATA, '.git'))) { console.log(`Ingen 4D-data-klon i ${DATA} – röktestet hoppas över.`); process.exit(0); }

// ---- Bibliotek (cdnjs -> npm) ----
const LIBS = {
  'pdf.js/3.11.174/pdf.min.js': ['pdfjs-dist@3.11.174', 'build/pdf.min.js'],
  'pdf.js/3.11.174/pdf.worker.min.js': ['pdfjs-dist@3.11.174', 'build/pdf.worker.min.js'],
  'pako/2.1.0/pako.min.js': ['pako@2.1.0', 'dist/pako.min.js'],
  'jspdf/2.5.1/jspdf.umd.min.js': ['jspdf@2.5.1', 'dist/jspdf.umd.min.js'],
  'jszip/3.10.1/jszip.min.js': ['jszip@3.10.1', 'dist/jszip.min.js'],
  'xlsx/0.18.5/xlsx.full.min.js': ['xlsx@0.18.5', 'dist/xlsx.full.min.js'],
  'qrcode-generator/1.4.4/qrcode.min.js': ['qrcode-generator@1.4.4', 'qrcode.js'],
  'pdf-lib/1.17.1/pdf-lib.min.js': ['pdf-lib@1.17.1', 'dist/pdf-lib.min.js'],
};
function libFile(u) {
  const e = LIBS[u]; if (!e) return null;
  const [pkg, file] = e, dir = path.join(CACHE, pkg.replace(/[@/]/g, '_'));
  const f = path.join(dir, 'package', file);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(dir, { recursive: true });
    try { const tgz = execFileSync('npm', ['pack', pkg, '--silent'], { cwd: dir }).toString().trim().split('\n').pop(); execFileSync('tar', ['xzf', tgz], { cwd: dir }); } catch (err) { return null; }
  }
  return fs.existsSync(f) ? f : null;
}

// ---- Data ur 4D-data ----
const blobs = new Map();
function blob(p) {
  if (!blobs.has(p)) { let b = null; try { b = execFileSync('git', ['-C', DATA, 'show', `origin/main:${p}`], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { b = null; } blobs.set(p, b); }
  return blobs.get(p);
}
function list(p) { try { return execFileSync('git', ['-C', DATA, 'ls-tree', '--name-only', 'origin/main', p.replace(/\/$/, '') + '/'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').filter(Boolean); } catch (e) { return null; } }

const TC_MOCK = `window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
  project: { getProject: () => Promise.resolve({ id: '${PID}', name: 'Röktest', location: 'europe' }) },
  extension: { requestPermission: () => Promise.resolve('denied'), setStatusMessage: () => Promise.resolve() },
  markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]), addTextMarkup: () => Promise.resolve([]) },
  viewer: { getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)), convertToObjectRuntimeIds: (m, ids) => Promise.resolve([]),
    setSelection: () => Promise.resolve(), setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, fieldOfView: 60 }),
    getObjectBoundingBoxes: () => Promise.resolve([]), getObjectProperties: () => Promise.resolve([]), setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve(),
    addIcon: () => Promise.resolve(), removeIcon: () => Promise.resolve(), getLayers: () => Promise.resolve([]) } }); } };`;

async function newPage(browser, report) {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true })).newPage();
  page.on('pageerror', e => report.errors.push(`sidfel: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|ERR_|net::/.test(t)) return; // nätverk i testmiljön
    report.errors.push(`konsol: ${t.slice(0, 300)}`);
  });
  page.on('dialog', d => d.dismiss().catch(() => {})); // inga bekräftelser – inget tas bort
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Röktest' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route(/^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs|unpkg\.com)\//, r => {
    let u = r.request().url().replace(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//, '');
    if (/unpkg\.com\/pdf-lib/.test(u)) u = 'pdf-lib/1.17.1/pdf-lib.min.js';
    const f = libFile(u);
    return f ? r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: TC_MOCK }));
  await page.route(/^https:\/\/(api\.open-meteo\.com|fonts\.|[a-z]+\.tile\.|app\d*\.connect\.trimble\.com)/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), p = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() !== 'GET') { report.writes.push(`${req.method()} ${p}`); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"smoke"}}' }); }
    const b = blob(p);
    if (!b) { const l = list(p); return l ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(l.map(n => ({ name: n.split('/').pop(), path: n, type: 'file', sha: 'x' }))) }) : r.fulfill({ status: 404, body: '{}' }); }
    if ((req.headers().accept || '').includes('raw')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: b });
    if (b.length > 1e6) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: '', encoding: 'none', sha: 's' + b.length }) });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b.toString('base64'), sha: 's' + b.length }) });
  });
  return page;
}

async function step(report, name, fn, page = report.page) {
  const before = report.errors.length, t = Date.now();
  try { await fn(); } catch (e) { report.errors.push(`${name}: ${e.message.split('\n')[0]}`); }
  // Felraden (error-guard.js) får aldrig ha visats.
  if (page) {
    const bar = await page.evaluate(() => { const b = document.getElementById('errGuardBar'); const t = b && b.style.display !== 'none' ? b.querySelector('.eg-msg').textContent : ''; if (b) b.style.display = 'none'; return t; }).catch(() => '');
    if (bar) report.errors.push(`felraden visades: ${bar}`);
  }
  const ok = report.errors.length === before;
  report.steps.push(`${ok ? '✓' : '✗'} ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  if (!ok) report.steps.push(...report.errors.slice(before).map(e => '    ' + e));
}

async function lagesplan(browser, report) {
  const page = report.page = await newPage(browser, report);
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`);
  await step(report, 'Lägesplan laddas', () => page.waitForFunction(() => typeof plan !== 'undefined' && plan && siteLoaded && typeof pdfDoc !== 'undefined' && pdfDoc, null, { timeout: 240000 }));
  const planIds = await page.evaluate(() => plans.map(p => [p.id, p.name]));
  for (const [id, name] of planIds) {
    await step(report, `Plan "${name}": öppna, rita, zoom, panorera`, async () => {
      await page.evaluate(async id => { await openPlan(id); }, id);
      await page.waitForTimeout(1500);
      await page.evaluate(async () => {
        const vp = $('viewport').getBoundingClientRect();
        for (const f of [1.6, 1.6, 0.4, 2.5]) { zoomAt(f, vp.width / 2, vp.height / 2); renderZones(); await new Promise(r => setTimeout(r, 120)); }
        view.tx -= 300; view.ty -= 120; applyView(); renderZones(); fitView();
      });
    });
    await step(report, `Plan "${name}": båda zonlagren, markera zoner, datum`, () => page.evaluate(async () => {
      for (const set of ['prefab', 'main']) {
        setZoneSet(set);
        for (const z of (plan.zones || []).slice(0, 6)) { selectZone(z.id, false); }
        selectZone(null);
      }
      const d = $('dateInput'), orig = d.value;
      for (const k of [7, -30, 30]) { const x = new Date(orig || Date.now()); x.setDate(x.getDate() + k); d.value = x.toISOString().slice(0, 10); d.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 100)); }
      d.value = orig; d.dispatchEvent(new Event('change'));
    }));
  }
  await step(report, 'Flikar', async () => {
    const tabs = await page.evaluate(() => [...document.querySelectorAll('nav [data-tab]')].map(b => b.dataset.tab));
    for (const t of tabs) { await page.evaluate(t => document.querySelector(`nav [data-tab="${t}"]`).click(), t); await page.waitForTimeout(500); }
    await page.evaluate(() => document.querySelector('nav [data-tab]').click());
  });
  await step(report, 'Lager: tänd/släck varje lager och tillbaka', () => page.evaluate(async () => {
    const saved = JSON.stringify(layerState);
    const rows = [...document.querySelectorAll('#layerList .layer-row[data-layer] .lr-vis')].slice(0, 60);
    for (const cb of rows) { cb.click(); await new Promise(r => setTimeout(r, 20)); cb.click(); }
    layerState = JSON.parse(saved); saveLayerState(); renderLayerPanel(); applyLayerCss(); renderZones();
  }));
  await step(report, 'Sparade vyer', async () => {
    const n = await page.evaluate(() => lsViews().length);
    for (let i = 0; i < n; i++) await page.evaluate(async i => { await applyLsView(lsViews()[i]); }, i), await page.waitForTimeout(800);
  });
  await step(report, 'Utskrift: varje mall och ritning, alla lagerlägen, förhandsvisning, DXF', () => page.evaluate(async () => {
    const tick = (ms = 300) => new Promise(r => setTimeout(r, ms));
    await openPrint(); await tick(800);
    for (const t of printTpls()) {
      switchTemplate(t.id); await tick(600);
      for (const m of pr.tpl.elements.filter(e => e.type === 'map')) {
        setSel([m.id]); renderPrintProps(); await tick(300);
        const k = PRINT_FORMATS[pr.tpl.format].w / PAGE_A3[0];
        await renderMapCanvas(m, m.w * k, m.h * k, 600, Math.max(50, Math.round(600 * m.h / m.w)), { preview: true });
      }
      for (const e of pr.tpl.elements) { setSel([e.id]); renderPrintProps(); }
      // DXF (bladet + ritningarna i modellens koordinater) byggs och läses in igen.
      for (const mode of ['sheet', 'model4d', 'modelAll']) for (const f of await buildPrintDxf(pr.tpl, () => {}, mode)) { const d = parseDxf(f.text); if (!d.entities.length) throw new Error('Tom DXF: ' + f.name); dxfToGeometry(d); }
      setSel([]); renderPrintProps(); drawPrintPage();
    }
    pr.dirty = false; closePrint();
  }));
  await step(report, 'Exporter byggs (DXF, IFC, zoner till Excel)', () => page.evaluate(async () => {
    for (const p of plans.filter(p => p.calib && (p.zones || []).length).slice(0, 2)) {
      await openPlan(p.id);
      for (const set of ['main', 'prefab']) { setZoneSet(set); if ((plan.zones || []).length) { buildZonesDxf(); buildZonesIfc(); buildZoneVolumesIfc(); } }
      setZoneSet('main');
    }
    zoneExportData();
    if (typeof buildObjectsIfc === 'function' && $('showObjects').checked) buildObjectsIfc();
  }));
  await page.context().close();
}

async function planering(browser, report) {
  const page = report.page = await newPage(browser, report);
  await page.goto(`http://localhost:${PORT}/index.html`);
  await step(report, '4D-planering laddas', () => page.waitForFunction(() => typeof items !== 'undefined' && items.length > 0, null, { timeout: 120000 }));
  await step(report, 'Planeringskällor, flikar, gruppering, sortering, filter', () => page.evaluate(async () => {
    const tick = (ms = 250) => new Promise(r => setTimeout(r, ms));
    for (const src of ['pp', 'excel']) {
      const b = document.querySelector(`#planSourceBar [data-src="${src}"]`); if (b) { b.click(); await tick(1500); }
      for (const t of ['plan', 'time', 'tools']) { const tb = document.querySelector(`#mainTabs [data-tab="${t}"], nav [data-tab="${t}"]`); if (tb) { tb.click(); await tick(); } }
      document.querySelector('nav [data-tab="plan"]').click();
      for (const g of ['', 'area', 'elementType', 'activity', 'contractor', 'status']) { const s = document.getElementById('groupBy'); s.value = g; s.dispatchEvent(new Event('change')); await tick(80); }
      for (const o of ['alpha', 'start', 'type', '']) { const s = document.getElementById('sortBy'); s.value = o; s.dispatchEvent(new Event('change')); await tick(80); }
      const q = document.getElementById('itemSearch'); q.value = 'a'; q.dispatchEvent(new Event('input')); await tick(); q.value = ''; q.dispatchEvent(new Event('input'));
    }
  }));
  await step(report, 'Veckosammanfattning, alla veckor ±4', () => page.evaluate(async () => {
    await openWeekSummary();
    for (let i = 0; i < 4; i++) document.querySelector('#weekSumDialog .ws-prev').click();
    for (let i = 0; i < 8; i++) document.querySelector('#weekSumDialog .ws-next').click();
    document.querySelector('#weekSumDialog .ws-x').click();
  }));
  await page.context().close();
}

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    const x = path.extname(q.url.split('?')[0]);
    r.writeHead(200, { 'Content-Type': { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[x] || 'application/octet-stream' }); r.end(d);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const report = { steps: [], errors: [], writes: [] };
  const t0 = Date.now();
  try {
    if (!ONLY || ONLY === 'planering') await planering(browser, report);
    if (!ONLY || ONLY === 'lagesplan') await lagesplan(browser, report);
  } finally { await browser.close(); server.close(); }
  console.log(report.steps.join('\n'));
  console.log(`\nSkrivningar som fångades (inget sparades): ${report.writes.length}${report.writes.length ? ' – ' + [...new Set(report.writes)].slice(0, 6).join(', ') : ''}`);
  console.log(`${report.errors.length ? `✗ RÖKTESTET UNDERKÄNT – ${report.errors.length} fel` : '✓ RÖKTESTET GODKÄNT'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(report.errors.length ? 1 : 0);
})().catch(e => { console.error('FEL:', e); process.exit(2); });
