/* 3D-vyn – mappar för kommentarer och mått (Victor 2026-10-10: "lägga både mått och kommentarer i mappar
   som jag kan släcka eller tända. T.ex om jag mätt eller kommenterat på ett visst område och vill bara
   visa dom").

   – Mapparna (namn) delas i projektet: projects/<id>/plan_annotfolders.json, per arbetsyta.
   – Tänt/släckt är per person (webbläsaren) – att släcka en mapp påverkar inte vad andra ser.
   – Kommentarer och mått i en släckt mapp syns inte i 3D och tas inte med i "Exportera alla".
   – "Nya hamnar i": nya kommentarer och mått läggs i den mappen. Markerade (Ctrl/Skift-klick) kan flyttas.
   – Tar man bort en mapp hamnar innehållet i "Utan mapp" – inget försvinner. */

const l3a = { folders: [], loaded: false, plan: null, cur: null };
const l3aPath = () => `projects/${encodeURIComponent(projectId)}/plan_annotfolders.json`;
const l3aKey = id => id || "_";
const l3aHiddenMap = () => (typeof l3Prefs === "function" && l3Prefs().annotHidden) || {};
/* Syns kommentaren/måttet (dess mapp är tänd)? */
function l3aOn(x) { return !l3aHiddenMap()[l3aKey(x && x.folder)]; }
function l3aFolderName(id) { const f = id && l3a.folders.find(x => x.id === id); return f ? f.name : ""; }

async function l3aLoad() {
  if (l3a.plan !== (plan && plan.id)) { l3a.plan = plan && plan.id; l3a.folders = []; l3a.loaded = false; l3a.cur = null; }
  if (l3a.loaded) return;
  l3a.loaded = true;
  try { const a = await ghReadJSON(token, l3aPath()); l3a.folders = (Array.isArray(a) ? a : []).filter(x => x && x.plan === (plan && plan.id)); }
  catch (e) { console.warn("Kunde inte läsa plan_annotfolders.json", e); }
  if (typeof l3kRenderTab === "function") l3kRenderTab();
}
async function l3aWrite(f, remove) {
  try { await ghWriteJSON(token, l3aPath(), arr => { const a = (Array.isArray(arr) ? arr : []).filter(x => x.id !== f.id); return remove ? a : [...a, f]; }, remove ? "3D: mapp borttagen" : `3D: mapp – ${f.name}`); }
  catch (e) { l3Status("Kunde inte spara mappen: " + e.message, true); }
}
/* Allt ritas om när en mapp tänds/släcks eller innehållet flyttas. */
function l3aRefresh() {
  if (typeof l3kDraw === "function") l3kDraw(); // ritar också om fliken
  if (typeof l3mDraw === "function") l3mDraw();
  if (typeof l3kRenderTab === "function") l3kRenderTab();
}
function l3aSetHidden(map) { l3SetPref("annotHidden", map); l3aRefresh(); }
function l3aToggle(id) { const h = { ...l3aHiddenMap() }, k = l3aKey(id); if (h[k]) delete h[k]; else h[k] = true; l3aSetHidden(h); }
/* Visa bara den här mappen (alla andra släcks). */
function l3aSolo(id) { const h = {}; ["_", ...l3a.folders.map(f => f.id)].forEach(k => { if (k !== l3aKey(id)) h[k] = true; }); l3aSetHidden(h); }
function l3aAll(on) { const h = {}; if (!on) ["_", ...l3a.folders.map(f => f.id)].forEach(k => { h[k] = true; }); l3aSetHidden(h); }

async function l3aNew() {
  const name = (await uiPrompt("Namn på mappen (t.ex. ett område):", "")) || "";
  if (!name.trim()) return null;
  const f = { id: ghNewId(), plan: plan && plan.id, name: name.trim().slice(0, 60), by: (settings && settings.userName) || null, at: new Date().toISOString() };
  l3a.folders.push(f); l3a.cur = f.id;
  l3aRefresh();
  await l3aWrite(f);
  l3Status(`Mappen "${f.name}" är skapad – nya kommentarer och mått hamnar i den.`);
  return f;
}
async function l3aRename(id) {
  const f = l3a.folders.find(x => x.id === id); if (!f) return;
  const name = await uiPrompt("Nytt namn på mappen:", f.name);
  if (!name || !name.trim() || name.trim() === f.name) return;
  f.name = name.trim().slice(0, 60);
  l3aRefresh(); await l3aWrite(f);
}
async function l3aDelete(id) {
  const f = l3a.folders.find(x => x.id === id); if (!f) return;
  const nk = l3k.list.filter(c => c.folder === id), nm = l3m.list.filter(m => m.folder === id);
  if (!(await uiConfirm(`Ta bort mappen "${f.name}"?${nk.length + nm.length ? ` Det som ligger i den (${nk.length} kommentarer, ${nm.length} mått) flyttas till Utan mapp.` : ""}`))) return;
  l3a.folders = l3a.folders.filter(x => x !== f);
  if (l3a.cur === id) l3a.cur = null;
  await l3aMove([...nk, ...nm], null, true);
  await l3aWrite(f, true);
}
/* Flytta kommentarer och mått till en mapp (null = Utan mapp). Sparas i en skrivning per fil. */
async function l3aMove(items, folderId, quiet) {
  const ks = items.filter(x => l3k.list.includes(x)), ms = items.filter(x => l3m.list.includes(x));
  ks.forEach(c => { c.folder = folderId || null; });
  ms.forEach(m => { m.folder = folderId || null; });
  l3aRefresh();
  try {
    if (ks.length) await ghWriteJSON(token, l3kPath(), arr => { const ids = new Set(ks.map(c => c.id)); return [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...ks]; }, `3D: ${ks.length} kommentarer till mapp`);
    const msv = ms.filter(m => m.saved).map(({ saved, ...x }) => x);
    if (msv.length) await ghWriteJSON(token, l3mPath(), arr => { const ids = new Set(msv.map(m => m.id)); return [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...msv]; }, `3D: ${msv.length} mått till mapp`);
  } catch (e) { l3Status("Kunde inte spara flytten: " + e.message, true); return; }
  if (!quiet) l3Status(`${ks.length ? `${ks.length} kommentarer` : ""}${ks.length && ms.length ? " och " : ""}${ms.length ? `${ms.length} mått` : ""} flyttade till ${folderId ? `"${l3aFolderName(folderId)}"` : "Utan mapp"}.`);
}
/* De markerade i listorna (kommentarer och mått). */
function l3aSelected() {
  const ks = typeof l3kUi !== "undefined" ? l3k.list.filter(c => l3kUi.sel.has(c.id)) : [];
  const ms = l3m.sel ? l3m.list.filter(m => l3m.sel.has(m.id)) : [];
  return [...ks, ...ms];
}

function l3aHtml() {
  const esc = escHtml, I = L3_ICO, hid = l3aHiddenMap();
  const count = id => ({ k: l3k.list.filter(c => (c.folder || null) === id).length, m: l3m.list.filter(m => (m.folder || null) === id).length });
  const row = (id, name, own) => {
    const k = l3aKey(id), on = !hid[k], n = count(id), cur = (l3a.cur || null) === id;
    return `<div class="v3-af ${on ? "" : "off"} ${cur ? "cur" : ""}">
      <button type="button" class="v3-ic" data-afeye="${k}" title="${on ? "Släck mappen" : "Tänd mappen"}" aria-pressed="${on}">${on ? I.eye : I.eyeOff}</button>
      <button type="button" class="v3-af-n" data-afcur="${k}" title="${cur ? "Nya kommentarer och mått hamnar här" : "Klicka: nya kommentarer och mått hamnar här"}"><b>${esc(name)}</b><em>${n.k} kommentarer · ${n.m} mått${cur ? " · nya hamnar här" : ""}</em></button>
      <button type="button" class="v3-ic" data-afsolo="${k}" title="Visa bara den här mappen">◎</button>
      ${own ? `<button type="button" class="v3-ic" data-afren="${k}" title="Byt namn">${I.edit}</button><button type="button" class="v3-ic" data-afdel="${k}" title="Ta bort mappen (innehållet flyttas till Utan mapp)">${I.trash}</button>` : ""}
    </div>`;
  };
  const sel = l3aSelected();
  return `<section class="v3-afold"><div class="v3-afold-h"><b>Mappar</b><button type="button" id="v3AfNew" title="Ny mapp – t.ex. för ett område">＋ Ny mapp</button><button type="button" id="v3AfAll" title="Tänd alla mappar">Tänd alla</button></div>
    <div class="v3-kc-list">${l3a.folders.map(f => row(f.id, f.name, true)).join("")}${row(null, "Utan mapp", false)}</div>
    ${sel.length && l3a.folders.length ? `<label class="v3-af-mv">Flytta markerade (${sel.length}) till <select id="v3AfMove"><option value="">välj mapp…</option>${l3a.folders.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}<option value="_">Utan mapp</option></select></label>` : ""}</section>`;
}
function l3aBind(host) {
  const id = k => (k === "_" ? null : k);
  host.querySelectorAll("[data-afeye]").forEach(b => { b.onclick = () => l3aToggle(id(b.dataset.afeye)); });
  host.querySelectorAll("[data-afsolo]").forEach(b => { b.onclick = () => l3aSolo(id(b.dataset.afsolo)); });
  host.querySelectorAll("[data-afcur]").forEach(b => { b.onclick = () => { l3a.cur = id(b.dataset.afcur); const h = { ...l3aHiddenMap() }; if (h[l3aKey(l3a.cur)]) { delete h[l3aKey(l3a.cur)]; l3aSetHidden(h); } else l3kRenderTab(); }; });
  host.querySelectorAll("[data-afren]").forEach(b => { b.onclick = () => l3aRename(id(b.dataset.afren)); });
  host.querySelectorAll("[data-afdel]").forEach(b => { b.onclick = () => l3aDelete(id(b.dataset.afdel)); });
  const nw = host.querySelector("#v3AfNew"); if (nw) nw.onclick = () => l3aNew();
  const al = host.querySelector("#v3AfAll"); if (al) al.onclick = () => l3aAll(true);
  const mv = host.querySelector("#v3AfMove"); if (mv) mv.onchange = () => { if (!mv.value) return; l3aMove(l3aSelected(), id(mv.value)); };
  l3aDragBind(host);
}

/* ---- Dra och släpp in i mapparna (Victor 2026-10-10: "dom ska kunna dras in i mappar … snygg grafik när
   jag drar dom") ------------------------------------------------------------------------------------
   Håll ned på en kommentar eller ett mått i listan och dra: ett kort följer markören (med antal om flera
   är markerade), mapparna lyser upp som mål och den under markören markeras. Släpp på en mapp (eller
   "Utan mapp") = flytta dit; släpp på "＋ Ny mapp" = ny mapp med dem i. Släpp någon annanstans eller Esc
   = inget händer. Ett vanligt klick (utan att dra) fungerar som förut. */
function l3aDragBind(host) {
  const rows = [
    ...[...host.querySelectorAll("[data-kcgo]")].map(b => ({ b, item: () => l3k.list.find(c => c.id === b.dataset.kcgo), kind: "k" })),
    ...[...host.querySelectorAll("[data-mzoom]")].map(b => ({ b, item: () => l3m.list.find(m => m.id === b.dataset.mzoom), kind: "m" })),
  ];
  rows.forEach(({ b, item, kind }) => l3DndBind(b, () => {
    const it = item(); if (!it) return null;
    // Raden är markerad: alla markerade följer med; annars bara den.
    const sel = l3aSelected(), items = sel.includes(it) ? sel : [it];
    const pal = b.closest(".v3-paltab") || document.body, ids = new Set(items.map(x => x.id));
    const nk = items.filter(x => l3k.list.includes(x)).length, nm = items.length - nk;
    return {
      items, pal,
      color: kind === "k" ? (typeof l3kCol === "function" ? l3kCol(it) : "#f97316") : "#dc2626",
      title: kind === "k" ? String(it.text || "Kommentar").split("\n")[0] : `${(typeof L3M_KIND !== "undefined" && L3M_KIND[it.kind]) || "Mått"} ${it.text}`,
      sub: items.length > 1 ? `${nk ? `${nk} kommentarer` : ""}${nk && nm ? " + " : ""}${nm ? `${nm} mått` : ""}` : "Släpp på en mapp",
      src: [...pal.querySelectorAll("[data-kcgo],[data-mzoom]")].filter(x => ids.has(x.dataset.kcgo || x.dataset.mzoom)).map(x => x.closest(".v3-kc")),
      targets: [...pal.querySelectorAll(".v3-af"), ...pal.querySelectorAll("#v3AfNew")],
      name: t => (t.id === "v3AfNew" ? "Ny mapp…" : (t.querySelector(".v3-af-n b") || {}).textContent),
      drop: async t => {
        if (t.id === "v3AfNew") { const f = await l3aNew(); if (f) await l3aMove(items, f.id); return; }
        const k = (t.querySelector("[data-afeye]") || {}).dataset; if (!k) return;
        const fid = k.afeye === "_" ? null : k.afeye;
        if (items.every(x => (x.folder || null) === fid)) { l3Status("De ligger redan i den mappen."); return; }
        await l3aMove(items, fid);
      },
    };
  }));
}

/* ---- Gemensamt dra-och-släpp (kommentarer, mått och grupper in i mappar) ------------------------------
   start() ger { items, pal, color, title, sub, src (rader som tonas), targets (mål), name(t), drop(t) }. */
function l3DndBind(btn, start) {
  btn.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.pointerType === "touch") return; // pekskärm: rullning går före
    const x0 = e.clientX, y0 = e.clientY;
    let drag = null;
    const mv = ev => {
      if (!drag) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; drag = l3DndStart(start()); if (!drag) { done(); return; } }
      l3DndMove(drag, ev);
    };
    const done = () => { window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("keydown", esc, true); };
    const up = ev => {
      done();
      if (!drag) return;
      // Klicket som följer på släppet ska inte räknas som ett klick på raden.
      const eat = ce => { ce.stopPropagation(); ce.preventDefault(); };
      window.addEventListener("click", eat, { capture: true, once: true }); setTimeout(() => window.removeEventListener("click", eat, true), 0);
      l3DndEnd(drag, ev);
    };
    const esc = ev => { if (ev.key === "Escape" && drag) { ev.stopPropagation(); done(); l3DndEnd(drag, null); } };
    window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("keydown", esc, true);
  });
}
function l3DndStart(c) {
  if (!c || !c.items || !c.items.length) return null;
  const ghost = document.createElement("div");
  ghost.className = "v3-dragghost";
  ghost.innerHTML = `<i style="background:${c.color || "#6d5efc"}"></i><span><b>${escHtml(String(c.title || "").slice(0, 48))}</b><em>${escHtml(c.sub || "Släpp på en mapp")}</em></span>${c.items.length > 1 ? `<u>${c.items.length}</u>` : ""}`;
  document.body.appendChild(ghost);
  document.body.classList.add("v3-dragging");
  (c.src || []).forEach(x => x && x.classList.add("v3-dragsrc"));
  c.targets.forEach(t => t.classList.add("v3-droptgt"));
  return { ...c, ghost, hot: null, scroller: l3aScroller(c.pal || document.body), raf: 0 };
}
function l3aScroller(el) { for (let p = el; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight) return p; } return null; }
function l3DndMove(d, ev) {
  d.ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 10}px)`;
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  let hot = null;
  for (let p = el; p && !hot; p = p.parentElement) if (d.targets.includes(p)) hot = p;
  if (hot !== d.hot) { if (d.hot) d.hot.classList.remove("v3-drophot"); if (hot) hot.classList.add("v3-drophot"); d.hot = hot; }
  const name = hot ? d.name(hot) : null;
  const em = d.ghost.querySelector("em"); if (em) em.textContent = name ? `Släpp i ${name}` : (d.sub || "Släpp på en mapp");
  d.ghost.classList.toggle("ok", !!hot);
  // Nära kanten på listan: rulla.
  cancelAnimationFrame(d.raf);
  if (d.scroller) {
    const r = d.scroller.getBoundingClientRect(), edge = 36, dy = ev.clientY < r.top + edge ? -1 : ev.clientY > r.bottom - edge ? 1 : 0;
    if (dy) { const step = () => { d.scroller.scrollTop += dy * 10; d.raf = requestAnimationFrame(step); }; d.raf = requestAnimationFrame(step); }
  }
}
async function l3DndEnd(d, ev) {
  cancelAnimationFrame(d.raf);
  document.body.classList.remove("v3-dragging");
  (d.src || []).forEach(x => x && x.classList.remove("v3-dragsrc"));
  d.targets.forEach(t => t.classList.remove("v3-droptgt", "v3-drophot"));
  const hot = ev ? d.hot : null;
  // Kortet åker in i mappen (eller tonas bort).
  if (hot) { const r = hot.getBoundingClientRect(); d.ghost.style.transition = "transform .18s ease-in, opacity .18s ease-in"; d.ghost.style.transform = `translate(${r.left + 20}px, ${r.top + r.height / 2 - 14}px) scale(.4)`; d.ghost.style.opacity = "0"; }
  else { d.ghost.style.transition = "opacity .15s"; d.ghost.style.opacity = "0"; }
  setTimeout(() => d.ghost.remove(), 220);
  if (!hot) return;
  hot.classList.add("v3-dropdone");
  await d.drop(hot);
}
