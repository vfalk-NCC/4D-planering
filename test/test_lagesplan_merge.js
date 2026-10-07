// Säker sparning från flera enheter (Victor 2026-10-07: stabilitet): ändrar någon annan planen
// (t.ex. Lägesplan på iPaden) slås ändringarna ihop per zon i stället för att den som sparar sist
// skriver över den andras zoner.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8995;
// Attrapp av pdf.js: plan A ritar en blå ruta, plan B en röd ruta på samma ställe (140–160).
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
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  let answer = ''; const dlgs = []; page.on('dialog', d => { dlgs.push(d.message()); d.type() === 'prompt' ? d.accept(answer) : d.accept(); });
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // Lagringen: status_plans.json i minnet.
  const store = new Map(); let n = 0;
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'PUT') { const b = JSON.parse(req.postData() || '{}'); if (e && b.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' }); const sha = 's' + (++n); store.set(f, { content: Buffer.from(b.content, 'base64').toString('utf8'), sha }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) }); }
    r.fulfill({ status: 404, body: '{}' });
  });
  const saved = () => JSON.parse([...store.entries()].find(([k]) => k.endsWith('status_plans.json'))[1].content)[0];
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  // Del 1: sammanslagningen (rena funktioner).
  const M = require('../docs/lagesplan-merge.js');
  {
    const z = (id, name, x = 0) => ({ id, code: id, name, polys: [[[x, 0], [x + 1, 0], [x + 1, 1]]] });
    const base = { id: 'A', name: 'Plan', calib: 1, zones: [z('a', 'A'), z('b', 'B'), z('c', 'C')], wbs: { K: { style: { fill: 'x' } } } };
    const ours = { ...base, name: 'Plan (ny)', zones: [z('a', 'A2'), z('b', 'B'), z('d', 'D')], updated_at: 'u2' };      // ändrade a, tog bort c, nya d
    const theirs = { ...base, calib: 2, zones: [z('a', 'A'), z('b', 'B3'), z('c', 'C'), z('e', 'E')], wbs: { K: { style: { fill: 'y' } }, L: { style: {} } } }; // ändrade b, nya e, kalibrering, wbs
    const { rec, conflicts } = M.mergePlanRecord(base, ours, theirs);
    const names = rec.zones.map(x => x.name).join(',');
    if (names !== 'A2,B3,E,D' || rec.name !== 'Plan (ny)' || rec.calib !== 2 || rec.wbs.K.style.fill !== 'y' || !rec.wbs.L || conflicts !== 0 || rec.updated_at !== 'u2') fail('Sammanslagning: ' + JSON.stringify({ names, rec, conflicts }));
    // Båda ändrade samma zon: vår gäller. Vi tog bort, de ändrade: deras ändring behålls.
    const r2 = M.mergePlanRecord(base, { ...base, zones: [z('a', 'Vår'), z('b', 'B')] }, { ...base, zones: [z('a', 'Deras'), z('b', 'B'), z('c', 'C ändrad')] });
    if (r2.rec.zones.map(x => x.name).join(',') !== 'Vår,B,C ändrad' || r2.conflicts !== 1) fail('Konflikter: ' + JSON.stringify(r2));
    console.log('OK: sammanslagningen – per zon, borttaget/ändrat, konflikt (vår gäller), övriga fält och överzoner');
  }
  // Del 2: i appen – en annan enhet sparar medan planen är öppen här.
  const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
  await page.evaluate(async ({ a, b }) => {
    const O = [6512300, 150100];
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[O[0], O[1], 0], [O[0] + 100, O[1], 0]], pdf: [[0, 0], [1000, 0]] },
      zones: [{ id: 'z1', code: '7411', name: 'Ett', polys: a }, { id: 'z2', code: '7412', name: 'Två', polys: b }] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    await ghWriteJSON(token, dataPath('status_plans.json'), () => JSON.parse(JSON.stringify(plans)), 'test');
    planBaseSet(plans);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
  }, { a: sq(100, 100, 200, 200), b: sq(300, 100, 400, 200) });
  // Den andra enheten: byter namn på z2 och lägger till z3 direkt i filen.
  const key = [...store.keys()].find(k => k.endsWith('status_plans.json'));
  const other = JSON.parse(store.get(key).content);
  other[0].zones[1].name = 'Två (iPad)'; other[0].zones.push({ id: 'z3', code: '7413', name: 'Tre (iPad)', polys: sq(500, 100, 600, 200) });
  store.set(key, { content: JSON.stringify(other), sha: 'other' });
  // Här: ändrar z1 och sparar.
  const r = await page.evaluate(async () => {
    plan.zones.find(z => z.id === 'z1').name = 'Ett (dator)';
    await savePlan();
    return { mem: plan.zones.map(z => z.name), status: $('saveStatus').textContent, inList: plans[0] === plan };
  });
  const s1 = saved();
  const names = s1.zones.map(z => z.name).join(',');
  if (names !== 'Ett (dator),Två (iPad),Tre (iPad)') fail('Båda enheternas ändringar ska finnas i filen: ' + names);
  if (JSON.stringify(s1).includes('_status') || JSON.stringify(s1).includes('"_')) fail('Tillfälliga fält (_status) ska inte sparas');
  if (r.mem.join(',') !== 'Ett (dator),Två (iPad),Tre (iPad)' || !/lagts ihop/.test(r.status) || !r.inList) fail('Planen här ska visa det sammanslagna: ' + JSON.stringify(r));
  // Nästa sparning: inget slås ihop i onödan och iPadens zoner ligger kvar.
  await page.evaluate(async () => { plan.zones.find(z => z.id === 'z2').name = 'Två (dator)'; await savePlan(); });
  const s2 = saved();
  if (s2.zones.map(z => z.name).join(',') !== 'Ett (dator),Två (dator),Tre (iPad)') fail('Andra sparningen: ' + JSON.stringify(s2.zones.map(z => z.name)));
  // Den andra enheten tar bort z3 – här har vi inte rört den: den ska vara borta efter vår sparning.
  const o2 = JSON.parse(store.get(key).content); o2[0].zones = o2[0].zones.filter(z => z.id !== 'z3'); store.set(key, { content: JSON.stringify(o2), sha: 'other2' });
  await page.evaluate(async () => { plan.name = 'Plan 1 (nytt namn)'; await savePlan(); });
  const s3 = saved();
  if (s3.zones.map(z => z.id).join(',') !== 'z1,z2' || s3.name !== 'Plan 1 (nytt namn)' || (await page.evaluate(() => plan.zones.length)) !== 2) fail('Borttagen på andra enheten: ' + JSON.stringify(s3.zones.map(z => z.id)));
  console.log('OK: i appen – en annan enhets zonändringar slås ihop i stället för att skrivas över, och syns direkt här');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
