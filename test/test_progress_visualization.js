// Funktionstest för hur framdriften visualiseras (samtal med Victor
// 2026-09-16): istället för att objektens färg i 3D-vyn/listan STYRDES
// rent av om planerat slutdatum passerat, väger den nu in ett nytt fält
// "Verkligt avslut" (actual_end_date) tillsammans med planerat slutdatum,
// se computeItemPhase()/computeDeviationLabel() i app.js. Testar:
//  1) Listan visar en liten avvikelseetikett (färgad prick + text) per rad,
//     beräknad mot DAGENS datum - "X dagar kvar", "X dagar försenad",
//     "Klar i tid", "Klar, X dagar tidigt/sent" - och ingen etikett alls
//     för objekt som varken närmar sig deadline eller är klara/försenade.
//  2) Gammal data (klarmarkerad UTAN ett ifyllt verkligt avslut-datum)
//     visas ändå som "Klar i tid" (bakåtkompatibel fallback).
//  3) Tidslinjens legend har sex faser (Planerad/Pågående/Snart
//     aktuell/Försenad/Klar/Klar (försenad)), färgsatta från
//     settings.statusColors.
//  4) Färginställningspanelen innehåller åtta färgval (de sex statusarna +
//     de två beräknade faserna snart/klar_forsenad).
//  5) "Varna Snart aktuell"-slidern i Filter-panelen: default 7 dagar,
//     ändrar tröskeln direkt (utan att behöva öppna Inställningar) och
//     sparas i localStorage.
//  6) 3D-färgsättningen (applyTimelineColors, satt via viewer.setObjectState)
//     grupperar objekten per beräknad fas vid tidslinjens valda datum.
//  7) "Verkligt avslut"-fältet i formuläret fylls i automatiskt med dagens
//     datum när status sätts till Klar (bara om det var tomt sedan innan),
//     och skickas med i den sparade posten (actual_end_date).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8952;
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

function iso(offsetDays) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const TODAY = iso(0);

// Åtta objekt som tillsammans täcker alla sex beräknade faserna, plus den
// bakåtkompatibla fallbacken för gammal klarmarkerad data utan verkligt
// avslut. Alla i samma modell, inga saknas i den mockade 3D-modellen.
const TEST_ITEMS_ROWS = [
  { id: 'row-1', project_id: PROJECT_ID, model_id: 'model-1', object_id: '1', object_name: 'EjBorjad', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: iso(10), end_date: iso(20), actual_end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-2', project_id: PROJECT_ID, model_id: 'model-1', object_id: '2', object_name: 'PagaendeGottOmTid', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'pagaende', start_date: iso(-5), end_date: iso(20), actual_end_date: null, progress: 40, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-3', project_id: PROJECT_ID, model_id: 'model-1', object_id: '3', object_name: 'SnartAktuell', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'pagaende', start_date: iso(-10), end_date: iso(3), actual_end_date: null, progress: 70, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-4', project_id: PROJECT_ID, model_id: 'model-1', object_id: '4', object_name: 'Forsenad', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'pagaende', start_date: iso(-30), end_date: iso(-5), actual_end_date: null, progress: 60, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-5', project_id: PROJECT_ID, model_id: 'model-1', object_id: '5', object_name: 'KlarITid', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'klar', start_date: iso(-30), end_date: iso(-10), actual_end_date: iso(-10), progress: 100, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-6', project_id: PROJECT_ID, model_id: 'model-1', object_id: '6', object_name: 'KlarTidigt', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'klar', start_date: iso(-30), end_date: iso(-10), actual_end_date: iso(-12), progress: 100, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-7', project_id: PROJECT_ID, model_id: 'model-1', object_id: '7', object_name: 'KlarForsenad', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'klar', start_date: iso(-30), end_date: iso(-10), actual_end_date: iso(-4), progress: 100, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-8', project_id: PROJECT_ID, model_id: 'model-1', object_id: '8', object_name: 'KlarLegacy', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'klar', start_date: iso(-30), end_date: iso(-10), actual_end_date: null, progress: 100, updated_at: '2026-01-01T00:00:00Z' }
];

const DEFAULT_COLORS = {
  planerad: '#94a3b8', pagaende: '#f5a623', snart: '#eab308',
  forsenad: '#e5484d', klar: '#3fb950', klar_forsenad: '#3b82f6'
};
function hexToRgb(hex) {
  return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
}
function hexToRgba255(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), a: 255 };
}

function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex');
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1400 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  page.on('dialog', async (dialog) => { await dialog.accept(); });

  const store = new Map();
  store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: TEST_ITEMS_ROWS, sha: shaFor(TEST_ITEMS_ROWS) });

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-unlocked', '1');
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'test-token' }));
    window.__calls = [];
  });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.TrimbleConnectWorkspace = { connect: function(target, callback) {
        window.__onWorkspaceEvent = callback;
        return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
        viewer: {
          convertToObjectRuntimeIds: function(modelId, objectIds) {
            window.__calls.push(['convertToObjectRuntimeIds', modelId, objectIds.slice()]);
            return Promise.resolve(objectIds.map(id => Number(id)));
          },
          convertToObjectIds: function(modelId, runtimeIds) { return Promise.resolve(runtimeIds.map(id => String(id))); },
          setSelection: function(selector, mode) {
            window.__calls.push(['setSelection', JSON.parse(JSON.stringify(selector)), mode]);
            return Promise.resolve();
          },
          setCamera: function(arg) {
            window.__calls.push(['setCamera', JSON.parse(JSON.stringify(arg))]);
            return Promise.resolve();
          },
          isolateEntities: function(modelEntities) {
            window.__calls.push(['isolateEntities', JSON.parse(JSON.stringify(modelEntities))]);
            return Promise.resolve(true);
          },
          setObjectState: function(selector, state) {
            window.__calls.push(['setObjectState', selector === undefined ? undefined : JSON.parse(JSON.stringify(selector)), JSON.parse(JSON.stringify(state))]);
            return Promise.resolve();
          },
          getSelection: function() { return Promise.resolve([{ modelId: 'model-1', objectRuntimeIds: [1] }]); }
        }
      }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

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
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      const newSha = shaFor(content);
      store.set(filePath, { content, sha: newSha });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: newSha } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const itemCountText = await page.locator('#itemCount').innerText();
  if (itemCountText.trim() !== '8/8') throw new Error('Förväntade 8/8 laddade objekt, fick: ' + itemCountText);

  // ---- 1) + 2) Avvikelseetiketter i listan, beräknade mot dagens datum.
  const phaseTagFor = async (name) => page.evaluate((n) => {
    const row = Array.from(document.querySelectorAll('.item-row')).find(r => r.textContent.includes(n));
    const tag = row ? row.querySelector('.phase-tag') : null;
    return tag ? tag.textContent.trim() : null;
  }, name);

  const noLabelA = await phaseTagFor('EjBorjad');
  if (noLabelA !== null) throw new Error('Ett objekt som inte påbörjats än skulle inte ha någon avvikelseetikett, fick: ' + noLabelA);
  const noLabelB = await phaseTagFor('PagaendeGottOmTid');
  if (noLabelB !== null) throw new Error('Ett pågående objekt med gott om tid kvar skulle inte ha någon avvikelseetikett, fick: ' + noLabelB);

  const snartLabel = await phaseTagFor('SnartAktuell');
  if (snartLabel !== '3 dagar kvar') throw new Error('Förväntade "3 dagar kvar" för SnartAktuell, fick: ' + snartLabel);

  const forsenadLabel = await phaseTagFor('Forsenad');
  if (forsenadLabel !== '5 dagar försenad') throw new Error('Förväntade "5 dagar försenad" för Forsenad, fick: ' + forsenadLabel);

  const klarITidLabel = await phaseTagFor('KlarITid');
  if (klarITidLabel !== 'Klar i tid') throw new Error('Förväntade "Klar i tid" för KlarITid, fick: ' + klarITidLabel);

  const klarTidigtLabel = await phaseTagFor('KlarTidigt');
  if (klarTidigtLabel !== 'Klar, 2 dagar tidigt') throw new Error('Förväntade "Klar, 2 dagar tidigt" för KlarTidigt, fick: ' + klarTidigtLabel);

  const klarForsenadLabel = await phaseTagFor('KlarForsenad');
  if (klarForsenadLabel !== 'Klar, 6 dagar sent') throw new Error('Förväntade "Klar, 6 dagar sent" för KlarForsenad, fick: ' + klarForsenadLabel);

  // Bakåtkompatibel fallback: klarmarkerad UTAN verkligt avslut-datum ska
  // ändå visas som "Klar i tid" (inte försenad/blank), så gammal data inte
  // plötsligt ser trasig ut.
  const klarLegacyLabel = await phaseTagFor('KlarLegacy');
  if (klarLegacyLabel !== 'Klar i tid') throw new Error('Förväntade "Klar i tid" (fallback) för KlarLegacy utan verkligt avslut, fick: ' + klarLegacyLabel);
  console.log('OK: avvikelseetiketterna i listan (inkl. bakåtkompatibel fallback för gammal klarmarkerad data) beräknas korrekt mot dagens datum');

  // ---- 3) Tidslinjens legend: sex faser, färgsatta från statusColors.
  const dotIds = ['dotPlanerad', 'dotPagaende', 'dotSnart', 'dotForsenad', 'dotKlar', 'dotKlarForsenad'];
  const dotColors = await page.evaluate((ids) =>
    ids.map(id => { const el = document.getElementById(id); return el ? getComputedStyle(el).backgroundColor : null; }), dotIds);
  const expectedPhaseOrder = ['planerad', 'pagaende', 'snart', 'forsenad', 'klar', 'klar_forsenad'];
  expectedPhaseOrder.forEach((phase, i) => {
    const expected = hexToRgb(DEFAULT_COLORS[phase]);
    if (dotColors[i] !== expected) throw new Error(`Legend-prick ${dotIds[i]} skulle ha färgen ${expected} (${phase}), fick: ${dotColors[i]}`);
  });
  console.log('OK: tidslinjens legend visar alla sex faser med rätt färger');

  // ---- 4) Färginställningspanelen: åtta färgval (sex statusar + två
  //         beräknade faser), delar samma panel som Victor bad om.
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(150);
  const colorKeys = ['ej_planerad', 'planerad', 'pagaende', 'forsenad', 'klar', 'pausad', 'snart', 'klar_forsenad'];
  const colorInputsExist = await page.evaluate((keys) => keys.map(k => !!document.getElementById(`statusColor_${k}`)), colorKeys);
  if (!colorInputsExist.every(Boolean)) throw new Error('Förväntade en färgväljare per statusvärde OCH per beräknad fas, fick: ' + JSON.stringify(colorInputsExist));
  const snartColorValue = await page.locator('#statusColor_snart').inputValue();
  const klarForsenadColorValue = await page.locator('#statusColor_klar_forsenad').inputValue();
  if (snartColorValue.toLowerCase() !== DEFAULT_COLORS.snart) throw new Error('Förväntade standardfärgen för "snart", fick: ' + snartColorValue);
  if (klarForsenadColorValue.toLowerCase() !== DEFAULT_COLORS.klar_forsenad) throw new Error('Förväntade standardfärgen för "klar_forsenad", fick: ' + klarForsenadColorValue);
  console.log('OK: färginställningspanelen innehåller åtta färgval (sex statusar + snart + klar_forsenad) med rätt standardfärger');

  // ---- 4b) Opacitetsreglage: bara för de sex BERÄKNADE faserna (inte de
  //          två rent manuella statusarna ej_planerad/pausad, som aldrig
  //          styr 3D-färgsättningen) - detta är regleraget Victor bad om
  //          att få tillbaka efter att det försvann när färgpanelerna
  //          slogs ihop.
  const opacityKeysExpectedPresent = ['planerad', 'pagaende', 'snart', 'forsenad', 'klar', 'klar_forsenad'];
  const opacityKeysExpectedAbsent = ['ej_planerad', 'pausad'];
  const opacityPresence = await page.evaluate((keys) => keys.map(k => !!document.getElementById(`statusOpacity_${k}`)), opacityKeysExpectedPresent);
  if (!opacityPresence.every(Boolean)) throw new Error('Förväntade ett opacitetsreglage för samtliga sex beräknade faser, fick: ' + JSON.stringify(opacityPresence));
  const opacityAbsence = await page.evaluate((keys) => keys.map(k => !!document.getElementById(`statusOpacity_${k}`)), opacityKeysExpectedAbsent);
  if (opacityAbsence.some(Boolean)) throw new Error('"ej_planerad"/"pausad" ska INTE ha något opacitetsreglage (styr aldrig 3D-färgsättningen), fick: ' + JSON.stringify(opacityAbsence));
  const defaultOpacityForsenad = await page.locator('#statusOpacity_forsenad').inputValue();
  if (defaultOpacityForsenad !== '100') throw new Error('Förväntade default 100% opacitet för "forsenad", fick: ' + defaultOpacityForsenad);

  // Sänk opaciteten för "forsenad" till 50% och spara.
  await page.locator('#statusOpacity_forsenad').fill('50');
  await page.locator('#btnSaveSettings').click();
  await page.waitForTimeout(200);

  const persistedOpacity = await page.evaluate(() => JSON.parse(window.localStorage.getItem('4dplan-settings')).statusOpacities.forsenad);
  if (persistedOpacity !== 0.5) throw new Error('Förväntade att opaciteten 0.5 för "forsenad" sparats i localStorage, fick: ' + persistedOpacity);

  // Öppna inställningarna igen och verifiera att reglaget kommer ihåg 50%.
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(150);
  const reloadedOpacity = await page.locator('#statusOpacity_forsenad').inputValue();
  if (reloadedOpacity !== '50') throw new Error('Förväntade att opacitetsreglaget för "forsenad" visar 50% efter omöppning, fick: ' + reloadedOpacity);
  await page.locator('#btnCloseSettings').click();
  await page.waitForTimeout(100);

  // Tvinga fram en ny 3D-färgsättning och kolla att den sänkta opaciteten
  // faktiskt används i setObjectState-anropet (alpha ~127-128 av 255).
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.locator('#timelineDate').fill(TODAY);
  await page.locator('#timelineDate').dispatchEvent('change');
  await page.waitForTimeout(200);
  const forsenadCallAfterOpacity = await page.evaluate(() =>
    window.__calls.find(c => c[0] === 'setObjectState' &&
      JSON.stringify((c[1]?.modelObjectIds?.[0]?.objectRuntimeIds || []).slice().sort((a, b) => a - b)) === JSON.stringify([4])));
  if (!forsenadCallAfterOpacity) throw new Error('Hittade inget setObjectState-anrop för "forsenad"-objektet efter att opaciteten sänkts');
  const alpha = forsenadCallAfterOpacity[2]?.color?.a;
  if (alpha !== 128 && alpha !== 127) throw new Error('Förväntade alpha ~127/128 (50% av 255) för "forsenad" efter sänkt opacitet, fick: ' + alpha);
  console.log('OK: opacitetsreglaget för de sex beräknade faserna (inte de två manuella statusarna) sparas och påverkar 3D-färgsättningens alfa-värde');

  // Sätt tillbaka opaciteten till 100% igen så resten av testet (steg 6-7,
  // som förutsätter full opacitet) inte påverkas.
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(150);
  await page.locator('#statusOpacity_forsenad').fill('100');
  await page.locator('#btnSaveSettings').click();
  await page.waitForTimeout(200);

  // ---- 5) "Snart aktuell"-slidern i Filter-panelen: default 7 dagar,
  //         justerar tröskeln direkt och sparas i localStorage.
  const warningDaysValue = await page.locator('#warningDaysSlider').inputValue();
  if (warningDaysValue !== '7') throw new Error('Förväntade default 7 dagar för "Snart aktuell"-slidern, fick: ' + warningDaysValue);
  const warningDaysLabelText = await page.locator('#warningDaysLabel').innerText();
  if (warningDaysLabelText.trim() !== '7 dagar') throw new Error('Förväntade etiketten "7 dagar", fick: ' + warningDaysLabelText);

  await page.locator('#warningDaysSlider').fill('2');
  await page.waitForTimeout(200);
  // Med tröskeln sänkt till 2 dagar hinner "SnartAktuell" (3 dagar kvar)
  // inte längre klassas som "snart" - etiketten ska försvinna.
  const snartLabelAfterLoweredThreshold = await phaseTagFor('SnartAktuell');
  if (snartLabelAfterLoweredThreshold !== null) throw new Error('Med tröskeln sänkt till 2 dagar skulle SnartAktuell (3 dagar kvar) inte längre visas som "snart", fick: ' + snartLabelAfterLoweredThreshold);
  const persistedWarningDays = await page.evaluate(() => JSON.parse(window.localStorage.getItem('4dplan-settings')).warningDaysBeforeEnd);
  if (persistedWarningDays !== 2) throw new Error('Förväntade att warningDaysBeforeEnd=2 sparats direkt i localStorage, fick: ' + persistedWarningDays);
  console.log('OK: "Snart aktuell"-slidern i Filter-panelen justerar tröskeln direkt och sparas i localStorage');

  // Sätt tillbaka till 7 för resten av testet (3D-färgsättningen nedan
  // förutsätter standardtröskeln).
  await page.locator('#warningDaysSlider').fill('7');
  await page.waitForTimeout(150);

  // ---- 6) 3D-färgsättning: sätt tidslinjen till DAGENS datum och
  //         verifiera att setObjectState-anropen grupperar objekten per
  //         beräknad fas, med rätt färg.
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.locator('#timelineDate').fill(TODAY);
  await page.locator('#timelineDate').dispatchEvent('change');
  await page.waitForTimeout(200);

  const colorCalls = await page.evaluate(() => window.__calls.filter(c => c[0] === 'setObjectState'));
  const expectedGroups = {
    planerad: [1], pagaende: [2], snart: [3], forsenad: [4],
    klar: [5, 6, 8], klar_forsenad: [7]
  };
  Object.entries(expectedGroups).forEach(([phase, expectedIds]) => {
    const expectedColor = hexToRgba255(DEFAULT_COLORS[phase]);
    const match = colorCalls.find(c => {
      const ids = (c[1]?.modelObjectIds?.[0]?.objectRuntimeIds || []).slice().sort((a, b) => a - b);
      return JSON.stringify(ids) === JSON.stringify(expectedIds.slice().sort((a, b) => a - b));
    });
    if (!match) throw new Error(`Förväntade ett setObjectState-anrop för fasen "${phase}" med objekt ${JSON.stringify(expectedIds)}, fick anrop: ${JSON.stringify(colorCalls)}`);
    if (JSON.stringify(match[2]?.color) !== JSON.stringify(expectedColor)) {
      throw new Error(`Fel färg för fasen "${phase}": förväntade ${JSON.stringify(expectedColor)}, fick ${JSON.stringify(match[2]?.color)}`);
    }
  });
  console.log('OK: 3D-färgsättningen grupperar objekten per beräknad fas (vid tidslinjens valda datum) med rätt färger');

  // ---- 7) "Verkligt avslut" fylls i automatiskt med dagens datum när
  //         status sätts till Klar (bara om fältet var tomt), och sparas.
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  // "Verklig start/avslut" är numera en hopfälld "extra"-sektion (se
  // Victors förfrågan 2026-09-17) - fäll ut den för att kunna interagera
  // med "Verkligt avslut"-fältet nedan.
  await page.locator('#btnToggleActualDates').click();
  await page.waitForTimeout(50);
  const actualEndBefore = await page.locator('#fActualEnd').inputValue();
  if (actualEndBefore !== '') throw new Error('Förväntade tomt "Verkligt avslut"-fält för EjBorjad (ingen tidigare klarmarkering), fick: ' + actualEndBefore);

  await page.locator('#fStatus').selectOption('klar');
  await page.waitForTimeout(50);
  const actualEndAfterAutoFill = await page.locator('#fActualEnd').inputValue();
  if (actualEndAfterAutoFill !== TODAY) throw new Error('Förväntade att "Verkligt avslut" auto-fylls med dagens datum vid klarmarkering, fick: ' + actualEndAfterAutoFill);

  // Ändrar man datumet manuellt ska det INTE skrivas över igen om man
  // växlar status fram och tillbaka.
  await page.locator('#fActualEnd').fill(iso(-3));
  await page.locator('#fStatus').selectOption('pagaende');
  await page.locator('#fStatus').selectOption('klar');
  await page.waitForTimeout(50);
  const actualEndAfterManualEdit = await page.locator('#fActualEnd').inputValue();
  if (actualEndAfterManualEdit !== iso(-3)) throw new Error('Ett manuellt ändrat "Verkligt avslut"-datum skulle inte skrivas över av auto-ifyllnaden, fick: ' + actualEndAfterManualEdit);

  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(400);

  const putBodyOk = await page.evaluate(async () => {
    const resp = await fetch('https://api.github.com/repos/vfalk-NCC/4D-data/contents/projects/test-project/plan_items.json');
    const json = await resp.json();
    const content = JSON.parse(atob(json.content));
    const row = content.find(r => r.object_id === '1');
    return row ? row.actual_end_date : undefined;
  });
  if (putBodyOk !== iso(-3)) throw new Error('Förväntade att den sparade posten för objekt 1 har actual_end_date=' + iso(-3) + ', fick: ' + putBodyOk);
  console.log('OK: "Verkligt avslut" fylls i automatiskt vid klarmarkering (utan att skriva över en manuell ändring), och sparas korrekt');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: visualiseringen av framdriften (avvikelseetiketter, legend, färginställningar, snart-tröskel, 3D-färgsättning, verkligt avslut) fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
