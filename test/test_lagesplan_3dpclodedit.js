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
      const rt = l3peToggle(c2.id, 0); out.layerOn = rt && rt.off === true && zOf(root)[0] === 1000 && !leaf.pts; leaf.state = 1; c2.lod.loading = 1; await l3olLoadNode(c2, leaf); out.layerOnLeaf = zOf(leaf)[0] === 1000;
      const rt2 = l3peToggle(c2.id, 0); out.layerOff = rt2 && rt2.off === false && zOf(root)[0] < 1000 && !leaf.pts; leaf.state = 1; c2.lod.loading = 1; await l3olLoadNode(c2, leaf); out.layerOffLeaf = zOf(leaf)[0] < 1000 && zOf(leaf)[1] + 50 <= 80.01;
      const html = l3pcHtml((a, on, l, ex, cls) => `<div ${a} data-on="${on}" class="${cls || ''}">${l}${ex}</div>`, escHtml); out.listRow = /data-pc-ed="tlod\|0"/.test(html) && /Bortklippt 1: Höjdfilter/.test(html) && /v3-lr-sub/.test(html); }
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 500)); process.exit(1); }
  const bad = Object.entries(r).filter(([k, v]) => v === false).map(x => x[0]); if (bad.length) { console.error('FAIL punktmoln-redigering: ' + bad.join(',')); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: punktmoln med detaljnivåer – borttagna punkter försvinner även i detaljnoderna, Ångra tar tillbaka dem');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
