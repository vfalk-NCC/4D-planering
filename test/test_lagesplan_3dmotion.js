const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9089;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const A = await page.evaluate(async () => {
    const o = {}, O = l3.O; o.ok = l3moOK(); const wait = ms => new Promise(r => setTimeout(r, ms));
    // 12: CSS – toast fjädrar in, busy får progressring
    l3Toast('Hej'); const t = document.getElementById('v3Toast'); o.toastAnim = getComputedStyle(t).animationName;
    busyProgress('t1', 'Läser', 0.4); const ring = document.querySelector('#busy .busy-ring'); o.ring = !!ring && ring.style.getPropertyValue('--p') === '40'; busyProgress('t1', '', null);
    // 7: mått
    const V = (x, y, z) => new THREE.Vector3(x, y, z), m = l3mAdd('dist', [V(0, 0, 0), V(12.5, 0, 0)], '12,50 m', []); const lab0 = l3m.labels.get(m.id);
    o.tmp = !!l3.scene.getObjectByName('moMeas'); await wait(300); const mid = l3m.labels.get(m.id).textContent; o.midText = mid; await wait(1000); o.tmpGone = !l3.scene.getObjectByName('moMeas'); o.finalText = l3m.labels.get(m.id).textContent;
    // 6: markering – syntetiskt överlägg (fyllning + glödkant)
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.34 })); fill.userData.bselFill = true;
    const halo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({ uniforms: { w: { value: 0.0042 }, a: { value: 0.95 } } })); l3.scene.add(fill, halo); l3bs.sel = [{}]; l3bs.ov = [fill, halo];
    l3moSelPop(); o.haloMid = 0; o.fillMid = 0.34; for (let i = 0; i < 18; i++) { await wait(30); o.haloMid = Math.max(o.haloMid, halo.material.uniforms.w.value); if (Math.abs(fill.material.opacity - 0.34) > Math.abs(o.fillMid - 0.34)) o.fillMid = fill.material.opacity; } await wait(300); o.haloEnd = halo.material.uniforms.w.value; o.fillEnd = fill.material.opacity; o.aEnd = halo.material.uniforms.a.value; l3.scene.remove(fill, halo); l3bs.sel = []; l3bs.ov = [];
    // 8: snitt – svep
    l3cShowPlane({ plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0) }); o.sweep = !!l3mo.sweepObj; await wait(1000); o.sweepGone = !l3mo.sweepObj; l3cShowPlane(null);
    // 5: minimap
    await l3spOpen(); l3spFollow(false); l3spGoTo(plan.calib.model[0][0] + 5, plan.calib.model[0][1] + 5); o.rip = (l3sp.rip || []).length; for (let i = 0; i < 6; i++) { l3.camera.position.x += 2; l3.camera.updateMatrixWorld(); await wait(70); } o.trail = (l3sp.trail || []).length; await wait(1200); o.ripGone = (l3sp.rip || []).length === 0;
    // av: Animationer av i menyn → ingen animation
    l3SetPref('anim', false); l3AnimClass(); o.offOk = l3moOK(); o.noanim = document.body.classList.contains('v3-noanim'); const m2 = l3mAdd('dist', [V(0, 0, 1), V(3, 0, 1)], '3,00 m', []); o.noTmp = !l3.scene.getObjectByName('moMeas'); l3SetPref('anim', true); l3AnimClass();
    return o;
  });
  if (!A.ok || !/v3ToastIn/.test(A.toastAnim) || !A.ring) fail('Toast/progressring: ' + JSON.stringify(A));
  if (!A.tmp || !A.tmpGone || A.finalText !== '12,50 m' || A.midText === '12,50 m') fail('Mått: ljuspunkt och uppräkning: ' + JSON.stringify(A));
  if (!(A.haloMid > 0.0042 * 1.5) || Math.abs(A.fillMid - 0.34) < 0.02 || Math.abs(A.haloEnd - 0.0042) > 1e-6 || Math.abs(A.fillEnd - 0.34) > 1e-6 || Math.abs(A.aEnd - 0.95) > 1e-6) fail('Markering: pop och återgång: ' + JSON.stringify(A));
  if (!A.sweep || !A.sweepGone) fail('Snitt: svep: ' + JSON.stringify(A));
  if (A.rip < 1 || A.trail < 3 || !A.ripGone) fail('Minimap: ring och spår: ' + JSON.stringify(A));
  if (A.offOk || !A.noanim || !A.noTmp) fail('Animationer av: ' + JSON.stringify(A));
  // Minska rörelser i systemet
  await page.emulateMedia({ reducedMotion: 'reduce' }); const red = await page.evaluate(() => { l3AnimClass(); return { ok: l3moOK(), cls: document.body.classList.contains('v3-noanim') }; });
  if (red.ok || !red.cls) fail('Minska rörelser: ' + JSON.stringify(red));
  console.log('OK: animationer – toast/progressring, mått, markering, snitt, minimap, av/på och Minska rörelser', JSON.stringify(A));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
