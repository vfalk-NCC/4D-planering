// Fotomarkörer i 3D (Victor 2026-10-11: "tända upp fotomarkörerna i 3d också och dom hamnar exakt rätt även på
// höjden" – "GPS-höjd rakt av först"). EXIF-höjd och kompassriktning läses ur fotot; i 3D står fotot på GPS-höjden,
// på ytan (utan GPS-höjd) eller där det ställts för hand; riktningen som en kon; tryck öppnar fotot; våning ±3 m,
// ställ på ytan, GPS-höjd och dra-handtaget ändrar höjden, Ctrl+Z ångrar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9007;
const OUT = process.env.PLACE_TMP || path.join(__dirname, '..', '.tmp');
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
// En liten JPEG (1×1) – bilden som hämtas för fotot.
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
    const gh = new Map();
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') {
        if (/photos\/[gnh]\.jpg$/.test(f)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: JPG.toString('base64'), sha: 'p' }) });
        const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' });
      }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);

    // 1. EXIF: höjd (tagg 6, ref 5) och riktning (tagg 17) läses ur fotot.
    const ex = await page.evaluate(async () => {
      const le16 = n => [n & 255, n >> 8], le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
      const rat = (...v) => v.flatMap(([a, b]) => [...le32(a), ...le32(b)]);
      // [tagg, typ, antal, värde (≤4 byte) eller data]
      const tags = [[1, 2, 2, [78, 0]], [2, 5, 3, rat([67, 1], [0, 1], [108, 100])], [3, 2, 2, [69, 0]], [4, 5, 3, rat([20, 1], [15, 1], [144, 100])],
        [5, 1, 1, [0]], [6, 5, 1, rat([4250, 100])], [16, 2, 2, [84, 0]], [17, 5, 1, rat([24550, 100])]];
      const gOff = 26, dStart = gOff + 2 + tags.length * 12 + 4;
      let data = [], ents = [];
      tags.forEach(([t, ty, c, v]) => {
        let val;
        if (v.length <= 4) val = [...v, 0, 0, 0, 0].slice(0, 4);
        else { val = le32(dStart + data.length); data = data.concat(v); }
        ents.push(...le16(t), ...le16(ty), ...le32(c), ...val);
      });
      const tiff = [0x49, 0x49, ...le16(42), ...le32(8), ...le16(1), ...le16(0x8825), ...le16(4), ...le32(1), ...le32(gOff), ...le32(0),
        ...le16(tags.length), ...ents, ...le32(0), ...data];
      const app1 = [0xFF, 0xE1, (tiff.length + 8) >> 8, (tiff.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
      const e = await readExifGps(new Blob([new Uint8Array([0xFF, 0xD8, ...app1, 0xFF, 0xD9])]));
      return { ...e, extra: gpsExtra({ alt: e.alt, dir: e.dir, altAcc: null }) };
    });
    if (Math.abs(ex.alt - 42.5) > 1e-6 || Math.abs(ex.dir - 245.5) > 1e-6 || ex.extra.alt !== 42.5 || ex.extra.dir !== 245.5 || 'altAcc' in ex.extra) fail('EXIF-höjd och riktning: ' + JSON.stringify(ex));
    console.log('OK: höjd och riktning läses ur fotots EXIF');

    // 2. Tre foton: GPS-höjd + riktning öster, utan GPS (på ytan), inställt för hand.
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 5], [6512400, 150100, 5]], pdf: [[0, 0], [1000, 0]] }, zones: [],
        photos: [
          { id: 'g', x: 200, y: 250, path: 'x/status_plans/photos/g.jpg', date: '2026-10-11', caption: 'Med GPS', gps: { lat: 1, lon: 1, acc: 5, alt: 42.5, dir: 90 } },
          { id: 'n', x: 500, y: 250, path: 'x/status_plans/photos/n.jpg', date: '2026-10-11', caption: 'Utan GPS' },
          { id: 'h', x: 800, y: 250, path: 'x/status_plans/photos/h.jpg', date: '2026-10-11', caption: 'För hand', z: 10 }] }];
      pdfCache.set('A', new Uint8Array([1]).buffer);
      items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await page.click('#btn3d');
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3phToggle === 'function', null, { timeout: 15000 });
    await page.waitForTimeout(400);
    if (await page.evaluate(() => l3.groups.photos && l3.groups.photos.visible)) fail('Fotona ska vara släckta i 3D tills de tänds');
    // Tänds under Lager.
    await page.click('[data-paltab="layers"]').catch(() => {});
    await page.waitForSelector('#v3PalLayers [data-l3ph-eye]', { timeout: 5000 });
    await page.click('#v3PalLayers [data-l3ph-eye]');
    const st = await page.evaluate(() => {
      const g = l3.groups.photos, sp = id => g.children.find(o => o.isSprite && o.userData.photoId === id);
      const z = id => +(sp(id).position.z + l3.O[2]).toFixed(3);
      const cone = g.children.find(o => o.geometry && o.geometry.type === 'ConeGeometry');
      const d = cone && new THREE.Vector3(0, -1, 0).applyQuaternion(cone.quaternion);
      return { vis: g.visible, n: g.children.filter(o => o.isSprite).length, zg: z('g'), zn: z('n'), zh: z('h'), cones: g.children.filter(o => o.geometry && o.geometry.type === 'ConeGeometry').length, dir: d && [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)], pref: l3Prefs().photos3d };
    });
    // Marken (ritningen) ligger på kalibreringens höjd 5 m → foton utan GPS-höjd på 5 + 1,6 m.
    if (!st.vis || st.n !== 3 || st.zg !== 42.5 || st.zn !== 6.6 || st.zh !== 10 || st.cones !== 1 || JSON.stringify(st.dir) !== '[1,0,0]' || st.pref !== true) fail('Markörerna i 3D: ' + JSON.stringify(st));
    console.log('OK: GPS-höjd rakt av, på ytan utan GPS, för hand; riktningen som en kon (öster)');

    // 3. Tryck på markören: fotot med höjd och källa.
    const scr = id => page.evaluate(id => { const r = l3.renderer.domElement.getBoundingClientRect(), s = l3.groups.photos.children.find(o => o.isSprite && o.userData.photoId === id), q = l3ToScreen(s.position.clone()); return [r.left + q.x, r.top + q.y]; }, id);
    await page.evaluate(() => { l3View('s'); });
    await page.waitForTimeout(600);
    let [x, y] = await scr('g');
    await page.mouse.click(x, y);
    await page.waitForSelector('#v3PhPop:not(.hidden)', { timeout: 5000 });
    const pop = await page.evaluate(() => ({ t: document.querySelector('#v3PhPop').textContent, img: document.querySelector('#v3PhPop .v3-ph-img').getAttribute('src') }));
    if (!/Med GPS/.test(pop.t) || !/42,50 m/.test(pop.t) || !/GPS-höjd/.test(pop.t) || !/90° \(öster\)/.test(pop.t)) fail('Popupen: ' + pop.t);
    await page.waitForFunction(() => document.querySelector('#v3PhPop .v3-ph-img').getAttribute('src'), null, { timeout: 5000 });
    await page.screenshot({ path: path.join(OUT, '3dphotos.png') });

    // 4. ▲ Våning → 45,5 m (sparas med fotot), Ctrl+Z → GPS-höjden igen, Ställ på ytan → 6,6 m, GPS-höjd → tillbaka.
    const zOf = () => page.evaluate(() => { const p = photos().find(x => x.id === 'g'); return [p.z === undefined ? null : p.z, +(l3.groups.photos.children.find(o => o.isSprite && o.userData.photoId === 'g').position.z + l3.O[2]).toFixed(2)]; });
    await page.click('#v3PhPop [data-ph="up"]');
    let z = await zOf(); if (z.join() !== '45.5,45.5') fail('▲ Våning: ' + z);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
    z = await zOf(); if (z.join() !== ',42.5') fail('Ctrl+Z: ' + z);
    await page.click('#v3PhPop [data-ph="ground"]');
    z = await zOf(); if (z.join() !== '6.6,6.6') fail('Ställ på ytan: ' + z);
    if (!/inställd för hand/.test(await page.textContent('#v3PhPop'))) fail('Källan ska vara "inställd för hand"');
    await page.click('#v3PhPop [data-ph="gps"]');
    z = await zOf(); if (z.join() !== ',42.5') fail('GPS-höjd: ' + z);

    // 5. Dra höjdhandtaget uppåt.
    const hb = await page.$('#view3d .v3-phh'); const bb = hb && await hb.boundingBox();
    if (!bb) fail('Höjdhandtaget saknas');
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2, bb.y - 40, { steps: 5 }); await page.mouse.up();
    z = await zOf(); if (!(z[0] > 42.6) || Math.abs(z[0] - z[1]) > 0.01) fail('Dra höjden: ' + z);
    // Sparas med arbetsytan.
    await page.evaluate(() => typeof planSaveNow === 'function' ? planSaveNow() : null).catch(() => {});

    // 6. Släck: markörerna och popupen försvinner.
    await page.click('#v3PalLayers [data-l3ph-eye]');
    const off = await page.evaluate(() => ({ vis: l3.groups.photos.visible, pop: document.querySelector('#v3PhPop').classList.contains('hidden') }));
    if (off.vis || !off.pop) fail('Släcka: ' + JSON.stringify(off));
    console.log('OK: popup, våning, ytan, GPS-höjd, dra-handtag, Ctrl+Z och släck');

    // 7. Lägg till foto i 3D (Victor 2026-10-11: "Hittar ingen knapp för att ladda upp foton i 3d-vyn").
    //    📷 Foto öppnar filväljaren; med GPS placeras fotot direkt, utan GPS trycker man där det är taget.
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? (d.message().startsWith('Beskrivning') ? 'Från 3D' : '') : undefined));
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('#v3PhotoBtn')]);
    if (!chooser.isMultiple()) fail('Filväljaren ska ta flera foton');
    const mkFile = name => page.evaluate(name => new Promise(res => { const c = document.createElement('canvas'); c.width = 40; c.height = 30; c.getContext('2d').fillRect(0, 0, 20, 20); c.toBlob(b => { window.__f = new File([b], name, { type: 'image/jpeg', lastModified: Date.now() - 3600e3 }); res(); }, 'image/jpeg'); }), name);
    const n0 = await page.evaluate(() => photos().length);
    // Med GPS (förslaget från fotots EXIF): direkt på planen, GPS-höjd och riktning följer med.
    await mkFile('gps.jpg');
    await page.evaluate(() => { window.__sug0 = suggestPhotoPosition; suggestPhotoPosition = async () => ({ pt: [600, 300], acc: 4, src: 'foto', zone: 'z', gps: { lat: 59.3, lon: 18.1, acc: 4, src: 'foto', alt: 31.25, dir: 180 } }); l3phQueue = [window.__f]; return l3phNext(); });
    await page.waitForFunction(n => photos().length === n + 1, n0, { timeout: 10000 });
    const a1 = await page.evaluate(() => { const ph = photos().slice(-1)[0], s = l3.groups.photos.children.find(o => o.isSprite && o.userData.photoId === ph.id); return { cap: ph.caption, x: ph.x, y: ph.y, alt: ph.gps && ph.gps.alt, z: s && +(s.position.z + l3.O[2]).toFixed(2), on: l3.groups.photos.visible }; });
    if (a1.cap !== 'Från 3D' || a1.x !== 600 || a1.y !== 300 || a1.alt !== 31.25 || a1.z !== 31.25 || !a1.on) fail('Foto med GPS från 3D: ' + JSON.stringify(a1));
    // Utan GPS: tryck i 3D där fotot är taget → på ytan + ögonhöjd.
    await mkFile('utan.jpg');
    await page.evaluate(() => { suggestPhotoPosition = async () => null; l3phQueue = [window.__f]; return l3phNext(); });
    if (!(await page.evaluate(() => !!l3.phPick))) fail('Utan GPS ska man få trycka i 3D');
    await page.evaluate(() => { l3View('top'); }); await page.waitForTimeout(600);
    const [tx, ty] = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(), q = l3ToScreen(new THREE.Vector3(6512350 - l3.O[0], 150125 - l3.O[1], 5 - l3.O[2])); return [r.left + q.x, r.top + q.y]; });
    await page.mouse.click(tx, ty);
    await page.waitForFunction(n => photos().length === n + 2, n0, { timeout: 10000 });
    const a2 = await page.evaluate(() => { const ph = photos().slice(-1)[0], [mx, my] = l3PdfToModel(ph.x, ph.y); return { z: ph.z, mx: Math.round(mx), my: Math.round(my), gps: !!ph.gps, pick: !!l3.phPick }; });
    if (Math.abs(a2.z - 6.6) > 0.05 || Math.abs(a2.mx - 6512350) > 1 || Math.abs(a2.my - 150125) > 1 || a2.gps || a2.pick) fail('Foto utan GPS, tryck i 3D: ' + JSON.stringify(a2));
    // Esc avbryter.
    await page.evaluate(() => { l3phQueue = [window.__f]; return l3phNext(); });
    await page.keyboard.press('Escape');
    if (await page.evaluate(() => !!l3.phPick) || await page.evaluate(() => photos().length) !== n0 + 2) fail('Esc ska avbryta utan att lägga till');
    await page.evaluate(() => { suggestPhotoPosition = window.__sug0; });
    console.log('OK: lägg till foto i 3D – filväljaren, med GPS direkt, utan GPS med ett tryck, Esc avbryter');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
