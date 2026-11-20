/* Räckvidd som heltäckande cylinder (Victor 2026-11-20): objekt med räckvidd (tornkran, mobilkran, pumpbil, belysningsmast) kan visa räckvidden
   som den vanliga ringen på marken, som en genomskinlig cylinder upp till en höjd man skriver in själv, eller inte alls. Färg och opacitet väljs
   per objekt, och en effekt (toning uppåt, band och ljusa kanter) kan slås av och på. Fälten sparas med objektet: reachMode, reachH, reachOp, reachCol, reachFx. */

const L3REACH_MODES = [["ring", "Ring på marken"], ["cyl", "Cylinder upp till höjd"], ["off", "Ingen"]];
/* Valt läge; utan val gäller det som objektet ritar sedan tidigare (ring för kranarna, annars ingen). */
function l3reachMode(p) {
  if (p.reachMode === "ring" || p.reachMode === "cyl" || p.reachMode === "off") return p.reachMode;
  const g = typeof l3 !== "undefined" && l3 && l3.placeMeshes ? l3.placeMeshes.get(p.id) : null;
  return g && g.userData.hadReach ? "ring" : "off";
}
const l3reachH = p => (Number(p.reachH) > 0 ? Number(p.reachH) : Number(p.H) || Number((placeLib(p.type) || {}).H) || 10);
const l3reachOp = p => (Number.isFinite(Number(p.reachOp)) && p.reachOp !== undefined && p.reachOp !== "" ? Math.max(3, Math.min(100, Number(p.reachOp))) : 22);
const l3reachCol = p => String(p.reachCol || p.color || (placeLib(p.type) || {}).color || "#38bdf8");
const l3reachFx = p => p.reachFx !== false;

/* Cylindern: öppen mantel, RGBA per hörn (toning uppåt och band när effekten är på), plus ljusa kantlinjer upptill och nedtill. */
function l3reachBuild(p) {
  const R = Math.max(0.1, Number(p.R) || 0), h = l3reachH(p), op = l3reachOp(p) / 100, fx = l3reachFx(p), c = new THREE.Color(l3reachCol(p));
  const N = p._segs || Math.max(48, Math.min(160, Math.round(R * 3))), M = fx ? Math.max(6, Math.min(24, Math.round(h / 2))) : 1, pos = [], col = [], idx = [];
  for (let j = 0; j <= M; j++) {
    const t = j / M, a = fx ? op * (1 - 0.7 * t) * (j % 2 ? 0.6 : 1) + (j === M ? 0 : 0) : op;
    for (let i = 0; i <= N; i++) { const u = i / N * Math.PI * 2; pos.push(R * Math.cos(u), R * Math.sin(u), h * t); col.push(c.r, c.g, c.b, a); }
  }
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1; idx.push(a, b, e, a, e, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const out = [mesh];
  const rim = z => { const pts = []; for (let i = 0; i < N; i++) { const u = i / N * Math.PI * 2; pts.push(new THREE.Vector3(R * Math.cos(u), R * Math.sin(u), z)); } return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c.clone().lerp(new THREE.Color("#ffffff"), fx ? 0.45 : 0.1), transparent: true, opacity: Math.min(1, 0.35 + op * 1.6), depthWrite: false })); };
  out.push(rim(0.03), rim(h));
  if (fx) { // svagt lock så att volymen syns uppifrån
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, N), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op * 0.35, depthWrite: false, side: THREE.DoubleSide })); cap.position.z = h; out.push(cap);
  }
  return out;
}
/* Ringen på marken (när färg, opacitet eller kant är vald): fylld skiva med kantlinje. */
function l3reachRing(p) {
  const R = Math.max(0.1, Number(p.R) || 0), op = l3reachOp(p) / 100, c = new THREE.Color(l3reachCol(p)), N = Math.max(48, Math.min(160, Math.round(R * 3)));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, N), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })); disc.position.z = 0.03;
  const pts = []; for (let i = 0; i < N; i++) { const u = i / N * Math.PI * 2; pts.push(new THREE.Vector3(R * Math.cos(u), R * Math.sin(u), 0.04)); }
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: Math.min(1, 0.4 + op), depthWrite: false }));
  return [disc, rim];
}
function l3reachApply(grp, p) {
  const lib = placeLib(p.type) || {}; if (!grp || !(Number(p.R) > 0) || !(Number(lib.R) > 0 || Number(p.R) > 0)) return;
  const old = []; grp.traverse(o => { if (o.userData && o.userData.reach) old.push(o); });
  grp.userData.hadReach = old.some(o => !o.userData.reachNew);
  if (p.reachMode !== "ring" && p.reachMode !== "cyl" && p.reachMode !== "off") return; // inget val: objektets egen ring (om den finns) lämnas orörd
  old.forEach(o => { if (o.parent) o.parent.remove(o); if (o.geometry) o.geometry.dispose(); });
  if (p.reachMode === "off") return;
  (p.reachMode === "cyl" ? l3reachBuild(p) : l3reachRing(p)).forEach(m => { m.userData.noHit = true; m.userData.reach = true; m.userData.reachNew = true; m.renderOrder = 2; grp.add(m); });
}
/* Samma val hos alla ritare av etableringsgruppen: lagesplan-3d.js bygger gruppen, här läggs räckvidden på. */
(function wrap() {
  if (typeof l3PlacementGroup !== "function" || l3PlacementGroup.__reach) { if (typeof l3PlacementGroup !== "function") setTimeout(wrap, 200); return; }
  const f0 = l3PlacementGroup;
  l3PlacementGroup = function (p) { const g = f0(p); try { l3reachApply(g, p); } catch (e) { console.warn("Räckvidd", e); } return g; };
  l3PlacementGroup.__reach = true;
})();

/* ---- Panelen under Mått (ett fält per val: rullgardin, höjd, färg, opacitet och effekt) ---- */
function l3reachHtml(p) {
  const lib = placeLib(p.type) || {}; if (!(Number(lib.R) > 0 || Number(p.R) > 0)) return "";
  const m = l3reachMode(p), esc = s => String(s).replace(/"/g, "&quot;");
  return `<div class="v3-sec">Räckvidd</div>
    <label class="v3-field"><span>Visa som</span><select data-reach="mode">${L3REACH_MODES.map(([v, t]) => `<option value="${v}"${m === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    ${m === "off" ? "" : `<div class="v3-grid">${m === "cyl" ? `<label><span>Höjd</span><div class="v3-in"><input type="text" inputmode="decimal" data-reach="h" value="${String(l3reachH(p)).replace(".", ",")}" /><em>m</em></div></label>` : ""}
</div>
      <div class="v3-look"><label class="v3-look-c"><span>Färg</span><input type="color" data-reach="col" value="${esc(/^#[0-9a-f]{6}$/i.test(l3reachCol(p)) ? l3reachCol(p) : "#38bdf8")}" /></label>
      <label class="v3-look-o"><span>Opacitet <b data-reach-ov>${Math.round(l3reachOp(p))} %</b></span><input type="range" min="3" max="100" step="1" data-reach="op" value="${Math.round(l3reachOp(p))}" /></label></div>
      ${m === "cyl" ? `<label class="v3-lay-sw-row" title="Toning uppåt, ljusa kanter och ett svagt lock"><span>✨ Effekt</span><span class="v3-lay-sw"><input type="checkbox" role="switch" data-reach="fx" ${l3reachFx(p) ? "checked" : ""} /><i></i></span></label>` : ""}`}`;
}
function l3reachBind(side, p) {
  let t = 0; const live = () => { clearTimeout(t); t = setTimeout(() => { placeTouch(p); l3RebuildOne(p); l3Changed(); }, 50); };
  side.querySelectorAll("[data-reach]").forEach(el => {
    const k = el.dataset.reach, ev = k === "op" || k === "col" ? "oninput" : "onchange";
    el[ev] = () => {
      if (!el._snap) { placeSnapshot(); el._snap = true; }
      if (k === "mode") { p.reachMode = el.value; if (el.value === "cyl" && !(Number(p.reachH) > 0)) delete p.reachH; }
      else if (k === "h") { const v = placeNum(el.value, l3reachH(p)); p.reachH = Math.max(0.1, v); }
      else if (k === "R") { p.R = Math.max(0.1, placeNum(el.value, p.R)); }
      else if (k === "col") p.reachCol = el.value;
      else if (k === "op") { p.reachOp = Number(el.value); const b = side.querySelector("[data-reach-ov]"); if (b) b.textContent = el.value + " %"; }
      else if (k === "fx") p.reachFx = !!el.checked;
      live(); if (k === "mode" || k === "fx") { side.dataset.id = ""; setTimeout(() => l3RenderSide(), 80); }
    };
    el.onblur = () => { el._snap = false; };
  });
}

/* ---- Gå-läget (WASD) och låsta fordon: kranens och grävmaskinens räckvidd som cylinder (Victor 2026-11-20) ----------------------------------------------------------------------
   Radien är den levande arbetsradien (bommen/armen rör sig, cylindern växer och krymper med den). Höjden skrivs in själv; tomt = automatisk (kranens bomspets, grävmaskinen 8 m).
   Inställningarna sparas som val (walkReach) och gäller både körning och låsta fordon. Cylindern följer med fordonet, ligger kvar när det låses och följer med till IFC. */
const L3RW_KINDS = { crane: { cx: -1.3, rad: "Radie", hgt: "Lyfthöjd (bomspets)", auto: 0 }, excavator: { cx: 0, rad: "Räckvidd (skopspets)", hgt: null, auto: 8 } };
function l3rwCfg() { const w = l3Prefs().walkReach || {}; return { mode: w.mode === "cyl" ? "cyl" : "ring", h: Number(w.h) > 0 ? Number(w.h) : 0, op: Number.isFinite(Number(w.op)) && w.op !== undefined && w.op !== "" ? Math.max(3, Math.min(100, Number(w.op))) : 22, col: /^#[0-9a-f]{6}$/i.test(w.col || "") ? w.col : "#38bdf8", fx: w.fx !== false }; }
function l3rwSet(k, v) { l3SetPref("walkReach", { ...(l3Prefs().walkReach || {}), [k]: v }); }
const l3rwNum = (info, lab) => { const x = (info || []).find(q => q[0] === lab); return x ? parseFloat(String(x[1]).replace(",", ".")) : NaN; };
/* Enhetscylinder (radie 1, höjd 1) som skalas till levande mått; samma geometri (utan toning) följer med till IFC. */
function l3rwMake(cfg) {
  const grp = new THREE.Group(); grp.userData.noHit = true;
  const parts = l3reachBuild({ R: 1, reachH: 1, reachOp: cfg.op, reachCol: cfg.col, reachFx: cfg.fx, _segs: 128 });
  parts.forEach((m, i) => { m.userData.noHit = true; m.raycast = () => {}; m.renderOrder = 3; if (i > 0) m.userData.noIfc = true; if (i === 0) { m.userData.ifcGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5); m.userData.ifcColor = cfg.col; m.userData.ifcTr = Math.round((1 - cfg.op / 100) * 100) / 100; } grp.add(m); });
  grp.userData.key = [cfg.op, cfg.col, cfg.fx].join(); grp.userData.on = true; return grp;
}
function l3rwSync() {
  if (typeof l3w === "undefined" || !l3w.on || !l3w.av || !l3w.av.g) return;
  const g = l3w.av.g, K = L3RW_KINDS[l3w.kind], cfg = l3rwCfg(); let cyl = g.userData.reachCyl;
  const ring = g.children.find(ch => ch.userData && ch.userData.noIfc && ch.children.length > 3);
  if (!K || cfg.mode !== "cyl") { if (cyl) { cyl.visible = false; cyl.userData.on = false; } return; }
  if (!cyl || cyl.userData.key !== [cfg.op, cfg.col, cfg.fx].join()) {
    if (cyl) { g.remove(cyl); cyl.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    cyl = l3rwMake(cfg); g.add(cyl); g.userData.reachCyl = cyl;
  }
  cyl.userData.on = true;
  const R = l3rwNum(l3w.info, K.rad), show = !!(ring && ring.visible) && R > 0.05; if (ring) ring.visible = false; // cylindern ersätter ringen med etiketter
  cyl.visible = show; if (!show) return;
  const H = cfg.h > 0 ? cfg.h : (K.hgt ? Math.max(3, l3rwNum(l3w.info, K.hgt) || 10) : K.auto);
  cyl.position.set(K.cx, 0, 0.05); cyl.scale.set(R, R, H);
}
(function wrapWalk() {
  if (typeof l3wApply !== "function" || typeof l3wCtlPanel !== "function") { setTimeout(wrapWalk, 250); return; }
  if (l3wApply.__rw) return;
  const a0 = l3wApply; l3wApply = function () { const r = a0.apply(this, arguments); try { l3rwSync(); } catch (e) { console.warn("Räckvidd (gå-läge)", e); } return r; }; l3wApply.__rw = true;
  const p0 = l3wCtlPanel; l3wCtlPanel = function () {
    const r = p0.apply(this, arguments), p = l3w.ctlEl;
    if (p && !p.classList.contains("hidden") && L3RW_KINDS[l3w.kind] && !p.querySelector(".v3-rw")) {
      const c = l3rwCfg();
      const anc = p.querySelector('[data-cb="out"]') || p.querySelector('[data-cb="auto"]'); (anc || p).insertAdjacentHTML(anc ? "afterend" : "beforeend", `<div class="v3-rw"><div class="v3-rw-r"><span>Räckvidd</span><select data-rw="mode"><option value="ring"${c.mode === "ring" ? " selected" : ""}>Ring</option><option value="cyl"${c.mode === "cyl" ? " selected" : ""}>Cylinder</option></select></div>${c.mode === "cyl" ? `<div class="v3-rw-r"><span>Höjd</span><input type="text" inputmode="decimal" data-rw="h" placeholder="auto" value="${c.h ? String(c.h).replace(".", ",") : ""}" style="width:56px"><em>m</em><input type="color" data-rw="col" value="${c.col}" title="Färg"><input type="range" data-rw="op" min="3" max="100" value="${Math.round(c.op)}" title="Opacitet"><label class="v3-rw-fx" title="Effekt: toning uppåt, band och ljusa kanter"><input type="checkbox" data-rw="fx"${c.fx ? " checked" : ""}><span>✨ Effekt</span></label></div>` : ""}</div>`);
    }
    if (p && !p._rw) {
      p._rw = true;
      const h = e => { const t = e.target.closest("[data-rw]"); if (!t) return; const k = t.dataset.rw; if (k === "mode") l3rwSet("mode", t.value); else if (k === "h") l3rwSet("h", Number(String(t.value).replace(",", ".")) || 0); else if (k === "col") l3rwSet("col", t.value); else if (k === "op") l3rwSet("op", Number(t.value)); else if (k === "fx") l3rwSet("fx", !!t.checked); if (k === "mode") { const o = p.querySelector(".v3-rw"); if (o) o.remove(); l3wCtlPanel(); } l3wApply(); l3Render(); };
      p.addEventListener("change", h); p.addEventListener("input", e => { if (e.target.dataset && (e.target.dataset.rw === "op" || e.target.dataset.rw === "col")) h(e); });
    }
    return r;
  };
  l3wCtlPanel.__rw = true;
})();
