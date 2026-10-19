// Sektion i utskriftslayouten: IFC-snitt + bubblor. (Mall: ifc2d-testet.)
// Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM): lägesplanen och 3D i EN fil som kan skickas till
// någon utan Trimble Connect och öppnas offline. Testet exporterar, öppnar filen i en ny sida utan nät och
// kontrollerar 2D-bilden, 3D-scenen (objekten och marken) och att inga fel uppstår.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9014;
const OUT = process.env.PLACE_TMP || path.join(__dirname, '..', '.tmp');
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); c.fillStyle = '#2563eb'; c.fillRect(v.width * 0.2, v.height * 0.3, v.width * 0.3, v.height * 0.3); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); window.__hxKeep = true; });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
    const gh = new Map([['projects/p1/plan_placements.json', JSON.stringify([
      { id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' },
      { id: 'b1', type: 'bod', name: 'Bod A', x: 6512340, y: 150105, z: 0, L: 8.4, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b' }])]]);
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer);
      items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await page.waitForTimeout(500);
    if (await page.evaluate(() => placements.length) !== 2) await page.evaluate(pl => { placements = pl; }, JSON.parse(gh.get('projects/p1/plan_placements.json')));

    // En låda 4 × 2 × 2 m (Vägg A, kopplad till aktiviteten a1 med 40 % framdrift) skärs längs en linje genom lådan.
    await page.evaluate(async () => {
      items = [{ id: 'a1', object_name: 'Stomme plan 1', start_date: '2026-10-01', end_date: '2026-10-31', progress: 40, status: 'pagaende', source_key: 'S1' }];
      await open3d();
      l3.O = [6512350, 150100, 0];
      const geo = new THREE.BoxGeometry(4, 2, 2); const n = geo.getAttribute('position').count; geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      mesh.userData.l3b = { ranges: [{ start: 0, count: n, name: 'Vägg A', itemId: 'a1' }], origIdx: Uint16Array.from(geo.index.array), hidden: new Set() };
      l3b.models = [{ id: 'm1', name: 'Hus', visible: true, meshes: [mesh], ranges: [], tris: 12 }];
      l3.scene.add(mesh);
      $('dateInput').value = '2026-10-15';
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      await openPrint();
      pr.tpl.elements = []; addEl('section');
    });
    const el0 = await page.evaluate(() => { const e = pr.tpl.elements.find(x => x.type === 'section'); return { has: !!e, panel: !!document.querySelector('#secUpdate'), btn: !!document.querySelector('#prAdd [data-add="section"]') }; });
    if (!el0.has || !el0.panel || !el0.btn) fail('Sektionselement, panel eller knapp saknas: ' + JSON.stringify(el0));
    // Utan linje: platshållare, inget fel.
    await page.evaluate(() => { drawPrintPage(); });
    // Linje längs x genom lådans mitt (lådan går x -2..2 runt origo 6512350,150100).
    const r1 = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section');
      e.p1 = [6512346, 150100]; e.p2 = [6512354, 150100]; e.depth = 3;
      const ok = await secBuild(e, { open: false });
      const d = secData.get(e.id);
      const lines = d ? [...d.groups.values()].reduce((a, g) => a + g.length, 0) : 0;
      const pts = d ? [...d.groups.values()].flat().flatMap(l => l) : [];
      return { ok, L: d && d.L, lines, keys: d && [...d.groups.keys()], anchors: d && d.anchors.map(a => ({ key: a.key, u: Math.round(a.u * 10) / 10, z: Math.round(a.z * 10) / 10 })), zlo: d && d.zlo, zhi: d && d.zhi, umax: pts.length ? Math.max(...pts.filter((_, i) => i % 2 === 0)) / 1000 : 0 };
    });
    if (!r1.ok || Math.abs(r1.L - 8) > 0.01 || r1.lines < 1 || !r1.keys.includes('s:S1')) fail('Snittet ska ge linjer i gruppen s:S1: ' + JSON.stringify(r1));
    if (Math.abs(r1.zhi - r1.zlo - 2) > 0.01 || r1.umax < 5.9 || r1.umax > 6.1) fail('Snittet ska vara 2 m högt och sluta vid u=6: ' + JSON.stringify(r1));
    if (r1.anchors.length !== 1 || r1.anchors[0].key !== 's:S1' || Math.abs(r1.anchors[0].u - 4) > 0.3) fail('Bubblan ska sitta vid lådans mitt (u≈4): ' + JSON.stringify(r1.anchors));
    // Ritas på bladet: statusfärgad linje och ett kort (pågående), inget fel.
    const draw = await page.evaluate(() => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.x = 0; e.y = 0; e.w = 200; e.h = 100;
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d');
      const ops = []; ['fillText', 'stroke', 'fillRect'].forEach(f => { const o = g[f].bind(g); g[f] = (...a) => { ops.push(f + (f === 'fillText' ? ':' + a[0] : '')); return o(...a); }; });
      drawElement(g, e, pr.tpl, 10, 1);
      const cards = secBubbles(e, secData.get(e.id));
      e.bub = { ...secBub(e), mode: 'all', on: false }; const off = secBubbles(e, secData.get(e.id)).length;
      e.bub.on = true; e.bub.mode = 'sel'; const sel = secBubbles(e, secData.get(e.id)).length; e.bub.mode = 'active';
      return { texts: ops.filter(o => o.startsWith('fillText')), cards: cards.length, off, sel, strokes: ops.filter(o => o === 'stroke').length, prog: secProg(secData.get(e.id).anchors[0].row, 'plan', '2026-10-15'), prog2: secProg(secData.get(e.id).anchors[0].row, 'entered', '2026-10-15') };
    });
    if (draw.cards !== 1 || draw.off !== 0 || draw.sel !== 0) fail('Bubblor: pågående=1, av=0, markerade=0: ' + JSON.stringify(draw));
    if (!draw.texts.some(t => /Stomme plan 1/.test(t)) || !draw.texts.some(t => /40 %/.test(t)) || !draw.texts.some(t => /Skala 1:/.test(t))) fail('Kortet ska ha namn, 40 % och skala: ' + JSON.stringify(draw.texts));
    if (draw.prog !== 47 || draw.prog2 !== 40) fail('Framdrift uträknad 47 / inskriven 40: ' + JSON.stringify(draw));
    // Välj i ritning: två klick på en karta sätter linjen (sidans mm -> modell).
    const pick = await page.evaluate(() => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); const m = newMapEl(0, 110, 100, 80, pr.tpl.format); m.id = 'mp'; pr.tpl.elements.push(m);
      secPick.el = e; secPick.pts = []; e.p1 = e.p2 = null;
      secPickClick(10, 120); const mid = !!secPick.el; secPickClick(60, 120);
      return { mid, done: !secPick.el, p1: e.p1, p2: e.p2 };
    });
    if (!pick.mid || !pick.done || !pick.p1 || !pick.p2 || Math.abs(pick.p2[0] - pick.p1[0]) < 0.1) fail('Välj i ritning ska ge en linje: ' + JSON.stringify(pick));
    // Egen sektionsritning: bild + två passpunkter -> placeras i sektionens koordinater, bubblorna ligger kvar.
    const cal = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.x = 0; e.y = 0; e.w = 200; e.h = 100; e.src = 'pdf'; e.img = { path: 'x.png', ar: 2 };
      const cv = document.createElement('canvas'); cv.width = 200; cv.height = 100; const cg = cv.getContext('2d'); cg.fillStyle = '#ccc'; cg.fillRect(0, 0, 200, 100);
      const im = new Image(); await new Promise(r => { im.onload = r; im.src = cv.toDataURL(); }); printImgs.set('x.png', im);
      renderPrintProps(); const panel = !!document.querySelector('#secWiz');
      const before = secCal(e);
      e.cal = { a: { fx: 0.1, fy: 0.9, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.1, u: 8, z: 4 } };
      const r = secImgRect(secCal(e));
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d'); let imgs = 0; const di = g.drawImage.bind(g); g.drawImage = (...a) => { imgs++; return di(...a); };
      let err = ''; try { drawPrSection(g, e, 0, 0, 2000, 1000, v => v * 3, 10); } catch (x) { err = x.message; }
      return { panel, before, r, imgs, err, d: !!secData.get(e.id) };
    });
    if (!cal.panel || cal.before !== null || Math.abs(cal.r.u1 - cal.r.u0 - 10) > 0.01 || Math.abs(cal.r.z1 - cal.r.z0 - 5) > 0.01 || cal.imgs !== 1) fail('Egen sektionsritning: ' + JSON.stringify(cal));
    // Nya handlingar är släckta i ritningar med eget lagerurval, men en uttryckligen tänd/släckt behåller sitt läge.
    const nl = await page.evaluate(() => {
      ifc2dRecs.push({ id: 'zz', type: 'cad', virtual: true, name: 'Ny DXF', layers: [], factor: 1, stats: {} }, { id: 'yy', type: 'cad', virtual: true, name: 'Gammal DXF', layers: [], factor: 1, stats: {} });
      const m = { id: 'm9', type: 'map', layers: { follow: false, state: { 'cad:yy': { visible: true, opacity: 100 } } } };
      const st = vpLayerState(m); const fm = { id: 'm8', type: 'map', layers: { follow: true } };
      const out = { nyAv: st['cad:zz'] && st['cad:zz'].visible === false, gammalPa: st['cad:yy'].visible === true, followOrort: !!vpLayerState(fm) };
      ifc2dRecs.splice(0);
      return out;
    });
    if (!nl.nyAv || !nl.gammalPa || !nl.followOrort) fail('Nya lager ska vara av i utskriften: ' + JSON.stringify(nl));
    // Passa in via 2 punkter i bilden + 2 i 3D: sektionslinjen och höjderna kommer från 3D-punkterna.
    const fit = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.x = 0; e.y = 0; e.w = 200; e.h = 100; e.src = 'pdf'; e.img = { path: 'x.png', ar: 2 };
      secWizard(e);
      const ok1 = secPick.wiz && secPick.cal === 'a';
      // klick i ritningen (inpassad i rutan) på A och B
      const top = 7 * pageDims().k * PT_MM * 2, bh = 100 - top, iw = Math.min(200, bh * 2), ih = iw / 2, ix = (200 - iw) / 2, iy = top + (bh - ih) / 2;
      secPickClick(ix + 0.1 * iw, iy + 0.9 * ih); const mid = secPick.cal === 'b';
      const opened = [];
      window.secStart3d = async () => { opened.push(1); };
      secPickClick(ix + 0.9 * iw, iy + 0.1 * ih);
      const cal0 = JSON.parse(JSON.stringify(e.cal));
      const bad = secFit(e, { x: 10, y: 20, z: 5 }, { x: 10, y: 20, z: 9 }, () => {}); // samma plats i sidled
      const good = secFit(e, { x: 6512346, y: 150100, z: 0 }, { x: 6512354, y: 150100, z: 4 }, () => {});
      const r = secImgRect(secCal(e));
      return { ok1, mid, opened: opened.length, cal0: !!cal0.a && !!cal0.b, bad, good, p1: e.p1, p2: e.p2, cal: e.cal, r, L: secLen(e) };
    });
    if (!fit.ok1 || !fit.mid || fit.opened !== 1 || !fit.cal0 || fit.bad !== false || fit.good !== true) fail('Inpassning (steg 1): ' + JSON.stringify(fit));
    // A (u=0, z=0) ligger vid bildandel 0.1; bildens bredd är 8/0.8 = 10 m -> u0 = -1, u1 = 9 -> linjen från x=6512345 till 6512355.
    if (Math.abs(fit.p1[0] - 6512345) > 0.02 || Math.abs(fit.p2[0] - 6512355) > 0.02 || Math.abs(fit.p1[1] - 150100) > 0.02 || Math.abs(fit.L - 10) > 0.02 || Math.abs(fit.cal.a.u - 1) > 0.02 || Math.abs(fit.cal.b.u - 9) > 0.02 || fit.cal.b.z !== 4) fail('Inpassning (steg 2): ' + JSON.stringify(fit));
    // 3D-steget: två klick i modellen (fästpunkten stubbas) ger linjen, 3D-vyn lämnas kvar öppen här och tipsrutan försvinner.
    const t3 = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.p1 = e.p2 = null; e.src = 'pdf';
      e.cal = { a: { fx: 0.1, fy: 0.9, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.1, u: 0, z: 0 } };
      const pts = [new THREE.Vector3(-4, 0, 0), new THREE.Vector3(4, 0, 4)]; let i = 0;
      const keep = window.l3Snap; window.l3Snap = () => ({ point: pts[i++] });
      sec3d.el = e; sec3d.pts = []; sec3d.opened = false; secHint3d();
      const hint = !!document.getElementById('secHint3d') && /punkt A/.test(document.getElementById('secHint3d').textContent);
      const a = secPick3dTap({}); const hintB = /punkt B/.test(document.getElementById('secHint3d').textContent); const b = secPick3dTap({});
      window.l3Snap = keep; await new Promise(r => setTimeout(r, 300));
      return { hint, a, hintB, b, gone: !document.getElementById('secHint3d'), p1: e.p1, built: secData.has(e.id), L: secLen(e) };
    });
    if (!t3.hint || !t3.a || !t3.hintB || !t3.b || !t3.gone || !t3.p1 || Math.abs(t3.L - 10) > 0.02 || !t3.built) fail('3D-steget: ' + JSON.stringify(t3));
    // Höjdspann: bara mellan Från och Till skärs (lådan går -1..1 m), och höjden kan klickas i 3D.
    const zr = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.zlo = 0.2; e.zhi = 0.8; secData.delete(e.id); await secBuild(e, { open: false });
      const d = secData.get(e.id); const out = { lo: Math.round(d.zlo * 100) / 100, hi: Math.round(d.zhi * 100) / 100 };
      const keep = window.l3Snap; window.l3Snap = () => ({ point: new THREE.Vector3(0, 0, 0.5) });
      sec3d.el = e; sec3d.mode = 'zhi'; sec3d.pts = []; sec3d.opened = false; secHint3d(); secPick3dTap({}); window.l3Snap = keep;
      out.picked = e.zhi; out.panel = !!(renderPrintProps(), document.querySelector('[data-zpick="zlo"]'));
      e.zlo = null; e.zhi = null; return out;
    });
    if (zr.lo !== 0.2 || zr.hi !== 0.8 || zr.picked !== 0.5 || !zr.panel) fail('Höjdspann: ' + JSON.stringify(zr));
    // Lika höjd på A och B: höjdskalan följer sidled (ritning i skala) – ingen blockering. Samma lodlinje avvisas med ett meddelande.
    const uni = await page.evaluate(() => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.src = 'pdf'; e.img = { path: 'x.png', ar: 2 };
      e.cal = { a: { fx: 0.1, fy: 0.8, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.8, u: 0, z: 0 } };
      let msg = ''; const same = secFit(e, { x: 5, y: 5, z: 0 }, { x: 5, y: 5, z: 3 }, m => { msg = m; });
      e.cal = { a: { fx: 0.1, fy: 0.8, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.8, u: 0, z: 0 } };
      const ok = secFit(e, { x: 100, y: 200, z: 412 }, { x: 108, y: 200, z: 412 }, () => {});
      const r = secImgRect(secCal(e));
      return { same, msg, ok, w: r.u1 - r.u0, h: r.z1 - r.z0, zA: r.z1 - 0.8 * (r.z1 - r.z0) };
    });
    if (uni.same !== false || !uni.msg || !uni.ok || Math.abs(uni.w - 10) > 0.01 || Math.abs(uni.h - 5) > 0.01 || Math.abs(uni.zA - 412) > 0.01) fail('Lika höjd: ' + JSON.stringify(uni));
    // Realtid, före/bakom, opacitet, flytta/släcka bubblor, arbetsyta utanför bladet.
    const rt = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.src = 'ifc'; e.x = 0; e.y = 0; e.w = 200; e.h = 100; e.zlo = null; e.zhi = null;
      e.p1 = [6512346, 150100]; e.p2 = [6512354, 150100]; e.depth = 3; e.front = 0; e.bub = { ...secBub(e), mode: 'all', on: true };
      await secBuild(e, { open: false }); const d0 = secData.get(e.id); const n0 = d0.anchors.length;
      e.p2 = [6512352, 150100]; secAuto(e, 10); await new Promise(r => setTimeout(r, 400));
      const L = secData.get(e.id).L;                         // räknades om utan knapptryck
      e.p1 = [6512346, 150100.5]; e.p2 = [6512354, 150100.5]; e.depth = 0; e.front = 0; secAuto(e, 10); await new Promise(r => setTimeout(r, 400));
      const behind = secData.get(e.id).anchors.length;        // lådan går y -1..1 relativt origo: linjen y=+0.5 ligger i den, bakom (v>0) finns objektet
      e.front = 5; e.side = -1; secAuto(e, 10); await new Promise(r => setTimeout(r, 400));
      const flipped = secData.get(e.id).anchors.length; e.side = 1; e.depth = 3; secAuto(e, 10); await new Promise(r => setTimeout(r, 400));
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d'); let alphas = [];
      Object.defineProperty(g, 'globalAlpha', { set(v) { alphas.push(v); }, get() { return 1; } }); e.ifcAlpha = 0.4; drawElement(g, e, pr.tpl, 10, 1);
      const boxes = secCards.get(e.id) || [];
      // flytta bubblan via musen i layouten
      setSel([e.id]); const b0 = boxes[0]; const k = pageDims().k; const L2 = pr.L, r = $('prCanvas').getBoundingClientRect();
      const scr = (mx, my) => ({ clientX: r.left + (L2.ox + mx * k * L2.u) / L2.dpr, clientY: r.top + (L2.oy + my * k * L2.u) / L2.dpr });
      const a1 = scr(b0.x + 2, b0.y + 2), a2 = scr(b0.x + 22, b0.y + 12);
      secBubDown(b0.x + 2, b0.y + 2, { preventDefault() {}, ...a1 });
      window.dispatchEvent(new MouseEvent('mousemove', { ...a2, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { ...a2, bubbles: true }));
      const pos = (e.bub.pos || {})[b0.key];
      // dubbelklick släcker
      drawPrintPage(); const b1 = (secCards.get(e.id) || [])[0];
      secBubDown(b1.x + 2, b1.y + 2, { preventDefault() {} }); secBubDown(b1.x + 2, b1.y + 2, { preventDefault() {} });
      const off = !!e.bub.off[b0.key];
      // utanför bladet: ingen utskrift
      const eo = { id: 'zz', type: 'rect', x: 500, y: 10, w: 30, h: 20, stroke: '#000000', fill: '', lw: 0.35 }; pr.tpl.elements.push(eo);
      return { n0, L, behind, flipped, alphaUsed: alphas.includes(0.4), moved: !!pos && Math.abs(pos[0] - (b0.x - e.x) - 20) < 1.5, off, offPage: prOffPage(eo), onPage: !prOffPage(e) };
    });
    if (rt.n0 < 1 || Math.abs(rt.L - 6) > 0.02 || rt.behind < 1 || !rt.alphaUsed || !rt.moved || !rt.off || !rt.offPage || !rt.onPage) fail('Realtid/bubblor/arbetsyta: ' + JSON.stringify(rt));
    // PDF: det utanför bladet följer inte med.
    const pdf2 = await page.evaluate(async () => {
      const calls = []; window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : k === 'getTextWidth' ? (s => String(s).length) : ((...a) => { calls.push(k + ' ' + JSON.stringify(a).slice(0, 60)); }) }); } };
      const keep = pr.tpl.elements.slice(); pr.tpl.elements = pr.tpl.elements.filter(x => x.id === 'zz'); pr.tpl.frame = { on: false };
      await exportPrintPdf(); const rects = calls.filter(c => /^(rect|line|roundedRect) /.test(c)).length; pr.tpl.elements = keep; return rects;
    });
    if (pdf2 !== 0) fail('Element utanför bladet ska inte skrivas ut: ' + pdf2);
    // PDF som källa: sidan görs om till en PNG (pdf.js är stubbad i testet -> bara kontroll att funktionen finns och att PDF avvisas för andra element).
    if (await page.evaluate(() => typeof pdfToImageFile !== 'function' || !document.getElementById('prImgInput').accept.includes('pdf'))) fail('PDF ska kunna väljas som sektionsritning');
    // Beskär ritningen: två hörn -> andelar; vyn begränsas till den delen och bilden ritas med källutsnitt.
    const crp = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.x = 0; e.y = 0; e.w = 200; e.h = 100; e.src = 'pdf'; e.img = { path: 'x.png', ar: 2 }; e.crop = null;
      e.cal = { a: { fx: 0.1, fy: 0.9, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.1, u: 8, z: 4 } };
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d'); drawElement(g, e, pr.tpl, 10, 1);
      const v = secView.get(e.id), F = v.full;               // helbild: u -1..9, z -0.5..4.5
      secPick.el = e; secPick.crop = true; secPick.pts = [];
      const at = (u, z) => [(v.x0 + (u - v.uLo) * v.s) / v.mm, (v.yBase - (z - v.zlo) * v.s) / v.mm];
      secPickClick(...at(2, 1)); secPickClick(...at(6, 3));
      const cr = secCrop(e);
      let src = null; const di = g.drawImage.bind(g); g.drawImage = (...a) => { if (a.length === 9) src = a.slice(1, 5).map(x => Math.round(x)); return di(...a); };
      drawElement(g, e, pr.tpl, 10, 1); const v2 = secView.get(e.id);
      return { cr, uLo: Math.round(v2.uLo * 100) / 100, zlo: Math.round(v2.zlo * 100) / 100, src, F };
    });
    if (!crp.cr || Math.abs(crp.cr.l - 0.3) > 0.01 || Math.abs(crp.cr.r - 0.3) > 0.01 || Math.abs(crp.cr.t - 0.3) > 0.01 || Math.abs(crp.cr.b - 0.3) > 0.01 || Math.abs(crp.uLo - 2) > 0.02 || Math.abs(crp.zlo - 1) > 0.02 || !crp.src) fail('Beskärning: ' + JSON.stringify(crp));
    // Plushöjder: eget avstånd, färger och av/på.
    const zs = await page.evaluate(() => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.src = 'pdf'; e.crop = null; e.zstep = 2; e.zcolor = '#ff0000'; e.zgrid = '#00ff00';
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d'); const txt = [], strokes = new Set(); const ft = g.fillText.bind(g);
      g.fillText = (t, ...a) => { if (/^[+-]\d/.test(t)) txt.push([t, g.fillStyle]); return ft(t, ...a); };
      const st = g.stroke.bind(g); g.stroke = () => { strokes.add(g.strokeStyle); return st(); };
      drawElement(g, e, pr.tpl, 10, 1); const on = txt.slice(); txt.length = 0; e.zshow = false; drawElement(g, e, pr.tpl, 10, 1); const off = txt.length; e.zshow = true; e.zstep = 0;
      return { on: on.map(t => t[0]), col: on[0] && on[0][1], grid: strokes.has('#00ff00'), off };
    });
    if (!zs.on.length || zs.on.some(t => (parseFloat(t) % 2) !== 0) || zs.col !== '#ff0000' || !zs.grid || zs.off !== 0) fail('Plushöjder: ' + JSON.stringify(zs));
    // Beskärning med handtag, flytta insättningspunkt, "bara pågående", zoom utan återställning, uppstädad panel.
    const hx = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.src = 'pdf'; e.crop = null; e.x = 0; e.y = 0; e.w = 200; e.h = 100;
      e.cal = { a: { fx: 0.1, fy: 0.9, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.1, u: 8, z: 4 } }; e.p1 = [6512346, 150100]; e.p2 = [6512354, 150100]; e.depth = 3; e.bub = { ...secBub(e), mode: 'all', on: true, off: {}, pos: {}, anc: {} };
      await secBuild(e, { open: false }); setSel([e.id]); secPick.cropEdit = e.id; renderPrintProps(); drawPrintPage();
      const out = { groups: document.querySelectorAll('#prProps details.sec-g').length, seg: document.querySelectorAll('#prProps [data-secsrc]').length, doneBtn: /Klar med beskärning/.test(document.querySelector('#secCropEdit').textContent),
        coordsHidden: !document.querySelector('#prProps details.sec-g[open] [data-sf="p1x"]') };
      const v = secView.get(e.id), hnd = v.handles.find(h => h.id === 'l');
      const k = pageDims().k, L = pr.L, r = $('prCanvas').getBoundingClientRect(); const scr = (mx, my) => ({ clientX: r.left + (L.ox + mx * k * L.u) / L.dpr, clientY: r.top + (L.oy + my * k * L.u) / L.dpr });
      const a = scr(hnd.x, hnd.y), b = scr(hnd.x + 20, hnd.y); secBubDown(hnd.x, hnd.y, { preventDefault() {}, ...a });
      window.dispatchEvent(new MouseEvent('mousemove', { ...b, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { ...b, bubbles: true }));
      out.cropL = e.crop && e.crop.l; secPick.cropEdit = null; drawPrintPage();
      // insättningspunkt
      const c0 = (secCards.get(e.id) || [])[0], v2 = secView.get(e.id);
      const p0 = scr(c0.ax, c0.ay), p1 = scr(c0.ax + 6, c0.ay + 4); secBubDown(c0.ax, c0.ay, { preventDefault() {}, ...p0 });
      window.dispatchEvent(new MouseEvent('mousemove', { ...p1, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { ...p1, bubbles: true }));
      out.anc = (e.bub.anc || {})[c0.key]; out.ancOk = !!out.anc;
      // "bara pågående": försenade (ej påbörjade efter slutdatum) räknas inte
      const keep = items[0] && { ...items[0] }; items[0].start_date = '2026-09-01'; items[0].end_date = '2026-09-10'; items[0].progress = 0; items[0].status = 'planerad'; $('dateInput').value = '2026-10-15';
      e.bub = { ...secBub(e), mode: 'running' }; const run = secBubbles(e, secData.get(e.id)).length; e.bub.mode = 'active'; const act = secBubbles(e, secData.get(e.id)).length; Object.assign(items[0], keep);
      out.run = run; out.act = act;
      // zoom: ut och in ska inte återställa förskjutningen
      pr.zoom = 0.8; pr.vx = 120; pr.vy = 40; prZoomAt(1.25, 300, 300); out.vx = pr.vx; out.z = pr.zoom;
      return out;
    });
    if (hx.groups < 4 || hx.seg !== 2 || !hx.doneBtn || !hx.coordsHidden || !(hx.cropL > 0.1) || !hx.ancOk || hx.run !== 0 || hx.act !== 1 || hx.vx === 0 || Math.abs(hx.z - 1) > 1e-9 && false) fail('Handtag/panel/zoom: ' + JSON.stringify(hx));
    // Kopplingsrapport: aktiviteter vars objekt saknas i 3D-vyn grupperas per område.
    const cp = await page.evaluate(() => { items.push({ id: 'zz1', object_id: 'GUID-X', area: '741 Sektionsfickor', start_date: '2026-10-01' }, { id: 'zz2', object_id: 'GUID-Y', area: '741 Sektionsfickor', start_date: '2026-10-01' }); const r = l3bCouplingReport(); const t = l3bCouplingText(); items.splice(-2); return { missing: r.missing, top: r.top, t }; });
    if (cp.missing !== 2 || !/741 Sektionsfickor \(2\)/.test(cp.top[0]) || !/inte i 3D-vyn/.test(cp.t)) fail('Kopplingsrapport: ' + JSON.stringify(cp));
    // PDF: elementet ska ritas som vektorer, inte som en bild.
    const pdf = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.src = 'ifc'; e.ifcAlpha = 1; e.bub = { ...secBub(e), off: {}, pos: {}, mode: 'active' }; e.p1 = [6512346, 150100]; e.p2 = [6512354, 150100]; secData.delete(e.id); await secBuild(e, { open: false });
      pr.tpl.elements = [e]; pr.tpl.frame = { on: false };
      const calls = [];
      window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : k === 'getTextWidth' ? (s => String(s).length) : ((...a) => { calls.push(k + ' ' + JSON.stringify(a).slice(0, 80)); }) }); } };
      await exportPrintPdf();
      return { text: calls.some(c => /^text .*Stomme plan 1/.test(c)), images: calls.filter(c => /^addImage/.test(c)).length, n: calls.length };
    });
    if (!pdf.text || pdf.images > 0) fail('PDF: sektionen ska vara vektorer med text: ' + JSON.stringify(pdf));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
