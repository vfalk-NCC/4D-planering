/* Funktioner: punktmoln, mått, mängdning, kollisionskontroll, tidplan (4D) och Trimble Connect via 4D-planering. */
import { $, S, A, R, ic, hydrate, esc, nice, classIcon, palette, hsl2rgb, categoryOf, fmtN, fmtD, outJson, outText, callStr, f32, u8, withBytes, busy, toast, tick, store, dialog, on, emit, redraw } from './core.js';
import { V, gl, G, refreshFlags, fitSel, fitAll, fitBox, boxOf, animateTo, camState, setVisible, canvas } from './view.js';
import { UI, renderRight, renderLeftModel } from './panels.js';

const mem = () => R.E.memory.buffer;
const leftBody = () => $('lBody');

/* =========================================================
   Punktmoln och avvikelse
   ========================================================= */
A.loadCloud = async (buf, name) => {
  busy('Rust läser punktmoln …'); await tick(); const E = R.E, t0 = performance.now(), max = store.get('cmax', 1000000);
  const rc = callStr((np, nn) => withBytes(new Uint8Array(buf), (p, n) => E.cloud_load(p, n, np, nn, max)), name);
  if (rc !== 0) { busy(''); toast(outText(-rc), 7000); return; }
  const n = E.cloud_count(), info = outJson(E.cloud_info()); const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, f32(E.cloud_pos_ptr(), n * 3), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, u8(E.cloud_col_ptr(), n * 4), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0); gl.bindVertexArray(null);
  if (S.cloud) { gl.deleteVertexArray(S.cloud.vao); gl.deleteBuffer(S.cloud.b1); gl.deleteBuffer(S.cloud.b2); }
  S.cloud = { vao, b1, b2, n, show: true, info, name, ms: performance.now() - t0, mode: 0 };
  if (!S.loaded) { S.origin = [E.origin(0), E.origin(1), E.origin(2)]; S.sum = { bbox: info.bbox }; S.radius = Math.hypot(info.bbox[3] - info.bbox[0], info.bbox[4] - info.bbox[1]) / 2; $('empty').hidden = true; fitBox(info.bbox.slice(0, 3), info.bbox.slice(3), V.vps[0], 0); }
  busy(''); redraw(); UI.leftTab = 'filter'; if (S.tab === 'model') renderLeftModel(); toast(`${n.toLocaleString('sv')} punkter visas`);
};
A.cloudCard = host => {
  const c = S.cloud, d = document.createElement('div'); d.className = 'card';
  d.innerHTML = `<h4>Punktmoln</h4><p class="muted">XYZ/CSV, PLY och LAS. Glesas ut av Rust så att vyn förblir smidig.</p><div class="row"><button class="btn sm" id="cOpen">${ic('folder')} Öppna punktmoln…</button><button class="btn sm ghost" id="cDemo">Skapa exempel</button></div>
  <label class="fld">Max antal punkter<select id="cMax">${[500000, 1000000, 2000000, 4000000].map(v => `<option value="${v}" ${v === store.get('cmax', 1000000) ? 'selected' : ''}>${(v / 1e6).toLocaleString('sv')} milj.</option>`).join('')}</select></label>
  ${c ? `<div class="muted">${c.n.toLocaleString('sv')} punkter${c.info.total > c.n ? ' av ' + c.info.total.toLocaleString('sv') : ''}${c.info.rgb ? ' · med färg' : ''}</div><label class="fld">Punktstorlek <b id="cSizeV">${S.cloudSize}</b> px<input id="cSize" type="range" min="1" max="8" step="0.5" value="${S.cloudSize}"></label>
  <div class="seg" id="cMode"><button data-m="0" class="${c.mode === 0 ? 'on' : ''}">Original</button><button data-m="1" class="${c.mode === 1 ? 'on' : ''}">Höjd</button><button data-m="2" class="${c.mode === 2 ? 'on' : ''}">Avvikelse</button></div>
  <label class="chk"><input type="checkbox" id="cShow" ${c.show ? 'checked' : ''}> Visa punktmolnet</label>
  <div class="card" style="margin-top:10px"><h4>Avvikelse mot modellen</h4><div class="two"><label class="fld">Tolerans (mm)<input id="devTol" type="number" value="${store.get('devTol', 20)}" min="1"></label><label class="fld">Sök upp till (m)<input id="devMax" type="number" value="${store.get('devMax', 1)}" min="0.05" step="0.05"></label></div><button class="btn primary wide" id="btnDev">Beräkna avvikelse</button><div id="devOut">${c.devHtml || ''}</div></div>` : ''}`;
  host.append(d);
  d.querySelector('#cOpen').onclick = () => { $('file').accept = '.xyz,.txt,.csv,.ply,.las'; $('file').click(); }; d.querySelector('#cMax').onchange = e => store.set('cmax', +e.target.value);
  d.querySelector('#cDemo').onclick = async () => { if (!S.loaded) return toast('Öppna en modell först'); const b = S.sum.bbox, o = S.origin; let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, out = [];
    for (let i = 0; i < 120000; i++) { const x = b[0] + rnd() * (b[3] - b[0]), y = b[1] + rnd() * (b[4] - b[1]); let z = 0.3 + (rnd() - 0.5) * 0.016 + o[2]; if (x > 20 && x < 24 && y > 5 && y < 9) z += 0.07; out.push(`${(x + o[0]).toFixed(3)} ${(y + o[1]).toFixed(3)} ${z.toFixed(3)}`); } await A.loadCloud(new TextEncoder().encode(out.join('\n')), 'exempel.xyz'); };
  if (!c) return;
  d.querySelector('#cSize').oninput = e => { S.cloudSize = +e.target.value; d.querySelector('#cSizeV').textContent = e.target.value; redraw(); }; d.querySelector('#cShow').onchange = e => { c.show = e.target.checked; redraw(); };
  const recolor = m => { c.mode = m; R.E.cloud_recolor(m, +(d.querySelector('#devTol').value) / 1000); gl.bindBuffer(gl.ARRAY_BUFFER, c.b2); gl.bufferSubData(gl.ARRAY_BUFFER, 0, u8(R.E.cloud_col_ptr(), c.n * 4)); redraw(); };
  d.querySelector('#cMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; const m = +b.dataset.m; if (m === 2 && !c.devHtml) return toast('Beräkna avvikelsen först'); [...d.querySelector('#cMode').children].forEach(x => x.classList.toggle('on', x === b)); recolor(m); };
  d.querySelector('#btnDev').onclick = async () => {
    if (!S.loaded) return toast('Öppna en modell först'); busy('Rust beräknar avvikelse …'); await tick(); const t0 = performance.now(), tolMm = +d.querySelector('#devTol').value, md = +d.querySelector('#devMax').value; store.set('devTol', tolMm); store.set('devMax', md);
    const j = outJson(R.E.cloud_deviation(md, tolMm / 1000)); busy(''); if (j.error) return toast(j.error); gl.bindBuffer(gl.ARRAY_BUFFER, c.b2); gl.bufferSubData(gl.ARRAY_BUFFER, 0, u8(R.E.cloud_col_ptr(), c.n * 4)); c.mode = 2; S.devStats = j;
    const mm = v => (v * 1000).toFixed(1).replace('.', ',') + ' mm';
    c.devHtml = `<div class="bar"><i style="width:${j.withinTolPct}%"></i></div><div class="stat"><span>Inom ${tolMm} mm</span><b>${j.withinTolPct.toFixed(1).replace('.', ',')} %</b><span>Medel</span><b>${mm(j.mean)}</b><span>RMS</span><b>${mm(j.rms)}</b><span>95:e percentilen</span><b>${mm(j.p95)}</b><span>Största</span><b>${mm(j.max)}</b><span>Utanför ${md} m</span><b>${j.beyond.toLocaleString('sv')}</b></div><div class="legend"></div><div class="leg"><span>0</span><span>${tolMm} mm</span><span>${2 * tolMm}</span><span>${4 * tolMm}+</span></div><div class="muted" style="margin-top:6px">${j.evaluated.toLocaleString('sv')} punkter på ${(performance.now() - t0).toFixed(0)} ms</div>`;
    redraw(); renderLeftModel();
  };
};

/* =========================================================
   Mått (lista i högerpanelen)
   ========================================================= */
A.measuresPanel = R2 => {
  R2.innerHTML = `<div class="ocard"><div class="ob">${ic('ruler')}</div><div><h3>Mått</h3><small>${S.measures.length} mått</small></div></div><p class="muted">Klicka två punkter i modellen. Fäster mot hörn och kanter.</p><div id="mlist"></div>${S.measures.length ? `<button class="btn ghost wide" id="mClear">Rensa alla</button>` : ''}`;
  const L = R2.querySelector('#mlist'); S.measures.forEach((m, i) => { const e = document.createElement('div'); e.className = 'm-it'; e.innerHTML = `<div><b>${fmtD(m.d)}</b><small>ΔX ${fmtN(m.dx, 3)} · ΔY ${fmtN(m.dy, 3)} · ΔZ ${fmtN(m.dz, 3)} m</small></div><button class="x" title="Ta bort">${ic('close')}</button>`; e.querySelector('.x').onclick = () => A.removeMeasure(i); L.append(e); });
  const c = R2.querySelector('#mClear'); if (c) c.onclick = () => { const l = S.measures.slice(); S.measures = []; emit('measures'); };
};
A.renderMeasures = () => { if (S.tool === 'measure') renderRight(); };
on('tool', () => { });

/* =========================================================
   Mängdning
   ========================================================= */
const qState = { by: 'class', only: 'all' };
A.renderQty = () => {
  const L = leftBody(); if (!S.loaded) { L.innerHTML = '<div class="hint">Öppna en modell för att mängda.</div>'; return; }
  const q = UI.cache.get('qty') || []; const open = q.filter(x => !x[2]).length;
  L.innerHTML = `<div class="row" style="margin-top:0"><div class="seg" id="qBy"><button data-b="class" class="${qState.by === 'class' ? 'on' : ''}">Klass</button><button data-b="cont" class="${qState.by === 'cont' ? 'on' : ''}">Våning</button><button data-b="cat" class="${qState.by === 'cat' ? 'on' : ''}">Kategori</button></div>
  <div class="seg" id="qOnly"><button data-o="all" class="${qState.only === 'all' ? 'on' : ''}">Allt</button><button data-o="vis" class="${qState.only === 'vis' ? 'on' : ''}">Synligt</button><button data-o="sel" class="${qState.only === 'sel' ? 'on' : ''}">Markerat</button></div></div><div id="qTable"></div>
  <div class="row"><button class="btn sm" id="qCsv">${ic('download')} Exportera CSV</button></div><div class="muted">Mängderna räknas ur modellens geometri. Volymen är exakt för slutna objekt${open ? ` – ${open} objekt har öppna nät och räknas ungefärligt` : ''}.</div>`;
  L.querySelector('#qBy').onclick = e => { const b = e.target.closest('button'); if (b) { qState.by = b.dataset.b; A.renderQty(); } }; L.querySelector('#qOnly').onclick = e => { const b = e.target.closest('button'); if (b) { qState.only = b.dataset.o; A.renderQty(); } };
  const ok = oi => qState.only === 'all' || (qState.only === 'vis' ? S.shown[oi] : S.sel.has(oi));
  const key = oi => qState.by === 'class' ? [S.objClass[oi], nice(S.classes[S.objClass[oi]])] : qState.by === 'cont' ? [S.objCont[oi], S.conts[S.objCont[oi]][0]] : (() => { const c = categoryOf(S.classes[S.objClass[oi]]); return [c, c]; })();
  const g = new Map(); let tot = { n: 0, a: 0, v: 0 }; for (let i = 0; i < S.nObj; i++) { if (!ok(i)) continue; const [k, lab] = key(i), r = g.get(k) || g.set(k, { lab, ids: [], n: 0, a: 0, v: 0 }).get(k); r.ids.push(i); r.n++; r.a += q[i] ? q[i][0] : 0; r.v += q[i] ? q[i][1] : 0; tot.n++; tot.a += q[i] ? q[i][0] : 0; tot.v += q[i] ? q[i][1] : 0; }
  const rows = [...g.values()].sort((a, b) => b.v - a.v); const T = L.querySelector('#qTable');
  T.innerHTML = `<table class="qt"><tr><th>${qState.by === 'class' ? 'Objekttyp' : qState.by === 'cont' ? 'Våning' : 'Kategori'}</th><th>Antal</th><th>Yta m²</th><th>Volym m³</th></tr>${rows.map((r, i) => `<tr class="r" data-i="${i}"><td>${esc(r.lab)}</td><td>${r.n}</td><td>${fmtN(r.a)}</td><td>${fmtN(r.v, 3)}</td></tr>`).join('')}<tr class="t"><td>Summa</td><td>${tot.n}</td><td>${fmtN(tot.a)}</td><td>${fmtN(tot.v, 3)}</td></tr></table>`;
  T.querySelectorAll('tr.r').forEach(tr => tr.onclick = () => { A.selectMany(rows[+tr.dataset.i].ids); fitSel(); });
  L.querySelector('#qCsv').onclick = () => { const csv = ['Grupp;Antal;Yta m2;Volym m3', ...rows.map(r => [r.lab, r.n, r.a.toFixed(3), r.v.toFixed(4)].join(';')), ['Summa', tot.n, tot.a.toFixed(3), tot.v.toFixed(4)].join(';')].join('\n').replace(/\./g, ','); A.download(new Blob(['﻿' + csv], { type: 'text/csv' }), (S.fileName || 'modell').replace(/\.ifc$/i, '') + ' mängder.csv'); };
};
on('select', () => { if (S.tab === 'qty' && qState.only === 'sel') A.renderQty(); });
on('visibility', () => { if (S.tab === 'qty' && qState.only === 'vis') A.renderQty(); });

/* =========================================================
   Kollisionskontroll
   ========================================================= */
const CL = { list: [], cur: -1, A: 'all', B: 'same', depthMm: 5, ran: false, st: {} };
const csKey = c => S.objGuid[c.a] + '|' + S.objGuid[c.b];
const STAT = ['Ny', 'Granskas', 'Löst']; const badge = s => ({ Ny: 'b-new', Granskas: 'b-rev', Löst: 'b-ok' }[s] || 'b-plan');
function groupOpts(withSame) {
  const o = [`<option value="all">Alla synliga objekt</option>`, `<option value="sel">Markerade objekt</option>`]; if (withSame) o.unshift('<option value="same">Samma grupp som A</option>');
  const cls = new Set(), conts = new Set(); for (let i = 0; i < S.nObj; i++) { cls.add(S.objClass[i]); conts.add(S.objCont[i]); }
  [...cls].sort((a, b) => nice(S.classes[a]).localeCompare(nice(S.classes[b]), 'sv')).forEach(c => o.push(`<option value="c:${c}">Klass: ${esc(nice(S.classes[c]))}</option>`)); [...conts].sort((a, b) => S.conts[a][0].localeCompare(S.conts[b][0], 'sv', { numeric: true })).forEach(c => o.push(`<option value="k:${c}">Våning: ${esc(S.conts[c][0])}</option>`)); return o.join('');
}
function members(sel) { const out = []; for (let i = 0; i < S.nObj; i++) { if (!S.shown[i]) continue; if (sel === 'all' || (sel === 'sel' && S.sel.has(i)) || (sel.startsWith('c:') && S.objClass[i] === +sel.slice(2)) || (sel.startsWith('k:') && S.objCont[i] === +sel.slice(2))) out.push(i); } return out; }
A.renderClash = () => {
  const L = leftBody(); if (!S.loaded) { L.innerHTML = '<div class="hint">Öppna en modell för att köra kollisionskontroll.</div>'; return; }
  CL.st = store.get('cl:' + S.fileKey, {});
  L.innerHTML = `<div class="card"><h4>Kontroll</h4><label class="fld">Grupp A<select id="clA">${groupOpts(false)}</select></label><label class="fld">Grupp B<select id="clB">${groupOpts(true)}</select></label>
  <label class="fld">Minsta överlapp (mm)<input id="clD" type="number" min="0" value="${CL.depthMm}"></label><button class="btn primary wide" id="clRun">${ic('warn')} Kör kollisionskontroll</button></div><div id="clRes"></div>`;
  L.querySelector('#clA').value = CL.A; L.querySelector('#clB').value = CL.B; renderClashList();
  L.querySelector('#clRun').onclick = async () => { CL.A = L.querySelector('#clA').value; CL.B = L.querySelector('#clB').value; CL.depthMm = +L.querySelector('#clD').value || 0; await runClash(); };
};
async function runClash() {
  busy('Rust söker kollisioner …'); await tick(); const t0 = performance.now(); const a = members(CL.A), b = CL.B === 'same' ? a : members(CL.B);
  const ba = new Uint32Array(a).buffer, bb = new Uint32Array(b).buffer; const E = R.E; const r = withBytes(new Uint8Array(ba), (pa, na) => withBytes(new Uint8Array(bb), (pb, nb) => E.model_clash(pa, na / 4, pb, nb / 4, CL.depthMm / 1000)));
  const raw = JSON.parse(outText(r)); busy(''); CL.list = raw.map(([x, y, px, py, pz, d]) => ({ a: x, b: y, p: [px, py, pz], depth: d })); CL.cur = -1; CL.ran = true; CL.ms = performance.now() - t0; CL.nA = a.length; CL.nB = b.length;
  CL.list.forEach(c => { const s = CL.st[csKey(c)]; c.status = s ? s.status : 'Ny'; c.owner = s ? s.owner : ''; c.note = s ? s.note : ''; }); applyClashView(); renderClashList(); toast(`${CL.list.length} kollisioner hittades`);
}
function saveClashState() { const o = {}; CL.list.forEach(c => { if (c.status !== 'Ny' || c.owner || c.note) o[csKey(c)] = { status: c.status, owner: c.owner, note: c.note }; }); store.set('cl:' + S.fileKey, { ...CL.st, ...o }); }
function applyClashView() {
  S.override.clear(); const inv = new Set(); CL.list.forEach(c => { if (c.status === 'Löst') return; inv.add(c.a); inv.add(c.b); S.override.set(c.a, [239, 68, 68]); S.override.set(c.b, [249, 115, 22]); });
  S.ghostAll = new Set(); for (let i = 0; i < S.nObj; i++) if (!inv.has(i)) S.ghostAll.add(i); S.clashMarks = CL.list.filter(c => c.status !== 'Löst').map((c, i) => ({ p: c.p, on: CL.list.indexOf(c) === CL.cur })); refreshFlags();
}
function renderClashList() {
  const host = $('clRes'); if (!host) return; if (!CL.ran) { host.innerHTML = '<div class="hint">Välj grupper och kör kontrollen. Övriga objekt tonas ned och problemobjekten markeras.</div>'; return; }
  const open = CL.list.filter(c => c.status !== 'Löst').length;
  host.innerHTML = `<div class="sec" style="margin-top:4px"><span>${CL.list.length} kollisioner</span><small class="muted">${open} olösta · ${CL.ms.toFixed(0)} ms</small></div>` + (CL.list.length ? CL.list.map((c, i) => `<div class="cl-it ${i === CL.cur ? 'on' : ''}" data-i="${i}"><span class="badge ${badge(c.status)}">${esc(c.status)}</span><div style="flex:1;min-width:0"><b style="font-size:13px">${esc(S.objName[c.a] || nice(S.classes[S.objClass[c.a]]))} ↔ ${esc(S.objName[c.b] || nice(S.classes[S.objClass[c.b]]))}</b><small>Överlapp ${(c.depth * 1000).toFixed(0)} mm · ${esc(S.conts[S.objCont[c.a]][0])}</small></div></div>`).join('') + `<div class="row"><button class="btn sm" id="clCsv">${ic('download')} Exportera CSV</button><button class="btn sm ghost" id="clClear">Rensa</button></div>` : '<div class="hint">Inga kollisioner med de här inställningarna.</div>');
  host.querySelectorAll('.cl-it').forEach(e => e.onclick = () => selectClash(+e.dataset.i));
  const csv = host.querySelector('#clCsv'); if (csv) csv.onclick = () => { const rows = ['Nr;Status;Ansvarig;Objekt A;Klass A;Objekt B;Klass B;Överlapp mm;Våning;X;Y;Z;Kommentar', ...CL.list.map((c, i) => [i + 1, c.status, c.owner, S.objName[c.a], nice(S.classes[S.objClass[c.a]]), S.objName[c.b], nice(S.classes[S.objClass[c.b]]), (c.depth * 1000).toFixed(0), S.conts[S.objCont[c.a]][0], ...c.p.map((v, k) => (v + S.origin[k]).toFixed(3)), (c.note || '').replace(/;/g, ',')].join(';'))]; A.download(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv' }), 'kollisioner.csv'); };
  const clr = host.querySelector('#clClear'); if (clr) clr.onclick = () => { CL.list = []; CL.ran = false; A.clashOff(); renderClashList(); };
}
function selectClash(i) { CL.cur = i; const c = CL.list[i]; S.sel = new Set([c.a, c.b]); applyClashView(); const b1 = boxOf.get(c.a) || (boxOf.set(c.a, outJson(R.E.model_object(c.a)).bbox), boxOf.get(c.a)), b2 = boxOf.get(c.b) || (boxOf.set(c.b, outJson(R.E.model_object(c.b)).bbox), boxOf.get(c.b)); fitBox([Math.min(b1[0], b2[0]), Math.min(b1[1], b2[1]), Math.min(b1[2], b2[2])], [Math.max(b1[3], b2[3]), Math.max(b1[4], b2[4]), Math.max(b1[5], b2[5])], V.vps[0], 500); refreshFlags(); renderClashList(); renderRight(); $('app').classList.remove('noright'); setTimeout(() => window.dispatchEvent(new Event('resize')), 240); }
A.clashRight = R2 => {
  if (CL.cur < 0 || !CL.list[CL.cur]) { R2.innerHTML = '<div class="hint">Välj en kollision i listan.</div>'; return true; } const c = CL.list[CL.cur], nm = o => S.objName[o] || nice(S.classes[S.objClass[o]]);
  R2.innerHTML = `<div class="ocard"><div class="ob" style="color:#dc2626">${ic('warn')}</div><div><h3>Kollision ${CL.cur + 1}</h3><small>${(c.depth * 1000).toFixed(0)} mm överlapp</small></div></div>
  <div class="kv"><label>Objekt A</label><div class="val"><span class="dot" style="background:#ef4444"></span>${esc(nm(c.a))}</div></div><div class="kv"><label>Klass</label><div class="val">${esc(nice(S.classes[S.objClass[c.a]]))}</div></div><div class="kv"><label>Objekt B</label><div class="val"><span class="dot" style="background:#f97316"></span>${esc(nm(c.b))}</div></div><div class="kv"><label>Klass</label><div class="val">${esc(nice(S.classes[S.objClass[c.b]]))}</div></div><div class="kv"><label>Våning</label><div class="val">${esc(S.conts[S.objCont[c.a]][0])}</div></div><div class="kv"><label>Läge Z</label><div class="val">${fmtN(c.p[2] + S.origin[2])} m</div></div>
  <label class="fld">Status<select id="cStat">${STAT.map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="fld">Ansvarig<input id="cOwn" type="text" value="${esc(c.owner)}" placeholder="Namn eller företag"></label><label class="fld">Kommentar<textarea id="cNote" placeholder="Åtgärd, ritning, beslut …">${esc(c.note)}</textarea></label>
  <div class="row"><button class="btn sm" id="cFoc">${ic('focus')} Visa</button><button class="btn sm" id="cNext">Nästa ›</button></div>`;
  const upd = () => { c.status = R2.querySelector('#cStat').value; c.owner = R2.querySelector('#cOwn').value; c.note = R2.querySelector('#cNote').value; CL.st[csKey(c)] = { status: c.status, owner: c.owner, note: c.note }; store.set('cl:' + S.fileKey, CL.st); applyClashView(); renderClashList(); };
  R2.querySelector('#cStat').onchange = upd; R2.querySelector('#cOwn').onchange = upd; R2.querySelector('#cNote').onchange = upd; R2.querySelector('#cFoc').onclick = () => selectClash(CL.cur); R2.querySelector('#cNext').onclick = () => selectClash((CL.cur + 1) % CL.list.length); hydrate(R2); void saveClashState; return true;
};
A.clashOff = () => { S.override.clear(); S.ghostAll = null; S.clashMarks = []; if (S.loaded) refreshFlags(); };
A.clashesFor = oi => CL.list.filter(c => c.a === oi || c.b === oi).length;

/* =========================================================
   Brygga till 4D-planering (Trimble Connect, tidplan)
   ========================================================= */
let bridgeSeq = 0; const bridgeWait = new Map(), bridgeProg = new Map();
function bridgeWin() {
  try { const op = window.opener; if (!op || op.closed) return null; if (typeof op.lagesplanHandle === 'function') return op; if (typeof op.bridgeWin === 'function') { const m = op.bridgeWin(); if (m && !m.closed) return m; } } catch (e) { /* annan origin */ } return null;
}
window.addEventListener('message', e => { const d = e.data; if (!d || e.origin !== location.origin) return; if (d.lagesplanProgress) { const f = bridgeProg.get(d.reqId); if (f) f(d.f, d.got, d.total); } else if (d.lagesplanReply) { const f = bridgeWait.get(d.reqId); if (f) { bridgeWait.delete(d.reqId); f(d); } } });
function ask(type, extra = {}, timeoutMs = 15000, onProgress = null) {
  return new Promise((resolve, reject) => {
    const op = bridgeWin(); if (!op) return reject(new Error('4D-planering är inte öppen. Öppna 3D-editorn via 4D-planering för Trimble Connect och tidplan.'));
    const reqId = ++bridgeSeq; const timer = timeoutMs ? setTimeout(() => { bridgeWait.delete(reqId); reject(new Error('Inget svar från 4D-planering.')); }, timeoutMs) : null; if (onProgress) bridgeProg.set(reqId, onProgress);
    bridgeWait.set(reqId, d => { clearTimeout(timer); bridgeProg.delete(reqId); if (d.error) return reject(new Error(d.error)); resolve(d); });
    try { op.postMessage({ lagesplan: true, type, reqId, ...extra }, location.origin); } catch (err) { clearTimeout(timer); bridgeWait.delete(reqId); reject(err); }
  });
}
A.ask = ask; A.tcAvailable = () => !!bridgeWin();
const BR = { settings: null, projectId: null };
A.bridgeInit = async () => {
  if (!bridgeWin()) return; $('btnTC').hidden = false; $('projBtn').title = 'Öppna från Trimble Connect';
  try { const h = await ask('hello', {}, 5000); BR.settings = h.settings || {}; BR.projectId = h.projectId; if (BR.settings.userName) { S.user.name = BR.settings.userName; S.user.initials = BR.settings.userName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); $('avatar').textContent = S.user.initials; } $('projName').textContent = 'Trimble Connect'; } catch (e) { /* ingen brygga */ }
};

/* ---- Filer i Trimble Connect ---- */
const FS = { folder: null, path: [], items: [], filter: null };
const extOf = n => (n.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
const isModel = n => /\.(ifc|ifczip)$/i.test(n); const isCloud = n => /\.(las|xyz|ply|txt|csv)$/i.test(n); const isDrawing = n => /\.(pdf|dwg|dxf|dgn|png|jpg|jpeg)$/i.test(n);
async function loadFolder(host, folderId, label) {
  host.innerHTML = '<div class="hint">Hämtar mappen …</div>'; try { const r = await ask('tcFolder', { folderId: folderId || null }, 30000); FS.folder = r.folderId; FS.items = r.items || []; if (label !== undefined) { if (label === null) FS.path = []; else FS.path.push({ id: folderId, name: label }); } renderFolder(host); } catch (e) { host.innerHTML = `<div class="hint">${esc(e.message)}</div>`; }
}
function renderFolder(host) {
  const crumbs = `<div class="row" style="margin-top:0;align-items:center"><a data-p="-1" style="cursor:pointer;color:var(--acc)">Projekt</a>${FS.path.map((p, i) => `<span class="muted">/</span><a data-p="${i}" style="cursor:pointer;color:var(--acc)">${esc(p.name)}</a>`).join('')}</div>`;
  const items = FS.items.filter(x => x.type === 'folder' || !FS.filter || FS.filter(x.name));
  host.innerHTML = crumbs + (items.length ? items.map((x, i) => `<div class="fl-it" data-i="${i}">${ic(x.type === 'folder' ? 'folder' : 'file')}<div style="flex:1;min-width:0"><b style="font-size:13px;word-break:break-word">${esc(x.name)}</b><small>${x.type === 'folder' ? 'Mapp' : (x.size ? (x.size / 1e6).toFixed(1) + ' MB' : '')}</small></div></div>`).join('') : '<div class="hint">Inga filer av den här typen i mappen.</div>');
  host.querySelectorAll('[data-p]').forEach(a => a.onclick = () => { const k = +a.dataset.p; if (k < 0) { FS.path = []; loadFolder(host, null); } else { const id = FS.path[k].id; FS.path = FS.path.slice(0, k + 1); loadFolder(host, id); } });
  host.querySelectorAll('.fl-it').forEach(el => el.onclick = async () => { const x = items[+el.dataset.i]; if (x.type === 'folder') return loadFolder(host, x.id, x.name); await openRemote(x, !!(host.closest('.body') && host.closest('.body').querySelector('#tcAdd') && host.closest('.body').querySelector('#tcAdd').checked)); });
}
async function openRemote(x, add) {
  try { busy(`Hämtar ${x.name} …`); const r = await ask('tcFile', { fileId: x.id, name: x.name }, 0, (f, got, tot) => busy(`Hämtar ${x.name} ${tot ? Math.round(got / tot * 100) + ' %' : ''}`)); busy('');
    if (isModel(x.name)) { await A.loadIfc(r.bytes, x.name.replace(/\.ifczip$/i, '.ifc'), { add }); $('dialog').hidden = true; if (S.tab !== 'model') window.__r3d.setTab('model'); } else if (isCloud(x.name)) { await A.loadCloud(r.bytes, x.name); $('dialog').hidden = true; } else { const url = URL.createObjectURL(new Blob([r.bytes])); const a = document.createElement('a'); a.href = url; a.download = x.name; if (/\.pdf$/i.test(x.name)) { a.target = '_blank'; a.removeAttribute('download'); } document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } catch (e) { busy(''); toast(e.message, 6000); }
}
A.openFromTC = () => { const d = dialog('Öppna från Trimble Connect', `${S.loaded ? '<label class="chk" style="margin-top:0"><input type="checkbox" id="tcAdd" checked> Lägg till i nuvarande modell</label>' : ''}<div id="tcBrowser"></div>`, { wide: true }); FS.filter = n => isModel(n) || isCloud(n); FS.path = []; loadFolder(d.el.querySelector('#tcBrowser'), null); };
A.renderFiles = tab => {
  const L = leftBody(); if (!bridgeWin()) { L.innerHTML = `<div class="hint">${tab === 'drawings' ? 'Ritningar' : 'Dokument'} hämtas från Trimble Connect.<br><br>Öppna 3D-editorn via 4D-planering (i Trimble Connect) för att komma åt projektets filer.</div>`; return; }
  FS.filter = tab === 'drawings' ? isDrawing : n => !isModel(n) && !isDrawing(n); FS.path = []; L.innerHTML = '<div id="fsHost"></div>'; loadFolder(L.querySelector('#fsHost'), null);
};
A.saveToTC = async (bytes, name) => { try { busy('Sparar i Trimble Connect …'); const f = new File([bytes], name, { type: 'application/x-step' }); const r = await ask('tcUpload', { folder: '3D-editor', files: [f] }, 10 * 60 * 1000); busy(''); toast(`✓ Sparad i Trimble Connect (${r.folder || '3D-editor'})`, 5000); } catch (e) { busy(''); toast(e.message, 7000); } };

/* =========================================================
   Tidplan (4D)
   ========================================================= */
const PL = { rows: null, acts: [], date: null, min: null, max: null, play: 0, cur: -1, hideFuture: false, linked: new Map(), err: '' };
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
async function planLoad() {
  if (PL.rows) return; if (!bridgeWin()) { PL.err = 'Tidplanen läses via 4D-planering. Öppna 3D-editorn därifrån.'; return; }
  if (!BR.settings) await A.bridgeInit(); const token = BR.settings && BR.settings.githubToken, pid = BR.projectId; if (!token || !pid || typeof window.ghReadJSON !== 'function') { PL.err = 'Hittar ingen åtkomst till tidplanen (saknar token eller projekt).'; return; }
  try { const src = (BR.settings.planSource || 'pp') === 'excel' ? '' : 'pp/'; const rows = await window.ghReadJSON(token, `projects/${encodeURIComponent(pid)}/${src}plan_items.json`); PL.rows = Array.isArray(rows) ? rows : []; PL.err = ''; } catch (e) { PL.err = 'Kunde inte läsa tidplanen: ' + e.message; PL.rows = []; }
  const map = new Map(); PL.rows.forEach(r => { if (!r.start_date || !r.end_date) return; const k = r.group_id ? 'g:' + r.group_id : r.source_key ? 's:' + r.source_key : 'i:' + r.id; (map.get(k) || map.set(k, []).get(k)).push(r); });
  PL.acts = [...map].map(([key, rows], i) => { const r = rows[0], s = rows.map(x => x.start_date.slice(0, 10)).sort()[0], e = rows.map(x => x.end_date.slice(0, 10)).sort().pop(); return { key, rows, name: String(r.activity || r.object_name || 'Aktivitet').trim(), area: String(r.area || '').trim(), contractor: String(r.contractor || '').trim(), start: s, end: e, progress: Math.round(rows.reduce((a, x) => a + (Number(x.progress) || 0), 0) / rows.length), color: palette(i * 3 + 1) }; }).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'sv', { numeric: true }));
  PL.min = PL.acts.length ? PL.acts[0].start : today(); PL.max = PL.acts.reduce((m, a) => a.end > m ? a.end : m, PL.min); PL.date = PL.date || (today() < PL.min ? PL.min : today() > PL.max ? PL.max : today());
}
function planLink() { PL.linked.clear(); PL.acts.forEach(a => { const ids = []; a.rows.forEach(r => { const oi = S.guidIx.get(String(r.object_id || '')); if (oi != null) ids.push(oi); }); a.objs = [...new Set(ids)]; a.objs.forEach(oi => { (PL.linked.get(oi) || PL.linked.set(oi, []).get(oi)).push(a); }); }); }
const statusAt = (a, d) => d < a.start ? 'planned' : (a.progress >= 100 || d > a.end) ? (a.progress >= 100 ? 'done' : 'late') : 'run';
const SCOL = { planned: [203, 213, 225], run: [245, 158, 11], done: [34, 197, 94], late: [239, 68, 68] };
function planApply() {
  if (!S.loaded) return; S.override.clear(); S.ghostAll = new Set(); const hide = [];
  PL.acts.forEach(a => (a.objs || []).forEach(oi => { const s = statusAt(a, PL.date); S.override.set(oi, SCOL[s]); if (s === 'planned') { if (PL.hideFuture) hide.push(oi); else S.ghostAll.add(oi); } }));
  for (let i = 0; i < S.nObj; i++) { const want = !(PL.hideFuture && hide.includes(i)); if (!!S.shown[i] !== want && PL.hideFuture !== undefined) { /* visibilitet hanteras av ghost */ } }
  refreshFlags(); planTimeline();
}
function planTimeline() {
  const t = $('timeline'); if (!PL.acts.length) { t.hidden = true; return; } t.hidden = S.tab !== 'plan'; const span = Math.max(1, (Date.parse(PL.max) - Date.parse(PL.min)) / 864e5), val = Math.round((Date.parse(PL.date) - Date.parse(PL.min)) / 864e5);
  const cnt = { planned: 0, run: 0, done: 0, late: 0 }; PL.acts.forEach(a => { if (a.objs && a.objs.length) cnt[statusAt(a, PL.date)]++; });
  t.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><button class="x" id="tlPlay" title="Spela">${ic(PL.play ? 'pause' : 'play')}</button><button class="x" id="tlPrev" title="Dag bakåt" style="transform:rotate(180deg)">${ic('chev')}</button><b style="min-width:92px;text-align:center">${PL.date}</b><button class="x" id="tlNext" title="Dag framåt">${ic('chev')}</button><input id="tlR" type="range" min="0" max="${span}" value="${val}" style="flex:1"></div>
  <div style="display:flex;gap:14px;font-size:12px;margin-top:6px;color:var(--mut)"><span><i class="dot" style="background:rgb(${SCOL.planned})"></i> Planerat ${cnt.planned}</span><span><i class="dot" style="background:rgb(${SCOL.run})"></i> Pågår ${cnt.run}</span><span><i class="dot" style="background:rgb(${SCOL.done})"></i> Klart ${cnt.done}</span><span><i class="dot" style="background:rgb(${SCOL.late})"></i> Försenat ${cnt.late}</span></div>`;
  const set = d => { PL.date = d < PL.min ? PL.min : d > PL.max ? PL.max : d; planApply(); }; t.querySelector('#tlR').oninput = e => set(addDays(PL.min, +e.target.value)); t.querySelector('#tlPrev').onclick = () => set(addDays(PL.date, -1)); t.querySelector('#tlNext').onclick = () => set(addDays(PL.date, 1));
  t.querySelector('#tlPlay').onclick = () => { if (PL.play) { clearInterval(PL.play); PL.play = 0; planTimeline(); return; } PL.play = setInterval(() => { if (PL.date >= PL.max) { clearInterval(PL.play); PL.play = 0; planTimeline(); return; } set(addDays(PL.date, 1)); }, 140); planTimeline(); };
}
A.renderPlan = async () => {
  const L = leftBody(); L.innerHTML = '<div class="hint">Läser tidplanen …</div>'; await planLoad(); if (PL.err && !PL.rows) { L.innerHTML = `<div class="hint">${esc(PL.err)}</div>`; return; } if (PL.err) { L.innerHTML = `<div class="hint">${esc(PL.err)}</div>`; return; }
  if (S.loaded) planLink(); const linked = PL.acts.filter(a => a.objs && a.objs.length).length;
  L.innerHTML = `<div class="muted" style="margin-bottom:8px">${PL.acts.length} aktiviteter · ${linked} kopplade till objekt i den här modellen</div><label class="chk"><input type="checkbox" id="plLink" ${PL.onlyLinked ? 'checked' : ''}> Visa bara kopplade</label><div id="plList"></div>`;
  const list = L.querySelector('#plList'), draw = () => { const acts = PL.acts.filter(a => !PL.onlyLinked || (a.objs && a.objs.length)); list.innerHTML = acts.map(a => `<div class="act ${PL.cur === a.key ? 'on' : ''}" data-k="${esc(a.key)}"><b style="font-size:13px">${esc(a.name)}</b><small>${esc(a.area || '')}${a.contractor ? ' · ' + esc(a.contractor) : ''} · ${a.start} → ${a.end}${a.objs ? ' · ' + a.objs.length + ' obj.' : ''}</small><div class="pb"><i style="width:${a.progress}%;background:${a.color}"></i></div></div>`).join('') || '<div class="hint">Inga aktiviteter.</div>';
    list.querySelectorAll('.act').forEach(el => el.onclick = () => { const a = PL.acts.find(x => x.key === el.dataset.k); PL.cur = a.key; PL.date = a.start > PL.date || a.end < PL.date ? a.start : PL.date; if (a.objs && a.objs.length) { A.selectMany(a.objs); fitSel();  } planApply(); draw(); if (a.rows[0] && bridgeWin()) ask('select', { ids: a.rows.map(r => r.id), jump: false }, 8000).catch(() => { }); }); };
  draw(); L.querySelector('#plLink').onchange = e => { PL.onlyLinked = e.target.checked; draw(); }; planApply();
};
A.planOff = () => { clearInterval(PL.play); PL.play = 0; if (S.loaded && S.tab !== 'plan') { S.override.clear(); S.ghostAll = null; refreshFlags(); } };
A.activityFor = oi => { const l = PL.linked.get(oi); return l && l[0] ? { name: l[0].name, color: `rgb(${SCOL[statusAt(l[0], PL.date || today())]})` } : null; };
on('loaded', () => { PL.linked.clear(); if (PL.acts.length) planLink(); });
