// UE-lag och noteringar som IFC (Victors önskemål 2026-10-06): samma upplägg som de andra IFC-
// exporterna – det som syns för datumet, modellens koordinater, arbetsytans kalibrerade maxhöjd,
// skyltar med liggande 3D-text, egenskaper, lokal fil + Trimble Connect (Lägesplan export).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8989;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: () => ({ promise: Promise.resolve(), cancel() {} }) };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const r = await page.evaluate(async () => {
    const O = [6512300, 150100], day = $('dateInput').value || todayIso();
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[O[0], O[1], 0], [O[0] + 100, O[1], 0]], pdf: [[0, 0], [1000, 0]] }, level: { z0: 10, z1: 14 }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    renderPlanSelect(); await openPlan('A');
    siteItems.push({ id: 'u1', type: 'ue', name: 'Havator', short: 'HAV', color: '#0e7490' });
    siteItems.push({ id: 'c1', type: 'crew', ue: 'u1', persons: 2, task: 'Sätter L-stål', pts: [[O[0] + 20, O[1] + 30]], from: day, to: day, layer: 'Dagsplanering' });
    siteItems.push({ id: 'c2', type: 'crew', ue: 'u1', persons: 3, task: 'Annan dag', pts: [[O[0] + 40, O[1] + 30]], from: '2020-01-01', to: '2020-01-02', layer: 'Dagsplanering' });
    siteItems.push({ id: 'n1', type: 'note', text: 'Avspärrat 100 % – kran', pts: [[O[0] + 60, O[1] + 20], [O[0] + 70, O[1] + 35]], layer: 'Allmänt', by: 'Victor' });
    ls('ul:Dagsplanering').visible = true; ls('ul:Allmänt').visible = true;
    const files = {}, calls = [];
    downloadBlob = (blob, name) => { files.ifc = { blob, name }; };
    askOpener = async (type, extra) => { calls.push([type, extra.folder, extra.files[0].name]); return { folder: extra.folder }; };
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    $('cadExportToTc').checked = true;
    await exportSiteIfc();
    return { name: files.ifc && files.ifc.name, calls, status: $('saveStatus').textContent, ifc: files.ifc ? await files.ifc.blob.text() : '' };
  });
  fs.writeFileSync(path.join(process.env.IFC_OUT || require('os').tmpdir(), 'lag-test.ifc'), r.ifc);
  if (!/^Lag och noteringar Plan 1 .*\.ifc$/.test(r.name || '')) fail('Filnamn: ' + r.name);
  if (r.calls.length !== 1 || r.calls[0][0] !== 'tcUpload' || r.calls[0][1] !== 'Lägesplan export') fail('Ska sparas i Trimble Connect (Lägesplan export): ' + JSON.stringify(r.calls));
  if (!/1 lag och 1 noteringar exporterade som IFC på \+14\.00/.test(r.status)) fail('Statusraden: ' + r.status);
  const t = r.ifc;
  const proxies = [...t.matchAll(/IFCBUILDINGELEMENTPROXY\('[^']+',\$,'([^']*)','([^']*)','([^']*)'/g)].map(m => [m[1], m[3]]);
  const kinds = proxies.map(p => p[1]).sort();
  if (JSON.stringify(kinds) !== JSON.stringify(['4D-lag', '4D-lagtext', '4D-notering', '4D-noteringstext'])) fail('Ett lag (dagens) och en notering, var och en med text: ' + JSON.stringify(proxies));
  if (!proxies.some(p => p[1] === '4D-lag' && p[0] === 'HAV \\X2\\00D7\\X0\\2')) fail('Lagets namn "HAV ×2": ' + JSON.stringify(proxies));
  if (!/'Personer',\$,IFCREAL\(2\.\)/.test(t) || !/'Uppgift',\$,IFCLABEL\('S\\X2\\00E4\\X0\\tter L-st\\X2\\00E5\\X0\\l'\)/.test(t) || !/'Text',\$,IFCLABEL\('Avsp\\X2\\00E4\\X0\\rrat 100 % \\X2\\2013\\X0\\ kran'\)/.test(t)) fail('Egenskaper (personer, uppgift, notering)');
  if (!/IFCCARTESIANPOINT\(\(6512320\.,150130\.,14\.\)\)/.test(t)) fail('Laget på sin plats på maxhöjden +14');
  if (!/IFCCOLOURRGB\(\$,0\.055,0\.455,0\.565\)/.test(t)) fail('Skylten i UE:ns färg');
  console.log('OK: lag (bara dagens) och noteringar som IFC – skyltar i UE-färg på maxhöjden, 3D-text, egenskaper, Trimble Connect');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
