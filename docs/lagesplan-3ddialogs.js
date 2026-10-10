/* 3D-vyn: Tekla-inspirerade dialoger och kommandon (Victor 2026-10-08).
   - Kopiera special / Flytta special: Linjär (dX, dY, dZ, antal), Rotation (punkt, vinkel, dZ, antal),
     Spegling (linje genom punkt med vinkel). Varje fält kan hämtas med "Välj punkter" i modellen,
     resultatet förhandsvisas live som halvgenomskinliga objekt. Värdena sparas till nästa gång.
   - Egenskaper för flera markerade (som Teklas egenskapsdialog): kryssruta per fält, Ändra gäller
     bara de ikryssade. Att skriva i ett fält kryssar i det.
   - Dölj markerade (H), Visa bara markerade (I), Visa alla (U) – även lådor och byggnadens objekt.
   - Snitt: tryck på en yta så skärs modellen där (det som är närmast dig tas bort); flytta snittet med
     reglaget, vänd det eller lägg ett vågrätt snitt på valfri höjd.
   - Objektlistan (som Teklas Organizer): grupper, sök, markera, zooma, dölj per objekt.
   - Snabbsök kommando (Ctrl+K, som Teklas Quick Launch): alla kommandon med kortkommandon.
   - Markera alla av samma typ. */

// ---------------------------------------------------------------------
// Dialogfönster (flyttbara, minns läget)
// ---------------------------------------------------------------------
function l3DialogsInit() {
  l3.groups.prev = new THREE.Group(); l3.scene.add(l3.groups.prev);
  l3.hidden = new Set(); l3.hiddenObjs = new Set(); l3.clips = [];
  l3.renderer.localClippingEnabled = false;
}
function l3Dlg(id, title, html, opts = {}) {
  let d = document.getElementById(id);
  const host = document.getElementById("v3Canvas");
  if (!d) {
    d = document.createElement("div"); d.id = id; d.className = "v3-dlg";
    host.appendChild(d);
    const pos = (l3Prefs().dlgPos || {})[id] || { x: 70, y: 60 };
    d.style.left = Math.min(pos.x, Math.max(0, host.clientWidth - 340)) + "px"; d.style.top = Math.min(pos.y, Math.max(0, host.clientHeight - 200)) + "px";
  }
  d.innerHTML = `<div class="v3-dlg-h"><b>${escHtml(title)}</b><button type="button" class="v3-x" title="Stäng (Esc)">✕</button></div><div class="v3-dlg-b">${html}</div>`;
  d.classList.remove("hidden");
  d.querySelector(".v3-x").onclick = () => l3DlgClose(id);
  d.onclick = e => e.stopPropagation();
  // Dra i rubriken.
  const h = d.querySelector(".v3-dlg-h");
  h.onpointerdown = e => {
    if (e.target.closest("button")) return;
    const r = host.getBoundingClientRect(), sx = e.clientX - d.offsetLeft, sy = e.clientY - d.offsetTop;
    const mv = ev => { d.style.left = Math.max(0, Math.min(r.width - 80, ev.clientX - sx)) + "px"; d.style.top = Math.max(0, Math.min(r.height - 40, ev.clientY - sy)) + "px"; };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); const p = l3Prefs().dlgPos || {}; p[id] = { x: d.offsetLeft, y: d.offsetTop }; l3SetPref("dlgPos", p); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  d._onClose = opts.onClose || null;
  return d;
}
function l3DlgClose(id) {
  const d = document.getElementById(id);
  if (!d || d.classList.contains("hidden")) return false;
  d.classList.add("hidden");
  if (d._onClose) d._onClose();
  return true;
}
/* Esc stänger det senaste dialogfönstret (efter att ett pågående punktval avbrutits). */
function l3DialogKey(e) {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === "k") { e.preventDefault(); l3OpenLaunch(); return true; }
  if (e.key === "Escape") {
    if (l3.dlgPick) { l3.dlgPick = null; l3Status("Punktvalet avbröts."); l3SpPreview(); return true; }
    if (l3.clipPick) { l3.clipPick = false; l3.renderer.domElement.style.cursor = ""; l3Status(""); return true; }
    for (const id of ["v3Launch", "v3Special", "v3Clash", "v3Clip", "v3Models"]) if (l3DlgClose(id)) return true;
    return false;
  }
  if (mod || e.altKey) return false;
  if (k === "h" && !e.shiftKey) { l3HideSel(); return true; }
  if (k === "i") { l3Isolate(); return true; }
  if (k === "u") { l3ShowAll(); return true; }
  if (k === "o") { l3ToggleSnap("ortho"); return true; }
  if (k === "g") { l3ToggleSnap("grid"); return true; }
  return false;
}

// ---------------------------------------------------------------------
// Punktval i modellen för dialogerna (och snitt)
// ---------------------------------------------------------------------
function l3DlgPick(n, prompts, done) {
  l3.dlgPick = { n, pts: [], prompts, done };
  l3Status(prompts[0] + " (Esc avbryter)");
  l3.renderer.domElement.style.cursor = "crosshair";
  l3Render(); l3HandlesPos(); // handtagen göms direkt
}
function l3DlgPickTap(e) {
  if (l3.clipPick) { l3ClipAt(e); return true; }
  const pk = l3.dlgPick;
  if (!pk) return false;
  const s = l3Snap(e);
  if (!s) return true;
  pk.pts.push(s.point.clone());
  if (pk.pts.length < pk.n) { l3Status(pk.prompts[pk.pts.length] + " (Esc avbryter)"); return true; }
  l3.dlgPick = null; l3.renderer.domElement.style.cursor = "";
  pk.done(pk.pts.map(p => ({ x: p.x + l3.O[0], y: p.y + l3.O[1], z: p.z + l3.O[2] })));
  return true;
}

// ---------------------------------------------------------------------
// Kopiera special / Flytta special
// ---------------------------------------------------------------------
const L3_SP_DEF = { tab: "lin", dx: 0, dy: 0, dz: 0, n: 1, x0: "", y0: "", z0: "", ang: 90, rdz: 0, rn: 1, mx0: "", my0: "", mang: 90, preview: true };
let l3Sp = null; // { mode, v }
function l3SelCenter() {
  const list = l3SelList();
  if (!list.length) return null;
  return { x: list.reduce((s, p) => s + p.x, 0) / list.length, y: list.reduce((s, p) => s + p.y, 0) / list.length, z: list.reduce((s, p) => s + (Number(p.z) || 0) + (Number(p.dz) || 0), 0) / list.length };
}
function l3OpenSpecial(mode) {
  const v = { ...L3_SP_DEF, ...(l3Prefs().special || {}) };
  l3Sp = { mode, v };
  l3RenderSpecial();
  if (!l3.sel.size) l3Status("Markera de objekt som ska " + (mode === "copy" ? "kopieras" : "flyttas") + " – dialogen kan vara öppen under tiden.");
}
function l3RenderSpecial() {
  if (!l3Sp) return;
  const { mode, v } = l3Sp, copy = mode === "copy";
  const f = (k, label, unit, step = "0.1", ph = "") => `<label class="v3-dlg-f"><span>${label}</span><div class="v3-in"><input type="text" inputmode="decimal" data-sp="${k}" value="${v[k] === "" ? "" : String(v[k]).replace(".", ",")}" placeholder="${String(ph).replace(".", ",")}" /><em>${unit}</em></div></label>`;
  const c = l3SelCenter(), fmt = x => x == null ? "" : (Math.round(x * 1000) / 1000);
  const tabs = [["lin", "Linjär"], ["rot", "Rotation"], ["mir", "Spegling"]];
  const body = {
    lin: `<div class="v3-dlg-g3">${f("dx", "dX", "m")}${f("dy", "dY", "m")}${f("dz", "dZ", "m")}</div>
      <div class="v3-dlg-row"><button type="button" class="v3-dlg-pick" data-sppick="lin">Välj två punkter</button></div>
      <div class="v3-hint">Varje kopia hamnar dX, dY, dZ längre bort än den förra (som i Tekla).</div>`,
    rot: `<div class="v3-dlg-g3">${f("x0", "X0", "m", "0.1", fmt(c && c.x))}${f("y0", "Y0", "m", "0.1", fmt(c && c.y))}${f("z0", "Z0", "m", "0.1", fmt(c && c.z))}</div>
      <div class="v3-dlg-row"><button type="button" class="v3-dlg-pick" data-sppick="rot">Välj rotationspunkt</button><button type="button" class="v3-dlg-pick" data-sppick="rotang">Välj vinkel (3 punkter)</button></div>
      <div class="v3-dlg-g3">${f("ang", "Vinkel", "°", "1")}${f("rdz", "dZ", "m")}</div>
      <div class="v3-hint">Vrids kring en lodrät axel genom punkten. Tom punkt = markeringens mitt. Positiv vinkel = moturs.</div>`,
    mir: `<div class="v3-dlg-g3">${f("mx0", "X0", "m", "0.1", fmt(c && c.x))}${f("my0", "Y0", "m", "0.1", fmt(c && c.y))}${f("mang", "Vinkel", "°", "1")}</div>
      <div class="v3-dlg-row"><button type="button" class="v3-dlg-pick" data-sppick="mir">Välj två punkter på speglingslinjen</button></div>
      <div class="v3-hint">Speglas kring en lodrät linje genom punkten i vinkeln (0° = öst–väst, 90° = nord–syd). Läget och riktningen speglas.</div>`,
  }[v.tab];
  const d = l3Dlg("v3Special", copy ? "Kopiera special" : "Flytta special", `
    <div class="v3-segs v3-dlg-tabs">${tabs.map(([k, l]) => `<button type="button" data-sptab="${k}" class="${v.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${body}
    ${copy ? l3SpCountHtml(v) : ""}
    <label class="v3-chk"><input type="checkbox" id="v3SpPrev" ${v.preview ? "checked" : ""} /> Förhandsvisa</label>
    <div class="v3-dlg-foot"><span class="v3-dlg-sel">${l3.sel.size ? `${l3.sel.size} markerade` : "Inget markerat"}</span>
      <button type="button" class="v3-primary" id="v3SpGo">${copy ? "Kopiera" : "Flytta"}</button><button type="button" id="v3SpClose">Stäng</button></div>`,
    { onClose: () => { l3Sp = null; l3.dlgPick = null; l3ClearPrev(); } });
  d.querySelectorAll("[data-sptab]").forEach(b => { b.onclick = () => { v.tab = b.dataset.sptab; l3SpSave(); l3RenderSpecial(); }; });
  d.querySelectorAll("[data-sp]").forEach(inp => { inp.oninput = () => { const k = inp.dataset.sp; v[k] = inp.value === "" ? "" : placeNum(inp.value, 0); l3SpSave(); l3SpCountInfo(d); l3SpPreview(); }; });
  d.querySelectorAll("[data-spstep]").forEach(b => { b.onclick = () => {
    const k = v.tab === "rot" ? "rn" : "n", n = Math.max(1, Math.min(200, Math.round(Number(v[k]) || 1) + Number(b.dataset.spstep)));
    v[k] = n; l3SpSave(); const inp = d.querySelector(`[data-sp="${k}"]`); if (inp) inp.value = n; l3SpCountInfo(d); l3SpPreview();
  }; });
  l3SpCountInfo(d);
  d.querySelector("#v3SpPrev").onchange = e => { v.preview = e.target.checked; l3SpSave(); l3SpPreview(); };
  d.querySelectorAll("[data-sppick]").forEach(b => { b.onclick = () => {
    const k = b.dataset.sppick, R = x => Math.round(x * 1000) / 1000;
    if (k === "lin") l3DlgPick(2, ["Välj startpunkt.", "Välj slutpunkt."], ([a, b2]) => { Object.assign(v, { dx: R(b2.x - a.x), dy: R(b2.y - a.y), dz: R(b2.z - a.z) }); l3SpSave(); l3RenderSpecial(); l3Status("dX, dY och dZ hämtade."); });
    if (k === "rot") l3DlgPick(1, ["Välj rotationspunkt."], ([a]) => { Object.assign(v, { x0: R(a.x), y0: R(a.y), z0: R(a.z) }); l3SpSave(); l3RenderSpecial(); l3Status("Rotationspunkten hämtad."); });
    if (k === "rotang") l3DlgPick(3, ["Välj rotationspunkt.", "Välj en punkt i utgångsriktningen.", "Välj en punkt i den nya riktningen."], ([a, r, t]) => {
      let ang = (Math.atan2(t.y - a.y, t.x - a.x) - Math.atan2(r.y - a.y, r.x - a.x)) * 180 / Math.PI;
      ang = ((ang + 180) % 360 + 360) % 360 - 180;
      Object.assign(v, { x0: R(a.x), y0: R(a.y), z0: R(a.z), ang: Math.round(ang * 100) / 100 }); l3SpSave(); l3RenderSpecial(); l3Status(`Rotationspunkt och vinkel ${ang.toFixed(2)}° hämtade.`);
    });
    if (k === "mir") l3DlgPick(2, ["Välj en punkt på speglingslinjen.", "Välj en andra punkt på speglingslinjen."], ([a, b2]) => { Object.assign(v, { mx0: R(a.x), my0: R(a.y), mang: Math.round(Math.atan2(b2.y - a.y, b2.x - a.x) * 18000 / Math.PI) / 100 }); l3SpSave(); l3RenderSpecial(); l3Status("Speglingslinjen hämtad."); });
  }; });
  d.querySelector("#v3SpGo").onclick = l3SpApply;
  d.querySelector("#v3SpClose").onclick = () => l3DlgClose("v3Special");
  l3SpPreview();
}
/* Antal kopior – stor och tydlig ruta som i Teklas "Number of copies", med − / + och summering. */
function l3SpCountHtml(v) {
  if (v.tab === "mir") return `<div class="v3-spcount mir"><span>Antal kopior</span><b>1</b><em>Spegling ger en kopia per markerat objekt.</em></div>`;
  const k = v.tab === "rot" ? "rn" : "n";
  return `<div class="v3-spcount"><label for="v3SpN">Antal kopior</label>
    <div class="v3-spcount-in"><button type="button" data-spstep="-1" title="En färre">−</button><input type="text" inputmode="numeric" id="v3SpN" data-sp="${k}" value="${v[k] === "" ? "" : v[k]}" /><button type="button" data-spstep="1" title="En till">+</button></div>
    <em id="v3SpInfo"></em></div>`;
}
function l3SpCountInfo(d) {
  const el = d.querySelector("#v3SpInfo");
  if (!el || !l3Sp) return;
  const v = l3Sp.v, n = Math.max(1, Math.min(200, Math.round(Number(v[v.tab === "rot" ? "rn" : "n"]) || 1))), m = l3.sel.size;
  el.textContent = m ? `= ${n * m} nya objekt` : "Markera objekt";
}
function l3SpSave() { if (l3Sp) l3SetPref("special", { ...l3Sp.v }); }
/* Spegling av en placering kring en lodrät linje genom (x0, y0) i vinkeln ang (grader). */
function l3MirrorPlacement(p, x0, y0, ang) {
  const t = ang * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t);
  const m = (x, y) => { const vx = x - x0, vy = y - y0, d = vx * ux + vy * uy; return [placeR3(x0 + 2 * d * ux - vx), placeR3(y0 + 2 * d * uy - vy)]; };
  [p.x, p.y] = m(p.x, p.y);
  if (p.pts) p.pts = p.pts.map(q => [...m(q[0], q[1]), q[2] || 0]);
  if (!(placeLib(p.type) || {}).fence) p.rot = Math.round(((((2 * ang - (Number(p.rot) || 0)) % 360) + 360) % 360) * 10) / 10;
}
/* Omvandlingarna: en per kopia (flytta: en). */
function l3SpSteps() {
  const { mode, v } = l3Sp, copy = mode === "copy", c = l3SelCenter() || { x: 0, y: 0, z: 0 };
  const num = x => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Number(x));
  if (v.tab === "lin") {
    const n = copy ? Math.max(1, Math.min(200, Math.round(num(v.n) || 1))) : 1, dx = num(v.dx) || 0, dy = num(v.dy) || 0, dz = num(v.dz) || 0;
    return Array.from({ length: n }, (_, i) => p => placeShift(p, dx * (i + 1), dy * (i + 1), dz * (i + 1)));
  }
  if (v.tab === "rot") {
    const n = copy ? Math.max(1, Math.min(200, Math.round(num(v.rn) || 1))) : 1;
    const x0 = num(v.x0) ?? c.x, y0 = num(v.y0) ?? c.y, ang = num(v.ang) || 0, dz = num(v.rdz) || 0;
    return Array.from({ length: n }, (_, i) => p => { placeRotateAbout(p, x0, y0, ang * (i + 1)); if (dz) placeShift(p, 0, 0, dz * (i + 1)); });
  }
  const x0 = num(v.mx0) ?? c.x, y0 = num(v.my0) ?? c.y, ang = num(v.mang) ?? 90;
  return [p => l3MirrorPlacement(p, x0, y0, ang)];
}
function l3ClearPrev() { if (l3 && l3.groups.prev) { l3Clear(l3.groups.prev); l3Render(); } }
function l3SpPreview() {
  l3ClearPrev();
  if (!l3Sp || !l3Sp.v.preview || !l3.sel.size) return;
  const steps = l3SpSteps(), list = l3SelList();
  let n = 0;
  for (const fn of steps) for (const p of list) {
    if (++n > 300) break;
    const c = JSON.parse(JSON.stringify(p)); fn(c);
    const g = l3PlacementGroup(c);
    g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; o.material.depthWrite = false; o.material.color = new THREE.Color(0x3b82f6); } });
    l3.groups.prev.add(g);
  }
  // Rotationspunkt/speglingslinje som hjälp.
  const v = l3Sp.v, c0 = l3SelCenter();
  if (v.tab === "rot" || v.tab === "mir") {
    const num = x => (x === "" || x == null ? null : Number(x));
    const X = (v.tab === "rot" ? num(v.x0) : num(v.mx0)) ?? c0.x, Y = (v.tab === "rot" ? num(v.y0) : num(v.my0)) ?? c0.y, Z = c0.z;
    const P = new THREE.Vector3(X - l3.O[0], Y - l3.O[1], Z - l3.O[2]);
    if (v.tab === "rot") l3TmpLine(P, P.clone().add(new THREE.Vector3(0, 0, 8)), "#2563eb", false, l3.groups.prev);
    else { const t = (num(v.mang) ?? 90) * Math.PI / 180, L = 40; l3TmpLine(P.clone().add(new THREE.Vector3(-Math.cos(t) * L, -Math.sin(t) * L, 0)), P.clone().add(new THREE.Vector3(Math.cos(t) * L, Math.sin(t) * L, 0)), "#7c3aed", true, l3.groups.prev); }
  }
  l3Render();
}
function l3SpApply() {
  if (!l3Sp) return;
  const list = l3SelList();
  if (!list.length) { l3Status("Markera först objekten (tryck eller dra en ruta).", true); return; }
  const steps = l3SpSteps(), copy = l3Sp.mode === "copy";
  placeSnapshot();
  if (copy) {
    let n = 0;
    steps.forEach(fn => list.forEach(src => {
      const c = JSON.parse(JSON.stringify(src));
      Object.assign(c, { id: ghNewId(), created_at: new Date().toISOString(), by: settings.userName || null });
      delete c.ifc_at;
      c.name = placeNextName(src.name);
      fn(c); placements.push(c); placeTouch(c); l3AddPlacementMesh(c); n++;
    }));
    l3Status(`${n} ${n === 1 ? "kopia" : "kopior"} skapade. De ursprungliga är fortfarande markerade – tryck Kopiera igen för fler.`);
    l3Toast(`${n} ${n === 1 ? "kopia" : "kopior"} skapade.`, "Ångra", l3Undo);
  } else {
    list.forEach(p => { steps[0](p); placeTouch(p); l3RebuildOne(p); });
    l3Status(`${list.length} objekt flyttade.`);
  }
  l3Changed(); l3RenderSide(); l3SpPreview(); l3RenderObjList();
}

// ---------------------------------------------------------------------
// Egenskaper för flera markerade (kryssruta per fält, Ändra)
// ---------------------------------------------------------------------
function l3RenderMultiSide(side, list) {
  const libs = list.map(p => placeLib(p.type) || {});
  const same = k => { const vals = list.map(p => p[k] ?? ""); return vals.every(x => String(x) === String(vals[0])) ? vals[0] : null; };
  const allLib = libs.every(l => !l.isModel && !l.fence), anyR = libs.every(l => l.R);
  const fields = [
    ["dz", "Över ytan", "m", "number"], ["rot", "Vridning", "°", "number"],
    ...(allLib ? [["L", "Längd", "m", "number"], ["B", "Bredd", "m", "number"], ["H", "Höjd", "m", "number"]] : []),
    ...(anyR ? [["R", "Räckvidd", "m", "number"]] : []),
    ["color", "Färg", "", "color"], ["itemId", "Aktivitet", "", "select"], ["start", "Start", "", "date"], ["end", "Slut", "", "date"],
  ];
  const itemOpts = (typeof items !== "undefined" ? items : []).filter(r => r.start_date || r.object_name).slice(0, 3000);
  const row = ([k, label, unit, type]) => {
    const v = same(k);
    let inp;
    if (type === "select") inp = `<select data-mev="${k}"><option value="__same" ${v === null ? "selected" : ""}>(olika)</option><option value="" ${v === "" ? "selected" : ""}>– ingen –</option>${itemOpts.map(r => `<option value="${escHtml(r.id)}" ${v === r.id ? "selected" : ""}>${escHtml(r.object_name || r.activity || r.id)}</option>`).join("")}</select>`;
    else if (type === "color") inp = `<input type="color" data-mev="${k}" value="${v || "#888888"}" />`;
    else if (type === "number") inp = `<input type="text" inputmode="decimal" data-num="1" data-mev="${k}" value="${v === null ? "" : escHtml(String(v).replace(".", ","))}" placeholder="${v === null ? "(olika)" : ""}" />`;
    else inp = `<input type="${type}" data-mev="${k}" value="${v === null ? "" : escHtml(String(v))}" placeholder="${v === null ? "(olika)" : ""}" />`;
    return `<label class="v3-me"><input type="checkbox" data-mec="${k}" title="Ändra det här fältet" /><span>${label}</span><div class="v3-me-in">${inp}${unit ? `<em>${unit}</em>` : ""}</div></label>`;
  };
  side.dataset.id = "multi:" + list.map(p => p.id).join(",");
  side.innerHTML = `<div class="v3-side-h"><b>${list.length} objekt markerade</b><button type="button" class="v3-side-min" title="Fäll ihop/ut panelen">▾</button><button type="button" class="v3-x" id="v3Deselect" title="Avmarkera (Esc)">✕</button></div>
    <div class="v3-sub">${escHtml([...new Set(list.map(p => (placeLib(p.type) || {}).label || p.type))].join(", "))}</div>
    <div class="v3-sec">Egenskaper – kryssa i det som ska ändras</div>
    <div class="v3-me-list">${fields.map(row).join("")}</div>
    <div class="v3-me-act"><button type="button" class="v3-primary" id="v3MeApply">Ändra</button><button type="button" id="v3MeAll" title="Kryssa i/ur alla">Alla</button></div>
    <div class="v3-btns"><button type="button" id="v3Drop">${L3_ICO.down}Ställ på ytan</button><button type="button" id="v3Copy">${L3_ICO.copy}Duplicera</button>
      <button type="button" id="v3SpCopy">Kopiera special</button><button type="button" id="v3SpMove">Flytta special</button>
      <button type="button" id="v3Del" class="v3-danger">${L3_ICO.trash}Ta bort</button><button type="button" id="v3Focus">${L3_ICO.focus}Zooma</button></div>`;
  side.querySelectorAll("[data-mev]").forEach(inp => {
    const k = inp.dataset.mev, cb = side.querySelector(`[data-mec="${k}"]`);
    const on = () => { cb.checked = !(inp.tagName === "SELECT" && inp.value === "__same"); };
    inp.oninput = on; inp.onchange = on;
  });
  side.querySelector("#v3MeAll").onclick = () => { const cbs = [...side.querySelectorAll("[data-mec]")], all = cbs.every(c => c.checked); cbs.forEach(c => { c.checked = !all; }); };
  side.querySelector("#v3MeApply").onclick = () => {
    const ch = [...side.querySelectorAll("[data-mec]")].filter(c => c.checked).map(c => c.dataset.mec);
    if (!ch.length) { l3Status("Kryssa i de fält som ska ändras."); return; }
    const vals = {};
    for (const k of ch) {
      const inp = side.querySelector(`[data-mev="${k}"]`);
      if (inp.tagName === "SELECT" && inp.value === "__same") continue;
      if (inp.dataset.num) { if (inp.value.trim() === "" || !Number.isFinite(Number(inp.value.trim().replace(",", ".")))) { l3Status(`Fyll i ${k === "dz" ? "Över ytan" : k}.`, true); return; } vals[k] = placeNum(inp.value, 0); }
      else vals[k] = inp.value;
    }
    placeSnapshot();
    list.forEach(p => {
      Object.entries(vals).forEach(([k, v]) => {
        if (k === "rot") p.rot = ((v % 360) + 360) % 360;
        else if (k === "itemId") { p.itemId = v || null; const r = (items || []).find(x => x.id === p.itemId); if (r && !ch.includes("start")) p.start = r.start_date || p.start || ""; if (r && !ch.includes("end")) p.end = r.end_date || p.end || ""; }
        else if (["L", "B", "H", "R"].includes(k)) p[k] = Math.max(k === "R" ? 0 : 0.01, v);
        else p[k] = v;
      });
      placeTouch(p); l3RebuildOne(p);
    });
    l3Changed(); side.dataset.id = ""; l3RenderSide();
    l3Status(`${list.length} objekt ändrade (${ch.length} ${ch.length === 1 ? "fält" : "fält"}).`);
  };
  side.querySelector("#v3Drop").onclick = l3DropSel; side.querySelector("#v3Copy").onclick = l3DuplicateSel;
  side.querySelector("#v3SpCopy").onclick = () => l3OpenSpecial("copy"); side.querySelector("#v3SpMove").onclick = () => l3OpenSpecial("move");
  side.querySelector("#v3Del").onclick = l3DeleteSel; side.querySelector("#v3Focus").onclick = () => l3View("sel");
  side.querySelector("#v3Deselect").onclick = () => l3SelectIds([]);
}

// ---------------------------------------------------------------------
// Dölj / visa bara markerade / visa alla
// ---------------------------------------------------------------------
function l3HideSel() { return l3VisRecord("dölj", l3HideSel0); }
function l3HideSel0() {
  if (!l3.sel.size && typeof l3bs !== "undefined" && l3bs.sel.length) { l3bsHide(); return; }
  if (!l3.sel.size) { l3Status("Markera det som ska döljas (H), eller högerklicka på en låda/ett objekt i byggnaden."); return; }
  l3.sel.forEach(id => { l3.hidden.add(id); const g = l3.placeMeshes.get(id); if (g) g.visible = false; });
  const n = l3.sel.size; l3SelectIds([]); l3UpdateHidden();
  l3Toast(`${n} objekt dolda.`, "Visa alla", l3ShowAll);
}
function l3Isolate() { return l3VisRecord("visa bara markerade", l3Isolate0); }
function l3Isolate0() {
  if (!l3.sel.size && typeof l3bs !== "undefined" && l3bs.sel.length) { l3bsIsolate(); return; }
  if (!l3.sel.size) { l3Status("Markera det som ska visas (I = visa bara markerade)."); return; }
  l3.placeMeshes.forEach((g, id) => { if (!l3.sel.has(id)) { l3.hidden.add(id); g.visible = false; } });
  l3.isolated = true;
  if (l3.objMesh) l3.objMesh.visible = false;
  l3.groups.bldg.visible = false;
  l3UpdateHidden();
  l3Toast("Visar bara de markerade.", "Visa alla", l3ShowAll);
}
function l3ShowAll() { return l3VisRecord("visa alla", l3ShowAll0); }
function l3ShowAll0() {
  l3.hidden.clear(); l3.hiddenObjs.clear(); l3.isolated = false;
  l3.placeMeshes.forEach(g => { g.visible = true; });
  l3.groups.bldg.visible = true;
  if (typeof l3bShowAllRanges === "function") l3bShowAllRanges();
  l3BuildObjects(); l3UpdateHidden(); l3RenderLegend();
  l3Status("Allt visas.");
}
/* Döljer ett planerat objekt (låda) eller ett objekt i byggnaden (från menyn). */
function l3HideHit(h) { return l3VisRecord("dölj", () => l3HideHit0(h)); }
function l3HideHit0(h) {
  if (h.object === l3.objMesh) { const ids = h.object.userData.ids, id = ids && ids[h.face ? h.face.a : h.index]; if (id) { l3.hiddenObjs.add(id); l3BuildObjects(); } }
  else if (typeof l3bHideHit === "function") l3bHideHit(h);
  l3UpdateHidden(); l3HideInfo();
}
function l3HiddenCount() { return l3.hidden.size + l3.hiddenObjs.size + (typeof l3bHiddenCount === "function" ? l3bHiddenCount() : 0) + (l3.isolated ? 1 : 0); }
function l3UpdateHidden() {
  let chip = document.getElementById("v3HiddenChip");
  if (!chip) { chip = document.createElement("button"); chip.type = "button"; chip.id = "v3HiddenChip"; chip.className = "v3-hidden-chip"; chip.onclick = l3ShowAll; const f = document.querySelector(".v3-foot"); f.insertBefore(chip, f.children[1]); }
  const n = l3HiddenCount();
  chip.classList.toggle("hidden", !n);
  chip.textContent = l3.isolated ? "Visar bara markerade · Visa alla (U)" : `${n} dolda · Visa alla (U)`;
  l3RenderObjList(); l3Render();
}

// ---------------------------------------------------------------------
// Snitt (klipplan)
// ---------------------------------------------------------------------
function l3StartClip() { l3.clipPick = true; l3.renderer.domElement.style.cursor = "crosshair"; l3Render(); l3HandlesPos(); l3Status("Snitt: tryck på en yta där modellen ska skäras (det som är närmast dig tas bort). Esc avbryter."); }
function l3ClipAt(e) {
  l3.clipPick = false; l3.renderer.domElement.style.cursor = "";
  const h = l3Ray(e, l3Surfaces())[0];
  if (!h || !h.face) { l3Status("Ingen yta där – försök igen."); return; }
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
  if (n.dot(l3.camera.position.clone().sub(h.point)) < 0) n.negate();
  l3AddClip(n.negate(), h.point.clone());
}
function l3AddClip(normal, point) {
  if (l3.clips.length >= 6) { l3Status("Högst 6 snitt – ta bort ett först.", true); return; }
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  l3.clips.push({ plane, base: plane.constant, off: 0, label: Math.abs(normal.z) > 0.9 ? (normal.z < 0 ? "Vågrätt (ovanifrån)" : "Vågrätt (underifrån)") : "Lodrätt" });
  l3ApplyClips(); l3RenderClipDlg();
  l3Status("Snitt lagt. Flytta det med reglaget i snittfönstret.");
}
function l3ApplyClips() { l3.renderer.clippingPlanes = l3.clips.map(c => c.plane); l3Render(); }
function l3RenderClipDlg() {
  if (!l3.clips.length) { l3DlgClose("v3Clip"); return; }
  const d = l3Dlg("v3Clip", "Snitt", `<div class="v3-clips">${l3.clips.map((c, i) => `<div class="v3-clip"><b>Snitt ${i + 1}</b><span>${c.label}</span>
      <input type="range" min="-30" max="30" step="0.1" value="${c.off}" data-clipoff="${i}" title="Flytta snittet" />
      <input type="text" inputmode="decimal" value="${String(c.off).replace(".", ",")}" data-clipnum="${i}" title="Förskjutning (m)" />
      <button type="button" data-clipflip="${i}" title="Vänd – visa andra sidan">⇄</button><button type="button" data-clipdel="${i}" title="Ta bort">✕</button></div>`).join("")}</div>
    <div class="v3-dlg-foot"><button type="button" id="v3ClipNew">Nytt snitt…</button><button type="button" id="v3ClipH">Vågrätt snitt</button><button type="button" id="v3ClipClear" class="v3-danger">Ta bort alla</button></div>`,
    { onClose: () => {} });
  const set = (i, v) => { const c = l3.clips[i]; c.off = v; c.plane.constant = c.base - v; d.querySelector(`[data-clipoff="${i}"]`).value = v; const nb = d.querySelector(`[data-clipnum="${i}"]`); if (document.activeElement !== nb) nb.value = String(v).replace(".", ","); l3Render(); };
  d.querySelectorAll("[data-clipoff]").forEach(r => { r.oninput = () => set(+r.dataset.clipoff, Number(r.value)); });
  d.querySelectorAll("[data-clipnum]").forEach(r => { r.oninput = () => { const v = placeNum(r.value, 0); set(+r.dataset.clipnum, v); }; });
  d.querySelectorAll("[data-clipflip]").forEach(b => { b.onclick = () => { const c = l3.clips[+b.dataset.clipflip]; c.plane.negate(); c.base = c.plane.constant; c.off = 0; l3RenderClipDlg(); l3Render(); }; });
  d.querySelectorAll("[data-clipdel]").forEach(b => { b.onclick = () => { l3.clips.splice(+b.dataset.clipdel, 1); l3ApplyClips(); l3RenderClipDlg(); }; });
  d.querySelector("#v3ClipNew").onclick = l3StartClip;
  d.querySelector("#v3ClipH").onclick = l3ClipHorizontal;
  d.querySelector("#v3ClipClear").onclick = l3ClearClips;
}
/* Vågrätt snitt: allt ovanför tas bort, på höjden för det markerade (eller vyns mittpunkt) + 1,5 m. */
function l3ClipHorizontal() {
  const c = l3SelCenter();
  const z = c ? c.z - l3.O[2] + 1.5 : l3.orbit.target.z + 1.5;
  l3AddClip(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, z));
}
function l3ClearClips() { l3.clips = []; l3ApplyClips(); l3DlgClose("v3Clip"); l3Status("Snitten är borttagna."); }

// ---------------------------------------------------------------------
// Objektlistan (Organizer)
// ---------------------------------------------------------------------
function l3RenderObjList() {
  // Lager-fliken visar också etableringen per typ: håll den aktuell.
  { const lay = document.getElementById("v3PalLayers"); if (lay && !lay.classList.contains("hidden") && typeof l3LayersRender === "function") l3LayersRender(); }
  const host = document.getElementById("v3ObjList");
  if (!host || !l3 || host.closest(".hidden")) return;
  const q = ((document.getElementById("v3ObjSearch") || {}).value || "").trim().toLowerCase();
  const groups = new Map();
  placements.forEach(p => {
    const l = placeLib(p.type) || { label: p.type };
    if (q && !(`${p.name} ${l.label}`.toLowerCase().includes(q))) return;
    if (!groups.has(l.label)) groups.set(l.label, []);
    groups.get(l.label).push(p);
  });
  const eye = on => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">${on ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>' : '<path d="M3 3l18 18M10.6 6.1A10.6 10.6 0 0 1 12 6c7 0 11 6 11 6a17 17 0 0 1-3.2 3.9M6.2 6.6C3 8.6 1 12 1 12s4 7 11 7a10 10 0 0 0 5-1.3"/>'}</svg>`;
  let html = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv")).map(([label, list]) => {
    const vis = list.filter(p => !l3.hidden.has(p.id)).length;
    return `<div class="v3-ol-g"><button type="button" class="v3-ol-eye" data-olgeye="${escHtml(label)}" title="Dölj/visa gruppen">${eye(vis > 0)}</button><b data-olg="${escHtml(label)}" title="Markera alla i gruppen">${escHtml(label)}</b><span>${list.length}</span></div>` +
      list.map(p => `<div class="v3-ol-r ${l3.sel.has(p.id) ? "on" : ""} ${l3.hidden.has(p.id) ? "off" : ""}" data-olid="${escHtml(p.id)}"><button type="button" class="v3-ol-eye" data-oleye="${escHtml(p.id)}">${eye(!l3.hidden.has(p.id))}</button><i style="background:${p.color || (placeLib(p.type) || {}).color || "#888"}"></i><span>${escHtml(p.name || "")}</span></div>`).join("");
  }).join("");
  if (typeof l3b !== "undefined" && l3b.models.length) html += `<div class="v3-ol-g"><b>Byggnad</b><span>${l3b.models.length}</span></div>` + l3b.models.map(m => `<label class="v3-ol-r v3-chk"><input type="checkbox" data-olbm="${escHtml(m.id)}" ${m.visible ? "checked" : ""} /><span>${escHtml(m.name)}</span></label>`).join("");
  host.innerHTML = html || `<div class="v3-pal-hint">${q ? "Inget matchar." : "Ingen etablering än – lägg till från fliken Lägg till."}</div>`;
  host.querySelectorAll("[data-olid]").forEach(r => {
    r.onclick = e => { if (e.target.closest("[data-oleye]")) return; const id = r.dataset.olid; if (e.shiftKey || e.ctrlKey || e.metaKey) { const s = new Set(l3.sel); s.has(id) ? s.delete(id) : s.add(id); l3SelectIds([...s]); } else l3SelectIds([id]); l3RenderObjList(); };
    r.ondblclick = () => { l3SelectIds([r.dataset.olid]); l3View("sel"); };
  });
  host.querySelectorAll("[data-oleye]").forEach(b => { b.onclick = () => { const id = b.dataset.oleye, g = l3.placeMeshes.get(id); if (l3.hidden.has(id)) { l3.hidden.delete(id); if (g) g.visible = true; } else { l3.hidden.add(id); if (g) g.visible = false; if (l3.sel.has(id)) { const s = new Set(l3.sel); s.delete(id); l3SelectIds([...s]); } } l3UpdateHidden(); }; });
  host.querySelectorAll("[data-olgeye]").forEach(b => { b.onclick = () => {
    const list = placements.filter(p => (placeLib(p.type) || { label: p.type }).label === b.dataset.olgeye), anyVis = list.some(p => !l3.hidden.has(p.id));
    list.forEach(p => { const g = l3.placeMeshes.get(p.id); if (anyVis) { l3.hidden.add(p.id); if (g) g.visible = false; } else { l3.hidden.delete(p.id); if (g) g.visible = true; } });
    if (anyVis) l3SelectIds([...l3.sel].filter(id => !l3.hidden.has(id)));
    l3UpdateHidden();
  }; });
  host.querySelectorAll("[data-olg]").forEach(b => { b.onclick = () => l3SelectIds(placements.filter(p => (placeLib(p.type) || { label: p.type }).label === b.dataset.olg && !l3.hidden.has(p.id)).map(p => p.id)); });
  host.querySelectorAll("[data-olbm]").forEach(c => { c.onchange = () => { l3bShow(c.dataset.olbm, c.checked); l3Render(); }; });
}

/* Lista över etableringen (som Teklas rapporter): CSV som Excel öppnar direkt (semikolon, decimalkomma,
   UTF-8 med BOM). Bara det som syns i listan (sökningen) – eller allt. Ändrar ingenting. */
function l3CsvRows() {
  const q = ((document.getElementById("v3ObjSearch") || {}).value || "").trim().toLowerCase();
  const byId = new Map((typeof items !== "undefined" ? items : []).map(r => [r.id, r]));
  const n = v => v === "" || v == null || !Number.isFinite(Number(v)) ? "" : String(Math.round(Number(v) * 1000) / 1000).replace(".", ",");
  const head = ["Namn", "Typ", "Längd (m)", "Bredd (m)", "Höjd (m)", "Räckvidd (m)", "Staketlängd (m)", "X", "Y", "Z underkant", "Z överkant", "Över ytan (m)", "Vridning (°)", "Start", "Slut", "Aktivitet", "Status på datumet"];
  const rows = placements.filter(p => { const l = placeLib(p.type) || { label: p.type }; return !q || `${p.name} ${l.label}`.toLowerCase().includes(q); }).map(p => {
    const l = placeLib(p.type) || { label: p.type }, r = p.itemId ? byId.get(p.itemId) : null;
    const fl = l.fence ? (p.pts || []).reduce((s, q2, i, a) => i ? s + Math.hypot(q2[0] - a[i - 1][0], q2[1] - a[i - 1][1]) : 0, 0) : "";
    return [p.name || "", l.label || p.type, l.fence || l.isModel ? "" : n(p.L), l.fence || l.isModel ? "" : n(p.B), n(p.H), l.R != null ? n(p.R) : "", n(fl), n(p.x), n(p.y), n(placeBaseZ(p)), n(placeBaseZ(p) + (Number(l3PlaceHeight(p)) || 0)), n(p.dz), l.fence ? "" : n(p.rot),
      p.start || "", p.end || "", r ? [r.object_name, r.activity].filter(Boolean).join(" · ") : "", l3PlaceOnDate(p) ? "På plats" : "Ej på plats"];
  });
  return [head, ...rows];
}
function l3ExportCsv() {
  const rows = l3CsvRows();
  if (rows.length < 2) { l3Status("Ingen etablering att lista."); return; }
  const cell = v => { v = String(v ?? ""); if (/^[=+@]|^-[^0-9]/.test(v)) v = "'" + v; /* aldrig en formel i Excel */ return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const csv = "\ufeff" + rows.map(r => r.map(cell).join(";")).join("\r\n") + "\r\n";
  const name = `Etablering ${(typeof projectName !== "undefined" && projectName) || ""} ${$("dateInput").value || todayIso()}.csv`.replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), name);
  l3Status(`Listan med ${rows.length - 1} objekt är nedladdad (${name}).`);
}

// ---------------------------------------------------------------------
// Markera alla av samma typ
// ---------------------------------------------------------------------
function l3SelectSimilar() {
  const types = new Set(l3SelList().map(p => p.type));
  if (!types.size) { l3Status("Markera ett objekt först."); return; }
  l3SelectIds(placements.filter(p => types.has(p.type) && !l3.hidden.has(p.id)).map(p => p.id));
  l3Status(`${l3.sel.size} objekt av samma typ markerade.`);
}

// ---------------------------------------------------------------------
// Snabbsök kommando (Ctrl+K)
// ---------------------------------------------------------------------
function l3Commands() {
  const sel = () => l3.sel.size > 0;
  const C = [
    ["Välj", "Mellanslag", () => l3SetTool("select")], ["Flytta (punkt till punkt)", "M", () => l3SetTool("move")], ["Vrid", "Q", () => l3SetTool("rotate")],
    ["Rikta kant mot kant", "A", () => l3SetTool("align")], ["Mät", "T", () => l3SetTool("measure")],
    ["Kopiera special…", "", () => l3OpenSpecial("copy")], ["Flytta special…", "", () => l3OpenSpecial("move")],
    ["Ångra", "Ctrl+Z", l3Undo], ["Gör om", "Ctrl+Y", l3Redo], ["Duplicera", "Ctrl+D", l3DuplicateSel, sel], ["Kopiera", "Ctrl+C", l3CopySel, sel], ["Klistra in", "Ctrl+V", () => l3Paste()],
    ["Ta bort markerade", "Delete", l3DeleteSel, sel], ["Ställ på ytan", "", l3DropSel, sel], ["Markera alla", "Ctrl+A", () => l3SelectIds(placements.filter(p => !l3.hidden.has(p.id)).map(p => p.id))],
    ["Markera alla av samma typ", "", l3SelectSimilar, sel], ["Avmarkera", "Esc", () => l3SelectIds([])],
    ["Dölj markerade", "H", l3HideSel, sel], ["Visa bara markerade", "I", l3Isolate, sel], ["Visa alla", "U", l3ShowAll],
    ["Kollisionskontroll…", "", l3OpenClash], ["Snitt…", "", l3StartClip], ["Vågrätt snitt", "", l3ClipHorizontal], ["Ta bort alla snitt", "", l3ClearClips, () => l3.clips.length > 0],
    ["Översikt (visa allt)", "Home", () => l3Frame(true)], ["Vy uppifrån", "", () => l3View("top")], ["Vy från norr", "", () => l3View("n")], ["Vy från söder", "", () => l3View("s")],
    ["Vy från öster", "", () => l3View("e")], ["Vy från väster", "", () => l3View("w")], ["Zooma till markerat", "F", () => l3View("sel"), sel],
    ["Plan ↔ 3D", "Ctrl+P", l3TogglePlan], ["Parallell projektion av/på", "", () => l3SetProjection(!l3IsOrtho())], ["Rotationscentrum", "V", l3StartV],
    ["Visa byggnaden från Trimble Connect…", "", () => { document.getElementById("v3ShowBtn").click(); l3bOpenDialog(); }],
    ["Planerade objekt: lådor", "", () => l3SetObjMode("solid")], ["Planerade objekt: genomskinliga", "", () => l3SetObjMode("ghost")], ["Planerade objekt: konturer", "", () => l3SetObjMode("edges")], ["Planerade objekt: dolda", "", () => l3SetObjMode("hidden")],
    ["Fäst mot hörn av/på", "", () => l3ToggleSnap("end")], ["Fäst mot mittpunkter av/på", "", () => l3ToggleSnap("mid")], ["Fäst mot kanter av/på", "", () => l3ToggleSnap("edge")],
    ["Fäst mot axlar av/på", "", () => l3ToggleSnap("axis")], ["Orto av/på", "O", () => l3ToggleSnap("ortho")], ["Rutnät av/på", "G", () => l3ToggleSnap("grid")],
    ["Objektlistan", "", () => l3PalTab("list")], ["Exportera lista (Excel/CSV)", "", l3ExportCsv], ["Biblioteket (lägg till)", "", () => l3PalTab("add")],
    ["Spara som IFC i Trimble Connect", "", l3SaveIfc], ["Hjälp och kortkommandon", "?", () => document.getElementById("v3HelpBtn").click()], ["Tillbaka till 2D", "", close3d],
  ];
  C.push(["Spara vy…", "", () => { document.getElementById("v3ViewsBtn").click(); setTimeout(() => document.getElementById("v3SvName").focus(), 0); }]);
  l3SavedViews().forEach((v, i) => C.push([`Gå till vy: ${v.name}`, "", () => l3GoView(i)]));
  Object.entries(PLACE_LIB).forEach(([k, l]) => C.push([`Lägg till: ${l.label}`, "", () => { l3SetTool("select"); l3.addType = k; l3.fenceId = null; l3RenderLib(); l3Status(l.fence ? "Staket: tryck första punkten." : "Tryck där objektet ska stå."); }]));
  C.push(["Hämta modell (Sketchfab, Trimble Connect, fil)…", "", () => l3OpenModels()]);
  (typeof placeAssets !== "undefined" ? placeAssets : []).forEach(a => C.push([`Lägg till: ${a.name}`, "", () => { l3SetTool("select"); l3.addType = `model:${a.id}`; l3RenderLib(); l3Status("Tryck där objektet ska stå."); }]));
  return C.map(([label, keys, run, ok]) => ({ label, keys, run, ok: ok || (() => true) }));
}
function l3SetObjMode(m) { l3SetPref("objs", m); document.querySelectorAll("[data-v3objs]").forEach(b => b.classList.toggle("on", b.dataset.v3objs === m)); l3BuildObjects(); l3Render(); }
function l3OpenLaunch() {
  const d = l3Dlg("v3Launch", "Snabbsök kommando", `<input type="search" id="v3LaunchQ" placeholder="Skriv ett kommando, t.ex. kopiera, snitt, uppifrån…" autocomplete="off" /><div class="v3-launch" id="v3LaunchList"></div>`, {});
  d.classList.add("v3-launch-dlg");
  const host = document.getElementById("v3Canvas");
  d.style.left = Math.max(10, (host.clientWidth - 440) / 2) + "px"; d.style.top = "40px";
  const cmds = l3Commands(), q = d.querySelector("#v3LaunchQ");
  let hit = [], idx = 0;
  const render = () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    hit = cmds.filter(c => words.every(w => c.label.toLowerCase().includes(w))).slice(0, 12);
    idx = Math.min(idx, Math.max(0, hit.length - 1));
    d.querySelector("#v3LaunchList").innerHTML = hit.map((c, i) => `<button type="button" data-li="${i}" class="${i === idx ? "on" : ""}" ${c.ok() ? "" : "disabled"}><span>${escHtml(c.label)}</span>${c.keys ? `<kbd>${escHtml(c.keys)}</kbd>` : ""}</button>`).join("") || `<div class="v3-pal-hint">Inget kommando matchar.</div>`;
    d.querySelectorAll("[data-li]").forEach(b => { b.onclick = () => run(+b.dataset.li); });
  };
  const run = i => { const c = hit[i]; if (!c || !c.ok()) return; l3DlgClose("v3Launch"); c.run(); };
  q.oninput = () => { idx = 0; render(); };
  q.onkeydown = e => {
    if (e.key === "ArrowDown") { idx = Math.min(hit.length - 1, idx + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { idx = Math.max(0, idx - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") { run(idx); e.preventDefault(); }
    else if (e.key === "Escape") { l3DlgClose("v3Launch"); e.preventDefault(); }
  };
  render(); setTimeout(() => q.focus(), 0);
}
function l3PalTab(t) {
  const pal = document.getElementById("v3Pal");
  if (pal.classList.contains("hidden")) document.getElementById("v3PalOpen").click();
  document.querySelectorAll("[data-paltab]").forEach(b => b.classList.toggle("on", b.dataset.paltab === t));
  document.getElementById("v3PalAdd").classList.toggle("hidden", t !== "add");
  document.getElementById("v3PalList").classList.toggle("hidden", t !== "list");
  const lay = document.getElementById("v3PalLayers"); if (lay) lay.classList.toggle("hidden", t !== "layers");
  const pp = document.getElementById("v3PalProps"); if (pp) pp.classList.toggle("hidden", t !== "props");
  const pg = document.getElementById("v3PalGroups"); if (pg) pg.classList.toggle("hidden", t !== "groups");
  l3SetPref("palTab", t);
  if (t === "list") l3RenderObjList();
  if (t === "layers" && typeof l3LayersRender === "function") l3LayersRender();
  if (t === "props" && typeof l3pRenderTab === "function") l3pRenderTab();
  if (t === "groups" && typeof l3gRenderTab === "function") l3gRenderTab();
}
