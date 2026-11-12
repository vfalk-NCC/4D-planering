const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9094;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1200);
    const spec = () => { const s = { ...L3SW_DEF, kind: 'berlin' }; l3swpInit(s, true); s.p_cc = 2.5; return s; };
    const lag = r => (r.parts.find(p => /utfackning/.test(p.name)) || { vol: 0 }).vol;
    const a = l3swpBuild([[0, 0, 10], [20, 0, 10]], spec()), b = l3swpBuild([[0, 0, 10], [10, 0, 10], [20, 0, 10]], spec()), c = l3swpBuild([[0, 0, 10], [10, 0, 10], [10, 10, 10]], spec());
    out.straight = Math.round(lag(a) * 1000) / 1000; out.vertex = Math.round(lag(b) * 1000) / 1000; out.bend = Math.round(lag(c) * 1000) / 1000;
    out.noGap = Math.abs(lag(a) - lag(b)) / lag(a) < 0.03 && lag(c) > lag(a) * 0.85;
    out.dbg = [a.err, Object.keys(a).join(), (a.pos||[]).length]; out.pos = (a.pos||[]).length === 9 && a.pos[0].length === 6 && a.pos[0][2] === 10;
    const P = l3swpParseXYZ('168973.693 7456741.27 430.5\nP2;168975,2;7456741,3;430,5\n1 168976 7456742 431\n\nfel rad'); out.parse = P.pts.length === 3 && P.pts[1][0] === 168975.2 && P.pts[1][2] === 430.5 && P.pts[2][0] === 168976 && P.bad.length === 1;
    // klistra in: skapar pålar i koordinaterna
    l3SetPref('measure', 'wall'); l3SetTool('measure'); await w(200); out.entry = !!document.getElementById('v3SwPaste'); l3swpPaste(); const ta = document.getElementById('v3SwpTa'); ta.value = '6512330 150130 100\n6512332.5 150130 100\n6512335 150130.5 99.8'; ta.dispatchEvent(new Event('input')); await w(100);
    out.sum = document.getElementById('v3SwpSum').textContent; document.querySelector('#v3SwpPaste [data-go]').click(); await w(500);
    const cur = l3sw.cur; out.dbg2 = cur ? [cur.spec.kind, cur.spec.coords, cur.pts.length, cur.res && cur.res.err, cur.res && (cur.res.pos || []).length] : null; out.cur = !!cur && cur.spec.coords === true && cur.pts.length === 3 && !!cur.res && cur.res.pos.length === 3 && cur.res.parts.length >= 1 && cur.res.parts[0].vol > 0;
    if (!out.cur) return out;
    out.xy = cur && Math.abs(cur.res.pos[1][0] - 6512332.5) < 1e-6 && cur.res.pos[2][2] === 99.8;
    out.acts = !!document.querySelector('#v3WallPanel [data-swpt]') && !!document.querySelector('#v3WallPanel [data-swpp]');
    document.querySelector('#v3WallPanel [data-swpt]').click(); await w(300); out.tbl = document.querySelectorAll('#v3SwpTbl tbody tr').length === 3;
    { const inp = document.querySelector('#v3SwpTbl tbody tr:nth-child(2) input[data-k="0"]'); out.tEdit = !!inp && document.querySelectorAll('#v3SwpTbl thead th').length === 8; inp.value = '6512333.5'; inp.dispatchEvent(new Event('change', { bubbles: true })); await w(100);
      out.tX = Math.abs(l3sw.cur.pts[1][0] - 6512333.5) < 1e-6 && Math.abs(l3sw.cur.res.pos[1][0] - 6512333.5) < 1e-6;
      const len = document.querySelector('#v3SwpTbl tbody tr:nth-child(3) input[data-k="L"]'); len.value = '9.5'; len.dispatchEvent(new Event('change', { bubbles: true })); await w(100); { const q = l3sw.cur.res.pos[2]; out.tLen = Math.abs(q[2] - q[3] - 9.5) < 1e-6; }
      const ok = document.querySelector('#v3SwpTbl tbody tr:nth-child(3) input[data-k="2"]'); ok.value = '+432,000'; ok.dispatchEvent(new Event('change', { bubbles: true })); await w(100); { const q = l3sw.cur.res.pos[2]; out.tOk = q[2] === 432 && Math.abs(q[2] - q[3] - 9.5) < 1e-6; }
      const sl = document.querySelector('#v3SwpTbl tbody tr:nth-child(1) input[data-k="s"]'); sl.value = '10'; sl.dispatchEvent(new Event('change', { bubbles: true })); await w(100); out.tSl = l3sw.cur.res.pos[0][4] === 10;
      const nmI = document.querySelector('#v3SwpTbl tbody tr:nth-child(1) input[data-k="n"]'); nmI.value = 'P7'; nmI.dispatchEvent(new Event('change', { bubbles: true })); await w(100); out.tNm = document.querySelector('#v3SwpTbl tbody tr:nth-child(1) input[data-k="n"]').value === 'P7';
      // modellen -> tabellen
      l3sw.cur.pts[1][0] = 6512334; l3swDraw(); await w(50); out.tSync = document.querySelector('#v3SwpTbl tbody tr:nth-child(2) input[data-k="0"]').value === '6512334.000';
      document.querySelector('#v3SwpTbl [data-tadd]').click(); await w(100); out.tAdd = l3sw.cur.pts.length === 4 && document.querySelectorAll('#v3SwpTbl tbody tr').length === 4;
      document.querySelector('#v3SwpTbl tbody tr:nth-child(1) [data-del]').click(); await w(100); out.tDel = l3sw.cur.pts.length === 3 && document.querySelectorAll('#v3SwpTbl tbody tr').length === 3;
      // pållista klistras in rakt av
      const P2 = l3swpParseXYZ('LITTERA\tPÅLTYP\tX (m)\tY (m)\tLUTNING (X:1)\tÖK PÅLE (m)\tANTAGEN PÅLLÄNGD (m)\nP1001\tRD 220/12.5\t169184.257\t7456585.734\t0\t+432.000\t9.000\nP1004 RD 220/12.5 169186.310 7456583.547 0 +432.000 9.500');
      out.pl = P2.pts.length === 2 && P2.bad.length === 0 && P2.pts[0].name === 'P1001' && P2.pts[0].type === 'RD 220/12.5' && P2.pts[1].len === 9.5 && P2.pts[1][2] === 432 && P2.pts[1][0] === 169186.31;
      l3DlgClose('v3SwpTbl'); l3swpPaste(); const ta2 = document.getElementById('v3SwpTa'); ta2.value = 'P1001 RD 220/12.5 169184.257 7456585.734 0 +432.000 9.000\nP1002 RD 220/12.5 169184.941 7456585.005 0 +432.000 9.000\nP1003 RD 220/12.5 169185.546 7456584.361 0 +432.000 9.000'; ta2.dispatchEvent(new Event('input')); document.querySelector('#v3SwpPaste [data-go]').click(); await w(400);
      { const c2 = l3sw.cur; out.pasteList = c2.pts.length === 3 && Math.abs(c2.spec.p_D - 0.22) < 1e-9 && Math.abs(c2.spec.p_tt - 0.0125) < 1e-9 && Math.abs(c2.res.pos[0][2] - c2.res.pos[0][3] - 9) < 1e-6 && c2.res.pos[0][5] === 'P1001';
        document.querySelector('#v3WallPanel [data-swpt]').click(); await w(200); out.lbl = document.querySelector('#v3SwpTbl tbody tr td.ty').textContent === 'RD 220/12.5'; } }

    { const x0 = cur.pts[0][0], z0 = cur.pts[0][2]; out.wGz = !!l3.gizmoT && !!l3.gizmoT.object; if (out.wGz) { const g = l3.gizmoT.object; g.position.set(g.position.x + 3, g.position.y, g.position.z + 1.5); l3.gizmoT.dispatchEvent({ type: 'objectChange' }); }
      out.wMoved = Math.abs(l3sw.cur.pts[0][0] - (x0 + 3)) < 1e-6 && Math.abs(l3sw.cur.pts[0][2] - (z0 + 1.5)) < 1e-6; out.wRes = !!l3sw.cur.res && l3sw.cur.res.pos && Math.abs(l3sw.cur.res.pos[0][0] - (x0 + 3)) < 1e-6; }
    {
        // skapa, välj, redigera igen
        const nOld = placements.length; l3swMake(); await w(300); const made = placements.filter(q => q.wsrc); out.made = made.length >= 2 && nOld + made.length === placements.length; const set0 = made[0].set;
        l3SelectIds([made[0].id]); await w(400); const eb = document.querySelector('#v3Side [data-swedit]'); out.eBtn = !!eb; eb.click(); await w(400);
        out.eOpen = !!l3sw.cur && l3sw.cur.editSet === set0 && l3sw.cur.pts.length === 3 && l3sw.cur.spec.kind === 'tube' && l3.placeMeshes.get(made[0].id).visible === false && !l3SelList().length && document.querySelector('#v3WallPanel [data-wb="make"]').textContent === 'Uppdatera';
        if (!l3sw.cur) return out;
        l3sw.cur.pts[0][0] += 1; l3swDraw(); l3swMake(); await w(300); const again = placements.filter(q => q.set === set0 && q.wsrc); out.dbgU = [again.length, made.length, placements.length, nOld, made.some(m => placements.includes(m)), again[0] && again[0].wsrc.pts[0][0], made[0].wsrc.pts[0][0]]; out.eUpd = again.length === made.length && placements.length === nOld + made.length && !made.some(m => placements.includes(m)) && Math.abs(again[0].wsrc.pts[0][0] - made[0].wsrc.pts[0][0] - 1) < 2e-3;
        l3SelectIds([again[0].id]); await w(300); document.querySelector('#v3Side [data-swedit]').click(); await w(300); const hid = l3sw.cur.hidden.slice(); l3swClose(); out.eCancel = hid.every(id => l3.placeMeshes.get(id).visible !== false) && l3SelList().length > 0;
    }
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 400)); process.exit(1); }
  if (!r.noGap || !r.pos || !r.parse || !r.entry || !/3 pålar/.test(r.sum) || !r.cur || !r.xy || !r.acts || !r.tbl || !r.tEdit || !r.tX || !r.tLen || !r.tOk || !r.tSl || !r.tNm || !r.tSync || !r.tAdd || !r.tDel || !r.pl || !r.pasteList || !r.lbl || !r.made || !r.eBtn || !r.eOpen || !r.eUpd || !r.eCancel || !r.wGz || !r.wMoved || !r.wRes) { console.error('FAIL Pålkoordinater: ' + JSON.stringify(r)); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: utfackningen faller inte bort vid brytpunkter, tabell X Y Z och pålar i inklistrade koordinater');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
