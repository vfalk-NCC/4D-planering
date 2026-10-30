const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9091;
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
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  await page.evaluate(() => { l3View('top'); l3Render(); });
  await page.waitForTimeout(1200);
  const ground = await page.evaluate(() => ({ O: l3.O, gz: l3GroundZ() }));
  const scr = (x, y) => page.evaluate(([x, y]) => { const v = l3dwS([l3.O[0] + x, l3.O[1] + y, l3.O[2] + l3GroundZ()]); const q = l3ToScreen(v), r = l3Rect(); return [r.left + q.x, r.top + q.y]; }, [x, y]);
  const ok = (c, m) => { if (!c) fail(m); };
  const nMod = () => page.evaluate(() => placements.filter(p => p.m).length);
  await page.click('[data-v3tool="draw"]'); await page.waitForSelector('[data-dwm="rect"]');
  const modes = await page.$$eval('[data-dwm]', l => l.map(b => b.dataset.dwm).join(',')); ok(modes === 'line,rect,circle,arc,polygon,poly,poly3d,free', 'Lägen: ' + modes);
  // Rektangel 4000 × 3000 mm med siffror
  await page.click('[data-dwm="rect"]');
  let a = await scr(2, 2); await page.mouse.move(a[0], a[1]); await page.waitForTimeout(150); await page.mouse.click(a[0], a[1]); await page.waitForTimeout(150);
  let b = await scr(8, 6); await page.mouse.move(b[0], b[1]); await page.waitForTimeout(200);
  await page.keyboard.type('4000;3000'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  let r1 = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return p ? { k: p.m.k, area: modDims(p).area, perim: modDims(p).perimeter } : null; });
  ok(r1 && r1.k === 'face' && Math.abs(r1.area - 12) < 0.01, 'Rektangel med siffror: ' + JSON.stringify(r1));
  // Cirkel med radie 500 mm
  await page.click('[data-dwm="circle"]'); a = await scr(20, 4); await page.mouse.move(a[0], a[1]); await page.waitForTimeout(100); await page.mouse.click(a[0], a[1]); b = await scr(22, 4); await page.mouse.move(b[0], b[1]); await page.waitForTimeout(150);
  await page.keyboard.type('500'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  let r2 = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return { k: p.m.k, area: modDims(p).area, name: p.name }; });
  ok(r2.k === 'face' && Math.abs(r2.area - Math.PI * 0.25) < 0.03, 'Cirkel: ' + JSON.stringify(r2));
  // Linje: sluten triangel blir en yta (och ritas med musen)
  await page.click('[data-dwm="line"]');
  const P = [[2, 12], [8, 12], [5, 16]]; for (const [x, y] of P) { const s = await scr(x, y); await page.mouse.move(s[0], s[1]); await page.waitForTimeout(80); await page.mouse.click(s[0], s[1]); await page.waitForTimeout(80); }
  const s0 = await scr(2, 12); await page.mouse.move(s0[0], s0[1]); await page.waitForTimeout(80); await page.mouse.click(s0[0], s0[1]); await page.waitForTimeout(300);
  let r3 = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return { k: p.m.k, area: modDims(p).area }; });
  ok(r3.k === 'face' && Math.abs(r3.area - 12) < 0.2, 'Slutna linjer ger yta: ' + JSON.stringify(r3));
  // Linje med längd: skriv 2500 → rak linje (öppen, 1 segment)
  s0[0] += 0; const q0 = await scr(14, 12); await page.mouse.move(q0[0], q0[1]); await page.waitForTimeout(80); await page.mouse.click(q0[0], q0[1]); const q1 = await scr(17, 12); await page.mouse.move(q1[0], q1[1]); await page.waitForTimeout(150); await page.keyboard.type('2500'); await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  let r4 = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return { k: p.m.k, len: modDims(p).length }; });
  ok(r4.k === 'curve' && Math.abs(r4.len - 2.5) < 0.01, 'Linje med längd: ' + JSON.stringify(r4));
  // Båge: start, slut, radie
  await page.click('[data-dwm="arc"]'); const a0 = await scr(2, 20), a1 = await scr(6, 20), a2 = await scr(4, 22);
  await page.mouse.move(a0[0], a0[1]); await page.waitForTimeout(80); await page.mouse.click(a0[0], a0[1]); await page.mouse.move(a1[0], a1[1]); await page.waitForTimeout(80); await page.mouse.click(a1[0], a1[1]); await page.mouse.move(a2[0], a2[1]); await page.waitForTimeout(150); await page.mouse.click(a2[0], a2[1]); await page.waitForTimeout(300);
  let r5 = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return { k: p.m.k, n: p.m.pts.length, len: modDims(p).length }; });
  ok(r5.k === 'curve' && r5.n > 6 && r5.len > 4, 'Båge: ' + JSON.stringify(r5));
  const cnt1 = await nMod(); ok(cnt1 === 5, 'Antal ritade: ' + cnt1);
  // Push/Pull: rektangeln 1200 mm upp
  await page.click('[data-v3tool="model"]'); await page.waitForSelector('[data-dwm="pushpull"]');
  const f = await scr(5, 4); await page.mouse.move(f[0], f[1]); await page.waitForTimeout(250); await page.mouse.click(f[0], f[1]); await page.waitForTimeout(150); await page.mouse.move(f[0] + 5, f[1] - 40); await page.waitForTimeout(150);
  await page.keyboard.type('1200'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  let r6 = await page.evaluate(() => { const ps = placements.filter(x => x.m && x.m.k === 'solid'); return ps.map(p => ({ d: p.m.d, vol: modDims(p).volume, type: p.type })); });
  ok(r6.length === 1 && Math.abs(Math.abs(r6[0].d) - 1.2) < 0.001 && Math.abs(r6[0].vol - 14.4) < 0.05, 'Push/Pull: ' + JSON.stringify(r6));
  // Push/Pull igen på toppen: +800 mm → 2,0 m
  await page.evaluate(() => { l3View('iso'); l3Render(); }); await page.waitForTimeout(900);
  const top = await page.evaluate(() => { const p = placements.find(x => x.m && x.m.k === 'solid'); const c = l3dwFromLocal(p, [1, 1, p.m.d]); const v = l3dwS(c), q = l3ToScreen(v), r = l3Rect(); return [r.left + q.x, r.top + q.y]; });
  await page.mouse.move(top[0], top[1]); await page.waitForTimeout(250); await page.mouse.click(top[0], top[1]); await page.waitForTimeout(150); await page.mouse.move(top[0], top[1] - 30); await page.keyboard.type('800'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  let r7 = await page.evaluate(() => { const p = placements.find(x => x.m && x.m.k === 'solid'); return { d: p.m.d, vol: modDims(p).volume }; });
  ok(Math.abs(Math.abs(r7.d) - 2.0) < 0.001 && Math.abs(r7.vol - 24) < 0.1, 'Push/Pull på toppen: ' + JSON.stringify(r7));
  // Offset: ny rektangel 6 x 4 och förskjut inåt 500 mm → ring + inre yta
  await page.evaluate(() => { l3View('top'); l3Render(); }); await page.waitForTimeout(900);
  await page.click('[data-v3tool="draw"]'); await page.click('[data-dwm="rect"]');
  const o1 = await scr(10, 2), o2 = await scr(16, 6); await page.mouse.move(o1[0], o1[1]); await page.waitForTimeout(100); await page.mouse.click(o1[0], o1[1]); await page.mouse.move(o2[0], o2[1]); await page.waitForTimeout(150); await page.mouse.click(o2[0], o2[1]); await page.waitForTimeout(300);
  const nBefore = await nMod(); console.log('efter rektangel', nBefore, JSON.stringify(await page.evaluate(() => placements.filter(x => x.m).map(p => p.m.k + ':' + p.name + ':' + (p.m.loops ? Math.round(modDims(p).area) : '')))));
  await page.click('[data-v3tool="model"]'); await page.click('[data-dwm="offset"]');
  const c0 = await scr(13, 4); await page.mouse.move(c0[0], c0[1]); await page.waitForTimeout(250); await page.mouse.click(c0[0], c0[1]); await page.waitForTimeout(150);
  const c1 = await scr(11, 4); await page.mouse.move(c1[0], c1[1]); await page.waitForTimeout(150); await page.keyboard.type('500'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  console.log('status', await page.evaluate(() => document.getElementById('v3Status') ? document.getElementById('v3Status').textContent : ''), await page.evaluate(() => JSON.stringify({ op: !!l3dw.op, mode: l3dwMode(), tool: l3.tool })));
  const off = await page.evaluate(() => { const fs = placements.filter(x => x.m && x.m.k === 'face').slice(-2); return fs.map(p => ({ loops: p.m.loops.length, area: modDims(p).area })); });
  ok(await nMod() === nBefore + 1 && off.length === 2, 'Offset skapar en ny yta: ' + JSON.stringify(off));
  const areas = off.map(o => o.area).sort((a, b) => a - b); ok(Math.abs(areas[0] - 9) < 0.2 && Math.abs(areas[1] - 15) < 0.2 && off.some(o => o.loops === 2), 'Offset: ringen 24 − 15 = 9 m² (med hål) och mitten 5 × 3 = 15 m²: ' + JSON.stringify(off));
  // Lodrätt plan: XZ-rektangel 2 × 1 m och polygon
  await page.click('[data-v3tool="draw"]'); await page.click('[data-dwp="xz"]'); await page.click('[data-dwm="rect"]');
  const w1 = await scr(10, 9); await page.mouse.move(w1[0], w1[1]); await page.waitForTimeout(100); await page.mouse.click(w1[0], w1[1]); await page.waitForTimeout(100); await page.mouse.move(w1[0] + 40, w1[1] - 40); await page.waitForTimeout(100);
  await page.keyboard.type('2000;1000'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const vx = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); const n = MG.normal(p.m.pl); return { n, area: modDims(p).area }; });
  ok(Math.abs(Math.abs(vx.n[1]) - 1) < 1e-6 && Math.abs(vx.area - 2) < 0.01, 'XZ-plan: ' + JSON.stringify(vx));
  await page.click('[data-dwp="auto"]'); await page.click('[data-dwm="polygon"]'); await page.fill('[data-dwsides]', '8'); await page.dispatchEvent('[data-dwsides]', 'change');
  const g1 = await scr(14, 9); await page.mouse.move(g1[0], g1[1]); await page.waitForTimeout(100); await page.mouse.click(g1[0], g1[1]); await page.mouse.move(g1[0] + 30, g1[1]); await page.waitForTimeout(100); await page.keyboard.type('1000'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const pg = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return { n: p.m.loops[0].length, area: modDims(p).area }; });
  ok(pg.n === 8 && Math.abs(pg.area - 2 * Math.sqrt(2)) < 0.05, 'Polygon åttahörning radie 1 m: ' + JSON.stringify(pg));
  // Frihand
  await page.click('[data-dwm="free"]'); const h0 = await scr(17, 10); await page.mouse.move(h0[0], h0[1]); await page.mouse.down(); for (let i = 1; i <= 12; i++) await page.mouse.move(h0[0] + i * 8, h0[1] + Math.sin(i / 2) * 20); await page.mouse.up(); await page.waitForTimeout(300);
  const fr = await page.evaluate(() => { const p = placements.filter(x => x.m).pop(); return { k: p.m.k, n: p.m.pts.length, name: p.name }; });
  ok(fr.k === 'curve' && fr.n >= 3 && fr.name === 'Frihand', 'Frihand: ' + JSON.stringify(fr));
  await page.screenshot({ path: '/tmp/draw1.png' });
  // Ångra tar tillbaka det senaste (frihand), sedan polygon
  const nAll = await nMod(); await page.evaluate(() => placeUndo()); await page.waitForTimeout(250); const nU = await nMod(); ok(nU === nAll - 1, 'Ångra frihand: ' + nAll + ' → ' + nU);
  console.log('OK: rita och modellera – rektangel, cirkel, linjer, yta av slutna linjer, båge, push/pull med siffror, ångra');
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
