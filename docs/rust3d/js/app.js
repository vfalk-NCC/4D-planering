/* 3D-editor (Rust/WebAssembly) – start, verktyg, markering, historik, vyer och kommentarer. */
import { $, S, A, R, choice, bus, emit, on, redraw, ic, hydrate, esc, nice, classIcon, outJson, outText, callStr, withBytes, busy, toast, tick, store, dialog, prompt2, fmtD, fmtN, dist3, bootEngine, td, outBytes } from './core.js';
import { initGL, resize, draw, uploadModel, buildStateTex, refreshFlags, setVisible, setFlag, V, resetViews, layoutViewports, fitAll, fitSel, fitBox, selBox, boxOf, project, camState, animateTo, setupSection, levelElev, canvas, G, stdView } from './view.js';
import { runAction, keys, KEYS0, RADIAL0, radialItems, snap, zoomCenter } from './input.js';
import { categoryOf } from './core.js';
import { UI, renderLeftModel, renderRight, refreshTreeVis, markTree, revealObj } from './panels.js';
import './features.js';

/* ---------- Historik (ångra/gör om) ---------- */
const H = { stack: [], idx: 0 };
export function exec(label, doFn, undoFn) { doFn(); H.stack.length = H.idx; H.stack.push({ label, doFn, undoFn, t: Date.now() }); H.idx++; histUi(); }
A.undo = () => { if (H.idx > 0) { const c = H.stack[--H.idx]; c.undoFn(); toast('Ångrade: ' + c.label, 1800); histUi(); } };
A.redo = () => { if (H.idx < H.stack.length) { const c = H.stack[H.idx++]; c.doFn(); toast('Gjorde om: ' + c.label, 1800); histUi(); } };
function histUi() {
  $('bUndo').disabled = H.idx === 0; $('bRedo').disabled = H.idx >= H.stack.length; const h = $('hist'); if (h.hidden) return;
  h.innerHTML = '<h4>Ändringshistorik</h4>' + (H.stack.length ? H.stack.map((c, i) => `<div class="h ${i < H.idx ? '' : 'fut'} ${i === H.idx - 1 ? 'cur' : ''}" data-i="${i}"><span style="flex:1">${esc(c.label)}</span><small class="muted">${new Date(c.t).toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') : '<div class="muted">Inga ändringar än.</div>');
  h.querySelectorAll('.h').forEach(e => e.onclick = () => { const i = +e.dataset.i + 1; while (H.idx > i) A.undo(); while (H.idx < i) A.redo(); });
}
$('bUndo').onclick = () => A.undo(); $('bRedo').onclick = () => A.redo(); $('bHist').onclick = () => { $('hist').hidden = !$('hist').hidden; histUi(); };

/* ---------- Laddning (en eller flera IFC-filer i samma modell) ---------- */
S.srcBuf = [];
async function loadIfc(buf, name, opt = {}) {
  const add = !!opt.add && S.loaded; busy('Rust läser ' + name + ' …'); await tick(); const t0 = performance.now(), bytes = new Uint8Array(buf), E = R.E;
  if (!add) { E.model_clear(); S.srcBuf = []; }
  const rc = callStr((np, nn) => withBytes(bytes, (p, n) => E.model_add(p, n, np, nn)), name);
  if (rc !== 0) { busy(''); toast('Kunde inte läsa filen: ' + outText(-rc), 7000); if (!add) { S.loaded = false; } return false; }
  S.srcBuf.push({ name, bytes }); const tRust = performance.now() - t0; fillFromRust(add); busy('');
  $('hPerf').textContent = `Rust läste ${(bytes.length / 1e6).toFixed(1)} MB på ${tRust.toFixed(0)} ms`; const sum = S.sum;
  if (sum.skipped.length) toast('Geometri som inte stöds än hoppades över: ' + sum.skipped.slice(0, 4).map(s => `${s[0].replace(/^IFC/, '')} ×${s[1]}`).join(', '), 6500); return true;
}
A.loadIfc = loadIfc;
function fillFromRust(add) {
  const E = R.E, sum = outJson(E.model_summary()), ol = outJson(E.model_objects()), old = S.shown;
  Object.assign(S, { sum, classes: ol.classes, conts: ol.containers, sources: ol.sources, nObj: sum.objects, origin: sum.origin, fileName: S.srcBuf[0].name });
  S.radius = Math.max(1, Math.hypot(sum.bbox[3] - sum.bbox[0], sum.bbox[4] - sum.bbox[1], sum.bbox[5] - sum.bbox[2]) / 2);
  S.objIds = ol.objs.map(o => o[0]); S.objClass = ol.objs.map(o => o[1]); S.objCont = ol.objs.map(o => o[2]); S.objName = ol.objs.map(o => o[3]); S.objGuid = ol.objs.map(o => o[4]); S.objSrc = ol.objs.map(o => o[5]);
  S.guidIx = new Map(S.objGuid.map((g, i) => [g, i])); S.shown = new Uint8Array(sum.objects).fill(1); if (add && old) S.shown.set(old.subarray(0, Math.min(old.length, S.shown.length)));
  if (!add) { boxOf.clear(); V.edgeCache.clear(); S.sel.clear(); S.hover = -1; S.measures = []; S.mPick = null; S.override.clear(); S.ghostAll = null; S.edits = 0; S.colorBy = 'orig'; H.stack.length = 0; H.idx = 0; histUi(); S.fileKey = S.srcBuf[0].name + '|' + sum.objects; S.comments = store.get('cm:' + S.fileKey, []); S.views = store.get('vw:' + S.fileKey, []); }
  uploadModel(); buildStateTex(); if (!add) resetViews(); S.loaded = true; if (!add) layoutViewports(V.layout);
  for (let i = 0; i < S.nObj; i++) if (!S.shown[i]) { G.stateData[i * 4] |= 1; E.model_set_visible(i, 0); } G.stateDirty = true;
  fitAll(0); if (!add) { setupSection(); S.section.on = false; } UI.cache.set('qty', outJson(E.model_quantities())); UI.found = null; $('empty').hidden = true;
  const nm = S.srcBuf[0].name.replace(/\.ifc$/i, ''); $('projName').textContent = nm + (S.srcBuf.length > 1 ? ` + ${S.srcBuf.length - 1}` : ''); $('cProj').textContent = nm;
  fillLevels(); S.mini = true; $('minimap').hidden = false; refreshFlags(); setTab(S.tab, true); renderRight(); afterSel(true); emit('loaded');
  $('hSt').textContent = `${sum.objects.toLocaleString('sv')} objekt · ${sum.tris.toLocaleString('sv')} trianglar${S.srcBuf.length > 1 ? ' · ' + S.srcBuf.length + ' modeller' : ''}`;
}
/* Tar bort en modell ur den gemensamma modellen: allt läses in på nytt utan den (osparade ändringar går förlorade). */
A.removeSource = async i => {
  if (S.srcBuf.length < 2) { S.srcBuf = []; R.E.model_clear(); S.loaded = false; S.nObj = 0; location.reload(); return; }
  if (S.edits && !(await choice('Ta bort modell', 'Du har osparade ändringar. De går förlorade när modellen tas bort – exportera först om du vill behålla dem.', ['Avbryt', 'Ta bort ändå']) === 'Ta bort ändå')) return;
  const keep = S.srcBuf.filter((_, k) => k !== i); busy('Läser om modellerna …'); await tick(); R.E.model_clear(); S.srcBuf = [];
  for (const k of keep) { callStr((np, nn) => withBytes(k.bytes, (p, n) => R.E.model_add(p, n, np, nn)), k.name); S.srcBuf.push(k); } fillFromRust(false); busy('');
};
A.addEtablering = async () => {
  try { busy('Hämtar etableringen från 4D-planering …'); const r = await A.ask('placeIfcText', { all: true }, 120000); busy(''); if (!r.text || !r.n) return toast('Det finns ingen etablering att visa i det här projektet.', 4000);
    const bytes = new TextEncoder().encode(r.text); const ex = S.srcBuf.findIndex(s => s.name === 'Etablering'); if (ex >= 0) await A.removeSource(ex); await loadIfc(bytes.buffer, 'Etablering', { add: S.loaded }); toast(`Etablering: ${r.n} objekt (redigeras i lägesplanens 3D-vy)`, 4500);
  } catch (e) { busy(''); toast(e.message, 6000); }
};
function fillLevels() {
  const sel = $('mmLevel'), lv = []; const seen = new Set(); for (let i = 0; i < S.nObj; i++) { const c = S.objCont[i]; if (!seen.has(c) && c !== 0) { seen.add(c); lv.push([c, levelElev(c)]); } } lv.sort((a, b) => a[1] - b[1]);
  sel.innerHTML = '<option value="-1">Alla</option>' + lv.map(([c, z]) => `<option value="${c}">${esc(S.conts[c][0])}</option>`).join(''); S.miniLevel = -1; sel.onchange = () => { S.miniLevel = +sel.value; redraw(); };
}
async function openFile(f) {
  const buf = await f.arrayBuffer(), n = f.name.toLowerCase();
  if (/\.(xyz|txt|csv|ply|las|laz)$/.test(n)) { await A.loadCloud(buf, f.name); return; }
  let add = false; if (S.loaded) { const r = await choice('Öppna modell', 'Det finns redan en modell öppen. Vill du ersätta den eller lägga till den nya i samma vy?', ['Ersätt', 'Lägg till']); if (r == null) return; add = r === 'Lägg till'; }
  await loadIfc(buf, f.name, { add });
}
A.openFile = openFile;

/* ---------- Markering ---------- */
let rightAuto = false;
export function afterSel(quiet) {
  refreshFlags(); renderRight(); markTree(); ctxUi(); if (!quiet && S.sel.size === 1) revealObj([...S.sel][0]);
  const app = $('app'); if (S.sel.size && app.classList.contains('noright') && !S.userClosedRight && S.tab !== 'clash') { app.classList.remove('noright'); rightAuto = true; resize(); }
  else if (!S.sel.size && rightAuto && !S.keepRight) { app.classList.add('noright'); rightAuto = false; setTimeout(resize, 240); }
  emit('select');
}
A.afterSel = afterSel;
A.selectOnly = oi => { S.sel = new Set([oi]); afterSel(); };
A.selectMany = list => { S.sel = new Set(list); afterSel(); };
A.toggleSel = oi => { S.sel.has(oi) ? S.sel.delete(oi) : S.sel.add(oi); afterSel(); };
A.clearSel = () => { S.sel.clear(); afterSel(); };
A.hoverObj = (h) => { const oi = h ? h.oi : -1; if (oi !== S.hover) { if (S.hover >= 0) setFlag(S.hover, 4, false); if (oi >= 0) setFlag(oi, 4, true); S.hover = oi; canvas.style.cursor = oi >= 0 && S.tool !== 'measure' ? 'pointer' : (S.tool === 'measure' || S.tool === 'comment' ? 'crosshair' : 'default'); redraw(); } };
A.setVis = (list, vis, label = 'Visa/dölj') => { const before = list.map(oi => [oi, S.shown[oi]]); exec(label, () => { setVisible(list, vis); refreshTreeVis(); }, () => { before.forEach(([oi, s]) => setVisible([oi], !!s)); refreshTreeVis(); }); };
A.hideSel = () => { if (!S.sel.size) return; const l = [...S.sel]; S.sel.clear(); A.setVis(l, false, `Dölj ${l.length} objekt`); afterSel(); };
A.isolate = () => { if (!S.sel.size) return; const keep = new Set(S.sel), hide = [], show = []; for (let i = 0; i < S.nObj; i++) { if (keep.has(i)) { if (!S.shown[i]) show.push(i); } else if (S.shown[i]) hide.push(i); }
  const before = [...hide, ...show].map(oi => [oi, S.shown[oi]]); exec(`Isolera ${keep.size} objekt`, () => { setVisible(hide, false); setVisible(show, true); refreshTreeVis(); }, () => { before.forEach(([oi, s]) => setVisible([oi], !!s)); refreshTreeVis(); }); };
A.showAll = () => { const hid = []; for (let i = 0; i < S.nObj; i++) if (!S.shown[i]) hid.push(i); if (hid.length) A.setVis(hid, true, 'Visa allt'); };
A.toggleGhost = () => { S.ghost = !S.ghost; refreshFlags(); toast(S.ghost ? 'Övriga objekt tonas ned vid markering' : 'Ingen nedtoning', 1800); };
A.colorBy = c => { S.colorBy = c; refreshFlags(); if (UI.leftTab === 'obj') renderLeftModel(); };
A.escape = () => { if (!$('dialog').hidden) { $('dialog').hidden = true; return; } if (!$('hist').hidden) { $('hist').hidden = true; return; } closeMenu(); if (S.mPick) { S.mPick = null; redraw(); return; } if (S.tool !== 'select') { A.setTool('select'); return; } if (S.sel.size) A.clearSel(); };
A.deleteKey = () => { if (S.tool === 'measure' && S.measures.length) { const m = S.measures.pop(); exec('Ta bort mått', () => { }, () => { }); S.measures.push(m); const i = S.measures.length - 1; A.removeMeasure(i); } };
A.go = (where, oi) => { if (where === 'comments') { UI.leftTab = 'views'; setTab('model'); } else if (where === 'plan') setTab('plan'); else if (where === 'clash') setTab('clash'); };

/* ---------- Sök ---------- */
let qT = 0;
A.search = q => { clearTimeout(qT); qT = setTimeout(() => { if (!S.loaded) return; q = q.trim(); if (!q) { UI.found = null; $('qn').textContent = ''; } else { const t0 = performance.now(); UI.found = JSON.parse(outText(callStr((p, n) => R.E.model_search(p, n), q))); $('qn').textContent = `${UI.found.length.toLocaleString('sv')} träffar`; void t0; } if (S.tab === 'model') { setTab('model', true); UI.leftTab = 'obj'; renderLeftModel(); } }, 140); };
$('q').addEventListener('input', e => A.search(e.target.value));
$('q').addEventListener('keydown', e => { if (e.key === 'Enter' && UI.found && UI.found.length) { A.selectMany(UI.found); fitSel(); } if (e.key === 'Escape') { $('q').value = ''; A.search(''); $('q').blur(); } });

/* ---------- Verktyg ---------- */
A.setTool = t => {
  S.tool = t; document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); canvas.style.cursor = t === 'measure' || t === 'comment' ? 'crosshair' : 'default'; S.mPick = null; S.mHover = null;
  if (t === 'section') { if (!S.section.on && S.sum) { setupSection(); S.section.on = true; exec('Snitt på', () => { S.section.on = true; emit('section'); }, () => { S.section.on = false; emit('section'); }); } }
  if (t === 'info' && S.sel.size) { UI.rightTab = 'ifc'; $('app').classList.remove('noright'); S.userClosedRight = false; renderRight(); resize(); }
  if (t === 'measure') { $('app').classList.remove('noright'); rightAuto = false; renderRight(); setTimeout(resize, 240); }
  if (t === 'measure') toast('Klicka två punkter. Fäster mot hörn (grönt) och kanter (blått).', 2400); if (t === 'comment') toast('Klicka där kommentaren ska sitta.', 2200); if (t === 'section') toast('Dra i den blå handtaget – eller klicka på modellen för att lägga snittet där.', 2800);
  ctxUi(); renderRight(); redraw();
};
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => runAction(b.dataset.tool));
A.click = (vp, lx, ly, add, e) => {
  closeMenu(); const t = S.tool; if (!S.loaded && t !== 'comment') return;
  const h = S.loaded ? import_pick(vp, lx, ly) : null; const q = { vp, x: lx, y: ly, px: vp.rect.x + lx, py: vp.rect.y + ly };
  if (t === 'measure') { if (!h) return; const s = snap(h, q); if (!S.mPick) S.mPick = s.p; else { const a = S.mPick, b = s.p, m = { a, b, d: dist3(a, b), dx: b[0] - a[0], dy: b[1] - a[1], dz: b[2] - a[2] }; S.measures.push(m); S.mPick = null; exec('Mått ' + fmtD(m.d), () => { if (!S.measures.includes(m)) S.measures.push(m); emit('measures'); }, () => { S.measures = S.measures.filter(x => x !== m); emit('measures'); }); emit('measures'); } redraw(); return; }
  if (t === 'comment') { composeComment(h, e); return; }
  if (t === 'section') { if (h) { const ax = { x: 0, y: 1, z: 2 }[S.section.axis]; S.section.pos = Math.max(S.section.min, Math.min(S.section.max, h.p[ax])); emit('section'); redraw(); } return; }
  if (!h) { if (!add) A.clearSel(); return; } if (add) A.toggleSel(h.oi); else A.selectOnly(h.oi);
  if (t === 'info') { UI.rightTab = 'ifc'; renderRight(); }
};
import { pick as import_pick } from './view.js';
A.removeMeasure = i => { const m = S.measures[i]; if (!m) return; exec('Ta bort mått', () => { S.measures = S.measures.filter(x => x !== m); emit('measures'); }, () => { S.measures.splice(Math.min(i, S.measures.length), 0, m); emit('measures'); }); redraw(); };
on('section', () => { redraw(); ctxUi(); }); on('sectionDone', () => { }); on('measures', () => { redraw(); if (A.renderMeasures) A.renderMeasures(); });

/* ---------- Högerklicksmeny ---------- */
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
A.contextMenu = (vp, lx, ly, e) => {
  closeMenu(); const h = S.loaded ? import_pick(vp, lx, ly) : null; if (h && !S.sel.has(h.oi)) A.selectOnly(h.oi);
  const items = h ? [['info', 'Egenskaper', () => { UI.rightTab = 'obj'; $('app').classList.remove('noright'); S.userClosedRight = false; renderRight(); resize(); }], ['ruler', 'Mät', () => A.setTool('measure')], ['comment', 'Kommentera', () => A.setTool('comment')], ['eyeoff', 'Dölj', () => A.hideSel()], ['iso', 'Isolera', () => A.isolate()], ['focus', 'Fokusera', () => fitSel()]] : [['eye', 'Visa allt', () => A.showAll()], ['home', 'Anpassa till modellen', () => fitAll()]];
  menuEl = document.createElement('div'); menuEl.className = 'glass'; menuEl.style.cssText = 'position:fixed;z-index:20;padding:6px;min-width:190px'; menuEl.style.left = Math.min(e.clientX, innerWidth - 210) + 'px'; menuEl.style.top = Math.min(e.clientY, innerHeight - items.length * 38 - 20) + 'px';
  menuEl.innerHTML = items.map(([i, l], k) => `<button data-k="${k}" style="display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:var(--ink);padding:8px 10px;border-radius:9px;font:inherit;cursor:pointer;text-align:left">${ic(i)}<span>${l}</span></button>`).join(''); document.body.append(menuEl);
  menuEl.querySelectorAll('button').forEach(b => { b.onmouseenter = () => b.style.background = 'rgba(23,105,255,.1)'; b.onmouseleave = () => b.style.background = 'none'; b.onclick = () => { const f = items[+b.dataset.k][2]; closeMenu(); f(); }; });
  setTimeout(() => document.addEventListener('pointerdown', function f(ev) { if (menuEl && !menuEl.contains(ev.target)) closeMenu(); document.removeEventListener('pointerdown', f); }), 0);
};

/* ---------- Kontextfält och etikett ---------- */
function ctxUi() {
  const c = $('ctxbar'); let btns = [];
  if (S.tool === 'section' && S.section.on) btns = [['ax-x', 'section', 'X'], ['ax-y', 'section', 'Y'], ['ax-z', 'section', 'Z'], ['flip', 'ortho', 'Vänd'], ['secoff', 'close', 'Avsluta']];
  else if (S.tool === 'measure') btns = [['mclear', 'trash', 'Rensa mått'], ['mdone', 'check', 'Klar']];
  else if (S.sel.size) btns = [['props', 'info', 'Egenskaper'], ['hide', 'eyeoff', 'Dölj'], ['iso', 'iso', 'Isolera'], ['focus', 'focus', 'Fokusera'], ['comment', 'comment', 'Kommentera'], ['ghost', 'layers', S.ghost ? 'Nedtonat' : 'Nedtona']];
  if (S.section.on && S.tool !== 'section' && !btns.length) btns = [['secedit', 'section', 'Redigera snitt'], ['secoff', 'close', 'Avsluta snitt']];
  c.hidden = !btns.length || !S.loaded; if (c.hidden) return;
  c.innerHTML = btns.map(([k, i, l]) => `<button data-k="${k}" class="${(k === 'ax-' + S.section.axis) || (k === 'ghost' && S.ghost) ? 'on' : ''}">${ic(i)}<span>${l}</span></button>`).join('');
  c.querySelectorAll('button').forEach(b => b.onclick = () => ctxAct(b.dataset.k));
}
function ctxAct(k) {
  if (k.startsWith('ax-')) { setupSection(k[3]); S.section.on = true; emit('section'); } else if (k === 'flip') { S.section.flip = !S.section.flip; emit('section'); } else if (k === 'secoff') { S.section.on = false; A.setTool('select'); emit('section'); } else if (k === 'secedit') A.setTool('section');
  else if (k === 'mclear') { const l = S.measures.slice(); exec('Rensa mått', () => { S.measures = []; emit('measures'); }, () => { S.measures = l; emit('measures'); }); } else if (k === 'mdone') A.setTool('select');
  else if (k === 'props') { UI.rightTab = 'obj'; $('app').classList.remove('noright'); S.userClosedRight = false; renderRight(); resize(); } else if (k === 'hide') A.hideSel(); else if (k === 'iso') A.isolate(); else if (k === 'focus') fitSel(); else if (k === 'comment') A.setTool('comment'); else if (k === 'ghost') { A.toggleGhost(); ctxUi(); }
}
on('frame', () => { // etiketten följer det markerade objektet
  const chip = $('chip'); if (S.sel.size !== 1 || !S.loaded || V.vps[0].cam.ortho && false) { chip.hidden = true; return; } const oi = [...S.sel][0], b = boxOf.get(oi); if (!b) { chip.hidden = true; return; }
  const vp = V.vps[0], p = project(vp, [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[5]]); if (!p || !S.shown[oi]) { chip.hidden = true; return; }
  const cr = canvas.getBoundingClientRect(), x = p[0] / S.dpr, y = p[1] / S.dpr; if (x < 40 || y < 70 || x > cr.width - 40 || y > cr.height - 20) { chip.hidden = true; return; }
  if (chip.dataset.oi !== String(oi)) { chip.dataset.oi = oi; const d = [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; const L = Math.max(d[0], d[1]); const name = S.objName[oi] || nice(S.classes[S.objClass[oi]]);
    chip.innerHTML = `<span class="cd"></span><div><b></b><small>${esc(nice(S.classes[S.objClass[oi]]))} · L ${fmtN(L)} m</small></div><button data-k="props" title="Egenskaper">${ic('info')}</button><button data-k="measure" title="Mått">${ic('ruler')}</button><button data-k="comment" title="Kommentar">${ic('comment')}</button>`; chip.querySelector('b').textContent = name;
    chip.querySelector('[data-k=props]').onclick = () => ctxAct('props'); chip.querySelector('[data-k=measure]').onclick = () => A.setTool('measure'); chip.querySelector('[data-k=comment]').onclick = () => A.setTool('comment'); }
  chip.hidden = false; chip.style.left = x + 'px'; chip.style.top = y + 'px';
});

/* ---------- Sparade vyer ---------- */
A.saveView = async () => {
  if (!S.loaded) return; const name = await prompt2('Spara vy', 'Namn på vyn', 'Vy ' + (S.views.length + 1), 'Spara'); if (name == null) return;
  const c = document.createElement('canvas'); c.width = 144; c.height = 96; const g = c.getContext('2d'); draw(); g.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 144, 96);
  const hidden = []; for (let i = 0; i < S.nObj; i++) if (!S.shown[i]) hidden.push(i);
  const v = { name: name || 'Vy', t: Date.now(), cam: camState(V.vps[0]), section: { ...S.section, handle: undefined }, hidden: hidden.length > 5000 ? null : hidden, thumb: c.toDataURL('image/jpeg', 0.7) };
  exec('Spara vy ' + v.name, () => { S.views.push(v); store.set('vw:' + S.fileKey, S.views); if (UI.leftTab === 'views') renderLeftModel(); }, () => { S.views = S.views.filter(x => x !== v); store.set('vw:' + S.fileKey, S.views); if (UI.leftTab === 'views') renderLeftModel(); });
  toast('Vy sparad: ' + v.name);
};
A.restoreView = v => { const vp = V.vps[0]; vp.cam.ortho = !!v.cam.ortho; animateTo(vp, v.cam, 600); if (v.section) { Object.assign(S.section, v.section); emit('section'); } if (v.hidden) { const hid = new Set(v.hidden); for (let i = 0; i < S.nObj; i++) { const want = !hid.has(i); if (!!S.shown[i] !== want) setVisible([i], want); } refreshTreeVis(); } toast('Vy: ' + v.name, 1500); };
A.deleteView = i => { const v = S.views[i]; exec('Ta bort vy', () => { S.views = S.views.filter(x => x !== v); store.set('vw:' + S.fileKey, S.views); renderLeftModel(); }, () => { S.views.splice(i, 0, v); store.set('vw:' + S.fileKey, S.views); renderLeftModel(); }); };

/* ---------- Kommentarer ---------- */
function composeComment(h, e) {
  const p = h ? h.p : (() => { const c = V.vps[0].cam; return [c.tx, c.ty, c.tz]; })(); const oi = h ? h.oi : -1;
  const dlg = dialog('Ny kommentar', `<label class="fld">${oi >= 0 ? 'Kopplas till ' + esc(S.objName[oi] || nice(S.classes[S.objClass[oi]])) : 'Fri punkt i modellen'}<textarea id="cmT" placeholder="Skriv en kommentar eller en fråga…"></textarea></label><div class="row"><button class="btn primary" id="cmOk">Spara kommentar</button><button class="btn" data-close>Avbryt</button></div>`); const ta = dlg.el.querySelector('#cmT'); ta.focus();
  dlg.el.querySelector('#cmOk').onclick = () => { const text = ta.value.trim(); if (!text) return; const c = { id: Date.now().toString(36), p, text, author: S.user.name, t: Date.now(), status: 'Öppen', guid: oi >= 0 ? S.objGuid[oi] : '', objName: oi >= 0 ? (S.objName[oi] || nice(S.classes[S.objClass[oi]])) : '', cam: camState(V.vps[0]) }; dlg.close();
    exec('Kommentar', () => { S.comments.push(c); store.set('cm:' + S.fileKey, S.comments); renderLeftModel(); redraw(); }, () => { S.comments = S.comments.filter(x => x !== c); store.set('cm:' + S.fileKey, S.comments); renderLeftModel(); redraw(); }); A.setTool('select'); };
}
A.openComment = i => { const c = S.comments[i]; if (!c) return; animateTo(V.vps[0], c.cam, 500); const dlg = dialog('Kommentar ' + (i + 1), `<p style="margin:4px 0 8px;font-size:14px">${esc(c.text)}</p><small class="muted">${esc(c.author)} · ${esc(new Date(c.t).toLocaleString('sv'))}${c.objName ? ' · ' + esc(c.objName) : ''}</small><div class="row" style="margin-top:12px"><button class="btn ${c.status === 'Löst' ? '' : 'primary'}" id="cmSt">${c.status === 'Löst' ? 'Öppna igen' : 'Markera som löst'}</button><button class="btn" id="cmGo">Visa objektet</button><button class="btn ghost" data-close>Stäng</button></div>`);
  dlg.el.querySelector('#cmSt').onclick = () => { c.status = c.status === 'Löst' ? 'Öppen' : 'Löst'; store.set('cm:' + S.fileKey, S.comments); dlg.close(); renderLeftModel(); redraw(); }; dlg.el.querySelector('#cmGo').onclick = () => { dlg.close(); const oi = S.guidIx.get(c.guid); if (oi != null) { A.selectOnly(oi); fitSel(); } }; };
A.deleteComment = i => { const c = S.comments[i]; exec('Ta bort kommentar', () => { S.comments = S.comments.filter(x => x !== c); store.set('cm:' + S.fileKey, S.comments); renderLeftModel(); redraw(); }, () => { S.comments.splice(i, 0, c); store.set('cm:' + S.fileKey, S.comments); renderLeftModel(); redraw(); }); };
A.exportComments = () => { const o = S.comments.map((c, i) => ({ nr: i + 1, text: c.text, status: c.status, author: c.author, tid: new Date(c.t).toISOString(), objekt: c.objName, globalId: c.guid, plats: c.p.map((v, k) => +(v + S.origin[k]).toFixed(3)) })); dl(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }), (S.fileName || 'modell').replace(/\.ifc$/i, '') + ' kommentarer.json'); };
export function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); }
A.download = dl;

/* ---------- Redigering av egenskaper ---------- */
A.editAttr = (oi, ix, oldV, newV, inp) => {
  if (oldV === newV) return; const ok = () => { inp.classList.add('dirty'); S.edits = R.E.model_edits(); $('bExport').disabled = !S.edits; };
  const set = v => callStr((p, n) => R.E.model_set_attr(oi, ix, p, n), v); if (set(newV) !== 0) return toast('Kunde inte ändra');
  if (ix === 2) S.objName[oi] = newV; ok(); emit('edited');
  exec('Ändra ' + ['', '', 'namn', 'beskrivning', 'objekttyp', '', '', 'taggnr'][ix], () => { set(newV); if (ix === 2) S.objName[oi] = newV; renderRight(); }, () => { set(oldV); if (ix === 2) S.objName[oi] = oldV; renderRight(); }); renderRight();
};
A.editProp = (oi, prop, oldV, newV, inp) => {
  if (oldV === newV) return; const set = v => callStr((p, n) => R.E.model_set_prop(prop, p, n), v); const rc = set(newV); if (rc !== 0) { toast(rc < 0 ? outText(-rc) : 'Kunde inte ändra', 4000); inp.value = oldV; return; }
  S.edits = R.E.model_edits(); $('bExport').disabled = !S.edits; emit('edited'); exec('Ändra egenskap', () => { set(newV); renderRight(); }, () => { set(oldV); renderRight(); }); renderRight();
};
A.exportIfc = async () => {
  const E = R.E, ed = outJson(E.model_edited_sources()); if (!ed.length) return toast('Det finns inga ändringar att spara.');
  const files = ed.map(src => { const n = E.model_export(src); return { name: S.srcBuf[src].name.replace(/\.ifc$/i, '') + ' (ändrad)', bytes: outBytes(n) }; });
  if (files.length === 1) { const name = await prompt2('Exportera IFC', 'Filnamn', files[0].name, 'Exportera'); if (name == null) return; files[0].name = name; }
  let toTC = false; if (A.tcAvailable && A.tcAvailable()) { const r = await choice('Spara', 'Var ska ' + (files.length > 1 ? 'filerna' : 'filen') + ' sparas?', ['Dator', 'Trimble Connect']); if (r == null) return; toTC = r === 'Trimble Connect'; }
  for (const f of files) { const fn = f.name.replace(/\.ifc$/i, '') + '.ifc'; if (toTC) await A.saveToTC(f.bytes, fn); else dl(new Blob([f.bytes], { type: 'application/x-step' }), fn); }
  if (!toTC) toast(files.length > 1 ? `${files.length} IFC-filer sparade med dina ändringar` : 'Ny IFC-fil sparad med dina ändringar');
};
$('bExport').onclick = () => A.exportIfc(); $('bOpen').onclick = () => { if (A.tcAvailable && A.tcAvailable()) return A.openFromTC(); $('file').click(); };

/* ---------- Flikar, paneler, tema ---------- */
export function setTab(tab, keepLeft) {
  S.tab = tab; document.body.className = 'mode-' + tab; document.querySelectorAll('#topTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const lt = { model: 'Modell', drawings: 'Ritningar', plan: 'Tidplan', docs: 'Dokument', qty: 'Mängdning', clash: 'Kollisionskontroll' }[tab]; $('lTitle').textContent = lt;
  $('timeline').hidden = tab !== 'plan'; if (tab !== 'plan' && A.planOff) A.planOff(); if (tab !== 'clash' && A.clashOff) A.clashOff();
  if (tab === 'model') renderLeftModel(); else if (tab === 'qty') A.renderQty(); else if (tab === 'clash') A.renderClash(); else if (tab === 'plan') A.renderPlan(); else A.renderFiles(tab);
  $('rTitle').textContent = tab === 'clash' ? 'Kollision' : 'Egenskaper'; $('rtabs').hidden = tab === 'clash'; renderRight(); setTimeout(resize, 240);
}
$('topTabs').onclick = e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); };
$('lClose').onclick = () => { $('app').classList.toggle('noleft'); edgeUi(); setTimeout(resize, 240); }; $('rClose').onclick = () => { $('app').classList.add('noright'); S.userClosedRight = true; rightAuto = false; edgeUi(); setTimeout(resize, 240); };
$('rMenu').onclick = () => { const ex = [['Exportera IFC', () => A.exportIfc()], ['Visa alla egenskaper (IFC)', () => { UI.rightTab = 'ifc'; renderRight(); }], ['Ångra senaste', () => A.undo()]]; const d = dialog('Fler val', ex.map(([l], i) => `<button class="btn wide" style="margin-bottom:8px" data-i="${i}">${esc(l)}</button>`).join('')); d.el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { d.close(); ex[+b.dataset.i][1](); }); };
function edgeUi() { let l = $('edgeL'), r = $('edgeR'); const app = $('app');
  if (!l) { l = Object.assign(document.createElement('button'), { id: 'edgeL', className: 'glass', title: 'Visa modellpanelen' }); l.style.cssText = 'position:absolute;left:8px;top:50%;width:26px;height:56px;border-radius:12px;border:0;color:var(--ink);cursor:pointer;display:none;z-index:3'; l.innerHTML = ic('chev'); l.onclick = () => { app.classList.remove('noleft'); edgeUi(); setTimeout(resize, 240); }; $('stage').append(l);
    r = Object.assign(document.createElement('button'), { id: 'edgeR', className: 'glass', title: 'Visa egenskaper' }); r.style.cssText = 'position:absolute;right:8px;top:50%;width:26px;height:56px;border-radius:12px;border:0;color:var(--ink);cursor:pointer;display:none;z-index:3;transform:rotate(180deg)'; r.innerHTML = ic('chev'); r.onclick = () => { app.classList.remove('noright'); S.userClosedRight = false; edgeUi(); renderRight(); setTimeout(resize, 240); }; $('stage').append(r); }
  l.style.display = app.classList.contains('noleft') ? 'block' : 'none'; r.style.display = app.classList.contains('noright') ? 'block' : 'none'; }
new MutationObserver(edgeUi).observe($('app'), { attributes: true, attributeFilter: ['class'] });
$('bTheme').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('theme', r.dataset.theme); redraw(); };
const th = store.get('theme', null); if (th) document.documentElement.dataset.theme = th;
$('bFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else $('stage').requestFullscreen && $('stage').requestFullscreen(); };
$('vMode').onchange = e => { layoutViewports(e.target.value === '3d' ? '3d' : e.target.value); };
$('mmBig').onclick = () => $('minimap').classList.toggle('big');

/* ---------- Arbetsytor (sparade layouter) ---------- */
const WS0 = [{ name: 'Modellkontroll', tab: 'clash', vMode: 'split', left: true, right: true, ghost: true, colorBy: 'class' }, { name: 'Stålmontage', tab: 'plan', vMode: '3d', left: true, right: false, ghost: false, colorBy: 'orig', only: 'Stålkonstruktion' },
  { name: 'Prefab', tab: 'plan', vMode: '3d', left: true, right: true, ghost: false, colorBy: 'cont' }, { name: 'Mängdning', tab: 'qty', vMode: '3d', left: true, right: false, ghost: false, colorBy: 'class' }];
function applyWs(w) {
  const app = $('app'); app.classList.toggle('noleft', !w.left); app.classList.toggle('noright', !w.right); S.userClosedRight = !w.right; $('vMode').value = w.vMode; layoutViewports(w.vMode === '3d' ? '3d' : w.vMode); S.ghost = !!w.ghost; S.colorBy = w.colorBy || 'orig';
  if (w.only && S.loaded) { const keep = [], hide = []; for (let i = 0; i < S.nObj; i++) (categoryOf(S.classes[S.objClass[i]]) === w.only ? keep : hide).push(i); if (hide.length && keep.length) A.setVis(hide, false, 'Arbetsyta ' + w.name); }
  setTab(w.tab); refreshFlags(); setTimeout(resize, 260); toast('Arbetsyta: ' + w.name, 1800);
}
$('bWs').onclick = () => {
  const mine = store.get('ws', []), all = [...WS0, ...mine]; const d = dialog('Arbetsytor', `<p class="muted" style="margin-top:0">Spara hur du vill ha editorn (flik, vyer, paneler, färgning) och byt snabbt mellan uppgifter.</p>${all.map((w, i) => `<div class="fl-it" data-i="${i}"><div style="flex:1"><b>${esc(w.name)}</b><small>${esc({ model: 'Modell', clash: 'Kollisionskontroll', plan: 'Tidplan', qty: 'Mängdning', drawings: 'Ritningar', docs: 'Dokument' }[w.tab])} · ${w.vMode === '3d' ? 'enkel vy' : w.vMode === 'split' ? 'delad vy' : 'flera paneler'}${w.only ? ' · bara ' + esc(w.only.toLowerCase()) : ''}</small></div>${i >= WS0.length ? `<button class="x" data-del="${i - WS0.length}" title="Ta bort">${ic('trash')}</button>` : ''}</div>`).join('')}<div class="row"><button class="btn primary" id="wsSave">${ic('plus')} Spara aktuell layout…</button></div>`);
  d.el.querySelectorAll('.fl-it').forEach(el => el.onclick = ev => { const del = ev.target.closest('[data-del]'); if (del) { mine.splice(+del.dataset.del, 1); store.set('ws', mine); d.close(); $('bWs').click(); return; } d.close(); applyWs(all[+el.dataset.i]); });
  d.el.querySelector('#wsSave').onclick = async () => { d.close(); const name = await prompt2('Spara arbetsyta', 'Namn', 'Min arbetsyta', 'Spara'); if (!name) return; const app = $('app'); mine.push({ name, tab: S.tab, vMode: V.layout, left: !app.classList.contains('noleft'), right: !app.classList.contains('noright'), ghost: S.ghost, colorBy: S.colorBy }); store.set('ws', mine); toast('Arbetsyta sparad: ' + name); };
};

/* ---------- Hjälp och inställningar ---------- */
$('bHelp').onclick = () => dialog('Navigering och genvägar', `<table class="qt" style="font-size:13.5px"><tr><th>Handling</th><th style="text-align:left">Beteende</th></tr>
<tr class="r"><td>Vänsterklick</td><td style="text-align:left">Välj objekt – blå kontur och en liten etikett med snabbval</td></tr>
<tr class="r"><td>Vänster eller mitten + dra</td><td style="text-align:left">Rotera runt markeringen (annars punkten under pekaren)</td></tr>
<tr class="r"><td>Höger eller Skift + dra</td><td style="text-align:left">Panorera</td></tr>
<tr class="r"><td>Scrolla</td><td style="text-align:left">Zooma mot punkten under pekaren</td></tr>
<tr class="r"><td>Dubbelklicka objekt</td><td style="text-align:left">Fokusera med mjuk kamerarörelse</td></tr>
<tr class="r"><td>Håll mittenknappen stilla</td><td style="text-align:left">Cirkulär snabbmeny med åtta verktyg – dra åt ett håll och släpp</td></tr>
<tr class="r"><td>Håll Ctrl</td><td style="text-align:left">Visar genvägarna</td></tr>
<tr class="r"><td>Ctrl+Z / Ctrl+Y</td><td style="text-align:left">Ångra / gör om</td></tr></table><p class="muted">På pekskärm: håll ett finger stilla för snabbmenyn, nyp för att zooma, två fingrar för att panorera.</p>`, { wide: true });
$('bSettings').onclick = () => {
  const k = keys(), rad = radialItems(), names = { select: 'Välj', measure: 'Mät', comment: 'Kommentera', section: 'Sektion', hide: 'Visa/dölj', info: 'Inspektera', view: 'Spara vy', focus: 'Fokusera' };
  const d = dialog('Inställningar', `<h4 style="margin:0 0 6px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)">Kortkommandon</h4><div class="two">${Object.keys(KEYS0).map(a => `<label class="fld">${esc({ select: 'Välj', measure: 'Mät', info: 'Info', section: 'Skärning', comment: 'Kommentar', hide: 'Dölj', focus: 'Fokusera', ghost: 'Nedtona' }[a])}<input maxlength="1" data-k="${a}" value="${esc(k[a])}"></label>`).join('')}</div>
  <h4 style="margin:12px 0 6px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)">Snabbmenyns åtta lägen (medurs från toppen)</h4><div class="two">${rad.map((r, i) => `<label class="fld">Läge ${i + 1}<select data-r="${i}">${Object.entries(names).map(([v, l]) => `<option value="${v}" ${v === r ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}</div>
  <div class="row"><button class="btn primary" id="stOk">Spara</button><button class="btn ghost" id="stReset">Återställ</button></div>`);
  d.el.querySelector('#stOk').onclick = () => { const nk = {}; d.el.querySelectorAll('[data-k]').forEach(i => { if (i.value) nk[i.dataset.k] = i.value.toLowerCase(); }); store.set('keys', nk); store.set('radial', [...d.el.querySelectorAll('[data-r]')].map(s => s.value)); d.close(); toast('Inställningar sparade'); };
  d.el.querySelector('#stReset').onclick = () => { store.set('keys', {}); store.set('radial', RADIAL0); d.close(); toast('Återställt'); };
};

/* ---------- Start ---------- */
for (const id of ['btnOpen2', 'projBtn']) $(id).onclick = () => { if (A.tcAvailable && A.tcAvailable() && id === 'projBtn') return A.openFromTC(); $('file').accept = '.ifc,.xyz,.txt,.csv,.ply,.las'; $('file').click(); };
$('file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await openFile(f); };
const stage = $('stage'); ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drag'); })); ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.remove('drag'); }));
stage.addEventListener('drop', async e => { const f = e.dataTransfer.files[0]; if (f) await openFile(f); });
$('btnSample').onclick = async () => { busy('Hämtar exempel …'); const r = await fetch('sample.ifc'); await loadIfc(await r.arrayBuffer(), 'Exempelbyggnad.ifc'); };
$('btnTC').onclick = () => A.openFromTC();
new ResizeObserver(() => resize()).observe($('stage'));
window.addEventListener('message', async e => { const m = e.data; if (!m || m.type !== 'rust3d-open' || !m.buffer) return; if (m.kind === 'cloud') await A.loadCloud(m.buffer, m.name || 'moln.xyz'); else await loadIfc(m.buffer, m.name || 'modell.ifc'); });
const mkBtn = () => { }; void mkBtn;
$('avatar').textContent = S.user.initials;

let lastT = performance.now(), frames = 0;
function loop(t) { if (S.dirty) { draw(); frames++; } if (t - lastT > 1000) { S.fps = frames * 1000 / (t - lastT); frames = 0; lastT = t; } requestAnimationFrame(loop); }
window.__r3d = { S, V, R, A, UI, H, loadIfc, setTab, pick: import_pick, project, draw, fitAll, exec, camState, resetViews, layoutViewports, refreshFlags };

(async () => {
  try { await bootEngine(); initGL(); } catch (e) { toast('Kunde inte starta: ' + e.message, 9000); return; }
  hydrate(); resetViews(); resize(); $('app').classList.add('noright'); edgeUi(); $('minimap').hidden = true; ctxUi(); histUi(); document.documentElement.dataset.ready = '1'; requestAnimationFrame(loop);
  if (A.bridgeInit) A.bridgeInit();
  const u = new URLSearchParams(location.search).get('url'); if (u) { try { const r = await fetch(u); await loadIfc(await r.arrayBuffer(), u.split('/').pop()); } catch (e) { toast('Kunde inte hämta filen'); } }
})();
