// Organizer-indelningen från Trimble Connect i 3D-vyns flik Grupper (Victor 2026-10-12). Del 1: tc-organizer.js
// (4D-planering) mot ett låtsat Organizer-API – region, forest, träd, noder med sidor, länkar med IFC-id och med
// objekt-id i TC (översätts med visaren). Del 2: trädet i fliken Grupper – markera, fäll ut, kopiera till egen grupp.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9015;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const G = i => ('2' + String(i).padStart(21, 'A')).slice(0, 22); // giltigt utseende på IFC-id (22 tecken)

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    // ---- Del 1: hämtningen.
    const p1 = await (await browser.newContext()).newPage();
    await p1.goto(`http://localhost:${PORT}/tc-organizer.js`);
    await p1.addScriptTag({ url: `http://localhost:${PORT}/tc-organizer.js` });
    const r1 = await p1.evaluate(async ([g1, g2, g3]) => {
      const calls = [];
      const json = (d, s = 200) => ({ ok: s < 300, status: s, json: async () => d });
      const fetchFn = async (url, o) => {
        calls.push(url + (o && o.headers && o.headers.Authorization ? ' [auth]' : ''));
        if (url.endsWith('/regions')) return json([{ location: 'europe', orgApi: 'https://org-api.eu-west-1.connect.trimble.com/v1/' }]);
        if (url.includes('/forests/P1/trees?')) return json({ items: [{ id: 'T1', name: 'Etapper', type: 'tc' }, { id: 'T0', name: 'Gammal', deleted: true }] });
        if (url.includes('/forests/') && url.includes('/trees?')) return json({}, 404);
        if (url.includes('page=2')) return json({ items: [{ id: 'N3', name: 'Etapp 1/Räcke', links: ['tcm:MOD1:101', 'tcm:MOD1:102', 'konstig-länk'] }, { id: 'N4', name: 'Etapp 2', linksUrl: 'https://s3/links-n4' }] });
        if (url.includes('/trees/T1/nodes?')) return json({ items: [{ id: 'N1', name: 'Etapp 1', links: [] }, { id: 'N2', name: 'Etapp 1/Fundament', links: [`tcm:MOD1:${g1}`, `frn:entity:${g2}`] }], next: 'https://org-api.eu-west-1.connect.trimble.com/v1/forests/P1/trees/T1/nodes?page=2' });
        if (url.includes('page=2')) return json({ items: [{ id: 'N3', name: 'Etapp 1/Räcke', links: ['tcm:MOD1:101', 'tcm:MOD1:102', 'konstig-länk'] }, { id: 'N4', name: 'Etapp 2', linksUrl: 'https://s3/links-n4' }] });
        if (url === 'https://s3/links-n4') return json([`x:${g3}`]);
        return json({}, 404);
      };
      const viewer = { getModels: async () => [{ id: 'MOD1', versionId: 'V1' }], convertToObjectIds: async (m, ids) => ids.map(i => 'R' + String(i).padStart(21, 'x')) };
      const r = await tcOrganizerFetch('tok', { id: 'P1', location: 'europe' }, viewer, fetchFn);
      return { r, calls };
    }, [G(1), G(2), G(3)]);
    const t = r1.r.trees;
    const grp = id => t[0].groups.find(g => g.id === id);
    if (r1.r.forest !== 'P1' || t.length !== 1 || t[0].groups.length !== 4) fail('Träd och grupper: ' + JSON.stringify(r1.r).slice(0, 400));
    if (grp('N2').guids.join() !== [G(1), G(2)].join() || grp('N3').guids.length !== 2 || !/^R/.test(grp('N3').guids[0]) || grp('N4').guids.join() !== G(3)) fail('Länkarna → IFC-id: ' + JSON.stringify(t[0].groups));
    if (!r1.calls.some(c => c.includes('org-api.eu-west-1') && c.includes('[auth]')) || !r1.r.log.some(x => /kunde inte tolkas/.test(x) && /konstig/.test(x))) fail('Region, nyckel och logg: ' + JSON.stringify(r1));
    // URL-kodade länkar (Victor 2026-10-12: "frn:entity:0JmdHIIyk%2473aC9VINCuCq" = IFC-id med $).
    const enc = await p1.evaluate(() => [...tcOrgParseLinks(['frn:entity:0JmdHIIyk%2473aC9VINCuCq', 'frn:entity:%E0%A4'], new Set()).guids]);
    if (enc.join() !== '0JmdHIIyk$73aC9VINCuCq') fail('URL-kodade länkar: ' + JSON.stringify(enc));
    // Skriva till Organizer (Victor 2026-10-12): PATCH med add/remove, i delar om 500, länkar som frn:entity:<IFC-id>.
    const wr = await p1.evaluate(async () => {
      const calls = [];
      const fetchFn = async (url, o = {}) => { calls.push([o.method || 'GET', url, o.body ? JSON.parse(o.body) : null, o.headers && o.headers.Authorization]); return { ok: true, status: 200, json: async () => (o.method === 'PATCH' ? { count: 7 } : []) }; };
      const add = Array.from({ length: 501 }, (_, i) => 'G' + String(i).padStart(20, '0') + '$');
      const r = await tcOrganizerLinks('tok', { id: 'P1', location: 'europe' }, { forest: 'P1', tree: 'T1', node: 'N4', add, remove: ['0JmdHIIyk$73aC9VINCuCq'] }, fetchFn);
      const p = calls.filter(c => c[0] === 'PATCH');
      let err = null; try { await tcOrganizerLinks('tok', { id: 'P1', location: 'europe' }, { forest: 'P1', tree: 'T1', node: 'N4', add: ['x'] }, async () => ({ ok: false, status: 403, text: async () => 'nope', json: async () => ({}) })); } catch (e) { err = e.message; }
      return { r, n: p.length, url: p[0][1], first: p[0][2].add.length, frn: p[0][2].add[0], rem: p[2] && p[2][2], auth: p[0][3], err };
    });
    if (wr.n !== 3 || !/org-api\.eu-west-1\.connect\.trimble\.com\/v1\/forests\/P1\/trees\/T1\/nodes\/N4$/.test(wr.url) || wr.first !== 500 || wr.frn !== 'frn:entity:G00000000000000000000%24' || JSON.stringify(wr.rem) !== JSON.stringify({ remove: ['frn:entity:0JmdHIIyk%2473aC9VINCuCq'] }) || wr.auth !== 'Bearer tok' || wr.r.added !== 501 || wr.r.removed !== 1 || wr.r.count !== 7 || !/403/.test(wr.err || ''))
      fail('Skriva till Organizer: ' + JSON.stringify(wr));
    // Utan Organizer: tydligt fel med stegen.
    const r2 = await p1.evaluate(async () => { try { await tcOrganizerFetch('tok', { id: 'P9', location: 'europe' }, null, async () => ({ ok: false, status: 403, json: async () => ({}) })); return null; } catch (e) { return { m: e.message, log: e.log }; } });
    if (!r2 || !/Organizer/.test(r2.m) || !(r2.log.length >= 3)) fail('Fel med steg: ' + JSON.stringify(r2));
    console.log('OK: Organizer hämtas – region, forest, träd, sidor, länkar (IFC-id och objekt-id i TC), logg vid fel');

    // ---- Del 2: fliken Grupper.
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    const gh = new Map();
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async (tree) => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
      Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
      window.__oaw = []; askOpener = async (type, x) => { if (type === 'tcOrganizerLinks') { window.__oaw.push(x); return { added: (x.add || []).length }; } return type === 'tcOrganizer' ? tree : {}; };
      open3d();
    }, r1.r);
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3orgHtml === 'function', null, { timeout: 15000 });
    // En inläst modell med objekten (låtsad: IFC-id → objekt i modellen).
    await page.evaluate(([g1, g2, g3]) => {
      const fake = { id: 'm1', name: 'Bygg.ifc', visible: true };
      l3b.models.push(fake);
      const ents = new Map([g1, g2, g3].map((g, i) => [g, [{ mesh: { userData: { l3b: { ranges: [], hidden: new Set() } } }, ri: i, g }]]));
      window.__sel = null; l3pEnts = m => (m === fake ? ents : new Map()); l3bsSet = list => { window.__sel = list.map(e => e.g || e.ri); }; l3bs.sel = [];
    }, [G(1), G(2), G(3)]);
    await page.evaluate(() => l3PalTab('groups'));
    await page.waitForSelector('#v3OrgGet', { timeout: 5000 });
    await page.click('#v3OrgGet');
    await page.waitForSelector('[data-orgsel="N1"]', { timeout: 5000 });
    const txt = await page.textContent('.v3-org-sec');
    if (!/Etapper/.test(txt) || !/Etapp 1/.test(txt) || !/Etapp 2/.test(txt)) fail('Trädet: ' + txt);
    if ((await page.$$('[data-orgeye]')).length < 2) fail('Ögat ska finnas på Organizer-grupperna');
    // URL-kodade namn från Organizer avkodas (Victor 2026-10-12: "742%20-%20Bj%C3%A4lklag").
    const dec = await page.evaluate(() => { const t = l3orgTree({ id: 'TX', groups: [{ id: 'a', name: '742%20-%20Sikthall/742%20-%20Bj%C3%A4lklag%20%2F%20d%C3%B6rrar', guids: [] }, { id: 'b', name: 'Trasig%E0%A4', guids: [] }] }); const r = Array.isArray(t) ? t : t.roots; return JSON.stringify(r.map(n => [n.name, n.kids.map(k => k.name)])); });
    if (dec !== JSON.stringify([['742 - Sikthall', ['742 - Bjälklag / dörrar']], ['Trasig%E0%A4', []]])) fail('Avkodade namn: ' + dec);
    // Etapp 1 omfattar sina undergrupper: 2 objekt i modellen + 2 som inte är inlästa (från objekt-id).
    await page.click('[data-orgsel="N1"]');
    const sel = await page.evaluate(() => window.__sel);
    if (!sel || sel.length !== 2) fail('Markera Etapp 1 (med undergrupper): ' + JSON.stringify(sel));
    await page.click('[data-orgfold="N1"]');
    if (!(await page.isVisible('[data-orgsel="N2"]'))) fail('Etapp 1 ska gå att fälla ut');
    // Kopiera till en egen grupp.
    await page.click('[data-orgmore="N2"]'); await page.click('[data-orgcopy="N2"]');
    await page.waitForFunction(() => l3g.list.some(g => g.name === 'Fundament'), null, { timeout: 5000 });
    const cp = await page.evaluate(() => l3g.list.find(g => g.name === 'Fundament').guids.length);
    if (cp !== 2) fail('Kopierad grupp: ' + cp);
    // Egna objekt i Organizer-grupperna (Victor 2026-10-12): Lägg i grupp → Organizer, sparas i projektet, ✕ tar ur.
    const oa = await page.evaluate(async g3 => {
      l3bs.sel = [{ mesh: { userData: { l3b: { ranges: [{ guid: g3 }] } } }, ri: 0 }];
      const html = l3gSelHtml();
      await l3oaAddSel('N4');
      const n = l3orgFind('N4');
      l3PalTab('groups'); l3orgRender();
      const row = document.querySelector('[data-orgsel="N4"]').closest('.v3-gr-h').textContent;
      const r = { opt: /value="org:N4"/.test(html) && /<optgroup label="Etapper \(Organizer\)">/.test(html), list: l3oa.list.map(x => [x.node, x.guids]), own: n.own.includes(g3), plus: /\+1/.test(row), chip: /data-oaout="N4"/.test(l3gSelHtml()) };
      r.synced = (l3oa.list[0] || {}).synced; r.sent = JSON.stringify(window.__oaw);
      await l3oaRemoveSel('N4'); r.after = l3oa.list.length; r.sent2 = JSON.stringify(window.__oaw.slice(1)); l3bs.sel = [];
      return r;
    }, G(3));
    if (!oa.opt || JSON.stringify(oa.list) !== JSON.stringify([['N4', [G(3)]]]) || !oa.own || !oa.plus || !oa.chip || oa.after !== 0 || JSON.stringify(oa.synced) !== JSON.stringify([G(3)]) || oa.sent !== JSON.stringify([{ forest: 'P1', tree: 'T1', node: 'N4', add: [G(3)] }]) || oa.sent2 !== JSON.stringify([{ forest: 'P1', tree: 'T1', node: 'N4', remove: [G(3)] }])) fail('Lägg i Organizer-grupp (och skriv till TC): ' + JSON.stringify(oa));
    // Sparad i webbläsaren – finns kvar utan kontakt med TC.
    const kept = await page.evaluate(() => { l3org.data = null; l3org.loaded = false; l3orgRestore(); return l3org.data && l3org.data.trees.length; });
    if (kept !== 1) fail('Senaste hämtningen ska finnas kvar i webbläsaren');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: Organizer i fliken Grupper – träd, markera med undergrupper, fäll ut, kopiera till egen grupp, sparad');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
