// Ställning i plan (Victor 2026-11-05: "snygg, smart illustration för ställningar där jag kan rita ut i plan"): ritverktyget, ritningen i skala med stolpar/stag/fack, mått och inställningar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9033;
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
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
  });
  if (!(await page.evaluate(() => !!document.querySelector('[data-site="scaffold"]')))) fail('Knappen Ställning saknas i Rita');
  // 1) Verktyget: klicka punkter, avsluta → popup med bredd, höjd och fack
  const r1 = await page.evaluate(() => {
    return typeof SITE_KINDS.scaffold === 'object';
  }).catch(() => false);
  if (!r1) fail('SITE_KINDS.scaffold saknas');
  const made = await page.evaluate(async () => {
    document.querySelector('[data-site="scaffold"]').click();
    siteTool.pts = [[6512320, 150110], [6512350, 150110], [6512350, 150125]];
    finishSiteTool();
    await new Promise(r => setTimeout(r, 200));
    const pop = document.querySelector('.site-pop, #sitePop, [class*="sitepop"]') || document.body;
    return { fields: ['.sp-sw', '.sp-sh', '.sp-sf'].map(q => !!document.querySelector(q)), vals: ['.sp-sw', '.sp-sh', '.sp-sf'].map(q => (document.querySelector(q) || {}).value) };
  });
  if (!made.fields.every(Boolean) || made.vals.join('|') !== '0,73|8|2,57' && made.vals.join('|') !== '0.73|8|2.57') fail('Popupen ska ha bredd, höjd och fack: ' + JSON.stringify(made));
  if (process.env.SLPOP) { const el = await page.$('.sp-sc'); const pop = await el.evaluateHandle(e => e.closest('[class*="pop"]') || e.parentElement); await (pop.asElement() || el).screenshot({ path: process.env.SLPOP }); }
  await page.fill('.sp-sh', '12'); await page.fill('.sp-sw', '1,0'); await page.fill('.sp-sf', '3');
  const np0 = await page.evaluate(() => placements.length);
  await page.click('.sp-to3d'); await page.waitForTimeout(200);
  const p3 = await page.evaluate(() => { const p = placements[placements.length - 1]; return { n: placements.length, type: p.type, pts: p.pts.length, B: p.B, H: p.H, fack: p.f && p.f.fack, name: p.name, z: p.pts[0].slice(2), x: p.pts[2][0] }; });
  if (p3.n !== np0 + 1 || p3.type !== 'sm:stallningfri' || p3.pts !== 3 || p3.B !== 1 || p3.H !== 12 || p3.fack !== '3.07' || !/Ställning/.test(p3.name) || p3.x !== 6512350) fail('3D-ställningen ska skapas av linjen med samma mått: ' + JSON.stringify(p3));
  console.log('OK: 🧊 3D-ställning skapad av den ritade linjen', JSON.stringify(p3));
  await page.click('.sp-save');
  await page.waitForTimeout(300);
  let rec = await page.evaluate(() => siteItems.find(x => x.type === 'scaffold'));
  if (!rec) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^(Spara|OK)$/.test(x.textContent.trim()) && x.closest('[class*="pop"]')); if (b) b.click(); }); await page.waitForTimeout(300); rec = await page.evaluate(() => siteItems.find(x => x.type === 'scaffold')); }
  if (!rec || rec.h !== 12 || rec.w !== 1 || rec.fack !== 3 || rec.pts.length !== 3 || rec.name !== 'Ställning') fail('Ställningen ska sparas med måtten: ' + JSON.stringify(rec));
  // 2) Mått: längd, antal fack, våningar
  const inf = await page.evaluate(() => scaffoldInfo(siteItems.find(x => x.type === 'scaffold')));
  if (Math.abs(inf.L - 45) > 0.01 || inf.bays !== 10 + 5 || inf.lifts !== 6 || inf.H !== 12) fail('scaffoldInfo: ' + JSON.stringify(inf));
  // 3) Ritningen: bandet, stolpar och diagonaler ger många färgade bildpunkter; träff på bandet markerar den
  const px = await page.evaluate(() => {
    const x = siteItems.find(q => q.type === 'scaffold'), cv = document.createElement('canvas'); cv.width = 1400; cv.height = 900; const ctx = cv.getContext('2d');
    const ppm = pxPerMeter(), Q = x.pts.map(mToPx); ctx.translate(100 - Math.min(...Q.map(q => q[0])), 100 - Math.min(...Q.map(q => q[1]))); drawScaffold2D(ctx, x, siteStyle(x, 14), ppm, '', '');
    const d = ctx.getImageData(0, 0, 1400, 900).data; let n = 0, dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20) { n++; if (d[i] < 60 && d[i + 1] < 60) dark++; }
    const o = document.createElement('canvas'); o.width = 1400; o.height = 900; const g = o.getContext('2d'); g.fillStyle = '#9ca3af'; g.fillRect(0, 0, 1400, 900); g.drawImage(cv, 0, 0); window.__info = { ppm, Q }; window.__cvUrl = o.toDataURL();
    return { n, dark };
  });
  if (process.env.SLIMG) require('fs').writeFileSync(process.env.SLIMG, Buffer.from((await page.evaluate(() => window.__cvUrl)).split(',')[1], 'base64'));
  if (px.n < 2000 || px.dark < 40) fail('Ställningen ska ritas som band med stolpar: ' + JSON.stringify(px));
  const hit = null;
  { const r = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'); const base = scaffoldInfo(x).lifts, o = scaffoldInfo({ ...x, lifts: 3 }).lifts, html = scaffoldFieldsHtml({ ...x, sDim: false }); return { base, o, vh: /sp-sl/.test(html) && /sp-sdim/.test(html), off: /class="sp-sdim"\s*\/>/.test(html) || !/sp-sdim"[^>]*checked/.test(html) }; });
    if (r.o !== 3 || !r.vh || !r.off) fail('Våningar ska kunna anges och visningsvalen finnas i rutan: ' + JSON.stringify(r)); }
  { const r = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'), v = x.pts[0], pp = modelToPdf(v[0], v[1]), s0 = view.scale; const hit = sc => { view.scale = sc; const px = pxPerMeter(); return !!handleAt(x, [pp[0] + 8 / (renderScale || 1), pp[1]]); }; const a = hit(1), b = hit(8); view.scale = s0; return { a, b }; });
    if (!r.a || r.b) fail('Draghandtagen ska vara lika stora på skärmen oavsett zoom: ' + JSON.stringify(r)); }
  { const r = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'); const h = scaffoldFieldsHtml({ ...x, sWrap: true }); return { wrap: /sp-swrap"[^>]*checked/.test(h), noWrap: !/sp-swrap"[^>]*checked/.test(scaffoldFieldsHtml(x)) }; });
    if (!r.wrap || !r.noWrap) fail('Radbryt måtten ska finnas som val: ' + JSON.stringify(r)); }
  { const r = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'), q = mToPx(x.pts[1]); labelBoxes.set(x.id, { x: q[0], y: q[1], w: 40, h: 20 }); const h = siteHandles(x, 14, pxPerMeter()).find(z => z.kind === 'label'); return { has: !!h, dx: h && Math.abs(h.m[0] - x.pts[1][0]), dy: h && Math.abs(h.m[1] - x.pts[1][1]) }; });
    if (!r.has) fail('Textens insättningspunkt ska finnas som handtag: ' + JSON.stringify(r)); }
  { // Dra textens handtag med musen (riktig pekarhändelse) – den ska flytta etiketten
    const setup = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'); closeSitePop && closeSitePop(); selectedSiteId = x.id; x.lbl = [0, 0]; view.scale = 1; view.tx = 0; view.ty = 0; applyView(); const Q = mToPx(x.pts[0]); view.tx = 450 - Q[0]; view.ty = 400 - Q[1]; applyView(); renderZones(); return x.id; });
    await page.waitForTimeout(300);
    await page.evaluate(id => { const b = labelBoxes.get(id), s = stageToScreen([b.x, b.y]); view.tx += 450 - s[0]; view.ty += 400 - s[1]; applyView(); renderZones(); }, setup); await page.waitForTimeout(300);
    const pos = await page.evaluate(id => { const x = siteItems.find(q => q.id === id), h = siteHandles(x, 14, pxPerMeter()).find(z => z.kind === 'label'), s = stageToScreen(mToPx(h.m)), r = document.getElementById('viewport').getBoundingClientRect(); return { x: r.left + s[0], y: r.top + s[1] }; }, setup);
    await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await page.mouse.move(pos.x + 40, pos.y + 30, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
    const lbl = await page.evaluate(() => (siteItems.find(q => q.type === 'scaffold') || {}).lbl);
    if (!lbl || (Math.abs(lbl[0]) + Math.abs(lbl[1])) < 0.01) fail('Att dra i textens handtag ska flytta etiketten: ' + JSON.stringify({ lbl, pos })); }
  { const r = await page.evaluate(() => { const x = { ...siteItems.find(q => q.type === 'scaffold'), sDim: false, sFack: false, sLifts: false, sSeg: true, sFackSeg: false, name: '' }, cv = document.createElement('canvas'); cv.width = 1400; cv.height = 900; const ctx = cv.getContext('2d'), txt = []; const ft = ctx.fillText.bind(ctx); ctx.fillText = (t, ...a) => { txt.push(String(t)); return ft(t, ...a); };
      const Q = x.pts.map(mToPx); ctx.translate(100 - Math.min(...Q.map(q => q[0])), 100 - Math.min(...Q.map(q => q[1]))); drawScaffold2D(ctx, x, siteStyle(x, 14), pxPerMeter(), '', ''); return txt; });
    if (r.length !== 2 || !r.every(t => /\d m/.test(t)) || r.some(t => /Σ|fack|vån/.test(t))) fail('Bara måttkedjan ska synas när etikettens mått är släckta: ' + JSON.stringify(r)); }
  { // Fästet (pilens spets) har ett eget handtag: flyttas det ska etiketten stå kvar
    const r = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'); x.lbl = [0, 0]; delete x.lblAt; renderZones(); const hs = siteHandles(x, 14, pxPerMeter()), a = hs.find(z => z.kind === 'lblAnchor'), b0 = { ...labelBoxes.get(x.id) };
      const o = JSON.parse(JSON.stringify(x)), h = a, m = [h.m[0] + 3, h.m[1] - 2], ddx = m[0] - h.m[0], ddy = m[1] - h.m[1]; const w = { ...o, lblAt: m, lbl: [(o.lbl || [0, 0])[0] - ddx, (o.lbl || [0, 0])[1] - ddy] };
      siteItems[siteItems.findIndex(q => q.id === x.id)] = w; renderZones(); const b1 = labelBoxes.get(x.id); return { has: !!a, dx: Math.abs(b1.x - b0.x), dy: Math.abs(b1.y - b0.y), anchored: !!w.lblAt }; });
    if (!r.has || r.dx > 1 || r.dy > 1) fail('Fästet ska ha handtag och etiketten stå kvar när det flyttas: ' + JSON.stringify(r)); }
  { const id = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold'); delete x.lblAt; x.lbl = [0, 0]; selectedSiteId = x.id; renderZones(); return x.id; }); await page.waitForTimeout(200);
    const g = await page.evaluate(id => { const x = siteItems.find(q => q.id === id), h = siteHandles(x, 14, pxPerMeter()).find(z => z.kind === 'lblAnchor'), s = stageToScreen(mToPx(h.m)), r = document.getElementById('viewport').getBoundingClientRect(); return { x: r.left + s[0], y: r.top + s[1], bx: labelBoxes.get(id).x }; }, id);
    await page.mouse.move(g.x, g.y); await page.mouse.down(); await page.mouse.move(g.x + 25, g.y + 20, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
    const r = await page.evaluate(id => { const x = siteItems.find(q => q.id === id); return { at: x.lblAt, lbl: x.lbl, bx: labelBoxes.get(id).x }; }, id);
    if (!r.at || Math.abs(r.bx - g.bx) > 2) fail('Att dra i fästets handtag ska flytta fästet men låta etiketten stå kvar: ' + JSON.stringify({ r, g })); }
  { // Kopiera egenskaper: mallen sparas och nästa ställning ritas med den; Klistra in lägger den på ett annat objekt
    await page.evaluate(() => { closeSitePop(); selectedSiteId = null; });
    await page.evaluate(async () => { document.querySelector('[data-site="scaffold"]').click(); siteTool.pts = [[6512320, 150140], [6512340, 150140]]; finishSiteTool(); await new Promise(r => setTimeout(r, 200)); });
    await page.fill('.sp-sw', '1,2'); await page.fill('.sp-sh', '15'); await page.fill('.sp-sf', '3,07'); await page.click('.sp-sposts + span'); await page.click('.sp-swrap + span');
    await page.click('.sp-ccopy'); await page.waitForTimeout(100);
    const clip = await page.evaluate(() => JSON.parse(localStorage.getItem('lagesplan-siteclip')));
    if (!clip || clip.type !== 'scaffold' || clip.props.w !== 1.2 || clip.props.h !== 15 || clip.props.fack !== 3.07 || clip.props.sPosts !== false || clip.props.sWrap !== true || !clip.auto) fail('Kopiera ska spara mallen: ' + JSON.stringify(clip));
    await page.click('.sp-cancel'); await page.waitForTimeout(100);
    await page.evaluate(async () => { document.querySelector('[data-site="scaffold"]').click(); siteTool.pts = [[6512320, 150150], [6512340, 150150]]; finishSiteTool(); await new Promise(r => setTimeout(r, 200)); });
    const nv = await page.evaluate(() => ({ w: document.querySelector('.sp-sw').value, h: document.querySelector('.sp-sh').value, posts: document.querySelector('.sp-sposts').checked, wrap: document.querySelector('.sp-swrap').checked }));
    if (nv.w !== '1,2' || nv.h !== '15' || nv.posts !== false || nv.wrap !== true) fail('Nästa ställning ska ritas med de kopierade egenskaperna: ' + JSON.stringify(nv));
    await page.click('.sp-cancel'); await page.waitForTimeout(100);
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('lagesplan-siteclip')); c.auto = false; localStorage.setItem('lagesplan-siteclip', JSON.stringify(c)); });
    await page.evaluate(async () => { document.querySelector('[data-site="scaffold"]').click(); siteTool.pts = [[6512320, 150160], [6512340, 150160]]; finishSiteTool(); await new Promise(r => setTimeout(r, 200)); });
    const dv = await page.evaluate(() => document.querySelector('.sp-sw').value);
    if (dv === '1,2') fail('Utan "Använd på nya" ska nya ställningar få standardvärden');
    await page.click('.sp-cpaste'); await page.waitForTimeout(100);
    const pv = await page.evaluate(() => ({ w: document.querySelector('.sp-sw').value, f: document.querySelector('.sp-sf').value, posts: document.querySelector('.sp-sposts').checked }));
    if (pv.w !== '1,2' || pv.f !== '3,07' || pv.posts !== false) fail('Klistra in ska lägga mallen i rutan: ' + JSON.stringify(pv));
    await page.click('.sp-cancel'); await page.waitForTimeout(100); }
  { const r = await page.evaluate(() => { const x = { ...siteItems.find(q => q.type === 'scaffold'), name: 'Kommentar om ställningen', sDim: false, sFack: false, sLifts: false, sSeg: false }, run = o => { const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 900; const ctx = cv.getContext('2d'), txt = []; const ft = ctx.fillText.bind(ctx); ctx.fillText = (t, ...a) => { txt.push(String(t)); return ft(t, ...a); }; const Q = o.pts.map(mToPx); ctx.translate(100 - Math.min(...Q.map(q => q[0])), 100 - Math.min(...Q.map(q => q[1]))); drawScaffold2D(ctx, o, siteStyle(o, 14), pxPerMeter(), '', ''); return txt.join('|'); }; return { on: run(x), off: run({ ...x, sName: false }), callout: run({ ...x, sDim: true, sCallout: false }) }; });
    if (r.callout !== '') fail('Callouten ska gå att släcka helt: ' + JSON.stringify(r));
    if (!/Kommentar om/.test(r.on) || /Kommentar om/.test(r.off) || r.off !== '') fail('Namn/kommentar ska gå att släcka från ställningen: ' + JSON.stringify(r)); }
  { // Spara/Avbryt ska alltid synas i rutan (sticky), även när den scrollar
    await page.setViewportSize({ width: 1300, height: 560 });
    await page.evaluate(async () => { closeSitePop(); document.querySelector('[data-site="scaffold"]').click(); siteTool.pts = [[6512320, 150170], [6512340, 150170]]; finishSiteTool(); await new Promise(r => setTimeout(r, 300)); });
    const v = await page.evaluate(() => { const b = document.querySelector('.sp-save').getBoundingClientRect(), p = document.getElementById('sitePop').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, ph: window.innerHeight, pb: p.bottom }; });
    if (v.bottom > v.ph + 1 || v.bottom > v.pb + 1 || v.top < 0) fail('Spara ska alltid synas i rutan även i ett lågt fönster: ' + JSON.stringify(v));
    await page.click('.sp-cancel'); await page.setViewportSize({ width: 1300, height: 850 }); await page.waitForTimeout(200); }
  { // Högerklick på en punkts handtag tar bort punkten (men inte under minsta antal)
    const id = await page.evaluate(() => { const x = siteItems.find(q => q.type === 'scaffold' && q.pts.length === 3); closeSitePop(); selectedSiteId = x.id; const Q = mToPx(x.pts[1]); view.tx += 450 - stageToScreen(Q)[0]; view.ty += 400 - stageToScreen(Q)[1]; applyView(); renderZones(); return x.id; }); await page.waitForTimeout(200);
    const at = async i => page.evaluate(([id, i]) => { const x = siteItems.find(q => q.id === id), h = siteHandles(x, 14, pxPerMeter()).find(z => z.kind === 'vertex' && z.i === i), s = stageToScreen(mToPx(h.m)), r = document.getElementById('viewport').getBoundingClientRect(); return { x: r.left + s[0], y: r.top + s[1] }; }, [id, i]);
    let g = await at(1); await page.mouse.click(g.x, g.y, { button: 'right' }); await page.waitForTimeout(300);
    const n1 = await page.evaluate(id => siteItems.find(q => q.id === id).pts.length, id);
    if (n1 !== 2) fail('Högerklick på en punkt ska ta bort den: ' + n1);
    g = await at(0); await page.mouse.click(g.x, g.y, { button: 'right' }); await page.waitForTimeout(300);
    const n2 = await page.evaluate(id => siteItems.find(q => q.id === id).pts.length, id);
    if (n2 !== 2) fail('En ställning behöver minst 2 punkter: ' + n2); }
  { // Docka mot höger och pin
    await page.evaluate(() => { localStorage.removeItem('lagesplan-sitepop'); closeSitePop(); });
    const open = async y => page.evaluate(async y => { document.querySelector('[data-site="scaffold"]').click(); siteTool.pts = [[6512320, y], [6512340, y]]; finishSiteTool(); await new Promise(r => setTimeout(r, 300)); }, y);
    await open(150180);
    await page.click('.sp-dock'); await page.waitForTimeout(100);
    const d1 = await page.evaluate(() => { const p = document.getElementById('sitePop').getBoundingClientRect(), v = document.getElementById('viewport').getBoundingClientRect(); return { gap: Math.round(v.right - p.right), top: Math.round(p.top - v.top), on: document.querySelector('.sp-dock').classList.contains('on') }; });
    if (!d1.on || d1.gap > 10 || d1.top > 10) fail('Dockad ska rutan ligga mot höger kant: ' + JSON.stringify(d1));
    await page.click('.sp-cancel'); await open(150190);
    const d2 = await page.evaluate(() => { const p = document.getElementById('sitePop').getBoundingClientRect(), v = document.getElementById('viewport').getBoundingClientRect(); return Math.round(v.right - p.right); });
    if (d2 > 10) fail('Dockningen ska gälla nästa gång rutan öppnas: ' + d2);
    await page.click('.sp-dock'); await page.click('.sp-cancel');
    // pin: dra rutan, lås, öppna på nytt – den ska ligga kvar (högt fönster så att rutan inte klämmer ihop positionen)
    await page.setViewportSize({ width: 1300, height: 1300 }); await page.waitForTimeout(200);
    await open(150200);
    const hb = await page.evaluate(() => { const b = document.querySelector('#sitePop > b').getBoundingClientRect(); return { x: b.left + 30, y: b.top + 8 }; });
    await page.mouse.move(hb.x, hb.y); await page.mouse.down(); await page.mouse.move(hb.x - 200, hb.y + 60, { steps: 5 }); await page.mouse.up();
    await page.click('.sp-pin'); const p1 = await page.evaluate(() => [document.getElementById('sitePop').offsetLeft, document.getElementById('sitePop').offsetTop]);
    await page.click('.sp-cancel'); await open(150210);
    const p2 = await page.evaluate(() => [document.getElementById('sitePop').offsetLeft, document.getElementById('sitePop').offsetTop]);
    if (Math.abs(p1[0] - p2[0]) > 2 || Math.abs(p1[1] - p2[1]) > 2) fail('Pinnad ruta ska öppnas på samma plats: ' + JSON.stringify({ p1, p2 }));
    await page.click('.sp-pin'); await page.click('.sp-cancel'); await page.setViewportSize({ width: 1300, height: 850 }); }
  console.log('OK: ställning i plan – verktyg, mått och ritning i skala', JSON.stringify({ made: made.vals, inf, px, hit }));
  if (process.env.SLSHOT) { await page.evaluate(() => { document.getElementById('viewport') && 0; if (typeof renderAll === 'function') renderAll(); else if (typeof draw === 'function') draw(); }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SLSHOT }); }
  // Play/Pause vid datumreglaget (samma uppspelning som under Tid)
  const pl = await page.evaluate(async () => {
    const o = {}; const top = document.getElementById('btnPlayTop'); o.has = !!top && top.getBoundingClientRect().width > 0; o.t0 = top.textContent;
    top.click(); o.t1 = top.textContent; o.main1 = document.getElementById('btnPlay').textContent; o.on = !!playTimer;
    await new Promise(r => setTimeout(r, 1700)); top.click(); o.t2 = top.textContent; o.main2 = document.getElementById('btnPlay').textContent; o.off = !playTimer;
    return o;
  });
  if (!pl.has || pl.t1 !== '⏸' || !/Pausa/.test(pl.main1) || !pl.on || pl.t2 !== '▶' || !/Spela upp/.test(pl.main2) || !pl.off) fail('Play/Pause vid datumreglaget: ' + JSON.stringify(pl));
  console.log('OK: ▶/⏸ vid datumreglaget styr samma uppspelning', JSON.stringify(pl));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_scaffold2d');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
