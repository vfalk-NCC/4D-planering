// Saxen i 3D (dragbart handtag, snittkanter, släpps vid verktygsbyte), fäst mot DXF (3D först),
// DXF-texter i 3D och egna kortkommandon i snabbsöket (Victor 2026-10-10).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9019;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
// pako (komprimering av CAD-geometrin): en enkel ersättare – testet läser aldrig tillbaka filen.
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
const DXF = n => ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', n, '10', '6512340', '20', '150110', '11', '6512345', '21', '150110', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async grund => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    // En inlagd DXF (Utsättning) med två CAD-lager, i modellens koordinater.
    const rec = { id: 'c1', type: 'cad', name: 'Utsättning', path: 'x', colorMode: 'orig', weight: 1, layers: [{ name: 'AXLAR', color: '#ff0000', n: 1 }, { name: 'MÅTT', color: '#0000ff', n: 1 }], stats: { lines: 2, texts: 0, kb: 1 } };
    siteItems.push(rec); ls('cad:c1').visible = true;
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000]], t: [[2000, 2000, 500, 0, 'A12', 'lb'], [4000, 2000, 500, 90, 'K10\nFUND', 'cm']] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    window.__calls = [];
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.fileId || extra.folderId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'CAD', type: 'folder' }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'D1', name: 'Grund.dxf', type: 'file', size: 300 }, { id: 'P1', name: 'Plan.pdf', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'D1') return { bytes: new TextEncoder().encode(grund).buffer };
      if (type === 'tcUpload') { window.__calls.push(['upload', extra.files.map(f => f.name).join()]); return { uploaded: 1 }; }
      return {};
    };
  }, DXF('GRUND'));
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  // Val av vad som sparas i en vy (Victor 2026-11-01).
  const r = await page.evaluate(async () => {
    const out = {};
    l3ClipHorizontal(); l3DlgClose('v3Clip');
    document.getElementById('dateInput').value = '2026-05-04';
    // Direktspar med standardval (utan datum).
    const a = l3SaveView('Direkt');
    out.defParts = a.parts.join();
    out.noDate = a.date === undefined;
    // Bara kamera.
    const b = l3SaveView('Kamera', []);
    out.camOnly = b.clips === undefined && b.meas === undefined && b.hid === undefined && b.models === undefined;
    // Med datum.
    const c = l3SaveView('Datum', ['clips', 'datum']);
    out.dateSaved = c.date === '2026-05-04' && c.clips.length === 1;
    // Återläsning: kamera-bara-vyn rör inte snitten.
    const n0 = l3.clips.length;
    l3GoView(l3SavedViews().findIndex(v => v.name === 'Kamera'));
    out.clipsKept = l3.clips.length === n0 && n0 === 1;
    // Direktvyn återställer snitt, datumvyn datum.
    l3.clips = []; l3ApplyClips();
    l3GoView(l3SavedViews().findIndex(v => v.name === 'Direkt'));
    out.clipsBack = l3.clips.length === 1;
    document.getElementById('dateInput').value = '2026-01-01';
    l3GoView(l3SavedViews().findIndex(v => v.name === 'Datum'));
    out.dateBack = document.getElementById('dateInput').value === '2026-05-04';
    out.chips = l3vChips(c).join();
    // Dialogen: avmarkera Snitt, spara.
    const p = l3SaveViewAsk('Dlg');
    const ov = document.getElementById('v3SvDlg');
    ov.querySelector('[data-svp="clips"]').click(); ov.querySelector('[data-svp="datum"]').click();
    ov.querySelector('[data-svok]').click();
    await p;
    const d = l3SavedViews().find(v => v.name === 'Dlg');
    out.dlg = d && !d.parts.includes('clips') && d.parts.includes('datum') && d.clips === undefined;
    out.pref = l3Prefs().viewParts.includes('datum') && !l3Prefs().viewParts.includes('clips');
    // Äldre vy utan parts = allt den har.
    out.legacy = l3vHas({ name: 'x' }, 'clips');
    return out;
  });
  if (!r.noDate || !r.camOnly || !r.dateSaved || !r.clipsKept || !r.clipsBack || !r.dateBack || !r.dlg || !r.pref || !r.legacy || r.chips !== 'Snitt,4D-datum') fail('Vyval: ' + JSON.stringify(r));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dviews');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
