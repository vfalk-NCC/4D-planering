// 4D-ID och namn från 4D vid import (Victors önskemål 2026-10-05): raden bär aktivitetens id
// i Excels kolumn "4D-ID" och känns igen även om den bytt namn i Excel. Ett namn som ändrats i
// 4D (aktivitet eller fas) behålls när Excel-raden är oförändrad sedan förra importen. Ett id
// som förekommer två gånger (kopierad rad) gäller bara den första raden.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8961;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
const SH = '745 - FÖRTJOCKARHUS';
// Excel-läsaren (SheetJS-adaptern): kolumnen "4D-ID" hittas på sin rubrik på rad 4.
{
  const col = c => { let s = ''; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  global.XLSX = { utils: { encode_cell: ({ r, c }) => col(c) + (r + 1), decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 5, c: 20 } }) } };
  const { buildPlanRowsFromSheet } = require('../docs/plan-excel-parser.js');
  const rows = buildPlanRowsFromSheet({ '!ref': 'A1:U6', T4: { v: '4D-ID' }, C6: { v: 'K10 - Pelare' }, T6: { v: 'b1' } });
  if (!rows.ids || rows.ids[5] !== 'b1' || rows.ids[4] !== null) { console.error('FEL: 4D-ID-kolumnen ska läsas: ' + JSON.stringify(rows.ids)); process.exit(1); }
  const none = buildPlanRowsFromSheet({ '!ref': 'A1:U6', C6: { v: 'K10' } });
  if (none.ids) { console.error('FEL: utan kolumnen ska inga id läsas'); process.exit(1); }
  delete global.XLSX;
  console.log('OK: Excel-läsaren hittar kolumnen 4D-ID på dess rubrik');
}
const SHX = '745 - FÖRTJOCKARHUS';
const map = (row, text, phase = null) => ({ row, text, phase });
put('plan_items.json', [
  // M30 med två faser – fasen Grovbetong har döpts om i 4D.
  { ...base, id: 'a1', model_id: 'm1', object_id: '30', object_name: 'M30', activity: 'Fundament', area: SHX + ' / Linje M', source_key: SHX + '||Linje M||M30||Fundament', excel_sheet: SHX, excel_map: [map(6, 'M30 - Fundament'), map(7, 'Grovbetong', 'Grovbetong'), map(8, 'Gjutning', 'Gjutning')] },
  // K10 – aktiviteten har döpts om i 4D (Excel oförändrad).
  { ...base, id: 'b1', model_id: 'm1', object_id: '40', object_name: 'K10', activity: 'Pelare NY', area: SHX + ' / Linje K', source_key: SHX + '||Linje K||K10', excel_sheet: SHX, excel_map: [map(10, 'K10 - Pelare')] },
  // Städning – döpt om i Excel till Slutstädning, raden har 4D-ID c1.
  { ...base, id: 'c1', model_id: 'm1', object_id: '41', object_name: 'Städning', activity: 'Städning', area: SHX + ' / Linje K', source_key: SHX + '||Linje K||Städning', excel_sheet: SHX, excel_map: [map(11, 'Städning')] },
]);
put('plan_item_activities.json', [
  { id: 'x1', plan_item_id: 'a1', project_id: PID, name: 'Grovbetong 4D-namn', progress: 20 },
  { id: 'x2', plan_item_id: 'a1', project_id: PID, name: 'Gjutning', progress: 0 },
]);
put('plan_item_comments.json', [{ id: 'cm', plan_item_id: 'c1', project_id: PID, text: 'kvar?', author: 'V', created_at: '2026-10-01T09:00:00Z' }]);

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
  let answers = [];                 // svar på kommande confirm-dialoger (true/false)
  const asked = [];
  page.on('dialog', d => { asked.push(d.message()); const a = answers.length ? answers.shift() : true; a ? d.accept() : d.dismiss(); });
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__sel = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]) },
      viewer: {
        getSelection: () => Promise.resolve(window.__sel), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: (m, ids) => Promise.resolve(ids.map(id => ({ id, product: { name: 'Objekt ' + id } }))),
        setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
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
  const res = await page.evaluate(() => {
    const SH = '745 - FÖRTJOCKARHUS';
    const R = (b, c, k) => { const r = []; r[1] = b; r[2] = c; r[5] = '2026-10-12'; r[8] = '2026-10-22'; r[7] = 11; r[10] = k; r[13] = 0.5; return r; };
    const rows = [[], [], [], [],
      R('Linje M', 'Linje M', null), R(null, 'M30 - Fundament', 'DP2'), R(null, 'Grovbetong', 'DP2'), R(null, 'Gjutning', 'DP2'),
      R('Linje K', 'Linje K', null), R(null, 'K10 - Pelare', 'DP2'), R(null, 'Slutstädning', 'DP2'), R(null, 'Slutstädning kopia', 'DP2')];
    rows.levels = [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
    rows.ids = [null, null, null, null, null, 'a1', 'a1#1', 'a1#2', null, 'b1', 'c1', 'c1'];
    const parsed = parsePlanSheet(rows, SH);
    const diff = buildPlanImportDiff(parsed);
    window.__diff = diff;
    return {
      ids: parsed.map(p => p.objectName + '=' + p.id4d),
      via: diff.matched.filter(m => m.viaId).map(m => m.existing.id).sort(),
      create: diff.toCreate.map(m => m.parsed.objectName), removed: diff.removedExisting.map(it => it.id),
      renames: diff.renames.map(r => r.from + '->' + r.to), kept: diff.kept4d.map(k => k.code + ':' + k.name + ':' + k.phases),
    };
  });
  if (res.ids.join(',') !== 'M30=a1,K10=b1,Slutstädning=c1,Slutstädning kopia=c1') fail('4D-ID ska läsas från kolumnen: ' + JSON.stringify(res));
  if (res.via.join(',') !== 'a1,b1,c1') fail('Raderna med 4D-ID ska matchas på id: ' + JSON.stringify(res));
  if (res.create.join(',') !== 'Slutstädning kopia' || res.removed.length) fail('Kopierad rad (samma id) blir ny, inget försvinner: ' + JSON.stringify(res));
  if (res.renames.join(',') !== 'Städning->Slutstädning') fail('Namnbytet i Excel ska kännas igen via id: ' + JSON.stringify(res));
  if (res.kept.sort().join(',') !== 'K10:Pelare NY:0,M30:Fundament:1') fail('Namn ändrade i 4D ska behållas: ' + JSON.stringify(res));
  console.log('OK: 4D-ID matchar raden trots namnbyte i Excel, kopierad rad blir ny, namn ändrade i 4D känns igen');

  await page.evaluate(() => { planImportDiff = window.__diff; renderPlanImportPreview(window.__diff); toggle('planImportPreviewDialog', true); });
  const summary = await page.innerText('#planImportSummary');
  if (!/namn ändrade i 4D behålls/.test(summary) || !/Pelare NY/.test(summary) || !/Städning → Slutstädning/.test(summary)) fail('Förhandsgranskningen ska visa namnbyten och namn från 4D: ' + summary);
  console.log('OK: förhandsgranskningen visar namnbytet och namnen som behålls från 4D');

  await page.evaluate(() => commitPlanImport(window.__diff));
  await page.waitForTimeout(800);
  const its = get('plan_items.json'), acts = get('plan_item_activities.json');
  const by = id => its.find(r => r.id === id);
  if (by('b1').activity !== 'Pelare NY') fail('K10 ska behålla namnet från 4D: ' + JSON.stringify(by('b1')));
  if (by('c1').activity !== 'Slutstädning' || !by('c1').source_key.endsWith('||Slutstädning') || by('c1').model_id !== 'm1') fail('Städning ska få Excels nya namn och behålla sin 3D-koppling: ' + JSON.stringify(by('c1')));
  const a1acts = acts.filter(a => a.plan_item_id === 'a1').map(a => a.name);
  if (a1acts.join(',') !== 'Grovbetong 4D-namn,Gjutning') fail('Fasen som döpts om i 4D ska behålla namnet: ' + JSON.stringify(a1acts));
  if (by('a1').excel_map[1].phase !== 'Grovbetong 4D-namn' || by('a1').excel_map[1].text !== 'Grovbetong') fail('excel_map: fasen heter som i 4D, texten som i Excel: ' + JSON.stringify(by('a1').excel_map));
  if (get('plan_item_comments.json').length !== 1 || !its.some(r => r.object_name === 'Slutstädning kopia')) fail('Kommentaren kvar och kopian skapad');
  console.log('OK: efter importen – namn från 4D kvar, namnbyte från Excel infört, kopplingar och kommentarer kvar');

  // Nästa import: Excel ändrar själv namnet på K10 -> då gäller Excel.
  const next = await page.evaluate(async () => {
    await refreshItems();
    const SH = '745 - FÖRTJOCKARHUS';
    const R = (b, c, k) => { const r = []; r[1] = b; r[2] = c; r[5] = '2026-10-12'; r[8] = '2026-10-22'; r[7] = 11; r[10] = k; r[13] = 0.5; return r; };
    const rows = [[], [], [], [], R('Linje K', 'Linje K', null), R(null, 'K10 - Pelare och balk', 'DP2')];
    rows.levels = [0, 0, 0, 0, 0, 0];
    rows.ids = [null, null, null, null, null, 'b1'];
    const d = buildPlanImportDiff(parsePlanSheet(rows, SH));
    const m = d.matched[0];
    return { id: m.existing && m.existing.id, keep: !!m.keep };
  });
  if (next.id !== 'b1' || next.keep) fail('Ändrar Excel namnet gäller Excels namn: ' + JSON.stringify(next));
  console.log('OK: ändras namnet i Excel gäller Excel');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
