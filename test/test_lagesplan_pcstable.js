// Stabil punktmolnsimport (Victor 2026-11-05: "programmet har börjat hänga sig väldigt ofta vid import av punktmoln"):
// cachen sparas en ruta åt gången och läses tillbaka identiskt, bygget görs i delar utan att blockera, inläsningen kan avbrytas
// och en läsare som slutar svara avbryts av ett hängskydd, och molnen delar på ett gemensamt punkttak.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9031;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const u = q.url.split('?')[0]; r.writeHead(200, { 'Content-Type': u.endsWith('.js') ? 'application/javascript' : u.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[637000, 849000, 400], [637100, 849000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); open3d(); });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3pcBuild === 'function', null, { timeout: 20000 });

    // 1. Cachen: delad i en post per ruta, läses tillbaka identiskt; äldsta moln rensas inklusive rutorna.
    const cache = await page.evaluate(async () => {
      const mk = (n, seed) => { const pos = new Float32Array(n * 3), rgb = new Uint8Array(n * 3), inten = new Uint8Array(n); for (let i = 0; i < n * 3; i++) { pos[i] = (i * 7 + seed) % 97; rgb[i] = (i + seed) % 251; } for (let i = 0; i < n; i++) inten[i] = (i + seed) % 200; return { pos, rgb, inten }; };
      const data = { type: 'done', info: { n: 6000, total: 6000, center: [0, 0, 0], min: [0, 0, 0], max: [1, 1, 1], rgb: true, intensity: true, format: 'LAS' }, chunks: [mk(2000, 1), mk(2000, 2), mk(2000, 3)] };
      const src = { id: 'pc:t1', name: 't1.las', version: 'v1' };
      await l3pcCachePut(src, data);
      const back = await l3pcCacheGet(src);
      const same = back && back.chunks.length === 3 && back.chunks.every((c, i) => c.pos.length === data.chunks[i].pos.length && c.pos.every((v, k) => v === data.chunks[i].pos[k]) && c.rgb.every((v, k) => v === data.chunks[i].rgb[k]) && c.inten.every((v, k) => v === data.chunks[i].inten[k]));
      // fler moln än L3PC_KEEP: de äldsta tas bort tillsammans med sina rutor
      for (let k = 2; k <= L3PC_KEEP + 2; k++) { await l3pcCachePut({ id: 'pc:t' + k, name: 't.las', version: 'v1' }, { ...data, chunks: [mk(50, k)] }); await new Promise(r => setTimeout(r, 5)); }
      const db = await l3pcDb(), keys = await new Promise(res => { const q = db.transaction(L3PC_STORE).objectStore(L3PC_STORE).getAllKeys(); q.onsuccess = () => res(q.result); });
      const heads = keys.filter(k => !String(k).includes('#'));
      const first = await l3pcCacheGet(src);
      return { same, heads: heads.length, keep: L3PC_KEEP, gone: first === null, orphans: keys.filter(k => String(k).includes('#') && !heads.includes(String(k).split('#')[0])).length };
    });
    if (!cache.same || cache.heads !== cache.keep || !cache.gone || cache.orphans) fail('Cachen i delar: ' + JSON.stringify(cache));
    console.log('OK: cachen sparas en ruta åt gången, läses tillbaka identiskt och städas utan kvarglömda rutor');

    // 2. Bygget i delar: huvudtråden hinner ritas/svara mellan rutorna.
    const sl = await page.evaluate(async () => {
      const G = 40, chunks = []; for (let i = 0; i < G; i++) { const n = 40000, pos = new Float32Array(n * 3); for (let k = 0; k < n; k++) { pos[k * 3] = i + Math.random(); pos[k * 3 + 1] = Math.random() * 40; pos[k * 3 + 2] = Math.random() * 3; } chunks.push({ pos, rgb: new Uint8Array(n * 3), inten: new Uint8Array(n) }); }
      const info = { n: G * 40000, total: G * 40000, center: [l3.O[0], l3.O[1], l3.O[2]], min: [0, 0, 0], max: [40, 40, 3], rgb: false, intensity: false, format: 't' };
      let ticks = 0, maxGap = 0, last = performance.now(); const iv = setInterval(() => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; ticks++; }, 4);
      const prog = []; const c = await l3pcBuildSliced({ id: 'pc:sl', name: 'sl' }, { info, chunks }, f => prog.push(f));
      clearInterval(iv);
      return { ticks, maxGap: Math.round(maxGap), chunks: c.chunkPts.length, inList: l3pc.clouds.includes(c), prog: prog.length, room: l3pcRoom() < l3pcMaxPts() };
    });
    if (sl.chunks !== 40 || !sl.inList || sl.ticks < 1 || !sl.room) fail('Bygge i delar: ' + JSON.stringify(sl));
    console.log('OK: stora moln byggs i delar (huvudtråden får utrymme emellan) och räknas av mot det gemensamma punkttaket ' + JSON.stringify({ ticks: sl.ticks, maxGapMs: sl.maxGap }));

    // 3. Avbryt och hängskydd: en läsare som aldrig svarar avbryts.
    const st = await page.evaluate(async () => {
      window.__l3pcStallMs = 2500;
      const r = await l3pcParse(new ArrayBuffer(8), 'x.unknown', null).then(() => 'ok', e => e.message);   // okänt format ger direkt ett fel
      const orig = window.Worker; let killed = 0;
      window.Worker = function () { return { postMessage() {}, terminate() { killed++; }, set onmessage(f) {}, set onerror(f) {} }; };   // läsare som aldrig svarar
      const t0 = performance.now(); const hang = await l3pcParse(new ArrayBuffer(8), 'x.las', null).then(() => 'ok', e => e.message);
      const dt = performance.now() - t0;
      const p2 = l3pcParse(new ArrayBuffer(8), 'x.las', null); setTimeout(() => l3pc.cancel && l3pc.cancel(), 50);
      const can = await p2.then(() => 'ok', e => ({ msg: e.message, cancelled: !!e.cancelled }));
      window.Worker = orig; delete window.__l3pcStallMs;
      return { r, hang, dt: Math.round(dt), killed, can, cleared: !l3pc.worker && !l3pc.cancel };
    });
    if (!/Okänt/.test(st.r) || !/hängde sig/.test(st.hang) || st.dt < 2400 || st.dt > 8000 || !st.can.cancelled || st.killed !== 2 || !st.cleared) fail('Hängskydd och avbryt: ' + JSON.stringify(st));
    console.log('OK: en läsare som hänger sig avbryts efter tidsgränsen, och inläsningen kan avbrytas av användaren');
    // 4. Stora moln från Trimble Connect hämtas som Blob (ingen jättestor minnesbit) och läses av läsaren direkt.
    const bl = await page.evaluate(async () => {
      let asked = null; const orig = askOpener;
      askOpener = async (type, extra) => { if (type === 'tcFile') { asked = extra; let t = ''; for (let i = 0; i < 300; i++) t += `${i % 20} ${Math.floor(i / 20)} ${(i % 7) / 2}\n`; return { blob: new Blob([t]) }; } return orig(type, extra); };
      await l3pcFromTc('F-blob', 'blob.xyz', { versionId: 'v1' }); askOpener = orig;
      return { asked, loaded: l3pc.clouds.some(c => c.id === 'pc:f:F-blob'), n: (l3pc.clouds.find(c => c.id === 'pc:f:F-blob') || {}).nTot };
    });
    if (!bl.asked || bl.asked.blob !== true || !bl.loaded || !(bl.n > 100)) fail('Moln som Blob: ' + JSON.stringify(bl));
    console.log('OK: punktmoln från Trimble Connect hämtas som Blob och läses av läsaren utan en enda stor minnesbit');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_pcstable');
  } catch (e) { console.error('FEL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
