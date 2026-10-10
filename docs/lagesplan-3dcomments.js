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
  l3k.draft = { id: ghNewId(), plan: plan && plan.id, pos: [point.x + l3.O[0], point.y + l3.O[1], point.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000), target: l3kTarget(hit), text: "", by: l3kMe(), at: now, replies: [], done: false };
  l3k.hidden = false;
  l3kOpen(l3k.draft, true);
}

/* ---- Bubblorna ---------------------------------------------------------------------------------- */
function l3kDraw() {
  if (!l3) return;
  const host = l3.renderer.domElement.parentElement;
  l3k.els.forEach(el => el.remove()); l3k.els.clear();
  const list = l3k.list.filter(c => l3k.showDone || !c.done);
  list.forEach((c, i) => {
    const el = document.createElement("button");
    el.type = "button"; el.className = "v3-cpin" + (c.done ? " done" : "") + (l3k.open && l3k.open.id === c.id ? " on" : "");
    el.innerHTML = `<span>${l3k.list.indexOf(c) + 1}</span>`;
    el.title = `${c.target && c.target.name ? c.target.name + ": " : ""}${c.text}`.slice(0, 200);
    el.onclick = e => { e.stopPropagation(); l3kOpen(c); };
    el.onpointerdown = e => e.stopPropagation();
    host.appendChild(el); l3k.els.set(c.id, el);
  });
  l3kPlace();
  if (typeof l3LayersRender === "function") l3LayersRender();
}
function l3kPlace() {
  if (!l3) return;
  const at = c => new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2]);
  l3k.els.forEach((el, id) => {
    const c = l3k.list.find(x => x.id === id);
    if (!c || l3k.hidden) { el.style.display = "none"; return; }
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
  pop.innerHTML = `<div class="v3-cpop-h"><i></i><div><b title="${esc(t.name || "")}">${esc(t.name || "Kommentar")}</b><em>${esc([kindLbl, t.model].filter(Boolean).join(" · "))}</em></div><button type="button" class="v3-x" data-k="close" title="Stäng (Esc)">✕</button></div>
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
function l3kToggle() { l3k.hidden = !l3k.hidden; if (l3k.hidden) l3kClose(); l3kDraw(); }
