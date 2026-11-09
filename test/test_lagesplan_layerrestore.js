// Funktionstest: lagerfilens skydd (krymper inte kraftigt) och Återställ från tidigare version (mappar, vyer, ortofoton, mallar).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8993;
const PID = 'p1';
const it = (id, name, extra) => ({ id, object_name: name, activity: 'Gjutning ' + name, area: 'PM1', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 10, ...extra });
const items = [it('a', 'J1', { source_key: 'k1' }), it('b', 'J1b', { source_key: 'k1', activity: 'Gjutning J1' }), it('c', 'K2'), it('d', 'L3'), it('e', 'Utanför')];
const pos = [{ id: 'a', x: 10, y: 10, z0: 0, z1: 1 }, { id: 'b', x: 12, y: 10, z0: 0, z1: 1 }, { id: 'c', x: 30, y: 20, z0: 0, z1: 1 }, { id: 'd', x: 50, y: 30, z0: 0, z1: 1 }];
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify(items)], [`projects/${PID}/status_plans.json`, '[]'], [`projects/${PID}/plan_item_positions.json`, JSON.stringify(pos)]]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  require('./_reveal').autoReveal(page); // flikar och menyer (UI-översynen 2026-10-09)
  page.on('dialog', d => d.accept());
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,400)); }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-objmovefree', '0'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/commits')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ sha: 'sha1', commit: { message: 'Lägesplan: spara ortofoto', author: { date: '2026-11-05T10:00:00Z' } } }]) });
    const ref = u.searchParams.get('ref'); let f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', '')); if (ref && ref !== 'main' && r.request().method() === 'GET') f = f + '@' + ref;
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
  await page.evaluate(() => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    ['zoneCanvas', 'objCanvas', 'topCanvas'].forEach(id => { $(id).width = 1000; $(id).height = 800; });
    $('empty').classList.add('hidden');
    plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
    invalidatePositions(); view.scale = 1; applyView(); renderZones();
  });
  const vb = await page.locator('#viewport').boundingBox();



  const SP = `projects/${PID}/site_layers.json`;
  const cur = [{ id: 'layermeta', type: 'layermeta', folders: [{ id: 'fA', name: 'MAPP A' }], folderOf: {}, names: {} }, { id: 'v1', type: 'objview', name: 'Vy 1' }];
  const old = [{ id: 'layermeta', type: 'layermeta', folders: [{ id: 'fA', name: 'MAPP A' }, { id: 'fB', name: 'MAPP B' }], folderOf: { 'ul:Etablering': 'fB' }, names: { pdf: 'Ritning X' } }, { id: 'v1', type: 'objview', name: 'Vy 1' }, { id: 'v2', type: 'objview', name: 'Vy 2' }, { id: 'v3', type: 'objview', name: 'Vy 3' }, { id: 'o1', type: 'ortho', name: 'Ortofoto 1' }, { id: 'p1', type: 'printtpl', name: 'Layout A3' }, { id: 'c1', type: 'cad', name: 'DXF 1', layers: [] }, { id: 'n1', type: 'note', name: 'Notering' }];
  store.set(SP, JSON.stringify(cur)); store.set(SP + '@sha1', JSON.stringify(old));
  await page.evaluate(() => loadSiteLayers()); await page.waitForTimeout(400);
  // 1) Återställ: välj version → se vad som saknas → lägg tillbaka
  await page.click('#btnLayerRestore'); await page.waitForSelector('[data-lr-v]'); await page.click('[data-lr-v="0"]'); await page.waitForSelector('[data-lr-go]');
  const txt = await page.evaluate(() => document.querySelector('.na-card').innerText);
  if (!/2\s+Sparade vyer/.test(txt) || !/1\s+Ortofoton/.test(txt) || !/1\s+Utskriftsmallar/.test(txt) || !/DXF-lager/.test(txt) || !/Mappar och visningsnamn/.test(txt)) fail('Återställningen ska visa vad som saknas: ' + txt);
  await page.click('[data-lr-go]'); await page.waitForTimeout(4000);
  const back = JSON.parse(store.get(SP)), ids = back.map(x => x.id).sort().join(',');
  if (ids !== 'c1,layermeta,n1,o1,p1,v1,v2,v3') fail('Saknade poster ska läggas tillbaka (och inget annat ändras): ' + ids);
  const m = back.find(x => x.id === 'layermeta');
  if (m.folders.map(f => f.id).join() !== 'fA,fB' || m.folderOf['ul:Etablering'] !== 'fB' || m.names.pdf !== 'Ritning X') fail('Mapparna ska slås ihop med de som finns: ' + JSON.stringify(m));
  console.log('OK: återställning från tidigare version lägger tillbaka mappar, vyer, ortofoton, mallar och DXF-lager');
  // 2) Skydd: lagerfilen får inte krympa kraftigt i en skrivning
  const g = await page.evaluate(async () => { const out = {}; try { await ghWriteJSON(token, sitePath(), arr => arr.slice(0, 1), 'test'); out.shrink = 'skrevs'; } catch (e) { out.shrink = e.message; } try { await ghWriteJSON(token, sitePath(), arr => [...arr, { id: 'zz', type: 'note' }], 'test'); out.add = 'ok'; } catch (e) { out.add = e.message; } return out; });
  if (!/Skyddet stoppade/.test(g.shrink) || g.add !== 'ok') fail('Skyddet ska stoppa en kraftig krympning men tillåta vanlig sparning: ' + JSON.stringify(g));
  if (JSON.parse(store.get(SP)).length < 8) fail('Lagerfilen ska vara orörd efter stoppad skrivning');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: skyddet stoppar kraftig krympning av lagerfilen'); console.log('OK test_lagesplan_layerrestore'); await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
