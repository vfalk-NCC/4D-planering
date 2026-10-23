// Rust-labbet (docs/rust3d): motorn i WebAssembly läser IFC, bygger geometri, svarar på träffar, ändrar egenskaper,
// läser punktmoln och räknar avvikelse. Syntetiska data – inga riktiga.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const DOCS = path.join(__dirname, '..', 'docs'), SHOTS = process.env.R3_SHOTS || '';
const srv = http.createServer((q, r) => { const f = path.join(DOCS, q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const t = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'; r.writeHead(200, { 'Content-Type': t }); r.end(d); } }); }).listen(8996);
const fail = m => { throw new Error(m); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8996/rust3d/index.html'); await p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20000 });
  const shot = n => SHOTS ? p.screenshot({ path: path.join(SHOTS, n + '.png') }) : null;
  // 1. exempelmodellen
  await p.click('#btnSample'); await p.waitForFunction(() => window.__r3d.S.loaded, null, { timeout: 30000 }); await p.waitForTimeout(400);
  const sum = await p.evaluate(() => window.__r3d.S.sum);
  if (sum.objects !== 62 || sum.tris < 700 || sum.skipped.length) fail('Modellen lästes fel: ' + JSON.stringify(sum));
  if (await p.isVisible('#empty')) fail('Välkomstrutan ska döljas när modellen är inläst');
  console.log('OK: exempelmodellen (IFC med extruderade profiler, mappade pelare, ytnät, färger) läses av Rust: ' + sum.objects + ' objekt, ' + sum.tris + ' trianglar');
  // 2. träd per våning, sök
  const floors = await p.$$eval('#tree > .tn > .lab', e => e.map(x => x.textContent)); if (floors.join() !== 'Plan 1,Plan 2') fail('Träd per våning: ' + floors);
  await p.fill('#q', 'brandklass rei60'); await p.waitForTimeout(400);
  const qn = await p.textContent('#qn'); if (!/^2 träffar/.test(qn)) fail('Sök i egenskapsvärden: ' + qn);
  await p.fill('#q', 'pelare 2-'); await p.waitForTimeout(400); if (!/^24 träffar/.test(await p.textContent('#qn'))) fail('Sök på namn: ' + await p.textContent('#qn'));
  await p.fill('#q', ''); await p.waitForTimeout(300);
  console.log('OK: träd per våning och sök i namn, klass och egenskaper (' + qn.split('·')[0].trim() + ' för "brandklass rei60")');
  // 3. träff mitt på bjälklaget och markering
  const hit = await p.evaluate(() => { const r = window.__r3d; r.S.cam.yaw = -0.8; r.S.cam.pitch = 0.9; r.fitAll(); r.draw(); const c = r.S.sum.bbox, t = [(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, 0.6]; const q = r.project(t), rc = document.getElementById('gl').getBoundingClientRect(); return { x: rc.left + q[0] / r.S.dpr, y: rc.top + q[1] / r.S.dpr }; });
  await p.mouse.click(hit.x, hit.y); await p.waitForTimeout(300);
  const selN = await p.evaluate(() => window.__r3d.S.sel.size); if (selN !== 1) fail('Klick ska markera ett objekt, fick ' + selN);
  const title = await p.textContent('#insp h3'); if (!/Bjälklag/.test(title)) fail('Klick på golvet ska ge ett bjälklag: ' + title);
  await shot('r3_selected');
  console.log('OK: klick träffar rätt objekt via BVH i Rust (' + title + ') och visar egenskaper');
  // 4. ändra egenskap + namn → exportera → läs tillbaka
  await p.fill('#insp input[data-a="2"]', 'Plattan å \'test\''); await p.dispatchEvent('#insp input[data-a="2"]', 'change');
  const prop = await p.$('#insp .ps input:not(.ro)'); await prop.fill('REI120'); await prop.dispatchEvent('change');
  if (await p.getAttribute('#btnExport', 'disabled') !== null) fail('Exportknappen ska aktiveras efter ändring');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]); const file = await dl.path(); const txt = fs.readFileSync(file, 'utf8');
  if (!txt.includes("\\X2\\00E5\\X0\\ ''test''") || !txt.includes('REI120') || !txt.includes('IFCWALL(')) fail('Exporterad IFC saknar ändringarna');
  await p.evaluate(async t => { await window.__r3d.loadIfc(new TextEncoder().encode(t), 'igen.ifc'); }, txt); await p.fill('#q', 'REI120'); await p.waitForTimeout(400);
  const again = await p.textContent('#qn'); if (!/^1 träff/.test(again)) fail('Den ändrade egenskapen ska gå att söka efter i den nya filen: ' + again);
  await p.fill('#q', ''); await p.waitForTimeout(200);
  console.log('OK: ändra namn (med å och apostrof) och egenskap → exportera IFC → läs in igen → ändringarna finns kvar');
  // 5. mått
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press('2'); const pts = await p.evaluate(() => { const r = window.__r3d, c = r.S.sum.bbox; r.S.cam.pitch = 0.9; r.fitAll(); r.draw(); const rc = document.getElementById('gl').getBoundingClientRect(), f = pt => { const q = r.project(pt); return [rc.left + q[0] / r.S.dpr, rc.top + q[1] / r.S.dpr]; }; return [f([c[0] + 5, c[1] + 5, 0.6]), f([c[0] + 15, c[1] + 5, 0.6])]; });
  for (const q of pts) { await p.mouse.move(q[0], q[1]); await p.waitForTimeout(120); await p.mouse.click(q[0], q[1]); await p.waitForTimeout(150); }
  const md = await p.textContent('#mlist .m-it b'); if (!/^10[,.]\d{3} m$/.test(md.trim().replace(/ /g, ' '))) fail('Måttet ska bli ca 10 m: ' + md);
  console.log('OK: mått mellan två punkter på golvet = ' + md);
  // 6. snitt
  await p.keyboard.press('3'); await p.fill('#sPos', '300'); await p.waitForTimeout(200); const clip = await p.evaluate(() => window.__r3d.S.section.on); if (!clip) fail('Snitt ska vara på'); await shot('r3_section'); await p.evaluate(() => { window.__r3d.S.section.on = false; document.getElementById('sOn').checked = false; window.__r3d.setTool('select'); });
  // 7. punktmoln + avvikelse
  await p.evaluate(async () => { await window.__r3d.loadIfc(await (await fetch('sample.ifc')).arrayBuffer(), 'exempel.ifc'); }); await p.click('#ltabs [data-t=cloud]'); await p.click('#btnDemoCloud'); await p.waitForFunction(() => window.__r3d.S.cloud, null, { timeout: 30000 }); await p.waitForTimeout(300);
  await p.click('#btnDev'); await p.waitForSelector('#devOut .stat', { timeout: 60000 });
  const st = await p.evaluate(() => window.__r3d.S.devStats); if (!(st.evaluated > 100000 && st.withinTolPct > 85 && st.withinTolPct < 99.9 && st.max > 0.05)) fail('Avvikelse: ' + JSON.stringify(st));
  await shot('r3_cloud'); console.log('OK: punktmoln ' + st.points + ' punkter, avvikelse mot modellen: ' + st.withinTolPct.toFixed(1) + ' % inom 20 mm, störst ' + (st.max * 1000).toFixed(0) + ' mm');
  if (errs.length) fail('Sidfel: ' + errs.slice(0, 3).join(' | '));
  console.log('OK test_rust3d'); await b.close(); srv.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
