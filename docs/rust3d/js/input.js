/* Mus, tangentbord och beröring. Vänster: välj/rotera · mitten: rotera, håll stilla = snabbmeny · höger/Skift: panorera · hjul: zooma mot pekaren. */
import { $, S, A, R, ic, esc, emit, on, redraw, store, toast, dist3 } from './core.js';
import { V, vpAt, pick, ray, project, canvas, animateTo, matrices, fitSel, fitAll, selBox, stdView, M4 } from './view.js';

export const KEYS0 = { select: 'v', measure: 'm', info: 'i', section: 'c', comment: 'k', hide: 'h', focus: 'f', ghost: 'g' };
export const keys = () => ({ ...KEYS0, ...store.get('keys', {}) });
export const RADIAL0 = ['select', 'measure', 'comment', 'section', 'hide', 'info', 'view', 'focus'];
const RLAB = { select: ['Välj', 'select'], measure: ['Mät', 'ruler'], comment: ['Kommentera', 'comment'], section: ['Sektion', 'section'], hide: ['Visa/dölj', 'eyeoff'], info: ['Inspektera', 'info'], view: ['Spara vy', 'view'], focus: ['Fokusera', 'focus'] };
export const radialItems = () => store.get('radial', RADIAL0);

const ptrs = new Map(); let drag = null, mmbTimer = 0, radial = null, movT = 0;
/* Under rörelse hoppar vi över konturlinjerna i mycket stora modeller så att vyn känns lätt. */
function moving() { S.moving = true; clearTimeout(movT); movT = setTimeout(() => { S.moving = false; redraw(); }, 170); }
const stageEl = $('stage');
const rectOf = () => stageEl.getBoundingClientRect();

/* Rotationspunkt: markeringen, annars punkten under pekaren, annars nuvarande mål. Ögat står kvar – bara målet byts. */
function setPivot(vp, lx, ly) {
  const c = vp.cam; let p = null; const sb = S.sel.size ? selBox() : null;
  if (sb) p = [(sb[0][0] + sb[1][0]) / 2, (sb[0][1] + sb[1][1]) / 2, (sb[0][2] + sb[1][2]) / 2]; else { const h = pick(vp, lx, ly); if (h) p = h.p; }
  if (!p) return; matrices(vp);
  const e = vp.eye; const d = [e[0] - p[0], e[1] - p[1], e[2] - p[2]], L = Math.hypot(...d); if (L < 0.05) return;
  c.tx = p[0]; c.ty = p[1]; c.tz = p[2]; c.dist = L; c.pitch = Math.asin(Math.max(-1, Math.min(1, d[2] / L))); c.yaw = Math.atan2(d[1], d[0]);
}
function cursorPoint(vp, lx, ly) { const h = S.loaded ? pick(vp, lx, ly) : null; if (h) return h.p; const r = ray(vp, lx, ly), c = vp.cam, n = [vp.eye[0] - c.tx, vp.eye[1] - c.ty, vp.eye[2] - c.tz], nl = Math.hypot(...n) || 1, nn = n.map(v => v / nl); const den = r.d[0] * nn[0] + r.d[1] * nn[1] + r.d[2] * nn[2]; if (Math.abs(den) < 1e-6) return [c.tx, c.ty, c.tz]; const t = ((c.tx - r.o[0]) * nn[0] + (c.ty - r.o[1]) * nn[1] + (c.tz - r.o[2]) * nn[2]) / den; return [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t]; }
function pan(vp, dx, dy) { // dx,dy i css-pixlar
  const c = vp.cam, hpx = vp.rect.h / S.dpr, h = c.ortho ? (vp.kind === 'persp' ? c.dist * Math.tan(c.fov / 2) : c.half) : c.dist * Math.tan(c.fov / 2), s = 2 * h / hpx;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), right = [-sy, cy, 0], up = [-sp * cy, -sp * sy, cp];
  c.tx += (-dx * right[0] + dy * up[0]) * s; c.ty += (-dx * right[1] + dy * up[1]) * s; c.tz += dy * up[2] * s; redraw();
}
export function zoomAt(vp, lx, ly, f) {
  const c = vp.cam; if (!S.loaded && !S.cloud) return;
  if (c.ortho && vp.kind !== 'persp') { const before = cursorPlane(vp, lx, ly); c.half = Math.max(0.2, Math.min(S.radius * 20, c.half * f)); matrices(vp); const after = cursorPlane(vp, lx, ly); c.tx += before[0] - after[0]; c.ty += before[1] - after[1]; c.tz += before[2] - after[2]; redraw(); return; }
  const p = cursorPoint(vp, lx, ly), nd = Math.max(0.15, Math.min(S.radius * 30, c.dist * f)), k = 1 - nd / c.dist; c.tx += (p[0] - c.tx) * k; c.ty += (p[1] - c.ty) * k; c.tz += (p[2] - c.tz) * k; c.dist = nd; redraw();
}
function cursorPlane(vp, lx, ly) { const r = ray(vp, lx, ly), c = vp.cam, n = [Math.cos(c.pitch) * Math.cos(c.yaw), Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch)]; const den = r.d[0] * -n[0] + r.d[1] * -n[1] + r.d[2] * -n[2]; const t = den ? ((c.tx - r.o[0]) * -n[0] + (c.ty - r.o[1]) * -n[1] + (c.tz - r.o[2]) * -n[2]) / den : 0; return [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t]; }
export const zoomCenter = f => { const vp = V.vps[V.active], r = vp.rect; zoomAt(vp, r.w / 2, r.h / 2, f); };

/* ---------- Radiell snabbmeny ---------- */
function openRadial(cx, cy) {
  const el = $('radial'), br = rectOf(), items = radialItems(); el.hidden = false; el.style.left = (cx - br.left) + 'px'; el.style.top = (cy - br.top) + 'px';
  el.innerHTML = '<div class="ring"></div><div class="mid">släpp<br>för att välja</div><div class="lab" hidden></div>' + items.map((k, i) => { const a = -Math.PI / 2 + i * Math.PI / 4, x = 150 + Math.cos(a) * 104, y = 150 + Math.sin(a) * 104; return `<div class="it" data-k="${k}" style="left:${x}px;top:${y}px">${ic(RLAB[k][1])}<span>${RLAB[k][0]}</span></div>`; }).join('');
  radial = { x: cx, y: cy, sel: null, items }; stageEl.classList.add('radialOpen');
}
function radialMove(x, y) {
  if (!radial) return; const dx = x - radial.x, dy = y - radial.y, d = Math.hypot(dx, dy); let k = null;
  if (d > 34) { const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2 + Math.PI / 8) % (Math.PI * 2); k = radial.items[Math.floor(a / (Math.PI / 4)) % 8]; }
  if (k === radial.sel) return; radial.sel = k; const el = $('radial'); el.querySelectorAll('.it').forEach(i => i.classList.toggle('on', i.dataset.k === k)); const lab = el.querySelector('.lab'); lab.hidden = !k; if (k) lab.textContent = RLAB[k][0];
}
function closeRadial(activate) { if (!radial) return; const k = radial.sel; $('radial').hidden = true; radial = null; stageEl.classList.remove('radialOpen'); if (activate && k) runAction(k); }
export function runAction(k) {
  if (['select', 'measure', 'info', 'section', 'comment'].includes(k)) return A.setTool(k === 'section' && S.tool === 'section' ? 'select' : k);
  if (k === 'hide') return S.sel.size ? A.hideSel() : A.showAll();
  if (k === 'view') return A.saveView(); if (k === 'focus') return fitSel(); if (k === 'ghost') return A.toggleGhost();
}

/* ---------- Pekare ---------- */
const pinchDist = () => { const v = [...ptrs.values()]; return v.length < 2 ? 0 : Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); };
const pinchCenter = () => { const v = [...ptrs.values()]; return v.length < 2 ? [0, 0] : [(v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2]; };
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); const q = vpAt(e.clientX, e.clientY); V.active = q.i; redraw();
  if (ptrs.size === 2) { clearTimeout(mmbTimer); drag = { two: true, d: pinchDist(), c: pinchCenter(), vp: q.vp }; return; }
  const sec = S.section; const h = sec.on && sec.handle; 
  if (e.button === 0 && h && Math.hypot(q.px - h.x, q.py - h.y) < 22 * S.dpr) { drag = { kind: 'section', vp: q.vp, x: e.clientX, y: e.clientY }; return; }
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, shift: e.shiftKey, moved: false, ctrl: e.ctrlKey || e.metaKey, vp: q.vp, lx: q.x, ly: q.y, pivoted: false, t: performance.now() };
  if (e.button === 1) { e.preventDefault(); mmbTimer = setTimeout(() => { if (drag && !drag.moved && drag.btn === 1) { drag.menu = true; openRadial(drag.sx, drag.sy); } }, 360); }
  if (e.pointerType === 'touch' && ptrs.size === 1) mmbTimer = setTimeout(() => { if (drag && !drag.moved && drag.btn === 0) { drag.menu = true; openRadial(drag.sx, drag.sy); } }, 650);
  if (S.zoomWin && e.button === 0) drag.zoomWin = true;
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p || !drag) { hover(e.clientX, e.clientY); return; }
  p.x = e.clientX; p.y = e.clientY;
  if (drag.two) { const d = pinchDist(), c = pinchCenter(); const f = drag.d / Math.max(d, 1); const vp = drag.vp, r = canvas.getBoundingClientRect(); zoomAt(vp, (c[0] - r.left) * S.dpr - vp.rect.x, (c[1] - r.top) * S.dpr - vp.rect.y, f); pan(vp, c[0] - drag.c[0], c[1] - drag.c[1]); drag.d = d; drag.c = c; return; }
  if (drag.kind === 'section') { sectionDrag(e); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.menu) { radialMove(e.clientX, e.clientY); return; }
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) { drag.moved = true; clearTimeout(mmbTimer); }
  if (!drag.moved) return;
  moving(); const vp = drag.vp, c = vp.cam;
  if (drag.zoomWin) { drag.rect = [drag.sx, drag.sy, e.clientX, e.clientY]; drawZoomRect(drag.rect); return; }
  const panning = drag.btn === 2 || drag.shift || (drag.btn === 1 && e.shiftKey) || (c.ortho && vp.kind !== 'persp');
  if (panning) pan(vp, dx, dy);
  else { if (!drag.pivoted) { setPivot(vp, drag.lx, drag.ly); drag.pivoted = true; } c.yaw -= dx * 0.0062; c.pitch = Math.max(-1.52, Math.min(1.52, c.pitch + dy * 0.0062)); canvas.style.cursor = 'grabbing'; redraw(); }
});
function drawZoomRect(r) { const z = $('zrect') || Object.assign(document.createElement('div'), { id: 'zrect' }); if (!z.parentNode) { z.style.cssText = 'position:fixed;border:2px dashed #1769ff;background:rgba(23,105,255,.1);pointer-events:none;z-index:9'; document.body.append(z); } const x = Math.min(r[0], r[2]), y = Math.min(r[1], r[3]); z.style.left = x + 'px'; z.style.top = y + 'px'; z.style.width = Math.abs(r[2] - r[0]) + 'px'; z.style.height = Math.abs(r[3] - r[1]) + 'px'; z.hidden = false; }
function sectionDrag(e) { // flytta snittplanet längs sin axel: närmaste punkt mellan musstrålen och axeln
  const vp = drag.vp, s = S.section, b = canvas.getBoundingClientRect(), lx = (e.clientX - b.left) * S.dpr - vp.rect.x, ly = (e.clientY - b.top) * S.dpr - vp.rect.y, r = ray(vp, lx, ly), ax = { x: 0, y: 1, z: 2 }[s.axis];
  const bb = S.sum.bbox, o = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], a = [0, 0, 0]; a[ax] = 1;
  const w0 = [r.o[0] - o[0], r.o[1] - o[1], r.o[2] - o[2]], bd = r.d[0] * a[0] + r.d[1] * a[1] + r.d[2] * a[2], dd = r.d[0] * w0[0] + r.d[1] * w0[1] + r.d[2] * w0[2], ee = a[0] * w0[0] + a[1] * w0[1] + a[2] * w0[2], den = 1 - bd * bd;
  if (Math.abs(den) < 1e-4) return; const t = (ee - bd * dd) / den; s.pos = Math.max(s.min, Math.min(s.max, o[ax] + t)); emit('section'); redraw();
}
function release(e) {
  const d = drag; clearTimeout(mmbTimer); ptrs.delete(e.pointerId); canvas.style.cursor = S.tool === 'measure' || S.tool === 'comment' ? 'crosshair' : 'default';
  if (!ptrs.size) drag = null; else if (ptrs.size === 1 && d && d.two) { const v = [...ptrs.values()][0]; drag = { x: v.x, y: v.y, sx: v.x, sy: v.y, btn: 0, moved: true, vp: d.vp }; }
  if (!d || d.two) return;
  if (d.kind === 'section') { emit('sectionDone'); return; }
  if (d.menu) { closeRadial(true); return; }
  if (d.zoomWin && d.rect) { const z = $('zrect'); if (z) z.hidden = true; S.zoomWin = false; $('vWin').classList.remove('on'); zoomToRect(d.vp, d.rect); return; }
  if (!d.moved) { if (e.button === 0) A.click(d.vp, d.lx, d.ly, d.ctrl || e.shiftKey, e); else if (e.button === 2) A.contextMenu(d.vp, d.lx, d.ly, e); }
}
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; closeRadial(false); });
function zoomToRect(vp, r) {
  const b = canvas.getBoundingClientRect(), x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]); if (x1 - x0 < 8) return;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, lx = (cx - b.left) * S.dpr - vp.rect.x, ly = (cy - b.top) * S.dpr - vp.rect.y, p = cursorPoint(vp, lx, ly), f = Math.max(0.05, (x1 - x0) / (vp.rect.w / S.dpr));
  const c = vp.cam; animateTo(vp, { tx: p[0], ty: p[1], tz: p[2], dist: Math.max(0.3, c.dist * f), half: Math.max(0.3, c.half * f) }, 380);
}
canvas.addEventListener('wheel', e => { e.preventDefault(); moving(); const q = vpAt(e.clientX, e.clientY); zoomAt(q.vp, q.x, q.y, Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0013))); }, { passive: false });
canvas.addEventListener('dblclick', e => { const q = vpAt(e.clientX, e.clientY), h = S.loaded ? pick(q.vp, q.x, q.y) : null; if (h) { A.selectOnly(h.oi); fitSel(380); } else fitAll(380); });
canvas.addEventListener('auxclick', e => e.preventDefault());
let hoverRaf = 0;
function hover(x, y) {
  if (hoverRaf || !S.loaded) return; hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; const q = vpAt(x, y), h = pick(q.vp, q.x, q.y); A.hoverObj(h, q);
    if (S.tool === 'measure') { S.mHover = h ? snap(h, q) : null; redraw(); } });
}
export function snap(h, q) {
  const vp = q.vp, sp = p => project(vp, p), dv = sp(h.v), de = sp(h.e), k = S.dpr;
  if (dv && Math.hypot(dv[0] - q.px, dv[1] - q.py) < 16 * k) return { p: h.v, kind: 'vertex' }; if (de && Math.hypot(de[0] - q.px, de[1] - q.py) < 12 * k) return { p: h.e, kind: 'edge' }; return { p: h.p, kind: 'face' };
}

/* ---------- Tangentbord ---------- */
let ctrlT = 0, ctrlShown = false;
function showKeys(show) {
  const el = $('keys'); if (!show) { el.hidden = true; ctrlShown = false; return; } const k = keys(); ctrlShown = true;
  el.innerHTML = `<h4>Snabbval</h4>` + [['select', 'Välj'], ['measure', 'Mät'], ['info', 'Info'], ['section', 'Skärning'], ['comment', 'Kommentar'], ['hide', 'Dölj'], ['focus', 'Fokusera']].map(([a, l]) => `<div class="k">${ic(RLAB[a] ? RLAB[a][1] : 'select')}<span>${l}</span><kbd>${esc(k[a].toUpperCase())}</kbd></div>`).join('') + '<div class="k"><span>Ångra / gör om</span><kbd>Ctrl Z / Y</kbd></div><div class="k"><span>Sök</span><kbd>Ctrl K</kbd></div>'; el.hidden = false;
}
window.addEventListener('keydown', e => {
  if (e.key === 'Control' || e.key === 'Meta') { if (!ctrlT && !e.repeat) ctrlT = setTimeout(() => showKeys(true), 550); return; } clearTimeout(ctrlT); ctrlT = 0; if (ctrlShown) showKeys(false);
  if (e.target.matches('input,select,textarea')) return; const key = e.key.toLowerCase(), k = keys();
  if ((e.ctrlKey || e.metaKey) && key === 'k') { e.preventDefault(); $('q').focus(); $('q').select(); return; }
  if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); return; } if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); A.redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (key === k.select) A.setTool('select'); else if (key === k.measure) A.setTool('measure'); else if (key === k.info) A.setTool('info'); else if (key === k.section) A.setTool(S.tool === 'section' ? 'select' : 'section'); else if (key === k.comment) A.setTool('comment');
  else if (key === k.hide) e.shiftKey ? A.showAll() : A.hideSel(); else if (key === k.focus) fitSel(); else if (key === k.ghost) A.toggleGhost();
  else if (key === 'i' && e.shiftKey) A.isolate(); else if (key === 'escape') A.escape(); else if (key === 'delete' || key === 'backspace') A.deleteKey();
  else if (key === '1') stdView('front'); else if (key === '2') stdView('right'); else if (key === '3') stdView('top'); else if (key === '0') stdView('iso');
});
window.addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') { clearTimeout(ctrlT); ctrlT = 0; showKeys(false); } });
window.addEventListener('blur', () => { clearTimeout(ctrlT); showKeys(false); });

/* ---------- Visningskub och sidoknappar ---------- */
export function updateCube() {
  const c = V.vps[0].cam, el = $('cube3d'); if (!el) return;
  // kuben visar ögats riktning: z upp i modellen; rotera så att aktuell kamerariktning blir mot betraktaren
  el.style.transform = `rotateX(${90 - c.pitch * 180 / Math.PI}deg) rotateZ(${90 + c.yaw * 180 / Math.PI}deg)`;
}
on('frame', updateCube);
$('cube3d').addEventListener('click', e => { const f = e.target.closest('.f'); if (f) stdView(f.dataset.v); });
document.querySelectorAll('#cube .ar').forEach(b => b.onclick = () => { const vp = V.vps[0]; animateTo(vp, { yaw: vp.cam.yaw + (+b.dataset.rot) * Math.PI / 2 }, 380); });
$('vHome').onclick = () => fitAll(); $('vZin').onclick = () => zoomCenter(0.7); $('vZout').onclick = () => zoomCenter(1.4);
$('vWin').onclick = () => { S.zoomWin = !S.zoomWin; $('vWin').classList.toggle('on', S.zoomWin); if (S.zoomWin) toast('Dra en ruta över det du vill zooma till'); };
$('vOrtho').onclick = () => { const vp = V.vps[0]; vp.cam.ortho = !vp.cam.ortho; $('vOrtho').classList.toggle('on', vp.cam.ortho); redraw(); };
$('vCmd').onclick = () => { const r = rectOf(); openRadial(r.left + r.width / 2, r.top + r.height / 2); radial.pinned = true; const el = $('radial'); el.style.pointerEvents = 'auto'; el.querySelectorAll('.it').forEach(it => { it.style.pointerEvents = 'auto'; it.style.cursor = 'pointer'; it.onclick = () => { radial.sel = it.dataset.k; closeRadial(true); el.style.pointerEvents = 'none'; }; }); setTimeout(() => document.addEventListener('pointerdown', function h(ev) { if (!ev.target.closest('#radial')) { closeRadial(false); $('radial').style.pointerEvents = 'none'; } document.removeEventListener('pointerdown', h); }), 0); };
