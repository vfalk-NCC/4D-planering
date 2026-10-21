// Placera IFC-modell: TC:s placering + egen justering läggs ihop (l3bPlaceCompose), och cache-nyckeln ändras när placeringen ändras.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setContent('<body></body>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'docs', 'lagesplan-3dplace.js'), 'utf8') });
    const r = await page.evaluate(() => {
      const base = { position: { x: 1000, y: 2000, z: 300 }, refDirection: { x: 0, y: 1, z: 0 } };
      const a = l3bPlaceCompose(base, { x: 1.5, y: -2, z: 0.25, rot: 90 });
      return { none: l3bPlaceCompose(base, null) === base, nullBase: l3bPlaceCompose(null, null), a, zero: l3bPlaceCompose(base, { x: 0, y: 0, z: 0, rot: 0 }) === base, onlyAdj: l3bPlaceCompose(null, { x: 2, y: 0, z: 0, rot: 0 }), info: l3bPlaceInfo({ pl: base }), none2: l3bPlaceInfo({}) };
    });
    if (!r.none || r.nullBase !== null || !r.zero) fail('ingen justering ger oförändrad placering: ' + JSON.stringify(r));
    if (r.a.position.x !== 2500 || r.a.position.y !== 0 || r.a.position.z !== 550) fail('förskjutning i mm: ' + JSON.stringify(r.a));
    if (Math.abs(r.a.refDirection.x + 1) > 1e-9 || Math.abs(r.a.refDirection.y) > 1e-9) fail('vridning 90° moturs på riktning +Y ger -X: ' + JSON.stringify(r.a.refDirection));
    if (r.onlyAdj.position.x !== 2000 || r.onlyAdj.refDirection.x !== 1) fail('justering utan TC-placering: ' + JSON.stringify(r.onlyAdj));
    if (!/X 1,000 m, Y 2,000 m, Z 0,300 m, vridning 90,00°/.test(r.info) || !/Ingen placering/.test(r.none2)) fail('placeringstext: ' + r.info + ' | ' + r.none2);
    if (errs.length) fail('JS-fel: ' + errs.join(' | '));
    console.log('OK test_model_placement');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
