/* Egna mappar i lagerlistan (Victor 2026-11-04: "skapa mappar under respektive modelltyp, dvs under 3D-modeller, Punktmoln osv.").
   Under 3D-modeller och Punktmoln kan man skapa egna mappar och lägga modeller/moln i dem: dra raden till mappen, eller högerklicka (eller ⤷-knappen) → Flytta till mapp.
   Mappen har en egen tänd/släck-knapp för allt i den och kan fällas ihop. Mapparna sparas i webbläsaren (inställningarna) och påverkar inte filerna i Trimble Connect.
   Tekniskt: listan ritas som förut och mapparna läggs ovanpå efteråt – raderna flyttas in i mappen, så alla knappar och funktioner fungerar som vanligt. */
const L3LF_SECS = { models: { title: "3D-modeller", rows: "[data-l3l-model],[data-l3l-rem],[data-l3l-lt]" }, pc: { title: "Punktmoln", rows: "[data-pc-eye],[data-pc-rem]" } };
const L3LF_ATTRS = ["data-l3l-model", "data-l3l-rem", "data-l3l-lt", "data-pc-eye", "data-pc-rem"];
const l3lf = { menu: null };
/* Flervalda rader (Victor 2026-11-04: "hålla inne ctrl för att välja flera modeller samtidigt i sidomenyn under Lager"): Ctrl/Cmd+klick lägger till eller tar bort en rad, Skift+klick väljer ett intervall.
   Tänd/släck på en vald rad gäller alla valda, och de kan dras eller flyttas till en mapp tillsammans. */
const l3lyS = { sec: null, keys: new Set(), anchor: null };
const l3lyKeys = sec => (l3lyS.sec === sec ? [...l3lyS.keys] : []);
const l3lfAll = () => { const v = l3Prefs().layFolders; return v && typeof v === "object" ? v : {}; };
const l3lfList = sec => (l3lfAll()[sec] || []);
function l3lfSave(sec, list) { const a = { ...l3lfAll(), [sec]: list }; l3SetPref("layFolders", a); }
const l3lfAttrSel = k => { const i = k.indexOf("="); return `[${k.slice(0, i)}="${k.slice(i + 1).replace(/"/g, '\\"')}"]`; };
function l3lfRowKey(row) { const b = row.querySelector(":scope > .v3-eye"); if (!b) return null; for (const a of L3LF_ATTRS) if (b.hasAttribute(a)) return a + "=" + b.getAttribute(a); return null; }
/* 'remembered' och inläst version av samma fil har olika attribut men samma id – folk tänker på filen, så nyckeln är id:t. */
const l3lfKeyId = k => k.slice(k.indexOf("=") + 1);
function l3lfFolderOf(sec, key) { const id = l3lfKeyId(key); return l3lfList(sec).find(f => (f.items || []).includes(id)) || null; }
function l3lfCreate(sec, name, key) {
  name = String(name || "").trim(); if (!name) return null; const list = l3lfList(sec).map(f => ({ ...f, items: (f.items || []).slice() })), f = { id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, items: [], shut: false };
  list.push(f); l3lfSave(sec, list); if (key) l3lfAssign(sec, key, f.id); else l3LayersRender(); return f;
}
function l3lfAssign(sec, key, folderId) {
  const ids = (Array.isArray(key) ? key : [key]).map(l3lfKeyId), list = l3lfList(sec).map(f => ({ ...f, items: (f.items || []).filter(x => !ids.includes(x)) }));
  if (folderId) { const f = list.find(x => x.id === folderId); if (f) { ids.forEach(id => f.items.push(id)); f.shut = false; } }
  l3lfSave(sec, list); l3LayersRender();
}
function l3lfRename(sec, fid, name) { name = String(name || "").trim(); if (!name) return; l3lfSave(sec, l3lfList(sec).map(f => f.id === fid ? { ...f, name } : f)); l3LayersRender(); }
function l3lfDelete(sec, fid) { l3lfSave(sec, l3lfList(sec).filter(f => f.id !== fid)); l3LayersRender(); }
function l3lfToggleShut(sec, fid) { l3lfSave(sec, l3lfList(sec).map(f => f.id === fid ? { ...f, shut: !f.shut } : f)); l3LayersRender(); }
/* Tänd/släck allt i mappen: raderna slås upp på nytt för varje klick eftersom listan kan ritas om emellan. */
async function l3lfToggleAll(sec, fid) {
  const host = document.getElementById("v3PalLayers"); if (!host) return; const f = l3lfList(sec).find(x => x.id === fid); if (!f) return;
  const rows = () => [...host.querySelectorAll(`.v3-lyf[data-lf="${fid}"] .v3-lr > .v3-eye`)], anyOn = rows().some(b => b.classList.contains("on")), want = !anyOn;
  const keys = rows().map(b => L3LF_ATTRS.map(a => b.hasAttribute(a) ? a + "=" + b.getAttribute(a) : null).find(Boolean)).filter(Boolean);
  for (const k of keys) { const b = host.querySelector(`.v3-lyf[data-lf="${fid}"] ${l3lfAttrSel(k)}`); if (b && b.classList.contains("on") !== want) { b.click(); await new Promise(r => setTimeout(r, 60)); } }
}
function l3lfCloseMenu() { if (l3lf.menu) { l3lf.menu.remove(); l3lf.menu = null; } }
function l3lfMenu(x, y, items) {
  l3lfCloseMenu(); const m = document.createElement("div"); m.className = "v3-lyfm"; const host = document.getElementById("view3d"); if (!host) return;
  m.innerHTML = items.map((it, i) => it.sep ? `<hr>` : `<button type="button" data-i="${i}" class="${it.on ? "on" : ""} ${it.danger ? "danger" : ""}"><span>${it.on ? "✓" : ""}</span>${escHtml(it.label)}</button>`).join("");
  host.appendChild(m); const hr = host.getBoundingClientRect(); m.style.left = Math.max(4, Math.min(x - hr.left, hr.width - 220)) + "px"; m.style.top = Math.max(4, Math.min(y - hr.top, hr.height - m.offsetHeight - 8)) + "px";
  m.querySelectorAll("button").forEach(b => { b.onclick = async e => { e.stopPropagation(); const it = items[+b.dataset.i]; l3lfCloseMenu(); if (it && it.fn) await it.fn(); }; });
  m.addEventListener("pointerdown", e => e.stopPropagation()); l3lf.menu = m;
  setTimeout(() => { const off = ev => { if (l3lf.menu && !l3lf.menu.contains(ev.target)) { l3lfCloseMenu(); window.removeEventListener("pointerdown", off, true); } }; window.addEventListener("pointerdown", off, true); }, 0);
}
async function l3lfAsk(q, def) { return typeof uiPrompt === "function" ? ((await uiPrompt(q, def || "")) || "").trim() : (prompt(q, def || "") || "").trim(); }
function l3lfMoveMenu(sec, key, x, y) {
  const multi = l3lyS.sec === sec && l3lyS.keys.has(key) && l3lyS.keys.size > 1, target = multi ? [...l3lyS.keys] : key, cur = multi ? null : l3lfFolderOf(sec, key);
  const items = l3lfList(sec).map(f => ({ label: f.name, on: cur && cur.id === f.id, fn: () => l3lfAssign(sec, target, f.id) }));
  if (multi) items.unshift({ label: `${l3lyS.keys.size} valda – flytta till:`, fn: () => {} }, { sep: true });
  if (items.length) items.push({ sep: true });
  items.push({ label: "Ny mapp…", fn: async () => { const n = await l3lfAsk("Namn på mappen:", ""); if (n) { const f = l3lfCreate(sec, n); if (f) l3lfAssign(sec, target, f.id); } } });
  if (cur || multi) items.push({ label: "Ta ur mappen", fn: () => l3lfAssign(sec, target, null) });
  l3lfMenu(x, y, items);
}
const L3LF_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
function l3lfApply() {
  const host = document.getElementById("v3PalLayers"); if (!host || host.classList.contains("hidden")) return; const q = ((typeof l3lay !== "undefined" && l3lay.q) || "").trim();
  Object.keys(L3LF_SECS).forEach(sec => {
    const sect = host.querySelector(`.v3-lsec[data-lsec="${sec}"]`); if (!sect) return;
    l3lySelBind(sec, sect);
    const rows = [...sect.querySelectorAll(".v3-lsec-b .v3-lr")].filter(r => !r.closest(".v3-lyf") && r.querySelector(":scope > .v3-eye") && l3lfRowKey(r)); if (!rows.length && !l3lfList(sec).length) return;
    rows.forEach(r => { // dra + flytta-knapp
      const key = l3lfRowKey(r); r.draggable = true; r.ondragstart = e => { const many = l3lyS.sec === sec && l3lyS.keys.has(key) && l3lyS.keys.size > 1 ? [...l3lyS.keys] : [key]; e.dataTransfer.setData("text/x-lrow", sec + "|" + many.join("\n")); e.dataTransfer.effectAllowed = "move"; r.classList.add("dragging"); }; r.ondragend = () => r.classList.remove("dragging");
      r.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); l3lfMoveMenu(sec, key, e.clientX, e.clientY); };
      if (!r.querySelector(".v3-lyf-mv")) { const b = document.createElement("button"); b.type = "button"; b.className = "v3-lr-zoom v3-lyf-mv"; b.title = "Flytta till mapp"; b.innerHTML = L3LF_ICO; b.onclick = e => { e.stopPropagation(); const rc = b.getBoundingClientRect(); l3lfMoveMenu(sec, key, rc.left, rc.bottom); }; r.appendChild(b); }
    });
    const container = rows.length ? rows[0].parentElement : (sect.querySelector(".v3-lsub-b") || sect.querySelector(".v3-lsec-b")); if (!container) return;
    // mapparna (i den ordning de skapats) överst i gruppen; raderna som hör till dem flyttas in
    const anchor = rows.length ? rows[0] : null, made = [];
    l3lfList(sec).forEach(f => {
      const mine = rows.filter(r => { const k = l3lfRowKey(r); return k && (f.items || []).includes(l3lfKeyId(k)); }); if (q && !mine.some(r => r.style.display !== "none")) return;
      const shut = !!f.shut && !q, n = mine.length, anyOn = mine.some(r => r.querySelector(":scope > .v3-eye.on"));
      const el = document.createElement("div"); el.className = "v3-lyf" + (shut ? " shut" : ""); el.dataset.lf = f.id;
      el.innerHTML = `<div class="v3-lyf-h"><button type="button" class="v3-lyf-t" aria-expanded="${!shut}" title="Fäll ihop eller ut"><i>›</i>${L3LF_ICO}<b>${escHtml(f.name)}</b><em>${n}</em></button><button type="button" class="v3-eye ${anyOn ? "on" : ""} v3-lyf-eye" title="${anyOn ? "Släck allt i mappen" : "Tänd allt i mappen"}">${typeof l3lEye === "function" ? l3lEye(anyOn) : ""}</button><button type="button" class="v3-ic v3-lyf-more" title="Fler val">⋯</button></div><div class="v3-lyf-b"></div>`;
      const body = el.querySelector(".v3-lyf-b"); mine.forEach(r => body.appendChild(r)); if (!n) body.innerHTML = `<div class="v3-lyf-empty">Tom – dra hit en rad eller högerklicka på den.</div>`;
      el.querySelector(".v3-lyf-t").onclick = () => l3lfToggleShut(sec, f.id);
      el.querySelector(".v3-lyf-eye").onclick = e => { e.stopPropagation(); l3lfToggleAll(sec, f.id); };
      el.querySelector(".v3-lyf-more").onclick = e => { e.stopPropagation(); const rc = e.currentTarget.getBoundingClientRect();
        l3lfMenu(rc.left, rc.bottom, [{ label: "Byt namn…", fn: async () => { const nn = await l3lfAsk("Nytt namn:", f.name); if (nn) l3lfRename(sec, f.id, nn); } }, { label: "Tänd eller släck allt", fn: () => l3lfToggleAll(sec, f.id) }, { sep: true }, { label: "Ta bort mappen (innehållet ligger kvar i listan)", danger: true, fn: () => l3lfDelete(sec, f.id) }]); };
      el.addEventListener("dragover", e => { if (![...e.dataTransfer.types].includes("text/x-lrow")) return; e.preventDefault(); el.classList.add("drop"); });
      el.addEventListener("dragleave", e => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop"); });
      el.addEventListener("drop", e => { const d = e.dataTransfer.getData("text/x-lrow"); el.classList.remove("drop"); if (!d) return; e.preventDefault(); const [s2, k] = [d.slice(0, d.indexOf("|")), d.slice(d.indexOf("|") + 1)]; if (s2 === sec) l3lfAssign(sec, k.split("\n"), f.id); });
      made.push(el);
    });
    made.forEach(el => container.insertBefore(el, anchor && anchor.parentElement === container && !anchor.closest(".v3-lyf") ? anchor : container.firstChild));
    // "Ny mapp" som en lugn rad längst ner i gruppen (inget extra i blockhuvudet)
    if (!container.querySelector(":scope > .v3-lyf-add")) { const b = document.createElement("button"); b.type = "button"; b.className = "v3-lyf-add"; b.innerHTML = `${L3LF_ICO}<span>Ny mapp</span>`; b.title = "Skapa en egen mapp – dra eller högerklicka på rader för att lägga dem i den"; b.onclick = async e => { e.stopPropagation(); const n = await l3lfAsk("Namn på mappen:", ""); if (n) l3lfCreate(sec, n); }; container.appendChild(b); }
    // släpp på listan utanför mapparna = ta ur mappen
    if (!container._lfDrop) { container._lfDrop = true; container.addEventListener("dragover", e => { if (e.target.closest && e.target.closest(".v3-lyf")) return; if ([...e.dataTransfer.types].includes("text/x-lrow")) e.preventDefault(); });
      container.addEventListener("drop", e => { if (e.target.closest && e.target.closest(".v3-lyf")) return; const d = e.dataTransfer.getData("text/x-lrow"); if (!d) return; e.preventDefault(); const s2 = d.slice(0, d.indexOf("|")); if (s2 === sec) l3lfAssign(sec, d.slice(d.indexOf("|") + 1).split("\n"), null); }); }
  });
  { const all = new Set([...host.querySelectorAll(".v3-lr")].map(l3lfRowKey).filter(Boolean)); [...l3lyS.keys].forEach(k => { if (!all.has(k)) l3lyS.keys.delete(k); }); l3lyPaint(); }
}

/* Tänd/släck en lista rader (nycklar) – raderna slås upp på nytt för varje klick eftersom listan kan ritas om emellan. */
async function l3lySetEyes(keys, want) {
  const host = document.getElementById("v3PalLayers"); if (!host) return;
  for (const k of keys) { const b = host.querySelector(l3lfAttrSel(k)); if (b && b.classList.contains("on") !== want) { b._lyBatch = true; b.click(); await new Promise(r => setTimeout(r, 70)); } }
}
function l3lySelClear() { l3lyS.sec = null; l3lyS.keys.clear(); l3lyS.anchor = null; l3lyPaint(); }
function l3lyPaint() {
  const host = document.getElementById("v3PalLayers"); if (!host) return;
  host.querySelectorAll(".v3-lr").forEach(r => { const k = l3lfRowKey(r), sec = (r.closest(".v3-lsec") || {}).dataset && r.closest(".v3-lsec").dataset.lsec; r.classList.toggle("v3-lysel", !!(k && sec === l3lyS.sec && l3lyS.keys.has(k))); });
  let bar = host.querySelector(".v3-lysel-bar"); const n = l3lyS.keys.size;
  if (n < 2) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.className = "v3-lysel-bar"; const top = host.querySelector(".v3-lay-top"); if (top) top.after(bar); else host.prepend(bar); }
  bar.innerHTML = `<b>${n} valda</b><button type="button" data-a="on">Tänd</button><button type="button" data-a="off">Släck</button><button type="button" data-a="folder">Flytta till mapp…</button><button type="button" data-a="clr" title="Avmarkera (Esc)">✕</button>`;
  bar.onclick = e => { const b = e.target.closest("button"); if (!b) return; const keys = [...l3lyS.keys], sec = l3lyS.sec; if (b.dataset.a === "on") l3lySetEyes(keys, true); else if (b.dataset.a === "off") l3lySetEyes(keys, false); else if (b.dataset.a === "clr") l3lySelClear(); else { const rc = b.getBoundingClientRect(); l3lfMoveMenu(sec, keys[0], rc.left, rc.bottom); } };
}
function l3lySelBind(sec, sect) {
  sect.querySelectorAll(".v3-lr").forEach(r => {
    const key = l3lfRowKey(r); if (!key || r._lySel) return; r._lySel = true;
    const eye = r.querySelector(":scope > .v3-eye");
    // Ctrl/Cmd/Skift + klick på raden väljer – utan att tända, släcka eller markera modellen
    r.addEventListener("click", e => {
      if (!(e.ctrlKey || e.metaKey || e.shiftKey) || e.target.closest(".v3-lyf-mv, .v3-lr-zoom, .v3-lr-save, input, select")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (l3lyS.sec !== sec) { l3lyS.sec = sec; l3lyS.keys.clear(); l3lyS.anchor = null; }
      if (e.shiftKey && l3lyS.anchor) { const rows = [...sect.querySelectorAll(".v3-lr")].filter(x => l3lfRowKey(x) && x.style.display !== "none"), ks = rows.map(l3lfRowKey), a = ks.indexOf(l3lyS.anchor), b = ks.indexOf(key); if (a >= 0 && b >= 0) { if (!(e.ctrlKey || e.metaKey)) l3lyS.keys.clear(); ks.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(k => l3lyS.keys.add(k)); } }
      else { if (l3lyS.keys.has(key)) l3lyS.keys.delete(key); else l3lyS.keys.add(key); l3lyS.anchor = key; }
      l3lyPaint();
    }, true);
    // tänd/släck på en vald rad gäller alla valda
    if (eye) eye.addEventListener("click", e => {
      if (eye._lyBatch) { eye._lyBatch = false; return; }
      if (l3lyS.sec !== sec || !l3lyS.keys.has(key) || l3lyS.keys.size < 2 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault(); e.stopImmediatePropagation(); const want = !eye.classList.contains("on"), keys = [...l3lyS.keys]; setTimeout(() => l3lySetEyes(keys, want), 0);   // efter klicket – click() inuti ett pågående klick gör inget
    }, true);
  });
}
window.addEventListener("keydown", e => { if (e.key === "Escape" && l3lyS.keys.size) { const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; l3lySelClear(); } });

(function () { if (typeof l3LayersRender !== "function") return; const orig = l3LayersRender; l3LayersRender = function () { const r = orig.apply(this, arguments); try { l3lfApply(); } catch (e) { console.warn("Lagermappar", e); } return r; }; })();
