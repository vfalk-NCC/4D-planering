// Redigera DXF-linjer i lägesplanen (Victor 2026-11-05): markera, ändra längd, flytta, vrid, ta bort, ångra och spara som ny DXF.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9037;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
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
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };` : PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    const rec = { id: 'c1', type: 'cad', name: 'Utsättning', path: 'x', colorMode: 'orig', weight: 1, layers: [{ name: 'AXLAR', color: '#ff0000', n: 1 }, { name: 'MÅTT', color: '#0000ff', n: 1 }], stats: { lines: 2, texts: 0, kb: 1 } };
    siteItems.push(rec); ls('cad:c1').visible = true;
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000], [5000, -2000, 5000, 2000]], t: [] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    window.__up = []; askOpener = async (type, extra) => { if (type === 'tcUpload') { window.__up.push([extra.folder, extra.files[0].name]); window.__upText = await extra.files[0].text(); return { uploaded: 1, folder: extra.folder }; } return {}; };
    renderCadSettings(); view.scale = 1; view.tx = 0; view.ty = 0; view.rot = 0; applyView();
  });
  await page.evaluate(() => { document.getElementById('cadSettings').classList.remove('hidden'); });
  const scr = (x, y) => page.evaluate(([x, y]) => { const p = mToPx([x, y]), s = stageToScreen(p), r = document.getElementById('viewport').getBoundingClientRect(); return [r.left + s[0], r.top + s[1]]; }, [x, y]);
  await page.evaluate(() => { const p = mToPx([6512355, 150122]); view.scale = 1; view.tx = 473 - p[0]; view.ty = 425 - p[1]; applyView(); });
  await page.evaluate(() => cdeStart('c1')); await page.waitForSelector('#cdeBar');
  const st0 = await page.evaluate(() => ({ n: cde.ents.length, hidden: cdeActive() === 'c1' }));
  if (st0.n !== 3 || !st0.hidden) fail('Redigeringen ska läsa in två linjer: ' + JSON.stringify(st0));
  // 1) Markera den korta linjen (mått, 2 m) med ett klick
  const [mx, my] = await scr(6512351, 150121);
  await page.mouse.click(mx, my); await page.waitForTimeout(100);
  const s1 = await page.evaluate(() => ({ sel: [...cde.sel], len: document.getElementById('cdeLen').value, info: document.getElementById('cdeInfo').textContent }));
  if (s1.sel.length !== 1 || s1.len !== '2' || !/1 linje/.test(s1.info)) fail('Klick ska markera linjen: ' + JSON.stringify(s1));
  // 2) Ändra längd till 5 m med Start still
  await page.fill('#cdeLen', '5'); await page.click('#cdeLenGo'); await page.waitForTimeout(80);
  let L = await page.evaluate(() => { const e = cde.ents.find(x => cde.sel.has(x.id)); return { len: cdeLen(e.pts), x0: e.pts[0][0], x1: e.pts[1][0] }; });
  if (Math.abs(L.len - 5) > 1e-3 || Math.abs(L.x0 - 6512350) > 1e-3 || Math.abs(L.x1 - 6512355) > 1e-3) fail('Längden ska bli 5 m med start still: ' + JSON.stringify(L));
  // slut still
  await page.selectOption('#cdeAnc', 'end'); await page.fill('#cdeLen', '3'); await page.click('#cdeLenGo');
  L = await page.evaluate(() => { const e = cde.ents.find(x => cde.sel.has(x.id)); return { len: cdeLen(e.pts), x0: e.pts[0][0], x1: e.pts[1][0] }; });
  if (Math.abs(L.len - 3) > 1e-3 || Math.abs(L.x1 - 6512355) > 1e-3 || Math.abs(L.x0 - 6512352) > 1e-3) fail('Slut still: ' + JSON.stringify(L));
  // förläng +1 med mitten still
  await page.selectOption('#cdeAnc', 'mid'); await page.fill('#cdeGrow', '1'); await page.click('#cdeGrowGo');
  L = await page.evaluate(() => { const e = cde.ents.find(x => cde.sel.has(x.id)); return { len: cdeLen(e.pts), x0: e.pts[0][0], x1: e.pts[1][0] }; });
  if (Math.abs(L.len - 4) > 1e-3 || Math.abs((L.x0 + L.x1) / 2 - 6512353.5) > 1e-3) fail('Förläng med mitten still: ' + JSON.stringify(L));
  // 3) Ångra / gör om
  await page.click('#cdeUndo'); await page.click('#cdeUndo'); await page.click('#cdeUndo');
  L = await page.evaluate(() => { const e = cde.ents.find(x => cde.sel.has(x.id)); return cdeLen(e.pts); }); if (Math.abs(L - 2) > 1e-3) fail('Ångra ska ge tillbaka 2 m: ' + L);
  await page.click('#cdeRedo'); L = await page.evaluate(() => { const e = cde.ents.find(x => cde.sel.has(x.id)); return cdeLen(e.pts); }); if (Math.abs(L - 5) > 1e-3) fail('Gör om ska ge 5 m: ' + L);
  // 4) Flytta med piltangent och dX/dY, vrid
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  const x0 = await page.evaluate(() => cde.ents.find(x => cde.sel.has(x.id)).pts[0][0]);
  await page.keyboard.press('ArrowRight'); const x1 = await page.evaluate(() => cde.ents.find(x => cde.sel.has(x.id)).pts[0][0]); if (Math.abs(x1 - x0 - 0.1) > 1e-6) fail('Piltangent flyttar 0,1 m: ' + (x1 - x0));
  await page.fill('#cdeDx', '2'); await page.fill('#cdeDy', '-1'); await page.click('#cdeMove'); const y1 = await page.evaluate(() => cde.ents.find(x => cde.sel.has(x.id)).pts[0]); if (Math.abs(y1[0] - (x1 + 2)) > 1e-6 || Math.abs(y1[1] - (150121 - 1)) > 1e-6) fail('dX/dY: ' + JSON.stringify(y1));
  await page.fill('#cdeRot', '90'); await page.click('#cdeRotGo'); const rot = await page.evaluate(() => { const e = cde.ents.find(x => cde.sel.has(x.id)); return { dx: e.pts[1][0] - e.pts[0][0], dy: e.pts[1][1] - e.pts[0][1] }; }); if (Math.abs(rot.dx) > 1e-3 || Math.abs(rot.dy - 5) > 1e-3) fail('Vrid 90°: ' + JSON.stringify(rot));
  // 5) Ruta: höger → vänster markerar allt som nuddas; Delete tar bort
  const [a1, a2] = await scr(6512340, 150115), [b1, b2] = await scr(6512362, 150128);
  await page.mouse.move(b1, b2); await page.mouse.down(); await page.mouse.move((a1 + b1) / 2, (a2 + b2) / 2, { steps: 4 }); await page.mouse.move(a1, a2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100);
  const sel2 = await page.evaluate(() => cde.sel.size); if (sel2 < 1) fail('Rutan ska markera linjer: ' + sel2);
  await page.keyboard.press('Delete'); const alive = await page.evaluate(() => cde.ents.filter(e => !e.del).length); if (alive >= 3) fail('Delete ska ta bort markerade: ' + alive);
  await page.keyboard.press('Control+z'); const back = await page.evaluate(() => cde.ents.filter(e => !e.del).length); if (back !== 3) fail('Ctrl+Z ska ta tillbaka: ' + back);
  console.log('OK: markera, ändra längd (start/mitt/slut), förläng, flytta, vrid, ruta, ta bort och ångra');
  // 5b) Trimma: tryck på den del av linjen som ska bort (mellan närmaste skärningar)
  await page.evaluate(() => { cde.sel = new Set(); cdeRefresh(); });
  const n0t = await page.evaluate(() => cde.ents.filter(e => !e.del).length);
  await page.click('#cdeTrim'); const [tx, ty] = await scr(6512352, 150120);
  await page.mouse.move(tx, ty); await page.waitForTimeout(80);
  const prev = await page.evaluate(() => !!(cde.trimPrev && cde.trimPrev.length >= 2)); if (!prev) fail('Trimma ska förhandsvisa delen som tas bort');
  await page.mouse.click(tx, ty); await page.waitForTimeout(100);
  const tr = await page.evaluate(() => { const alive = cde.ents.filter(e => !e.del); const long = alive.find(e => e.pts.length === 3 && e.layer === 'AXLAR'); return { n: alive.length, start: long && long.pts[0], len: long && cdeLen(long.pts) }; });
  if (tr.n !== n0t || !tr.start || Math.abs(tr.start[0] - 6512354.6) > 1e-3 || Math.abs(tr.start[1] - 150120) > 1e-3 || Math.abs(tr.len - 10.4) > 1e-3) fail('Trimma bort den vänstra delen fram till närmaste skärning (354,6): ' + JSON.stringify(tr));
  // mitt-trim: dela en linje mellan två skärningar → två delar
  await page.evaluate(() => { cde.ents.push({ id: cde.next++, layer: 'AXLAR', color: '#ff0000', pts: [[6512358, 150118], [6512358, 150122]] }); cde.ver++; });
  const [t2x, t2y] = await scr(6512356.5, 150120); await page.mouse.click(t2x, t2y); await page.waitForTimeout(100);
  const tr2 = await page.evaluate(() => cde.ents.filter(e => !e.del && e.layer === 'AXLAR').map(e => [Math.round(e.pts[0][0] * 100) / 100, Math.round(e.pts[e.pts.length - 1][0] * 100) / 100, e.pts.length]));
  if (tr2.length !== 4 || !tr2.some(x => x[0] === 6512354.6 && x[1] === 6512355) || !tr2.some(x => x[0] === 6512358 && x[1] === 6512360)) fail('Trimma mellan två skärningar (355–358 bort): ' + JSON.stringify(tr2));
  await page.click('#cdeUndo'); await page.click('#cdeUndo');
  const tr3 = await page.evaluate(() => cde.ents.filter(e => !e.del).length); if (tr3 !== n0t + 1) fail('Ångra trimningen ska ge tillbaka linjerna: ' + tr3 + ' vs ' + (n0t + 1));
  await page.keyboard.press('Escape'); if (await page.evaluate(() => cde.tool)) fail('Esc ska avsluta trimverktyget');
  console.log('OK: trimma (förhandsvisning, bort fram till skärning, mellan skärningar, ångra)', JSON.stringify(tr2));
  // 6) Hörnpunkt: dra
  await page.evaluate(() => { cde.sel = new Set([cde.ents[0].id]); cdeRefresh(); });
  const ge = await page.evaluate(() => cde.ents[0].pts.map(p => p.slice())); const [g1, g2] = await scr(ge[2][0], ge[2][1]), [t1, t2] = await scr(ge[2][0] + 2, ge[2][1] + 1);
  await page.mouse.move(g1, g2); await page.mouse.down(); await page.mouse.move(t1, t2, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(100);
  const ge2 = await page.evaluate(() => cde.ents[0].pts.map(p => p.slice())); if (Math.hypot(ge2[2][0] - (ge[2][0] + 2), ge2[2][1] - (ge[2][1] + 1)) > 0.2 || ge2[0][0] !== ge[0][0]) fail('Hörnpunkten ska flyttas: ' + JSON.stringify({ ge, ge2 }));
  // 7) Spara som ny DXF
  const before = await page.evaluate(() => cads().length);
  await page.click('#cdeSave'); await page.waitForFunction(() => !document.getElementById('cdeBar'), null, { timeout: 15000 });
  const res = await page.evaluate(() => ({ n: cads().length, up: window.__up, text: window.__upText || '', origVisible: ls('cad:c1').visible, active: cdeActive() }));
  if (res.n !== before + 1 || res.up.length !== 1 || res.up[0][0] !== 'Lägesplan' || !/redigerad/.test(res.up[0][1]) || !/\.dxf$/.test(res.up[0][1]) || res.origVisible || res.active) fail('Spara som ny DXF: ' + JSON.stringify({ n: res.n, up: res.up, vis: res.origVisible }));
  if (!/AXLAR/.test(res.text) || !/POLYLINE|LWPOLYLINE/.test(res.text)) fail('DXF-texten ska innehålla linjerna');
  console.log('OK: sparad som ny DXF (nytt lager, originalet släckt)', JSON.stringify(res.up));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_cadedit');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
