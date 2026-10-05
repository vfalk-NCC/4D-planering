// Funktionstest: inget skrivs över (Victors önskemål 2026-10-05). Den fördröjda sparningen hör till
// rätt plan och sparas klart vid planbyte; kalibrering och PDF-fil i projektet skrivs inte över av en
// enhet med äldre data; borttagna planer återskapas inte; uppladdningar skriver aldrig över en fil.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8988, PID = 'p1';
const store = new Map(), shaOf = new Map();
let shaN = 0;
const put = (f, buf) => { store.set(f, buf); shaOf.set(f, 's' + (++shaN)); }; // som GitHub: varje ändring ger ny sha
const plansPath = `projects/${PID}/status_plans.json`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("ingen pdf")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/repos/vfalk-NCC/4D-data') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') {
      const b = JSON.parse(r.request().postData());
      // Som GitHub: finns filen måste rätt sha skickas (annars skrivkrock 409).
      if (store.has(f) && b.sha !== shaOf.get(f)) return r.fulfill({ status: 409, contentType: 'application/json', body: '{"message":"conflict"}' });
      put(f, Buffer.from(b.content, 'base64'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: shaOf.get(f) } }) });
    }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    const buf = store.get(f);
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: buf.toString('base64'), sha: shaOf.get(f), size: buf.length }) });
  });
  const A = { id: 'A', name: 'Plan A', file_path: 'projects/p1/status_plans/A.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
  const B = { id: 'B', name: 'Plan B', file_path: 'projects/p1/status_plans/B.pdf', zones: [] };
  put(plansPath, Buffer.from(JSON.stringify([A, B])));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
  const server$ = () => JSON.parse(store.get(plansPath).toString());
  // 1) Ändring på A, byt direkt till B: A:s ändring sparas (förr sparades B i stället och A:s ändring försvann).
  await page.evaluate(async () => { plans = JSON.parse(JSON.stringify(plans)); plan = plans.find(p => p.id === 'A'); plan.code_pattern = 'NY-A'; schedulePlanSave(); await openPlan('B'); });
  await page.waitForTimeout(1200);
  if (server$().find(p => p.id === 'A').code_pattern !== 'NY-A') fail('A:s ändring ska sparas innan planbytet: ' + JSON.stringify(server$()));
  // 2) En annan enhet kalibrerar om A; den här enheten (äldre data) ändrar namnet: kalibreringen ligger kvar.
  const s2 = server$(); s2.find(p => p.id === 'A').calib = { model: [[5, 5, 0], [105, 5, 0]], pdf: [[50, 50], [1050, 50]] }; put(plansPath, Buffer.from(JSON.stringify(s2)));
  const loc = await page.evaluate(async () => { const a = JSON.parse(JSON.stringify(plans.find(p => p.id === 'A') || {})); a.id = 'A'; a.name = 'Plan A (nytt namn)'; a.calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] }; a.file_path = 'projects/p1/status_plans/FEL.pdf'; await savePlan(a); return a.calib; });
  const a2 = server$().find(p => p.id === 'A');
  if (a2.calib.model[0][0] !== 5 || a2.name !== 'Plan A (nytt namn)' || loc.model[0][0] !== 5) fail('Projektets kalibrering ska inte skrivas över av äldre data: ' + JSON.stringify({ a2, loc }));
  if (a2.file_path !== 'projects/p1/status_plans/A.pdf') fail('Planens PDF-fil ska aldrig bytas: ' + a2.file_path);
  // 3) Kalibrerad här: får ersätta.
  await page.evaluate(async () => { const a = JSON.parse(JSON.stringify(plans.find(p => p.id === 'A'))); a.calib = { model: [[9, 9, 0], [109, 9, 0]], pdf: [[90, 90], [1090, 90]] }; a._calibSet = true; await savePlan(a); });
  const a3 = server$().find(p => p.id === 'A');
  if (a3.calib.model[0][0] !== 9 || '_calibSet' in a3) fail('En kalibrering gjord här ska sparas: ' + JSON.stringify(a3));
  // 4) Borttagen på en annan enhet: återskapas inte.
  put(plansPath, Buffer.from(JSON.stringify(server$().filter(p => p.id !== 'B'))));
  await page.evaluate(async () => { const b = { id: 'B', name: 'Plan B', file_path: 'x', zones: [] }; await savePlan(b); });
  if (server$().some(p => p.id === 'B')) fail('En borttagen plan ska inte återskapas av en sparning');
  // 5) Uppladdning skriver aldrig över en befintlig fil.
  put('projects/p1/status_plans/A.pdf', Buffer.from('ORIGINAL'));
  const up = await page.evaluate(async () => {
    let refused = null; try { await ghUploadBinary(token, 'projects/p1/status_plans/A.pdf', new Blob(['NY']), 't'); } catch (e) { refused = e.message; }
    const okPath = await ghUploadBinary(token, 'projects/p1/status_plans/NY.pdf', new Blob(['NY']), 't');
    return { refused, okPath };
  });
  if (!/finns redan/.test(up.refused || '') || store.get('projects/p1/status_plans/A.pdf').toString() !== 'ORIGINAL' || up.okPath !== 'projects/p1/status_plans/NY.pdf') fail('Uppladdning får inte skriva över: ' + JSON.stringify(up));
  // 6) Ny plan från fil: egen fil, rör inte de andra planerna.
  const before = server$().map(p => JSON.stringify(p));
  await page.evaluate(async () => { await createPlanFromFile(new File(['%PDF-1.4 ny'], 'Ny ritning.pdf', { type: 'application/pdf' })); });
  await page.waitForTimeout(300);
  const after = server$(), nyp = after.find(p => p.name === 'Ny ritning');
  if (!nyp || !store.has(nyp.file_path) || before.some(b => !after.some(p => JSON.stringify(p) === b))) fail('Ny plan ska bara läggas till, inget annat ändras: ' + JSON.stringify(after));
  if (store.get('projects/p1/status_plans/A.pdf').toString() !== 'ORIGINAL') fail('Ny plan får inte skriva över en annan plans PDF');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: inget skrivs över – sparning vid planbyte, kalibrering och PDF-fil skyddade, borttagna planer återskapas inte, uppladdningar skriver aldrig över');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
