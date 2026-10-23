/* Sidopaneler: modellträd, filter, vyer och kommentarer (vänster) samt egenskaper (höger). */
import { $, S, A, R, ic, hydrate, esc, nice, classIcon, categoryOf, catIcon, palette, fmtN, fmtD, outJson, callStr, outText, emit, on, redraw, toast, store, fmtN as fN } from './core.js';
import { V, refreshFlags, setVisible, fitSel, boxOf, objBox } from './view.js';

export const UI = { leftTab: 'obj', rightTab: 'obj', group: 'cat', found: null, rows: new Map(), cache: new Map() };

/* ---------- Vänster: Modell ---------- */
export function renderLeftModel() {
  const L = $('lBody'); $('lTitle').textContent = 'Modell'; L.innerHTML = `<nav class="tabs" id="ltabs" style="padding:0;margin:0 0 8px"><button data-t="obj" class="${UI.leftTab === 'obj' ? 'on' : ''}">Objekt</button><button data-t="filter" class="${UI.leftTab === 'filter' ? 'on' : ''}">Filter</button><button data-t="views" class="${UI.leftTab === 'views' ? 'on' : ''}">Vyer</button></nav><div id="lSub"></div>`;
  L.querySelector('#ltabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; UI.leftTab = b.dataset.t; renderLeftModel(); };
  const sub = $('lSub'); if (UI.leftTab === 'obj') renderTree(sub); else if (UI.leftTab === 'filter') renderFilter(sub); else renderViews(sub);
}
const treeRowCls = (c, oi) => (S.sel.has(oi) ? ' sel' : '');
function node({ label, count, icon, items, open, depth, sw }) {
  const n = document.createElement('div'); n.className = 'tn l' + depth + (open ? ' open' : ''); n._items = items;
  n.innerHTML = `<span class="car"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></span>${icon ? `<span class="gi">${ic(icon)}</span>` : ''}${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}<span class="lab"></span><span class="cnt">${count.toLocaleString('sv')}</span><button class="eye" title="Visa/dölj">${ic('eye')}</button>`;
  n.querySelector('.lab').textContent = label;
  n.onclick = () => A.selectMany(items()); n.ondblclick = () => { A.selectMany(items()); fitSel(); };
  n.querySelector('.eye').onclick = ev => { ev.stopPropagation(); const l = items(), vis = !l.every(oi => S.shown[oi]); A.setVis(l, vis, (vis ? 'Visa ' : 'Dölj ') + label); };
  return n;
}
function renderTree(host) {
  host.innerHTML = '<div class="lsearch"><i></i><input id="lq" type="search" placeholder="Sök i modellen…" autocomplete="off"><kbd>Ctrl K</kbd></div><div id="tree"></div>'; host.querySelector('.lsearch i').innerHTML = ic('search');
  host.querySelector('#lq').oninput = e => { $('q').value = e.target.value; A.search(e.target.value); }; host.querySelector('#lq').value = $('q').value;
  const T = host.querySelector('#tree'); if (!S.loaded) { T.innerHTML = '<div class="hint">Ingen modell öppen.</div>'; return; }
  if (UI.found) { renderFound(T); return; }
  UI.rows.clear();
  const byCat = UI.group === 'cat';
  const gkey = oi => byCat ? categoryOf(S.classes[S.objClass[oi]]) : S.objCont[oi];
  const groups = new Map(); for (let i = 0; i < S.nObj; i++) { const k = gkey(i); let g = groups.get(k); if (!g) groups.set(k, g = new Map()); let l = g.get(S.objClass[i]); if (!l) g.set(S.objClass[i], l = []); l.push(i); }
  const all = Array.from({ length: S.nObj }, (_, i) => i);
  const root = node({ label: S.fileName.replace(/\.ifc$/i, '') || 'Modell', count: S.nObj, icon: 'cube', items: () => all, open: true, depth: 0 }); root.classList.add('l0'); T.append(root);
  const rk = document.createElement('div'); rk.className = 'kids'; T.append(rk);
  root.querySelector('.car').onclick = ev => { ev.stopPropagation(); root.classList.toggle('open'); rk.hidden = !root.classList.contains('open'); };
  const order = [...groups.keys()].sort((a, b) => byCat ? (['Byggnadsdelar', 'Stålkonstruktion', 'Prefab', 'Installationer', 'Terräng & mark', 'Övrigt'].indexOf(a) - ['Byggnadsdelar', 'Stålkonstruktion', 'Prefab', 'Installationer', 'Terräng & mark', 'Övrigt'].indexOf(b)) : (a === 0) - (b === 0) || S.conts[a][0].localeCompare(S.conts[b][0], 'sv', { numeric: true }));
  for (const k of order) {
    const g = groups.get(k), list = [...g.values()].flat(), label = byCat ? k : S.conts[k][0];
    const gn = node({ label, count: list.length, icon: byCat ? catIcon(k) : 'layers', items: () => list, open: order.length <= 5, depth: 1 }); const kids = document.createElement('div'); kids.className = 'kids'; kids.hidden = !gn.classList.contains('open');
    for (const [cls, cl] of [...g.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const cn = node({ label: nice(S.classes[cls]), count: cl.length, icon: classIcon(S.classes[cls]), items: () => cl, open: false, depth: 2, sw: S.colorBy === 'class' ? palette(cls) : null }); const ck = document.createElement('div'); ck.className = 'kids'; ck.hidden = true; cn._ck = ck; cn._cl = cl;
      cn.querySelector('.car').onclick = ev => { ev.stopPropagation(); toggleClass(cn, ck, cl); }; kids.append(cn, ck);
    }
    gn.querySelector('.car').onclick = ev => { ev.stopPropagation(); gn.classList.toggle('open'); kids.hidden = !gn.classList.contains('open'); }; rk.append(gn, kids);
  }
  refreshTreeVis(); markTree();
}
function toggleClass(cn, ck, list) {
  cn.classList.toggle('open'); ck.hidden = !cn.classList.contains('open'); if (ck.hidden || ck.childElementCount) return;
  const show = n => { const from = ck.dataset.n | 0, slice = list.slice(from, from + n); const more = ck.querySelector('.more'); slice.forEach(oi => ck.insertBefore(objRow(oi), more)); ck.dataset.n = from + slice.length; if (more) { if (+ck.dataset.n >= list.length) more.remove(); else more.textContent = `Visa fler (${list.length - ck.dataset.n})`; } };
  if (list.length > 150) { const m = document.createElement('div'); m.className = 'more'; m.onclick = () => show(300); ck.append(m); } show(150);
}
export function objRow(oi, labelExtra) {
  const r = document.createElement('div'); r.className = 'tn' + treeRowCls(0, oi); r.dataset.oi = oi; r.innerHTML = `<span class="car"></span><span class="lab"></span><button class="eye" title="Visa/dölj">${ic(S.shown[oi] ? 'eye' : 'eyeoff')}</button>`;
  r.querySelector('.lab').textContent = (S.objName[oi] || nice(S.classes[S.objClass[oi]])) + (labelExtra || '');
  r.onclick = ev => { if (ev.ctrlKey || ev.metaKey || ev.shiftKey) A.toggleSel(oi); else A.selectOnly(oi); }; r.ondblclick = () => { A.selectOnly(oi); fitSel(); };
  r.querySelector('.eye').onclick = ev => { ev.stopPropagation(); A.setVis([oi], !S.shown[oi], 'Visa/dölj objekt'); }; UI.rows.set(oi, r); return r;
}
function renderFound(T) {
  const ids = UI.found; const top = document.createElement('div'); top.className = 'row'; top.innerHTML = `<button class="btn sm" id="sSel">Markera alla (${ids.length.toLocaleString('sv')})</button><button class="btn sm" id="sIso">Isolera</button><button class="btn sm ghost" id="sClr">Rensa sökning</button>`; T.append(top);
  top.querySelector('#sSel').onclick = () => { A.selectMany(ids); fitSel(); }; top.querySelector('#sIso').onclick = () => { A.selectMany(ids); A.isolate(); }; top.querySelector('#sClr').onclick = () => { $('q').value = ''; A.search(''); };
  ids.slice(0, 400).forEach(oi => T.append(objRow(oi, ' · ' + nice(S.classes[S.objClass[oi]])))); if (ids.length > 400) { const m = document.createElement('div'); m.className = 'muted'; m.style.padding = '6px 8px'; m.textContent = `…och ${ids.length - 400} till`; T.append(m); }
}
export function refreshTreeVis() { document.querySelectorAll('#tree .tn').forEach(n => { if (n._items) { const l = n._items(), any = l.some(oi => S.shown[oi]); n.querySelector('.eye').classList.toggle('off', !any); n.querySelector('.eye').innerHTML = ic(any ? 'eye' : 'eyeoff'); } else if (n.dataset.oi) { const sh = S.shown[+n.dataset.oi]; n.querySelector('.eye').classList.toggle('off', !sh); n.querySelector('.eye').innerHTML = ic(sh ? 'eye' : 'eyeoff'); n.style.opacity = sh ? '' : .5; } }); }
export function markTree() { document.querySelectorAll('#tree .tn[data-oi]').forEach(n => n.classList.toggle('sel', S.sel.has(+n.dataset.oi))); }
export function revealObj(oi) {
  const row = UI.rows.get(oi); if (row && row.isConnected) { row.scrollIntoView({ block: 'nearest' }); return; }
  const cls = S.objClass[oi]; const cn = [...document.querySelectorAll('#tree .tn')].find(n => n._cl && n._cl.includes(oi)); if (!cn) return;
  let p = cn.parentElement; while (p && p.id !== 'tree') { if (p.classList.contains('kids') && p.hidden) { p.hidden = false; const prev = p.previousElementSibling; if (prev) prev.classList.add('open'); } p = p.parentElement; }
  if (cn.classList.contains('open') === false) toggleClass(cn, cn._ck, cn._cl); let r2 = UI.rows.get(oi); if (!r2 || !r2.isConnected) { r2 = objRow(oi); cn._ck.prepend(r2); } r2.classList.add('sel'); r2.scrollIntoView({ block: 'nearest' }); void cls;
}

/* ---------- Filter ---------- */
function renderFilter(host) {
  if (!S.loaded) { host.innerHTML = '<div class="hint">Ingen modell öppen.</div>'; return; }
  const cnt = new Map(); for (let i = 0; i < S.nObj; i++) cnt.set(S.objClass[i], (cnt.get(S.objClass[i]) || 0) + 1);
  const ccount = new Map(); for (let i = 0; i < S.nObj; i++) ccount.set(S.objCont[i], (ccount.get(S.objCont[i]) || 0) + 1);
  host.innerHTML = `<div class="card"><h4>Gruppera trädet</h4><div class="seg" id="fGrp"><button data-g="cat" class="${UI.group === 'cat' ? 'on' : ''}">Kategori</button><button data-g="cont" class="${UI.group === 'cont' ? 'on' : ''}">Våning</button></div></div>
  <div class="card"><h4>Färglägg</h4><div class="seg" id="fCol"><button data-c="orig" class="${S.colorBy === 'orig' ? 'on' : ''}">Ursprung</button><button data-c="class" class="${S.colorBy === 'class' ? 'on' : ''}">Klass</button><button data-c="cont" class="${S.colorBy === 'cont' ? 'on' : ''}">Våning</button></div>
  <label class="chk"><input type="checkbox" id="fGhost" ${S.ghost ? 'checked' : ''}> Tona ned övriga vid markering (G)</label></div>
  <div class="card"><h4>Klasser</h4><div id="fCls"></div></div><div class="card"><h4>Våningar</h4><div id="fCont"></div></div>`;
  host.querySelector('#fGrp').onclick = e => { const b = e.target.closest('button'); if (b) { UI.group = b.dataset.g; renderLeftModel(); } };
  host.querySelector('#fCol').onclick = e => { const b = e.target.closest('button'); if (b) A.colorBy(b.dataset.c); renderLeftModel(); };
  host.querySelector('#fGhost').onchange = e => { S.ghost = e.target.checked; refreshFlags(); };
  const mk = (box, entries, items) => entries.forEach(([label, n, list]) => { const l = document.createElement('label'); l.className = 'chk'; const any = list.some(oi => S.shown[oi]); l.innerHTML = `<input type="checkbox" ${any ? 'checked' : ''}><span style="flex:1"></span><small class="muted">${n}</small>`; l.querySelector('span').textContent = label; l.querySelector('input').onchange = e => A.setVis(list, e.target.checked, (e.target.checked ? 'Visa ' : 'Dölj ') + label); box.append(l); });
  const byC = new Map(), byK = new Map(); for (let i = 0; i < S.nObj; i++) { (byC.get(S.objClass[i]) || byC.set(S.objClass[i], []).get(S.objClass[i])).push(i); (byK.get(S.objCont[i]) || byK.set(S.objCont[i], []).get(S.objCont[i])).push(i); }
  mk(host.querySelector('#fCls'), [...byC].sort((a, b) => b[1].length - a[1].length).map(([c, l]) => [nice(S.classes[c]), l.length, l]));
  mk(host.querySelector('#fCont'), [...byK].sort((a, b) => S.conts[a[0]][0].localeCompare(S.conts[b[0]][0], 'sv', { numeric: true })).map(([c, l]) => [S.conts[c][0], l.length, l]));
  if (A.cloudCard) A.cloudCard(host);
}

/* ---------- Vyer och kommentarer ---------- */
function renderViews(host) {
  host.innerHTML = `<div class="card"><h4>Sparade vyer</h4><div id="vList"></div><button class="btn wide" id="vSave">${ic('save')} Spara aktuell vy</button></div><div class="card"><h4>Kommentarer</h4><div id="cList"></div><div class="muted">Välj verktyget Kommentar (K) och klicka i modellen.</div>
  <div class="row"><button class="btn sm" id="cExp">${ic('download')} Exportera</button></div></div>`;
  const vl = host.querySelector('#vList'); if (!S.views.length) vl.innerHTML = '<div class="muted" style="margin-bottom:8px">Inga sparade vyer än.</div>';
  S.views.forEach((v, i) => { const e = document.createElement('div'); e.className = 'fl-it'; e.innerHTML = `<img src="${v.thumb || ''}" style="width:72px;height:48px;border-radius:8px;object-fit:cover;background:var(--panel2)"><div style="flex:1;min-width:0"><b></b><small>${esc(new Date(v.t).toLocaleString('sv'))}</small></div><button class="x" title="Ta bort">${ic('trash')}</button>`; e.querySelector('b').textContent = v.name; e.onclick = ev => { if (ev.target.closest('.x')) A.deleteView(i); else A.restoreView(v); }; vl.append(e); });
  host.querySelector('#vSave').onclick = () => A.saveView();
  const cl = host.querySelector('#cList'); if (!S.comments.length) cl.innerHTML = '<div class="muted" style="margin-bottom:8px">Inga kommentarer än.</div>';
  S.comments.forEach((c, i) => { const e = document.createElement('div'); e.className = 'cm-it'; e.innerHTML = `<span class="badge ${c.status === 'Löst' ? 'b-ok' : 'b-rev'}">${i + 1}</span><div style="flex:1;min-width:0"><b style="font-size:13px"></b><small>${esc(c.author)} · ${esc(new Date(c.t).toLocaleString('sv'))}${c.objName ? ' · ' + esc(c.objName) : ''}</small></div><button class="x" title="Ta bort">${ic('trash')}</button>`; e.querySelector('b').textContent = c.text; e.onclick = ev => { if (ev.target.closest('.x')) A.deleteComment(i); else A.openComment(i); }; cl.append(e); });
  host.querySelector('#cExp').onclick = () => A.exportComments();
}

/* ---------- Höger: egenskaper ---------- */
const PRIO = [['Material', /^(material|materiale)$/i], ['Vikt', /(vikt|weight|mass)/i], ['Leverantör', /(leverant|supplier|manufact|tillverk)/i], ['Montage', /(montage|assembly|erection)/i], ['Status', /^status$/i], ['WBS', /(wbs)/i], ['Klass', /^(klass|class|exposureclass|exponeringsklass)$/i], ['Brandklass', /(brand|fire)/i], ['Profil', /(profil|profile)/i]];
export function renderRight() {
  const R2 = $('rBody'); const t = UI.rightTab; document.querySelectorAll('#rtabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (S.tab === 'clash' && A.clashRight && A.clashRight(R2)) return;
  if (S.tool === 'measure' && A.measuresPanel) { A.measuresPanel(R2); hydrate(R2); return; }
  if (!S.sel.size) { R2.innerHTML = '<div class="hint">Klicka på ett objekt för att se och ändra egenskaper.</div>'; return; }
  if (S.sel.size > 1) { renderMulti(R2); return; }
  const oi = [...S.sel][0], j = outJson(R.E.model_object(oi)); UI.cur = { oi, j };
  if (t === 'obj') renderObj(R2, oi, j); else if (t === 'ifc') renderIfc(R2, oi, j); else renderMeta(R2, oi, j);
  hydrate(R2);
}
function renderMulti(R2) {
  const by = new Map(); for (const oi of S.sel) by.set(S.objClass[oi], (by.get(S.objClass[oi]) || 0) + 1);
  R2.innerHTML = `<div class="ocard"><div class="ob">${ic('layers')}</div><div><h3>${S.sel.size.toLocaleString('sv')} objekt</h3><small>markerade</small></div></div>` + [...by].map(([c, n]) => `<div class="kv"><label>${esc(nice(S.classes[c]))}</label><div class="val">${n}</div></div>`).join('') + `<div class="row"><button class="btn sm" id="mHide">${ic('eyeoff')} Dölj</button><button class="btn sm" id="mIso">${ic('iso')} Isolera</button><button class="btn sm" id="mFoc">${ic('focus')} Fokusera</button></div>`;
  R2.querySelector('#mHide').onclick = () => A.hideSel(); R2.querySelector('#mIso').onclick = () => A.isolate(); R2.querySelector('#mFoc').onclick = () => fitSel();
}
function dims(j) { const b = j.bbox, d = [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; return { l: Math.max(d[0], d[1]), w: Math.min(d[0], d[1]), h: d[2] }; }
function propsFlat(j) { const out = []; j.psets.forEach(ps => ps.props.forEach(p => out.push({ ...p, ps: ps.name }))); return out; }
function kv(label, valHtml) { return `<div class="kv"><label>${esc(label)}</label><div class="val">${valHtml}</div></div>`; }
function editField(label, value, data, ro) { return `<div class="kv"><label>${esc(label)}</label><input type="text" ${data} ${ro ? 'readonly' : ''} value="${esc(value)}"></div>`; }
function renderObj(R2, oi, j) {
  const d = dims(j), flat = propsFlat(j), q = (UI.cache.get('qty') || [])[oi];
  const used = new Set(); const smart = [];
  PRIO.forEach(([lab, re]) => { const p = flat.find(p => !used.has(p.id) && (re.test(p.name))); if (p) { used.add(p.id); smart.push({ lab, p }); } });
  const act = A.activityFor ? A.activityFor(oi) : null, cms = S.comments.filter(c => c.guid && c.guid === S.objGuid[oi]).length, cls = (A.clashesFor ? A.clashesFor(oi) : 0);
  R2.innerHTML = `<div class="ocard"><div class="ob">${ic(classIcon(j.class))}</div><div style="min-width:0"><h3></h3><small>${esc(nice(j.class))}${j.type ? ' · ' + esc(j.type) : ''}</small></div></div>
  <div>${editField('Namn', j.name, 'data-a="2"')}${j.type ? kv('Typ', esc(j.type)) : ''}${kv('Längd', fN(d.l) + ' m')}${kv('Bredd', fN(d.w) + ' m')}${kv('Höjd', fN(d.h) + ' m')}${q ? kv('Volym', fN(q[1], 3) + ' m³') : ''}${q ? kv('Yta', fN(q[0]) + ' m²') : ''}
  ${smart.map(s => `<div class="kv"><label>${esc(s.lab)}</label>${s.p.edit ? `<input type="text" data-p="${s.p.id}" value="${esc(s.p.value)}">` : `<div class="val">${esc(s.p.value)}</div>`}</div>`).join('')}
  ${kv('Våning', esc(j.container))}${act ? kv('Aktivitet', `<span class="dot" style="background:${act.color}"></span>${esc(act.name)}`) : ''}</div>
  <div class="sec"><span>Relaterade objekt</span></div>
  <div class="rel">${ic('comment')}<span>Kommentarer (${cms})</span><a data-go="comments">Visa</a></div>
  <div class="rel">${ic('calendar')}<span>Aktivitet i tidplanen (${act ? 1 : 0})</span><a data-go="plan">Visa</a></div>
  <div class="rel">${ic('warn')}<span>Kollisioner (${cls})</span><a data-go="clash">Visa</a></div>
  <div class="row" style="margin-top:14px"><button class="btn sm" id="oHide">${ic('eyeoff')} Dölj</button><button class="btn sm" id="oIso">${ic('iso')} Isolera</button><button class="btn sm" id="oFoc">${ic('focus')} Fokusera</button></div>`;
  R2.querySelector('h3').textContent = j.name || nice(j.class); bindEdits(R2, oi, j);
  R2.querySelector('#oHide').onclick = () => A.hideSel(); R2.querySelector('#oIso').onclick = () => A.isolate(); R2.querySelector('#oFoc').onclick = () => fitSel();
  R2.querySelectorAll('[data-go]').forEach(a => a.onclick = () => A.go(a.dataset.go, oi));
}
function bindEdits(R2, oi, j) {
  R2.querySelectorAll('input[data-a]').forEach(inp => { const old = inp.value; inp.onchange = () => A.editAttr(oi, +inp.dataset.a, old, inp.value, inp); });
  R2.querySelectorAll('input[data-p]').forEach(inp => { const old = inp.value; inp.onchange = () => A.editProp(oi, +inp.dataset.p, old, inp.value, inp); });
}
function renderIfc(R2, oi, j) {
  R2.innerHTML = `<div class="ocard"><div class="ob">${ic(classIcon(j.class))}</div><div style="min-width:0"><h3></h3><small>${esc(j.class)}</small></div></div>
  <div>${editField('Namn', j.name, 'data-a="2"')}${editField('Beskrivning', j.desc, 'data-a="3"')}${editField('Objekttyp', j.type, 'data-a="4"')}${editField('Taggnr', j.tag, 'data-a="7"')}${editField('GlobalId', j.guid, '', true)}${editField('STEP-id', '#' + j.id, '', true)}</div><div id="psets"></div>`;
  R2.querySelector('h3').textContent = j.name || nice(j.class); const P = R2.querySelector('#psets');
  for (const ps of j.psets) { if (!ps.props.length) continue; const d = document.createElement('details'); d.className = 'ps'; d.open = true; d.innerHTML = `<summary><span></span><span class="muted">${ps.props.length}</span></summary><div></div>`; d.querySelector('summary span').textContent = ps.name; const box = d.querySelector('div');
    for (const pr of ps.props) { const l = document.createElement('div'); l.className = 'kv'; const lb = document.createElement('label'); lb.textContent = pr.name; lb.title = pr.kind; const inp = document.createElement('input'); inp.type = 'text'; inp.value = pr.value; if (!pr.edit) { inp.readOnly = true; } else { inp.dataset.p = pr.id; } l.append(lb, inp); box.append(l); } P.append(d); }
  bindEdits(R2, oi, j);
}
function renderMeta(R2, oi, j) {
  const b = j.bbox, d = dims(j), q = (UI.cache.get('qty') || [])[oi];
  R2.innerHTML = `<div class="ocard"><div class="ob">${ic('info')}</div><div><h3>Metadata</h3><small>${esc(S.fileName)}</small></div></div>
  ${kv('Klass', esc(j.class))}${kv('Våning', esc(j.container))}${kv('Trianglar', j.tris)}${kv('Höjd Z (underkant)', fN(b[2] + S.origin[2]) + ' m')}${kv('Höjd Z (överkant)', fN(b[5] + S.origin[2]) + ' m')}${kv('X (mitt)', fN((b[0] + b[3]) / 2 + S.origin[0]) + ' m')}${kv('Y (mitt)', fN((b[1] + b[4]) / 2 + S.origin[1]) + ' m')}
  ${q ? kv('Yta', fN(q[0]) + ' m²') + kv('Volym', fN(q[1], 3) + ' m³') + kv('Slutet nät', q[2] ? 'ja' : 'nej (volym är ungefärlig)') : ''}${kv('Mått (L×B×H)', `${fN(d.l)} × ${fN(d.w)} × ${fN(d.h)} m`)}
  <div class="sec"><span>Kommentarer</span></div>${S.comments.filter(c => c.guid === S.objGuid[oi]).map(c => `<div class="rel">${ic('comment')}<span>${esc(c.text)}</span></div>`).join('') || '<div class="muted">Inga.</div>'}`;
}
$('rtabs').onclick = e => { const b = e.target.closest('button'); if (b) { UI.rightTab = b.dataset.t; renderRight(); } };
