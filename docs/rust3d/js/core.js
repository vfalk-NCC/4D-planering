/* Gemensam kärna: tillstånd, Rust-motorn (WebAssembly), ikoner och småverktyg. */
export const $ = id => document.getElementById(id);
export const td = new TextDecoder(), te = new TextEncoder();
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Rust-motorn ---------- */
export const R = { E: null };
const mem = () => R.E.memory.buffer;
export async function bootEngine() {
  const r = await fetch('rust3d.wasm?v=2'); R.E = (await WebAssembly.instantiate(await r.arrayBuffer(), {})).instance.exports;
}
export const put = bytes => { const p = R.E.alloc(bytes.length); new Uint8Array(mem(), p, bytes.length).set(bytes); return p; };
export function withBytes(bytes, fn) { const p = put(bytes); try { return fn(p, bytes.length); } finally { R.E.dealloc(p, bytes.length); } }
export const outText = n => td.decode(new Uint8Array(mem(), R.E.out_ptr(), n));
export const outJson = n => JSON.parse(outText(n));
export const outBytes = n => new Uint8Array(mem(), R.E.out_ptr(), n).slice();
export const callStr = (fn, s, ...rest) => withBytes(te.encode(s), (p, n) => fn(p, n, ...rest));
export const f32 = (ptr, n) => new Float32Array(mem(), ptr, n);
export const u8 = (ptr, n) => new Uint8Array(mem(), ptr, n);

/* ---------- Tillstånd ---------- */
export const S = {
  loaded: false, sum: null, nObj: 0, origin: [0, 0, 0], fileName: '',
  classes: [], conts: [], objIds: [], objClass: [], objCont: [], objName: [], objGuid: [], guidIx: new Map(),
  sel: new Set(), hover: -1, tool: 'select', colorBy: 'orig', shown: null, ghost: false, edits: 0,
  cloud: null, cloudSize: 2, measures: [], mPick: null, mHover: null, comments: [], views: [],
  section: { on: false, axis: 'z', pos: 0, flip: false, min: 0, max: 1 },
  tab: 'model', radius: 30, dirty: true, dpr: 1, w: 1, h: 1, fps: 0,
  override: new Map(), // objekt → [r,g,b] (t.ex. kollisioner, tidplan)
  pins: [], user: { name: 'Victor Falk', initials: 'VF' },
};
export const A = {}; // handlingar som funktionsmodulerna registrerar (så att modulerna slipper importera varandra)
export const bus = new EventTarget();
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
export const on = (n, f) => bus.addEventListener(n, e => f(e.detail));
export const redraw = () => { S.dirty = true; };

/* ---------- Ikoner (linjeikoner, 24 px) ---------- */
const P = {
  chev: '<path d="m9 6 6 6-6 6"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  select: '<path d="m5 3 14 8-6 2-3 6Z"/>', ruler: '<path d="m3 17 14-14 4 4L7 21Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  section: '<path d="M3 12h18"/><path d="m7 8 5-5 5 5M7 16l5 5 5-5"/>', comment: '<path d="M4 5h16v11H9l-5 4Z"/>', home: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zin: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M11 8v6M8 11h6"/>', zout: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8 11h6"/>', zwin: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/><circle cx="11" cy="11" r="3.5"/><path d="m14 14 3.5 3.5"/>',
  ortho: '<path d="M4 8l8-4 8 4v8l-8 4-8-4Z"/><path d="M4 8l8 4 8-4M12 12v8"/>', cmd: '<path d="M9 9V6a3 3 0 1 0-3 3h3Zm0 0h6m-6 0v6m6-6V6a3 3 0 1 1 3 3h-3Zm0 0v6m0 0h3a3 3 0 1 1-3 3v-3Zm0 0H9m0 0v3a3 3 0 1 1-3-3h3Z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>', history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  eye: '<path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>', eyeoff: '<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6-.4.8-1.3 2.1-2.7 3.3M6.4 7.6C4.6 8.9 3.4 10.7 2.5 12c1 2 4.5 6 9.5 6 1.3 0 2.5-.3 3.6-.7"/>',
  iso: '<rect x="8" y="8" width="8" height="8" rx="1.5"/><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>', focus: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  save: '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>', view: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 16-5-4-7 7"/>', folder: '<path d="M3 6h6l2 2h10v11H3Z"/>', file: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4Z"/><path d="M10 21h4"/>', layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>', wall: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 10h18M3 14h18M9 6v4M15 10v4M9 14v4"/>',
  slab: '<path d="M3 12 12 7l9 5-9 5Z"/><path d="M3 12v3l9 5 9-5v-3"/>', column: '<rect x="8" y="3" width="8" height="18" rx="1"/><path d="M6 21h12M6 3h12"/>', beam: '<path d="M2 9h20v6H2Z"/><path d="M6 9v6M18 9v6"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>', door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M4 21h16M14 12h.01"/>', roof: '<path d="M3 12 12 4l9 8"/><path d="M5 11v9h14v-9"/>', stairs: '<path d="M3 20h5v-4h5v-4h5V8h3"/>',
  box: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>', pipe: '<path d="M3 9h12a3 3 0 0 1 3 3v9"/><path d="M3 15h8"/>', terrain: '<path d="M2 19 9 8l4 6 3-4 6 9Z"/>', steel: '<path d="M3 5h18M3 19h18M12 5v14"/>', prefab: '<rect x="4" y="9" width="16" height="10" rx="1"/><path d="M8 9V5h8v4M12 9v10"/>',
  warn: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>', check: '<path d="m5 12 5 5 9-10"/>', plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>', download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>', up: '<path d="M12 19V5m0 0-5 5m5-5 5 5"/>', tc: '<path d="M4 17a5 5 0 0 1 1.5-9.8A6 6 0 0 1 17 8a4.5 4.5 0 0 1 .5 9Z"/>',
  play: '<path d="M7 4l13 8-13 8Z"/>', pause: '<path d="M8 5v14M16 5v14"/>', split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>', multi: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>',
};
export const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.box}</svg>`;
export function hydrate(root = document) { root.querySelectorAll('i[data-ic]').forEach(i => { i.innerHTML = ic(i.dataset.ic); i.removeAttribute('data-ic'); i.classList.add('ic'); }); }

/* ---------- Småverktyg ---------- */
export const nice = c => { const m = { WALL: 'Vägg', WALLSTANDARDCASE: 'Vägg', SLAB: 'Bjälklag', COLUMN: 'Pelare', BEAM: 'Balk', WINDOW: 'Fönster', DOOR: 'Dörr', ROOF: 'Tak', STAIR: 'Trappa', STAIRFLIGHT: 'Trapplöp', RAILING: 'Räcke', FOOTING: 'Fundament', SPACE: 'Rum', BUILDINGELEMENTPROXY: 'Generiskt objekt', COVERING: 'Beklädnad', MEMBER: 'Stag/regel', PLATE: 'Platta', PILE: 'Påle', FURNISHINGELEMENT: 'Inredning', RAMP: 'Ramp', CURTAINWALL: 'Fasadvägg', PIPESEGMENT: 'Rör', DUCTSEGMENT: 'Kanal', CABLECARRIERSEGMENT: 'Kabelstege', FLOWSEGMENT: 'Flödessegment', DISTRIBUTIONELEMENT: 'Installation', SITE: 'Mark', GEOGRAPHICELEMENT: 'Terräng', BUILDINGELEMENTPART: 'Delobjekt', REINFORCINGBAR: 'Armering', TRANSPORTELEMENT: 'Transport' }; const k = c.replace(/^IFC/, ''); return m[k] || (k.charAt(0) + k.slice(1).toLowerCase()); };
export const classIcon = c => ({ WALL: 'wall', WALLSTANDARDCASE: 'wall', SLAB: 'slab', COLUMN: 'column', BEAM: 'beam', WINDOW: 'window', DOOR: 'door', ROOF: 'roof', STAIR: 'stairs', STAIRFLIGHT: 'stairs', SITE: 'terrain', GEOGRAPHICELEMENT: 'terrain', PIPESEGMENT: 'pipe', DUCTSEGMENT: 'pipe', MEMBER: 'steel', PLATE: 'steel' }[c.replace(/^IFC/, '')] || 'box');
/* Grupperar IFC-klasser i byggnadsdelar enligt konceptet. */
export const categoryOf = c => { const k = c.replace(/^IFC/, ''); if (/^(WALL|WALLSTANDARDCASE|SLAB|ROOF|DOOR|WINDOW|STAIR|STAIRFLIGHT|RAILING|COVERING|CURTAINWALL|RAMP|FOOTING)$/.test(k)) return 'Byggnadsdelar'; if (/^(COLUMN|BEAM|MEMBER|PLATE|REINFORCINGBAR|PILE)$/.test(k)) return 'Stålkonstruktion'; if (/^(PIPESEGMENT|DUCTSEGMENT|CABLECARRIERSEGMENT|FLOWSEGMENT|DISTRIBUTIONELEMENT|FLOWTERMINAL|ENERGYCONVERSIONDEVICE|FLOWFITTING)/.test(k)) return 'Installationer'; if (/^(SITE|GEOGRAPHICELEMENT|CIVILELEMENT)$/.test(k)) return 'Terräng & mark'; return 'Övrigt'; };
export const catIcon = n => ({ 'Byggnadsdelar': 'wall', 'Stålkonstruktion': 'steel', 'Installationer': 'pipe', 'Terräng & mark': 'terrain', 'Övrigt': 'box' }[n] || 'box');
export const hsl2rgb = i => { const h = ((i * 137.508) % 360) / 360, s = 0.62, l = 0.52, a = s * Math.min(l, 1 - l), f = n => { const k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
export const palette = i => { const c = hsl2rgb(i); return `rgb(${c[0]},${c[1]},${c[2]})`; };
export const fmtD = d => d >= 1 ? d.toFixed(3).replace('.', ',') + ' m' : (d * 1000).toFixed(0) + ' mm';
export const fmtN = (n, d = 2) => Number(n).toFixed(d).replace('.', ',');
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const tick = () => new Promise(r => setTimeout(r, 30));
export function busy(t) { $('busy').hidden = !t; if (t) $('busyT').textContent = t; }
let toastT = 0;
export function toast(t, ms = 3400) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, ms); }
export const store = { get(k, d) { try { const v = localStorage.getItem('r3d:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('r3d:' + k, JSON.stringify(v)); } catch (e) { /* utan minne */ } } };
export function dialog(title, bodyHtml, { wide } = {}) {
  const d = $('dialog'); d.innerHTML = `<div class="box" ${wide ? 'style="width:min(720px,94vw)"' : ''}><header><b>${esc(title)}</b><span class="grow"></span><button class="x" data-close>${ic('close')}</button></header><div class="body">${bodyHtml}</div></div>`; d.hidden = false;
  const close = () => { d.hidden = true; d.innerHTML = ''; }; d.onclick = e => { if (e.target === d || e.target.closest('[data-close]')) close(); }; return { el: d.querySelector('.body'), close };
}
export function prompt2(title, label, value = '', ok = 'OK') {
  return new Promise(res => { const dlg = dialog(title, `<label class="fld">${esc(label)}<input id="pmI" type="text" value="${esc(value)}"></label><div class="row"><button class="btn primary" id="pmOk">${esc(ok)}</button><button class="btn" data-close>Avbryt</button></div>`);
    const inp = dlg.el.querySelector('#pmI'); inp.focus(); inp.select(); const done = v => { dlg.close(); res(v); }; dlg.el.querySelector('#pmOk').onclick = () => done(inp.value); inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
    $('dialog').addEventListener('click', e => { if (e.target === $('dialog')) res(null); }, { once: true }); });
}
