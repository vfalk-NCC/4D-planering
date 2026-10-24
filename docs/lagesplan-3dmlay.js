/* 3D-vyn – Lager i modell & ritning (Victor 2026-10-24: "listar alla lager som är tända just nu i alla 3d-modeller och alla 2d-modeller … byt färger på lagren och släcka undan dom … sparas").
   3D: IFC-modellernas presentationslager (IfcPresentationLayerAssignment, t.ex. Tekla/Revit) – saknas de i en modell grupperas objekten efter IFC-klass (vägg, bjälklag …).
       Släckta lager och färger sparas per modellnamn (webbläsaren) och läggs på igen varje gång modellen läses in.
   2D: CAD-lagren i tända DXF/DWG (samma lager och färger som i lägesplanen – sparas med projektet) samt de övriga tända 2D-lagren och ritningen (PDF). */

const l3ly = { open: new Set(), q: "", sig: "" };
const l3lyP = k => { try { return l3Prefs()[k] || {}; } catch (e) { return {}; } };
const l3lyHex = rgb => "#" + rgb.map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
/* Grupperna i en modell: Map(nyckel → { name, kind: "lay" | "cls", ris: [[mesh, ri], …] }). */
function l3lyGroups(m) {
  if (m._lyg && m._lyg.sig === m.meshes.length) return m._lyg.g;
  const raw = new Map(); let anyLay = false;
  m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (!u || mesh.userData.bcopy) return; u.ranges.forEach((r, ri) => { if (r.lay) anyLay = true; const k = r.lay || ("klass:" + (r.cls || "")); let g = raw.get(k); if (!g) raw.set(k, g = { ris: [], lay: r.lay || "", cls: r.cls || "" }); g.ris.push([mesh, ri]); }); });
  const g = new Map();
  [...raw.entries()].sort((a, b) => String(a[1].lay || a[1].cls).localeCompare(String(b[1].lay || b[1].cls), "sv", { numeric: true })).forEach(([k, v]) => {
    if (!anyLay && !v.cls) return; g.set(k, { name: v.lay ? v.lay : v.cls ? l3lyClass(v.cls) : "(utan lager)", kind: v.lay ? "lay" : "cls", ris: v.ris });
  });
  m._lyg = { sig: m.meshes.length, g, anyLay }; return g;
}
const l3lyClass = c => { const s = String(c).replace(/^Ifc/i, ""); const nice = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); return "Klass " + nice.replace(/standardcase$/, ""); };
const l3lyModels = () => ((typeof l3b !== "undefined" && l3b.models) || []).filter(m => m.visible !== false && m.meshes && m.meshes.length);
/* Lägger på sparade släckta lager och färger (anropas efter inläsning och efter ändringar). */
function l3lyApply(force) {
  if (typeof l3b === "undefined" || !l3b.models.length) return;
  const off = l3lyP("lyOff"), col = l3lyP("lyCol"), sig = JSON.stringify([off, col]) + "|" + l3b.models.map(m => m.name + ":" + m.meshes.length).join(",");
  if (!force && l3ly.sig === sig) return; l3ly.sig = sig;
  const dirty = new Set(); let recolor = false;
  l3b.models.forEach(m => {
    const O = new Set(off[m.name] || []), C = col[m.name] || {};
    l3lyGroups(m).forEach((grp, k) => grp.ris.forEach(([mesh, ri]) => {
      const u = mesh.userData.l3b; if (!u.lyHide) u.lyHide = new Set(); if (!u.tint) u.tint = new Map();
      const hid = O.has(k); if (hid !== u.lyHide.has(ri)) { if (hid) u.lyHide.add(ri); else u.lyHide.delete(ri); dirty.add(mesh); }
      const want = C[k], had = u.lyCol && u.lyCol.get(ri);
      if (want) { const c = new THREE.Color(want); if (!u.lyCol) u.lyCol = new Map(); u.lyCol.set(ri, want); u.tint.set(ri, [c.r, c.g, c.b]); l3lyPaint(mesh, ri, [c.r, c.g, c.b]); }
      else if (had) { u.lyCol.delete(ri); u.tint.delete(ri); recolor = true; }
    }));
  });
  if (recolor && typeof l3bRecolor === "function") l3bRecolor();
  dirty.forEach(mesh => l3bApplyHidden(mesh));
  if (typeof l3Render === "function") l3Render();
}
function l3lyPaint(mesh, ri, rgb) {
  const col = mesh.geometry.getAttribute("color"), d = col.array, K = d instanceof Uint8Array ? 255 : 1, r = mesh.userData.l3b.ranges[ri], c0 = K === 255 ? Math.round(rgb[0] * 255) : rgb[0], c1 = K === 255 ? Math.round(rgb[1] * 255) : rgb[1], c2 = K === 255 ? Math.round(rgb[2] * 255) : rgb[2];
  for (let i = r.start; i < r.start + r.count; i++) { d[i * 3] = c0; d[i * 3 + 1] = c1; d[i * 3 + 2] = c2; }
  col.needsUpdate = true;
}
function l3lyToggle(model, key, on) { const o = { ...l3lyP("lyOff") }, a = new Set(o[model] || []); if (on) a.delete(key); else a.add(key); if (a.size) o[model] = [...a]; else delete o[model]; l3SetPref("lyOff", Object.keys(o).length ? o : null); l3lyApply(true); }
function l3lyColor(model, key, hex) { const c = { ...l3lyP("lyCol") }, m = { ...(c[model] || {}) }; if (hex) m[key] = hex; else delete m[key]; if (Object.keys(m).length) c[model] = m; else delete c[model]; l3SetPref("lyCol", Object.keys(c).length ? c : null); l3lyApply(true); }

/* ---- Lager-fliken ------------------------------------------------------------------------------------------------ */
function l3lyHtml(eye, esc) {
  const q = (l3ly.q || "").toLowerCase(), off = l3lyP("lyOff"), col = l3lyP("lyCol");
  const mods = l3lyModels(); let n3 = 0, h3 = "";
  mods.forEach((m, mi) => {
    const grp = l3lyGroups(m), O = new Set(off[m.name] || []), C = col[m.name] || {}, anyLay = m._lyg && m._lyg.anyLay;
    const rows = [...grp.entries()].filter(([, g]) => !q || g.name.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    if (!rows.length) return; n3 += rows.length;
    const open = l3ly.open.has(m.name) || mods.length === 1 || !!q, nOff = rows.filter(([k]) => O.has(k)).length;
    h3 += `<div class="v3-ly-m"><button type="button" class="v3-ly-mh" data-lymopen="${esc(m.name)}" aria-expanded="${open}"><i>›</i><span class="v3-lr-n" title="${esc(m.name)}">${esc(m.name)}</span><em>${rows.length} ${anyLay ? "lager" : "klasser"}${nOff ? ` · ${nOff} släckta` : ""}</em></button>`;
    if (open) {
      h3 += `<div class="v3-ly-acts"><button type="button" data-lyall="${esc(m.name)}|1">Tänd alla</button><button type="button" data-lyall="${esc(m.name)}|0">Släck alla</button><button type="button" data-lyall="${esc(m.name)}|c">Återställ färger</button></div>`;
      if (!anyLay) h3 += `<div class="v3-pal-hint">Modellen har inga lager inlagda – objekten grupperas efter IFC-klass. (Modeller som lästes in före den här funktionen läses om vid nästa inläsning.)</div>`;
      rows.forEach(([k, g]) => { const hid = O.has(k), c = C[k] || ""; h3 += `<div class="v3-lr v3-ly-r${hid ? " off" : ""}"><button type="button" class="v3-eye ${hid ? "" : "on"}" data-lyeye="${esc(m.name)}|${esc(k)}" title="${hid ? "Tänd" : "Släck"}">${eye(!hid)}</button><span class="v3-lr-n" title="${esc(g.name)}">${esc(g.name)}</span><em class="v3-lr-k">${g.ris.length}</em><label class="v3-ly-c${c ? " set" : ""}" title="Byt färg (dubbelklicka för ursprungsfärg)"><input type="color" value="${c || l3lyBase(g)}" data-lycol="${esc(m.name)}|${esc(k)}" /></label></div>`; });
    }
    h3 += `</div>`;
  });
  // 2D
  let n2 = 0, h2 = "";
  const recs = typeof cads === "function" ? cads().filter(r => !r.virtual && ls("cad:" + r.id).visible) : [];
  recs.forEach(r => {
    const rows = r.layers.filter(l => !q || l.name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)); if (!rows.length) return; n2 += rows.length;
    const open = l3ly.open.has("cad:" + r.id) || recs.length === 1 || !!q, nOff = rows.filter(l => !cadLayerOn(r, l.name)).length;
    h2 += `<div class="v3-ly-m"><button type="button" class="v3-ly-mh" data-lymopen="cad:${esc(r.id)}" aria-expanded="${open}"><i>›</i><span class="v3-lr-n" title="${esc(r.name)}">${esc(r.name)} <small>DXF</small></span><em>${rows.length} lager${nOff ? ` · ${nOff} släckta` : ""}</em></button>`;
    if (open) {
      h2 += `<div class="v3-ly-acts"><button type="button" data-lycadall="${esc(r.id)}|1">Tänd alla</button><button type="button" data-lycadall="${esc(r.id)}|0">Släck alla</button><button type="button" data-lycadall="${esc(r.id)}|c">Återställ färger</button></div>`;
      rows.forEach(l => { const on = cadLayerOn(r, l.name), c = (typeof cadLayerColor === "function" ? cadLayerColor(r, l.name, l.color) : l.color) || "#000000", hex = /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"; h2 += `<div class="v3-lr v3-ly-r${on ? "" : " off"}"><button type="button" class="v3-eye ${on ? "on" : ""}" data-lycadeye="${esc(r.id)}|${esc(l.name)}" title="${on ? "Släck" : "Tänd"}">${eye(on)}</button><span class="v3-lr-n" title="${esc(l.name)}">${esc(l.name)}</span><em class="v3-lr-k">${l.n || ""}</em><label class="v3-ly-c" title="Byt färg"><input type="color" value="${hex}" data-lycadcol="${esc(r.id)}|${esc(l.name)}" /></label></div>`; });
    }
    h2 += `</div>`;
  });
  // övriga tända 2D-lager och ritningen (PDF)
  const other = []; if (typeof l3 !== "undefined" && l3 && l3.planMesh && l3Prefs().plan !== false) other.push(["pdf", "Ritning (PDF)"]);
  if (typeof layerDisplayEntries === "function" && typeof plan !== "undefined" && plan) { const seen = new Set(); layerDisplayEntries().forEach(e => (e.folder ? e.kids : [e.key]).forEach(k => { if (!k || k === "pdf" || String(k).startsWith("cad:") || seen.has(k)) return; seen.add(k); if (ls(k).visible) other.push([k, typeof l3sName === "function" ? l3sName(k) : k]); })); }
  const orows = other.filter(([, nm]) => !q || nm.toLowerCase().includes(q));
  if (orows.length) { n2 += orows.length; h2 += `<div class="v3-ly-m"><div class="v3-ly-mh static"><span class="v3-lr-n">Ritning och övriga lager</span><em>${orows.length}</em></div>` + orows.map(([k, nm]) => `<div class="v3-lr v3-ly-r"><button type="button" class="v3-eye on" data-lyother="${esc(k)}" title="Släck">${eye(true)}</button><span class="v3-lr-n" title="${esc(nm)}">${esc(nm)}</span></div>`).join("") + `</div>`; }
  const search = `<div class="v3-ly-q"><input type="search" id="v3LyQ" placeholder="Sök lager …" value="${esc(l3ly.q)}" /></div>`;
  return { body: search + l3lSub("ly3d", "3D", n3 || null, h3 || `<div class="v3-pal-hint">Inga 3D-modeller är tända${q ? " med den sökningen" : ""}.</div>`) + l3lSub("ly2d", "2D", n2 || null, h2 || `<div class="v3-pal-hint">Inga 2D-lager eller ritningar är tända${q ? " med den sökningen" : ""}.</div>`), n: n3 + n2 };
}
function l3lyBase(g) { const [mesh, ri] = g.ris[0]; const r = mesh.userData.l3b.ranges[ri], b = r && r.base; return b ? l3lyHex(b) : "#9aa4b2"; }
function l3lyBind(host) {
  const refresh = () => l3LayersRender();
  const q = host.querySelector("#v3LyQ"); if (q) q.oninput = () => { l3ly.q = q.value; clearTimeout(l3ly.t); l3ly.t = setTimeout(() => { refresh(); const n = document.getElementById("v3LyQ"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200); };
  host.querySelectorAll("[data-lymopen]").forEach(b => { b.onclick = () => { const k = b.dataset.lymopen; if (l3ly.open.has(k)) l3ly.open.delete(k); else l3ly.open.add(k); refresh(); }; });
  host.querySelectorAll("[data-lyeye]").forEach(b => { b.onclick = () => { const [m, k] = b.dataset.lyeye.split("|"), hid = b.classList.contains("on"); l3lyToggle(m, k, !hid); refresh(); }; });
  host.querySelectorAll("[data-lyall]").forEach(b => { b.onclick = () => { const [m, a] = b.dataset.lyall.split("|"), mod = l3lyModels().find(x => x.name === m); if (!mod) return; const keys = [...l3lyGroups(mod).keys()];
    if (a === "c") { const c = { ...l3lyP("lyCol") }; delete c[m]; l3SetPref("lyCol", Object.keys(c).length ? c : null); } else { const o = { ...l3lyP("lyOff") }; if (a === "1") delete o[m]; else o[m] = keys; l3SetPref("lyOff", Object.keys(o).length ? o : null); }
    l3lyApply(true); refresh(); }; });
  host.querySelectorAll("[data-lycol]").forEach(i => { const [m, k] = i.dataset.lycol.split("|"); i.oninput = () => { l3lyColor(m, k, i.value); i.parentElement.classList.add("set"); }; i.ondblclick = () => { l3lyColor(m, k, null); refresh(); }; });
  host.querySelectorAll("[data-lycadeye]").forEach(b => { b.onclick = () => { const [id, nm] = b.dataset.lycadeye.split("|"); const key = `cadl:${id}:${nm}`, on = !ls(key).visible; setLayersVisible([key], on); if (typeof saveLayerState === "function") saveLayerState(); l3sRefresh(0); refresh(); }; });
  host.querySelectorAll("[data-lycadall]").forEach(b => { b.onclick = async () => { const [id, a] = b.dataset.lycadall.split("|"), r = cads().find(x => x.id === id); if (!r) return;
    if (a === "c") { for (const l of r.layers) await setCadColor(l.name, null); } else setLayersVisible(r.layers.map(l => `cadl:${id}:${l.name}`), a === "1");
    if (typeof saveLayerState === "function") saveLayerState(); l3sRefresh(0); refresh(); }; });
  host.querySelectorAll("[data-lycadcol]").forEach(i => { const [id, nm] = i.dataset.lycadcol.split("|"); let t = 0; i.oninput = () => { clearTimeout(t); t = setTimeout(async () => { await setCadColor(nm, i.value); l3sRefresh(0); }, 150); }; i.ondblclick = async () => { await setCadColor(nm, null); l3sRefresh(0); refresh(); }; });
  host.querySelectorAll("[data-lyother]").forEach(b => { b.onclick = () => { const k = b.dataset.lyother; if (k === "pdf") { const c = document.getElementById("v3ShowPlan"); if (c) { c.checked = false; c.dispatchEvent(new Event("change")); } } else { setLayersVisible([k], false); if (typeof saveLayerState === "function") saveLayerState(); l3sRefresh(0); } refresh(); }; });
}
