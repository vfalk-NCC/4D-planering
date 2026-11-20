const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9317;
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
  // 1) Manuella värden på en tidplansbubbla
  const ov = await page.evaluate(() => { const r = { id: 'x1', object_name: 'Fundament', activity: 'Gjut', start_date: '2026-11-01', end_date: '2026-11-21', progress: 40 }; const a = l3bubLines(r, { name: true, date: true, progress: true, note: true }, true); l3boSet(l3bubKey(r), { name: 'Pelare P1', prog: 75, dt: '1 nov – 30 nov' }); const b = l3bubLines(r, { name: true, date: true, progress: true, note: true }, true); l3boSet(l3bubKey(r), { name: null, prog: null, dt: null }); const c = l3bubLines(r, { name: true, date: true, progress: true, note: true }, true); return { a: a.name, b, c: c.name }; });
  ok(ov.a === 'Fundament' && ov.b.name === 'Pelare P1' && ov.b.progress === 75 && ov.b.date === '1 nov – 30 nov' && ov.b.edited && ov.c === 'Fundament', 'Manuella värden: ' + JSON.stringify(ov));
  // 2) Fri bubbla: klick i bilden
  await page.evaluate(() => { l3SetPref('bubOn', true); l3bubAddFree(); });
  const box = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.55 }; });
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(500);
  const fr = await page.evaluate(() => ({ n: (l3bo.list || []).filter(x => x.free).length, cards: document.querySelectorAll('#v3Bubbles .v3-bub.fr').length, panel: !!document.getElementById('v3BubPanel') }));
  ok(fr.n === 1 && fr.cards === 1 && fr.panel, 'Fri bubbla: ' + JSON.stringify(fr));
  // 3) Ändra namn och % i panelen
  await page.fill('#v3BubPanel .v3-bp-r [data-bpf=name]', 'Kran A'); await page.fill('#v3BubPanel .v3-bp-r [data-bpf=prog]', '60'); await page.press('#v3BubPanel .v3-bp-r [data-bpf=prog]', 'Tab'); await page.waitForTimeout(300);
  const card = await page.evaluate(() => document.querySelector('#v3Bubbles .v3-bub.fr').textContent.replace(/\s+/g, ' '));
  ok(/Kran A/.test(card) && /60 %/.test(card), 'Kortet visar ändringen: ' + card);
  // 4) Dra kortet, då sparas platsen; lås hindrar dragning
  const pos0 = await page.evaluate(() => { const e = document.querySelector('#v3Bubbles .v3-bub.fr'); const c = e.querySelector('.v3-bub-c').getBoundingClientRect(); return { l: parseFloat(e.style.left), t: parseFloat(e.style.top), cx: c.left + c.width / 2, cy: c.top + c.height / 2 }; });
  await page.mouse.move(pos0.cx, pos0.cy); await page.mouse.down(); await page.mouse.move(pos0.cx + 80, pos0.cy + 40, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
  const pos1 = await page.evaluate(() => { const e = document.querySelector('#v3Bubbles .v3-bub.fr'); const k = e.dataset.bk, o = l3boGet(k); return { l: parseFloat(e.style.left), t: parseFloat(e.style.top), x: o.x, y: o.y, k }; });
  ok(Math.abs(pos1.l - pos0.l - 80) < 3 && Math.abs(pos1.t - pos0.t - 40) < 3 && pos1.x > 0, 'Dragning: ' + JSON.stringify([pos0, pos1]));
  await page.evaluate(k => l3bubLock(k, true), pos1.k); await page.waitForTimeout(200);
  await page.mouse.move(pos0.cx + 80, pos0.cy + 40); await page.mouse.down(); await page.mouse.move(pos0.cx + 200, pos0.cy + 100, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200);
  const pos2 = await page.evaluate(() => { const e = document.querySelector('#v3Bubbles .v3-bub.fr'); return { l: parseFloat(e.style.left), lk: e.classList.contains('lk') }; });
  ok(pos2.lk && Math.abs(pos2.l - pos1.l) < 2, 'Låst bubbla ska ligga kvar: ' + JSON.stringify(pos2));
  // 5) Sparad vy: kamera + bubblor; ändra allt, gå tillbaka -> exakt samma
  const sv = await page.evaluate(async () => { l3SaveView('Veckobild', l3vParts().concat(['bub'])); const v = l3SavedViews().find(x => x.name === 'Veckobild'); return { has: !!v.bub, keys: v.bub && v.bub.keys.length, asp: v.asp, cam: v.p.slice(), item: v.bub && Object.values(v.bub.items)[0] }; });
  ok(sv.has && sv.keys === 1 && sv.asp > 0 && sv.item[2] === 1, 'Vy sparar bubblor: ' + JSON.stringify(sv));
  await page.evaluate(() => { l3bubLock(document.querySelector('#v3Bubbles .v3-bub.fr').dataset.bk, false); l3FlyTo(new THREE.Vector3(5, 5, 0), 40, new THREE.Vector3(1, 1, 1), 0); l3Render(); });
  await page.evaluate(() => { l3GoView(l3SavedViews().findIndex(x => x.name === 'Veckobild')); }); await page.waitForTimeout(900);
  const back = await page.evaluate(() => { const e = document.querySelector('#v3Bubbles .v3-bub.fr'), v = l3SavedViews().find(x => x.name === 'Veckobild'), O = l3.O; return { l: e && parseFloat(e.style.left), t: e && parseFloat(e.style.top), lk: e && e.classList.contains('lk'), dp: Math.hypot(...[0, 1, 2].map(i => l3.camera.position.getComponent(i) + O[i] - v.p[i])), exp: Object.values(v.bub.items)[0] }; });
  const W = await page.evaluate(() => l3.renderer.domElement.getBoundingClientRect().width);
  ok(back.lk && back.dp < 0.01 && Math.abs(back.l / W - back.exp[0]) < 0.002, 'Tillbaka i exakt samma vy: ' + JSON.stringify(back));
  // 6) Nästa vecka
  const nw = await page.evaluate(() => { const v = l3vNextWeek(); return v && { n: v.name, d: v.date, b: !!v.bub }; });
  ok(nw && /· \d{4}-\d{2}-\d{2}$/.test(nw.n) && nw.b, 'Ny vecka: ' + JSON.stringify(nw));
  // 7) Ta bort fri bubbla
  await page.click('#v3Bubbles .v3-bub.fr [data-ba=off]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelectorAll('#v3Bubbles .v3-bub.fr').length) === 0, 'Fri bubbla borttagen');
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dbubviews');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
