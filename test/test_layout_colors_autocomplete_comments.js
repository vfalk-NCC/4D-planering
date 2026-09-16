// Funktionstest för de fyra sakerna Victor efterfrågade efter perf/UX-
// rundan:
//  1) "Planerade objekt" ska ligga direkt under "Koppla markering" i panel-
//     ordningen (inte under Tidslinje/Filter som tidigare).
//  2) Område/Aktivitet/Entreprenör i Koppla markering-formuläret ska ha en
//     egen, snyggare dropdown som BARA föreslår värden som redan finns
//     bland sparade planeringsposter - inte webbläsarens egen
//     ifyllnadshistorik (autocomplete="off", ingen <datalist> kvar).
//  3) Alla sex statusvärden ska gå att färgsätta var för sig via
//     kugghjulet, och badgen i listan ska använda den sparade färgen.
//  4) Kommentarer ska gå att ta bort (papperskorg), inklusive ev. svar på
//     kommentaren (cascade), med uppdaterad kommentarsräknare efteråt.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8947;
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

const store = new Map();
function shaFor(content) { return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6); }

const SEED_ITEMS = [
  { id: 'row-1', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'A1', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-2', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20', object_name: 'A2', area: 'Hus B', activity: 'Montage', contractor: 'Skanska', status: 'klar', start_date: null, end_date: null, progress: 100, updated_at: '2026-01-01T00:00:00Z' }
];
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: SEED_ITEMS, sha: shaFor(SEED_ITEMS) });

const ROOT_COMMENT = { id: 'comment-root', plan_item_id: 'row-1', parent_comment_id: null, author: 'Victor', body: 'Det här blev fel', created_at: '2026-01-01T10:00:00Z' };
const REPLY_COMMENT = { id: 'comment-reply', plan_item_id: 'row-1', parent_comment_id: 'comment-root', author: 'Kollega', body: 'Håller med', created_at: '2026-01-01T10:05:00Z' };
store.set(`projects/${PROJECT_ID}/plan_item_comments.json`, { content: [ROOT_COMMENT, REPLY_COMMENT], sha: shaFor([ROOT_COMMENT, REPLY_COMMENT]) });

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1400 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*(404|409)/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  const alerts = [];
  page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__calls = [];
      window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
        viewer: {
          convertToObjectRuntimeIds: function(modelId, objectIds) { return Promise.resolve(objectIds.map(id => Number(id))); },
          setSelection: function() { return Promise.resolve(); },
          setCamera: function() { return Promise.resolve(); },
          getCamera: function() { return Promise.resolve({ position: { x: 5, y: 5, z: 25 }, fieldOfView: 60, pitch: 0, yaw: 0 }); },
          getObjectBoundingBoxes: function(modelId, ids) {
            return Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } } })));
          },
          setObjectState: function() { return Promise.resolve(); },
          getSelection: function() { return Promise.resolve([{ modelId: 'model-1', objectRuntimeIds: [999] }]); },
          convertToObjectIds: function() { return Promise.resolve(['90']); }
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

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // ============================================================
  // 1) "Planerade objekt" direkt under "Koppla markering".
  // ============================================================
  const panelOrder = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section.panel[data-panel-id]')).map(p => p.dataset.panelId)
  );
  if (panelOrder[0] !== 'link') throw new Error('Förväntade "link" som första panel, fick ordningen: ' + panelOrder.join(', '));
  if (panelOrder[1] !== 'items') throw new Error('Förväntade "items" (Planerade objekt) direkt efter "Koppla markering", fick ordningen: ' + panelOrder.join(', '));
  console.log('OK: "Planerade objekt" ligger direkt under "Koppla markering"');

  // ============================================================
  // 2) Egen dropdown för Område - bara sparade värden, ingen native
  //    autocomplete, filtrerar live, klick väljer värdet.
  // ============================================================
  const fArea = page.locator('#fArea');
  const autocompleteAttr = await fArea.getAttribute('autocomplete');
  if (autocompleteAttr !== 'off') throw new Error('#fArea ska ha autocomplete="off" (annars blandas webbläsarens egen ifyllnadshistorik in), fick: ' + autocompleteAttr);
  const hasDatalist = await page.evaluate(() => document.querySelectorAll('datalist').length);
  if (hasDatalist !== 0) throw new Error('Förväntade att den gamla <datalist> togs bort helt, hittade ' + hasDatalist + ' st');

  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  await fArea.click();
  await page.waitForTimeout(150);
  let areaOptions = await page.evaluate(() => Array.from(document.querySelectorAll('#fAreaList .autocomplete-item')).map(el => el.dataset.value));
  const expectedAreas = ['Hus A', 'Hus B'];
  if (areaOptions.length !== 2 || !expectedAreas.every(a => areaOptions.includes(a))) {
    throw new Error('Förväntade dropdownen att bara visa sparade områden (Hus A, Hus B), fick: ' + JSON.stringify(areaOptions));
  }
  await fArea.fill('Hus B');
  await page.waitForTimeout(120);
  areaOptions = await page.evaluate(() => Array.from(document.querySelectorAll('#fAreaList .autocomplete-item')).map(el => el.dataset.value));
  if (areaOptions.length !== 1 || areaOptions[0] !== 'Hus B') throw new Error('Förväntade att skrivningen filtrerade till bara "Hus B", fick: ' + JSON.stringify(areaOptions));

  await fArea.fill('finns inte alls');
  await page.waitForTimeout(120);
  const listHiddenAfterNoMatch = await page.evaluate(() => document.getElementById('fAreaList').classList.contains('hidden'));
  if (!listHiddenAfterNoMatch) throw new Error('Dropdownen skulle döljas när inget sparat värde matchar den inskrivna texten');

  await fArea.fill('');
  await fArea.click();
  await page.waitForTimeout(120);
  await page.locator('#fAreaList .autocomplete-item[data-value="Hus A"]').click();
  const fAreaValueAfterClick = await fArea.inputValue();
  if (fAreaValueAfterClick !== 'Hus A') throw new Error('Klick på ett förslag skulle fylla i fältet, fick: "' + fAreaValueAfterClick + '"');
  console.log('OK: egen dropdown för Område visar bara sparade värden, filtrerar live och fyller i vid klick');

  await page.locator('#btnCancelLink').click();
  await page.waitForTimeout(100);

  // ============================================================
  // 3) Justerbara statusfärger via kugghjulet.
  // ============================================================
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(150);
  const expectedStatusKeys = ['ej_planerad', 'planerad', 'pagaende', 'forsenad', 'klar', 'pausad'];
  const renderedStatusInputs = await page.evaluate((keys) =>
    keys.map(k => !!document.getElementById(`statusColor_${k}`)), expectedStatusKeys);
  if (!renderedStatusInputs.every(Boolean)) throw new Error('Förväntade en färgväljare per statusvärde i inställningarna, fick: ' + JSON.stringify(renderedStatusInputs));

  await page.evaluate(() => { document.getElementById('statusColor_klar').value = '#123456'; });
  await page.locator('#btnSaveSettings').click();
  await page.waitForTimeout(300);

  const item2Badge = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.item-row')).find(r => r.textContent.includes('A2'));
    return row ? row.querySelector('.badge').getAttribute('style') : null;
  });
  if (!item2Badge || !/#123456/i.test(item2Badge)) throw new Error('Badgen för det "klar"-markerade objektet skulle använda den nya sparade färgen #123456, fick style: ' + item2Badge);
  console.log('OK: statusfärger går att ändra per status i inställningarna, och badgen i listan uppdateras direkt');

  // ============================================================
  // 4) Ta bort kommentar (+ ev. svar på den) via papperskorgen.
  // ============================================================
  const row1 = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.item-row')).find(r => r.textContent.includes('A1'));
    return row ? row.querySelector('.comment-count')?.textContent : null;
  });
  if (row1 !== '2') throw new Error('Förväntade kommentarsräknaren "2" (rot + svar) på A1 innan radering, fick: ' + row1);

  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.item-row')).find(r => r.textContent.includes('A1'));
    row.querySelector('[data-action="comments"]').click();
  });
  await page.waitForTimeout(300);

  const deleteButtons = page.locator('.comment-delete-btn');
  if (await deleteButtons.count() !== 2) throw new Error('Förväntade en papperskorgs-knapp per kommentar (rot + svar), fick ' + (await deleteButtons.count()));

  await page.locator('.comment[data-comment-id="comment-root"] > .comment-actions .comment-delete-btn').click();
  await page.waitForTimeout(300);

  if (alerts.length === 0 || !/ta bort kommentaren/i.test(alerts[alerts.length - 1])) {
    throw new Error('Förväntade en bekräftelsedialog innan kommentaren togs bort, fick: ' + JSON.stringify(alerts));
  }
  const commentsAfterDelete = await page.evaluate(() => document.getElementById('commentsList').innerText);
  if (/Det här blev fel|Håller med/.test(commentsAfterDelete)) {
    throw new Error('Kommentaren (och dess svar) skulle vara borta ur listan efter radering, innerText: ' + commentsAfterDelete);
  }
  const storedComments = store.get(`projects/${PROJECT_ID}/plan_item_comments.json`).content;
  if (storedComments.length !== 0) throw new Error('Både rot-kommentaren och svaret skulle vara borttagna i datalagret (cascade), kvar: ' + JSON.stringify(storedComments));

  await page.locator('#btnCloseComments').click();
  await page.waitForTimeout(150);
  const commentBadgeAfterDelete = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.item-row')).find(r => r.textContent.includes('A1'));
    return row ? row.querySelector('.comment-count') : null;
  });
  if (commentBadgeAfterDelete !== null) throw new Error('Kommentarsräknaren på A1 skulle försvinna helt (0 kommentarer) efter radering');
  console.log('OK: kommentarer (inkl. svar, cascade) går att ta bort via papperskorgen, med uppdaterad räknare');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: samtliga nya funktioner (panelordning, dropdown, statusfärger, kommentarsradering) fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
