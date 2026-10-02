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
// Kommentarer från Excel (Victors önskemål 2026-10-02): trådade kommentarer
// och anteckningar i filen läggs in som kommentarer på aktiviteten på samma
// rad; lösta trådar hoppas över; en ny import lägger inte in dem igen.
// Bygger på test_plan_excel_import.js (samma shim och mock).
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
const PORT = 8981;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PROJECT_ID = 'test-project';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
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
  require('./_reveal').autoReveal(page);

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
      // Kommentarstestet: "zip-läsaren" ger XML-filerna ur JSON-filens __files.
      CFB: {
        read: (u8) => JSON.parse(new TextDecoder('utf-8').decode(u8)).__files || {},
        find: (cfb, p) => (cfb[p.replace(/^\//, '')] != null ? { content: new TextEncoder().encode(cfb[p.replace(/^\//, '')]) } : null),
      },
    };
  });
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);


  const files = {
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="742 - SIKTHALL" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/_rels/sheet1.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>',
    'xl/persons/person.xml': '<personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"><person displayName="Victor Falk" id="{P1}"/><person displayName="Anna UE" id="{P2}"/></personList>',
    'xl/threadedComments/threadedComment1.xml': '<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">'
      + '<threadedComment ref="C7" dT="2026-09-30T08:12:00.00" personId="{P1}" id="{T1}"><text>Formen levereras vecka 40</text></threadedComment>'
      + '<threadedComment ref="C7" dT="2026-09-30T09:00:00.00" personId="{P2}" id="{T2}" parentId="{T1}"><text>OK, vi är på plats</text></threadedComment>'
      + '<threadedComment ref="C9" dT="2026-09-29T10:00:00.00" personId="{P1}" id="{T3}" done="1"><text>Löst sedan länge</text></threadedComment>'
      + '<threadedComment ref="C9" dT="2026-09-29T11:00:00.00" personId="{P2}" id="{T4}" parentId="{T3}"><text>Svar i löst tråd</text></threadedComment>'
      + '<threadedComment ref="B5" dT="2026-09-28T10:00:00.00" personId="{P1}" id="{T5}"><text>På rubrikraden</text></threadedComment>'
      + '</ThreadedComments>',
    'xl/comments1.xml': '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>tc={T1}</author></authors><commentList><comment ref="C7" authorId="0"><text><r><t>[Threaded comment] ...</t></r></text></comment></commentList></comments>',
  };
  const fileWithComments = Buffer.from(JSON.stringify({ SheetNames: ['742 - SIKTHALL'], Sheets: { '742 - SIKTHALL': sheetV1() }, __files: files }), 'utf-8');

  // 1) Förhandsgranskningen visar kommentarerna.
  await page.setInputFiles('#planExcelFile', { name: 'plan.xlsm', mimeType: 'application/octet-stream', buffer: fileWithComments });
  await page.locator('#btnImportPlanExcel').click();
  await page.waitForTimeout(250);
  const sum = await page.locator('#planImportSummary').innerText();
  if (!/2\s*kommentarer från Excel/.test(sum) || !/1 svar/.test(sum)) throw new Error('Förhandsgranskningen ska visa 2 kommentarer (varav 1 svar): ' + sum);
  if (!/2 i lösta trådar hoppas över/.test(sum) || !/1 saknar aktivitet/.test(sum)) throw new Error('Lösta och ej kopplingsbara ska redovisas: ' + sum);
  if (!(await page.isChecked('#planImportComments'))) throw new Error('Kommentarerna ska vara ikryssade från början');
  console.log('OK: förhandsgranskningen visar kommentarerna från Excel (lösta hoppas över)');

  // 2) Importen lägger in dem på rätt aktivitet, med författare, tid och svar.
  await page.locator('#btnConfirmPlanImport').click();
  await page.waitForTimeout(700);
  const items = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  const m30 = items.find(r => r.object_name === 'M30');
  let comments = store.get(`projects/${PROJECT_ID}/plan_item_comments.json`).content;
  if (comments.length !== 2) throw new Error('Två kommentarer ska läggas in: ' + JSON.stringify(comments));
  const root = comments.find(c => !c.parent_comment_id), reply = comments.find(c => c.parent_comment_id);
  if (!root || root.plan_item_id !== m30.id || root.author !== 'Victor Falk' || root.body !== 'Formen levereras vecka 40' || !/^2026-09-30T08:12/.test(root.created_at)) throw new Error('Fel på kommentaren: ' + JSON.stringify(root));
  if (!reply || reply.parent_comment_id !== root.id || reply.author !== 'Anna UE' || reply.plan_item_id !== m30.id) throw new Error('Svaret ska hänga på kommentaren: ' + JSON.stringify(reply));
  if (!/2 kommentarer från Excel/.test(await page.locator('#planImportStatus').innerText())) throw new Error('Statusraden ska nämna kommentarerna');
  console.log('OK: kommentarerna läggs in på aktiviteten på samma rad, med författare, tid och svar');

  // 3) Ny import av samma fil: inga dubbletter.
  await page.setInputFiles('#planExcelFile', { name: 'plan.xlsm', mimeType: 'application/octet-stream', buffer: fileWithComments });
  await page.locator('#btnImportPlanExcel').click();
  await page.waitForTimeout(250);
  await page.locator('#btnConfirmPlanImport').click();
  await page.waitForTimeout(700);
  comments = store.get(`projects/${PROJECT_ID}/plan_item_comments.json`).content;
  if (comments.length !== 2) throw new Error('En ny import ska inte lägga in kommentarerna igen: ' + comments.length);
  console.log('OK: en ny import lägger inte in samma kommentarer igen');

  // 4) Urkryssad ruta: inga kommentarer. Vanliga anteckningar (utan trådar) läses också.
  store.set(`projects/${PROJECT_ID}/plan_item_comments.json`, { content: [], sha: 'reset' });
  const notes = { ...files };
  delete notes['xl/threadedComments/threadedComment1.xml'];
  notes['xl/worksheets/_rels/sheet1.xml.rels'] = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>';
  notes['xl/comments1.xml'] = '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Victor</author></authors><commentList><comment ref="C10" authorId="0"><text><r><t>Victor:</t></r><r><t> Kolla ritningen</t></r></text></comment></commentList></comments>';
  const fileNotes = Buffer.from(JSON.stringify({ SheetNames: ['742 - SIKTHALL'], Sheets: { '742 - SIKTHALL': sheetV1() }, __files: notes }), 'utf-8');
  await page.setInputFiles('#planExcelFile', { name: 'plan.xlsm', mimeType: 'application/octet-stream', buffer: fileNotes });
  await page.locator('#btnImportPlanExcel').click();
  await page.waitForTimeout(250);
  if (!/1\s*kommentar från Excel/.test(await page.locator('#planImportSummary').innerText())) throw new Error('Anteckningar ska också läsas');
  await page.uncheck('#planImportComments');
  await page.locator('#btnConfirmPlanImport').click();
  await page.waitForTimeout(700);
  if (store.get(`projects/${PROJECT_ID}/plan_item_comments.json`).content.length) throw new Error('Urkryssad ruta: inga kommentarer ska läggas in');
  const parsed = await page.evaluate(() => matchExcelComments(readExcelCommentsFromFiles(p => null), []));
  if (parsed.list.length) throw new Error('Utan kommentarsfiler: inga kommentarer');
  const note = await page.evaluate(n => readExcelCommentsFromFiles(p => n[p] || null), notes);
  if (note.length !== 1 || note[0].text !== 'Kolla ritningen' || note[0].author !== 'Victor' || note[0].row !== 10) throw new Error('Anteckningen ska läsas utan "Namn:"-prefix: ' + JSON.stringify(note));
  console.log('OK: anteckningar läses också, och rutan kan kryssas ur');

  if (consoleErrors.length) throw new Error('Konsolfel: ' + consoleErrors.join(' | '));
  await browser.close();
  server.close();
  console.log('Alla tester för kommentarer från Excel gick igenom');
}
run().catch(e => { console.error('FEL:', e.message); process.exit(1); });
