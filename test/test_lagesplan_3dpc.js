// Punktmoln i 3D-editorn (Victor 2026-10-12: "stöd för punktmoln … utan att kompromissa med prestandan … hämta från
// Reality capture i Trimble connect"). Workern läser LAS, LAZ (laz-perf), XYZ och PLY och glesar ut till en budget;
// 3D-vyn visar molnet i rutor, med tänd/släck, färgläge, punktstorlek, cache och läsning ur Trimble Connect-mappar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9013;
const LAS = fs.readFileSync(path.join(__dirname, 'data', 'simple.las')), LAZ = fs.readFileSync(path.join(__dirname, 'data', 'simple.laz'));
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const u = q.url.split('?')[0]; r.writeHead(200, { 'Content-Type': u.endsWith('.js') ? 'application/javascript' : u.endsWith('.wasm') ? 'application/wasm' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);

    // 1. Workern: LAS och LAZ ger samma moln; XYZ och PLY; utglesning till budgeten.
    const parse = (b64, name, budget) => page.evaluate(([b64, name, budget]) => new Promise((res, rej) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = new Worker('pc-worker.js');
      w.onmessage = ev => { if (ev.data.type === 'progress') return; w.terminate(); if (ev.data.type === 'error') return res({ error: ev.data.message });
        const { info, chunks } = ev.data; let n = 0, sx = 0, rgbSum = 0; chunks.forEach(c => { n += c.pos.length / 3; for (let i = 0; i < c.pos.length; i += 3) sx += c.pos[i]; for (let i = 0; i < c.rgb.length; i++) rgbSum += c.rgb[i]; });
        res({ info, n, chunks: chunks.length, sx: Math.round(sx * 100) / 100, rgbSum }); };
      w.onerror = e => rej(new Error(e.message));
      w.postMessage({ bytes: u.buffer, name, budget }, [u.buffer]);
    }), [b64, name, budget]);
    const las = await parse(LAS.toString('base64'), 'simple.las', 1e7), laz = await parse(LAZ.toString('base64'), 'simple.laz', 1e7);
    if (las.error || laz.error) fail('LAS/LAZ: ' + (las.error || laz.error));
    if (las.n !== 1065 || laz.n !== 1065 || las.info.total !== 1065 || las.sx !== laz.sx || las.rgbSum !== laz.rgbSum || !las.info.rgb || !las.rgbSum || laz.info.format.indexOf('LAZ') !== 0)
      fail('LAS och LAZ ska ge samma 1065 punkter med färg: ' + JSON.stringify({ las, laz }));
    const sub = await parse(LAZ.toString('base64'), 'simple.laz', 300);
    if (!(sub.n > 200 && sub.n < 420) || sub.info.total !== 1065) fail('Utglesning till budgeten: ' + JSON.stringify({ n: sub.n, total: sub.info.total }));
    const xyz = 'x y z\n' + Array.from({ length: 500 }, (_, i) => `${6512300 + i * 0.1} ${150100 + (i % 20)} ${2 + i * 0.01} 200 100 50`).join('\n');
    const tx = await parse(Buffer.from(xyz).toString('base64'), 'moln.xyz', 1e7);
    if (tx.error || tx.n !== 500 || !tx.info.rgb || Math.round(tx.info.min[0]) !== 6512300) fail('XYZ: ' + JSON.stringify(tx));
    const nP = 200, ph = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${nP}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`);
    const pb = Buffer.alloc(nP * 15); for (let i = 0; i < nP; i++) { pb.writeFloatLE(i, i * 15); pb.writeFloatLE(i * 2, i * 15 + 4); pb.writeFloatLE(1, i * 15 + 8); pb[i * 15 + 12] = 255; }
    const ply = await parse(Buffer.concat([ph, pb]).toString('base64'), 'moln.ply', 1e7);
    if (ply.error || ply.n !== nP || !ply.info.rgb || ply.info.max[0] !== nP - 1) fail('PLY: ' + JSON.stringify(ply));
    const e57 = await parse(Buffer.from('ASTM-E57').toString('base64'), 'moln.e57', 1e7);
    if (!e57.error || !/LAZ eller LAS/.test(e57.error)) fail('E57 ska ge ett tydligt besked: ' + JSON.stringify(e57));
    console.log('OK: workern läser LAS, LAZ (samma moln), XYZ och PLY, glesar ut till budgeten, E57 ger besked');

    // 1b. Filer från datorn läses bit för bit direkt från disken (Victor 2026-10-12: "punktmoln på över 2gb"):
    //     samma moln som när hela filen ligger i minnet – LAS, LAZ med ett block och LAZ med flera block (format 3 och 7).
    const parseFile = (b64, name, budget) => page.evaluate(([b64, name, budget]) => new Promise((res, rej) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = new Worker('pc-worker.js');
      w.onmessage = ev => { if (ev.data.type === 'progress') return; w.terminate(); if (ev.data.type === 'error') return res({ error: ev.data.message });
        const { info, chunks } = ev.data; let n = 0, sx = 0, rgbSum = 0; chunks.forEach(c => { n += c.pos.length / 3; for (let i = 0; i < c.pos.length; i += 3) sx += c.pos[i]; for (let i = 0; i < c.rgb.length; i++) rgbSum += c.rgb[i]; });
        res({ info, n, chunks: chunks.length, sx: Math.round(sx * 100) / 100, rgbSum }); };
      w.onerror = e => rej(new Error(e.message));
      w.postMessage({ file: new File([u], name), name, budget });
    }), [b64, name, budget]);
    for (const f of ['simple.las', 'simple.laz', 'multichunk_f3.laz', 'multichunk_f7.laz']) {
      const b64 = fs.readFileSync(path.join(__dirname, 'data', f)).toString('base64');
      const mem = await parse(b64, f, 1e7), disk = await parseFile(b64, f, 1e7);
      if (mem.error || disk.error || mem.n !== disk.n || mem.sx !== disk.sx || mem.rgbSum !== disk.rgbSum || !/i block/.test(disk.info.format))
        fail(`${f}: filvägen ska ge samma moln: ` + JSON.stringify({ mem: { n: mem.n, sx: mem.sx, rgb: mem.rgbSum, e: mem.error }, disk: { n: disk.n, sx: disk.sx, rgb: disk.rgbSum, e: disk.error, f: disk.info && disk.info.format } }));
      if (/multichunk/.test(f) && disk.n !== 123457) fail(`${f}: alla 123457 punkter`);
      const sub2 = await parseFile(b64, f, 500);
      if (sub2.error || !(sub2.n > 0 && sub2.n <= 700)) fail(`${f}: utglesning från disk: ` + JSON.stringify(sub2));
    }
    console.log('OK: filer från datorn läses bit för bit (LAS, LAZ med ett och flera block, punktformat 3 och 7) – samma moln');

    // 2. I 3D-vyn: från en fil, ur Trimble Connect-mappen, tänd/släck, färg, storlek, cache.
    const center = await page.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__laz = u.buffer; return null; }, LAZ.toString('base64'));
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[637000, 849000, 400], [637100, 849000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
      Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
      window.__calls = [];
      askOpener = async (type, extra, t, onP) => {
        window.__calls.push(type);
        if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'd1', name: 'Skanning', type: 'folder' }] };
        if (type === 'tcFolder') return { folderId: 'd1', items: [{ id: 'L1', name: 'simple.laz', type: 'file', size: 18217, versionId: 'v1' }, { id: 'E1', name: 'stort.e57', type: 'file', size: 9e8 }] };
        if (type === 'tcFile' && extra.fileId === 'L1') { if (onP) onP(0.5, 9000, 18217); return { bytes: window.__laz.slice(0) }; }
        return {};
      };
    });
    await page.evaluate(() => { open3d(); });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3pcLoad === 'function', null, { timeout: 15000 });
    // Lager → Trimble Connect mapp: molnfilen syns och läses in med ett tryck.
    await page.evaluate(() => { l3PalTab('layers'); l3SetPref('laySort', 'tree'); l3LayersRender(); });
    await page.waitForSelector('#v3PalLayers [data-l3l-dir="d1"]', { timeout: 5000 });
    await page.click('#v3PalLayers [data-l3l-dir="d1"]');
    await page.waitForSelector('#v3PalLayers [data-pc-tc="L1"]', { timeout: 5000 });
    if (!(await page.isVisible('#v3PalLayers [data-pc-tc="E1"]'))) fail('E57-filen ska också synas i mappen');
    await page.click('#v3PalLayers [data-pc-tc="L1"]');
    await page.waitForFunction(() => l3pc.clouds.length === 1 && !l3pc.busy, null, { timeout: 15000 });
    const st = await page.evaluate(() => { const c = l3pc.clouds[0], g = c.group; let n = 0; g.children.forEach(p => { n += p.geometry.getAttribute('position').count; }); const wp = new THREE.Vector3(); g.getWorldPosition(wp); return { id: c.id, n, kids: g.children.length, pts: g.children.every(p => p.isPoints), x: wp.x + l3.O[0], size: c.mat.size, att: c.mat.sizeAttenuation, rem: l3pcRemembered().map(x => x.id).join(), file: window.__calls.includes('tcFile') }; });
    if (st.id !== 'pc:f:L1' || st.n !== 1065 || !st.pts || Math.abs(st.x - las.info.center[0]) > 0.01 || st.att !== false || st.rem !== 'pc:f:L1' || !st.file) fail('Molnet i 3D: ' + JSON.stringify(st));
    // Hämtade 3D-modeller: raden, tänd/släck, färg och storlek.
    await page.evaluate(() => { l3SetPref('laySort', 'list'); l3LayersRender(); });
    const row = await page.evaluate(() => { const r = document.querySelector('#v3PalLayers [data-pc-eye="pc:f:L1"]'); return r && r.closest('.v3-lr').textContent; });
    if (!row || !/simple\.laz/.test(row) || !/1\s065 p/.test(row)) fail('Raden för punktmolnet: ' + row);
    await page.click('#v3PalLayers [data-pc-eye="pc:f:L1"]');
    if (await page.evaluate(() => l3pc.clouds[0].group.visible)) fail('Ögat ska släcka molnet');
    await page.click('#v3PalLayers [data-pc-eye="pc:f:L1"]');
    const col = await page.evaluate(() => { const a = () => Array.from(l3pc.clouds[0].group.children[0].geometry.getAttribute('color').array.slice(0, 6)).join(); const rgb = a(); const s = document.getElementById('v3PcMode'); s.value = 'z'; s.dispatchEvent(new Event('change')); const z = a(); const r = document.getElementById('v3PcSize'); r.value = '4'; r.dispatchEvent(new Event('input')); return { rgb, z, size: l3pc.clouds[0].mat.size }; });
    if (col.rgb === col.z || col.size !== 4) fail('Färg efter höjd och punktstorlek: ' + JSON.stringify(col));
    // Visning (2026-10-12): runda punkter, meter, täckning, höjdfilter, höjdjustering, enfärgad + ljus; förlopp i raden.
    page.on('dialog', d => d.accept('2,5'));
    const vis = await page.evaluate(async () => {
      const c = l3pc.clouds[0], m = c.mat, out = {};
      const sec = document.querySelector('#v3PalLayers .v3-pc-view'); sec.open = true;
      document.querySelector('#v3PalLayers [data-pc-round="1"]').click();
      out.round = !!c.mat.map && c.mat.alphaTest === 0.5;
      const set = (id, v, ev = 'input') => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event(ev)); if (ev === 'input') e.dispatchEvent(new Event('change')); };
      set('v3PcOpacity', 50); out.op = m.transparent && Math.abs(m.opacity - 0.5) < 1e-6 && !m.depthWrite;
      set('v3PcZlo', 20); set('v3PcZhi', 70); out.clip = (m.clippingPlanes || []).length === 2 && l3.renderer.localClippingEnabled;
      set('v3PcAtten', '1', 'change'); out.atten = m.sizeAttenuation === true && m.size < 1;
      const a = () => Array.from(c.group.children[0].geometry.getAttribute('color').array.slice(0, 3)).join();
      set('v3PcMode', 'solid', 'change'); const solid = a();
      set('v3PcBright', 30); out.bright = a() !== solid && solid === '148,163,184';
      await l3pcSetDz(c.id); out.dz = Math.abs(c.dz - 2.5) < 1e-9 && l3pcRemembered().find(x => x.id === c.id).dz === 2.5;
      document.querySelector('#v3PcReset').click(); out.reset = !l3pc.clouds[0].mat.map && l3pc.clouds[0].mat.opacity === 1 && !l3pc.clouds[0].mat.clippingPlanes;
      l3pcProgress({ id: 'x', name: 'stort.laz' }, 'läser punkterna', 0.42);
      const ld = document.getElementById('v3PcLoad'); out.load = !!ld && /läser punkterna 42 %/.test(ld.textContent) && /stort\.laz – läser punkterna 42 %/.test(document.getElementById('v3Status').textContent);
      l3pc.loading = null; l3LayersRender();
      return out;
    });
    if (Object.values(vis).some(v => v !== true)) fail('Visning av punktmolnet: ' + JSON.stringify(vis));
    await page.evaluate(() => { const c = l3pc.clouds[0]; c.dz = 0; c.src.dz = 0; l3pcPlace(c); l3pcRemember(c.src, true); document.querySelector('#v3PalLayers .v3-pc-view').open = true; });
    // Fästa mot punkter i molnet: mått (fästpunkt "pc"), rotationspunkt och koordinat.
    const snap = await page.evaluate(() => {
      const c = l3pc.clouds[0]; l3pcZoom(c.id); l3.camera.position.copy(l3.orbit.target).add(new THREE.Vector3(0, -0.01, 1).multiplyScalar(200)); l3.camera.lookAt(l3.orbit.target); l3.orbit.update(); l3.camera.updateMatrixWorld();
      const a = c.group.children[0].geometry.getAttribute('position').array, gp = c.group.position;
      // Den högsta punkten (ingen annan framför den uppifrån).
      let k = 0; for (let i = 0; i < a.length; i += 3) if (a[i + 2] > a[k + 2]) k = i;
      const w = new THREE.Vector3(a[k] + gp.x, a[k + 1] + gp.y, a[k + 2] + gp.z), q = w.clone().project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect();
      const ev = { clientX: r.left + (q.x + 1) / 2 * r.width + 2, clientY: r.top + (1 - q.y) / 2 * r.height - 2, target: l3.renderer.domElement };
      const pk = l3pcPick(ev), sn = l3SnapRaw(ev), pv = l3PivotPoint(ev);
      const far = { clientX: r.left + 3, clientY: r.top + 3 };
      const t0 = performance.now(); for (let i = 0; i < 20; i++) l3pcPick(ev); const ms = (performance.now() - t0) / 20;
      const off = (() => { l3SetPref('snaps', { ...l3Snaps(), pc: false }); const x = l3SnapRaw(ev); l3SetPref('snaps', { ...l3Snaps(), pc: true }); return x; })();
      return { pick: !!pk && pk.point.distanceTo(w) < 1e-6, snap: sn && sn.kind === 'pc' && sn.point.distanceTo(w) < 1e-6, pivot: pv.distanceTo(w) < 1e-6, miss: !l3pcPick(far), off: !off || off.kind !== 'pc', ms: +ms.toFixed(2) };
    });
    // Stort moln (3 milj. punkter, 64 rutor): sökningen ska vara snabb nog att göras vid varje musrörelse.
    const big = await page.evaluate(() => {
      const G = 8, per = 3e6 / 64, chunks = [];
      let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let cx = 0; cx < G; cx++) for (let cy = 0; cy < G; cy++) {
        const pos = new Float32Array(per * 3), rgb = new Uint8Array(per * 3), inten = new Uint8Array(per);
        for (let i = 0; i < per; i++) { const x = (cx + rnd()) * 25 - 100, y = (cy + rnd()) * 25 - 100; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = rnd() < 0.5 ? 0 : rnd() * 30; }
        chunks.push({ pos, rgb, inten });
      }
      const src = { id: 'pc:big', name: 'big.laz' }, info = { n: 3e6, total: 3e6, center: [l3.O[0] + 500, l3.O[1], l3.O[2]], min: [l3.O[0] + 400, l3.O[1] - 100, l3.O[2]], max: [l3.O[0] + 600, l3.O[1] + 100, l3.O[2] + 30], rgb: false, intensity: false, format: 'test' };
      const c = l3pcBuild(src, { info, chunks });
      const t0 = performance.now(); l3pcIndex(c); const tIdx = performance.now() - t0;
      l3.camera.position.set(500 - 160, -160, 90); l3.orbit.target.set(500, 0, 5); l3.camera.lookAt(l3.orbit.target); l3.orbit.update(); l3.camera.updateMatrixWorld();
      const r = l3.renderer.domElement.getBoundingClientRect();
      let n = 0, hits = 0; const t1 = performance.now();
      for (let gx = 0.3; gx < 0.75; gx += 0.05) for (let gy = 0.3; gy < 0.75; gy += 0.05) { n++; if (l3pcPick({ clientX: r.left + r.width * gx, clientY: r.top + r.height * gy })) hits++; }
      const ms = (performance.now() - t1) / n;
      l3pcRemove('pc:big');
      return { tIdx: Math.round(tIdx), ms: +ms.toFixed(1), hits, n };
    });
    if (big.ms > 25 || big.hits < big.n * 0.5) fail('Fästa i stort moln: ' + JSON.stringify(big));
    console.log(`OK: stort moln (3 milj.) – index ${big.tIdx} ms en gång, ${big.ms} ms per sökning, ${big.hits}/${big.n} träffar`);
    if (!snap.pick || !snap.snap || !snap.pivot || !snap.miss || !snap.off) fail('Fästa mot punktmolnet: ' + JSON.stringify(snap));
    console.log(`OK: fästa mot punkter i molnet – mått, rotationspunkt, av/på i Fäst-raden (${snap.ms} ms per sökning)`);
    // Gå-läge (WASD): släpp ner kameran i molnet, gå framåt, titta med musen, följ marken, Esc avslutar.
    {
      await page.evaluate(() => { const c = l3pc.clouds[0], P = new THREE.Vector3(...c.info.center).sub(new THREE.Vector3(...l3.O)); l3wEnter(P); });
      const w0 = await page.evaluate(() => ({ on: l3w.on, orbit: l3.orbit.enabled, hud: !!document.querySelector('#view3d .v3-walk:not(.hidden)'), p: l3.camera.position.toArray(), yaw: l3w.yaw }));
      await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w'); await page.waitForTimeout(100);
      const w1 = await page.evaluate(() => ({ p: l3.camera.position.toArray(), sel: l3.sel.size }));
      const moved = Math.hypot(w1.p[0] - w0.p[0], w1.p[1] - w0.p[1]), dir = [(w1.p[0] - w0.p[0]) / moved, (w1.p[1] - w0.p[1]) / moved];
      const box = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await page.mouse.move(box[0], box[1]); await page.mouse.down(); await page.mouse.move(box[0] + 120, box[1] + 30, { steps: 5 }); await page.mouse.up();
      const w2 = await page.evaluate(() => ({ yaw: l3w.yaw, pitch: l3w.pitch }));
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      const w3 = await page.evaluate(() => ({ on: l3w.on, orbit: l3.orbit.enabled, hud: !!document.querySelector('#view3d .v3-walk:not(.hidden)') }));
      if (!w0.on || w0.orbit || !w0.hud || moved < 0.3 || Math.abs(dir[0] - Math.cos(w0.yaw)) > 0.05 || Math.abs(dir[1] - Math.sin(w0.yaw)) > 0.05 || !(w2.yaw < w0.yaw - 0.3) || !(w2.pitch < -0.05) || w3.on || !w3.orbit || w3.hud)
        fail('Gå-läget: ' + JSON.stringify({ w0, w1, moved, dir, w2, w3 }));
      console.log(`OK: gå-läge – W gick ${moved.toFixed(2)} m framåt, musen tittar runt, Esc avslutar`);
    }
    await page.screenshot({ path: path.join(process.env.PLACE_TMP || '.', '3dpc-panel.png'), clip: { x: 0, y: 0, width: 560, height: 850 } });
    console.log('OK: punktmolnets visning – runda punkter, meter, täckning, höjdfilter, enfärgad/ljus, höjdjustering, återställ, förlopp i raden');
    // Cache: bort ur vyn och tillbaka utan Trimble Connect.
    await page.waitForTimeout(500);
    await page.evaluate(async () => { l3pcRemove('pc:f:L1'); window.__calls = []; await l3pcRestore(); });
    const re = await page.evaluate(() => ({ n: l3pc.clouds.length, tc: window.__calls.includes('tcFile') }));
    if (re.n !== 1 || re.tc) fail('Ur webbläsarens cache utan att hämta från TC: ' + JSON.stringify(re));
    await page.evaluate(() => { l3Frame(true); l3Render(); }); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(process.env.PLACE_TMP || '.', '3dpc.png') });
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: punktmoln i 3D – ur TC-mappen, tänd/släck, färg efter höjd, punktstorlek, cache');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
