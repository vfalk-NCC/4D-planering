// iPhone (Victor 2026-10-11: "kraschar vid öppning varje gång"): på en telefon öppnas lägesplanen med allt utom
// ritningen, zonerna, objekten och fotona släckt, ritningen i lägre upplösning och utan att 3D-modellerna läses
// in av sig själva. På datorn ska inget av detta hända – samma test körs utan telefon och då är allt som förut.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9006;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
const LAYERS = { pdf: { visible: true, opacity: 100 }, zones: { visible: true, opacity: 100 }, objects: { visible: true, opacity: 100 }, photos: { visible: true, opacity: 100 },
  'cad:c1': { visible: true, opacity: 100 }, 'cadl:c1:AXLAR': { visible: true, opacity: 100 }, 'ortho:o1': { visible: true, opacity: 100 }, 'ul:Skisser': { visible: true, opacity: 100 }, 'ulopen:Skisser': true };

async function run(browser, phone) {
  const fail = m => { throw new Error((phone ? 'iPhone: ' : 'Dator: ') + m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(([phone, layers]) => {
    if (phone) window.__forcePhone = true;
    localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
    localStorage.setItem('lagesplan-layers-p1', JSON.stringify(layers));
    localStorage.setItem('lagesplan-bldg-p1', JSON.stringify([{ id: 'm1', fileId: null, name: 'Byggnad', version: 'v1', parentId: null, on: true }]));
  }, [phone, LAYERS]);
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
  });
  const st = await page.evaluate(() => ({ phone: lowMemPhone, w: $('pdfCanvas').width, vis: Object.fromEntries(['pdf', 'zones', 'objects', 'photos', 'cad:c1', 'cadl:c1:AXLAR', 'ortho:o1', 'ul:Skisser', 'ul:Ny'].map(k => [k, ls(k).visible])), photos: $('showPhotos').checked }));
  const on = Object.entries(st.vis).filter(([, v]) => v).map(([k]) => k).join();
  if (st.phone !== phone) fail('lowMemPhone ska vara ' + phone);
  if (phone) {
    if (on !== 'pdf,zones,objects,photos,cadl:c1:AXLAR' || !st.photos) fail('bara ritningen, zonerna, objekten och fotona tända (lagren i DXF:en behåller sitt läge): ' + on);
    if (st.w > 2500) fail('ritningen i lägre upplösning: ' + st.w);
  } else {
    if (on !== 'pdf,zones,objects,photos,cad:c1,cadl:c1:AXLAR,ortho:o1,ul:Skisser,ul:Ny') fail('lagren som förut: ' + on);
    if (st.w !== 4000) fail('ritningen i full upplösning: ' + st.w);
  }
  // 3D: på telefonen läses den sparade modellen inte in av sig själv – den står släckt under Lager.
  await page.evaluate(() => { window.__loads = []; });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3bLoad === 'function', null, { timeout: 15000 });
  await page.evaluate(() => { const f = l3bLoad; l3bLoad = async (list, o) => { window.__loads.push(list.map(w => w.id).join()); return { missing: list }; }; window.__l3bLoad0 = f; });
  await page.evaluate(() => l3bRestore());
  const s3 = await page.evaluate(() => ({ loads: window.__loads, tex: l3.planMesh && l3.planMesh.material.map.image.width, status: (document.getElementById('v3Status') || {}).textContent || '' }));
  if (phone) {
    if (s3.loads.length) fail('modellen ska inte läsas in av sig själv: ' + JSON.stringify(s3.loads));
    if (!(s3.tex <= 2048)) fail('marken i 3D i lägre upplösning: ' + s3.tex);
  } else {
    if (s3.loads[0] !== 'm1') fail('den sparade modellen ska läsas in som förut: ' + JSON.stringify(s3.loads));
    if (s3.tex !== 4000) fail('marken i 3D i full upplösning: ' + s3.tex);
  }
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await page.context().close();
}

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await run(browser, true); console.log('OK: iPhone – lager och modeller släckta, ritningen i lägre upplösning');
    await run(browser, false); console.log('OK: datorn – allt som förut');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
