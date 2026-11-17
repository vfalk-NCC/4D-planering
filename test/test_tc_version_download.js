// Hämtning av en viss version ur Trimble Connect: flera sätt att be om versionen prövas, och filens storlek jämförs med versionens
// så att en äldre version aldrig tyst blir den senaste (två versioner blev identiska vid jämförelsen 2026-11-17).
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ifc-subset.js'), 'utf8');
const a = src.indexOf('async function ifcSubsetDownload'), b = src.indexOf('/* .ifczip -> IFC-bytes');
const fn = src.slice(a, b);
const fail = m => { console.error('FAIL', m); process.exit(1); };
const mk = (sizes) => {   // sizes: { 'path?query': bytes } – vilket svar varje förfrågan ger
  const log = [];
  const ctx = { API: { project: { getProject: async () => ({ id: 'p' }) } }, tcAccessToken: async () => 'tok', tcApiBase: async () => 'https://tc.test/api',
    fetch: async (url) => {
      log.push(url);
      if (url.startsWith('https://tc.test/api/')) { const key = url.slice('https://tc.test/api/'.length); return key in sizes ? new Response(JSON.stringify({ url: 'https://s3.test/' + encodeURIComponent(key) }), { status: 200 }) : new Response('{}', { status: 404 }); }
      const key = decodeURIComponent(url.slice('https://s3.test/'.length)), n = sizes[key];
      return new Response(new Uint8Array(n), { status: 200, headers: { 'Content-Length': String(n) } });
    }, Response, Uint8Array, encodeURIComponent, Number, Math, Error, JSON, console };
  vm.createContext(ctx); vm.runInContext(fn + '\nthis.dl = ifcSubsetDownload;', ctx); return { ctx, log };
};
(async () => {
  // 1) Första sättet ger senaste filen (fel storlek) → nästa sätt ger rätt version
  let t = mk({ 'files/fs/F1/downloadurl?versionId=V1': 132000, 'files/F1/downloadurl?versionId=V1': 93000 });
  let r = await t.ctx.dl({ fileId: 'F1', versionId: 'V1', expectBytes: 93000 });
  if (r.length !== 93000 || t.ctx.dl.lastPath !== 'files/F1/downloadurl?versionId=V1') fail('Fel version avvisas och nästa sätt provas: ' + r.length + ' ' + t.ctx.dl.lastPath);
  // 2) Inget sätt ger rätt storlek → tydligt fel i stället för fel fil
  t = mk({ 'files/fs/F1/downloadurl?versionId=V1': 132000, 'files/F1/downloadurl?versionId=V1': 132000 });
  try { await t.ctx.dl({ fileId: 'F1', versionId: 'V1', expectBytes: 93000 }); fail('Fel fil ska ge fel'); } catch (e) { if (!/inte den begärda versionen/.test(e.message) || !/93000/.test(e.message)) fail('Felmeddelande: ' + e.message); }
  // 3) Okänd storlek: första sättet godtas. Utan version: som förut.
  t = mk({ 'files/fs/F1/downloadurl?versionId=V1': 132000 });
  r = await t.ctx.dl({ fileId: 'F1', versionId: 'V1' }); if (r.length !== 132000) fail('Okänd storlek godtas');
  t = mk({ 'files/fs/F1/downloadurl': 5000 }); r = await t.ctx.dl({ fileId: 'F1' }); if (r.length !== 5000) fail('Utan version');
  // 4) Storlek inom 2 % godtas (komprimering/rubriker)
  t = mk({ 'files/fs/F1/downloadurl?versionId=V1': 93500 }); r = await t.ctx.dl({ fileId: 'F1', versionId: 'V1', expectBytes: 93000 }); if (r.length !== 93500) fail('Inom 2 %');
  console.log('OK: hämtning av viss version – fel storlek avvisas, nästa sätt prövas, tydligt fel om ingen stämmer');
})().catch(e => fail(e.stack || e.message));
