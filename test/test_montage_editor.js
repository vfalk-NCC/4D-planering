// Montageordning direkt i 3D-editorn: sekvenser (delas med dashboarden), datum med beroenden, färgning i modellen, export till HTML med riktig geometri.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const D = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.setContent('<body><div id="v3Canvas" style="position:relative;width:1200px;height:700px"></div></body>');
    for (const f of ['vendor/three/three.min.js', 'montage-report-modern.js', 'lagesplan-montage3d.js', 'lagesplan-3dmont.js']) await page.addScriptTag({ content: D(f) });
    const res = await page.evaluate(async () => {
      const out = {};
      // låtsasmodell: fyra kuber med IFC-id G1..G4
      const mkMesh = (guid, x, y, z, model) => { const g = new THREE.BufferGeometry(), P = [], I = []; for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) P.push(x + dx * 2, y + dy * 2, z + dz * 2); [[0, 1, 3, 0, 3, 2], [4, 6, 7, 4, 7, 5], [0, 4, 5, 0, 5, 1], [2, 3, 7, 2, 7, 6], [0, 2, 6, 0, 6, 4], [1, 5, 7, 1, 7, 3]].forEach(f => I.push(...f)); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(P), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.length).fill(0.5), 3)); g.setIndex(I); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); m.userData.l3b = { ranges: [{ start: 0, count: 8, idxStart: 0, idxCount: 36, guid }], model, tint: new Map(), alpha: new Map(), hidden: new Set(), origIdx: Uint32Array.from(I) }; m.updateMatrixWorld(true); return m; };
      const model = { id: 'M1', name: 'Bygg.ifc' }; const ents = ['G1', 'G2', 'G3', 'G4'].map((g, k) => ({ guid: g, mesh: mkMesh(g, k * 5, 0, 0, model) }));
      model._pEnts = new Map(ents.map(e => [e.guid, [{ mesh: e.mesh, ri: 0 }]])); model.meshes = ents.map(e => e.mesh);
      window.l3b = { models: [model], }; window.l3bs = { sel: [] };
      window.l3pEnts = m => m._pEnts; window.l3bsIdx = (mesh, ri) => { const r = mesh.userData.l3b.ranges[ri]; return [r.idxStart, r.idxCount]; }; window.l3bsKey = (mesh, ri) => 'M1|' + mesh.userData.l3b.ranges[ri].guid;
      window.__hidN = 0; window.l3bApplyHidden = () => { window.__hidN++; }; window.l3bRecolor = () => { window.__recolor = (window.__recolor || 0) + 1; };
      window.__fly = []; window.l3FlyTo = (c, d, dir, ms) => window.__fly.push([c.x, d, ms]); window.l3bsSet = l => { window.l3bs.sel = l; }; window.l3bsZoom = () => {}; window.l3Status = () => {}; window.l3Render = () => {}; window.l3Prefs = () => ({});
      window.l3pl = { rows: [] }; window.projectId = 'p1'; window.token = 't'; window.escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const store = {}; window.ghReadJSON = async () => JSON.parse(JSON.stringify(store.f || [])); window.ghWriteJSON = async (t, p, fn) => { store.f = fn(store.f || []); return store.f; };
      window.uiPrompt = async (t, d) => d; window.uiConfirm = async () => true; window.uiAlert = async () => {}; window.busyProgress = () => {};
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; cv.getContext('2d').fillStyle = '#88c'; cv.getContext('2d').fillRect(0, 0, 400, 300);
      window.l3 = { renderer: { render: () => {}, domElement: cv }, scene: {}, camera: {} }; window.__dl = null; window.downloadBlob = (b, n) => { window.__dl = { b, n }; };
      window.l3pProps = async (m, guid) => ({ cls: 'IfcColumn', attrs: [['Namn', 'Pelare ' + guid, 'a:name']], psets: [{ n: 'IMPACT', q: false, p: [['Element_mark', 'P-' + guid], ['Element_length', '3000.4'], ['Element_mass', '1500'], ['Location_phase', 'Fas 1']] }] });
      // sekvens: steg 1 (G1, G2), steg 2 väntar på 1 (G3) med glapp, steg 3 fritt (G4)
      const t0 = '2026-11-02', a = l3mtNewStep('Pelare', { dur: 2, start: t0, objs: [{ modelId: 'M1', modelName: 'Bygg.ifc', objectId: 'G1' }, { modelId: 'M1', modelName: 'Bygg.ifc', objectId: 'G2' }] });
      const b = l3mtNewStep('Balk', { dur: 3, deps: [a.id], depLags: { [a.id]: 1 }, objs: [{ modelId: 'ZZ', modelName: '', objectId: 'G3' }] }), c2 = l3mtNewStep('Stag', { dur: 1, start: '2026-11-20', objs: [{ modelId: '', objectId: 'G4' }, { modelId: '', objectId: 'FINNSEJ' }] });
      l3mt.cur = { id: 'S1', name: 'Stålhall test', area: 'Sikthall', desc: '', start: t0, steps: [a, b, c2] };
      const v = l3mtViews(l3mt.cur); out.dates = v.map(x => x.s + '>' + x.e).join();
      l3mt.follow = true; l3mt.i = 1; l3mtApply(); const th = i => ents[i].mesh.userData.l3b; const col = i => th(i).tint.get(0) && th(i).tint.get(0).map(x => Math.round(x * 100)).join(); const al = i => th(i).alpha.get(0);
      out.done = col(0); out.cur = col(2); out.fut = col(3); out.alphaFut = al(3); out.alphaCur = al(2); out.fly = window.__fly.length;
      l3mtRestore(); out.restored = !th(0).tint.size && !th(3).alpha.size;
      // färgen skrivs rakt i färgbufferten för objekten i steget
      out.paint = ents[2].mesh.geometry.getAttribute('color').array[0] > 0.9 && ents[2].mesh.geometry.getAttribute('color').array[2] < 0.2; // aktuellt = orange
      // släck kommande: ingen ny färg, objekten läggs i mtHide och indexlistan byggs om
      l3mt.i = 0; const V = l3mtVisGet(); V.fut = { m: 'hide', c: '#93c5fd', a: 0.16 }; V.done = { m: 'normal', c: '#969eaa', a: 0.59 }; const n0 = window.__hidN; l3mtApply({ noCam: true, full: true }); out.hide = th(2).mtHide.has(0) && th(3).mtHide.has(0) && !th(0).mtHide.has(0) && window.__hidN > n0 && !th(2).alpha.has(0);
      // bara de steg som byter fas berörs vid ett vanligt stegbyte (2 av 3 steg)
      const n1 = window.__hidN; l3mt.i = 1; l3mtApply({ noCam: true }); out.incremental = window.__hidN - n1 <= 2 && !th(2).mtHide.has(0) && th(3).mtHide.has(0);
      // övrig byggnad: släckt/tonad rör bara objekt utanför sekvensen
      l3mtRestore(); out.restored2 = !th(2).mtHide.size && !th(0).tint.size; l3mt.vis = null; V.fut = { m: 'fade', c: '#93c5fd', a: 0.16 };
      // panelhöjd och ganttvy
      l3mtToggle(true); await new Promise(r => setTimeout(r, 80)); l3mtSetH(520); out.height = document.getElementById('v3MontDock').style.height === '520px';
      l3mt.view = 'gantt'; l3mtRender(); await new Promise(r => setTimeout(r, 50)); out.gantt = document.querySelectorAll('.g-bar').length === 3 && !!document.querySelector('.g-h') && document.querySelectorAll('.g-ar path').length >= 1;
      const bar0 = document.querySelector('[data-gbar="0"]'); l3mt.drag = { k: 'mv', i: 0, x: 0, s: l3mt.c.views[0].s, e: l3mt.c.views[0].e, el: bar0, w: 40, moved: true, dd: 3 }; l3mtUp(); out.ganttDrag = l3mt.cur.steps[0].start === '2026-11-05' && l3mt.dirty;
      l3mt.cur.steps[0].start = '2026-11-02'; l3mtTouch(); l3mt.view = 'list'; l3mtRender();
      // markering -> steg
      window.l3bs.sel = [{ mesh: ents[0].mesh, ri: 0 }, { mesh: ents[3].mesh, ri: 0 }]; out.tg = l3mtSelTargets().map(t => t.objectId).join();
      // gränssnittet
      l3mtToggle(true); await new Promise(r => setTimeout(r, 100)); out.dock = !!document.getElementById('v3MontDock'); out.rows = document.querySelectorAll('.v3-mt-row').length; out.warn = [...document.querySelectorAll('.v3-mt-row .o')].map(x => x.textContent).join('|');
      // spara delas med dashboarden: samma fil
      l3mt.dirty = true; await l3mtSave(); out.saved = (store.f || []).length === 1 && store.f[0].id === 'S1';
      // export
      await l3mtExport(); out.msg = l3mt.msg; const dl = window.__dl; out.name = dl && dl.n; const html = dl ? await dl.b.text() : ''; out.len = html.length;
      const mpx = mpExtract(html), Dd = mpx && mpx.data; out.steps = Dd && Dd.steps.length; out.geo = !!(Dd && Dd.geo && Dd.geo.d); out.has3d = !!(Dd && Dd.has3d);
      out.f = Dd && Dd.steps[0].obj[0].f; out.found = Dd && Dd.steps.map(s => s.obj.length).join(); out.deps = Dd && Dd.steps.map(s => s.deps.join('+')).join(','); out.img = Dd && Dd.steps.every(s => s.img && s.img.length > 100); out.html = html;
      return out;
    });
    const html = res.html; delete res.html;
    if (res.dates !== '2026-11-02>2026-11-03,2026-11-05>2026-11-07,2026-11-20>2026-11-20') fail('datum med beroende och glapp: ' + res.dates);
    if (res.done !== '59,62,67' && !res.done) fail('klart steg färgas: ' + JSON.stringify(res)); if (!res.cur || !res.fut || !(res.alphaFut < 0.3) || res.alphaCur) fail('aktuellt/kommande färg: ' + JSON.stringify(res)); if (!res.fly) fail('kameran följer steget'); if (!res.restored) fail('färgerna släpps när man lämnar');
    if (!res.paint || !res.hide || !res.incremental || !res.restored2 || !res.height || !res.gantt || !res.ganttDrag) fail('färg i buffert, släck kommande, stegvis uppdatering, höjd och gantt: ' + JSON.stringify({ paint: res.paint, hide: res.hide, inc: res.incremental, rest: res.restored2, h: res.height, g: res.gantt, d: res.ganttDrag }));
    if (res.tg !== 'G1,G4') fail('markering blir objekt: ' + res.tg);
    if (!res.dock || res.rows !== 3 || !/1\/2|FINNSEJ|2\/2/.test(res.warn + '|')) fail('panelen: ' + JSON.stringify(res));
    if (!res.saved) fail('sekvensen sparas i 4D-datas fil'); if (!/_3D\.html$/.test(res.name || '')) fail('exporten blev inte 3D-fil: ' + JSON.stringify(res));
    if (res.steps !== 3 || !res.geo || !res.has3d || res.found !== '2,1,1' || res.deps !== ',0,') fail('exportens innehåll: ' + JSON.stringify(res));
    if (!res.f || res.f.m !== 'P-G1' || res.f.l !== 3000 || res.f.t !== 1.5 || res.f.p !== 'Fas 1') fail('egenskaperna följer med: ' + JSON.stringify(res.f)); if (!res.img) fail('bild per steg');
    const p2 = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const e2 = []; p2.on('pageerror', e => e2.push(e.message)); await p2.setContent(html); await p2.waitForSelector('#cv3'); await p2.waitForTimeout(1500);
    const n = await p2.evaluate(() => window.__v3 && window.__v3.state().N); if (n !== 4) fail('3D-vyn i exporten har 4 objekt: ' + n);
    if (errs.length || e2.length) fail('JS-fel: ' + errs.concat(e2).join(' | '));
    console.log('OK test_montage_editor', res.len, 'tecken');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
