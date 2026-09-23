// Funktionstest: import av Victors "4-veckorsplanering"-Excel (skild från
// den äldre, generiska onImportExcel/ObjektID-importen) - se
// plan-excel-parser.js (tolkningslogiken, validerad separat i Node mot en
// riktig kopia av Victors fil, se /home/claude/excel_import_prototype/) och
// commitPlanImport/coupleItemToModelObject/armCoupleMode i app.js.
//
// Täcker:
//  1) Färsk import: en elementkod med två faser (M30), en fristående
//     aktivitet med 100% framdrift (Verklig start/slut ska då fyllas i) och
//     ett "kedjat kodpar"-specialfall ("A1 - A2 - Extra arbete", se
//     matchPlanElementCode i plan-excel-parser.js) hamnar rätt, med korrekt
//     source_key och UTAN 3D-koppling ("◇ Ej kopplad"-tagg + 🔗-knapp).
//  2) Omimport: samma källfil igen, men M30 finns redan sedan innan MED en
//     riktig 3D-koppling och en kommentar - efter omimporten ska kopplingen,
//     id:t och kommentaren finnas kvar OFÖRÄNDRADE, men datum/framdrift ska
//     ha uppdaterats från (den här gången ändrade) Excel-värdena.
//  3) "Koppla till markering": klick på 🔗 på det fortsatt okopplade
//     "Ställningsmontage"-objektet, simulerad 3D-markering, ska skriva
//     model_id/object_id på just den posten utan att röra några andra fält.
//
// SANDBOX-ANMÄRKNING: den här molnmiljön saknar utgående nätverk mot
// cdnjs.cloudflare.com/npm (samma spärr som blockerar `npm install xlsx`
// för valideringsskriptet) - appen kan alltså inte hämta den RIKTIGA
// SheetJS-biblioteket här. window.XLSX skuggas därför med en minimal shim
// (bara decode_range/encode_cell - ren, väldokumenterad A1-notation-
// aritmetik, inget att testa) vars .read() läser JSON istället för ett
// riktigt binärt xlsx-blob. Allt NEDANFÖR XLSX.read (buildPlanSheetsData,
// hela plan-excel-parser.js, diff/förhandsgranskning, commitPlanImport,
// coupleItemToModelObject) är OFÖRÄNDRAD, riktig appkod - det som testas
// här. Själva SheetJS-integrationen är redan en beprövad, sedan tidigare
// fungerande del av appen (onImportExcel/onExportExcel använder den också).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8977;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PROJECT_ID = 'test-project';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// --- Bygger en "fejkad arbetsbok" (samma form som window.XLSX-shimmen
// förväntar sig, se ovan) för en enda flik, enligt PLAN_COL-layouten i
// plan-excel-parser.js (rad 4 = header, data från rad 5). ---
function cellRef(r, c) {
  let col = c + 1, colStr = '';
  while (col > 0) { const rem = (col - 1) % 26; colStr = String.fromCharCode(65 + rem) + colStr; col = Math.floor((col - 1) / 26); }
  return colStr + (r + 1);
}
const COL = { rubric: 1, aktivitet: 2, datumStart: 5, planStart: 6, datumSlut: 8, planSlut: 9, dp: 10, framdrift: 13 }; // 0-indexerade

function buildFakeSheet(rowsSpec) {
  // rowsSpec: array (0-indexerad = Excel-rad 1), varje post { rubric, aktivitet, planStart, planSlut, datumStart, datumSlut, dp, framdrift } eller null (tom rad).
  const sheet = {};
  let maxRow = 3;
  rowsSpec.forEach((spec, r) => {
    if (!spec) return;
    maxRow = Math.max(maxRow, r);
    const set = (col, v, isDate) => {
      if (v === undefined || v === null) return;
      sheet[cellRef(r, col)] = isDate ? { v, t: 'd' } : { v, t: typeof v === 'number' ? 'n' : 's' };
    };
    set(COL.rubric, spec.rubric);
    set(COL.aktivitet, spec.aktivitet);
    set(COL.planStart, spec.planStart, true);
    set(COL.planSlut, spec.planSlut, true);
    set(COL.datumStart, spec.datumStart, true);
    set(COL.datumSlut, spec.datumSlut, true);
    set(COL.dp, spec.dp);
    set(COL.framdrift, spec.framdrift);
  });
  sheet['!ref'] = `A1:Q${maxRow + 1}`;
  return sheet;
}

// Rad 0-3 = Excel-rad 1-4 (header, ignoreras av parsern), data från rad 5 (index 4).
function sheetV1() {
  return buildFakeSheet([
    null, null, null, null,
    { rubric: 'Linje M', aktivitet: 'Linje M', dp: null },                                            // rad 5: rubrikrad (C ifylld, precis som i riktiga filen - men K/dp tom)
    { aktivitet: 'M30 - Fundament', planStart: '2026-01-05', planSlut: '2026-01-10', dp: 'NCC', framdrift: 0 },   // rad 6
    { aktivitet: 'M30 - Formning', planStart: '2026-01-11', planSlut: '2026-01-15', dp: 'NCC', framdrift: 0 },    // rad 7
    { rubric: 'Linje X', aktivitet: 'Linje X', dp: null },                                             // rad 8: rubrikrad
    { aktivitet: 'Ställningsmontage', planStart: '2026-01-02', planSlut: '2026-01-03', datumStart: '2026-01-02', datumSlut: '2026-01-03', dp: 'NCC', framdrift: 1 }, // rad 9, 100%
    { aktivitet: 'A1 - A2 - Extra arbete', planStart: '2026-02-01', planSlut: '2026-02-05', dp: 'NCC', framdrift: 0 }, // rad 10: kedjat kodpar
  ]);
}

// Samma källa, men M30 flyttat/förlängt (nytt slutdatum + halv framdrift) -
// simulerar att Victor uppdaterat sin Excel-fil och importerar på nytt.
function sheetV2() {
  return buildFakeSheet([
    null, null, null, null,
    { rubric: 'Linje M', aktivitet: 'Linje M', dp: null },
    { aktivitet: 'M30 - Fundament', planStart: '2026-01-05', planSlut: '2026-01-10', dp: 'NCC', framdrift: 0.6 },
    { aktivitet: 'M30 - Formning', planStart: '2026-01-11', planSlut: '2026-01-20', dp: 'NCC', framdrift: 0.4 }, // slutdatum framflyttat 15->20
    { rubric: 'Linje X', aktivitet: 'Linje X', dp: null },
    { aktivitet: 'Ställningsmontage', planStart: '2026-01-02', planSlut: '2026-01-03', datumStart: '2026-01-02', datumSlut: '2026-01-03', dp: 'NCC', framdrift: 1 },
    { aktivitet: 'A1 - A2 - Extra arbete', planStart: '2026-02-01', planSlut: '2026-02-05', dp: 'NCC', framdrift: 0 },
  ]);
}

function fakeWorkbookFile(sheet) {
  return Buffer.from(JSON.stringify({ SheetNames: ['742 - SIKTHALL'], Sheets: { '742 - SIKTHALL': sheet } }), 'utf-8');
}

function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6);
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1600 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  // ---- Mock av GitHub Contents API (samma mönster som övriga tester) ----
  const store = new Map();
  store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: [], sha: 'seed-sha' });
  store.set(`projects/${PROJECT_ID}/plan_item_progress_history.json`, { content: [], sha: 'seed-sha-hist' });
  store.set(`projects/${PROJECT_ID}/plan_item_baseline_history.json`, { content: [], sha: 'seed-sha-baseline' });
  store.set(`projects/${PROJECT_ID}/plan_item_activities.json`, { content: [], sha: 'seed-sha-act' });
  store.set(`projects/${PROJECT_ID}/plan_item_comments.json`, { content: [], sha: 'seed-sha-comments' });

  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));

    if (req.method() === 'GET') {
      const entry = store.get(filePath);
      if (!entry) { route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) }); return; }
      const b64 = Buffer.from(JSON.stringify(entry.content)).toString('base64');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: entry.sha }) });
      return;
    }
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      const existing = store.get(filePath);
      if (existing && existing.sha !== body.sha) {
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      const newSha = shaFor(content);
      store.set(filePath, { content, sha: newSha });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: newSha } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  // ---- Mock av Trimble Connect Workspace API - fångar upp onWorkspaceEvent
  // så testet kan trigga en simulerad 3D-markeringsändring (del 3, "Koppla
  // till markering"). ----
  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__selection = [];
      window.TrimbleConnectWorkspace = { connect: function(win, cb) {
        window.__triggerSelectionChanged = () => cb("viewer.onSelectionChanged", {});
        return Promise.resolve({
          project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
          viewer: {
            getSelection: function() { return Promise.resolve(window.__selection); },
            convertToObjectIds: function(modelId, runtimeIds) { return Promise.resolve(runtimeIds.map(id => 'ext-' + id)); },
            convertToObjectRuntimeIds: function(modelId, ids) { return Promise.resolve(ids.map(Number)); },
            setSelection: function() { return Promise.resolve(); },
            setCamera: function() { return Promise.resolve(); },
            getCamera: function() { return Promise.resolve({ position: { x: 5, y: 5, z: 25 }, fieldOfView: 60, pitch: 0, yaw: 0 }); },
            setObjectState: function() { return Promise.resolve(); },
            getObjectBoundingBoxes: function() { return Promise.resolve([]); }
          }
        });
      } };`
  }));

  // ---- Shimmar window.XLSX (se filhuvudkommentaren) - registreras INNAN
  // sidan navigeras, så den ligger på plats innan appens (nätverksblockerade)
  // cdnjs-scripttagg ens hinner försöka (och misslyckas tyst) ladda den
  // riktiga. ----
  await page.addInitScript(() => {
    window.XLSX = {
      read: (buf) => {
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
        const wb = JSON.parse(text);
        Object.values(wb.Sheets).forEach(sheet => {
          Object.keys(sheet).forEach(addr => {
            if (addr === '!ref') return;
            if (sheet[addr].t === 'd') sheet[addr].v = new Date(sheet[addr].v);
          });
        });
        return wb;
      },
      utils: {
        decode_range: (ref) => {
          const [a, b] = ref.split(':');
          const parse = (s) => {
            const m = /^([A-Z]+)(\d+)$/.exec(s);
            let col = 0;
            for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
            return { c: col - 1, r: parseInt(m[2], 10) - 1 };
          };
          return { s: parse(a), e: parse(b) };
        },
        encode_cell: ({ r, c }) => {
          let col = c + 1, s = '';
          while (col > 0) { const rem = (col - 1) % 26; s = String.fromCharCode(65 + rem) + s; col = Math.floor((col - 1) / 26); }
          return s + (r + 1);
        },
        sheet_to_json: () => [],
        json_to_sheet: () => ({}),
        book_new: () => ({}),
        book_append_sheet: () => {},
      },
      writeFile: () => {},
    };
  });
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  /* ============================= DEL 1: färsk import ============================= */
  await page.setInputFiles('#planExcelFile', { name: 'plan.xlsm', mimeType: 'application/octet-stream', buffer: fakeWorkbookFile(sheetV1()) });
  await page.locator('#btnImportPlanExcel').click();
  await page.waitForTimeout(200);

  const dialogVisible = await page.locator('#planImportPreviewDialog').isVisible();
  if (!dialogVisible) throw new Error('Förväntade att förhandsgranskningsdialogen öppnas efter inläsning');
  const summaryText = await page.locator('#planImportSummary').innerText();
  if (!/3\s*nya objekt/.test(summaryText)) throw new Error('Förväntade "3 nya objekt" (M30, Ställningsmontage, A1-A2) i sammanfattningen, fick: ' + summaryText);
  console.log('OK: förhandsgranskningen visar rätt antal nya objekt innan något sparats');

  await page.locator('#btnConfirmPlanImport').click();
  await page.waitForTimeout(500);

  if (dialogVisible) {
    const stillVisible = await page.locator('#planImportPreviewDialog').isVisible();
    if (stillVisible) throw new Error('Förväntade att dialogen stängs efter bekräftad import');
  }

  let savedItems = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  if (savedItems.length !== 3) throw new Error('Förväntade 3 sparade plan_items efter färsk import, fick: ' + savedItems.length);

  const m30 = savedItems.find(r => r.object_name === 'M30');
  if (!m30) throw new Error('Hittade inget M30-objekt efter import');
  if (m30.model_id) throw new Error('Förväntade att M30 INTE är kopplat till en 3D-modell direkt efter import (model_id ska vara null)');
  if (!/^excel-/.test(m30.object_id)) throw new Error('Förväntade en syntetisk object_id ("excel-...") för ett okopplat importerat objekt, fick: ' + m30.object_id);
  if (m30.source_key !== '742 - SIKTHALL||Linje M||M30') throw new Error('Fel source_key på M30: ' + m30.source_key);
  if (m30.start_date !== '2026-01-05' || m30.end_date !== '2026-01-15') throw new Error('Fel start/slutdatum på M30 (ska vara min/max av faserna): ' + m30.start_date + ' - ' + m30.end_date);

  const stallning = savedItems.find(r => r.object_name === 'Ställningsmontage');
  if (!stallning) throw new Error('Hittade inget Ställningsmontage-objekt');
  if (stallning.status !== 'klar' || stallning.progress !== 100) throw new Error('Förväntade 100% framdrift + status klar (auto-beräknad) för Ställningsmontage, fick: ' + JSON.stringify({ progress: stallning.progress, status: stallning.status }));
  if (stallning.actual_start_date !== '2026-01-02' || stallning.actual_end_date !== '2026-01-03') throw new Error('Förväntade ifyllda Verklig start/slut vid 100% framdrift för Ställningsmontage');

  const compound = savedItems.find(r => r.object_name === 'A1-A2');
  if (!compound) throw new Error('Förväntade att "A1 - A2 - Extra arbete" tolkas som ett eget sammansatt element "A1-A2" (kedjade elementkoder, se matchPlanElementCode) - inte flätas ihop med något annat objekt');
  if (compound.activity !== 'Extra arbete') throw new Error('Fel aktivitetstext för det sammansatta elementet: ' + compound.activity);
  console.log('OK: färsk import skapar rätt objekt (elementkod med faser, 100%-fristående aktivitet med auto-status, kedjat kodpar som eget element), alla utan 3D-koppling');

  const activities = store.get(`projects/${PROJECT_ID}/plan_item_activities.json`).content;
  const m30Phases = activities.filter(a => a.plan_item_id === m30.id).map(a => a.name).sort();
  if (JSON.stringify(m30Phases) !== JSON.stringify(['Fundament', 'Formning'].sort())) {
    throw new Error('Förväntade M30:s två faser (Fundament, Formning) som delaktiviteter, fick: ' + JSON.stringify(m30Phases));
  }
  console.log('OK: M30:s faser sparades som delaktiviteter (plan_item_activities.json)');

  await page.waitForSelector('#itemList .item-row');
  const uncoupledBadgeCount = await page.locator('#itemList .uncoupled-tag').count();
  if (uncoupledBadgeCount !== 3) throw new Error('Förväntade "◇ Ej kopplad"-taggen på alla 3 nyimporterade objekt, fick ' + uncoupledBadgeCount + ' st');
  const coupleBtnCount = await page.locator('#itemList .couple-btn').count();
  if (coupleBtnCount !== 3) throw new Error('Förväntade "🔗 Koppla till markering"-knappen på alla 3 objekt, fick ' + coupleBtnCount);
  console.log('OK: listan visar "Ej kopplad"-tagg + koppla-knapp för alla nyimporterade, okopplade objekt');

  /* ============ DEL 2: omimport - kopplingen (och en kommentar) ska överleva ============ */
  // Simulerar att M30 sedan tidigare kopplats i Trimble Connect (riktig
  // model_id/object_id) och har en kommentar, INNAN en ny import körs.
  const itemsBefore = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  const patchedItems = itemsBefore.content.map(r => r.id === m30.id ? { ...r, model_id: 'model-1', object_id: 'ext-777' } : r);
  store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: patchedItems, sha: shaFor(patchedItems) });
  store.set(`projects/${PROJECT_ID}/plan_item_comments.json`, {
    content: [{ id: 'c1', plan_item_id: m30.id, project_id: PROJECT_ID, author: 'Victor', text: 'Kollad på plats', created_at: '2026-01-06T08:00:00Z' }],
    sha: shaFor([]),
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  await page.setInputFiles('#planExcelFile', { name: 'plan-v2.xlsm', mimeType: 'application/octet-stream', buffer: fakeWorkbookFile(sheetV2()) });
  await page.locator('#btnImportPlanExcel').click();
  await page.waitForTimeout(200);

  const summaryText2 = await page.locator('#planImportSummary').innerText();
  if (!/3\s*uppdateras/.test(summaryText2)) throw new Error('Förväntade "3 uppdateras" vid omimport av samma källa, fick: ' + summaryText2);
  console.log('OK: omimport av samma källfil känns igen som 3 uppdateringar (via source_key), inte 3 nya objekt');

  await page.locator('#btnConfirmPlanImport').click();
  await page.waitForTimeout(500);

  savedItems = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  if (savedItems.length !== 3) throw new Error('Förväntade fortfarande bara 3 plan_items efter omimport (inga dubbletter), fick: ' + savedItems.length);
  const m30After = savedItems.find(r => r.id === m30.id);
  if (!m30After) throw new Error('M30:s id försvann vid omimport - ska vara stabilt (matchat via source_key)');
  if (m30After.model_id !== 'model-1' || m30After.object_id !== 'ext-777') {
    throw new Error('Förväntade att M30:s 3D-koppling (model-1/ext-777) INTE rörs av en omimport, fick: ' + JSON.stringify({ model_id: m30After.model_id, object_id: m30After.object_id }));
  }
  if (m30After.end_date !== '2026-01-20') throw new Error('Förväntade att M30:s slutdatum uppdaterats till det nya (2026-01-20) från omimporten, fick: ' + m30After.end_date);
  if (m30After.progress !== 50) throw new Error('Förväntade M30:s framdrift uppdaterad till medel(60,40)=50, fick: ' + m30After.progress);
  console.log('OK: omimport uppdaterar datum/framdrift men rör INTE en redan gjord 3D-koppling, och skapar inga dubbletter');

  const commentsAfter = store.get(`projects/${PROJECT_ID}/plan_item_comments.json`).content;
  if (commentsAfter.length !== 1 || commentsAfter[0].plan_item_id !== m30.id) {
    throw new Error('Förväntade att den tidigare kommentaren på M30 finns kvar orörd efter omimport, fick: ' + JSON.stringify(commentsAfter));
  }
  console.log('OK: en tidigare kommentar på M30 finns kvar efter omimport (id:t rördes aldrig)');

  const activitiesAfter = store.get(`projects/${PROJECT_ID}/plan_item_activities.json`).content;
  const m30PhasesAfter = activitiesAfter.filter(a => a.plan_item_id === m30.id);
  if (m30PhasesAfter.length !== 2) throw new Error('Förväntade att M30 fortfarande har exakt 2 delaktiviteter efter omimport, fick ' + m30PhasesAfter.length);

  await page.waitForSelector('#itemList .item-row');
  const uncoupledAfterReimport = await page.locator('#itemList .uncoupled-tag').count();
  if (uncoupledAfterReimport !== 2) throw new Error('Förväntade att M30 inte längre visar "Ej kopplad" efter omimport (den koppling som redan fanns ska synas), fick ' + uncoupledAfterReimport + ' okopplade kvar');
  console.log('OK: M30 visas som kopplad i listan efter omimport (badgen bara kvar på de fortsatt okopplade)');

  /* ============================= DEL 3: "Koppla till markering" ============================= */
  const stallningRow = page.locator('#itemList .item-row', { hasText: 'Ställningsmontage' });
  await stallningRow.locator('.couple-btn').click();
  await page.waitForTimeout(150);

  const bannerVisible = await page.locator('#coupleModeBanner').isVisible();
  if (!bannerVisible) throw new Error('Förväntade att kopplingsbannern visas efter klick på 🔗');
  const bannerText = await page.locator('#coupleModeText').innerText();
  if (!/Ställningsmontage/.test(bannerText)) throw new Error('Förväntade att bannern nämner objektets namn, fick: ' + bannerText);
  console.log('OK: "Koppla till markering" visar en tydlig banner som väntar på nästa 3D-markering');

  await page.evaluate(() => {
    window.__selection = [{ modelId: 'model-2', objectRuntimeIds: [55] }];
    window.__triggerSelectionChanged();
  });
  await page.waitForTimeout(500);

  const bannerGone = await page.locator('#coupleModeBanner').isVisible();
  if (bannerGone) throw new Error('Förväntade att kopplingsbannern försvinner efter en lyckad koppling');

  savedItems = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  const stallningAfter = savedItems.find(r => r.object_name === 'Ställningsmontage');
  if (stallningAfter.model_id !== 'model-2' || stallningAfter.object_id !== 'ext-55') {
    throw new Error('Förväntade att Ställningsmontage kopplats till model-2/ext-55, fick: ' + JSON.stringify({ model_id: stallningAfter.model_id, object_id: stallningAfter.object_id }));
  }
  if (stallningAfter.progress !== 100 || stallningAfter.start_date !== '2026-01-02' || stallningAfter.actual_end_date !== '2026-01-03') {
    throw new Error('Förväntade att "Koppla till markering" INTE rör några andra fält än 3D-kopplingen, fick: ' + JSON.stringify(stallningAfter));
  }
  console.log('OK: "Koppla till markering" skriver 3D-kopplingen på rätt post utan att röra dess övriga data');

  const uncoupledFinal = await page.locator('#itemList .uncoupled-tag').count();
  if (uncoupledFinal !== 1) throw new Error('Förväntade exakt 1 kvarvarande okopplat objekt (A1-A2) efter att Ställningsmontage kopplats, fick ' + uncoupledFinal);
  console.log('OK: listan uppdateras direkt - Ställningsmontage tappar sin "Ej kopplad"-tagg');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: 4-veckorsplanering-importen (färsk import, omimport med bevarad koppling, "Koppla till markering") fungerar korrekt end-to-end');
}

run().catch(e => { console.error(e); process.exit(1); });
