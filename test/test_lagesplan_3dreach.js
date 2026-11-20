const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9321;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };

  const files = new Map();   // projektets "GitHub": sökväg -> base64
  const route = async pg => {
    await pg.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await pg.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
      if (req.method() === 'GET') { const b = files.get(f); if (b == null) return r.fulfill({ status: 404, body: '{}' }); if (/raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(b, 'base64') }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b, sha: 's' + b.length, size: b.length }) }); }
      const body = JSON.parse(req.postData()); files.set(f, body.content); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + body.content.length } }) });
    });
  };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage(); await require('./_dialogs').bridge(page, d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const openEditor = async pg => {
    await route(pg); await pg.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await pg.waitForTimeout(900);
    await pg.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
    await pg.click('#btn3d'); await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3bubPanel === 'function', null, { timeout: 15000 });
    await pg.evaluate(() => l3dkToggle(true));
  };
  await openEditor(page);
  const ok = (c, m) => { if (!c) fail(m); };
  const tk = async () => page.evaluate(() => { placements = [{ id: 'tk1', type: 'tornkran', name: 'Kran', x: 6512340, y: 150105, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' }, { id: 'pb1', type: 'pumpbil', name: 'Pump', x: 6512400, y: 150105, z: 0, L: 10.5, B: 2.55, H: 3.9, R: 28, rot: 0, dz: 0, color: '#e11d48' }]; l3BuildPlacements(); l3Render();
    const info = id => { const g = l3.placeMeshes.get(id), r = []; g.traverse(o => { if (o.userData.reach) r.push(o); }); return r; }; return { tk: info('tk1').length, pb: info('pb1').length }; });
  const d0 = await tk(); ok(d0.tk >= 1 && d0.pb === 0, 'Standard: kranen har ring, pumpbilen ingen: ' + JSON.stringify(d0));
  // Välj kranen och öppna egenskaperna
  await page.evaluate(() => { l3SelectIds(['tk1']); l3RenderSide(); });
  await page.waitForSelector('[data-reach="mode"]', { state: 'attached' }); await page.evaluate(() => document.querySelectorAll('#v3Side details').forEach(d => { d.open = true; }));
  ok(await page.$eval('[data-reach="mode"]', e => e.value) === 'ring', 'Rullgardinen visar Ring för kranen');
  await page.selectOption('[data-reach="mode"]', 'cyl'); await page.waitForTimeout(400); await page.waitForSelector('[data-reach="h"]', { state: 'attached' }); await page.evaluate(() => document.querySelectorAll('#v3Side details').forEach(d => { d.open = true; }));
  let c1 = await page.evaluate(() => { const g = l3.placeMeshes.get('tk1'), m = []; g.traverse(o => { if (o.userData.reach) m.push(o); }); const cyl = m.find(o => o.isMesh && o.geometry.getAttribute('color')); const bb = new THREE.Box3().setFromBufferAttribute(cyl.geometry.getAttribute('position')); return { n: m.length, h: bb.max.z - bb.min.z, r: bb.max.x, alpha: cyl.geometry.getAttribute('color').itemSize, noHit: cyl.userData.noHit, a0: cyl.geometry.getAttribute('color').getW(0), aTop: cyl.geometry.getAttribute('color').getW(cyl.geometry.getAttribute('position').count - 1), mode: p => 0 }; });
  ok(c1.h > 39.9 && c1.h < 40.1 && Math.abs(c1.r - 50) < 0.1 && c1.alpha === 4 && c1.noHit && c1.a0 > c1.aTop, 'Cylinder upp till objektets höjd, toning uppåt: ' + JSON.stringify(c1));
  // Egen höjd, opacitet och färg, effekt av
  await page.fill('[data-reach="h"]', '25,5'); await page.press('[data-reach="h"]', 'Tab'); await page.waitForTimeout(300);
  await page.evaluate(() => { const o = document.querySelector('[data-reach="op"]'); o.value = '60'; o.dispatchEvent(new Event('input')); const c = document.querySelector('[data-reach="col"]'); c.value = '#ff0000'; c.dispatchEvent(new Event('input')); }); await page.waitForTimeout(300);
  await page.uncheck('[data-reach="fx"]'); await page.waitForTimeout(500);
  const c2 = await page.evaluate(() => { const p = placements.find(x => x.id === 'tk1'), g = l3.placeMeshes.get('tk1'); let cyl; g.traverse(o => { if (o.userData.reach && o.isMesh && o.geometry.getAttribute('color')) cyl = o; }); const bb = new THREE.Box3().setFromBufferAttribute(cyl.geometry.getAttribute('position')), col = cyl.geometry.getAttribute('color'); return { p: [p.reachMode, p.reachH, p.reachOp, p.reachCol, p.reachFx], h: bb.max.z, a: col.getW(0), aTop: col.getW(col.count - 1), r: col.getX(0), cap: g.children.filter(o => o.userData.reach).length, saved: JSON.parse(JSON.stringify(p)).reachH }; });
  ok(c2.p[0] === 'cyl' && c2.p[1] === 25.5 && c2.p[2] === 60 && c2.p[3] === '#ff0000' && c2.p[4] === false && Math.abs(c2.h - 25.5) < 0.01 && Math.abs(c2.a - 0.6) < 0.01 && Math.abs(c2.aTop - 0.6) < 0.01 && c2.r === 1 && c2.cap === 3, 'Eget val av höjd, opacitet, färg och effekt av: ' + JSON.stringify(c2));
  // Pumpbil får cylinder via rullgardinen; Ingen tar bort
  await page.evaluate(() => { l3SelectIds(['pb1']); l3RenderSide(); }); await page.waitForSelector('[data-reach="mode"]', { state: 'attached' }); await page.evaluate(() => document.querySelectorAll('#v3Side details').forEach(d => { d.open = true; }));
  ok(await page.$eval('[data-reach="mode"]', e => e.value) === 'off', 'Pumpbilen utan ring visar Ingen');
  await page.selectOption('[data-reach="mode"]', 'cyl'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { let n = 0; l3.placeMeshes.get('pb1').traverse(o => { if (o.userData.reach) n++; }); return n; }) >= 3, 'Pumpbilen får cylinder');
  await page.selectOption('[data-reach="mode"]', 'off'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { let n = 0; l3.placeMeshes.get('pb1').traverse(o => { if (o.userData.reach) n++; }); return n; }) === 0, 'Ingen tar bort räckvidden');
  // Ringval ger fylld skiva i vald färg
  await page.selectOption('[data-reach="mode"]', 'ring'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { let d = null; l3.placeMeshes.get('pb1').traverse(o => { if (o.userData.reach && o.isMesh) d = o; }); return !!d && d.geometry.type === 'CircleGeometry'; }), 'Ring ritas som skiva');
  // Syns i vyn (skärmbild)
  await page.evaluate(() => { const p = placements.find(x => x.id === 'tk1'); p.reachMode = 'cyl'; p.reachFx = true; p.reachOp = 30; p.reachCol = '#38bdf8'; p.reachH = 40; l3RebuildOne(p); l3SelectIds([]); l3Frame(false); l3Render(); });
  await page.waitForTimeout(800); await page.screenshot({ path: '/tmp/reach.png' });
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dreach');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
