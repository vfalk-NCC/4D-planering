// Funktionstest: manuella markeringar (linje, polylinje, yta, volym, frihand)
// ritade via klick i 3D (viewer.onPicked) och Trimble Connects frihand
// (viewer.onMarkupChanged), sparade i plan_markups.json, uppritade i
// statusfärg, "Visa markeringar", "Kopplade modeller/markeringar",
// taggen "Manuell markering" och framdrift direkt i listan.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8953;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Sektionsfickor', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [] };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '10', object_name: 'Borrning', activity: 'Borrning', start_date: '2026-06-01', end_date: '2026-06-10' },
  { ...base, status: 'klar', id: 'f', model_id: null, object_id: 'excel-f', object_name: 'Fyllning Del 1', activity: 'Fyllning', start_date: '2026-01-02', end_date: '2026-01-13' },
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__markups = new Map(); window.__nextId = 1; window.__camera = null; window.__toggled = [];
    window.__noIds = false;
    const addLines = arr => Promise.resolve(arr.map(m => { const id = window.__nextId++; window.__markups.set(id, { type: 'line', ...m, id }); return window.__noIds ? { ...m } : { ...m, id }; }));
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: {
        addLineMarkups: addLines,
        getLineMarkups: () => Promise.resolve([...window.__markups.values()]),
        removeMarkups: ids => { (ids || []).forEach(id => window.__markups.delete(id)); return Promise.resolve(); },
      },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: c => { window.__camera = c; return Promise.resolve(); }, getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: () => Promise.resolve([]),
        setObjectState: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'm1', name: 'Modell 1', state: 'unloaded' }]),
        toggleModel: (id, loaded) => { window.__toggled.push([id, loaded]); return Promise.resolve(); }
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  const pick = (x, y, z) => page.evaluate(([x, y, z]) => window.__cb('viewer.onPicked', { data: { position: { x, y, z }, modelId: 'm1', objectRuntimeId: 1 } }), [x, y, z]);
  const shown = () => page.evaluate(() => [...window.__markups.values()]);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const row = id => page.locator(`#itemList .item-row[data-item-id="${id}"]`);
  if (!(await row('f').locator('.uncoupled-tag').count())) fail('Fyllning ska först visas som Ej kopplad');

  // 1) Volym: öppna kopplingsläget och rita
  await row('f').locator('[data-action="couple"]').click();
  if (!(await page.isVisible('#markDrawBar'))) fail('rit-raden ska synas i kopplingsläget');
  const shapes = await page.locator('#markDrawBar [data-shape]').allInnerTexts();
  if (shapes.length !== 5 || !shapes.join().includes('Frihand')) fail('alla fem former ska finnas, fick ' + shapes.join(', '));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/mm1.png' });
  await page.click('#markDrawBar [data-shape="volume"]');
  await pick(10, 10, 0); await pick(20, 10, 0); await pick(20, 15, 0); await pick(10, 15, 0);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/mm2.png' });
  await page.fill('#markHeight', '0,5'); await page.dispatchEvent('#markHeight', 'input');
  await page.waitForTimeout(100);
  const previewCount = (await shown()).length;
  if (previewCount < 12) fail('förhandsvisningen av volymen ska ha minst 12 linjer, fick ' + previewCount);
  await page.click('#markDone'); await page.waitForTimeout(800);
  const saved = get('plan_markups.json');
  if (!saved || saved.length !== 1 || saved[0].shape !== 'volume' || saved[0].itemId !== 'f' || saved[0].height !== 0.5 || saved[0].pts.length !== 4) fail('volymen ska sparas, fick ' + JSON.stringify(saved));
  await page.evaluate(() => { document.getElementById('timelineDate').value = '2026-09-29'; return renderManualMarks(); }); await page.waitForTimeout(100);
  const lines = await shown();
  if (lines.length !== 12) fail('en volym med fyra hörn ska ritas som 12 linjer (botten, topp, lodräta), fick ' + lines.length);
  if (lines[0].start.positionX !== 10000 && lines[0].start.positionX !== 20000) fail('koordinaterna ska skickas i mm');
  const topZ = Math.max(...lines.map(l => Math.max(l.start.positionZ, l.end.positionZ)));
  if (topZ !== 500) fail('volymens överkant ska ligga på höjden 0,5 m = 500 mm, fick ' + topZ);
  // Fyllningen är klar i januari -> grön (klar) idag
  const col = lines[0].color;
  if (!(col.g > col.r)) fail('en klar aktivitet ska ritas i klarfärgen (grön), fick ' + JSON.stringify(col));
  console.log('OK: volym ritas genom klick i 3D, sparas i plan_markups.json och ritas som trådmodell i statusfärg');

  // 2) Taggen "Manuell markering" i stället för "Ej kopplad", klick = kameran dit
  if (await row('f').locator('.uncoupled-tag').count()) fail('Ej kopplad ska ersättas av Manuell markering');
  const tag = await row('f').locator('.manual-tag').innerText();
  if (!tag.includes('Manuell markering')) fail('taggen ska heta Manuell markering, fick ' + tag);
  await row('f').locator('.manual-tag').click(); await page.waitForTimeout(100);
  const cam = await page.evaluate(() => window.__camera);
  if (!cam || Math.abs(cam.lookAt.x - 15) > 0.01 || Math.abs(cam.lookAt.y - 12.5) > 0.01) fail('kameran ska riktas mot markeringens mitt, fick ' + JSON.stringify(cam));
  console.log('OK: raden visar "✏️ Manuell markering" och ett klick flyttar kameran till markeringen');

  // 3) Frihand via Trimble Connects frihandsverktyg + linje
  await row('a').locator('[data-action="couple"]').click();
  await page.click('#markDrawBar [data-shape="freehand"]');
  await page.evaluate(() => window.__cb('viewer.onMarkupChanged', { data: { action: 'added', markupType: 'freelineMarkup', markup: { id: 999, lines: [
    { start: { positionX: 0, positionY: 0, positionZ: 0 }, end: { positionX: 1000, positionY: 0, positionZ: 0 } },
    { start: { positionX: 1000, positionY: 0, positionZ: 0 }, end: { positionX: 1000, positionY: 2000, positionZ: 0 } }] } } }));
  await page.waitForTimeout(100);
  await page.click('#markDone'); await page.waitForTimeout(800);
  const fh = get('plan_markups.json').find(m => m.shape === 'freehand');
  if (!fh || fh.itemId !== 'a' || fh.lines.length !== 2 || fh.lines[1][1][1] !== 2) fail('frihand ska sparas i meter, fick ' + JSON.stringify(fh));
  await row('f').locator('[data-action="couple"]').click();
  await page.click('#markDrawBar [data-shape="line"]');
  await pick(0, 0, 0); await pick(5, 0, 0); await page.waitForTimeout(800);
  if (get('plan_markups.json').filter(m => m.itemId === 'f').length !== 2) fail('en linje ska sparas direkt efter två klick');
  if (!(await row('f').locator('.manual-tag').innerText()).includes('(2)')) fail('taggen ska visa antalet markeringar');
  console.log('OK: frihand fångas från Trimble Connects frihandsverktyg och linje sparas efter två klick');

  await page.waitForTimeout(2500); // blinkningen efter kamerahoppet försvinner
  // 4) Visa markeringar av/på
  const before = (await shown()).length;
  await page.uncheck('#showManualMarks'); await page.waitForTimeout(200);
  if ((await shown()).length !== 0) fail('Visa markeringar av ska ta bort dem ur 3D');
  await page.check('#showManualMarks'); await page.waitForTimeout(200);
  if ((await shown()).length !== before) fail('Visa markeringar på ska rita upp dem igen');
  await page.uncheck('#showManualMarks'); await page.waitForTimeout(200);
  const btnText = await page.innerText('#btnLoadCoupledModels');
  if (!btnText.includes('Kopplade modeller/markeringar')) fail('knappen ska heta Kopplade modeller/markeringar, fick ' + btnText);
  await page.click('#btnLoadCoupledModels'); await page.waitForTimeout(300);
  if (!(await page.isChecked('#showManualMarks')) || (await shown()).length !== before) fail('Kopplade modeller/markeringar ska även tända markeringarna');
  if (JSON.stringify(await page.evaluate(() => window.__toggled)) !== '[["m1",true]]') fail('modellen ska tändas som förut');
  console.log('OK: "Visa markeringar" och "Kopplade modeller/markeringar" tänder/släcker markeringarna');

  // 5) Framdrift direkt i listan
  const sl = row('a').locator('[data-action="progress"]');
  await sl.evaluate(el => { el.value = 60; el.dispatchEvent(new Event('input')); });
  if (!(await row('a').locator('.progress-save').isVisible())) fail('Spara ska visas när framdriften ändrats');
  if (process.env.SHOT) await row('a').screenshot({ path: process.env.SHOT + '/mm3.png' });
  await row('a').locator('[data-action="progress-save"]').click(); await page.waitForTimeout(800);
  if (get('plan_items.json').find(r => r.id === 'a').progress !== 60) fail('framdriften ska sparas');
  const txt = await row('a').innerText();
  if (!txt.includes('Framdrift 60%')) fail('raden ska visa den nya framdriften');
  await row('f').locator('[data-action="progress"]').evaluate(el => { el.value = 30; el.dispatchEvent(new Event('input')); });
  await row('f').locator('[data-action="progress-cancel"]').click();
  if (await row('f').locator('.progress-save').isVisible()) fail('✕ ska ångra ändringen');
  console.log('OK: framdriften ändras direkt i listan med reglaget och Spara');

  // 5b) Klick på aktivitetsraden flyttar kameran (kvaternion mot markeringen)
  await page.evaluate(() => { window.__camera = null; });
  await row('f').locator('[data-action="select"]').click(); await page.waitForTimeout(2500);
  const cam2 = await page.evaluate(() => window.__camera);
  if (!cam2 || !cam2.quaternion || !cam2.position) fail('klick på raden ska sätta kameran med position och rotation, fick ' + JSON.stringify(cam2));
  console.log('OK: klick på aktiviteten flyttar kameran till markeringen');
  // 5c) Trimble Connect utan id i svaret: linjerna ska ändå kunna tas bort/ritas om
  await page.evaluate(() => { window.__noIds = true; });
  await page.uncheck('#showManualMarks'); await page.check('#showManualMarks'); await page.waitForTimeout(300);
  const n1 = (await shown()).length;
  await page.evaluate(() => renderManualMarks()); await page.waitForTimeout(300);
  await page.evaluate(() => renderManualMarks()); await page.waitForTimeout(300);
  if ((await shown()).length !== n1) fail('omritning utan id får inte lämna kvar gamla linjer: ' + n1 + ' -> ' + (await shown()).length);
  await page.evaluate(() => { window.__noIds = false; });
  console.log('OK: linjerna ritas om utan dubbletter även när Trimble Connect inte returnerar id');

  // 6) Ta bort (högerklick)
  await row('a').locator('.manual-tag').click({ button: 'right' }); await page.waitForTimeout(800);
  if (get('plan_markups.json').some(m => m.itemId === 'a')) fail('högerklick + bekräfta ska ta bort markeringen');
  console.log('OK: högerklick på taggen tar bort markeringarna');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: manuella markeringar och framdrift i listan fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
