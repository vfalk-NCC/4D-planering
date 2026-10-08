// 3D-editorn i lägesplanen: bibliotek med sök, etiketter, flera markerade (Skift), ta bort med
// ångra-notis, ångra/gör om, kopiera/klistra in vid markören, duplicera, piltangenter, högerklicksmeny,
// vyer, visningslägen för planerade objekt, infokort, staket punkt för punkt, sparindikator och den
// riktiga byggnaden från TC (web-ifc) med statusfärg och infokort.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8983;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  store.set('projects/p1/plan_placements.json', { content: '[]', sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const getStore = f => { const e = store.get(`projects/p1/${f}`); return e ? JSON.parse(e.content) : null; };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', area: 'Hus A', start_date: '2020-01-01', end_date: '2030-12-01', status: 'pagaende', progress: 40, object_id: '1hZq3$Bq9Fxu8nZK0bW1aA', model_id: 'mB' },
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512350, y: 150125, z0: 0, z1: 14, x0: 6512345, x1: 6512355, y0: 150120, y1: 150130 },
      { id: 'i2', x: 6512380, y: 150125, z0: 0, z1: 3, x0: 6512378, x1: 6512382, y0: 150123, y1: 150127 },
    ];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    askOpener = async (type, extra) => { window.__calls.push(type); return type === 'placeSaveIfc' ? { n: 2, files: ['Etablering x.ifc'] } : {}; };
  });
  // IFC-byggnad (meter): en pelare kopplad till i1 (pågående) och en okopplad vägg.
  const ifc = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('b.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
    "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCAXIS2PLACEMENT3D(#1,$,$);", "#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);",
    "#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "#5=IFCUNITASSIGNMENT((#4));", "#6=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',$,'B',$,$,$,$,(#3),#5);",
    "#7=IFCLOCALPLACEMENT($,#2);", "#8=IFCSITE('2O2Fr$t4X7Zf8NOew3FLOI',$,'Site',$,$,#7,$,$,.ELEMENT.,$,$,$,$,$);", "#9=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLOJ',$,$,$,#6,(#8));",
    "#12=IFCDIRECTION((0.,0.,1.));",
    "#20=IFCCARTESIANPOINT((6512350.,150125.,0.));", "#21=IFCAXIS2PLACEMENT3D(#20,$,$);", "#22=IFCLOCALPLACEMENT(#7,#21);",
    "#23=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,4.);", "#24=IFCEXTRUDEDAREASOLID(#23,#2,#12,6.);", "#25=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#24));", "#26=IFCPRODUCTDEFINITIONSHAPE($,$,(#25));",
    "#27=IFCBUILDINGELEMENTPROXY('1hZq3$Bq9Fxu8nZK0bW1aA',$,'Pelare K10',$,$,#22,#26,$,$);",
    "#30=IFCCARTESIANPOINT((6512380.,150125.,0.));", "#31=IFCAXIS2PLACEMENT3D(#30,$,$);", "#32=IFCLOCALPLACEMENT(#7,#31);",
    "#33=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,10.);", "#34=IFCEXTRUDEDAREASOLID(#33,#2,#12,3.);", "#35=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#34));", "#36=IFCPRODUCTDEFINITIONSHAPE($,$,(#35));",
    "#37=IFCBUILDINGELEMENTPROXY('3vB2YO$MX4xv5uCqZZG05x',$,'Vagg V1',$,$,#32,#36,$,$);",
    "#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#27,#37),#8);",
    "ENDSEC;", "END-ISO-10303-21;"].join("\n");
  await page.evaluate(ifc => {
    askOpener = async (type, extra) => {
      window.__calls.push(type);
      if (type === 'ifcModelsList') return { models: [{ id: 'mB', name: 'Hus A.ifc', etab: false }, { id: 'mE', name: 'Etablering x.ifc', etab: true }] };
      if (type === 'ifcModelData') return { name: 'Hus A.ifc', placement: null, bytes: new TextEncoder().encode(ifc).buffer };
      if (type === 'select') return { count: 1 };
      return {};
    };
  }, ifc);
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.objMesh, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2])); return [q.x, q.y]; }, [x, y, z]);
  const at = async (x, y, z) => { const [sx, sy] = await scr(x, y, z); return [cv.x + sx, cv.y + sy]; };
  const tap = async (x, y, z, opts) => { const [px, py] = await at(x, y, z); await page.mouse.move(px, py); await page.waitForTimeout(60); if (opts && opts.shift) await page.keyboard.down('Shift'); await page.mouse.click(px, py, opts && opts.right ? { button: 'right' } : undefined); if (opts && opts.shift) await page.keyboard.up('Shift'); await page.waitForTimeout(120); };
  const top = () => page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 90); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const S = () => page.evaluate(() => ({ n: placements.length, sel: [...l3.sel], list: placements.map(p => ({ ...p })) }));
  await top();

  // Biblioteket: sök filtrerar.
  await page.fill('#v3PalSearch', 'cont');
  if (await page.locator('#v3Lib [data-v3add]').count() !== 1) fail('Sök i biblioteket ska filtrera');
  await page.fill('#v3PalSearch', '');
  // Lägg till bod och container med tryck.
  await page.click('[data-v3add="bod"]'); await tap(6512320, 150110, 0);
  await page.click('[data-v3add="container"]'); await tap(6512320, 150130, 0);
  let s = await S();
  if (s.n !== 2 || s.sel.length !== 1) fail('Två objekt tillagda, det senaste markerat: ' + JSON.stringify(s));
  if (!(await page.locator('#v3Labels').innerText()).includes('Bod 1')) fail('Namnetiketterna ska synas');
  // Flera markerade med Skift.
  await tap(6512320, 150110, 2.7, { shift: true });
  s = await S();
  if (s.sel.length !== 2 || !(await page.locator('#v3Side').innerText()).includes('2 objekt markerade')) fail('Skift-klick ska markera flera');
  // Piltangent flyttar båda ett steg (0,5 m).
  await page.mouse.move(cv.x + 5, cv.y + 5);
  const x0 = s.list.map(p => p.x);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  s = await S();
  if (!s.list.every((p, i) => Math.abs(p.x - x0[i] - 0.5) < 1e-6)) fail('Pil → ska flytta alla markerade 0,5 m: ' + s.list.map(p => p.x));
  // Ta bort -> notis med Ångra.
  await page.keyboard.press('Delete'); await page.waitForTimeout(100);
  if ((await S()).n !== 0 || !(await page.locator('#v3Toast').innerText()).includes('2 objekt borttagna')) fail('Delete ska ta bort med notis');
  await page.click('#v3Toast button'); await page.waitForTimeout(100);
  if ((await S()).n !== 2) fail('Ångra i notisen ska ta tillbaka');
  // Ctrl+Z ångrar flytten, Ctrl+Y gör om.
  await page.keyboard.press('Control+z'); await page.waitForTimeout(80);
  if (!(await S()).list.every((p, i) => Math.abs(p.x - x0[i]) < 1e-6)) fail('Ctrl+Z ska ångra flytten');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(80);
  if (!(await S()).list.every((p, i) => Math.abs(p.x - x0[i] - 0.5) < 1e-6)) fail('Ctrl+Y ska göra om flytten');
  // Kopiera bod och klistra in vid markören.
  await tap(6512320.5, 150110, 2.7);
  await page.keyboard.press('Control+c');
  const [mx, my] = await at(6512335, 150105, 0); await page.mouse.move(mx, my); await page.waitForTimeout(120);
  await page.keyboard.press('Control+v'); await page.waitForTimeout(120);
  s = await S();
  const pasted = s.list.find(p => p.id === s.sel[0]);
  if (s.n !== 3 || !pasted || Math.abs(pasted.x - 6512335) > 0.3 || Math.abs(pasted.y - 150105) > 0.3) fail('Ctrl+V ska klistra in vid markören: ' + JSON.stringify(pasted));
  // Ctrl+D duplicerar.
  await page.keyboard.press('Control+d'); await page.waitForTimeout(100);
  if ((await S()).n !== 4) fail('Ctrl+D ska duplicera');
  // Högerklick på containern -> meny -> Duplicera.
  await tap(6512320.5, 150130, 2.59, { right: true });
  if (await page.locator('#v3Ctx').isHidden()) fail('Högerklick ska öppna menyn');
  if (!(await page.locator('#v3Ctx').innerText()).includes('Rikta kant mot kant')) fail('Menyn ska ha verktygen');
  await page.click('#v3Ctx [data-ctx="dup"]'); await page.waitForTimeout(100);
  if ((await S()).n !== 5) fail('Menyn: Duplicera');
  // Sparat (indikatorn).
  await page.waitForTimeout(2200);
  if (!(await page.locator('#v3Save').innerText()).includes('Sparat') || getStore('plan_placements.json').length !== 5) fail('Autosparning: ' + await page.locator('#v3Save').innerText());

  // Staket punkt för punkt, Enter avslutar.
  await page.keyboard.press('Escape');
  await page.click('[data-v3add="staket"]');
  await tap(6512300, 150100, 0); await tap(6512310, 150100, 0); await tap(6512310, 150115, 0);
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  s = await S();
  const fence = s.list.find(p => p.type === 'staket');
  if (!fence || fence.pts.length !== 3 || await page.evaluate(() => l3.addType)) fail('Staket med tre punkter: ' + JSON.stringify(fence && fence.pts));

  // Planerade objekt: info vid tryck, konturer, dolda.
  await page.keyboard.press('Escape');
  await tap(6512380, 150125, 3);
  if (!(await page.locator('#v3Info').innerText()).includes('M30')) fail('Tryck på en låda ska visa infokortet: ' + await page.locator('#v3Info').innerText());
  await page.click('#v3ShowBtn'); await page.click('[data-v3objs="edges"]');
  if (await page.evaluate(() => l3.objMesh && l3.objMesh.type) !== 'LineSegments') fail('Konturer');
  await page.click('[data-v3objs="hidden"]');
  if (await page.evaluate(() => !!l3.objMesh)) fail('Dolda');
  await page.click('[data-v3objs="solid"]');

  // Vyer: uppifrån.
  await page.keyboard.press('Escape');
  await page.click('#v3ViewsBtn'); await page.click('[data-v3view="top"]'); await page.waitForTimeout(700);
  const dir = await page.evaluate(() => { const d = l3.orbit.target.clone().sub(l3.camera.position).normalize(); return d.z; });
  if (dir > -0.99) fail('Uppifrån ska titta rakt ned: ' + dir);

  // Byggnaden från TC: lista, Etablering avbockad, läs med web-ifc, statusfärg, lådorna döljs.
  await page.click('#v3ShowBtn'); await page.click('#v3BldgBtn'); await page.waitForTimeout(300);
  if (!(await page.locator('[data-bldg="mB"]').isChecked()) || await page.locator('[data-bldg="mE"]').isChecked()) fail('Byggnaden förvald, etableringsfilen inte');
  await page.click('#v3BldgGo');
  await page.waitForFunction(() => l3b.models.length === 1 && !l3b.busy, null, { timeout: 30000 });
  s = await page.evaluate(() => {
    const m = l3b.models[0], mesh = m.meshes[0], col = mesh.geometry.getAttribute('color');
    const r1 = m.ranges.find(r => r.itemId === 'i1'), r2 = m.ranges.find(r => !r.itemId);
    const hex = i => '#' + new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHexString();
    return { n: m.ranges.length, c1: hex(r1.start), c2: hex(r2.start), ph: phaseColor('pagaende').toLowerCase(), boxes: !!l3.objMesh, legend: document.getElementById('v3Legend').innerText };
  });
  if (s.n !== 2 || s.c1 !== s.ph || s.c2 === s.ph || s.boxes) fail('Byggnaden: kopplad pelare i statusfärg, väggen neutral, lådorna dolda: ' + JSON.stringify(s));
  await top();
  await tap(6512350, 150125, 6);
  const info = await page.locator('#v3Info').innerText();
  if (!info.includes('K10') || !info.includes('Pågående') || !info.includes('Hus A')) fail('Tryck på byggnaden ska visa objektets uppgifter: ' + info);
  await tap(6512380, 150125, 3);
  if (!(await page.locator('#v3Info').innerText()).includes('Vagg V1')) fail('Okopplat objekt: namnet från IFC:n');
  // Fästpunkt mot byggnadens hörn med Mät.
  await page.keyboard.press('t');
  const [hx, hy] = await at(6512352, 150127, 6); await page.mouse.move(hx - 3, hy + 3); await page.waitForTimeout(150);
  if ((await page.evaluate(() => document.querySelector('.v3-snap').textContent)) !== 'Ändpunkt') fail('Fästpunkt mot byggnadens hörn');
  // Visa i 4D-planering.
  await page.keyboard.press('Escape'); await tap(6512350, 150125, 6);
  await page.click('#v3InfoJump'); await page.waitForTimeout(150);
  if (!(await page.evaluate(() => window.__calls)).includes('select')) fail('Visa i 4D-planering');
  // Hjälpen, datumet i nederkanten och lägesplanens meny tillbaka när 3D stängs.
  await page.click('#v3HelpBtn');
  if (!(await page.locator('#v3Help').innerText()).includes('Lås röd / grön / blå axel')) fail('Hjälpen ska visa kortkommandona');
  await page.keyboard.press('Escape');
  if (!(await page.evaluate(() => document.getElementById('layout').classList.contains('side-hidden')))) fail('Menyn ska vara dold i 3D på en smal skärm');
  await page.fill('#v3Date', '2019-06-01'); await page.dispatchEvent('#v3Date', 'change'); await page.waitForTimeout(900);
  if (await page.evaluate(() => $('dateInput').value) !== '2019-06-01') fail('Datumet i 3D ska styra lägesplanens datum');
  const c2 = await page.evaluate(() => { const m = l3b.models[0], r = m.ranges.find(x => x.itemId === 'i1'), col = m.meshes[0].geometry.getAttribute('color'); return '#' + new THREE.Color(col.getX(r.start), col.getY(r.start), col.getZ(r.start)).getHexString(); });
  if (c2 !== (await page.evaluate(() => phaseColor('planerad').toLowerCase()))) fail('Vid ett tidigare datum ska pelaren vara planerad: ' + c2);
  if (process.env.SHOT) { await page.evaluate(() => l3Frame(false)); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await page.click('#v3Close');
  if (await page.evaluate(() => document.getElementById('layout').classList.contains('side-hidden'))) fail('Menyn ska komma tillbaka när 3D stängs');
  console.log('OK test_lagesplan_3deditor');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
