const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9098;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1000);
    const mkNode = (m, seed) => { const b = new Uint8Array(m * 10), q = new Uint16Array(b.buffer, 0, m * 3); for (let i = 0; i < m; i++) { q[i * 3] = (i * 37 + seed) % 65535; q[i * 3 + 1] = (i * 91 + seed) % 65535; q[i * 3 + 2] = Math.floor(i / m * 65535); b[m * 6 + i * 4] = 200; b[m * 6 + i * 4 + 1] = 100; b[m * 6 + i * 4 + 2] = 50; b[m * 6 + i * 4 + 3] = 10; } return b; };
    const b0 = mkNode(1000, 1), b1 = mkNode(1000, 7), file = new Blob([b0, b1]);
    const H = { size: 100, org: [0, 0, 0], total: 2000, center: [50, 50, 50], min: [0, 0, 0], max: [100, 100, 100], rgb: true, format: 'test', nodes: [[0, 0, 0, 0, 1000, 0, [1]], [1, 0, 0, 0, 1000, 10000, []]] };
    const c = await l3olBuild({ id: 'tlod', name: 'test.laz', version: '1' }, { H, file }, () => {});
    out.built = !!c && !!c.lod && c.lod.nodes.length === 2;
    const root = c.lod.nodes[0], leaf = c.lod.nodes[1]; leaf.pinned = false; const zOf = n => { const a = n.pts.geometry.getAttribute('position'); let mx = -Infinity; for (let i = 0; i < a.count; i++) mx = Math.max(mx, a.getZ(i)); return [a.count, mx]; };
    out.n0 = [zOf(root)[0], zOf(leaf)[0]];
    const res = l3peAddFilter(c, { t: 'z', mode: 'above', z0: 80 });   // tar bort allt över 80 m (z + 50 > 80)
    out.removed = res.removed > 100;
    out.rootCut = zOf(root)[0] < 1000 && zOf(root)[1] + 50 <= 80.01;   // översiktsnoden följer (ritas med de nya punkterna)
    out.leafDropped = !leaf.pts && leaf.state === 0;   // detaljnoden kastas och läses in igen
    leaf.state = 1; c.lod.loading = 1; await l3olLoadNode(c, leaf);
    out.leafCut = !!leaf.pts && zOf(leaf)[0] < 1000 && zOf(leaf)[1] + 50 <= 80.01;
    l3peUndo(c); out.undoRoot = zOf(root)[0] === 1000; out.undoLeafDropped = !leaf.pts; leaf.state = 1; c.lod.loading = 1; await l3olLoadNode(c, leaf); out.undoLeaf = zOf(leaf)[0] === 1000;
    // bortklippt som lager: tänd = punkterna är med igen, släckt = bortklippta
    { const c2 = c; l3peReset(c2); const r1 = l3peAddFilter(c2, { t: 'z', mode: 'above', z0: 80 }); const rowsOn = () => document.querySelectorAll('[data-pc-ed]').length;
      out.edRow = typeof l3peLabel === 'function' && /Höjdfilter/.test(l3peLabel(c2.edits[0], 0)) && c2.edits[0].nrem > 100;
      const rt = l3peToggle(c2.id, 0); await l3peOverlay(c2, 0); const ovp = c2.ovPts && c2.ovPts.get(0);   // tänd: molnet rörs inte, lagrets punkter ritas ovanpå
      out.layerOn = rt && rt.off === true && zOf(root)[0] < 1000 && !!ovp && ovp.geometry.getAttribute('position').count === c2.edits[0].nrem && c2.group.children.includes(ovp);
      const rt2 = l3peToggle(c2.id, 0); await l3peOverlay(c2, 0); out.layerOff = rt2 && rt2.off === false && !(c2.ovPts && c2.ovPts.get(0)) && zOf(root)[0] < 1000;
      out.noReload = !leaf.pts || zOf(leaf)[0] < 1000;
      { const h0 = l3pcHtml((a, on, l, ex, cls) => `<div ${a}>${l}${ex}</div>`, escHtml); out.trashBtn = /data-pc-eddel="tlod\|0"/.test(h0); const uc = window.uiConfirm; window.uiConfirm = async () => true; const did = await l3peDelete(c2.id, 0); window.uiConfirm = uc;
        const h1 = l3pcHtml((a, on, l, ex, cls) => `<div ${a}>${l}${ex}</div>`, escHtml); out.trashDel = did === true && c2.edits[0].del === true && !/data-pc-ed="tlod\|0"/.test(h1) && zOf(root)[0] < 1000; c2.edits[0].del = false; }
      const html = l3pcHtml((a, on, l, ex, cls) => `<div ${a} data-on="${on}" class="${cls || ''}">${l}${ex}</div>`, escHtml); out.listRow = /data-pc-ed="tlod\|0"/.test(html) && /Bortklippt 1: Höjdfilter/.test(html) && /v3-lr-sub/.test(html); }
    // export: bortklippt (lager) + kvarvarande = alla punkter; LAS-huvudet stämmer
    { l3peReset(c); l3peAddFilter(c, { t: 'z', mode: 'above', z0: 80 }); c.edits[0].name = 'Tak-skräp';
      out.name = l3peLabel(c.edits[0], 0) === 'Tak-skräp';
      const rd = async blob => { const b = new Uint8Array(await blob.arrayBuffer()), d = new DataView(b.buffer); return { sig: String.fromCharCode(b[0], b[1], b[2], b[3]), n: d.getUint32(107, true), len: b.length, zmax: d.getFloat64(179, true), zmin: d.getFloat64(187, true) }; };
      const removed = await l3pxExport(c, 0, 'Tak-skräp', null, { format: 'las' }), kept = await l3pxExport(c, 'kept', 'redigerad', null, { format: 'las' }), R = await rd(removed.blob), K = await rd(kept.blob);
      out.expRemoved = R.sig === 'LASF' && R.n === removed.count && R.len === 227 + R.n * 26 && R.n > 100 && R.zmin + 0 > 79.9 - 50 + 0.0;
      out.expKept = K.sig === 'LASF' && K.n === kept.count && K.len === 227 + K.n * 26 && K.zmax <= 80.02;
      out.expSum = R.n + K.n === 2000;
      c.edits[0].off = true; const all = await l3pxExport(c, 'kept', 'hela', null, { format: 'las' }); out.expAll = all.count === 2000; c.edits[0].off = false;
      // omdöpning via lagret i listan
      const html = l3pcHtml((a, on, l, ex, cls) => `<div ${a}>${l}${ex}</div>`, escHtml); out.btns = /data-pc-edname="tlod\|0"/.test(html) && /data-pc-edexp="tlod\|0"/.test(html) && /Tak-skräp/.test(html); }
    // LAZ: skrivs med las-laz-js och avkodas med appens egen avkodare (laz-perf) i en separat worker
    { c.edits[0].off = false; const decode = async blob => { const buf = await blob.arrayBuffer(), base = location.href.replace(/[^/]*$/, '');
        const code = `importScripts(${JSON.stringify(base + 'vendor/laz-perf/laz-perf.js')}); onmessage = async e => { const L = await createLazPerf({ locateFile: p => ${JSON.stringify(base + 'vendor/laz-perf/')} + p }), n = e.data.byteLength, fp = L._malloc(n); L.HEAPU8.set(new Uint8Array(e.data), fp); const hd = new DataView(e.data), sc = hd.getFloat64(131, true), oz = hd.getFloat64(171, true), zip = new L.LASZip(); zip.open(fp, n); const len = zip.getPointLength(), cnt = zip.getCount(), dp = L._malloc(len); let zmin = Infinity, zmax = -Infinity; for (let i = 0; i < cnt; i++) { zip.getPoint(dp); const z = new DataView(L.HEAPU8.buffer, dp, len).getInt32(8, true) * sc + oz; if (z < zmin) zmin = z; if (z > zmax) zmax = z; } postMessage({ cnt, zmin, zmax, compressed: (hd.getUint16(104 - 0 + 0, true) & 0x80) !== 0 || hd.getUint8(104) >= 128 }); };`;
        const wk = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))); return new Promise((res, rej) => { wk.onmessage = e => { wk.terminate(); res(e.data); }; wk.onerror = e => { wk.terminate(); rej(new Error(e.message)); }; wk.postMessage(buf, [buf]); }); };
      const kl = await l3pxExport(c, 'kept', 'redigerad'), rl = await l3pxExport(c, 0, 'Tak-skräp'), KL = await decode(kl.blob), RL = await decode(rl.blob);
      out.lazKept = KL.cnt === kl.count && KL.zmax <= 80.02 && KL.cnt > 100; out.lazRemoved = RL.cnt === rl.count && RL.zmin > 79.9 - 0.2 && RL.cnt + KL.cnt === 2000; out.lazSmaller = kl.blob.size < (227 + kl.count * 26) * 0.95;
      const las = await l3pxExport(c, 'kept', 'las', null, { format: 'las' }); out.lasStill = las.blob.size === 227 + las.count * 26 && las.count === kl.count;
      const flyN = []; const fly0 = l3FlyTo; l3FlyTo = (v, r) => { flyN.push([v.z, r]); }; await l3peZoom(c.id, 0); l3FlyTo = fly0; out.edZoom = flyN.length === 1 && Array.isArray(c.edits[0].bb) && c.edits[0].bb[5] >= c.edits[0].bb[2];
      const hh = () => l3pcHtml((a, on, l, ex, cls) => `<div ${a} class="${cls || ''}">${l}${ex}</div>`, escHtml); out.hasZoomBtn = /data-pc-edzoom="tlod\|0"/.test(hh()); out.hasFold = /data-pc-fold="tlod"/.test(hh());
      l3SetPref('pcFold:tlod', true); out.folded = !/data-pc-ed="tlod\|0"/.test(hh()) && /data-pc-fold="tlod"/.test(hh()); l3SetPref('pcFold:tlod', null); out.unfolded = /data-pc-ed="tlod\|0"/.test(hh());
      const vw = await l3peView('tlod|0'); const rm = c.edits[0].nrem; const sv = await l3pcsRun(vw, { strips: { axis: 'x', x0: c.info.center[0] - 1e6, y0: 0, cuts: [1e6] } }); out.subStrips = sv.files.length === 1 && sv.files[0].n === rm && rm > 0;
      const mb = await l3pmBuild(vw, { type: 'grid', cell: 50, zmode: 'mean', maxEdge: 0, color: 'rgb', spike: 0 }).then(r => r.V.length > 0, e => String(e.message)); out.subMesh = mb === true || /För få|föll bort/.test(mb); out.subName = /^test/.test(vw.name) && vw.name.length > 5; out.subBounds = JSON.stringify(l3pcsBounds(vw).min) === JSON.stringify(c.edits[0].bb.slice(0, 3)); out.subInfo = [rm, sv.files[0] && sv.files[0].n, String(mb)];
      const sp = await l3pcsRun(c, { strips: { axis: 'x', x0: c.info.center[0] - 1e6, y0: 0, cuts: [1e6] } }); out.stripsFullRes = sp.files.length === 1 && sp.files[0].n === kl.count && /\.laz$/.test(sp.files[0].name); out.stripsN = [sp.files.map(f => f.n), kl.count]; }
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 500)); process.exit(1); }
  const bad = Object.entries(r).filter(([k, v]) => v === false).map(x => x[0]); if (bad.length) { console.error('FAIL punktmoln-redigering: ' + bad.join(',')); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: punktmoln med detaljnivåer – borttagna punkter försvinner även i detaljnoderna, Ångra tar tillbaka dem');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
