// 3D-editorn: direktmodifiering som i Tekla – handtag för längd/bredd/höjd (motsatt sida står kvar,
// fäster mot hörn och steget, Esc avbryter, ett ångra-steg per drag), kranens räckvidd och staketets
// punkter (flytta, lägga till med plus, ta bort med dubbelklick).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 18987;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  const C = (id, x, y, name) => ({ id, type: 'container', name, x, y, z: 0, L: 6, B: 2, H: 2, rot: 0, dz: 0, color: '#2563eb' });
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([C('a', 6512320, 150110, 'Container 1'), C('c', 6512335, 150110, 'Container 3'),
    { id: 'k', type: 'tornkran', name: 'Tornkran 1', x: 6512320, y: 150140, z: 0, L: 1.6, B: 1.6, H: 40, R: 20, rot: 0, dz: 0, color: '#facc15' },
    { id: 'f', type: 'staket', name: 'Staket 1', x: 6512340, y: 150130, z: 0, H: 2, dz: 0, color: '#16a34a', pts: [[6512340, 150130, 0], [6512350, 150130, 0], [6512350, 150140, 0]] }]), sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const getStore = f => { const e = store.get(`projects/p1/${f}`); return e ? JSON.parse(e.content) : null; };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2020-01-01', end_date: '2030-12-01', status: 'pagaende', progress: 40 },
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512350, y: 150125, z0: 0, z1: 14, x0: 6512345, x1: 6512355, y0: 150120, y1: 150130 },
      { id: 'i2', x: 6512380, y: 150125, z0: 0, z1: 3, x0: 6512378, x1: 6512382, y0: 150123, y1: 150127 },
    ];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    askOpener = async (type, extra) => { window.__calls.push(type); return type === 'placeSaveIfc' ? { n: 2, files: ['Etablering x.ifc'] } : {}; };

  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.placeMeshes.size === 4, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  const at = async (x, y, z) => { const q = await page.evaluate(([x, y, z]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2])); return [q.x, q.y]; }, [x, y, z]); return [cv.x + q[0], cv.y + q[1]]; };
  const P = id => page.evaluate(id => JSON.parse(JSON.stringify(placements.find(x => x.id === id))), id);
  const view = () => page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512335 - l3.O[0], 150125 - l3.O[1], 0); l3.camera.position.set(c.x - 20, c.y - 45, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); l3HandlesPos(); });
  const hd = async k => { const b = await page.locator(`.v3-hds [data-k="${k}"]`).boundingBox(); if (!b) fail('Handtag ' + k + ' syns inte'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const dragTo = async (from, to, opts = {}) => {
    await page.mouse.move(from[0], from[1]); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8); await page.waitForTimeout(20); }
    if (opts.esc) { await page.keyboard.press('Escape'); await page.waitForTimeout(50); }
    await page.mouse.up(); await page.waitForTimeout(120);
  };
  await page.evaluate(() => { document.getElementById('v3Step').value = '0.5'; l3ApplyStep(); });
  await view();
  const r = await page.evaluate(async () => {
    const o = l3bRecolor; l3bRecolor = opts => opts && opts.async ? (async () => { for (let i = 1; i <= 10; i++) { if (opts.cancelled()) return false; opts.onProg(i / 10); await new Promise(r => setTimeout(r, 70)); } return true; })() : o(opts);
    const sl = document.getElementById('v3DSlider'), seen = [], labs = new Set();
    const timer = setInterval(() => { const b = document.querySelector('.v3-dsl-prog'), l = document.querySelector('.v3-dsl-lab'); if (b) seen.push(parseInt(b.style.width) || 0); if (l && l.textContent) labs.add(l.textContent.replace(/\d+ %/, 'N %')); }, 40);
    const d0 = $('dateInput').value; sl.value = Number(sl.value) + 5; sl.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 1500)); clearInterval(timer);
    const b = document.querySelector('.v3-dsl-prog');
    return { changed: $('dateInput').value !== d0, date: l3.date === $('dateInput').value, max: Math.max(...seen), mid: seen.filter(x => x > 10 && x < 90).length, labs: [...labs], op: b && b.style.opacity };
  });
  if (!r.changed || !r.date || r.max < 95 || r.mid < 2 || !r.labs.some(x => /Färgar byggnaden/.test(x)) || r.op !== '0') fail('Förloppsstapel vid tidsreglaget: ' + JSON.stringify(r));
  console.log('OK test_lagesplan_3dsync – förloppsstapeln fylls på och tonas ut', JSON.stringify(r));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
