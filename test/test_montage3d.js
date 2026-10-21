// Montage-HTML med riktig geometri: dashboardens fil + inlästa modeller -> ny fil där 3D-vyn ritar riktiga former.
// Testet kör mpBuild med låtsasmodeller (kuber och en L-formad bit) och öppnar resultatet.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const SRC = process.env.MONTAGE_HTML || path.join(__dirname, 'data', 'montage_dash.html');
(async () => {
  if (!fs.existsSync(SRC)) { console.log('SKIP test_montage3d (ingen exempelfil: sätt MONTAGE_HTML)'); return; }
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setContent('<body></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'docs', 'lagesplan-montage3d.js'), 'utf8') });
    const html = fs.readFileSync(SRC, 'utf8');
    const out = await page.evaluate(async html => {
      const cube = (x, y, z, s) => { const p = [], i = []; for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) p.push(x + dx * s, y + dy * s, z + dz * s);
        [[0, 1, 3, 0, 3, 2], [4, 6, 7, 4, 7, 5], [0, 4, 5, 0, 5, 1], [2, 3, 7, 2, 7, 6], [0, 2, 6, 0, 6, 4], [1, 5, 7, 1, 7, 3]].forEach(f => i.push(...f)); return { p, i }; };
      const mk = (guid, c) => { const g = { getAttribute: () => ({ array: Float32Array.from(c.p) }), index: null }; return { guid, mesh: { geometry: g, userData: { l3b: { ranges: [{ start: 0, count: c.p.length / 3, idxStart: 0, idxCount: c.i.length, guid }], origIdx: Uint32Array.from(c.i) } } } }; };
      const ents = ['G1', 'G2', 'G3', 'G4'].map((g, k) => mk(g, cube(1000 + k * 3, 2000, 10 + (k % 2) * 2, 2)));
      ents[3].mesh.matrixWorld = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 15, 1] }; // G4: modellen ligger 15 m högre i scenen
      const dup = mk('G1', cube(5000, 5000, 100, 2)); // samma IFC-id i en annan fil (kopia av samma modell)
      window.l3b = { models: [{ id: 'M2', name: 'Kran 2.ifc', _pEnts: new Map([['G1', [{ mesh: dup.mesh, ri: 0 }]]]) }, { id: 'M1', name: 'Bygg.ifc', _pEnts: new Map(ents.map(e => [e.guid, [{ mesh: e.mesh, ri: 0 }]])) }] };
      window.l3pEnts = m => m._pEnts; window.l3bsIdx = (mesh, ri) => { const r = mesh.userData.l3b.ranges[ri]; return [r.idxStart, r.idxCount]; };
      const r = await mpBuild(html, {}); const D = JSON.parse(r.html.slice(r.html.lastIndexOf(')({') + 2, r.html.lastIndexOf(');</script>'))); const zs = []; D.steps.forEach(s => (s.obj || []).forEach(o => { if (o.g && o.b) zs[o.g] = o.b[2]; })); return { found: r.found, missing: r.missing, total: r.total, tris: r.tris, bytes: r.bytes, html: r.html, zs: { G1: zs.G1, G4: zs.G4 }, g1: (() => { let b = null; D.steps.forEach(s => (s.obj || []).forEach(o => { if (o.g === 'G1') b = o.b; })); return b; })() };
    }, html);
    if (out.found !== 4 || out.missing !== 1 || out.total !== 5 || out.tris !== 48) fail('träffar: ' + JSON.stringify({ ...out, html: undefined }));
    if (Math.abs(out.zs.G4 - out.zs.G1 - 15 - 2) > 0.01 && Math.abs(out.zs.G4 - out.zs.G1 - 15) > 0.01) fail('modellens läge i scenen (matrixWorld) följer med: ' + JSON.stringify(out.zs));
    if (!out.g1 || out.g1[3] - out.g1[0] > 2.01) fail('likadant objekt-id i två modeller: formen hämtas ur rätt modell, inte båda: ' + JSON.stringify(out.g1));
    const o2 = path.join(process.env.PLACE_TMP || __dirname, '..', '.tmp'); fs.mkdirSync(o2, { recursive: true }); fs.writeFileSync(path.join(o2, 'montage3d.html'), out.html);
    const p2 = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const e2 = []; p2.on('pageerror', e => e2.push(e.message)); await p2.setContent(out.html); await p2.waitForSelector('#cv3'); await p2.waitForTimeout(900);
    const n = await p2.evaluate(() => window.__v3 && window.__v3.state().N); if (n !== 4) fail('3D-vyn har 4 objekt med geometri: ' + n);
    const lit = await p2.evaluate(() => { const cv = document.getElementById('cv3'), c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d'); g.drawImage(cv, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 40) k++; return k; });
    if (lit < 300) fail('geometrin ritas: ' + lit);
    if (process.env.SHOT) await p2.screenshot({ path: '/tmp/m3d.png' });
    if (e2.length || errs.length) fail('JS-fel: ' + e2.concat(errs).join(' | '));
    console.log('OK test_montage3d', out.bytes, 'byte geometri');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
