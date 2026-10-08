// Funktionstest: Placera i 3D – filformat för egna modeller: Collada (.dae, som från SketchUp /
// 3D Warehouse: Z upp, tum, komponenter via instance_node, textur i zip), OBJ med .mtl i zip
// (deflate), .skp ger tydligt besked, och dra-och-släpp/val av fil i panelen.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8973;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Sektionsfickor', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [] };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '10', object_name: 'Borrning', activity: 'Borrning', start_date: '2026-06-01', end_date: '2026-06-10' },
  { ...base, status: 'klar', id: 'f', model_id: null, object_id: 'excel-f', object_name: 'Fyllning Del 1', activity: 'Fyllning', start_date: '2026-01-02', end_date: '2026-01-13' },
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1400 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__markups = new Map(); window.__nextId = 1; window.__camera = null; window.__toggled = [];
    window.__noIds = false;
    const addLines = arr => Promise.resolve(arr.map(m => { const id = window.__nextId++; window.__markups.set(id, { type: 'line', ...m, id }); return window.__noIds ? { ...m } : { ...m, id }; }));
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: {
        addLineMarkups: addLines,
        getLineMarkups: () => Promise.resolve([...window.__markups.values()]),
        removeMarkups: ids => { (ids || []).forEach(id => window.__markups.delete(id)); return Promise.resolve(); },
      },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: c => { window.__camera = c; return Promise.resolve(); }, getCamera: () => Promise.resolve(window.__camera || { position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, quaternion: { x: 0.3, y: 0, z: 0, w: 0.95 }, fieldOfView: 60 }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: () => Promise.resolve([]),
        setObjectState: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'm1', name: 'Modell 1', state: 'unloaded' }]),
        toggleModel: (id, loaded) => { window.__toggled.push([id, loaded]); return Promise.resolve(); }
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  const pick = (x, y, z) => page.evaluate(([x, y, z]) => window.__cb('viewer.onPicked', { data: { position: { x, y, z }, modelId: 'm1', objectRuntimeId: 1 } }), [x, y, z]);
  const shown = () => page.evaluate(() => [...window.__markups.values()]);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);



  const zlib = require('zlib');
  // --- zip-byggare (metod 0 = lagrad, 8 = deflate)
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const zip = (entries, deflate) => {
    const loc = [], cen = []; let off = 0;
    for (const [name, data] of entries) {
      const nb = Buffer.from(name), raw = Buffer.from(data), comp = deflate ? zlib.deflateRawSync(raw) : raw, m = deflate ? 8 : 0;
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(m, 8); h.writeUInt32LE(crc(raw), 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nb.length, 26);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(m, 10); c.writeUInt32LE(crc(raw), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
      loc.push(h, nb, comp); cen.push(c, nb); off += 30 + nb.length + comp.length;
    }
    const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
    return Buffer.concat([...loc, cd, e]);
  };
  // --- en röd 2×2 PNG
  const png = (() => {
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
    const rows = Buffer.from([0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0]);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  })();
  // --- Collada som från SketchUp: låda 100×50×20 tum, komponent via library_nodes, vriden 90° i scenen
  const P = [[0,0,0],[100,0,0],[100,50,0],[0,50,0],[0,0,20],[100,0,20],[100,50,20],[0,50,20]];
  const quads = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
  const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit meter="0.0254" name="inch"/><up_axis>Z_UP</up_axis></asset>
<library_images><image id="img0"><init_from>lada/tegel.png</init_from></image></library_images>
<library_effects><effect id="fx0"><profile_COMMON>
  <newparam sid="surf"><surface type="2D"><init_from>img0</init_from></surface></newparam>
  <newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam>
  <technique sid="t"><lambert><diffuse><texture texture="samp" texcoord="UV"/></diffuse></lambert></technique></profile_COMMON></effect>
  <effect id="fx1"><profile_COMMON><technique sid="t"><lambert><diffuse><color>0 0.5 0 1</color></diffuse><transparency><float>0.4</float></transparency></lambert></technique></profile_COMMON></effect></library_effects>
<library_materials><material id="m0"><instance_effect url="#fx0"/></material><material id="m1"><instance_effect url="#fx1"/></material></library_materials>
<library_geometries><geometry id="g0"><mesh>
  <source id="g0-pos"><float_array id="g0-pos-a" count="24">${P.flat().join(' ')}</float_array><technique_common><accessor source="#g0-pos-a" count="8" stride="3"/></technique_common></source>
  <source id="g0-n"><float_array id="g0-n-a" count="3">0 0 1</float_array><technique_common><accessor source="#g0-n-a" count="1" stride="3"/></technique_common></source>
  <vertices id="g0-v"><input semantic="POSITION" source="#g0-pos"/></vertices>
  <polylist material="mat0" count="5"><input semantic="VERTEX" source="#g0-v" offset="0"/><input semantic="NORMAL" source="#g0-n" offset="1"/>
    <vcount>4 4 4 4 4</vcount><p>${quads.slice(0, 5).flat().map(i => i + ' 0').join(' ')}</p></polylist>
  <triangles material="mat1" count="2"><input semantic="VERTEX" source="#g0-v" offset="0"/><input semantic="NORMAL" source="#g0-n" offset="1"/>
    <p>${[3,0,4, 3,4,7].map(i => i + ' 0').join(' ')}</p></triangles>
</mesh></geometry></library_geometries>
<library_nodes><node id="comp"><matrix>1 0 0 1000 0 1 0 0 0 0 1 0 0 0 0 1</matrix>
  <instance_geometry url="#g0"><bind_material><technique_common><instance_material symbol="mat0" target="#m0"/><instance_material symbol="mat1" target="#m1"/></technique_common></bind_material></instance_geometry></node></library_nodes>
<library_visual_scenes><visual_scene id="s"><node id="top"><rotate>0 0 1 90</rotate><instance_node url="#comp"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
  const daeZip = zip([['modell.dae', dae], ['lada/tegel.png', png]], false);
  const obj = ['mtllib lada.mtl', 'o box', 'v 0 0 0', 'v 2 0 0', 'v 2 4 0', 'v 0 4 0', 'v 0 0 1', 'v 2 0 1', 'v 2 4 1', 'v 0 4 1', 'vt 0 0', 'vn 0 1 0',
    'usemtl blå', 'f 1/1/1 2/1/1 3/1/1 4/1/1', 'f 5//1 8//1 7//1 6//1', 'usemtl ingen', 'f -8 -7 -3 -4'].join('\n');
  const objZip = zip([['obj/lada.obj', obj], ['obj/lada.mtl', 'newmtl blå\nKd 0 0 1\nd 1\n']], true);

  const run = (b64, name) => page.evaluate(async ([b64, name]) => {
    const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    try { const r = await pmModelFromBuffer(u8.buffer, name); return { tris: r.tris, bbox: r.bbox, colors: r.mesh.parts.map(p => p.c + ':' + p.t).sort() }; }
    catch (e) { return { err: e.message }; }
  }, [b64, name]);
  const dims = b => [0, 1, 2].map(j => Math.round((b.max[j] - b.min[j]) * 1000) / 1000).join(' × ');

  let r = await run(daeZip.toString('base64'), 'bod.zip');
  if (r.err) fail('Collada-zip: ' + r.err);
  if (r.tris !== 12) fail('Collada: 5 fyrhörningar + 2 trianglar = 12 trianglar, fick ' + r.tris);
  if (dims(r.bbox) !== '1.27 × 2.54 × 0.508') fail('Collada i tum, vriden 90°: ' + dims(r.bbox));
  if (JSON.stringify(r.colors) !== JSON.stringify(['#008000:0.6', '#ff0000:0'])) fail('Collada-färger (textur → röd, grön genomskinlig): ' + JSON.stringify(r.colors));
  r = await run(Buffer.from(dae).toString('base64'), 'bod.dae');
  if (r.err || r.tris !== 12 || JSON.stringify(r.colors) !== JSON.stringify(['#008000:0.6', '#bfbfbf:0'])) fail('Lös .dae (texturen saknas → grå): ' + JSON.stringify(r));
  r = await run(objZip.toString('base64'), 'lada.zip');
  if (r.err) fail('OBJ-zip: ' + r.err);
  if (r.tris !== 6 || dims(r.bbox) !== '2 × 1 × 4') fail('OBJ: 3 fyrhörningar = 6 trianglar, Y upp → Z upp (2 × 1 × 4): ' + JSON.stringify(r));
  if (JSON.stringify(r.colors) !== JSON.stringify(['#0000ff:0', '#bfbfbf:0'])) fail('OBJ-färger från .mtl: ' + JSON.stringify(r.colors));
  r = await run(Buffer.from('skp').toString('base64'), 'bod.skp');
  if (!r.err || !r.err.includes('Collada')) fail('.skp ska ge besked om att välja Collada');

  // --- i panelen: välj fil -> bekräfta -> placera
  await page.click('#planSourceBar [data-design]');
  await page.click('#placeOpenBrowser');
  await page.click('[data-pmtab="file"]');
  if (!(await page.locator('.pm-sites').innerText()).includes('3D Warehouse')) fail('Tipset om 3D Warehouse ska synas');
  await page.setInputFiles('#pmFile', { name: 'Bod.skp', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await page.waitForTimeout(300);
  if (!(await page.locator('.pm-msg').innerText()).includes('Collada')) fail('.skp i panelen ska ge besked');
  // dra-och-släpp
  await page.evaluate(b64 => {
    const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'Bod.zip'));
    document.getElementById('pmDrop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, daeZip.toString('base64'));
  await page.waitForTimeout(800);
  const conf = await page.locator('.pm-confirm').innerText();
  if (!conf.includes('12 trianglar') || !conf.includes('1.27 × 2.54 × 0.51 m')) fail('Släppt fil ska ge bekräftelse: ' + conf);
  if (await page.locator('#pmName').inputValue() !== 'Bod') fail('Namnet ska komma från filen');
  await page.click('#pmAccept'); await page.waitForTimeout(800);
  await pick(10, 20, 0); await page.waitForTimeout(400);
  if ((await shown()).length !== 12) fail('Den hämtade modellen ska förhandsvisas som en låda');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_place_formats');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
