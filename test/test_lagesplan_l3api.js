const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), { spawn } = require('child_process');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9887, BPORT = 8791;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
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
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3api !== 'undefined', null, { timeout: 15000 });

  // --- bryggan som egen process, med en enkel MCP-klient över stdio ---
  const br = spawn('node', [path.join(__dirname, '..', 'tools', 'mcp', '4d-bridge.mjs')], { env: { ...process.env, FOURD_PORT: String(BPORT) } });
  let buf = '', rid = 0; const waiters = new Map(), stderr = [];
  br.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (!l.trim()) continue; const m = JSON.parse(l); const w = waiters.get(m.id); if (w) { waiters.delete(m.id); w(m); } } });
  br.stderr.on('data', d => stderr.push(String(d)));
  const rpc = (method, params) => new Promise((res, rej) => { const id = ++rid; const t = setTimeout(() => rej(new Error('MCP-tidsgräns ' + method)), 30000); waiters.set(id, m => { clearTimeout(t); res(m); }); br.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const tool = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args || {} }); const c = r.result.content, txt = c.find(x => x.type === 'text'); return { err: !!r.result.isError, text: txt ? txt.text : '', json: txt && !r.result.isError ? JSON.parse(txt.text) : null, image: c.find(x => x.type === 'image') }; };
  await new Promise(r => setTimeout(r, 500));

  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  if (!init.result || init.result.serverInfo.name !== '4d-planering' || !init.result.capabilities.tools) fail('initialize: ' + JSON.stringify(init));
  const list = (await rpc('tools/list', {})).result.tools, defs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'mcp', 'tools.json'), 'utf8'));
  if (list.length !== defs.length || list.some(t => !t.description || !t.inputSchema)) fail('tools/list: ' + list.length);
  const have = await page.evaluate(() => Object.keys(l3api.methods));
  const miss = defs.map(d => d.name).filter(n => !have.includes(n)), extra = have.filter(n => !defs.some(d => d.name === n));
  if (miss.length || extra.length) fail('tools.json och API:t ska hänga ihop: saknas i sidan ' + miss + ' / saknas i tools.json ' + extra);
  console.log('OK: MCP-bryggan svarar på initialize och tools/list – ' + list.length + ' verktyg, samma som sidans API');

  // inte kopplad än → tydligt fel
  const nc = await tool('status');
  if (!nc.err || !/inte kopplad/.test(nc.text)) fail('Utan kopplad sida ska verktygen svara med ett tydligt fel: ' + JSON.stringify(nc));
  // origin som inte är tillåten nekas
  const bad = await new Promise(r => http.get({ host: '127.0.0.1', port: BPORT, path: '/health', headers: { Origin: 'https://evil.example' } }, res => r(res.statusCode)));
  const good = await new Promise(r => http.get({ host: '127.0.0.1', port: BPORT, path: '/health', headers: { Origin: 'https://vfalk-ncc.github.io' } }, res => r(res.statusCode)));
  if (bad !== 403 || good !== 200) fail('Bryggan ska bara svara tillåtna webbplatser: ' + bad + '/' + good);

  await page.evaluate(p => l3apiConnect(p), BPORT); await page.waitForTimeout(800);
  const chip = await page.evaluate(() => { const e = document.getElementById('v3Bridge'); return e && e.textContent; });
  if (!/kopplad/.test(chip || '')) fail('Fliken "🔌 Claude" ska visa att den är kopplad: ' + chip);

  // --- läsa ---
  const st = (await tool('status')).json;
  if (!st.origin || st.counts.placements !== 0 || !st.camera.position) fail('status: ' + JSON.stringify(st));
  const O = st.origin;

  // --- bygga ---
  const box = await tool('create_box', { x: O[0] + 5, y: O[1] + 5, z: O[2], length: 4, width: 2, height: 3, name: 'Testlåda', color: '#3b82f6' });
  if (box.err) fail('create_box: ' + box.text);
  const bb = box.json.bbox, dx = bb[1][0] - bb[0][0], dy = bb[1][1] - bb[0][1], dz = bb[1][2] - bb[0][2];
  if (Math.abs(dx - 4) > 0.05 || Math.abs(dy - 2) > 0.05 || Math.abs(dz - 3) > 0.05 || Math.abs((bb[0][0] + bb[1][0]) / 2 - (O[0] + 5)) > 0.05) fail('Lådan ska ligga där Claude bad om: ' + JSON.stringify(box.json));
  const rot = await tool('create_box', { x: O[0] - 5, y: O[1], z: O[2], length: 4, width: 2, height: 1, rot: 90, name: 'Vriden' });
  const rb = rot.json.bbox; if (Math.abs((rb[1][0] - rb[0][0]) - 2) > 0.1 || Math.abs((rb[1][1] - rb[0][1]) - 4) > 0.1) fail('rot=90 ska byta sidor: ' + JSON.stringify(rot.json));
  const pr = await tool('create_prism', { points: [[O[0], O[1] + 10], [O[0] + 6, O[1] + 10], [O[0] + 6, O[1] + 14], [O[0], O[1] + 14]], z: O[2], height: 5, name: 'Prisma' });
  const pb = pr.json.bbox; if (pr.err || Math.abs((pb[1][2] - pb[0][2]) - 5) > 0.05 || Math.abs((pb[1][0] - pb[0][0]) - 6) > 0.05) fail('create_prism: ' + JSON.stringify(pr));
  const cy = await tool('create_cylinder', { x: O[0] + 20, y: O[1], z: O[2], radius: 1.5, height: 4 });
  if (cy.err || Math.abs((cy.json.bbox[1][0] - cy.json.bbox[0][0]) - 3) > 0.1) fail('create_cylinder: ' + JSON.stringify(cy));
  const pl = await tool('create_polyline', { points: [[O[0], O[1], O[2]], [O[0] + 5, O[1], O[2] + 2], [O[0] + 5, O[1] + 5, O[2] + 2]], name: 'Bana' });
  if (pl.err) fail('create_polyline: ' + pl.text);
  const lib = (await tool('list_library')).json; if (!lib.some(x => x.type === 'tornkran') || !lib.some(x => /^sm:/.test(x.type))) fail('list_library: ' + JSON.stringify(lib.slice(0, 3)));
  const kr = await tool('place_library', { type: 'tornkran', x: O[0] + 30, y: O[1] + 30, z: O[2], name: 'Kran A' });
  if (kr.err || !kr.json.id || kr.json.name !== 'Kran A') fail('place_library: ' + JSON.stringify(kr));
  const bad2 = await tool('place_library', { type: 'finns-inte', x: 0, y: 0 }); if (!bad2.err || !/Okänd/.test(bad2.text)) fail('Okänd biblioteksdel ska ge fel');
  const lo = (await tool('list_objects', {})).json; if (lo.total !== 6) fail('list_objects ska ge 6 objekt: ' + lo.total);
  const lq = (await tool('list_objects', { name: 'låda' })).json; if (lq.total !== 1) fail('list_objects filtrerar på namn: ' + lq.total);
  console.log('OK: Claude bygger via MCP – låda, vriden låda, prisma, cylinder, linje och biblioteksobjekt hamnar på rätt plats och mått');

  // --- ändra ---
  const up = await tool('update_object', { id: box.json.id, name: 'Flyttad', color: '#ef4444', x: O[0] + 8, z: O[2] + 1 });
  if (up.err || Math.abs((up.json.bbox[0][0] + up.json.bbox[1][0]) / 2 - (O[0] + 8)) > 0.05 || Math.abs(up.json.bbox[0][2] - (O[2] + 1)) > 0.05 || up.json.name !== 'Flyttad') fail('update_object: ' + JSON.stringify(up));
  const dup = await tool('duplicate_object', { id: box.json.id, dx: 10, dy: 0 });
  if (dup.err || Math.abs((dup.json.bbox[0][0]) - (up.json.bbox[0][0] + 10)) > 0.05) fail('duplicate_object med förskjutning: ' + JSON.stringify(dup));
  const n1 = (await tool('status')).json.counts.placements;
  const del = await tool('delete_objects', { ids: [dup.json.id] }); const n2 = (await tool('status')).json.counts.placements;
  if (del.err || n2 !== n1 - 1) fail('delete_objects: ' + n1 + ' → ' + n2);
  const un = await tool('undo'); const n3 = (await tool('status')).json.counts.placements;
  if (un.err || n3 !== n1) fail('undo ska ta tillbaka det borttagna: ' + n1 + ' → ' + n3);
  console.log('OK: flytta, färga, kopiera, ta bort och ångra via MCP');

  // --- lägesplanens etableringsobjekt (ställning med breddning) ---
  const sc = await tool('add_site_item', { type: 'scaffold', points: [[O[0], O[1] + 40], [O[0] + 20, O[1] + 40]], name: 'Ställning J', props: { h: 12, wid: [{ i: 0, a: 5, b: 9, d: 1.5, s: 1 }] } });
  if (sc.err) fail('add_site_item: ' + sc.text);
  const si = (await tool('list_site_items', { type: 'scaffold' })).json;
  if (si.total < 1 || !si.items.some(x => x.id === sc.json.id && x.extra && x.extra.breddningar === 1)) fail('Ställningen med breddning ska finnas: ' + JSON.stringify(si));
  const us = await tool('update_site_item', { id: sc.json.id, props: { h: 15 } });
  const rec = await page.evaluate(id => { const x = siteItems.find(q => q.id === id); return { h: x.h, w: x.w, wid: x.wid.length }; }, sc.json.id);
  if (us.err || rec.h !== 15 || rec.wid !== 1) fail('update_site_item: ' + JSON.stringify(rec));
  const fence = await tool('add_site_item', { type: 'fence', points: [[O[0], O[1] + 50], [O[0] + 30, O[1] + 50], [O[0] + 30, O[1] + 70]] }); if (fence.err) fail('fence: ' + fence.text);
  const badT = await tool('add_site_item', { type: 'spökhus', points: [[0, 0]] }); if (!badT.err || !/Okänd typ/.test(badT.text)) fail('Okänd etableringstyp ska ge fel');
  const ds = await tool('delete_site_item', { id: fence.json.id }); if (ds.err) fail('delete_site_item: ' + ds.text);
  console.log('OK: etableringsobjekt via MCP – ställning med breddning, stängsel, ändra och ta bort');

  // --- se och navigera ---
  const f = await tool('fly_to', { id: kr.json.id }); if (f.err) fail('fly_to: ' + f.text);
  const near = await page.evaluate(id => { const g = l3.placeMeshes.get(id), c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()); return l3.orbit.target.distanceTo(c); }, kr.json.id);
  if (near > 3) fail('fly_to ska peka på objektet: ' + near);
  const cam = await tool('set_camera', { position: [O[0] + 40, O[1] - 40, O[2] + 30], target: [O[0], O[1], O[2]] }); if (cam.err) fail('set_camera');
  const ss = await tool('screenshot', { width: 640 });
  if (ss.err || !ss.image || ss.image.mimeType !== 'image/png') fail('screenshot: ' + JSON.stringify(ss).slice(0, 200));
  const png = Buffer.from(ss.image.data, 'base64'); if (png.slice(0, 4).toString('hex') !== '89504e47' || png.length < 2000) fail('Skärmdumpen ska vara en riktig PNG: ' + png.length);
  { const px = await page.evaluate(async d => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data, set = new Set(); for (let i = 0; i < a.length; i += 40) set.add((a[i] >> 4) + ',' + (a[i + 1] >> 4) + ',' + (a[i + 2] >> 4)); return set.size; }, ss.image.data);
    if (px < 6) fail('Skärmdumpen ska visa scenen (inte en tom bild): ' + px + ' färger'); }
  if (process.env.L3SHOT) fs.writeFileSync(process.env.L3SHOT, png);
  const sel = await tool('select', { ids: [box.json.id] }); if (sel.err || sel.json.selected[0] !== box.json.id) fail('select: ' + JSON.stringify(sel));
  console.log('OK: fly_to, set_camera, select och skärmdump (PNG ' + png.length + ' byte)');

  // --- avancerad modellering ---
  const bx = (await tool('create_box', { x: O[0] - 30, y: O[1] - 30, z: O[2], length: 6, width: 4, height: 2, name: 'Bas' })).json;
  const dim = o => { const b = o.bbox; return [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]].map(v => Math.round(v * 100) / 100); };
  const pp = await tool('push_pull', { id: bx.id, distance: 1.5 }); if (pp.err || Math.abs(dim(pp.json)[2] - 3.5) > 0.05) fail('push_pull ska höja kroppen 1,5 m: ' + JSON.stringify(pp));
  const pq = await tool('push_pull', { id: bx.id, distance: -5 }); if (!pq.err || !/dra högst/.test(pq.text)) fail('push_pull för långt neråt ska ge ett tydligt fel: ' + pq.text);
  const of = await tool('offset_outline', { id: bx.id, distance: 0.5 }); const od = dim(of.json);
  if (of.err || Math.abs(od[0] - 7) > 0.05 || Math.abs(od[1] - 5) > 0.05) fail('offset_outline +0,5 ska vidga konturen till 7 × 5: ' + JSON.stringify(of));
  const of2 = await tool('offset_outline', { id: bx.id, distance: -1 }); if (of2.err || Math.abs(dim(of2.json)[0] - 5) > 0.05) fail('offset_outline −1 ska krympa: ' + JSON.stringify(of2));
  const tr = await tool('transform_object', { id: bx.id, move: [2, 0, 1], scale: [2, 1, 1], mirror: 'x' }); const td = dim(tr.json);
  if (tr.err || Math.abs(td[0] - 10) > 0.1 || Math.abs(td[1] - 3) > 0.1) fail('transform_object (flytta + skala + spegla): ' + JSON.stringify(tr));
  const ar = await tool('array_copy', { id: bx.id, count: 3, dx: 20, dy: 0 }); const n0 = (await tool('list_objects', { name: 'Bas' })).json.total;
  if (ar.err || ar.json.created !== 3 || n0 < 4) fail('array_copy: ' + JSON.stringify(ar) + ' / ' + n0);
  const wl = await tool('create_wall', { points: [[O[0] + 40, O[1]], [O[0] + 50, O[1]], [O[0] + 50, O[1] + 8]], thickness: 0.3, height: 3, name: 'Vägg L' }); const wd = dim(wl.json);
  if (wl.err || Math.abs(wd[2] - 3) > 0.05 || wd[0] < 10 || wd[1] < 8) fail('create_wall (öppen, vinklad): ' + JSON.stringify(wl));
  const wr = await tool('create_wall', { points: [[O[0] + 60, O[1]], [O[0] + 70, O[1]], [O[0] + 70, O[1] + 6], [O[0] + 60, O[1] + 6]], thickness: 0.25, height: 2.6, closed: true, name: 'Rum' }); const rd = dim(wr.json);
  if (wr.err || Math.abs(rd[0] - 10.25) > 0.1 || Math.abs(rd[1] - 6.25) > 0.1) fail('create_wall (sluten): ' + JSON.stringify(wr));
  const hole = await page.evaluate(id => placements.find(p => p.id === id).m.loops.length, wr.json.id); if (hole !== 2) fail('Sluten vägg ska ha ett hål (rummet): ' + hole);
  const gr = await tool('create_gable_roof', { x: O[0] + 80, y: O[1], z: O[2] + 3, length: 10, width: 6, rise: 2, overhang: 0.4, name: 'Tak' }); const gd = dim(gr.json);
  if (gr.err || Math.abs(gd[0] - 10.8) > 0.1 || Math.abs(gd[1] - 6.8) > 0.1 || Math.abs(gd[2] - 2) > 0.05 || Math.abs(gr.json.bbox[0][2] - (O[2] + 3)) > 0.05) fail('create_gable_roof: ' + JSON.stringify(gr));
  const stp = await tool('create_stairs', { x: O[0] + 90, y: O[1], z: O[2], steps: 10, rise: 0.18, run: 0.28, width: 1.2 }); const sd = dim(stp.json);
  if (stp.err || Math.abs(sd[2] - 1.8) > 0.05 || Math.abs(sd[0] - 2.8) > 0.05 || Math.abs(sd[1] - 1.2) > 0.05) fail('create_stairs: ' + JSON.stringify(stp));
  const ms = await tool('measure', { a: [0, 0, 0], b: [3, 4, 12] }); if (ms.json.distance !== 13 || ms.json.horizontal !== 5 || ms.json.vertical !== 12) fail('measure: ' + JSON.stringify(ms.json));
  console.log('OK: avancerad modellering via MCP – push/pull, offset, flytta/skala/spegla, serie, vägg (öppen och sluten med hål), sadeltak, trappa, mått');

  // --- vy, sol och renderingsmotorn ---
  const vm = await tool('set_view_mode', { mode: 'wire' }); if (vm.err || vm.json.mode !== 'wire') fail('set_view_mode'); await tool('set_view_mode', { mode: 'shaded' });
  const su = await tool('set_sun', { azimuth: 135, elevation: 30 }); if (su.err) fail('set_sun');
  await tool('set_camera', { position: [O[0] + 55, O[1] - 45, O[2] + 28], target: [O[0] + 15, O[1] + 5, O[2] + 1] });
  const before = await page.evaluate(() => ({ mode: l3vm.mode, pref: l3Prefs().vmode || null, lights: l3.scene.children.filter(c => c.isLight).length, asp: l3.camera.aspect, sel: l3.groups.sel.visible, sunInt: l3vmSun().intensity }));
  const t0 = Date.now(); const rd1 = await tool('render_image', { samples: Number(process.env.L3RS) || 6, width: Number(process.env.L3RW) || 480, sun_azimuth: 220, sun_elevation: 40 });
  if (rd1.err || !rd1.image || rd1.image.mimeType !== 'image/png') fail('render_image: ' + (rd1.text || '').slice(0, 300));
  const after = await page.evaluate(() => ({ mode: l3vm.mode, pref: l3Prefs().vmode || null, lights: l3.scene.children.filter(c => c.isLight).length, asp: l3.camera.aspect, sel: l3.groups.sel.visible, sunInt: l3vmSun().intensity, busy: l3rn.busy, view: !!l3.camera.view && l3.camera.view.enabled }));
  if (after.mode !== before.mode || after.pref !== before.pref || after.lights !== before.lights || Math.abs(after.asp - before.asp) > 1e-6 || after.sel !== before.sel || Math.abs(after.sunInt - before.sunInt) > 1e-6 || after.busy || after.view) fail('Renderingen ska lämna vyn som den var: ' + JSON.stringify({ before, after }));
  const rinfo = await page.evaluate(async d => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data, set = new Set(); let dark = 0, light = 0; for (let i = 0; i < a.length; i += 4) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; if (l < 90) dark++; if (l > 200) light++; if (i % 40 === 0) set.add((a[i] >> 4) + ',' + (a[i + 1] >> 4) + ',' + (a[i + 2] >> 4)); } return { w: im.width, h: im.height, colors: set.size, dark, light }; }, rd1.image.data);
  if (rinfo.w !== (Number(process.env.L3RW) || 480) || rinfo.colors < 12 || rinfo.light < 1000) fail('Renderingen ska visa scenen: ' + JSON.stringify(rinfo));
  if (process.env.L3RENDER) fs.writeFileSync(process.env.L3RENDER, Buffer.from(rd1.image.data, 'base64'));
  const rd0 = await tool('render_image', { samples: 1, width: 480 }); if (rd0.err) fail('render_image 1 delbild: ' + rd0.text);
  { // Summeringen över delbilderna får inte tappa något när vyn ritar medan renderingen väntar (en buffert som lämnades bunden gav mörka ovansidor): lådans ovansida ska vara minst lika ljus som en vägg
    const b0 = (await tool('list_objects', { name: 'Bas' })).json.objects[0].bbox;
    await tool('set_camera', { position: [b0[0][0] + 8, b0[0][1] - 14, b0[1][2] + 10], target: [(b0[0][0] + b0[1][0]) / 2, (b0[0][1] + b0[1][1]) / 2, b0[0][2] + 1] });
    const lum = await page.evaluate(async () => {
      const p = placements.find(q => q.name === 'Bas'), b = new THREE.Box3().setFromObject(l3.placeMeshes.get(p.id)), top = b.getCenter(new THREE.Vector3()); top.z = b.max.z; const front = b.getCenter(new THREE.Vector3()); front.y = b.min.y;
      const r = await l3rnRender({ samples: 6, width: 640, soft: 0.5 }), at = v => { const q = v.clone().project(l3.camera), d = r.canvas.getContext('2d').getImageData(Math.round((q.x + 1) / 2 * r.canvas.width), Math.round((1 - q.y) / 2 * r.canvas.height), 1, 1).data; return Math.round((d[0] + d[1] + d[2]) / 3); };
      return { top: at(top), front: at(front), busy: l3rn.busy };
    });
    if (lum.busy || lum.top < 70 || lum.top < lum.front * 0.7) fail('Lådans ovansida ska vara upplyst i renderingen: ' + JSON.stringify(lum)); }
  console.log('OK: render_image – ' + rinfo.w + '×' + rinfo.h + ', ' + rinfo.colors + ' färgnivåer, vyn återställd (läge, ljus, kamera, markering), ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');

  { // film via MCP: startas i bakgrunden, status följs, stopp sparar det som hunnit renderas, vyn återställs
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const fs0 = await tool('render_film_start', { from: '2025-01-01', to: '2025-01-10', seconds: 1, fps: 24, height: 144, samples: 1, save: false });
    if (fs0.err || !fs0.json.started) fail('render_film_start: ' + (fs0.text || '').slice(0, 300));
    const dup = await tool('render_film_start', { from: '2025-01-01', to: '2025-01-10', seconds: 1 }); if (!dup.err) fail('En andra film ska nekas medan en renderas');
    let stt = null; for (let i = 0; i < 400; i++) { stt = (await tool('render_film_status', {})).json; if (!stt.running) break; if (stt.frame >= 3) await tool('render_film_stop', {}); await new Promise(r => setTimeout(r, 150)); }
    if (stt.running || stt.error || !stt.result || stt.result.frames < 1 || !stt.result.stopped && stt.result.frames !== 24) fail('render_film_status/stop: ' + JSON.stringify(stt));
    const af = await page.evaluate(() => ({ st: !!l3rf.st, busy: l3rn.busy })); if (af.st || af.busy) fail('Filmen ska släppa motorn: ' + JSON.stringify(af));
    console.log('OK: film via MCP – start, förlopp, stopp (' + stt.result.frames + ' bilder, ' + stt.result.format + ')'); }

  // --- rutan "Rendera" i 3D-vyn ---
  { await page.click('#v3RenderBtn'); await page.waitForSelector('#v3Render');
    await page.selectOption('#rnQ', 'fast'); await page.selectOption('#rnS', '1280'); await page.fill('#rnSoft', '2'); await page.click('#rnGo');
    await page.waitForFunction(() => { const b = document.getElementById('rnSave'); return b && !b.disabled; }, null, { timeout: 120000 });
    const ui = await page.evaluate(() => ({ msg: document.getElementById('rnMsg').textContent, w: document.getElementById('rnCv').width, bar: document.getElementById('rnBar').style.width, last: l3rn.last && l3rn.last.samples, busy: l3rn.busy, go: document.getElementById('rnGo').textContent }));
    if (!/Klar/.test(ui.msg) || ui.w !== 1280 || ui.bar !== '100%' || ui.last !== 12 || ui.busy || ui.go !== 'Rendera') fail('Rutan Rendera ska ge en färdig bild: ' + JSON.stringify(ui));
    const dl = page.waitForEvent('download'); await page.click('#rnSave'); const d = await dl; if (!/^rendering-.*\.png$/.test(d.suggestedFilename())) fail('Spara PNG: ' + d.suggestedFilename());
    await page.click('#v3Render .rn-x');
    console.log('OK: 🎬 Rendera i 3D-vyn – kvalitet, storlek, sol och mjukhet, förhandsvisning, klar bild och nedladdning av PNG'); }

  // --- eval_js kräver godkännande ---
  await page.evaluate(() => { window.__ans = false; window.uiConfirm = async () => window.__ans; });
  const ev1 = await tool('eval_js', { code: 'return placements.length', reason: 'test' });
  if (!ev1.err || !/avböjde/.test(ev1.text)) fail('eval_js ska nekas utan godkännande: ' + JSON.stringify(ev1));
  await page.evaluate(() => { window.__ans = true; });
  const ev2 = await tool('eval_js', { code: 'return placements.length' }); if (ev2.err || typeof ev2.json.result !== 'number') fail('eval_js med godkännande: ' + JSON.stringify(ev2));
  console.log('OK: eval_js körs bara efter ditt godkännande');

  // --- koppla från ---
  await page.evaluate(() => l3apiDisconnect()); await page.waitForTimeout(300);
  const chip2 = await page.evaluate(() => document.getElementById('v3Bridge').textContent); if (/kopplad/.test(chip2)) fail('Frånkopplad ska fliken visa det: ' + chip2);
  br.kill();
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_l3api');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
