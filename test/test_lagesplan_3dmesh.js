const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9071;
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const cube = (x0, y0, z0, s) => { const V = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(v => [x0 + v[0] * s, y0 + v[1] * s, z0 + v[2] * s]); return V; };
    const objCube = (name, V, off) => `o ${name}\n` + V.map(v => `v ${v.join(' ')}`).join('\n') + '\n' + [[1,2,3,4],[5,8,7,6],[1,5,6,2],[2,6,7,3],[3,7,8,4],[4,8,5,1]].map(f => 'f ' + f.map(i => i + off).join(' ')).join('\n') + '\n';
    const obj = objCube('Pelare', cube(0, 0, 0, 10000), 0) + objCube('Balk', cube(20000, 0, 0, 10000), 8);
    const out = {};
    const m = await l3msLoadFile(new File([obj], 'test.obj'));
    out.obj = { models: l3ms.models.length, unit: m && m.unit, placed: m && m.placed, tris: m && m.tris, names: [] };
    m.root.traverse(o => { if (o.isMesh) out.obj.names.push(o.name); });
    const bb = new THREE.Box3().setFromObject(m.wrap); out.obj.size = Math.round(bb.getSize(new THREE.Vector3()).x);
    l3SetPref('palTab', 'layers'); document.querySelector('[data-paltab="layers"]').click(); l3LayersRender(); await new Promise(r => setTimeout(r, 200));
    out.ui = { sub: !!document.querySelector('.v3-msub'), nodes: [...document.querySelectorAll('.v3-msn-n')].map(x => x.textContent).join(','), exp: !!document.querySelector('[data-msexp]') };
    // välj Pelare med Ctrl+klick och bygg IFC
    const row = [...document.querySelectorAll('.v3-msn')].find(x => x.textContent.includes('Pelare')); row.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await new Promise(r => setTimeout(r, 100));
    out.sel = m.sel.size; const nodes = [...m.sel].map(i => l3msFind(m, i)); const ifc = l3msIfcBuild(m, nodes);
    out.ifc = { n: ifc.n, tris: ifc.tris, faceSets: (ifc.text.match(/IFCTRIANGULATEDFACESET/g) || []).length, pelare: /Pelare/.test(ifc.text), balk: /Balk/.test(ifc.text), world: /\(65\d{5}|\(\d{4,}\./.test(ifc.text) };
    const all = l3msIfcBuild(m, []); out.all = all.n;
    // släck Balk → bara Pelare i allt-export
    m.root.traverse(o => { if (o.name === 'Balk') o.visible = false; }); out.hidden = l3msIfcBuild(m, []).n;
    // enhet meter ändrar storleken
    m.unit = 1; m.unitSet = true; l3msApply(m); out.size1 = Math.round(new THREE.Box3().setFromObject(m.wrap).getSize(new THREE.Vector3()).x);
    // FBX (ASCII)
    const fbx = `; FBX 7.4.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",2
		P: "UpAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 1001, "Geometry::Box", "Mesh" {
		Vertices: *24 {
			a: 0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1
		}
		PolygonVertexIndex: *24 {
			a: 0,3,2,-2,4,5,6,-8,0,1,5,-5,1,2,6,-6,2,3,7,-7,3,0,4,-8
		}
		GeometryVersion: 124
	}
	Model: 2001, "Model::Kolonn", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Translation", "Lcl Translation", "", "A",5000,0,0
			P: "Lcl Scaling", "Lcl Scaling", "", "A",1000,1000,3000
		}
	}
}
Connections:  {
	C: "OO",1001,2001
	C: "OO",2001,0
}
`;
    const f = await l3msLoadFile(new File([fbx], 'nwd-export.fbx'));
    out.fbx = { ok: !!f, tris: f && f.tris, unit: f && f.unit, names: [] }; if (f) f.root.traverse(o => { if (o.name) out.fbx.names.push(o.name); });
    l3LayersRender(); await new Promise(r => setTimeout(r, 300)); if (window.__wantShot) { window.__shot = 1; }
    out.models = l3ms.models.length; if (!window.__shotDone) { window.__shotDone = true; } l3msRemove(m.id); out.afterRemove = l3ms.models.length;
    // släppt-fil-klassning
    out.cls = l3drClassify([new File(['x'], 'a.fbx'), new File(['x'], 'b.OBJ'), new File(['x'], 'c.glb'), new File(['x'], 'd.nwd')]); out.cls = { mesh: out.cls.mesh.length, bad: out.cls.bad.map(f => f.name).join() };
    return out; });
  if (r.obj.models !== 1 || r.obj.unit !== 0.001 || r.obj.placed !== 'vyns mitt' || r.obj.tris !== 24 || r.obj.names.join() !== 'Pelare,Balk' || r.obj.size !== 30) fail('OBJ in som mesh-modell (mm, vyns mitt): ' + JSON.stringify(r.obj));
  if (!r.ui.sub || !/Pelare/.test(r.ui.nodes) || !/Balk/.test(r.ui.nodes) || !r.ui.exp) fail('Modellträd i Lager: ' + JSON.stringify(r.ui));
  if (r.sel !== 1 || r.ifc.n !== 1 || r.ifc.tris !== 12 || r.ifc.faceSets !== 1 || !r.ifc.pelare || r.ifc.balk || r.all !== 2 || r.hidden !== 1) fail('IFC av valda delar: ' + JSON.stringify({ sel: r.sel, ifc: r.ifc, all: r.all, hidden: r.hidden }));
  if (r.size1 !== 30000) fail('Enhet meter ger 30 000 m: ' + r.size1);
  if (!r.fbx.ok || r.fbx.tris !== 12 || !r.fbx.names.includes('Kolonn')) fail('FBX (ASCII) läses: ' + JSON.stringify(r.fbx));
  if (r.models !== 2 || r.afterRemove !== 1 || r.cls.mesh !== 3 || r.cls.bad !== 'd.nwd') fail('Ta bort + klassning: ' + JSON.stringify({ m: r.models, a: r.afterRemove, c: r.cls }));
  console.log('OK: mesh-modeller – OBJ och FBX in, modellträd, enhet/placering, valda delar som IFC, släpp-klassning', JSON.stringify({ obj: r.obj, ifc: r.ifc, fbx: r.fbx }));
  if (process.env.SHOT) { await page.evaluate(async () => { const m = await l3msLoadFile(new File(['o Pelare\nv 0 0 0\nv 10000 0 0\nv 10000 10000 0\nv 0 10000 0\nf 1 2 3 4\no Balk\nv 0 0 5000\nv 10000 0 5000\nv 10000 10000 5000\nf 5 6 7\n'], 'Hus_A.obj')); l3LayersRender(); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT }); }
  const real = errors.filter(e => !/allow-same-origin/.test(e)); if (real.length) fail('sidfel: ' + real.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
