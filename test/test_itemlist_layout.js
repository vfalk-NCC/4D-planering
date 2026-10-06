// Planeringslistan (Victor 2026-10-06: "blir långa texter"): "Väntar på" på en rad med +N och hela
// listan i tipsrutan, rött bara vid risk; området upprepas inte när aktiviteten redan står i det.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8995;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const PID = 'test-project';
const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };

const iso = d => d.toISOString().slice(0, 10);
const day = k => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + k); return iso(d); };
let k = 0;
const it = (name, s, e, extra = {}) => ({ id: 'i' + (++k), project_id: PID, object_id: 'excel-i' + k, object_name: name, activity: 'x', area: 'L', depends_on: [], start_date: day(s), end_date: day(e), progress: 0, source_key: 'X||Y||' + name, ...extra });
put('plan_items.json', [
  it('Fundament linje J. REDO FÖR GJUTNING IMORGON (3sulor, 36-34-32). 20-28 GROVGJUTNING IMON.', -3, 12, { status: 'pagaende', progress: 30, area: 'PRODUKTION / 742A Krönlinje J', activity: '742A Krönlinje J' }),
  it('Vägg/kontrafor linje J14, J15, J16. FÖRSTA STAGE 14,16 är gjutet (1/3). 15 har behövt stoppa pga demontering', -3, 20, { status: 'pagaende', progress: 10, area: 'PRODUKTION / 742A Krönlinje J', activity: '742A Krönlinje J' }),
  it('Vägg J-linje samt vinkel in till linje-M', 10, 40, { area: 'PRODUKTION / 742A Krönlinje J', activity: '742A Krönlinje J', depends_on: ['i1', 'i2'] }),
  it('Motfyll stödmur', 50, 55, { area: 'PRODUKTION / 742A Krönlinje J', activity: '742A Krönlinje J', depends_on: ['i3'] }),
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);
(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1600 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__states = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]) },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        getObjectBoundingBoxes: () => Promise.resolve([]), getObjectProperties: () => Promise.resolve([]),
        setObjectState: (a, b) => { window.__states.push(b); return Promise.resolve(); }, getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'DELETE') { store.delete(f); return r.fulfill({ status: 200, body: '{}' }); }
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => [...document.querySelectorAll('.dependency-tag')].map(t => ({ txt: t.textContent, cls: t.className, h: t.getBoundingClientRect().height, title: t.title })));
  const subs = await page.evaluate(() => [...document.querySelectorAll('.item-sub')].map(t => t.textContent));
  const v = r.find(x => /Fundament linje J/.test(x.txt)), m = r.find(x => /Vägg J-linje/.test(x.txt));
  if (!v || !/\+1/.test(v.txt) || !/blocked/.test(v.cls) || v.h > 16 || !/• Vägg\/kontrafor/.test(v.title) || !/…/.test(v.txt)) fail('Väntar på – en rad, kortat, +N, rött vid risk: ' + JSON.stringify(r));
  if (!m || !/waiting/.test(m.cls)) fail('Utan risk ska det vara gult: ' + JSON.stringify(m));
  if (subs.some(t => /742A Krönlinje J · 742A Krönlinje J/.test(t))) fail('Området ska inte upprepas: ' + JSON.stringify(subs));
  await page.locator('#itemList').screenshot({ path: path.join(require('os').tmpdir(), 'itemlist_deps.png') });
  console.log('OK: "Väntar på" på en rad (kortat, +N, hela listan i tipsrutan; rött bara vid risk), området upprepas inte');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
