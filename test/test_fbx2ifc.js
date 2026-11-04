const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs'), PORT = 9081;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/fbx2ifc.html`);
  const cube = (x, n) => { const V = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(v => [x + v[0] * 2000, v[1] * 2000, v[2] * 2000]); return `o ${n}\n` + V.map(v => 'v ' + v.join(' ')).join('\n') + '\n' + [[1,2,3,4],[5,8,7,6],[1,5,6,2],[2,6,7,3],[3,7,8,4],[4,8,5,1]].map(f => 'f ' + f.map(i => i + parseInt(n.replace(/\D/g, '') || 0) * 8).join(' ')).join('\n') + '\n'; };
  let obj = ''; for (let i = 0; i < 20; i++) obj += cube(i * 3000, 'Pelare' + i);
  fs.writeFileSync('/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/modell.obj', obj);
  await page.setInputFiles('#pick', '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/modell.obj');
  if (await page.evaluate(() => document.getElementById('go').disabled)) fail('Knappen ska bli aktiv när en fil valts');
  await page.click('#go'); await page.waitForSelector('#res a', { timeout: 20000 });
  const r = await page.evaluate(async () => { const a = document.querySelector('#res a'), buf = new Uint8Array(await (await fetch(a.href)).arrayBuffer()); const z = fflate.unzipSync(buf), names = Object.keys(z), text = new TextDecoder().decode(z[names[0]]); return { link: a.download, names, faceSets: (text.match(/IFCTRIANGULATEDFACESET/g) || []).length, proxies: (text.match(/IFCBUILDINGELEMENTPROXY/g) || []).length, head: text.slice(0, 20), stats: document.getElementById('stats').textContent }; });
  if (r.link !== 'modell.ifczip' || r.names[0] !== 'modell.ifc' || r.proxies !== 20 || r.faceSets !== 1 || !/ISO-10303-21/.test(r.head)) fail('Omvandlaren: ' + JSON.stringify(r));
  // gräns för småprylar: alla kuber (2 m) är mindre än 5 m → inget att skriva, med tydligt besked
  await page.evaluate(() => { document.getElementById('min').value = '5'; }); await page.click('#go'); await page.waitForSelector('#res .err', { timeout: 20000 });
  const r2 = await page.evaluate(() => document.getElementById('res').textContent);
  if (!/Inga trianglar/.test(r2)) fail('Besked när allt hoppas över: ' + r2);
  await page.evaluate(() => { document.getElementById('min').value = '2.5'; document.getElementById('zip').checked = false; }); await page.click('#go'); await page.waitForFunction(() => (document.querySelector('#res a') || {}).download === 'modell.ifc', null, { timeout: 20000 });
  console.log('OK: FBX/OBJ → IFC-omvandlaren (fbx2ifc.html): 20 delar blir 1 delad geometri, packas som .ifczip, småprylar kan hoppas över', JSON.stringify(r));
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
