// TC Bubbles – lite-app. Kör: NODE_PATH=/opt/node22/lib/node_modules node test/test_tcbubbles.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs', 'tc-bubbles'), PORT = 8993;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const fail = m => { throw new Error(m); }, ok = (c, m) => { if (!c) fail(m); };
(async () => {
  const server = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/host.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end('<iframe id="f" src="/index.html" style="width:1300px;height:800px;border:0"></iframe>'); }
    fs.readFile(path.join(DOCS, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(d); } });
  }).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await browser.newContext({ viewport: { width: 1320, height: 820 }, acceptDownloads: true })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__cam = { position: { x: 0, y: -40, z: 20 }, target: { x: 0, y: 0, z: 0 }, fov: 60 }; window.__sets = 0;
    window.TrimbleConnectWorkspace = { connect: () => Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: 'P1', name: 'Testprojekt' }) },
      viewer: { getCamera: () => Promise.resolve(window.__cam), setCamera: c => { window.__cam = c; window.__sets++; return Promise.resolve(); },
        getSnapshot: () => { const c = document.createElement('canvas'); c.width = 1200; c.height = 700; const x = c.getContext('2d'); x.fillStyle = '#dde3e8'; x.fillRect(0, 0, 1200, 700); x.fillStyle = '#7a8a99'; x.fillRect(300, 300, 400, 250); return Promise.resolve(c.toDataURL('image/png')); } } }) };` }));
  await page.goto(`http://localhost:${PORT}/host.html`); const fr = page.frameLocator('#f'); const F = page.frames().find(f => f !== page.mainFrame());
  await F.waitForFunction(() => window.__tcb && window.__tcb.S.bmp, null, { timeout: 15000 });
  ok(await F.evaluate(() => window.__tcb.tcOn()), 'Ska vara ansluten till Trimble Connect');
  const ev = (fn, a) => F.evaluate(fn, a);
  // 1) Foto togs vid start; lägg bubbla genom att klicka i bilden
  await fr.locator('[data-act="add"]').click();
  const pos = async (fx, fy) => ev(([fx, fy]) => { const c = document.getElementById('cv'), r = c.getBoundingClientRect(); return { x: r.left + fx * r.width, y: r.top + fy * r.height }; }, [fx, fy]);
  let p = await pos(0.5, 0.6); const off = await page.locator('#f').boundingBox(); await page.mouse.click(off.x + p.x, off.y + p.y); await page.waitForTimeout(200);
  ok(await ev(() => window.__tcb.S.bubbles.length) === 1, 'Bubbla ska skapas vid klick');
  // 2) Redigera: rubrik, aktivitet, datum, procent
  await fr.locator('#fName').fill('Gjutning pelare P1'); await fr.locator('#fAct').fill('Armering klar'); await fr.locator('#fDt').fill('3 dec – 12 dec'); await fr.locator('#fProgN').fill('40'); await fr.locator('#fProgN').press('Tab'); await page.waitForTimeout(150);
  let b = await ev(() => { const x = window.__tcb.S.bubbles[0]; return { n: x._name.join(' '), prog: x.prog, sub: x._sub.join('|'), col: x.col }; });
  ok(/Gjutning pelare P1/.test(b.n) && b.prog === 40 && /3 dec/.test(b.sub) && /Armering/.test(b.sub), 'Redigering: ' + JSON.stringify(b));
  // 3) Dra kortet, sedan lås
  const g = await ev(() => { const S = window.__tcb.S, b = S.bubbles[0], c = document.getElementById('cv'), r = c.getBoundingClientRect(); return { x: r.left + (b._x + b._w / 2) * r.width / S.W, y: r.top + (b._y + b._h / 2) * r.height / S.H, fx: b.fx, fy: b.fy }; });
  await page.mouse.move(off.x + g.x, off.y + g.y); await page.mouse.down(); await page.mouse.move(off.x + g.x + 90, off.y + g.y + 40, { steps: 5 }); await page.mouse.up();
  const m1 = await ev(() => { const b = window.__tcb.S.bubbles[0]; return [b.fx, b.fy]; }); ok(m1[0] > g.fx + 0.03 && m1[1] > g.fy + 0.02, 'Dragning: ' + JSON.stringify([g, m1]));
  await fr.locator('#fLock').click();
  const g2 = await ev(() => { const S = window.__tcb.S, b = S.bubbles[0], c = document.getElementById('cv'), r = c.getBoundingClientRect(); return { x: r.left + (b._x + b._w / 2) * r.width / S.W, y: r.top + (b._y + b._h / 2) * r.height / S.H }; });
  await page.mouse.move(off.x + g2.x, off.y + g2.y); await page.mouse.down(); await page.mouse.move(off.x + g2.x + 80, off.y + g2.y + 50, { steps: 4 }); await page.mouse.up();
  const m2 = await ev(() => { const b = window.__tcb.S.bubbles[0]; return [b.fx, b.fy, b.lock]; }); ok(m2[2] && m2[0] === m1[0] && m2[1] === m1[1], 'Låst bubbla ska ligga kvar: ' + JSON.stringify(m2));
  // 4) Dubblera, +% på alla, ordna
  await fr.locator('[data-act="dup"]').click(); ok(await ev(() => window.__tcb.S.bubbles.length) === 2, 'Dubblera');
  await fr.locator('#bumpN').fill('25'); await fr.locator('#bump').click();
  ok(await ev(() => window.__tcb.S.bubbles.map(b => b.prog).join()) === '65,65', 'Alla +25 %');
  await fr.locator('[data-act="arrange"]').click(); const lk = await ev(() => { const b = window.__tcb.S.bubbles[0]; return [b.fx, b.fy]; }); ok(lk[0] === m1[0] && lk[1] === m1[1], 'Ordna rör inte låsta');
  // 5) Datumskylt + spara vy
  await fr.locator('#dOn').check(); await fr.locator('#dText').fill('v.47 · 17 nov 2026'); await fr.locator('#dText').press('Tab');
  await fr.locator('#vName').fill('Infart'); await fr.locator('#vSave').click(); await page.waitForTimeout(150);
  const sv = await ev(() => JSON.parse(localStorage.getItem('tcb-views:P1'))[0]); ok(sv.name === 'Infart' && sv.data.bubbles.length === 2 && sv.data.asp > 0 && sv.data.cam && sv.data.bubbles[0].lock === true && sv.data.date.text === 'v.47 · 17 nov 2026', 'Vyn sparas: ' + JSON.stringify(sv).slice(0, 300));
  // 6) Ändra allt, byt kamera, använd vyn
  await ev(() => { const S = window.__tcb.S; S.bubbles.length = 0; S.date.on = false; window.__cam = { position: { x: 5, y: 5, z: 30 }, target: { x: 0, y: 0, z: 0 }, fov: 60 }; window.__sets = 0; });
  await fr.locator('#vUse').click(); await page.waitForTimeout(1500);
  const bk = await ev(() => { const S = window.__tcb.S; return { n: S.bubbles.length, lock: S.bubbles[0].lock, pos: [S.bubbles[0].fx, S.bubbles[0].fy], name: S.bubbles[0].name, d: S.date.on && S.date.text, cam: JSON.stringify(window.__cam) === JSON.stringify(JSON.parse(localStorage.getItem('tcb-views:P1'))[0].data.cam), sets: window.__sets }; });
  ok(bk.n === 2 && bk.lock && Math.abs(bk.pos[0] - m1[0]) < 1e-6 && bk.name === 'Gjutning pelare P1' && bk.d === 'v.47 · 17 nov 2026' && bk.cam && bk.sets > 0, 'Vyn återskapar exakt: ' + JSON.stringify(bk));
  // 7) Annat bildformat varnar; nästa vecka kopierar med +7 dagar
  await ev(() => { const v = window.__tcb.views(); v[0].data.asp = 0.9; });
  await fr.locator('#vUse').click(); await page.waitForTimeout(1200); ok(/format/.test(await fr.locator('#msg').textContent()), 'Varning vid annat format');
  await ev(() => { window.__tcb.views()[0].data.asp = 1.714; });
  await fr.locator('#vWeek').click(); await page.waitForTimeout(150);
  const vs = await ev(() => window.__tcb.views().map(v => [v.name, v.data.date.text])); ok(vs.length === 2 && /· v\.48$/.test(vs[1][0]) && /^v\.48 · 24 nov 2026$/.test(vs[1][1]), 'Ny vecka: ' + JSON.stringify(vs));
  // 8) Ångra, export
  await fr.locator('[data-act="undo"]').click();
  const [d1] = await Promise.all([page.waitForEvent('download'), fr.locator('[data-act="png"]').click()]); ok(/\.png$/.test(d1.suggestedFilename()), 'PNG');
  const [d2] = await Promise.all([page.waitForEvent('download'), fr.locator('[data-act="pdf"]').click()]); const pf = path.join(require('os').tmpdir(), 'tcb.pdf'); await d2.saveAs(pf); const pdf = fs.readFileSync(pf, 'latin1'); ok(/^%PDF-1.4/.test(pdf) && /DCTDecode/.test(pdf) && /%%EOF/.test(pdf), 'PDF');
  const [d3] = await Promise.all([page.waitForEvent('download'), fr.locator('#vExp').click()]); const ex = JSON.parse(fs.readFileSync(await d3.path(), 'utf8')); ok(ex.app === 'tc-bubbles' && ex.views.length === 2, 'Export av vyer');
  // 9) Utkast överlever omladdning
  await page.reload(); await page.waitForTimeout(1500); const F2 = page.frames().find(f => f !== page.mainFrame()); await F2.waitForFunction(() => window.__tcb);
  ok(await F2.evaluate(() => window.__tcb.S.bubbles.length) >= 1, 'Utkastet ska finnas kvar');
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  console.log('OK test_tcbubbles'); await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
