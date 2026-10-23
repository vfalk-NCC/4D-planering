// 3D-editorn i Rust ↔ 4D-planering: Trimble Connect-mappar/filer, tidplan (4D) och sparande till TC via bryggan (simulerad moderapp).
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const DOCS = path.join(__dirname, '..', 'docs'), SHOTS = process.env.R3_SHOTS || '';
const PARENT = `<!doctype html><meta charset=utf-8><title>mock 4D-planering</title><body><script>
window.lagesplanHandle = function () {}; window.uploads = []; window.sel = [];
window.addEventListener('message', async e => { const m = e.data; if (!m || !m.lagesplan) return; const reply = (p, t) => e.source.postMessage({ lagesplanReply: true, reqId: m.reqId, ...p }, location.origin, t || []);
  if (m.type === 'hello') reply({ settings: { githubToken: 'tok', userName: 'Victor Falk', planSource: 'pp' }, projectId: 'p1', planSource: 'pp' });
  else if (m.type === 'tcFolder') reply({ folderId: m.folderId || 'root', projectName: 'Test', items: m.folderId === 'f1' ? [{ id: 'm1', name: 'Hus A.ifc', type: 'file', size: 36000 }, { id: 'm2', name: 'Planlösning.pdf', type: 'file', size: 1000 }] : [{ id: 'f1', name: 'Modeller', type: 'folder' }, { id: 'd1', name: 'Ritning A-101.pdf', type: 'file', size: 2000 }, { id: 'd2', name: 'Beskrivning.docx', type: 'file', size: 3000 }] });
  else if (m.type === 'tcFile') { const r = await fetch('/rust3d/sample.ifc'); const b = await r.arrayBuffer(); reply({ bytes: b }, [b]); }
  else if (m.type === 'tcUpload') { window.uploads.push((m.files || []).map(f => ({ name: f.name, size: f.size }))); reply({ uploaded: (m.files || []).length, folder: m.folder || '3D-editor' }); }
  else if (m.type === 'select') { window.sel = m.ids; reply({ count: (m.ids || []).length }); } else reply({ error: 'okänd: ' + m.type }); });
</script><button id=go onclick="window.w=window.open('/rust3d/index.html')">öppna</button>`;
const srv = http.createServer((q, r) => { if (q.url === '/__parent.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(PARENT); } const f = path.join(DOCS, q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const t = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'; r.writeHead(200, { 'Content-Type': t }); r.end(d); } }); }).listen(8998);
const fail = m => { throw new Error(m); }; const ok = m => console.log('OK: ' + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 1600, height: 960 } });
  const parent = await ctx.newPage(); await parent.goto('http://localhost:8998/__parent.html'); const [p] = await Promise.all([ctx.waitForEvent('page'), parent.click('#go')]); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20000 }); const shot = n => SHOTS ? p.screenshot({ path: path.join(SHOTS, n + '.png') }) : null;
  await p.waitForSelector('#btnTC:not([hidden])', { timeout: 8000 }); if (!/Victor/.test(await p.evaluate(() => window.__r3d.S.user.name))) fail('Användarnamnet ska komma från 4D-planering');
  ok('Bryggan hittar 4D-planering (knappen "Från Trimble Connect" visas, inloggad som Victor Falk)');
  // öppna från TC
  await p.click('#btnTC'); await p.waitForSelector('#tcBrowser .fl-it'); const l1 = await p.$$eval('#tcBrowser .fl-it b', e => e.map(x => x.textContent)); if (l1.join() !== 'Modeller') fail('Rotmappen visar bara mappar och modeller/moln: ' + l1);
  await p.click('#tcBrowser .fl-it'); await p.waitForFunction(() => document.querySelectorAll('#tcBrowser .fl-it').length === 1 && /Hus A/.test(document.querySelector('#tcBrowser .fl-it b').textContent)); await shot('b1_tcbrowser');
  await p.click('#tcBrowser .fl-it'); await p.waitForFunction(() => window.__r3d.S.loaded, null, { timeout: 30000 }); await p.waitForTimeout(400); ok('Öppna modell från Trimble Connect-mapp (bläddra Modeller → Hus A.ifc)');
  // ritningar och dokument
  await p.click('#topTabs [data-tab=drawings]'); await p.waitForSelector('#fsHost .fl-it'); const dr = await p.$$eval('#fsHost .fl-it b', e => e.map(x => x.textContent)); if (!dr.includes('Ritning A-101.pdf') || dr.includes('Beskrivning.docx')) fail('Ritningar: ' + dr);
  await p.click('#topTabs [data-tab=docs]'); await p.waitForFunction(() => /Beskrivning/.test(document.getElementById('lBody').textContent)); ok('Ritningar och Dokument listar projektets filer ur Trimble Connect (filtrerat)');
  // tidplan (4D)
  const rows = []; const mk = (id, name, s, e, prog, objs) => objs.forEach((g, i) => rows.push({ id: id + '-' + i, group_id: id, activity: name, area: '741 - Sektionsfickor', contractor: 'Wikströms', start_date: s, end_date: e, progress: prog, object_id: g }));
  mk('a1', 'Stomme plan 1', '2026-10-01', '2026-10-10', 100, ['SL0', 'W00', 'W01', 'W02', 'W03']); mk('a2', 'Stomme plan 2', '2026-10-12', '2026-10-24', 40, ['SL1', 'W10', 'W11', 'W12', 'W13']); mk('a3', 'Pelare plan 2', '2026-10-25', '2026-11-05', 0, ['C100', 'C101', 'C102']);
  await p.evaluate(r => { window.ghReadJSON = async () => r; }, rows); await p.click('#topTabs [data-tab=plan]'); await p.waitForSelector('#plList .act'); const acts = await p.$$eval('#plList .act b', e => e.map(x => x.textContent)); if (acts.length !== 3) fail('Aktiviteter: ' + acts);
  await p.waitForSelector('#timeline:not([hidden])'); await p.evaluate(() => { document.activeElement.blur(); }); const linked = await p.evaluate(() => [...window.__r3d.S.override.keys()].length); if (linked < 12) fail('Objekt ska kopplas via IFC-GlobalId, kopplade: ' + linked);
  await p.evaluate(() => { const r = document.getElementById('tlR'); r.value = 15; r.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(300); const colors = await p.evaluate(() => { const S = window.__r3d.S, ix = g => S.guidIx.get(g), c = g => S.override.get(ix(g)).join(); return { done: c('SL0'), run: c('SL1'), planned: c('C100'), date: document.querySelector('#timeline b').textContent }; });
  if (colors.done !== '34,197,94' || colors.run !== '245,158,11' || colors.planned !== '203,213,225') fail('Statusfärger per datum: ' + JSON.stringify(colors)); await shot('b2_plan'); ok('Tidplan (4D): aktiviteter kopplas till objekt via GlobalId och färgas efter datum (' + colors.date + ': klart/pågår/planerat)');
  await p.click('#plList .act'); await p.waitForTimeout(400); if ((await p.evaluate(() => window.__r3d.S.sel.size)) !== 5) fail('Klick på aktivitet ska markera dess objekt'); await p.waitForTimeout(300); if (!(await parent.evaluate(() => window.sel.length))) fail('Markeringen ska skickas till 4D-planering'); ok('Aktivitet markerar sina objekt i modellen och i 4D-planering');
  // spara till TC
  await p.click('#topTabs [data-tab=model]'); await p.waitForTimeout(300); await p.evaluate(() => { window.__r3d.A.selectOnly(0); }); await p.click('#rtabs [data-t=ifc]'); await p.fill('#rBody input[data-a="2"]', 'Ändrad'); await p.dispatchEvent('#rBody input[data-a="2"]', 'change');
  await p.click('#bExport'); await p.waitForSelector('#pmI'); await p.fill('#pmI', 'Test till TC'); await p.keyboard.press('Enter'); await p.waitForSelector('[data-o="1"]'); await p.click('[data-o="1"]'); await p.waitForFunction(() => true); await p.waitForTimeout(600);
  const up = await parent.evaluate(() => window.uploads); if (!up.length || up[0][0].name !== 'Test till TC.ifc' || up[0][0].size < 1000) fail('Uppladdning till TC: ' + JSON.stringify(up)); ok('Ändrad IFC sparas i Trimble Connect via 4D-planering (' + up[0][0].name + ', ' + up[0][0].size + ' byte)');
  if (errs.length) fail('Sidfel: ' + errs.slice(0, 3).join(' | ')); console.log('OK test_rust3d_bridge'); await b.close(); srv.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
