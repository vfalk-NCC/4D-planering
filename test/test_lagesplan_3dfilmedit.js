// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9901;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const PP = [
  { id: 'p1', group_id: 'G1', object_id: '1hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K10', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-05', end_date: '2026-10-16', progress: 40, baseline_start_date: '2026-10-08', baseline_end_date: '2026-10-19' },
  { id: 'p2', group_id: 'G1', object_id: '2hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K11', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-06', end_date: '2026-10-18', progress: 20 },
  { id: 'p3', object_id: '3hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Tak', activity: 'Takmontage', area: 'Hus B', contractor: 'Peab', start_date: '2026-11-02', end_date: '2026-11-20', progress: 0 },
  { id: 'p4', object_id: '4hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Fasad', activity: 'Fasadmontage', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-17', end_date: '2026-10-20', progress: 0, depends_on: ['p1'] },
];
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-3d-prefs', JSON.stringify({ plan: true })); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => {
      const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (global.__mockWrite && r.request().method() === 'PUT' && f === 'projects/p1/pp/plan_items.json') { try { const nw = JSON.parse(Buffer.from(JSON.parse(r.request().postData()).content, 'base64').toString()); PP.splice(0, PP.length, ...nw); } catch (e) { /* ignoreras */ } }
      if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
      const data = { 'projects/p1/pp/plan_items.json': PP, 'projects/p1/plan_items.json': [{ id: 'x1', object_id: 'X1', object_name: 'Bod', activity: 'Etablering bodar', area: 'Etablering', start_date: '2026-10-10', end_date: '2026-10-15' }], 'projects/p1/plan_milestones.json': [{ id: 'm1', name: 'Stomme klar', target_date: '2026-10-14', done: false }] }[f];
      r.fulfill(data ? { status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(data)).toString('base64'), sha: 's' }) } : { status: 404, body: '{}' });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
      $('dateInput').value = '2026-10-12';
      open3d();
    });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3plRenderTab === 'function', null, { timeout: 15000 });
    await page.evaluate(() => { $('dateInput').value = '2026-10-12'; l3SyncDate(); });   // 3D startar på dagens datum – testet vill ha ett fast datum
    const J = v => JSON.stringify(v);
    await page.evaluate(() => { window.showSaveFilePicker = undefined; l3plSet('film', { from: '2026-10-01', to: '2026-10-21', sec: 10, res: '240', title: true, pearls: true }); l3SetPref('vmode', 'shaded'); l3vmSet('shaded', true); l3fsToggle(true); });
    await page.waitForSelector('#v3FilmEdit .fe-st', { timeout: 15000 });
    const ui0 = await page.evaluate(() => ({ secs: [...document.querySelectorAll('#v3FilmEdit .fe-st')].map(b => b.textContent.trim().slice(0, 12)), box: (() => { const r = document.getElementById('v3FilmEdit').getBoundingClientRect(), s = document.getElementById('v3FilmStrip').getBoundingClientRect(); return { editBottom: Math.round(r.bottom), stripTop: Math.round(s.top) }; })() }));
    if (ui0.secs.length !== 5 || ui0.box.editBottom > ui0.box.stripTop + 2) fail('Menyn ska öppnas med tidslinjen, ovanför den: ' + J(ui0));
    if (process.env.L3FE) { await page.click('#v3FilmEdit [data-fe="sec"][data-k="kam"]'); await page.screenshot({ path: process.env.L3FE }); await page.click('#v3FilmEdit [data-fe="sec"][data-k="tid"]'); }
    console.log('OK: menyn öppnas med tidslinjen – ' + ui0.secs.length + ' avsnitt, ligger ovanför tidslinjen');

    await page.fill('#v3FilmEdit #feFrom', '2026-10-05'); await page.dispatchEvent('#v3FilmEdit #feFrom', 'change'); await page.waitForTimeout(150); await page.fill('#v3FilmEdit #feTo', '2026-10-18'); await page.dispatchEvent('#v3FilmEdit #feTo', 'change'); await page.waitForTimeout(150);
    const rg = await page.evaluate(() => ({ f: l3plPrefs().film.from, t: l3plPrefs().film.to, range: l3fsRange().map(x => new Date(x).toISOString().slice(0, 10)) }));
    if (rg.f !== '2026-10-05' || rg.t !== '2026-10-18' || rg.range.join() !== '2026-10-05,2026-10-18') fail('Datumen för inspelningen i filmmenyn: ' + J(rg));
    await page.evaluate(() => { l3plSet('film', { ...l3plPrefs().film, from: '2026-10-01', to: '2026-10-21' }); l3fsRender(); });
    console.log('OK: Spela in från/till – datum i filmmenyn styr filmens intervall och tidslinje');
    // tidskurva, pauser och tona
    const T = await page.evaluate(() => {
      const tIn = Date.UTC(2026, 9, 1), tOut = Date.UTC(2026, 9, 21), sec = 10, D = 86400000;
      l3feSet({ ease: 'lin', holds: [], fadeIn: 0, fadeOut: 0 }, false);
      const lin = [0, 5, 10].map(s => (l3feTimeAt(s, sec, tIn, tOut).t - tIn) / D);
      l3feSet({ ease: 'inout' }, false); const eio = [2, 5, 8].map(s => (l3feTimeAt(s, sec, tIn, tOut).t - tIn) / D);
      l3feSet({ ease: 'lin', holds: [{ date: '2026-10-11', sec: 2, text: 'Halvvägs' }] }, false);
      const seq = []; for (let s = 0; s <= 10; s += 0.5) { const r = l3feTimeAt(s, sec, tIn, tOut); seq.push([s, +((r.t - tIn) / D).toFixed(2), !!r.hold]); }
      const holdSec = seq.filter(x => x[2]).length * 0.5, mono = seq.every((x, i) => !i || x[1] >= seq[i - 1][1]);
      const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d'); x.fillStyle = '#ff0000'; x.fillRect(0, 0, 64, 36);
      l3feSet({ holds: [], fadeIn: 2, fadeOut: 2, fadeCol: '#000000' }, false); l3feOverlay(x, 64, 36, 0, 10, null); const f0 = x.getImageData(5, 5, 1, 1).data[0];
      x.fillStyle = '#ff0000'; x.fillRect(0, 0, 64, 36); l3feOverlay(x, 64, 36, 5, 10, null); const f5 = x.getImageData(5, 5, 1, 1).data[0];
      x.fillStyle = '#ff0000'; x.fillRect(0, 0, 64, 36); l3feOverlay(x, 64, 36, 9, 10, null); const f9 = x.getImageData(5, 5, 1, 1).data[0];
      l3feSet({ fadeIn: 0, fadeOut: 0, holds: [], ease: 'lin' }, false);
      return { lin, eio, holdSec, mono, seq9: seq.find(x => x[0] === 5), f0, f5, f9 };
    });
    if (T.lin.join() !== '0,10,20' || !(T.eio[0] < 4 && T.eio[1] === 10 && T.eio[2] > 16)) fail('Tidskurvan (linjär och mjuk): ' + J(T));
    if (T.holdSec < 1.5 || T.holdSec > 2.5 || !T.mono) fail('Pausen ska hålla filmen stilla ca 2 s vid datumet och tiden gå framåt: ' + J(T));
    if (T.f0 > 5 || T.f5 < 250 || T.f9 > 200 || T.f9 < 60) fail('Tona in/ut: ' + J(T));
    console.log('OK: tidskurva (linjär, mjuk), paus vid datum (' + T.holdSec + ' s) och tona in/ut');

    // kamerarörelser och bana
    const C = await page.evaluate(async () => {
      l3.camera.position.set(30, -45, 14); l3.orbit.target.set(2, 22, 3); l3.orbit.update(); l3plKeysSet([]);
      const head = Date.UTC(2026, 9, 1); l3fs.t = head; await l3feMove('orbit'); const ks = l3plKeys(), tg = ks[0].t;
      const dist = ks.map(k => Math.hypot(k.p[0] - tg[0], k.p[1] - tg[1])), spread = Math.max(...dist) - Math.min(...dist), sameEnd = Math.hypot(ks[0].p[0] - ks[ks.length - 1].p[0], ks[0].p[1] - ks[ks.length - 1].p[1]);
      const mode = l3feE().cam, T0 = ks.map(k => l3plDate(k.date).getTime()), mid = l3plCamAt(ks, T0[3]), at = Math.hypot(mid.p[0] - ks[3].p[0], mid.p[1] - ks[3].p[1], mid.p[2] - ks[3].p[2]);
      const between = l3plCamAt(ks, (T0[3] + T0[4]) / 2), sm = between.p.every(Number.isFinite);
      const n0 = ks.length; l3fs.t = Date.UTC(2026, 9, 2); l3feCopyKey(); const n1 = l3plKeys().length; const d0 = l3plKeys()[2].date; l3fs.t = Date.UTC(2026, 9, 5); l3feShift(2); const after = l3plKeys().find(k => k.name && k.name.includes('Omloppsbana 4'));
      l3feEven(); l3plKeysSet([]); l3fs.t = Date.UTC(2026, 9, 1); await l3feMove('in'); const inKeys = l3plKeys();
      return { n0, spread: +spread.toFixed(3), sameEnd: +sameEnd.toFixed(3), mode, at: +at.toFixed(4), sm, n1, shifted: after && after.date, inN: inKeys.length, closer: Math.hypot(...inKeys[1].p.map((v, i) => v - inKeys[1].t[i])) < Math.hypot(...inKeys[0].p.map((v, i) => v - inKeys[0].t[i])) };
    });
    if (C.n0 < 8 || C.spread > 0.05 || C.sameEnd > 0.05 || C.mode !== 'spline') fail('Omloppsbana 360° ska ge vyer på en cirkel med samma start och slut och slät bana: ' + J(C));
    if (C.at > 0.01 || !C.sm || C.n1 !== C.n0 + 1 || !C.shifted || C.inN !== 2 || !C.closer) fail('Kamerabana, kopiera vy, flytta efter huvudet, inkörning: ' + J(C));
    console.log('OK: kamerarörelser – omloppsbana (' + C.n0 + ' vyer på en cirkel, slät bana), kopiera vy, flytta efter huvudet, fördela, inkörning');

    // bildformat, filter, guide och film
    const F = await page.evaluate(async () => {
      l3plKeysSet([]); l3feSet({ aspect: '9:16', look: 'bw', guide: true, ease: 'inout', holds: [{ date: '2026-10-01', sec: 1, text: 'Start' }], fadeIn: 0.5 }, false); l3fsRender();
      const g = document.getElementById('v3FeGuide'), gr = g && g.getBoundingClientRect();
      const r = await l3rfFilm({ from: '2026-10-01', to: '2026-10-21', sec: 2, fps: 24, res: 240, samples: 1, format: 'zip' });
      const dims = [l3feW(1080), l3rfDims(240).W], ratio = gr ? +(gr.width / gr.height).toFixed(3) : null;
      return { w: r.w, h: r.h, frames: r.frames, dims, ratio, filter: l3feFilter() };
    });
    if (F.w !== 136 || F.h !== 240 || F.frames !== 48 || F.dims[0] !== 608 || !F.ratio || Math.abs(F.ratio - 0.5625) > 0.01 || !/grayscale/.test(F.filter)) fail('Bildformat 9:16, guide och film: ' + J(F));
    console.log('OK: bildformat 9:16 (film ' + F.w + '×' + F.h + ', ' + F.frames + ' bilder), bildruta-guide, filter svartvit');

    // knappar i menyn och mallar
    await page.evaluate(() => { l3feSet({ aspect: '16:9', look: '', guide: false, holds: [], fadeIn: 0 }, false); l3fsRender(); });
    await page.click('#v3FilmEdit [data-fe="sec"][data-k="mall"]'); await page.click('#v3FilmEdit [data-fe="tp"][data-k="quick"]'); await page.waitForTimeout(200);
    const tp = await page.evaluate(() => ({ sec: l3plPrefs().film.sec, ease: l3feE().ease, fi: l3feE().fadeIn }));
    if (tp.sec !== 20 || tp.ease !== 'inout' || tp.fi !== 0.8) fail('Mallen Snabb överblick: ' + J(tp));
    await page.click('#v3FilmEdit [data-fe="sec"][data-k="kam"]'); await page.waitForSelector('#v3FilmEdit [data-fe="mv"][data-k="crane"]');
    await page.click('#v3FilmEdit [data-fe="sec"][data-k="mark"]'); await page.waitForSelector('#v3FilmEdit [data-fe="madd"]');
    await page.evaluate(() => { l3feSet({ markers: [{ date: '2026-10-10', name: 'Stomme klar' }] }); l3fsRender(); });
    const mk = await page.evaluate(() => ({ flags: document.querySelectorAll('#v3FilmStrip .fe-flag').length, list: document.querySelectorAll('#v3FilmEdit .fe-go').length }));
    if (mk.flags < 1 || mk.list !== 1) fail('Markörer ska synas på tidslinjen och i listan: ' + J(mk));
    await page.click('#v3FilmEdit [data-fe="tog"]'); const mn = await page.evaluate(() => !document.querySelector('#v3FilmEdit .fe-body')); if (!mn) fail('Menyn ska kunna fällas ihop');
    await page.click('#v3FilmEdit [data-fe="tog"]');
    console.log('OK: menyn – mallar, avsnitt, markörer på tidslinjen, fäll ihop');
    await page.evaluate(() => l3fsToggle(false)); await page.waitForTimeout(300);
    const gone = await page.evaluate(() => !document.getElementById('v3FilmEdit') && !document.getElementById('v3FeGuide')); if (!gone) fail('Menyn ska stängas med tidslinjen');
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_3dfilmedit');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
