// Funktionstest: dagsplanering i Lägesplan (Victors önskemål 2026-10-01).
// UE-register, lag som placeras/dras på planen och följer datumet, koppling
// till aktiviteter i 4D-planeringen med framdriftsrapportering, krockar
// (zon, avspärrning, lyft utanför kranens räckvidd), kopiering till nästa
// dag (ett ångra-steg), förslag från planeringen, vecka/bemanning, dagblad,
// Excel, fordon som riktiga ritningar och 👷 Dag i fältläget.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8962;
const PID = 'p1';
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const items = [
  { id: 'r1', object_name: 'J14', activity: 'Kontrefor gjutning', area: 'PM12', contractor: 'Armeringsbolaget AB', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 20, source_key: 'k1' },
  { id: 'r2', object_name: 'J15', activity: 'Kontrefor gjutning', area: 'PM12', contractor: 'Armeringsbolaget AB', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 20, source_key: 'k1' },
  { id: 'r3', object_name: 'F1', activity: 'Formning', area: 'PM13', contractor: 'Formbolaget', status: 'planerad', start_date: '2000-01-01', end_date: '2999-01-01', progress: 0, depends_on: ['r9'] },
  { id: 'r9', object_name: 'X', activity: 'Schakt', status: 'planerad', start_date: '2000-01-01', end_date: '2999-01-01', progress: 0 },
];
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify(items)], [`projects/${PID}/status_plans.json`, '[]'],
  [`projects/${PID}/plan_item_positions.json`, JSON.stringify([{ id: 'r1', x: 40, y: 40, z0: 0, z1: 1 }, { id: 'r2', x: 42, y: 40, z0: 0, z1: 1 }])]]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const setup = async (ctx, field) => {
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(f => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); if (f) localStorage.setItem('lagesplan-field', '1'); else localStorage.setItem('lagesplan-field', '0'); }, field);
    await page.route('https://cdnjs.cloudflare.com/**', r => {
      const u = r.request().url();
      if (u.includes('jspdf')) return r.fulfill({ contentType: 'application/javascript', body: `window.__pdf = []; window.jspdf = { jsPDF: function () { const self = this; const rec = (n) => (...a) => { window.__pdf.push([n, ...a]); return self; };
        ['setFillColor','rect','setTextColor','setFont','setFontSize','text','addImage','setDrawColor','setLineWidth','line','addPage'].forEach(n => self[n] = rec(n));
        self.splitTextToSize = (t) => [String(t)]; self.getNumberOfPages = () => 1; self.output = () => new Blob(['pdf']); } };` });
      if (u.includes('xlsx')) return r.fulfill({ contentType: 'application/javascript', body: `window.__xlsx = {}; window.XLSX = { utils: { book_new: () => ({ s: [] }), json_to_sheet: j => ({ j }), aoa_to_sheet: a => ({ a }), book_append_sheet: (wb, s, n) => { wb.s.push(n); window.__xlsx[n] = s; } }, writeFile: (wb, n) => { window.__xlsx.file = n; window.__xlsx.sheets = wb.s; } };` });
      r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = window.pdfjsLib || { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("ingen pdf")) }) };' });
    });
    await page.route('https://api.github.com/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/repos/vfalk-NCC/4D-data') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + Date.now() } }) }); }
      if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
    await page.evaluate(() => {
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      $('empty').classList.add('hidden');
      plan = { id: 'pl', name: 'Plan 1', zones: [{ id: 'z1', code: 'PM12', polys: [[[0, 0], [600, 0], [600, 600], [0, 600]]] }], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
      view.scale = 1; view.tx = 0; view.ty = 0; applyView(); renderZones();
    });
    return { page, errors };
  };
  // Skärmpunkt (i #viewport) för en modellpunkt.
  const screenOf = (page, m) => page.evaluate(m => { const p = mToPx(m); return [view.tx + p[0] * view.scale, view.ty + p[1] * view.scale]; }, m);

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const { page, errors } = await setup(ctx, false);
  const vb = await page.locator('#viewport').boundingBox();
  await page.click('.tabs button[data-tab="day"]');
  if (!(await page.isVisible('#dayPanel'))) fail('Fliken Dag ska visa dagsplaneringen');

  // 1) UE-registret.
  await page.click('details[data-sec="ue"] summary');
  await page.click('#btnUeNew');
  await page.fill('.ue-form .uf-name', 'Armeringsbolaget AB'); await page.fill('.ue-form .uf-short', 'arm');
  await page.fill('.ue-form .uf-contact', 'Kalle'); await page.fill('.ue-form .uf-phone', '070-123 45 67'); await page.fill('.ue-form .uf-persons', '4');
  await page.click('.ue-form .uf-save'); await page.waitForTimeout(150);
  await page.click('#btnUeNew'); await page.fill('.ue-form .uf-name', 'Formbolaget'); await page.fill('.ue-form .uf-short', 'FORM'); await page.click('.ue-form .uf-save'); await page.waitForTimeout(150);
  const reg = await page.evaluate(() => ues().map(u => [u.short, u.name, u.persons, u.color]));
  if (reg.length !== 2 || reg[0][0] !== 'ARM' || reg[0][2] !== 4 || !/^#/.test(reg[0][3])) fail('UE ska sparas med förkortning, standardantal och färg: ' + JSON.stringify(reg));
  if (!/Armeringsbolaget AB/.test(JSON.parse(store.get(`projects/${PID}/site_layers.json`)).map(x => x.name).join())) fail('UE-registret ska sparas i projektet');
  if (!(await page.locator('#dayPanel .dp-uebtn').count())) fail('UE-knapparna ska synas i dagsplaneringen');
  console.log('OK: UE-registret (namn, förkortning, färg, kontakt, telefon, standardantal) sparas i projektet');

  // 2) Placera ett lag: välj UE, klicka på planen.
  const day = await page.evaluate(() => curDay());
  await page.click('#dayPanel .dp-uebtn:has-text("ARM")');
  await page.mouse.click(vb.x + 200, vb.y + 200); await page.waitForTimeout(200);
  let crew = await page.evaluate(() => siteItems.find(x => x.type === 'crew'));
  if (!crew || crew.from !== day || crew.to !== day || crew.persons !== 4 || crew.layer !== 'Dagsplanering') fail('Laget ska placeras för dagen med UE:ns standardantal: ' + JSON.stringify(crew));
  if (Math.abs(crew.pts[0][0] - 20) > 0.5 || Math.abs(crew.pts[0][1] - 20) > 0.5) fail('Laget ska hamna där man klickade: ' + JSON.stringify(crew.pts));
  if (!(await page.isVisible('#sitePop .dp-persons'))) fail('Redigeringsrutan för laget ska öppnas');
  await page.fill('#sitePop .dp-persons', '5'); await page.fill('#sitePop .dp-task', 'Armering bjälklag');
  await page.click('#sitePop .dp-save'); await page.waitForTimeout(150);
  crew = await page.evaluate(() => siteItems.find(x => x.type === 'crew'));
  if (crew.persons !== 5 || crew.task !== 'Armering bjälklag') fail('Personer och arbetsuppgift ska sparas');
  console.log('OK: lag placeras med ett klick, gäller dagen och får personer/arbetsuppgift');

  // 3) Dra laget med musen – sparas och kan ångras.
  const [sx, sy] = await screenOf(page, crew.pts[0]);
  await page.mouse.move(vb.x + sx, vb.y + sy); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(vb.x + sx + k * 10, vb.y + sy + k * 5);
  await page.mouse.up(); await page.waitForTimeout(200);
  const moved = await page.evaluate(() => siteItems.find(x => x.type === 'crew').pts[0]);
  if (Math.abs(moved[0] - 28) > 0.6 || Math.abs(moved[1] - 24) > 0.6) fail('Laget ska gå att dra: ' + JSON.stringify(moved));
  const saved = JSON.parse(store.get(`projects/${PID}/site_layers.json`)).find(x => x.type === 'crew');
  if (Math.abs(saved.pts[0][0] - 28) > 0.6) fail('Flytten ska sparas direkt');
  await page.evaluate(() => undoSite()); await page.waitForTimeout(150);
  if (Math.abs((await page.evaluate(() => siteItems.find(x => x.type === 'crew').pts[0][0])) - 20) > 0.5) fail('Flytten ska gå att ångra');
  console.log('OK: laget dras med musen, sparas direkt och kan ångras');

  // 4) Datum: laget syns bara sin dag.
  const vis = await page.evaluate(d => { const x = siteItems.find(y => y.type === 'crew'); const a = siteShown(x); $('dateInput').value = nextWorkday(d); const b = siteShown(x); $('dateInput').value = d; return [a, b]; }, day);
  if (!vis[0] || vis[1]) fail('Laget ska bara synas den dag det gäller: ' + JSON.stringify(vis));
  console.log('OK: laget följer datumet (syns bara sin dag)');

  // 5) Krockar: annan UE i samma zon (varning), i avspärrning (krock), lyft utanför kranens räckvidd (krock).
  await page.evaluate(d => {
    const form = ues().find(u => u.short === 'FORM');
    siteItems.push({ id: 'c2', type: 'crew', ue: form.id, pts: [[30, 30]], from: d, to: d, layer: 'Dagsplanering' });
    siteItems.push({ id: 'b1', type: 'barrier', name: 'Gjutning', pts: [[25, 25], [35, 25], [35, 35], [25, 35]] });
    siteItems.push({ id: 'k1', type: 'crane', name: 'Kran 1', pts: [[0, 0]], chart: '20:5, 40:2' });
    siteItems.push({ id: 'l1', type: 'lift', pts: [[50, 0]], crane: 'k1', load: '3', time: '08:00', what: 'Takstolar', from: d, to: d, zone: 5 });
    siteItems.push({ id: 'l2', type: 'lift', pts: [[30, 0]], crane: 'k1', load: '3', time: '09:00', what: 'Korg', from: d, to: d, zone: 5 });
    renderZones(); renderDayAll(true);
  }, day);
  const iss = await page.evaluate(d => computeDailyIssues(d).list.map(i => i.sev + ': ' + i.text), day);
  const has = re => iss.some(t => re.test(t));
  if (!has(/^varning: ARM och FORM i samma zon \(PM12\)/)) fail('Två UE i samma zon ska ge en varning: ' + JSON.stringify(iss));
  if (!has(/^krock: FORM står i avspärrningen Gjutning/)) fail('Lag i avspärrning ska ge en krock: ' + JSON.stringify(iss));
  if (!has(/^krock: Lyftet 08:00.*utanför räckvidden/)) fail('Lyft utanför kranens räckvidd ska ge en krock: ' + JSON.stringify(iss));
  if (!has(/^krock: Lyftet 09:00.*för tungt: 3 t, Kran 1 klarar 2 t/)) fail('För tungt lyft för radien ska ge en krock: ' + JSON.stringify(iss));
  if (!has(/^varning: ARM inom räckvidden för Kran 1 – lyft bokat 08:00, 09:00/)) fail('Lag inom kranens räckvidd när lyft är bokat ska ge en varning: ' + JSON.stringify(iss));
  if (!/krock/.test(await page.textContent('#dayPanel .dp-issbtn'))) fail('Antalet krockar ska synas i panelen');
  if ((await page.locator('#dayPanel .dp-isslist .dp-iss.krock').count()) < 3) fail('Krockarna ska listas');
  console.log('OK: krockar och varningar (samma zon, avspärrning, kranens räckvidd/kapacitet, lag nära lyft)');

  // 6) Koppla en aktivitet, rapportera framdrift -> plan_items.json.
  await page.evaluate(() => { selectedSiteId = null; openDailyPop(siteItems.find(x => x.type === 'crew' && x.id !== 'c2'), false); });
  await page.fill('#sitePop .dp-actq', 'kontrefor'); await page.waitForTimeout(80);
  await page.click('#sitePop .dp-actopt'); await page.waitForTimeout(150);
  if ((await page.evaluate(() => siteItems.find(x => x.type === 'crew' && x.id !== 'c2').act)) !== 's:k1') fail('Aktiviteten ska kopplas till laget');
  if (!(await page.isVisible('#sitePop .dp-progr'))) fail('Framdriften ska gå att rapportera från laget');
  await page.$eval('#sitePop .dp-progr', el => { el.value = 60; el.dispatchEvent(new Event('input')); });
  await page.click('#sitePop .dp-progsave'); await page.waitForTimeout(400);
  const pi = JSON.parse(store.get(`projects/${PID}/plan_items.json`));
  if (pi.find(r => r.id === 'r1').progress !== 60 || pi.find(r => r.id === 'r2').progress !== 60 || pi.find(r => r.id === 'r3').progress !== 0) fail('Framdriften ska sparas på alla objekt i aktiviteten (och bara dem): ' + JSON.stringify(pi.map(r => [r.id, r.progress])));
  if (!/60 % sparat/.test(await page.textContent('#sitePop .dp-progmsg'))) fail('Bekräftelse ska visas efter rapporten');
  const log = await page.evaluate(() => siteItems.find(x => x.type === 'crew' && x.id !== 'c2').log);
  if (!log || log[0].p !== 60) fail('Rapporten ska loggas på laget (historik)');
  await page.click('#sitePop .dp-done'); await page.waitForTimeout(400);
  const pi2 = JSON.parse(store.get(`projects/${PID}/plan_items.json`)).find(r => r.id === 'r1');
  if (pi2.status !== 'klar' || pi2.progress !== 100 || !pi2.actual_end_date) fail('✓ Klar ska klarmarkera aktiviteten: ' + JSON.stringify(pi2));
  await page.click('#sitePop .dp-cancel');
  console.log('OK: aktivitet kopplas till laget, framdrift och klarmarkering sparas i 4D-planeringen');

  // 7) Beroende som inte är klart ger varning.
  await page.evaluate(() => { const c = siteItems.find(x => x.id === 'c2'); c.act = 'i:r3'; });
  if (!(await page.evaluate(d => computeDailyIssues(d).list.some(i => /väntar på Schakt/.test(i.text)), day))) fail('Aktivitet som väntar på något ska ge en varning');
  console.log('OK: beroenden som inte är klara varnar');

  // 8) Kopiera dagen till nästa arbetsdag – ett steg att ångra.
  const before = await page.evaluate(() => siteItems.filter(x => ['crew', 'delivery', 'lift'].includes(x.type)).length);
  await page.click('#dayPanel [data-copyday]'); await page.waitForTimeout(300);
  const next = await page.evaluate(d => nextWorkday(d), day);
  const after = await page.evaluate(n => siteItems.filter(x => ['crew', 'delivery', 'lift'].includes(x.type) && x.from === n).length, next);
  if (after !== before) fail(`Alla ${before} poster ska kopieras till ${next}, fick ${after}`);
  if (!(await page.evaluate(n => siteItems.filter(x => x.type === 'crew' && x.from === n).every(x => x.actual == null && !x.log), next))) fail('Kopian ska inte ta med utfall och framdriftslogg');
  await page.click('#dayPanel [data-copyday]'); await page.waitForTimeout(300);
  if ((await page.evaluate(n => siteItems.filter(x => x.from === n).length, next)) !== after) fail('En andra kopiering ska inte skapa dubbletter');
  await page.evaluate(() => undoSite()); await page.waitForTimeout(300);
  if ((await page.evaluate(n => siteItems.filter(x => x.from === n).length, next)) !== 0) fail('Kopieringen ska ångras i ett steg');
  if ((JSON.parse(store.get(`projects/${PID}/site_layers.json`)).filter(x => x.from === next)).length !== 0) fail('Ångrad kopiering ska sparas');
  console.log('OK: Kopiera → nästa arbetsdag, inga dubbletter, ångras i ett steg');

  // 9) Förslag från 4D-planeringen: placera vid aktivitetens 3D-objekt.
  await page.evaluate(() => { selectedSiteId = null; siteItems = siteItems.filter(x => !(x.type === 'crew' && x.act)); renderDayAll(true); });
  const rows = await page.locator('#daySugg .dp-srow').count();
  if (!rows) fail('Aktiviteter som pågår ska föreslås');
  const formRow = page.locator('#daySugg .dp-srow', { hasText: 'Formning' });
  if (!(await formRow.count())) fail('Formning ska föreslås');
  const kRow = page.locator('#daySugg .dp-srow', { hasText: 'Schakt' });
  await kRow.locator('.dp-sue').selectOption({ label: await page.evaluate(() => { const u = ues().find(x => x.short === 'FORM'); return `${u.short} – ${u.name}`; }) });
  await kRow.locator('.dp-splace').click(); await page.waitForTimeout(150);
  // Schakt saknar 3D-position: placeras genom att klicka.
  await page.mouse.click(vb.x + 500, vb.y + 300); await page.waitForTimeout(200);
  const sc = await page.evaluate(() => siteItems.find(x => x.type === 'crew' && x.act === 'i:r9'));
  if (!sc || Math.abs(sc.pts[0][0] - 50) > 0.6) fail('Förslag utan 3D-position ska placeras med ett klick: ' + JSON.stringify(sc));
  await page.click('#sitePop .dp-cancel').catch(() => {});
  // Kontrefor (k1) är klarmarkerad nu – sätt tillbaka framdriften och placera via 3D-positionen.
  await page.evaluate(() => { items.forEach(r => { if (r.source_key === 'k1') { r.status = 'pagaende'; r.progress = 50; r.actual_end_date = null; } }); renderDayAll(true); });
  const kont = page.locator('#daySugg .dp-srow', { hasText: 'Kontrefor' });
  if ((await kont.locator('.dp-sue').inputValue()) !== (await page.evaluate(() => ues().find(x => x.short === 'ARM').id))) fail('UE ska föreslås efter entreprenören i 4D-planeringen');
  await kont.locator('.dp-splace').click(); await page.waitForTimeout(200);
  const kc = await page.evaluate(() => siteItems.find(x => x.type === 'crew' && x.act === 's:k1'));
  if (!kc || Math.abs(kc.pts[0][0] - 41) > 0.1 || Math.abs(kc.pts[0][1] - 40) > 0.1 || kc.task !== 'Kontrefor gjutning') fail('Förslaget ska placeras mitt i aktivitetens 3D-objekt: ' + JSON.stringify(kc));
  await page.click('#sitePop .dp-cancel');
  if (!(await page.locator('#daySugg .dp-srow.placed', { hasText: 'Kontrefor' }).count())) fail('Placerade förslag ska markeras');
  console.log('OK: förslag från 4D-planeringen (UE efter entreprenör, placeras vid 3D-objekten eller med klick)');

  // 10) Leverans med fordonsritning + lyft placeras via knapparna.
  await page.click('#dayPanel [data-place-veh="pumpbil"]');
  await page.mouse.click(vb.x + 700, vb.y + 500); await page.waitForTimeout(150);
  const dv = await page.evaluate(() => siteItems.find(x => x.type === 'delivery'));
  if (!dv || dv.veh !== 'pumpbil' || dv.w !== 2.55 || dv.h !== 12) fail('Leveransen ska få fordonets mått: ' + JSON.stringify(dv));
  await page.fill('#sitePop .dp-what', 'Pump till bjälklag'); await page.fill('#sitePop .dp-time', '06:30'); await page.click('#sitePop .dp-save'); await page.waitForTimeout(150);
  if ((await page.evaluate(() => siteItems.find(x => x.type === 'delivery').time)) !== '06:30') fail('Leveransens tid ska sparas');
  const handles = await page.evaluate(() => siteHandles(siteItems.find(x => x.type === 'delivery'), 16, 10).map(h => h.kind));
  if (JSON.stringify(handles) !== '["rotate"]') fail('Fordon ska bara kunna vridas (fasta mått): ' + JSON.stringify(handles));
  // Fordonen ritas utan fel – både leveranser och symbolerna under Etablering.
  await page.evaluate(() => { Object.keys(VEHICLES).forEach((k, i) => siteItems.push({ id: 'sym' + i, type: 'symbol', sym: k, cx: 10 + i * 6, cy: 70, w: VEHICLES[k].w, h: VEHICLES[k].h, rot: 0.3 })); renderZones(); });
  console.log('OK: leverans med fordon (mått, tid, bara vridning) och alla fordon ritas');

  // 11) Vecka, historik, dagblad och Excel.
  await page.click('details[data-sec="dayweek"] summary'); await page.waitForTimeout(150);
  if (!(await page.locator('#dayWeek table.wk tbody tr').count())) fail('Veckovyn ska visa bemanningen per UE');
  const expect = await page.evaluate(d => String(dayItems(d, new Set(['crew'])).reduce((a, x) => a + (Number(x.persons) || 0), 0)), day);
  if (!(await page.textContent('#dayWeek table.wk tfoot tr:first-child td.cur')).includes(expect)) fail('Bemanningen ska summeras per dag (' + expect + ')');
  await page.click('details[data-sec="dayhist"] summary'); await page.waitForTimeout(150);
  if (!(await page.locator('#dayHist .hist-day').count())) fail('Historiken ska visa dagarna');
  await page.evaluate(() => { renderMapCanvas = async () => { const c = document.createElement('canvas'); c.width = 10; c.height = 10; return c; }; downloadBlob = (b, n) => { window.__dl = n; }; });
  await page.click('#dayPanel [data-sheet]'); await page.waitForTimeout(500);
  const pdf = await page.evaluate(() => ({ dl: window.__dl, texts: (window.__pdf || []).filter(c => c[0] === 'text').map(c => [].concat(c[1]).join(' ')) }));
  if (!pdf.dl || !/^Dagblad /.test(pdf.dl)) fail('Dagbladet ska sparas som PDF: ' + JSON.stringify(pdf.dl));
  const T = pdf.texts.join('\n');
  if (!/DAGSPLANERING/.test(T) || !/Leveranser/.test(T) || !/Lyft/.test(T) || !/Risker och krockar/.test(T) || !/Kalle/.test(T) || !/070-123 45 67/.test(T) || !/KROCK/.test(T)) fail('Dagbladet ska ha rubrik, leveranser, lyft, risker och lagens kontakter: ' + T.slice(0, 600));
  if (/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(T)) fail('Dagbladet får bara innehålla tecken som PDF-typsnittet klarar');
  await page.click('#dayPanel [data-xlsx]'); await page.waitForTimeout(400);
  const x = await page.evaluate(() => window.__xlsx);
  if (!x || !/^Dagsplanering vecka/.test(x.file) || !x.sheets.includes('Bemanning') || !x.sheets.includes('Krockar')) fail('Veckan ska exporteras till Excel: ' + JSON.stringify(x && x.sheets));
  console.log('OK: veckovy med bemanning, historik, dagblad (PDF) och Excel-export');

  // 11b) Utseende på lagen, 🗑 i listan och Delete-tangenten.
  const w0 = await page.evaluate(() => { const x = siteItems.find(y => y.type === 'crew' && siteShown(y)); return dailyBoxes.get(x.id)[0].w; });
  await page.evaluate(() => { const d = document.querySelector('#dayPanel .dp-look'); d.open = true; });
  await page.$eval('#dayPanel [data-look="crewScale"]', el => { el.value = 200; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.$eval('#dayPanel [data-look="crewOpacity"]', el => { el.value = 50; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300);
  const w1 = await page.evaluate(() => { renderZones(); const x = siteItems.find(y => y.type === 'crew' && siteShown(y)); return dailyBoxes.get(x.id)[0].w; });
  if (!(w1 > w0 * 1.6)) fail(`Storleken ska göra lagen större (${w0} -> ${w1})`);
  const ds = JSON.parse(store.get(`projects/${PID}/site_layers.json`)).find(x => x.type === 'dayset');
  if (!ds || ds.crewScale !== 2 || ds.crewOpacity !== 0.5) fail('Storlek och opacitet ska sparas i projektet: ' + JSON.stringify(ds));
  await page.$eval('#dayPanel [data-uecolor]', el => { el.value = '#ff00aa'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => ues().some(u => u.color === '#ff00aa')))) fail('Färgen ska kunna ändras per UE i panelen');
  const nCrew = () => page.evaluate(d => dayItems(d, new Set(['crew'])).length, day);
  const all0 = await page.evaluate(d => dayItems(d).length, day);
  await page.locator('#dayPanel .dp-row .dp-rowdel').first().click(); await page.waitForTimeout(200);
  const total0 = await page.evaluate(d => dayItems(d).length, day);
  if (total0 !== all0 - 1) fail(`🗑 ska ta bort raden (${all0} -> ${total0})`);
  await page.evaluate(() => undoSite()); await page.waitForTimeout(200);
  if ((await page.evaluate(d => dayItems(d).length, day)) !== total0 + 1) fail('🗑 ska gå att ångra');
  // Klicka på ett lag på planen och tryck Delete.
  const tgt = await page.evaluate(d => { const x = dayItems(d, new Set(['crew']))[0]; const p = mToPx(x.pts[0]); return { id: x.id, p: [view.tx + p[0] * view.scale, view.ty + p[1] * view.scale] }; }, day);
  await page.mouse.click(vb.x + tgt.p[0], vb.y + tgt.p[1]); await page.waitForTimeout(200);
  if ((await page.evaluate(() => selectedSiteId)) !== tgt.id) fail('Klick ska markera laget');
  await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  if (await page.evaluate(id => siteItems.some(x => x.id === id), tgt.id)) fail('Delete ska ta bort det markerade laget');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  if (!(await page.evaluate(id => siteItems.some(x => x.id === id), tgt.id))) fail('Ctrl+Z ska ta tillbaka laget');
  console.log('OK: storlek, opacitet och färg på lagen; 🗑 i listan och Delete tar bort (kan ångras)');

  // 12) Fältläge: 👷 Dag med stora knappar.
  const fctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  const f = await setup(fctx, true);
  if (!(await f.page.evaluate(() => document.body.classList.contains('field')))) fail('Fältläget ska vara på');
  await f.page.click('#btnFieldDay'); await f.page.waitForTimeout(150);
  if (!(await f.page.isVisible('#fieldDayBody .dp-uebtn'))) fail('👷 Dag ska visa UE-knapparna i fältläget');
  const bh = await f.page.locator('#fieldDayBody .dp-uebtn').first().boundingBox();
  if (bh.height < 40) fail('Knapparna i fältläget ska vara stora');
  await f.page.locator('#fieldDayBody .dp-uebtn').first().click(); await f.page.waitForTimeout(100);
  if (await f.page.isVisible('#fieldDay')) fail('Panelen ska stängas när man ska placera på planen');
  if (!(await f.page.isVisible('#fieldTools'))) fail('Verktygsraden ska visa hur man placerar');
  console.log('OK: fältläget har 👷 Dag med stora knappar');

  const allErr = [...errors, ...f.errors];
  if (allErr.length) fail('Fel i sidan: ' + allErr.join(' | '));
  await browser.close(); server.close();
  console.log('Alla tester för dagsplaneringen gick igenom');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
