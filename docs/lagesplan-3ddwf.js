/* DWF (3D) i 3D-editorn (Victor 2026-11-04: "3D-DWF från Navisworks Simulate"). Filen läses i en egen tråd (dwf-worker.js → dwf-reader.js).
   En hel Navisworks-modell kan vara tiotals miljoner trianglar, så först visas ett TRÄD med delarna och antal trianglar:
   man väljer vad som ska med (förvalt: så mycket som ryms i ca 1,5 miljoner trianglar), kan hoppa över småprylar (skruvar, bultar)
   och väljer sedan Visa i 3D-vyn (mesh-modell) eller Spara urvalet som IFC (delar geometri, packas till .ifczip när det är stort). */

const L3DWF_BUDGET = 1500000, L3DWF_MAX_3D_TRIS = 3000000, L3DWF_MAX_3D_PARTS = 25000, L3DWF_FT = 0.3048;
const l3dwf = { ui: null, d: null };
const l3dwfN = n => Math.round(n).toLocaleString("sv-SE");
const l3dwfEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function l3dwfParseInWorker(buf, name) {
  return new Promise((ok, fail) => {
    let w; try { w = new Worker("dwf-worker.js"); } catch (e) { fail(new Error("Webbläsaren kunde inte starta läsartråden: " + e.message)); return; }
    w.onmessage = e => {
      if (e.data.stage) { if (typeof busyProgress === "function") busyProgress("dwf", e.data.stage, e.data.f); l3Status(`DWF: ${e.data.stage}…`); return; }
      w.terminate(); if (typeof busyProgress === "function") busyProgress("dwf", "", null);
      if (e.data.error) fail(new Error(e.data.error)); else ok(e.data.r);
    };
    w.onerror = e => { w.terminate(); if (typeof busyProgress === "function") busyProgress("dwf", "", null); fail(new Error(e.message || "DWF-läsaren avbröts (för lite minne?)")); };
    w.postMessage({ buf, name }, [buf]);
  });
}

/* Rensar bort brus i sökvägarna (Insert, 0, namn på källfiler). */
function l3dwfClean(path) { const out = []; (path || []).forEach(s => { if (!s || s === "Insert" || s === "0" || /\.(nwd|nwf|nwc|dwg)$/i.test(s)) return; if (out[out.length - 1] !== s) out.push(s); }); return out; }

function l3dwfPrep(r) {
  const gd = r.geoms.map(g => { let x0 = 1e30, y0 = 1e30, z0 = 1e30, x1 = -1e30, y1 = -1e30, z1 = -1e30; const p = g.pos; for (let i = 0; i < p.length; i += 3) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; if (p[i + 2] < z0) z0 = p[i + 2]; if (p[i + 2] > z1) z1 = p[i + 2]; } return Math.hypot(x1 - x0, y1 - y0, z1 - z0); });
  const unit = r.unit === "ft" ? L3DWF_FT : r.unit === "in" ? 0.0254 : r.unit === "mm" ? 0.001 : r.unit === "cm" ? 0.01 : 1;
  const root = { name: "", kids: new Map(), own: [], on: false, id: 0 }, nodes = [root]; let tris = 0;
  r.parts.forEach((p, i) => {
    const m = p.m, sc = Math.hypot(m[0], m[1], m[2]) || 1; p.size = gd[p.geom] * sc * unit; p.tris = r.geoms[p.geom].idx.length / 3; tris += p.tris;
    let cur = root; for (const c of l3dwfClean(p.path)) { let k = cur.kids.get(c); if (!k) { k = { name: c, kids: new Map(), own: [], on: false, id: nodes.length }; nodes.push(k); cur.kids.set(c, k); } cur = k; }
    cur.own.push(i);
  });
  return { r, root, nodes, unit, tris, minSize: 0, open: new Set([0]) };
}
/* Antal valda / alla trianglar och delar under en nod, med småprylsfiltret. */
function l3dwfCount(d, n) {
  let sel = 0, all = 0, ps = 0, pa = 0, anyOn = false, allOn = true;
  for (const i of n.own) { const p = d.r.parts[i]; if (p.size < d.minSize) continue; all += p.tris; pa++; if (n.on) { sel += p.tris; ps++; } }
  if (n.own.length) { if (n.on) anyOn = true; else allOn = false; }
  for (const k of n.kids.values()) { const c = l3dwfCount(d, k); sel += c.sel; all += c.all; ps += c.ps; pa += c.pa; if (c.any) anyOn = true; if (!c.full) allOn = false; }
  n.cnt = { sel, all, ps, pa, any: anyOn, full: allOn && (all > 0 || anyOn) };
  return n.cnt;
}
function l3dwfSetOn(n, v) { n.on = v; n.kids.forEach(k => l3dwfSetOn(k, v)); }
function l3dwfAutoFill(d, n, rem) {
  l3dwfCount(d, n); if (n.cnt.all === 0) return rem;
  if (n.cnt.all <= rem) { l3dwfSetOn(n, true); return rem - n.cnt.all; }
  for (const k of [...n.kids.values()].sort((a, b) => a.cnt.all - b.cnt.all)) rem = l3dwfAutoFill(d, k, rem);
  return rem;
}
function l3dwfSelected(d) { const out = []; (function w(n) { if (n.on) n.own.forEach(i => { if (d.r.parts[i].size >= d.minSize) out.push(i); }); n.kids.forEach(w); })(d.root); return out; }

/* ---------- dialog ---------- */
function l3dwfCss() {
  if (document.getElementById("v3dwCss")) return; const st = document.createElement("style"); st.id = "v3dwCss";
  st.textContent = `.v3-dw{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;font:13px/1.4 system-ui,sans-serif}
.v3-dw-box{width:min(760px,94vw);max-height:88vh;background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
.v3-dw-h{padding:14px 18px 10px;border-bottom:1px solid #e2e8f0}.v3-dw-h b{font-size:15px}.v3-dw-h small{display:block;color:#64748b;margin-top:2px}
.v3-dw-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid #eef2f7;background:#f8fafc}
.v3-dw-bar select,.v3-dw-bar button{font:inherit;padding:4px 8px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;cursor:pointer}
.v3-dw-meter{flex:1;min-width:160px}.v3-dw-meter i{display:block;height:6px;border-radius:3px;background:#e2e8f0;overflow:hidden}.v3-dw-meter i s{display:block;height:100%;background:#2563eb}
.v3-dw-meter.bad i s{background:#dc2626}
.v3-dw-tree{overflow:auto;padding:6px 10px;flex:1;min-height:200px}
.v3-dw-r{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px}.v3-dw-r:hover{background:#f1f5f9}
.v3-dw-r .t{width:16px;text-align:center;cursor:pointer;color:#64748b;user-select:none}.v3-dw-r .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v3-dw-r .c{color:#64748b;font-variant-numeric:tabular-nums;font-size:12px}
.v3-dw-f{display:flex;gap:8px;justify-content:flex-end;padding:12px 18px;border-top:1px solid #e2e8f0;flex-wrap:wrap}
.v3-dw-f button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}.v3-dw-f button.p{background:#2563eb;border-color:#2563eb;color:#fff}.v3-dw-f button:disabled{opacity:.45;cursor:not-allowed}
.v3-dw-msg{padding:6px 18px;color:#b45309;font-size:12px}`;
  document.head.appendChild(st);
}
function l3dwfRows(d, n, depth, out) {
  const kids = [...n.kids.values()].sort((a, b) => b.cnt.all - a.cnt.all);
  for (const k0 of kids) {
    let k = k0, label = k0.name; while (k.kids.size === 1 && !k.own.length) { k = [...k.kids.values()][0]; label += " › " + k.name; }
    const c = k0.cnt; if (!c.all) continue;
    const hasKids = k.kids.size > 0, open = d.open.has(k0.id);
    out.push(`<div class="v3-dw-r" style="padding-left:${6 + depth * 16}px"><span class="t" data-t="${k0.id}">${hasKids ? (open ? "▾" : "▸") : ""}</span><input type="checkbox" data-c="${k0.id}" ${c.full ? "checked" : ""}><span class="n" title="${l3dwfEsc(label)}">${l3dwfEsc(label)}</span><span class="c">${l3dwfN(c.all)}${c.pa > 1 ? " · " + l3dwfN(c.pa) + " delar" : ""}</span></div>`);
    if (hasKids && open) l3dwfRows(d, k, depth + 1, out);
  }
}
function l3dwfRender() {
  const d = l3dwf.d, ui = l3dwf.ui; if (!d || !ui) return;
  const tot = l3dwfCount(d, d.root), badTris = tot.sel > L3DWF_MAX_3D_TRIS, badParts = tot.ps > L3DWF_MAX_3D_PARTS;
  ui.querySelector(".v3-dw-tree").innerHTML = (() => { const o = []; l3dwfRows(d, d.root, 0, o); return o.join("") || "<div style='padding:20px;color:#64748b'>Inga delar över storleksgränsen.</div>"; })();
  ui.querySelectorAll("[data-c]").forEach(cb => { const n = d.nodes[+cb.dataset.c]; cb.indeterminate = !n.cnt.full && n.cnt.any && n.cnt.sel > 0; });
  ui.querySelector(".v3-dw-meter").className = "v3-dw-meter" + (badTris || badParts ? " bad" : "");
  ui.querySelector(".v3-dw-meter span").textContent = `${l3dwfN(tot.sel)} av ${l3dwfN(tot.all)} trianglar valda · ${l3dwfN(tot.ps)} delar`;
  ui.querySelector(".v3-dw-meter s").style.width = Math.min(100, tot.all ? 100 * tot.sel / L3DWF_MAX_3D_TRIS : 0) + "%";
  ui.querySelector(".v3-dw-msg").textContent = badTris || badParts ? "För mycket för att visa i 3D-vyn på en gång – välj mindre, hoppa över småprylar eller spara urvalet som IFC." : "";
  ui.querySelector("[data-go3d]").disabled = !tot.ps || badTris || badParts; ui.querySelector("[data-goifc]").disabled = !tot.ps;
}
function l3dwfClose() { if (l3dwf.ui) { l3dwf.ui.remove(); l3dwf.ui = null; } l3dwf.d = null; }
function l3dwfDialog(d, name) {
  l3dwfCss(); l3dwfClose(); l3dwf.d = d;
  const ui = document.createElement("div"); ui.className = "v3-dw";
  ui.innerHTML = `<div class="v3-dw-box"><div class="v3-dw-h"><b>${l3dwfEsc(name)}</b><small>${l3dwfN(d.r.parts.length)} delar, ${l3dwfN(d.tris)} trianglar (enhet: ${l3dwfEsc(d.r.unit)}). Välj vad som ska med.</small></div>
  <div class="v3-dw-bar"><label>Hoppa över delar mindre än <select data-min><option value="0">(alla)</option><option value="0.05">5 cm</option><option value="0.1">10 cm</option><option value="0.3">30 cm</option><option value="1">1 m</option></select></label>
  <button data-all>Välj allt</button><button data-none>Välj inget</button><button data-fill>Förval</button><div class="v3-dw-meter"><span></span><i><s></s></i></div></div>
  <div class="v3-dw-msg"></div><div class="v3-dw-tree"></div>
  <div class="v3-dw-f"><button data-x>Avbryt</button><button data-goifc>Spara urvalet som IFC…</button><button class="p" data-go3d>Visa i 3D-vyn</button></div></div>`;
  document.body.appendChild(ui); l3dwf.ui = ui;
  l3dwfAutoFill(d, d.root, L3DWF_BUDGET); l3dwfRender();
  ui.addEventListener("click", e => {
    const t = e.target.closest("[data-t]"), c = e.target.closest("[data-c]");
    if (t) { const id = +t.dataset.t; d.open.has(id) ? d.open.delete(id) : d.open.add(id); l3dwfRender(); return; }
    if (c) { const n = d.nodes[+c.dataset.c]; l3dwfSetOn(n, c.checked); l3dwfRender(); return; }
    if (e.target.closest("[data-all]")) { l3dwfSetOn(d.root, true); l3dwfRender(); }
    else if (e.target.closest("[data-none]")) { l3dwfSetOn(d.root, false); l3dwfRender(); }
    else if (e.target.closest("[data-fill]")) { l3dwfSetOn(d.root, false); l3dwfAutoFill(d, d.root, L3DWF_BUDGET); l3dwfRender(); }
    else if (e.target.closest("[data-x]")) l3dwfClose();
    else if (e.target.closest("[data-go3d]")) { const sel = l3dwfSelected(d), nm = name; l3dwfClose(); l3dwfShow3d(d, sel, nm).catch(er => l3Status("Kunde inte visa DWF: " + er.message, true)); }
    else if (e.target.closest("[data-goifc]")) { const sel = l3dwfSelected(d), nm = name; l3dwfClose(); l3dwfToIfc(d, sel, nm).catch(er => l3Status("Kunde inte skapa IFC: " + er.message, true)); }
  });
  ui.querySelector("[data-min]").onchange = e => { d.minSize = Number(e.target.value) || 0; l3dwfRender(); };
}

/* ---------- visa i 3D ---------- */
async function l3dwfShow3d(d, sel, name) {
  const root = new THREE.Group(), geoms = new Map(), mats = new Map(), groups = new Map(); root.name = name;
  const group = (path) => { let cur = root, key = ""; for (const c of path) { key += "\u0001" + c; let g = groups.get(key); if (!g) { g = new THREE.Group(); g.name = c; cur.add(g); groups.set(key, g); } cur = g; } return cur; };
  let n = 0;
  for (const i of sel) {
    const p = d.r.parts[i]; let g = geoms.get(p.geom);
    if (!g) { const s = d.r.geoms[p.geom]; g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(s.pos, 3)); g.setIndex(new THREE.BufferAttribute(s.idx, 1)); g.computeVertexNormals(); geoms.set(p.geom, g); }
    const hex = p.color ? (p.color[0] << 16 | p.color[1] << 8 | p.color[2]) : 0xb0b8c4; let mt = mats.get(hex);
    if (!mt) { mt = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, metalness: 0.1, flatShading: true, side: THREE.DoubleSide }); mats.set(hex, mt); }
    const me = new THREE.Mesh(g, mt); me.name = p.name || "Del"; me.matrixAutoUpdate = false; me.matrix.fromArray(p.m); me.matrixWorldNeedsUpdate = true; group(l3dwfClean(p.path)).add(me);
    if ((++n & 1023) === 0) await new Promise(r => setTimeout(r, 0));
  }
  const m = l3msAdd(name, root, "dwf", { unit: d.unit, unitSet: true });
  return m;
}

/* ---------- spara som IFC ---------- */
async function l3dwfToIfc(d, sel, name) {
  l3Status("Bygger IFC av DWF-urvalet…");
  const U = d.unit, list = [];
  for (let k = 0; k < sel.length; k++) {
    const p = d.r.parts[sel[k]], g = d.r.geoms[p.geom], e = p.m, pa = g.pos, n = pa.length / 3, pos = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2]; pos[i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * U; pos[i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * U; pos[i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * U; }
    const col = p.color ? "#" + ((1 << 24) | (p.color[0] << 16) | (p.color[1] << 8) | p.color[2]).toString(16).slice(1) : "#b0b8c4";
    list.push({ name: p.name || "Del", path: l3dwfClean(p.path), pos, idx: g.idx, color: col, opacity: 0 });
    if ((k & 255) === 0) await new Promise(r => setTimeout(r, 0));
  }
  const dt = new Date(), p2 = x => String(x).padStart(2, "0"), base = name.replace(/\.[^.]+$/, "");
  const fn = `${base} – urval ${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} kl ${p2(dt.getHours())}.${p2(dt.getMinutes())}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
  const r = await ifcFromMeshes(list, { projName: base, desc: "DWF-urval från " + name, source: name, fileName: fn, minSize: 0, onProgress: f => { if (typeof busyProgress === "function") busyProgress("msifc", `Bygger IFC (${Math.round(f * 100)} %)`, f); } });
  if (typeof busyProgress === "function") busyProgress("msifc", "", null);
  if (!r) { l3Status("Inget att exportera.", true); return null; }
  return l3msDeliver({ text: r.text, fileName: r.fileName, n: r.stats.parts, tris: r.stats.tris, stats: r.stats });
}

/* ---------- ingång ---------- */
async function l3dwfOpen(file) {
  if (!l3 || !l3.scene) { l3Status("Öppna 3D-vyn först.", true); return null; }
  l3Status(`Läser ${file.name}…`);
  try {
    const buf = await file.arrayBuffer(), r = await l3dwfParseInWorker(buf, file.name), d = l3dwfPrep(r);
    if (!r.parts.length) throw new Error("Hittade inga 3D-delar i filen (är det en 2D-DWF?).");
    l3Status(`${file.name}: ${l3dwfN(r.parts.length)} delar, ${l3dwfN(d.tris)} trianglar.`); l3dwfDialog(d, file.name); return d;
  } catch (e) { console.warn("DWF", e); l3Status(`Kunde inte läsa ${file.name}: ${e.message || e}`, true); return null; }
}
