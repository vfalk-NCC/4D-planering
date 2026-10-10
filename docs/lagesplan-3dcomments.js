/* 3D-vyn – kommentarer på objekt (Victor 2026-10-10: "lägga en kommentar med en popup när jag högerklickar
   på ett objekt … Där jag skriver text i en snygg popup-ruta med dagens datum").

   – Högerklick → Kommentar här… : en popup vid punkten med dagens datum och ditt namn; texten sparas.
   – Kommentaren sitter som en pratbubbla med nummer på punkten (följer med när man vrider), och vet vilket
     objekt den gäller (etableringsobjekt, planerat objekt eller IFC-objekt med GUID).
   – Tryck på bubblan: läs, svara, markera som klar (grå) eller ta bort.
   – Sparas i projects/<id>/plan_comments3d.json (egen fil, sammanslagen per kommentar), per arbetsyta. */

const l3k = { list: [], loaded: false, plan: null, hidden: false, showDone: true, els: new Map(), open: null, draft: null };
const l3kPath = () => `projects/${encodeURIComponent(projectId)}/plan_comments3d.json`;
const l3kDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); };
/* Färger (Victor 2026-10-10: "byta färger på kommentarerna"). Klara är alltid grå. */
const L3K_COLORS = ["#f97316", "#e11d48", "#db2777", "#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#475569"];
const l3kCol = c => (c.done ? "#94a3b8" : c.color || L3K_COLORS[0]);
const l3kLight = hex => { const n = parseInt(String(hex).slice(1), 16), m = v => Math.round(v + (255 - v) * 0.28); return `rgb(${m(n >> 16 & 255)},${m(n >> 8 & 255)},${m(n & 255)})`; };
const l3kMe = () => (typeof settings !== "undefined" && settings.userName) || "Okänd";

async function l3kLoad() {
  if (l3k.plan !== (plan && plan.id)) { l3k.plan = plan && plan.id; l3k.list = []; l3k.loaded = false; }
  if (!l3k.loaded) {
    l3k.loaded = true;
    try { const a = await ghReadJSON(token, l3kPath()); l3k.list = (Array.isArray(a) ? a : []).filter(x => x && x.plan === (plan && plan.id)); }
    catch (e) { console.warn("Kunde inte läsa plan_comments3d.json", e); }
  }
  l3kDraw();
}
async function l3kWrite(c, remove) {
  try {
    await ghWriteJSON(token, l3kPath(), arr => { const a = (Array.isArray(arr) ? arr : []).filter(x => x.id !== c.id); return remove ? a : [...a, c]; }, remove ? "3D: kommentar borttagen" : `3D: kommentar – ${String(c.text).slice(0, 40)}`);
    if (typeof l3SaveState === "function") l3SaveState("ok", "Kommentaren sparad");
  } catch (e) { l3Status("Kunde inte spara kommentaren: " + e.message, true); }
}

/* Vad kommentaren gäller (från en träff i 3D). */
function l3kTarget(hit) {
  if (!hit) return { kind: "point", name: "Punkt" };
  const pid = typeof l3PlaceIdOf === "function" ? l3PlaceIdOf(hit.object) : null;
  if (pid) { const p = placements.find(x => x.id === pid); return { kind: "place", id: pid, name: (p && (p.name || (placeLib(p.type) || {}).label)) || "Etableringsobjekt" }; }
  if (hit.object.userData && hit.object.userData.l3b && typeof l3bsFromHit === "function") {
    const e = l3bsFromHit(hit);
    if (e) { const u = e.mesh.userData.l3b, r = u.ranges[e.ri]; return { kind: "ifc", guid: r.guid || null, model: u.model && u.model.name, name: r.name || "IFC-objekt" }; }
  }
  if (hit.object === l3.objMesh) {
    const ids = hit.object.userData.ids, id = ids && ids[hit.face ? hit.face.a : hit.index], it = id && (items || []).find(x => x.id === id);
    if (it) return { kind: "item", id, name: it.object_name || it.name || it.activity || "Planerat objekt" };
  }
  return { kind: "point", name: hit.object === l3.planMesh ? "Marken" : "Punkt" };
}
/* Högerklick → Kommentar här… */
function l3kNew(point, hit) {
  if (!point) { l3Status("Högerklicka på ett objekt eller marken för att kommentera där.", true); return; }
  l3kClose();
  const now = new Date().toISOString();
  l3k.draft = { id: ghNewId(), plan: plan && plan.id, pos: [point.x + l3.O[0], point.y + l3.O[1], point.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000), target: l3kTarget(hit), text: "", by: l3kMe(), at: now, replies: [], done: false, folder: (typeof l3a !== "undefined" && l3a.cur) || null };
  l3k.hidden = false;
  l3kOpen(l3k.draft, true);
}

/* ---- Bubblorna ---------------------------------------------------------------------------------- */
function l3kDraw() {
  if (!l3) return;
  const host = l3.renderer.domElement.parentElement;
  l3k.els.forEach(el => el.remove()); l3k.els.clear();
  const list = l3k.list.filter(c => (l3k.showDone || !c.done) && (typeof l3aOn !== "function" || l3aOn(c)));
  list.forEach((c, i) => {
    const el = document.createElement("button");
    el.type = "button"; el.className = "v3-cpin" + (c.done ? " done" : "") + (l3k.open && l3k.open.id === c.id ? " on" : "");
    el.innerHTML = `<span>${l3k.list.indexOf(c) + 1}</span>`;
    el.style.background = `linear-gradient(135deg, ${l3kLight(l3kCol(c))}, ${l3kCol(c)})`;
    el.title = `${c.target && c.target.name ? c.target.name + ": " : ""}${c.text}`.slice(0, 200);
    el.onclick = e => { e.stopPropagation(); l3kOpen(c); };
    el.onpointerdown = e => e.stopPropagation();
    host.appendChild(el); l3k.els.set(c.id, el);
  });
  l3kPlace();
  l3kSignsBuild();
  if (typeof l3LayersRender === "function") l3LayersRender();
  if (typeof l3kRenderTab === "function") l3kRenderTab();
  l3Render();
}
/* ---- Skyltar i 3D (Victor 2026-10-10: "om popupen går att få till som ett 3d-objekt") ---------------
   Varje kommentar som ett kort på en tunn stolpe ovanför punkten: skalar med avståndet och skyms av
   byggnaden som ett riktigt föremål. Tryck på skylten öppnar kommentaren. */
const l3kSigns = () => l3Prefs().cSigns !== false;
function l3kCard(c, nr) {
  const W = 640, pad = 28, F = 30, cv = document.createElement("canvas"), x = cv.getContext("2d");
  x.font = `${F}px "Segoe UI", Arial, sans-serif`;
  // Radbryt texten (högst 5 rader).
  const words = String(c.text || "").split(/\s+/), lines = [];
  let ln = "";
  words.forEach(w => { const t = ln ? ln + " " + w : w; if (x.measureText(t).width > W - pad * 2 && ln) { lines.push(ln); ln = w; } else ln = t; });
  if (ln) lines.push(ln);
  if (lines.length > 5) { lines.length = 5; lines[4] = lines[4].replace(/\s*\S*$/, "") + " …"; }
  const head = 64, H = head + pad / 2 + lines.length * F * 1.3 + ((c.replies || []).length ? F * 1.4 : 0) + pad;
  cv.width = W; cv.height = Math.ceil(H);
  const r = 26;
  x.fillStyle = "rgba(15,23,42,.18)"; x.beginPath(); x.roundRect(4, 8, W - 8, H - 10, r); x.fill();
  x.fillStyle = "#fff"; x.beginPath(); x.roundRect(0, 0, W - 8, H - 10, r); x.fill();
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, l3kLight(l3kCol(c))); g.addColorStop(1, l3kCol(c));
  x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, W - 8, head, [r, r, 0, 0]); x.fill();
  x.fillStyle = "#fff"; x.beginPath(); x.arc(40, head / 2, 20, 0, Math.PI * 2); x.fill();
  x.fillStyle = l3kCol(c); x.font = `700 ${F * 0.8}px "Segoe UI", Arial, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(nr), 40, head / 2 + 1);
  x.textAlign = "left"; x.fillStyle = "#fff"; x.font = `600 ${F * 0.8}px "Segoe UI", Arial, sans-serif`;
  x.fillText(`${c.by || ""} · ${new Date(c.at).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}${c.done ? " · klar" : ""}`.slice(0, 44), 72, head / 2 + 1);
  x.fillStyle = c.done ? "#64748b" : "#0f172a"; x.font = `${F}px "Segoe UI", Arial, sans-serif`; x.textBaseline = "alphabetic";
  lines.forEach((l, i) => x.fillText(l, pad, head + pad / 2 + F + i * F * 1.3));
  if ((c.replies || []).length) { x.fillStyle = "#94a3b8"; x.font = `${F * 0.8}px "Segoe UI", Arial, sans-serif`; x.fillText(`${c.replies.length} svar`, pad, head + pad / 2 + F + lines.length * F * 1.3 + F * 0.4); }
  return cv;
}
function l3kSignsBuild() {
  if (!l3) return;
  if (!l3.groups.csigns) { const g = new THREE.Group(); g.name = "csigns"; l3.groups.csigns = g; l3.scene.add(g); }
  const grp = l3.groups.csigns;
  l3Clear(grp);
  grp.visible = !l3k.hidden && l3kSigns();
  if (!grp.visible) return;
  l3k.list.forEach((c, i) => {
    if (!l3k.showDone && c.done) return;
    if (!(typeof l3aOn !== "function" || l3aOn(c))) return; // släckt mapp
    const base = new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]), lift = l3kLift(c);
    const cv = l3kCard(c, i + 1), tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const w = 3.2; sp.scale.set(w, w * cv.height / cv.width, 1);
    sp.center.set(0.08, 0); sp.position.copy(base).add(new THREE.Vector3(0, 0, lift));
    sp.userData.commentId = c.id; sp.renderOrder = 5;
    const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, base.clone().add(new THREE.Vector3(0, 0, lift))]), new THREE.LineBasicMaterial({ color: new THREE.Color(l3kCol(c)) }));
    pole.userData.noHit = true; pole.raycast = () => {}; pole.userData.commentId = c.id; pole.userData.kPart = "pole";
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(l3kCol(c)) }));
    dot.position.copy(base); dot.userData.noHit = true; dot.raycast = () => {}; dot.userData.commentId = c.id; dot.userData.kPart = "dot";
    grp.add(pole, dot, sp);
  });
}
/* Tryck på en skylt: öppna kommentaren (anropas först i 3D-vyns tryck). */
function l3kTap(e) {
  if (!l3 || !l3.groups.csigns || !l3.groups.csigns.visible || !l3.groups.csigns.children.length) return false;
  const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  const hit = rc.intersectObjects(l3.groups.csigns.children.filter(o => o.isSprite), false)[0];
  if (!hit) return false;
  // Byggnaden framför skylten vinner.
  const front = typeof l3Ray === "function" ? l3Ray(e, l3Surfaces())[0] : null;
  if (front && front.distance < hit.distance - 0.05) return false;
  const c = l3k.list.find(x => x.id === hit.object.userData.commentId);
  if (!c) return false;
  l3kOpen(c);
  return true;
}
function l3kPlace() {
  if (!l3) return;
  const at = c => new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]);
  l3kHandlesPlace();
  l3k.els.forEach((el, id) => {
    const c = l3k.list.find(x => x.id === id);
    if (!c || l3k.hidden || l3kSigns()) { el.style.display = "none"; return; } // skyltarna i 3D har numret
    const q = l3ToScreen(at(c));
    el.style.display = q.behind ? "none" : "flex"; el.style.left = q.x + "px"; el.style.top = q.y + "px";
  });
  const pop = document.getElementById("v3CPop"), c = l3k.open;
  if (pop && c && !pop.classList.contains("hidden")) {
    const q = l3ToScreen(at(c)), host = l3.renderer.domElement.getBoundingClientRect();
    const w = pop.offsetWidth || 300, h = pop.offsetHeight || 200;
    pop.style.left = Math.max(8, Math.min(host.width - w - 8, q.x + 18)) + "px";
    pop.style.top = Math.max(8, Math.min(host.height - h - 8, q.y - 24)) + "px";
    pop.classList.toggle("far", !!q.behind);
  }
}

/* ---- Popupen ------------------------------------------------------------------------------------- */
function l3kOpen(c, edit) {
  l3k.open = c;
  let pop = document.getElementById("v3CPop");
  if (!pop) { pop = document.createElement("div"); pop.id = "v3CPop"; pop.className = "v3-cpop"; l3.renderer.domElement.parentElement.appendChild(pop); pop.onpointerdown = e => e.stopPropagation(); pop.onclick = e => e.stopPropagation(); pop.onkeydown = e => e.stopPropagation(); }
  const esc = escHtml, isNew = c === l3k.draft, t = c.target || {};
  const kindLbl = { place: "Etablering", ifc: "IFC-objekt", item: "Planerat objekt", point: "" }[t.kind] || "";
  pop.innerHTML = `<div class="v3-cpop-h"><i style="background:linear-gradient(135deg, ${l3kLight(l3kCol(c))}, ${l3kCol(c)})"></i><div><b title="${esc(t.name || "")}">${esc(t.name || "Kommentar")}</b><em>${esc([kindLbl, t.model].filter(Boolean).join(" · "))}</em></div><button type="button" class="v3-x" data-k="close" title="Stäng (Esc)">✕</button></div>
    <div class="v3-cpop-cols" title="Kommentarens färg">${L3K_COLORS.map(col => `<button type="button" data-kcol="${col}" class="${(c.color || L3K_COLORS[0]) === col ? "on" : ""}" style="background:${col}" title="${col}"></button>`).join("")}<label class="v3-cpop-own" title="Egen färg"><input type="color" data-kcolin value="${esc(c.color || L3K_COLORS[0])}" />＋</label></div>
    ${isNew || edit ? `<div class="v3-cpop-meta">${esc(l3kMe())} · ${esc(l3kDate(c.at))}</div>
      <textarea id="v3CText" rows="4" placeholder="Skriv en kommentar…">${esc(c.text || "")}</textarea>
      <div class="v3-cpop-f"><button type="button" data-k="cancel">Avbryt</button><button type="button" class="pri" data-k="save">Spara</button></div>`
    : `<div class="v3-cpop-body">
        <div class="v3-cmsg ${c.done ? "done" : ""}"><div class="v3-cpop-meta">${esc(c.by || "")} · ${esc(l3kDate(c.at))}${c.done ? " · <b>klar</b>" : ""}</div><p>${esc(c.text).replace(/\n/g, "<br>")}</p></div>
        ${(c.replies || []).map(r => `<div class="v3-cmsg reply"><div class="v3-cpop-meta">${esc(r.by || "")} · ${esc(l3kDate(r.at))}</div><p>${esc(r.text).replace(/\n/g, "<br>")}</p></div>`).join("")}
      </div>
      <textarea id="v3CReply" rows="2" placeholder="Svara…"></textarea>
      <div class="v3-cpop-f"><button type="button" class="bad" data-k="del" title="Ta bort kommentaren">${L3_ICO.trash}</button><button type="button" data-k="edit" title="Ändra texten">${L3_ICO.edit}</button><button type="button" data-k="done">${c.done ? "Öppna igen" : "Klar ✓"}</button><button type="button" class="pri" data-k="reply">Svara</button></div>`}`;
  pop.classList.remove("hidden");
  const on = (k, fn) => { const b = pop.querySelector(`[data-k="${k}"]`); if (b) b.onclick = fn; };
  on("close", l3kClose); on("cancel", l3kClose);
  const setCol = async col => { if (!col || c.color === col) return; c.color = col; const ta0 = pop.querySelector("#v3CText"), keep = ta0 ? ta0.value : null; l3kOpen(c, edit); if (keep != null) { const t2 = pop.querySelector("#v3CText"); if (t2) t2.value = keep; } if (!isNew) { l3kDraw(); await l3kWrite(c); } };
  pop.querySelectorAll("[data-kcol]").forEach(b => { b.onclick = () => setCol(b.dataset.kcol); });
  const ci = pop.querySelector("[data-kcolin]"); if (ci) ci.onchange = () => setCol(ci.value);
  on("save", async () => {
    const v = pop.querySelector("#v3CText").value.trim();
    if (!v) { pop.querySelector("#v3CText").focus(); return; }
    c.text = v;
    if (isNew) { l3k.list.push(c); l3k.draft = null; }
    else c.edited = new Date().toISOString();
    l3kOpen(c); l3kDraw();
    await l3kWrite(c);
    l3Status(`Kommentar sparad${c.target && c.target.name ? ` på ${c.target.name}` : ""}.`);
  });
  on("reply", async () => {
    const ta = pop.querySelector("#v3CReply"), v = ta.value.trim();
    if (!v) { ta.focus(); return; }
    c.replies = [...(c.replies || []), { by: l3kMe(), at: new Date().toISOString(), text: v }];
    l3kOpen(c); await l3kWrite(c);
  });
  on("done", async () => { c.done = !c.done; l3kOpen(c); l3kDraw(); await l3kWrite(c); });
  on("edit", () => l3kOpen(c, true));
  on("del", async () => {
    if (!(await uiConfirm("Ta bort kommentaren och dess svar?"))) return;
    l3k.list = l3k.list.filter(x => x.id !== c.id); l3kClose(); l3kDraw();
    await l3kWrite(c, true);
  });
  const ta = pop.querySelector("#v3CText");
  if (ta) { ta.focus(); ta.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) pop.querySelector('[data-k="save"]').click(); if (e.key === "Escape") l3kClose(); }; }
  const rp = pop.querySelector("#v3CReply");
  if (rp) rp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) pop.querySelector('[data-k="reply"]').click(); if (e.key === "Escape") l3kClose(); };
  l3kDraw();
}
function l3kClose() {
  const pop = document.getElementById("v3CPop");
  if (pop) pop.classList.add("hidden");
  l3k.open = null; l3k.draft = null;
  l3kDraw();
}
/* ---- Handtag (Victor 2026-10-10: "ett handtag på insättningspunkten för kommentaren så att jag kan flytta
   den i sidled och längsled och samma för kommentarbubblan också i höjdled") ---------------------------
   För kommentaren som är öppen eller ensam markerad i listan: ett handtag på punkten och ett där stolpen
   möter skylten (skyltens höjd över punkten, Skift: jämna 10 cm). Sparas när man släpper; Ctrl+Z ångrar.
   Punkten glider på ytan av det objekt kommentaren skapades på och lämnar det aldrig (Victor 2026-10-10:
   "punkten ska alltid ha koppling mot 3d-objekten den är skapad på") – utanför objektet står den kvar. */
const L3K_LIFT = 2.2;
const l3kLift = c => (Number.isFinite(c.lift) ? c.lift : L3K_LIFT);
const l3kH = { xy: null, z: null, drag: null };
function l3kActive() {
  if (l3k.hidden) return null;
  const a = l3kActive0();
  return a && (typeof l3aOn !== "function" || l3aOn(a)) ? a : null;
}
function l3kActive0() {
  if (l3k.open && l3k.open !== l3k.draft && l3k.list.includes(l3k.open)) return l3k.open;
  if (typeof l3kUi !== "undefined" && l3kUi.sel.size === 1) return l3k.list.find(c => l3kUi.sel.has(c.id)) || null;
  return null;
}
function l3kHandlesPlace() {
  const c = l3kActive(), visible = c && (l3k.showDone || !c.done);
  if (!visible) { if (l3kH.xy) l3kH.xy.style.display = "none"; if (l3kH.z) l3kH.z.style.display = "none"; return; }
  if (!l3kH.xy) {
    const host = l3.renderer.domElement.parentElement, mk = (cls, title, html, kind) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "v3-khandle " + cls; b.title = title; b.innerHTML = html;
      b.onpointerdown = e => l3kHDown(e, kind); b.onclick = e => e.stopPropagation();
      host.appendChild(b); return b;
    };
    l3kH.xy = mk("xy", "Dra för att flytta kommentarens punkt – den glider på ytan av objektet den sitter på", `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/></svg>`, "xy");
    l3kH.z = mk("z", "Dra för att flytta skylten i höjdled (Skift: jämna 10 cm)", `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/></svg>`, "z");
  }
  const base = new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]);
  const col = l3kCol(c), put = (el, p, show) => { const q = l3ToScreen(p); el.style.display = show && !q.behind ? "grid" : "none"; el.style.left = q.x + "px"; el.style.top = q.y + "px"; el.style.borderColor = col; el.style.color = col; el.classList.toggle("drag", !!(l3kH.drag && l3kH.drag.kind === el.classList[1])); };
  put(l3kH.xy, base, true);
  // Rakt uppifrån går höjden inte att dra (och handtaget skulle ligga på punktens) – vrid vyn för höjden.
  const look = l3.camera.getWorldDirection(new THREE.Vector3());
  put(l3kH.z, base.clone().add(new THREE.Vector3(0, 0, l3kLift(c))), l3kSigns() && Math.abs(look.z) < 0.97);
}
/* Flyttar skylt, stolpe och punkt för en kommentar utan att bygga om skyltarna (medan man drar). */
function l3kSignMove(c) {
  const g = l3.groups.csigns; if (!g) return;
  const base = new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]), top = base.clone().add(new THREE.Vector3(0, 0, l3kLift(c)));
  g.children.forEach(o => {
    if (o.userData.commentId !== c.id) return;
    if (o.isSprite) o.position.copy(top);
    else if (o.userData.kPart === "dot") o.position.copy(base);
    else if (o.userData.kPart === "pole") { o.geometry.dispose(); o.geometry = new THREE.BufferGeometry().setFromPoints([base, top]); }
  });
}
/* Samma objekt som kommentaren gäller? (Kommentarer på marken eller en punkt får ligga på vilken yta som helst.) */
function l3kSameTarget(t, h) {
  if (!t || t.kind === "point") return true;
  const u = l3kTarget(h);
  if (u.kind !== t.kind) return false;
  if (t.kind === "ifc") return t.guid ? u.guid === t.guid : u.name === t.name && u.model === t.model;
  return u.id === t.id;
}
/* Punkten under markören på kommentarens objekt, eller null. */
function l3kSurfaceAt(ev, c) {
  const hits = typeof l3Ray === "function" ? l3Ray(ev, typeof l3Surfaces === "function" ? l3Surfaces() : [l3.scene]) : [];
  const h = hits.find(x => l3kSameTarget(c.target, x));
  return h ? h.point.clone() : null;
}
function l3kHDown(e, kind) {
  const c = l3kActive(); if (!c) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget; el.setPointerCapture(e.pointerId);
  const base = new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]);
  const d = l3kH.drag = { kind, c, pos0: c.pos.slice(), lift0: l3kLift(c), x0: e.clientX, y0: e.clientY, moved: false };
  if (kind === "z") {
    const top = base.clone().add(new THREE.Vector3(0, 0, d.lift0)), p0 = l3ToScreen(top), p1 = l3ToScreen(top.clone().add(new THREE.Vector3(0, 0, 1)));
    d.v = [p1.x - p0.x, p1.y - p0.y]; d.vv = d.v[0] * d.v[0] + d.v[1] * d.v[1] || 1;
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  const mv = ev => {
    if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 2) d.moved = true;
    if (!d.moved) return;
    if (kind === "xy") {
      const h = l3kSurfaceAt(ev, c);
      el.classList.toggle("off", !h);
      if (!h) return; // utanför objektet: punkten står kvar på objektet
      c.pos = [r3(h.x + l3.O[0]), r3(h.y + l3.O[1]), r3(h.z + l3.O[2])];
    } else {
      let lift = d.lift0 + ((ev.clientX - d.x0) * d.v[0] + (ev.clientY - d.y0) * d.v[1]) / d.vv;
      if (ev.shiftKey) lift = Math.round(lift * 10) / 10;
      c.lift = r3(Math.max(0.3, Math.min(200, lift)));
    }
    l3kSignMove(c); l3Render();
  };
  const up = () => {
    el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    l3kH.drag = null; el.classList.remove("off");
    if (!d.moved) { l3Render(); return; }
    if (c.pos.join() === d.pos0.join() && l3kLift(c) === d.lift0) { l3Status("Punkten står kvar – den kan bara flyttas på objektet den sitter på."); l3Render(); return; }
    const now = { pos: c.pos.slice(), lift: c.lift }, was = { pos: d.pos0, lift: d.lift0 };
    const apply = s => { c.pos = s.pos.slice(); if (kind === "z" || Number.isFinite(c.lift)) c.lift = s.lift; l3kDraw(); l3kWrite(c); };
    if (typeof l3VPush === "function") l3VPush(() => apply(was), () => apply(now), kind === "xy" ? "flytta kommentaren" : "kommentarens höjd");
    l3kDraw(); l3kWrite(c);
    l3Status(kind === "xy" ? "Kommentarens punkt är flyttad (Ctrl+Z ångrar)." : `Skylten står ${String(l3kLift(c).toFixed(2)).replace(".", ",")} m över punkten (Ctrl+Z ångrar).`);
  };
  el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
function l3kToggle() { l3k.hidden = !l3k.hidden; if (l3k.hidden) l3kClose(); l3kDraw(); }

/* ---- Fliken Kommentarer (Victor 2026-10-10: "en egen meny bredvid grupper") ---------------------- */
const l3kUi = { q: "", sel: new Set(), anchor: null };
function l3kRenderTab() {
  const host = document.getElementById("v3PalComments");
  if (!host || host.classList.contains("hidden")) return;
  if (!l3k.loaded) { host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Hämtar kommentarerna…</div>`; l3kLoad().then(() => l3kRenderTab()); return; }
  const esc = escHtml, I = L3_ICO, t = l3kUi.q.trim().toLowerCase();
  const all = l3k.list.map((c, i) => ({ c, nr: i + 1 }));
  const list = all.filter(({ c }) => (l3k.showDone || !c.done) && (!t || [c.text, c.by, c.target && c.target.name, ...(c.replies || []).map(r => r.text)].join(" ").toLowerCase().includes(t)));
  const open = l3k.list.filter(c => !c.done).length, done = l3k.list.length - open;
  // Markeringen: bara kommentarer som finns kvar (Victor 2026-10-10: "ctrl klick för att välja flera och shift klicka för att välja flera på rad").
  l3kUi.sel.forEach(id => { if (!l3k.list.some(c => c.id === id)) l3kUi.sel.delete(id); });
  const nSel = l3kUi.sel.size;
  host.innerHTML = `<div class="v3-kc-top"><input type="search" class="v3-pp-q" id="v3KQ" placeholder="Sök i kommentarerna…" value="${esc(l3kUi.q)}" /></div>
    <div class="v3-kc-opts">
      <label class="v3-chk"><input type="checkbox" id="v3KShow" ${l3k.hidden ? "" : "checked"} /> Visa i 3D</label>
      <label class="v3-chk"><input type="checkbox" id="v3KSigns" ${l3kSigns() ? "checked" : ""} /> Som skyltar</label>
      <label class="v3-chk"><input type="checkbox" id="v3KDone" ${l3k.showDone ? "checked" : ""} /> Klara (${done})</label>
    </div>
    ${typeof l3aHtml === "function" ? l3aHtml() : ""}
    <div class="v3-kc-list">${list.length ? list.map(({ c, nr }) => `<div class="v3-kc ${typeof l3aOn !== "function" || l3aOn(c) ? "" : "off"} ${c.done ? "done" : ""} ${l3k.open && l3k.open.id === c.id ? "on" : ""} ${l3kUi.sel.has(c.id) ? "sel" : ""}">
        <label class="v3-kc-col" title="Byt färg"><input type="color" data-kccol="${esc(c.id)}" value="${esc(c.color || L3K_COLORS[0])}" /><i style="background:${l3kCol(c)}">${nr}</i></label>
        <button type="button" class="v3-kc-b" data-kcgo="${esc(c.id)}" title="Klick: zooma till kommentaren · Ctrl+klick: välj flera · Skift+klick: välj flera i rad"><b>${esc(String(c.text).slice(0, 160))}</b><em>${c.folder && typeof l3aFolderName === "function" && l3aFolderName(c.folder) ? `<span class="v3-fchip">${esc(l3aFolderName(c.folder))}</span>` : ""}${esc([c.target && c.target.name, c.by, new Date(c.at).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }), (c.replies || []).length ? `${c.replies.length} svar` : ""].filter(Boolean).join(" · "))}</em></button>
        <button type="button" class="v3-ic" data-kcdone="${esc(c.id)}" title="${c.done ? "Öppna igen" : "Markera som klar"}">${c.done ? "↺" : "✓"}</button>
        <button type="button" class="v3-ic" data-kcdel="${esc(c.id)}" title="Ta bort">${I.trash}</button>
      </div>`).join("") : `<div class="v3-pal-hint">${l3k.list.length ? "Ingen kommentar matchar." : "Inga kommentarer än. Högerklicka på ett objekt i 3D → Kommentar här…"}</div>`}</div>
    ${l3k.list.length ? `<div class="v3-grp-acts"><button type="button" id="v3KIfcSel" ${nSel ? "" : "disabled"} title="De markerade kommentarerna (Ctrl+klick / Skift+klick i listan) som 3D-skyltar i en ny IFC-fil i Trimble Connect">${I.upload} Exportera markerade${nSel ? ` (${nSel})` : ""}</button>${nSel ? `<button type="button" id="v3KSelClr" title="Avmarkera alla">Avmarkera</button>` : ""}<button type="button" id="v3KIfc" title="Alla kommentarer som syns i listan som riktiga 3D-skyltar (skylt, stolpe, 3D-text och egenskaper) i en ny IFC-fil i Trimble Connect – vända mot vyn du har nu">${I.upload} Exportera alla som 3D-skyltar</button></div>` : ""}
    <div class="v3-pal-hint">${open} öppna${done ? ` · ${done} klara` : ""}. Högerklick i 3D → Kommentar här… skapar en ny.</div>
    ${typeof l3mTabHtml === "function" ? l3mTabHtml() : ""}`;
  if (typeof l3mBindTab === "function") l3mBindTab(host);
  if (typeof l3aBind === "function") l3aBind(host);
  const q = host.querySelector("#v3KQ");
  q.oninput = () => { l3kUi.q = q.value; const pos = q.selectionStart; l3kRenderTab(); const n = document.getElementById("v3KQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  host.querySelector("#v3KShow").onchange = e => { l3k.hidden = !e.target.checked; if (l3k.hidden) l3kClose(); l3kDraw(); };
  host.querySelector("#v3KSigns").onchange = e => { l3SetPref("cSigns", e.target.checked); l3kDraw(); };
  host.querySelector("#v3KDone").onchange = e => { l3k.showDone = e.target.checked; l3kDraw(); };
  const find = id => l3k.list.find(x => x.id === id);
  const exBtn = (id, ids) => { const ex = host.querySelector(id); if (ex) ex.onclick = async () => { ex.disabled = true; try { await l3kExportIfc(ids && ids()); } catch (e) { /* statusraden */ } if (ex.isConnected) ex.disabled = !!ids && !l3kUi.sel.size; }; };
  exBtn("#v3KIfc", null);
  exBtn("#v3KIfcSel", () => [...l3kUi.sel]);
  const clr = host.querySelector("#v3KSelClr"); if (clr) clr.onclick = () => { l3kUi.sel.clear(); l3kUi.anchor = null; l3kRenderTab(); };
  // Klick zoomar bara till kommentaren (öppnar inte redigeringen); Ctrl+klick väljer flera, Skift+klick ett intervall.
  const ids = list.map(({ c }) => c.id);
  host.querySelectorAll("[data-kcgo]").forEach(b => { b.onclick = e => {
    const c = find(b.dataset.kcgo); if (!c) return;
    if (e.shiftKey && l3kUi.anchor && ids.includes(l3kUi.anchor)) {
      const a = ids.indexOf(l3kUi.anchor), z = ids.indexOf(c.id);
      if (!(e.ctrlKey || e.metaKey)) l3kUi.sel.clear();
      ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(id => l3kUi.sel.add(id));
      l3kRenderTab(); l3Render(); return;
    }
    if (e.ctrlKey || e.metaKey) { if (l3kUi.sel.has(c.id)) l3kUi.sel.delete(c.id); else l3kUi.sel.add(c.id); l3kUi.anchor = c.id; l3kRenderTab(); l3Render(); return; }
    l3kUi.sel.clear(); l3kUi.sel.add(c.id); l3kUi.anchor = c.id;
    l3k.hidden = false; l3kDraw();
    l3FlyTo(new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]), 18);
    l3kRenderTab();
  }; });
  host.querySelectorAll("[data-kccol]").forEach(inp => { inp.onchange = async () => { const c = find(inp.dataset.kccol); if (!c) return; c.color = inp.value; l3kDraw(); if (l3k.open === c) l3kOpen(c); await l3kWrite(c); }; });
  host.querySelectorAll("[data-kcdone]").forEach(b => { b.onclick = async () => { const c = find(b.dataset.kcdone); if (!c) return; c.done = !c.done; l3kDraw(); if (l3k.open === c) l3kOpen(c); await l3kWrite(c); }; });
  host.querySelectorAll("[data-kcdel]").forEach(b => { b.onclick = async () => { const c = find(b.dataset.kcdel); if (!c || !(await uiConfirm("Ta bort kommentaren och dess svar?"))) return; l3k.list = l3k.list.filter(x => x !== c); if (l3k.open === c) l3kClose(); l3kDraw(); await l3kWrite(c, true); }; });
}

/* ---- Kommentarerna som riktiga 3D-skyltar i IFC (Victor 2026-10-10: "riktig solid 3d så jag kan
   exportera till tc och visa dom där") ----------------------------------------------------------------
   Varje kommentar: en skylt (platta i kommentarens färg) på en stolpe ovanför punkten och en markering
   vid punkten, med texten som 3D-text på båda sidor. Skylten vänds mot den vy man har när man exporterar.
   Egenskaperna (text, av, datum, status, svar, objekt) ligger i "4D-planering". Ny fil i TC varje gång. */
const L3K_IFC = { T: 0.06, tT: 0.02, pad: 0.12 };
function l3kIfcBuild(list) {
  if (!list.length) return null;
  const doc = ifcDoc("4D-planering – " + (plan ? plan.name : ""), "Kommentarer från 3D-vyn i Lägesplan"), E = doc.E;
  // Vyns riktning (vågrätt): skylten vänds mot den som tittar. r = läsriktning, n = skyltens framsida.
  const d = l3.orbit.target.clone().sub(l3.camera.position); d.z = 0;
  if (d.lengthSq() < 1e-9) d.set(0, 1, 0);
  d.normalize();
  const r = [d.y, -d.x], n = [-d.x, -d.y];
  const dir = v => E(`IFCDIRECTION(${ifcPt(v)})`);
  const elems = [];
  const W1 = (t, h) => ifcTextStrokes(t).width * h / 6;
  list.forEach(({ c, nr }) => {
    const col = l3kCol(c), lum = (() => { const x = parseInt(col.slice(1), 16); return (0.299 * (x >> 16 & 255) + 0.587 * (x >> 8 & 255) + 0.114 * (x & 255)) / 255; })();
    const raw = typeof wrapText === "function" ? wrapText(c.text || "", 30) : String(c.text || "");
    const lines = [{ t: `${nr} · ${c.by || ""} · ${new Date(c.at).toLocaleDateString("sv-SE")}${c.done ? " · klar" : ""}`, h: 0.16 },
      ...raw.split("\n").filter(Boolean).slice(0, 6).map(t => ({ t, h: 0.2 })), (c.replies || []).length ? { t: `${c.replies.length} svar`, h: 0.13 } : null].filter(Boolean);
    const W = Math.max(1.2, ...lines.map(l => W1(l.t, l.h))) + L3K_IFC.pad * 2;
    const H = lines.reduce((a, l) => a + l.h * 1.4, 0) + L3K_IFC.pad * 1.6;
    const P = c.pos, lift = l3kLift(c), up = lift + H / 2;
    // Skyltens koordinatsystem: X = läsriktning, Y = uppåt, Z = mot betraktaren.
    const axes = (o, rx, ry, nx, ny) => E(`IFCLOCALPLACEMENT(${doc.sitePl},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt(o)})`)},${dir([nx, ny, 0])},${dir([rx, ry, 0])})`)})`);
    const center = [P[0], P[1], P[2] + up];
    const plSign = axes(center, r[0], r[1], n[0], n[1]);
    const board = E(`IFCEXTRUDEDAREASOLID(${E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${ifcNum(W)},${ifcNum(H)})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, 0, -L3K_IFC.T / 2])})`)},$,$)`)},${dir([0, 0, 1])},${ifcNum(L3K_IFC.T)})`);
    const sty = doc.style("kom-" + col, col, "Kommentar");
    E(`IFCSTYLEDITEM(${board},(${sty}),$)`);
    // Stolpen (lodrät = skyltens Y) och markeringen vid punkten.
    const pole = E(`IFCEXTRUDEDAREASOLID(${E("IFCCIRCLEPROFILEDEF(.AREA.,$,$,0.035)")},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, -up, 0])})`)},${dir([0, 1, 0])},${dir([1, 0, 0])})`)},${dir([0, 0, 1])},${ifcNum(lift)})`);
    const dot = E(`IFCEXTRUDEDAREASOLID(${E("IFCCIRCLEPROFILEDEF(.AREA.,$,$,0.12)")},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, -up, 0])})`)},${dir([0, 1, 0])},${dir([1, 0, 0])})`)},${dir([0, 0, 1])},0.05)`);
    E(`IFCSTYLEDITEM(${pole},(${sty}),$)`); E(`IFCSTYLEDITEM(${dot},(${sty}),$)`);
    const name = `Kommentar ${nr}: ${String(c.text || "").split("\n")[0].slice(0, 60)}`;
    const el = doc.proxy(name, c.text || "", "4D-kommentar", plSign, doc.shape([board, pole, dot].join(","), "SweptSolid"), c.id);
    elems.push(el);
    doc.props(el, [["Text", c.text || ""], ["Av", c.by || ""], ["Datum", c.at ? c.at.slice(0, 16).replace("T", " ") : ""], ["Status", c.done ? "Klar" : "Öppen"],
      ["Svar", (c.replies || []).map(x => `${x.by || ""}: ${x.text}`).join(" | ")], ["Objekt", (c.target && c.target.name) || ""], ["Objektets GUID", (c.target && c.target.guid) || ""],
      ["Nummer", nr], ["Arbetsyta", plan ? plan.name || "" : ""]]);
    // Texten på båda sidor (baksidan vänd ett halvt varv så att den också läses rätt).
    const textStyle = lum < 0.6 ? doc.textStyleLight : doc.textStyle;
    [[1, 1], [-1, -1]].forEach(([sr, sn]) => {
      const meshes = [];
      let y = H / 2 - L3K_IFC.pad * 0.8;
      lines.forEach(({ t, h }) => { const m = ifcTextSolid(doc, t, { h, t: L3K_IFC.tT, rx: 1, ry: 0, start: -W / 2 + L3K_IFC.pad, across: y - h / 2, style: textStyle }); if (m) meshes.push(m); y -= h * 1.4; });
      if (!meshes.length) return;
      const o = [center[0] + sn * n[0] * L3K_IFC.T / 2, center[1] + sn * n[1] * L3K_IFC.T / 2, center[2]];
      // ifcTextSolid ligger i XY med tjockleken i Z – här är Z skyltens normal, så texten står på skylten.
      elems.push(doc.proxy(`${name} – text`, "Text", "4D-kommentartext", axes(o, sr * r[0], sr * r[1], sn * n[0], sn * n[1]), doc.shape(meshes.join(","), "Tessellation"), c.id));
    });
  });
  const d2 = new Date(), p2 = x => String(x).padStart(2, "0");
  const fileName = `Kommentarer ${plan ? plan.name : ""} ${d2.getFullYear()}-${p2(d2.getMonth() + 1)}-${p2(d2.getDate())} kl ${p2(d2.getHours())}.${p2(d2.getMinutes())}.${p2(d2.getSeconds())}.ifc`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  const fn = typeof tcUniqueName === "function" ? tcUniqueName(fileName) : fileName;
  return { text: doc.finish(elems, fn), fileName: fn, n: list.length };
}
/* ids: bara de kommentarerna (markerade i listan); annars alla som syns. Numret är alltid kommentarens nummer i listan. */
async function l3kExportIfc(ids) {
  const want = ids ? new Set(ids) : null;
  const list = l3k.list.map((c, i) => ({ c, nr: i + 1 })).filter(({ c }) => want ? want.has(c.id) : (l3k.showDone || !c.done) && (typeof l3aOn !== "function" || l3aOn(c)));
  if (!list.length) { l3Status("Inga kommentarer att exportera.", true); return null; }
  const r = l3kIfcBuild(list);
  const file = new File([new TextEncoder().encode(r.text)], r.fileName, { type: "application/x-step" });
  const key = "kifc";
  busyProgress(key, `Sparar ${r.fileName}`, 0.3);
  try {
    if (!window.opener || window.opener.closed) throw new Error("öppna lägesplanen via 4D-planering för att spara i Trimble Connect");
    const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000);
    busyProgress(key, "", null);
    l3Toast(`${r.n} kommentarer sparade som 3D-skyltar i Trimble Connect: ${r.fileName}${up && up.folder ? ` (${up.folder})` : ""}.`, null, null, 9000);
    return r;
  } catch (e) { busyProgress(key, "", null); l3Status("Kunde inte spara kommentarerna som IFC: " + e.message, true); throw e; }
}
