// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9889;
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
    const cap = async () => { await page.waitForTimeout(500); await page.evaluate(() => l3Render()); await page.waitForTimeout(600); return page.evaluate(() => ({ day: $('dateInput').value, mode: l3vm.mode, cam: l3plCam(), tmp: (() => { let n = 0; l3.scene.traverse(o => { if (o.userData && o.userData.l3rmTmp) n++; }); return n; })(), st: !!l3rf.st, busy: l3rn.busy, size: l3.renderer.getSize(new THREE.Vector2()).toArray(), pr: l3.renderer.getPixelRatio(), fog: !!l3.scene.fog })); };
    await page.evaluate(() => { l3plSet('film', { from: '2026-10-01', to: '2026-10-21', sec: 1, res: '360', title: true, caption: 'Test', pearls: true }); l3SetPref('vmode', 'shaded'); l3vmSet('shaded', true); });
    const before = await cap();
    const fs = require('fs'), os = require('os'), cp = require('child_process'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rfilm-'));
    const run = (args) => cp.spawnSync(args[0], args.slice(1), { encoding: 'utf8' });

    // 1) video: bildruta för bildruta med motorn, WebCodecs + egen WebM-skrivare
    const v = await page.evaluate(async () => {
      const prog = []; const r = await l3rfFilm({ from: '2026-10-01', to: '2026-10-21', sec: 1, fps: 24, res: 360, samples: 1, format: 'webm', onProgress: (i, n, c, inf) => prog.push([i, n, inf.day, c.width]) });
      const buf = new Uint8Array(await r.blob.arrayBuffer()); let b64 = ''; for (let i = 0; i < buf.length; i += 32768) b64 += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      return { name: r.name, size: r.size, frames: r.frames, format: r.format, stopped: r.stopped, w: r.w, h: r.h, fps: r.fps, head: Array.from(buf.slice(0, 4)), days: [...new Set(prog.map(p => p[2]))].length, first: prog[0], last: prog[prog.length - 1], np: prog.length, b64: btoa(b64), enc: typeof VideoEncoder };
    });
    if (v.format === 'jpeg-zip') console.log('OBS: VideoEncoder saknas i testwebbläsaren (' + v.enc + ') – videovägen provas inte här');
    else {
      if (v.head.join() !== '26,69,223,163' || v.frames !== 24 || v.w !== 640 || v.h !== 360 || v.np !== 24 || v.days < 8) fail('Videon: ' + J({ ...v, b64: undefined }));
      const f = path.join(tmp, 'film.webm'); fs.writeFileSync(f, Buffer.from(v.b64, 'base64'));
      const pr = run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,r_frame_rate:format=duration', '-of', 'json', f]);
      const info = JSON.parse(pr.stdout || '{}'), s0 = (info.streams || [])[0] || {};
      if (!/^vp(8|9)$/.test(s0.codec_name) || s0.width !== 640 || s0.height !== 360 || +s0.nb_read_frames !== 24 || Math.abs(+info.format.duration - 1) > 0.15) fail('ffprobe: ' + pr.stdout + pr.stderr);
      // tidsstämplarna ska vara jämna (1/24 s) – det är hela poängen med egen skrivare
      const pt = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', f]);
      const ts = pt.stdout.trim().split('\n').map(Number); const gaps = ts.slice(1).map((t, i) => t - ts[i]);
      if (ts.length !== 24 || gaps.some(g => Math.abs(g - 1 / 24) > 0.0105)) fail('Tidsstämplarna ska vara jämna: ' + J(ts));
      const png = path.join(tmp, 'f.png'); const ex = run(['ffmpeg', '-v', 'error', '-y', '-ss', '0.5', '-i', f, '-frames:v', '1', png]);
      if (!fs.existsSync(png) || fs.statSync(png).size < 3000) fail('Kunde inte avkoda en bildruta: ' + ex.stderr);
      if (process.env.L3FILM) fs.copyFileSync(png, process.env.L3FILM);
      const st = run(['ffmpeg', '-v', 'error', '-i', f, '-vf', 'select=eq(n\\,12),signalstats,metadata=print:file=-', '-f', 'null', '-']);
      const m = /lavfi.signalstats.YAVG=([\d.]+)/.exec(st.stdout + st.stderr); if (!m || +m[1] < 40) fail('Bildrutan ska inte vara svart: ' + (st.stdout + st.stderr).slice(0, 200));
      console.log('OK: film som video (' + v.format + ') – ' + v.frames + ' bilder med motorn, jämna tidsstämplar, ffprobe/ffmpeg avkodar, ' + (v.size / 1000).toFixed(0) + ' kB');
    }
    const after1 = await cap();
    if (J(after1) !== J(before)) fail('Editorn ska vara som innan filmen: ' + J({ before, after1 }));

    // 2) avbruten film ger en giltig fil med det som hunnit renderas
    const sp = await page.evaluate(async () => { const r = await l3rfFilm({ from: '2026-10-01', to: '2026-10-21', sec: 1, fps: 24, res: 360, samples: 1, format: 'auto', onProgress: (i) => { if (i === 5) l3rfStop(); } }); return { stopped: r.stopped, frames: r.frames, size: r.size, format: r.format }; });
    if (!sp.stopped || sp.frames !== 5 || sp.size < 500) fail('Avbruten film: ' + J(sp));
    console.log('OK: Stoppa avslutar snyggt och sparar de ' + sp.frames + ' bilder som hunnit renderas');

    // 3) bildsekvens (JPEG i ZIP) som reserv
    const z = await page.evaluate(async () => {
      delete window.showSaveFilePicker; const r = await l3rfFilm({ from: '2026-10-01', to: '2026-10-21', sec: 1, fps: 24, res: 180, samples: 1, format: 'zip' });
      const buf = new Uint8Array(await r.blob.arrayBuffer()); let b64 = ''; for (let i = 0; i < buf.length; i += 32768) b64 += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      return { name: r.name, frames: r.frames, format: r.format, size: r.size, b64: btoa(b64) };
    });
    const zf = path.join(tmp, 'film.zip'); fs.writeFileSync(zf, Buffer.from(z.b64, 'base64'));
    const ul = run(['unzip', '-l', zf]); const nj = (ul.stdout.match(/bild_\d{5}\.jpg/g) || []).length;
    if (z.format !== 'jpeg-zip' || nj !== 24 || !/\.zip$/.test(z.name)) fail('Bildsekvens: ' + J({ ...z, b64: undefined, nj }) + ul.stderr);
    console.log('OK: bildsekvens (JPEG i ZIP) – ' + nj + ' bilder');
    const after2 = await cap(); if (J(after2) !== J(before)) fail('Editorn ska vara orörd efter filmerna: ' + J({ before, after2 }));

    // 4) fliken Film i rutan
    await page.click('#v3RenderBtn'); await page.waitForSelector('#v3Render');
    await page.click('.rn-tabs [data-t="film"]'); await page.waitForSelector('#rfGo');
    const ui = await page.evaluate(() => ({ from: document.getElementById('rfFrom').value, to: document.getElementById('rfTo').value, fps: document.getElementById('rfFps').options.length, res: [...document.getElementById('rfRes').options].map(o => o.value).join(), save: document.getElementById('rfSave').disabled, go: document.getElementById('rfGo').textContent, chips: document.querySelectorAll('#v3Render .rn-fchip').length }));
    if (ui.from !== '2026-10-01' || ui.to !== '2026-10-21' || ui.fps !== 4 || ui.res !== '720,1080,1440,2160' || ui.go !== 'Rendera film' || ui.chips !== 6) fail('Fliken Film: ' + J(ui));
    await page.selectOption('#rfFps', '25'); await page.selectOption('#rfQ', '8'); await page.fill('#rfSec', '12'); await page.dispatchEvent('#rfSec', 'change');
    const pf = await page.evaluate(() => ({ rf: l3Prefs().rfilm, sec: l3plPrefs().film.sec }));
    if (pf.rf.fps !== 25 || pf.rf.q !== 8 || pf.sec !== 12) fail('Filminställningarna ska sparas: ' + J(pf));
    await page.evaluate(() => { l3plSet('film', { ...l3plPrefs().film, sec: 1, res: '720' }); l3rfSetPref('q', 1); l3rfSetPref('fps', 24); });
    await page.click('.rn-tabs [data-t="film"]'); await page.waitForSelector('#rfGo');
    // starta via knappen och stoppa: knappen byter text, paus fungerar, avbrutet sparas
    await page.selectOption('#rfRes', '720'); await page.selectOption('#rfQ', '1'); await page.fill('#rfSec', '1');
    await page.dispatchEvent('#rfSec', 'change'); await page.dispatchEvent('#rfRes', 'change');
    const dl = page.waitForEvent('download', { timeout: 180000 }).catch(() => null);
    await page.click('#rfGo'); await page.waitForFunction(() => document.getElementById('rfGo').textContent === 'Stoppa' && l3rf.st && l3rf.st.i >= 2, null, { timeout: 60000 });
    const mid = await page.evaluate(() => ({ msg: document.getElementById('rfMsg').textContent, bar: document.getElementById('rfBar').style.width, pause: document.getElementById('rfPause').disabled }));
    if (!/Bild \d+ av 24/.test(mid.msg) || mid.pause) fail('Under filmen: ' + J(mid));
    await page.click('#rfGo'); await page.waitForFunction(() => !l3rf.st, null, { timeout: 90000 });
    await page.waitForFunction(() => /Avbruten|Klar/.test(document.getElementById('rfMsg').textContent), null, { timeout: 20000 });
    const saved = await page.evaluate(() => ({ msg: document.getElementById('rfMsg').textContent, save: document.getElementById('rfSave').disabled, last: l3rf.last && l3rf.last.frames }));
    if (saved.save || !/Avbruten/.test(saved.msg)) fail('Efter Stoppa: ' + J(saved));
    await page.click('#v3Render .rn-x');
    const after3 = await cap(); if (J(after3) !== J(before)) fail('Editorn efter rutans film: ' + J({ before, after3 }));
    console.log('OK: fliken Film – inställningar sparas, start/stopp via knappen, förlopp med tid kvar, avbrutet sparas');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_3drfilm');
    await browser.close(); server.close();
  } catch (e) { console.error('FEL:', e.message); process.exit(1); }
})();
