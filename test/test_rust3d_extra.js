// 3D-editorn i Rust: arbetsytor, pekskärm, mörkt tema och stor modell (syntetisk, 18 600 objekt).
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const DOCS = path.join(__dirname, '..', 'docs'), SHOTS = process.env.R3_SHOTS || '';
const srv = http.createServer((q, r) => { const f = path.join(DOCS, q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const t = f.endsWith('.js') ? 'application/javascript' : f.endsWith('.wasm') ? 'application/wasm' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'; r.writeHead(200, { 'Content-Type': t }); r.end(d); } }); }).listen(8999);
const fail = m => { throw new Error(m); }; const ok = m => console.log('OK: ' + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mkPage = async (opt = {}) => { const ctx = await b.newContext({ viewport: { width: 1600, height: 960 }, ...opt }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' '))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); await p.goto('http://localhost:8999/rust3d/index.html'); await p.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20000 }); return p; };
  const shot = (p, n) => SHOTS ? p.screenshot({ path: path.join(SHOTS, n + '.png') }) : null;
  // arbetsytor
  let p = await mkPage(); await p.click('#btnSample'); await p.waitForFunction(() => window.__r3d.S.loaded); await p.waitForTimeout(300);
  await p.click('#bWs'); await p.waitForSelector('#dialog .fl-it'); const names = await p.$$eval('#dialog .fl-it b', e => e.map(x => x.textContent)); if (names.join() !== 'Modellkontroll,Stålmontage,Prefab,Mängdning') fail('Arbetsytor: ' + names);
  await p.click('#dialog .fl-it:has-text("Mängdning")'); await p.waitForTimeout(500); if ((await p.evaluate(() => window.__r3d.S.tab)) !== 'qty') fail('Arbetsytan Mängdning ska öppna mängdningsfliken');
  await p.click('#bWs'); await p.click('#dialog .fl-it:has-text("Stålmontage")'); await p.waitForTimeout(600); const vis = await p.evaluate(() => window.__r3d.S.shown.reduce((a, v) => a + v, 0)); if (vis !== 48) fail('Stålmontage ska visa bara stålkonstruktion (48 pelare), fick ' + vis);
  await p.click('#bWs'); await p.click('#wsSave'); await p.waitForSelector('#pmI'); await p.fill('#pmI', 'Min yta'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.click('#bWs'); const n2 = await p.$$eval('#dialog .fl-it b', e => e.map(x => x.textContent)); if (!n2.includes('Min yta')) fail('Egen arbetsyta saknas: ' + n2); ok('Arbetsytor: fyra färdiga (Modellkontroll, Stålmontage, Prefab, Mängdning) + egna sparade layouter'); await p.keyboard.press('Escape');
  // mörkt tema
  await p.evaluate(() => { document.getElementById('dialog').hidden = true; }); await p.click('#topTabs [data-tab=model]'); await p.click('#bTheme'); await p.waitForTimeout(400); await shot(p, 'x1_dark'); if ((await p.evaluate(() => document.documentElement.dataset.theme)) !== 'dark') fail('Mörkt tema'); ok('Mörkt tema');
  await p.context().close();
  // pekskärm: tryck markerar
  p = await mkPage({ hasTouch: true, isMobile: false }); await p.click('#btnSample'); await p.waitForFunction(() => window.__r3d.S.loaded); await p.waitForTimeout(300);
  const pt = await p.evaluate(() => { const r = window.__r3d, c = r.S.sum.bbox; r.V.vps[0].cam.pitch = 0.95; r.fitAll(0); r.draw(); const q = r.project(r.V.vps[0], [(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, 0.6]), rc = document.getElementById('gl').getBoundingClientRect(); return { x: rc.left + q[0] / r.S.dpr, y: rc.top + q[1] / r.S.dpr }; });
  await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(400); if ((await p.evaluate(() => window.__r3d.S.sel.size)) !== 1) fail('Tryck på pekskärm ska markera'); ok('Pekskärm: tryck markerar objekt'); await p.context().close();
  // stor modell
  const big = path.join(os.tmpdir(), 'r3_big.ifc'); execFileSync('node', [path.join(__dirname, '..', 'rust3d', 'tools', 'gen_ifc.js'), '600', big]);
  p = await mkPage(); const t0 = Date.now(); await p.setInputFiles('#file', big); await p.waitForFunction(() => window.__r3d.S.loaded, null, { timeout: 120000 }); const tLoad = Date.now() - t0; await p.waitForTimeout(500);
  const info = await p.evaluate(() => ({ n: window.__r3d.S.nObj, tris: window.__r3d.S.sum.tris })); if (info.n < 18000) fail('Stor modell: ' + JSON.stringify(info));
  const tPick = await p.evaluate(() => { const r = window.__r3d, t = performance.now(); let h = 0; for (let i = 0; i < 300; i++) if (r.pick(r.V.vps[0], 300 + (i % 40) * 10, 300 + (i % 25) * 10)) h++; return { ms: performance.now() - t, h }; });
  const fs2 = await p.evaluate(async () => { const r = window.__r3d; const t = performance.now(); for (let i = 0; i < 5; i++) { r.V.vps[0].cam.yaw += 0.1; r.draw(); } return (performance.now() - t) / 5; });
  await shot(p, 'x2_big'); ok(`Stor modell (${info.n.toLocaleString('sv')} objekt, ${info.tris.toLocaleString('sv')} trianglar): inläst och uppritad på ${(tLoad / 1000).toFixed(1)} s (mjukvarurendering), 300 träffsökningar ${tPick.ms.toFixed(0)} ms, ${fs2.toFixed(0)} ms per bild`);
  fs.unlinkSync(big); const errs = p.errs; if (errs.length) fail('Sidfel: ' + errs.slice(0, 3).join(' | ')); console.log('OK test_rust3d_extra'); await b.close(); srv.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
