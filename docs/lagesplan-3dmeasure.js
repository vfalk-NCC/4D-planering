/* 3D-vyn – mått som ligger kvar och kan sparas (Victor 2026-10-10: "Måtten ska också ligga kvar och man
   ska ha möjlighet att spara dom"; "när man håller inne shift med mätverktyget ska den hoppa 5 grader åt
   gången så att man kan mäta i raka linjer").

   – Varje färdigt mått (avstånd, vinkel, yta) ligger kvar i vyn med sin etikett, även efter att man
     bytt verktyg. Listan Mått (i fästraden när Mät är valt, och under Lager) tar bort, döljer och sparar.
   – Spara i projektet: projects/<id>/plan_measures.json (egen fil, sammanslagen per mått-id), så att
     måtten finns kvar nästa gång och för andra i projektet. Osparade mått finns kvar tills sidan stängs.
   – Skift med mätverktyget: riktningen från förra punkten hoppar 5° åt gången (vågrätt), höjden följer
     fästpunkten. */

const l3m = { list: [], loaded: false, hidden: false, labels: new Map() };
const l3mPath = () => `projects/${encodeURIComponent(projectId)}/plan_measures.json`;

/* Skift: riktningen från base låst till var 5:e grad (anropas av l3Target). */
function l3mShiftSnap(base, s) {
  if (!s) return s;
  const dx = s.point.x - base.x, dy = s.point.y - base.y, h = Math.hypot(dx, dy);
  if (h < 1e-6) return s;
  const step = Math.PI / 36, a = Math.round(Math.atan2(dy, dx) / step) * step;
  const p = new THREE.Vector3(base.x + h * Math.cos(a), base.y + h * Math.sin(a), s.point.z);
  return { point: p, kind: "deg5", deg: ((Math.round(a * 180 / Math.PI) % 360) + 360) % 360 };
}

async function l3mLoad() {
  if (l3m.plan !== (plan && plan.id)) { l3m.plan = plan && plan.id; l3m.list = []; l3m.loaded = false; }
  if (l3m.loaded) { l3mDraw(); return; }
  l3m.loaded = true;
  try {
    const arr = await ghReadJSON(token, l3mPath());
    (Array.isArray(arr) ? arr : []).filter(x => x && x.plan === (plan && plan.id)).forEach(x => { if (!l3m.list.some(y => y.id === x.id)) l3m.list.push({ ...x, saved: true }); });
  } catch (e) { console.warn("Kunde inte läsa plan_measures.json", e); }
  l3mDraw();
}
/* Färdigt mått från mätverktyget: pts i scenens koordinater. */
function l3mAdd(kind, pts, text, objs) {
  const m = { id: ghNewId(), plan: plan && plan.id, kind, text, objs: (objs || []).map(o => o || null), pts: pts.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000)), at: new Date().toISOString(), by: (settings && settings.userName) || null, saved: false };
  l3m.list.push(m);
  l3m.hidden = false;
  l3mDraw();
  l3mRenderBar();
  return m;
}
function l3mDraw() {
  if (!l3) return;
  if (!l3.groups.measKeep) { const g = new THREE.Group(); g.name = "measKeep"; l3.groups.measKeep = g; l3.scene.add(g); }
  const grp = l3.groups.measKeep;
  l3Clear(grp);
  const host = l3.renderer.domElement.parentElement;
  l3m.labels.forEach(el => el.remove()); l3m.labels.clear();
  grp.visible = !l3m.hidden;
  l3m.list.forEach(m => {
    const P = m.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
    const col = m.saved ? 0x2563eb : 0xdc2626;
    const line = (a, b) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: col, depthTest: false })); l.renderOrder = 10; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
    for (let i = 1; i < P.length; i++) line(P[i - 1], P[i]);
    if (m.kind === "area" && P.length > 2) {
      line(P[P.length - 1], P[0]);
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P.map(p => new THREE.Vector2(p.x, p.y)))), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
      fill.position.z = P.reduce((s, p) => s + p.z, 0) / P.length + 0.02; fill.userData.noHit = true; fill.raycast = () => {}; grp.add(fill);
    }
    const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(P), new THREE.PointsMaterial({ color: col, size: 6, sizeAttenuation: false, depthTest: false }));
    pts.renderOrder = 11; pts.userData.noHit = true; pts.raycast = () => {}; grp.add(pts);
    const at = m.kind === "angle" ? P[1] : m.kind === "area" ? P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length) : P[0].clone().add(P[P.length - 1]).multiplyScalar(0.5);
    const el = document.createElement("div");
    el.className = "v3-meas v3-meas-keep" + (m.saved ? " saved" : "");
    el.textContent = m.text; el.dataset.mid = m.id;
    host.appendChild(el);
    l3m.labels.set(m.id, el); el._at = at;
  });
  l3mPlaceLabels();
  l3Render();
}
/* Etiketterna följer kameran (anropas när bilden ritas). */
function l3mPlaceLabels() {
  if (!l3 || !l3m.labels.size) return;
  l3m.labels.forEach(el => {
    if (l3m.hidden) { el.style.display = "none"; return; }
    const q = l3ToScreen(el._at);
    el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px";
  });
}
function l3mRemove(id) {
  const m = l3m.list.find(x => x.id === id); if (!m) return;
  l3m.list = l3m.list.filter(x => x.id !== id);
  if (m.saved) ghWriteJSON(token, l3mPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), "3D: mått borttaget").catch(e => l3Status("Kunde inte ta bort måttet ur projektet: " + e.message, true));
  if (typeof l3VPush === "function") l3VPush(() => { l3m.list.push(m); if (m.saved) l3mSave([m]); l3mDraw(); l3mRenderBar(); }, () => l3mRemove(id), "ta bort mått");
  l3mDraw(); l3mRenderBar();
}
async function l3mSave(only) {
  const list = (only || l3m.list.filter(x => !x.saved));
  if (!list.length) { l3Status("Alla mått är redan sparade."); return; }
  const recs = list.map(({ saved, ...x }) => x), ids = new Set(recs.map(x => x.id));
  try {
    await ghWriteJSON(token, l3mPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...recs], `3D: ${recs.length} mått sparade`);
    list.forEach(x => { x.saved = true; });
    l3Toast(`${recs.length} mått sparade i projektet – de finns kvar nästa gång.`);
  } catch (e) { l3Status("Kunde inte spara måtten: " + e.message, true); }
  l3mDraw(); l3mRenderBar();
}
function l3mClearUnsaved() {
  const gone = l3m.list.filter(x => !x.saved);
  if (!gone.length) return;
  l3m.list = l3m.list.filter(x => x.saved);
  if (typeof l3VPush === "function") l3VPush(() => { l3m.list.push(...gone); l3mDraw(); l3mRenderBar(); }, () => { const s = new Set(gone); l3m.list = l3m.list.filter(x => !s.has(x)); l3mDraw(); l3mRenderBar(); }, "rensa mått");
  l3mDraw(); l3mRenderBar();
}
function l3mToggle(on) { l3m.hidden = on === undefined ? !l3m.hidden : !on; l3mDraw(); l3mRenderBar(); }

/* Fästraden (när Mät är valt): en knapp som visar måtten under fliken Kommentarer (Victor 2026-10-10:
   "Måtten tycker jag att ni kan lägga in under kommentarer"). */
function l3mBarHtml() {
  const n = l3m.list.length, uns = l3m.list.filter(x => !x.saved).length;
  return `<span class="v3-snapbar-sep"></span><button type="button" id="v3MeasBtn" title="Måtten som ligger kvar – visas under fliken Kommentarer (ta bort, dölj, spara, detaljer)">Mått ${n}${uns ? ` <em>${uns} osparade</em>` : ""} ›</button>`;
}
function l3mRenderBar() { if (typeof l3RenderSnapBar === "function") l3RenderSnapBar(); if (typeof l3LayersRender === "function") l3LayersRender(); if (typeof l3kRenderTab === "function") l3kRenderTab(); }
function l3mShowInTab() {
  if (typeof l3PalTab === "function") l3PalTab("comments");
  const pal = document.getElementById("v3Pal"); if (pal && pal.classList.contains("hidden") && typeof l3PalToggle === "function") l3PalToggle(true);
  l3m.secOpen = true;
  if (typeof l3kRenderTab === "function") l3kRenderTab();
  const sec = document.getElementById("v3MeasSec"); if (sec) sec.scrollIntoView({ block: "nearest" });
}
function l3mBindBar(bar) {
  const b = bar.querySelector("#v3MeasBtn");
  if (b) b.onclick = e => { e.stopPropagation(); l3mShowInTab(); };
}

/* Vilket objekt en mätpunkt ligger på (från tryckets träff i 3D). */
function l3mObjAt(e) {
  try {
    const h = typeof l3Ray === "function" ? l3Ray(e, typeof l3Surfaces === "function" ? l3Surfaces() : [l3.scene])[0] : null;
    if (!h || typeof l3kTarget !== "function") return null;
    const t = l3kTarget(h);
    return { kind: t.kind, name: t.name || "", guid: t.guid || null, model: t.model || null };
  } catch (err) { return null; }
}

/* Allt som går att räkna ut ur måttet (Victor 2026-10-10: "lägg in mer information än bara måttet"). */
function l3mInfo(m) {
  // Nära noll visas som 0 (inte "−0"); sg ger tecken framför höjder och lutningar.
  const P = m.pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), f = (v, d = 3) => l3Fmt(Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v, d), rows = [];
  const sg = (v, d = 3) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? "0" : (v > 0 ? "+" : "") + f(v, d));
  const deg = r => r * 180 / Math.PI;
  let sub = "";
  if (m.kind === "dist" && P.length >= 2) {
    const [a, b] = P, d = a.distanceTo(b), hz = Math.hypot(b.x - a.x, b.y - a.y), dz = b.z - a.z;
    const slope = hz > 1e-6 ? dz / hz * 100 : null, ang = deg(Math.atan2(dz, hz));
    rows.push(["Avstånd (3D)", `${f(d)} m`], ["Vågrätt", `${f(hz)} m`], ["Höjdskillnad", `${sg(dz)} m`],
      ["Lutning", slope == null ? "lodrätt" : `${sg(slope, 1)} % (${sg(ang, 1)}°)`], ["ΔX / ΔY", `${f(b.x - a.x)} / ${f(b.y - a.y)} m`]);
    sub = `vågrätt ${f(hz, 2)} m · höjd ${sg(dz, 2)} m${slope != null && Math.abs(dz) > 0.005 ? ` · ${sg(slope, 1)} %` : ""}`;
  } else if (m.kind === "angle" && P.length >= 3) {
    const a3 = (p, v, q) => { const u = p.clone().sub(v), w = q.clone().sub(v), d = u.length() * w.length(); return d ? deg(Math.acos(Math.max(-1, Math.min(1, u.dot(w) / d)))) : 0; };
    const flat = P.map(p => new THREE.Vector3(p.x, p.y, 0));
    const v = a3(P[0], P[1], P[2]), vh = a3(flat[0], flat[1], flat[2]);
    rows.push(["Vinkel (3D)", `${f(v, 2)}°`], ["Vinkel i plan", `${f(vh, 2)}°`], ["Ben 1", `${f(P[0].distanceTo(P[1]))} m`], ["Ben 2", `${f(P[2].distanceTo(P[1]))} m`]);
    sub = `i plan ${f(vh, 1)}° · ben ${f(P[0].distanceTo(P[1]), 2)} / ${f(P[2].distanceTo(P[1]), 2)} m`;
  } else if (m.kind === "area" && P.length >= 3) {
    let a = 0, per = 0, per3 = 0;
    const n3 = new THREE.Vector3();
    for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; per += Math.hypot(q.x - p.x, q.y - p.y); per3 += p.distanceTo(q); n3.add(new THREE.Vector3().crossVectors(p.clone().sub(P[0]), q.clone().sub(P[0]))); }
    const plan = Math.abs(a) / 2, real = n3.length() / 2, zs = P.map(p => p.z);
    rows.push(["Yta i plan", `${f(plan, 2)} m²`], ["Verklig yta (lutande)", `${f(real, 2)} m²`], ["Omkrets i plan", `${f(per)} m`], ["Omkrets (3D)", `${f(per3)} m`], ["Hörn", String(P.length)],
      ["Höjd", `${f(Math.min(...zs))} – ${f(Math.max(...zs))} m (medel ${f(zs.reduce((s2, z) => s2 + z, 0) / zs.length)})`]);
    sub = `omkrets ${f(per, 2)} m · ${P.length} hörn${Math.abs(real - plan) > plan * 0.01 ? ` · lutande ${f(real, 2)} m²` : ""}`;
  }
  const names = (m.objs || []).map(o => (o && o.name) || "");
  const objTxt = names.some(Boolean) ? (m.kind === "dist" ? `${names[0] || "?"} → ${names[1] || "?"}` : [...new Set(names.filter(Boolean))].join(", ")) : "";
  if (objTxt) rows.push([m.kind === "dist" ? "Från → till" : "Objekt", objTxt]);
  P.forEach((p, i) => rows.push([`Punkt ${i + 1}`, `X ${f(p.x)}\nY ${f(p.y)}\nZ ${f(p.z)}`]));
  rows.push(["Mätt av", `${m.by || "–"} · ${m.at ? new Date(m.at).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`], ["Status", m.saved ? "Sparad i projektet" : "Inte sparad"]);
  return { sub, objTxt, rows };
}
const L3M_KIND = { dist: "Avstånd", angle: "Vinkel", area: "Yta" };
function l3mTabHtml() {
  const esc = escHtml, I = L3_ICO, n = l3m.list.length, uns = l3m.list.filter(x => !x.saved).length;
  l3m.exp = l3m.exp || new Set();
  const open = l3m.secOpen !== false;
  return `<section class="v3-msec" id="v3MeasSec"><button type="button" class="v3-msec-h" id="v3MeasHead" aria-expanded="${open}"><i>›</i>Mått <span>${n}${uns ? ` · ${uns} osparade` : ""}</span></button>
    ${open ? `${n ? `<div class="v3-kc-list">${l3m.list.map((m, i) => { const inf = l3mInfo(m), ex = l3m.exp.has(m.id); return `<div class="v3-mr ${ex ? "ex" : ""}">
      <div class="v3-kc"><i class="v3-mdot ${m.saved ? "saved" : ""}" title="${m.saved ? "Sparad i projektet" : "Inte sparad"}"></i>
        <button type="button" class="v3-kc-b" data-mzoom="${esc(m.id)}" title="Zooma till måttet"><b>${L3M_KIND[m.kind] || ""} ${esc(m.text).replace(/ (m²?|°)$/, "&nbsp;$1")}</b><em>${esc(inf.sub)}</em>${inf.objTxt ? `<em>${esc(inf.objTxt)}</em>` : ""}</button>
        <button type="button" class="v3-ic" data-mexp="${esc(m.id)}" title="${ex ? "Dölj detaljerna" : "Visa alla detaljer"}" aria-expanded="${ex}">${ex ? "▴" : "▾"}</button>
        <button type="button" class="v3-ic" data-mcopy="${esc(m.id)}" title="Kopiera måttet med alla detaljer">${I.copy || "⧉"}</button>
        <button type="button" class="v3-ic" data-mdel="${esc(m.id)}" title="Ta bort måttet">${I.trash}</button></div>
      ${ex ? `<dl class="v3-mdl">${inf.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}</div>`; }).join("")}</div>` : `<div class="v3-pal-hint">Inga mått än. Mät med Mät (M) – avstånd, vinkel eller yta – så hamnar de här.</div>`}
    ${n ? `<div class="v3-grp-acts"><button type="button" id="v3MeasSave" ${uns ? "" : "disabled"} title="Spara de osparade måtten i projektet (finns kvar nästa gång och för andra)">${I.upload} Spara i projektet${uns ? ` (${uns})` : ""}</button>
      <button type="button" id="v3MeasHide">${l3m.hidden ? I.eye + " Visa måtten" : I.eyeOff + " Dölj måtten"}</button>
      <button type="button" id="v3MeasCopyAll" title="Alla mått med detaljer som text (t.ex. till e-post eller Excel)">${I.copy || "⧉"} Kopiera alla</button>
      <button type="button" id="v3MeasClr" ${uns ? "" : "disabled"}>${I.trash} Rensa osparade</button></div>` : ""}` : ""}</section>`;
}
function l3mCopyText(list) {
  return list.map(m => { const inf = l3mInfo(m); return `${L3M_KIND[m.kind] || ""} ${m.text}\n${inf.rows.map(([k, v]) => `  ${k}: ${String(v).replace(/\n/g, ", ")}`).join("\n")}`; }).join("\n\n");
}
function l3mBindTab(host) {
  const on = (sel, fn) => { const x = host.querySelector(sel); if (x) x.onclick = e => { e.stopPropagation(); fn(x); }; };
  on("#v3MeasHead", () => { l3m.secOpen = !(l3m.secOpen !== false); l3kRenderTab(); });
  host.querySelectorAll("[data-mdel]").forEach(x => { x.onclick = e => { e.stopPropagation(); l3mRemove(x.dataset.mdel); }; });
  host.querySelectorAll("[data-mexp]").forEach(x => { x.onclick = e => { e.stopPropagation(); const id = x.dataset.mexp; l3m.exp.has(id) ? l3m.exp.delete(id) : l3m.exp.add(id); l3kRenderTab(); }; });
  const copy = t => { try { navigator.clipboard.writeText(t).then(() => l3Toast("Kopierat."), () => l3Status("Kunde inte kopiera.", true)); } catch (err) { l3Status("Kunde inte kopiera.", true); } };
  host.querySelectorAll("[data-mcopy]").forEach(x => { x.onclick = e => { e.stopPropagation(); const m = l3m.list.find(y => y.id === x.dataset.mcopy); if (m) copy(l3mCopyText([m])); }; });
  host.querySelectorAll("[data-mzoom]").forEach(x => { x.onclick = e => { e.stopPropagation(); const m = l3m.list.find(y => y.id === x.dataset.mzoom); if (!m) return; if (l3m.hidden) l3mToggle(true); const b3 = new THREE.Box3(); m.pts.forEach(p => b3.expandByPoint(new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]))); l3FlyTo(b3.getCenter(new THREE.Vector3()), Math.max(6, b3.getSize(new THREE.Vector3()).length() * 1.6)); }; });
  on("#v3MeasSave", () => l3mSave());
  on("#v3MeasHide", () => l3mToggle());
  on("#v3MeasCopyAll", () => copy(l3mCopyText(l3m.list)));
  on("#v3MeasClr", () => l3mClearUnsaved());
}
