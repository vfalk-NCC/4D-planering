// 3D-editorn i Rust (docs/rust3d): motorn i WebAssembly + nytt gränssnitt enligt designkonceptet. Syntetiska data.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const DOCS = path.join(__dirname, '..', 'docs'), SHOTS = process.env.R3_SHOTS || '';
const srv = http.createServer((q, r) => { const f = path.join(DOCS, q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const t = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'; r.writeHead(200, { 'Content-Type': t }); r.end(d); } }); }).listen(8996);
const fail = m => { throw new Error(m); }; const ok = m => console.log('OK: ' + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 960 }, acceptDownloads: true }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shot = n => SHOTS ? p.screenshot({ path: path.join(SHOTS, n + '.png') }) : null;
  const W = () => p.waitForTimeout(250);
  const scr = (pt) => p.evaluate(pt => { const r = window.__r3d, vp = r.V.vps[0]; r.draw(); const q = r.project(vp, pt), rc = document.getElementById('gl').getBoundingClientRect(); return { x: rc.left + q[0] / r.S.dpr, y: rc.top + q[1] / r.S.dpr }; }, pt);
  await p.goto('http://localhost:8996/rust3d/index.html'); await p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20000 });
  // 1. start och exempelmodell
  if (!await p.isVisible('#empty')) fail('Välkomstrutan ska synas utan modell'); await shot('t0_empty');
  await p.click('#btnSample'); await p.waitForFunction(() => window.__r3d.S.loaded, null, { timeout: 30000 }); await W();
  const sum = await p.evaluate(() => window.__r3d.S.sum); if (sum.objects !== 62 || sum.skipped.length) fail('Modellen lästes fel: ' + JSON.stringify(sum));
  if (await p.isVisible('#empty')) fail('Välkomstrutan ska döljas'); ok('Rust läser exempelmodellen: ' + sum.objects + ' objekt, ' + sum.tris + ' trianglar');
  // 2. träd i kategorier enligt konceptet
  const cats = await p.$$eval('#tree > .kids > .tn > .lab', e => e.map(x => x.textContent)); if (cats.join() !== 'Byggnadsdelar,Stålkonstruktion,Övrigt') fail('Kategorier: ' + cats);
  ok('Modellträdet grupperar i kategorier (' + cats.join(', ') + ')');
  // 3. vänsterklick markerar: blå kontur, etikett, högerpanel öppnas
  const top = await scr([15, 10, 0.5]); const hit = await p.evaluate(() => { const r = window.__r3d, c = r.S.sum.bbox; r.V.vps[0].cam.pitch = 0.95; r.fitAll(0); return [(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, 0.6]; }); void top;
  const pt = await scr(hit); await p.mouse.click(pt.x, pt.y); await W();
  if ((await p.evaluate(() => window.__r3d.S.sel.size)) !== 1) fail('Klick ska markera ett objekt'); if (await p.evaluate(() => document.getElementById('app').classList.contains('noright'))) fail('Egenskapspanelen ska öppnas vid markering');
  if (!await p.isVisible('#chip')) fail('Etikett vid markerat objekt saknas'); if (!await p.isVisible('#ctxbar')) fail('Kontextuell verktygsrad saknas');
  const ttl = await p.textContent('#rBody h3'); if (!/Bjälklag/.test(ttl)) fail('Fel objekt: ' + ttl); await shot('t1_selected'); ok('Klick markerar ' + ttl + ': etikett, kontextfält och egenskapspanel visas');
  // 4. mus: mitten-dra roterar, Skift+mitten panorerar, hjul zoomar mot pekaren, dubbelklick fokuserar
  const cam0 = await p.evaluate(() => ({ ...window.__r3d.V.vps[0].cam })); const cx = 800, cy = 520;
  await p.mouse.move(cx, cy); await p.mouse.down({ button: 'middle' }); await p.mouse.move(cx + 80, cy + 20, { steps: 5 }); await p.mouse.up({ button: 'middle' });
  const cam1 = await p.evaluate(() => ({ ...window.__r3d.V.vps[0].cam })); if (Math.abs(cam1.yaw - cam0.yaw) < 0.2) fail('Mitten-dra ska rotera kameran');
  await p.keyboard.down('Shift'); await p.mouse.move(cx, cy); await p.mouse.down({ button: 'middle' }); await p.mouse.move(cx + 60, cy, { steps: 5 }); await p.mouse.up({ button: 'middle' }); await p.keyboard.up('Shift');
  const cam2 = await p.evaluate(() => ({ ...window.__r3d.V.vps[0].cam })); if (Math.abs(cam2.yaw - cam1.yaw) > 0.01 || Math.hypot(cam2.tx - cam1.tx, cam2.ty - cam1.ty) < 0.01) fail('Skift + mitten ska panorera utan att rotera');
  await p.mouse.move(cx, cy); await p.mouse.wheel(0, -300); await W(); const cam3 = await p.evaluate(() => ({ ...window.__r3d.V.vps[0].cam })); if (!(cam3.dist < cam2.dist)) fail('Hjulet ska zooma in');
  ok('Mus: mitten-dra roterar, Skift+mitten panorerar, hjulet zoomar mot pekaren');
  // 5. snabbmeny på hållen mittenknapp
  await p.mouse.move(800, 480); await p.mouse.down({ button: 'middle' }); await p.waitForSelector('#radial:not([hidden])', { timeout: 3000 });
  const items = await p.$$eval('#radial .it', e => e.length); if (items !== 8) fail('Snabbmenyn ska ha åtta verktyg: ' + items);
  await p.mouse.move(890, 480, { steps: 4 }); await W(); const lab = await p.textContent('#radial .lab'); await shot('t2_radial'); await p.mouse.up({ button: 'middle' }); await W();
  if (await p.evaluate(() => window.__r3d.S.tool) !== 'comment') fail('Dra åt höger + släpp ska aktivera Kommentera, fick ' + lab); if (await p.isVisible('#radial')) fail('Menyn ska stängas efter valet');
  ok('Håll mittenknappen: cirkulär meny med åtta verktyg; drag åt höger + släpp aktiverade "' + lab + '"'); await p.keyboard.press('v');
  // 6. ctrl-hållning visar genvägar
  await p.keyboard.down('Control'); await p.waitForSelector('#keys:not([hidden])', { timeout: 2500 }); await p.keyboard.up('Control'); await W(); if (await p.isVisible('#keys')) fail('Genvägarna ska döljas när Ctrl släpps'); ok('Håll Ctrl visar genvägarna');
  // 7. mått
  await p.keyboard.press('m'); const pts = await Promise.all([scr([8, 6, 0.6]), scr([18, 6, 0.6])]); for (const q of pts) { await p.mouse.move(q.x, q.y); await p.waitForTimeout(120); await p.mouse.click(q.x, q.y); await p.waitForTimeout(150); }
  const md = await p.textContent('#mlist .m-it b'); if (!/^\d+[,.]\d{3} m$/.test(md.trim())) fail('Mått: ' + md); await shot('t3_measure'); ok('Mått: ' + md.trim()); await p.keyboard.press('v');
  // 8. snitt med draghandtag
  await p.keyboard.press('c'); await W(); const sec0 = await p.evaluate(() => window.__r3d.S.section.pos); const hd = await p.evaluate(() => { const s = window.__r3d.S.section; window.__r3d.draw(); const rc = document.getElementById('gl').getBoundingClientRect(); return s.handle ? { x: rc.left + s.handle.x / window.__r3d.S.dpr, y: rc.top + s.handle.y / window.__r3d.S.dpr } : null; });
  if (!hd) fail('Snitthandtag saknas'); await p.mouse.move(hd.x, hd.y); await p.mouse.down(); await p.mouse.move(hd.x, hd.y - 60, { steps: 6 }); await p.mouse.up(); const sec1 = await p.evaluate(() => window.__r3d.S.section.pos); if (Math.abs(sec1 - sec0) < 0.05) fail('Handtaget ska flytta snittplanet'); await shot('t4_section'); ok('Snitt: dra i handtaget flyttar planet (' + sec0.toFixed(2) + ' → ' + sec1.toFixed(2) + ' m)');
  await p.click('#ctxbar [data-k=secoff]'); await W();
  // 9. dölj/isolera + ångra/gör om med historik
  const t1 = await scr(hit); await p.mouse.click(t1.x, t1.y); await W(); const sh0 = await p.evaluate(() => window.__r3d.S.shown.reduce((a, v) => a + v, 0)); await p.keyboard.press('h'); await W(); const sh1 = await p.evaluate(() => window.__r3d.S.shown.reduce((a, v) => a + v, 0)); if (sh1 !== sh0 - 1) fail('H ska dölja det markerade');
  await p.keyboard.press('Control+z'); await W(); const sh2 = await p.evaluate(() => window.__r3d.S.shown.reduce((a, v) => a + v, 0)); if (sh2 !== sh0) fail('Ctrl+Z ska ångra'); await p.keyboard.press('Control+y'); await W(); if ((await p.evaluate(() => window.__r3d.S.shown.reduce((a, v) => a + v, 0))) !== sh1) fail('Ctrl+Y ska göra om'); await p.keyboard.press('Control+z'); await W();
  await p.click('#bHist'); await W(); const hn = await p.$$eval('#hist .h', e => e.length); if (hn < 2) fail('Historiken ska lista ändringar'); await shot('t5_history'); await p.click('#bHist'); ok('Dölj, ångra och gör om; historiken listar ' + hn + ' ändringar');
  // 10. egenskaper: redigera, exportera, läs in igen
  const t2 = await scr(hit); await p.mouse.click(t2.x, t2.y); await W(); await p.click('#rtabs [data-t=ifc]'); await W(); await p.fill('#rBody input[data-a="2"]', "Plattan å 'test'"); await p.dispatchEvent('#rBody input[data-a="2"]', 'change'); const pin = await p.$('#rBody .ps input[data-p]'); await pin.fill('REI120'); await pin.dispatchEvent('change');
  if (await p.getAttribute('#bExport', 'disabled') !== null) fail('Spara ändringar ska aktiveras');
  const exp = await p.evaluate(() => { const E = window.__r3d.R.E, n = E.model_export(); return Array.from(new Uint8Array(E.memory.buffer, E.out_ptr(), n)); }); const txt = Buffer.from(exp).toString('utf8');
  if (!txt.includes("\\X2\\00E5\\X0\\ ''test''") || !txt.includes('REI120')) fail('Exporterad IFC saknar ändringarna');
  await p.evaluate(async t => { await window.__r3d.loadIfc(new TextEncoder().encode(t).buffer, 'igen.ifc'); }, txt); await p.fill('#q', 'REI120'); await p.waitForTimeout(500); if (!/^1 träff/.test(await p.textContent('#qn'))) fail('Ändrat värde ska gå att söka efter'); await p.fill('#q', ''); await p.waitForTimeout(300);
  ok('Ändra namn (å, apostrof) och egenskap → exportera → läs in igen → ändringarna finns kvar');
  // 11. kommentar
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('k'); const cp = await scr(hit); await p.mouse.click(cp.x, cp.y); await p.waitForSelector('#cmT', { timeout: 3000 }); await p.fill('#cmT', 'Kontrollera genomföring här'); await p.click('#cmOk'); await W();
  if ((await p.evaluate(() => window.__r3d.S.comments.length)) !== 1) fail('Kommentar saknas'); await shot('t6_comment'); ok('Kommentar fäst i modellen');
  // 12. spara vy
  await p.evaluate(() => { window.__r3d.A.saveView(); }); await p.waitForSelector('#pmI'); await p.fill('#pmI', 'Översikt'); await p.keyboard.press('Enter'); await W(); if ((await p.evaluate(() => window.__r3d.S.views.length)) !== 1) fail('Vy saknas'); ok('Sparad vy "Översikt"');
  // 13. flikar: mängdning
  await p.click('#topTabs [data-tab=qty]'); await W(); const rows = await p.$$eval('#qTable tr.r', e => e.length); const tot = await p.textContent('#qTable tr.t'); if (rows < 3 || !/Summa/.test(tot)) fail('Mängdning'); await shot('t7_qty'); ok('Mängdning: ' + rows + ' grupper, ' + tot.replace(/\s+/g, ' ').trim());
  // 14. kollisionskontroll
  await p.click('#topTabs [data-tab=clash]'); await W(); await p.selectOption('#clA', 'all'); await p.selectOption('#clB', 'same'); await p.fill('#clD', '5'); await p.click('#clRun'); await p.waitForSelector('#clRes .cl-it, #clRes .hint', { timeout: 60000 }); await W(); const nCl = await p.$$eval('#clRes .cl-it', e => e.length); await shot('t8_clash'); ok('Kollisionskontroll: ' + nCl + ' kollisioner i exempelmodellen');
  if (nCl) { await p.click('#clRes .cl-it'); await W(); await shot('t9_clash_detail'); }
  await p.click('#topTabs [data-tab=model]'); await W();
  // 15. vyer: delad vy och flera paneler, planvy
  await p.selectOption('#vMode', 'split'); await W(); await p.waitForTimeout(400); await shot('t10_split'); const vps = await p.evaluate(() => window.__r3d.V.vps.length); if (vps !== 2) fail('Delad vy ska ha två rutor'); await p.selectOption('#vMode', 'multi'); await p.waitForTimeout(400); await shot('t11_multi'); if ((await p.evaluate(() => window.__r3d.V.vps.length)) !== 4) fail('Flera paneler ska ha fyra rutor'); await p.selectOption('#vMode', '3d'); ok('Delad vy (3D + plan) och flera paneler (3D, plan, fram, sida)');
  // 15b. flera modeller i samma vy (federerad modell)
  await p.evaluate(async () => { await window.__r3d.loadIfc(await (await fetch('sample.ifc')).arrayBuffer(), 'A.ifc'); }); const n1 = await p.evaluate(() => window.__r3d.S.nObj);
  await p.setInputFiles('#file', path.join(DOCS, 'rust3d', 'sample.ifc')); await p.waitForSelector('#dialog:not([hidden]) [data-o]'); await p.click('#dialog [data-o="1"]'); await p.waitForFunction(n => window.__r3d.S.nObj === 2 * n, n1, { timeout: 20000 });
  const srcs = await p.evaluate(() => ({ n: window.__r3d.S.sources.length, same: window.__r3d.S.objGuid[0] === window.__r3d.S.objGuid[window.__r3d.S.nObj / 2] })); if (srcs.n !== 2 || !srcs.same) fail('Två modeller ska ligga i samma vy: ' + JSON.stringify(srcs));
  await p.click('#lBody #ltabs [data-t=filter]'); await W(); const mods = await p.$$('#fSrc .tn'); if (mods.length !== 2) fail('Filter ska lista modellerna'); await p.click('#fGrp [data-g=src]'); await p.click('#lBody #ltabs [data-t=obj]'); await W(); const top2 = await p.$$eval('#tree > .kids > .tn > .lab', e => e.map(x => x.textContent)); if (top2.length !== 2) fail('Trädet ska kunna grupperas per modell: ' + top2);
  await p.evaluate(() => { document.querySelector('#fSrc')?.remove(); window.__r3d.UI.group = 'cat'; }); await p.evaluate(() => { const S = window.__r3d.S; window.__r3d.A.selectMany(Array.from({ length: S.nObj }, (_, i) => i).filter(i => S.objSrc[i] === 1)); window.__r3d.A.hideSel(); }); await W(); const vis = await p.evaluate(() => window.__r3d.S.shown.reduce((a, v) => a + v, 0)); if (vis !== n1) fail('Att dölja den ena modellen ska lämna den andra: ' + vis);
  await p.evaluate(() => { const A = window.__r3d.A, S = window.__r3d.S; A.selectOnly(S.nObj - 1); }); await p.click('#rtabs [data-t=ifc]'); await p.fill('#rBody input[data-a="2"]', 'Bara andra'); await p.dispatchEvent('#rBody input[data-a="2"]', 'change'); const ed = await p.evaluate(() => { const E = window.__r3d.R.E; E.model_edited_sources(); return Array.from(new Uint8Array(E.memory.buffer, E.out_ptr(), 3)).map(c => String.fromCharCode(c)).join(''); }); if (ed !== '[1]') fail('Ändringen ska höra till modell 2, fick ' + ed);
  await shot('t13_models'); ok('Flera modeller i samma vy: tillägg, gruppering per modell, dölj/visa per modell och ändringar sparas per källfil (' + ed + ')');
  // 16. punktmoln + avvikelse
  await p.evaluate(async () => { await window.__r3d.loadIfc(await (await fetch('sample.ifc')).arrayBuffer(), 'exempel.ifc'); }); await p.click('#lBody #ltabs [data-t=filter]'); await p.click('#cDemo'); await p.waitForFunction(() => window.__r3d.S.cloud, null, { timeout: 30000 }); await W(); await p.click('#btnDev'); await p.waitForSelector('#devOut .stat', { timeout: 60000 }); const st = await p.evaluate(() => window.__r3d.S.devStats);
  if (!(st.evaluated > 100000 && st.withinTolPct > 85 && st.withinTolPct < 99.9)) fail('Avvikelse: ' + JSON.stringify(st)); await shot('t12_cloud'); ok('Punktmoln ' + st.points + ' punkter, avvikelse: ' + st.withinTolPct.toFixed(1) + ' % inom 20 mm');
  if (errs.length) fail('Sidfel: ' + errs.slice(0, 3).join(' | '));
  console.log('OK test_rust3d'); await b.close(); srv.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
