// Markerade objekt som HTML (knappen bredvid IFC). Kör: NODE_PATH=/opt/node22/lib/node_modules node test/test_ifc_html.js
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs'), PORT = 8996, fail = m => { throw new Error(m); }, ok = (c, m) => { if (!c) fail(m); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.css': 'text/css' };
(async () => {
  const server = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/t.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end('<meta charset="utf-8"><button id="btnExportSelHtmlTop">HTML</button><script src="ifc-subset.js"></script><script src="ifc-mesh.js"></script><script src="ifc-html.js"></script>'); }
    fs.readFile(path.join(DOCS, u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(d); } });
  }).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.goto(`http://localhost:${PORT}/t.html`);
  const sample = fs.readFileSync(path.join(DOCS, 'rust3d', 'sample.ifc'), 'latin1');
  await page.evaluate(async t => {
    window.__banner = []; window.showLagesplanBanner = m => window.__banner.push(m); ifcSubsetDownload = async () => ifcStrToBytes(t); ifcSubsetUnzip = async b => b; window.__sample = t; ifcSubset = (txt, g) => ({ text: window.__sample, found: g, missing: [] }); // provfilen är inte en fullständig byggnad: utplockningen ersätts, resten (web-ifc, färger, HTML) är på riktigt
    window.DEFAULT_STATUS_COLORS = { pagaende: '#00ff00', planerad: '#999999' }; window.settings = {}; window.items = [{ modelId: 'M1', objectId: 'W01', startDate: '2026-01-01' }]; window.computeItemPhase = () => 'pagaende';
    window.API = { viewer: { getSelection: async () => [{ modelId: 'M1', objectRuntimeIds: [11, 12, 13] }], convertToObjectIds: async (m, r) => r.map(x => ({ 11: 'W00', 12: 'W01', 13: 'SL0' })[x]), getModels: async () => [{ id: 'M1', name: 'Test.ifc' }],
      getObjectProperties: async (m, rids) => rids.map(id => ({ id, color: id === 11 ? '#ff0000' : undefined })) } };
  }, sample);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btnExportSelHtmlTop')]);
  const tmp = await dl.path(), file = tmp + '.html'; fs.copyFileSync(tmp, file); const html = fs.readFileSync(file, 'utf8');
  ok(/urval \d+ objekt/.test(dl.suggestedFilename()) && /\.html$/.test(dl.suggestedFilename()), 'Filnamn: ' + dl.suggestedFilename());
  ok(/1 med färg från Trimble Connect, 1 med statusfärg/.test(html), 'Statistiken ska nämna TC-färg och statusfärg');
  const banner = await page.evaluate(() => window.__banner.slice(-1)[0]); ok(/Färger: 1 från Trimble Connect, 1 statusfärg/.test(banner), 'Banner: ' + banner);
  // Öppna filen: modellen ritas, objekten finns, det röda objektet har TC-färgen
  const v = await ctx.newPage(); const verrs = []; v.on('pageerror', e => verrs.push(e.message)); await v.goto('file://' + file); await v.waitForTimeout(1500);
  const info = await v.evaluate(() => ({ layers: D.layers.length, objs: D.layers[0].objs.length, names: D.layers[0].objs.map(o => o.n).join('|'), guids: D.layers[0].objs.map(o => o.g).join(','), title: document.title, canvas: !!document.querySelector('canvas'),
    vc: (() => { const b = atob(D.layers[0].vc), o = D.layers[0].objs; return { first: [b.charCodeAt(0), b.charCodeAt(1), b.charCodeAt(2)] }; })() }));
  ok(info.layers === 1 && info.objs >= 3 && /W00/.test(info.guids) && info.canvas && /urval \d+ objekt/.test(info.title), 'Filen: ' + JSON.stringify(info));
  const reds = await v.evaluate(() => { const b = atob(D.layers[0].vc); let n = 0; for (let i = 0; i < b.length; i += 3) if (b.charCodeAt(i) === 255 && b.charCodeAt(i + 1) === 0 && b.charCodeAt(i + 2) === 0) n++; return n; });
  const greens = await v.evaluate(() => { const b = atob(D.layers[0].vc); let n = 0; for (let i = 0; i < b.length; i += 3) if (b.charCodeAt(i) === 0 && b.charCodeAt(i + 1) === 255 && b.charCodeAt(i + 2) === 0) n++; return n; }); ok(greens > 0, 'Objektet med statusfärg ska vara grönt');
  const ext = await v.evaluate(() => { const b = atob(D.layers[0].vc), p = D.layers[0].pos; const u = new Uint8Array(p.length * 0 + atob(p).length); return D.meta.origin; }); ok(Array.isArray(ext) && ext.length === 3, 'Origo i meta');
  ok(reds > 0, 'Objektet med färg från Trimble Connect ska vara rött (' + reds + ')');
  ok(!verrs.length && !errors.length, 'JS-fel: ' + verrs.concat(errors).join(' | '));
  console.log('OK test_ifc_html'); await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
