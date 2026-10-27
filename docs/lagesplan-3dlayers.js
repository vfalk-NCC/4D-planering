/* 3D-vyn – Lager (Victor 2026-10-09: "en riktig lagerhanterare istället för modeller jag har inuti mitt
   projekt där jag kan tända och släcka, med mappsortering om jag vill", "tända upp 2D-underlaget i
   3D-vyn" och "gör högermenyn möjlig att bredda").

   Fliken Lager i vänsterpanelen:
   – Underlag: ritningen (PDF) som mark – tänd/släck och genomskinlighet.
   – Planerade objekt (lådorna) och Etablering – tänd/släck, etableringen även per typ.
   – Modeller i projektet (Trimble Connect): som mappträd (projektets mappar, hämtas när en mapp
     öppnas) eller som lista över de modeller som är inlästa. Ögat läser in modellen första gången
     (via 4D-planering, som har TC-behörigheten) och tänder/släcker den sedan.
   Panelerna till höger och vänster kan breddas genom att dra i kanten. */

const L3L_EXT = /\.(ifc|ifczip|dxf|dwg|las|laz|xyz|pts|ply|e57)$/i; // DXF blir ett CAD-lager (lagesplan-3dsite.js), LAS/LAZ … punktmoln (lagesplan-3dpc.js)
let l3lay = { folders: new Map(), open: new Set(), root: null, project: "", loading: new Set(), err: "", texp: new Set() };

const l3lEye = on => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${on
  ? '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'
  : '<path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.2 3.2"/><path d="M1 1l22 22"/>'}</svg>`;

/* Etableringens typer (med antal) och om de syns. */
function l3lTypes() {
  const m = new Map();
  placements.forEach(p => {
    const l = placeLib(p.type) || { label: p.type };
    const t = m.get(p.type) || { type: p.type, label: l.label || p.type, ids: [], color: (l.color || "#64748b") };
    t.ids.push(p.id); m.set(p.type, t);
  });
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "sv"));
}
const l3lTypeOn = t => t.ids.some(id => !(l3.hidden && l3.hidden.has(id)));
function l3lSetIdsVisible(ids, on) {
  if (!l3.hidden) l3.hidden = new Set();
  ids.forEach(id => { if (on) l3.hidden.delete(id); else l3.hidden.add(id); const g = l3.placeMeshes.get(id); if (g) g.visible = on; });
  if (!on) l3SelectIds([...l3.sel].filter(id => !ids.includes(id)));
  if (typeof l3RenderObjList === "function") l3RenderObjList();
  l3Render();
}

/* Hopfällbart block i lagerhanteraren (Victor 2026-10-10: "man måste kunna collapsa alla block"). */
/* Minimalistisk (Victor 2026-10-12: "sortera upp den här menyn … minimalistiskt och stilrent … jobba mycket med
   collapse och dropdown-menyer"): block och grupper fälls ihop, åtgärder ligger i små menyer (＋ och ⋯) och
   radernas knappar syns när musen är över raden. Inställningarna har ett eget block längst ner (ihopfällt). */
const L3L_SECS = ["models", "pc", "site2d", "lyr", "map", "settings"];
const l3lClosed = () => { const c = new Set(l3Prefs().layClosed || []); if (!l3Prefs().layAdv) c.add("settings"); return c; };
/* Samlingsswitchar i Lager (Victor 2026-10-24): släcker/tänder alla 3D-modeller, alla punktmoln, eller alla 2D-lager + ritningen på en gång. Tänder man igen
   kommer det som var tänt förut tillbaka (är inget minnt tänds allt). */
function l3lMasterOn(kind) {
  if (kind === "models") return l3b.models.some(m => m.visible);
  if (kind === "pc") return typeof l3pc !== "undefined" && l3pc.clouds.some(c => c.visible);
  const keys = l3lTwoDKeys(); return keys.some(k => ls(k).visible) || (l3Prefs().plan !== false && !!(l3 && l3.planMesh));
}
function l3lTwoDKeys() { if (typeof layerDisplayEntries !== "function") return []; const out = []; layerDisplayEntries().forEach(e => { if (e.folder) e.kids.forEach(k => { if (k !== "pdf") out.push(k); }); else if (e.key !== "pdf") out.push(e.key); }); return out; }
function l3lSw(kind, title) {
  const on = l3lMasterOn(kind);
  return `<label class="v3-lay-sw" title="${title}"><input type="checkbox" data-lsw="${kind}" ${on ? "checked" : ""} role="switch" aria-label="${title}" /><i></i></label>`;
}
function l3lMaster(kind, on) {
  l3lay.mem = l3lay.mem || {};
  if (kind === "models") { if (!on) { l3lay.mem.models = l3b.models.filter(m => m.visible).map(m => m.id); l3b.models.forEach(m => { if (m.visible) l3bShow(m.id, false); }); } else { const ids = (l3lay.mem.models || []).filter(id => l3b.models.some(m => m.id === id)); (ids.length ? ids : l3b.models.map(m => m.id)).forEach(id => l3bShow(id, true)); } if (typeof l3RenderLegend === "function") l3RenderLegend(); }
  else if (kind === "pc") { if (!on) { l3lay.mem.pc = l3pc.clouds.filter(c => c.visible).map(c => c.id); l3pc.clouds.forEach(c => { if (c.visible) l3pcShow(c.id, false); }); } else { const ids = (l3lay.mem.pc || []).filter(id => l3pc.clouds.some(c => c.id === id)); (ids.length ? ids : l3pc.clouds.map(c => c.id)).forEach(id => l3pcShow(id, true)); } }
  else { const keys = l3lTwoDKeys(), cb = document.getElementById("v3ShowPlan"), setPlan = v => { if (cb && cb.checked !== v) { cb.checked = v; cb.dispatchEvent(new Event("change")); } else if (l3.planMesh) { l3SetPref("plan", v); l3.planMesh.visible = v; } };
    if (!on) { l3lay.mem.twoD = keys.filter(k => ls(k).visible); l3lay.mem.plan = l3Prefs().plan !== false; setLayersVisible(keys, false); setPlan(false); } else { const ks = (l3lay.mem.twoD || []).filter(k => keys.includes(k)); setLayersVisible(ks.length ? ks : keys, true); setPlan(l3lay.mem.plan !== false); } if (typeof l3sRefresh === "function") l3sRefresh(0); }
  l3Render(); l3LayersRender();
}
/* Klick på en modells namn: markera den och låt dess objekt glöda i blått (puls och sedan ett svagt sken) tills man väljer något annat. */
function l3lGlow(id) {
  if (!l3b) return; const off = !id || l3lay.glow === id; l3lay.glow = off ? null : id; cancelAnimationFrame(l3lay.glowRaf || 0);
  const mats = []; l3b.models.forEach(m => m.meshes.forEach(x => { const mt = x.material; if (!mt || !mt.emissive) return; const on = !off && m.id === id; mt.emissive.set(on ? 0x2f7bff : 0x000000); mt.emissiveIntensity = on ? 0.3 : 0; if (on) mats.push(mt); (x.userData.l3b && x.userData.l3b.ghosts || []).forEach(g => { if (g.material && g.material.emissive) { g.material.emissive.set(on ? 0x2f7bff : 0); g.material.emissiveIntensity = on ? 0.3 : 0; } }); }));
  if (!off && mats.length) { const t0 = performance.now(), step = now => { const k = Math.min(1, (now - t0) / 1400), v = 0.3 + 0.7 * Math.sin(k * Math.PI) * (1 - k * 0.2); mats.forEach(mt => { mt.emissiveIntensity = v; }); l3Render(); if (k < 1 && l3lay.glow === id) l3lay.glowRaf = requestAnimationFrame(step); else mats.forEach(mt => { mt.emissiveIntensity = 0.28; }); }; l3lay.glowRaf = requestAnimationFrame(step); const m = l3b.models.find(x => x.id === id); if (m && typeof l3Status === "function") l3Status(`${m.name} är markerad.`); } else l3Render();
  l3LayersRender();
}
function l3lSec(id, title, body, extra = "", count = null) {
  const shut = l3lClosed().has(id) && !(l3lay.q || "").trim();
  return `<section class="v3-lsec ${shut ? "shut" : ""}" data-lsec="${id}"><div class="v3-lg v3-lsec-h"><button type="button" class="v3-lsec-t" data-lsec-t="${id}" aria-expanded="${!shut}"><i>›</i>${title}${count != null ? ` <em class="v3-lsec-n">${count}</em>` : ""}</button>${extra}</div>${shut ? "" : `<div class="v3-lsec-b">${body}</div>`}</section>`;
}
/* Grupp inne i ett block (Modeller, Punktmoln …), hopfällbar. */
function l3lSub(id, title, count, body, extra = "") {
  const shut = (l3Prefs().layClosed || []).includes("sub:" + id) && !(l3lay.q || "").trim();
  return `<div class="v3-lsub" data-lsub="${id}"><div class="v3-lsub-h"><button type="button" class="v3-lsub-t" data-lsub-t="${id}" aria-expanded="${!shut}"><i>›</i>${title}${count != null ? ` <em>${count}</em>` : ""}</button>${extra}</div>${shut ? "" : `<div class="v3-lsub-b">${body}</div>`}</div>`;
}
/* Liten rullgardinsmeny i ett blockhuvud: knappen (＋ eller ⋯) och menyn (alltid i DOM, dold). */
function l3lMenu(id, label, title, items) {
  if (!items) return "";
  if (label === "＋") label = UI_PLUS;
  return `<span class="v3-ldd"><button type="button" class="v3-ldd-b" data-ldd="${id}" title="${title}" aria-haspopup="menu" aria-expanded="false">${label}</button><span class="v3-ldd-m hidden" role="menu" data-ldd-m="${id}">${items}</span></span>`;
}
function l3lMenusBind(host) {
  const closeAll = () => [...host.querySelectorAll(".v3-ldd-m"), ...document.querySelectorAll("#view3d > .v3-ldd-m")].forEach(m => { m.classList.add("hidden"); const b = host.querySelector(`[data-ldd="${m.dataset.lddM}"]`); if (b) b.setAttribute("aria-expanded", "false"); });
  host.querySelectorAll("[data-ldd]").forEach(b => { b.onclick = e => {
    e.stopPropagation();
    const m = host.querySelector(`[data-ldd-m="${b.dataset.ldd}"]`) || document.querySelector(`#view3d > [data-ldd-m="${b.dataset.ldd}"]`); if (!m) return; const open = m.classList.contains("hidden");
    closeAll(); m.classList.toggle("hidden", !open); b.setAttribute("aria-expanded", open);
    if (open && (m.dataset.lddM === "pcset" || m.dataset.lddM === "mapset" || m.dataset.lddM === "mdlset")) {   // stora inställningsmenyn: fast läge, inom panelens bredd
      const hr = host.getBoundingClientRect(), br = b.getBoundingClientRect(), w = Math.min(300, hr.width - 12);
      const v3 = document.getElementById("view3d"); if (v3 && m.parentElement !== v3) v3.appendChild(m);   // utanför panelen så att inget klipper den
      m.style.position = "fixed"; m.style.width = w + "px"; m.style.minWidth = "0"; m.style.right = "auto"; m.style.left = Math.max(hr.left + 6, Math.min(br.right - w, hr.right - w - 6)) + "px"; m.style.top = br.bottom + 6 + "px"; m.style.maxHeight = Math.max(200, window.innerHeight - br.bottom - 20) + "px"; m.style.overflowY = "auto";
    }
    if (open) setTimeout(() => { const off = ev => { if (!m.contains(ev.target) && ev.target !== b) { m.classList.add("hidden"); b.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", off, true); } }; document.addEventListener("mousedown", off, true); }, 0);
  }; });
  host.querySelectorAll(".v3-ldd-m button").forEach(x => x.addEventListener("click", () => setTimeout(closeAll, 0)));
}
const L3L_FOLD_ICO = shut => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shut ? '<path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>' : '<path d="M7 20l5-5 5 5M7 4l5 5 5-5"/>'}</svg>`;
function l3LayersRender() {
  document.querySelectorAll("#view3d > .v3-ldd-m").forEach(x => x.remove());
  const host = document.getElementById("v3PalLayers");
  if (!host || !l3 || host.classList.contains("hidden")) return; // ritas när fliken visas
  const P = l3Prefs(), esc = escHtml;
  const row = (attrs, on, label, extra = "", cls = "") => `<div class="v3-lr ${cls}"><button type="button" class="v3-eye ${on ? "on" : ""}" ${attrs} title="${on ? "Släck" : "Tänd"}">${l3lEye(on)}</button><span class="v3-lr-n" title="${esc(label)}">${label}</span>${extra}</div>`;
  const types = l3lTypes();
  const allShut = L3L_SECS.filter(id => id !== "settings").every(id => l3lClosed().has(id));
  // Sök i lagermenyn (Victor 2026-10-10): filtrerar raderna, blocken visas utfällda medan man söker.
  const q = (l3lay.q || "").trim().toLowerCase();
  let h = `<div class="v3-lay-top"><input type="search" class="v3-pp-q" id="v3LayQ" placeholder="Sök lager, modell, DXF…" value="${esc(l3lay.q || "")}" /><button type="button" class="v3-ic v3-lay-foldb" id="v3LayFold" title="${allShut ? "Fäll ut alla block" : "Fäll ihop alla block"}">${L3L_FOLD_ICO(allShut)}</button></div><!--l3l-models-->`;
  // Underlag (ritningen som mark) ligger under Visa; Planering och etablering togs bort (Victor 2026-10-12).
  const noTc0 = typeof bridgeOk === "function" && !bridgeOk();
  if (typeof l3sHtml === "function") { const s2 = l3sHtml(row, l3lEye); if (s2) h += l3lSec("site2d", "2D-MODELLER", "<!--l3l-tb-site2d-->" + s2.body, l3lMenu("site2d", "＋", "Lägg till 2D-underlag", (noTc0 ? "" : `<button type="button" data-l3l-browse="site2d" title="Projektets mappar i Trimble Connect – välj en DXF eller DWG">Bläddra i Trimble Connect…</button>`) + `<button type="button" data-l3l-pickdxf="1" title="DXF från datorn">DXF från datorn…</button>`) + l3lSw("twoD", "Tänd/släck alla 2D-lager, DXF och ritningen (PDF)") + (s2.extra || "")); }
  if (typeof l3lyHtml === "function") { const ly = l3lyHtml(l3lEye, esc); h += l3lSec("lyr", "LAGER I MODELL &amp; RITNING", ly.body, "", ly.n || null); }
  let mh = "";
  const noTc = typeof bridgeOk === "function" && !bridgeOk();
  const browse = P.laySort === "tree", bk = P.layBrowse || "models"; l3lay.kind = browse ? bk : null;
  if (!browse || bk !== "models") {
    const ms = l3b.models.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
    const pend = m => (typeof l3bmPending === "function" ? l3bmPending(m.id) : 0);
    // Även släckta, sparade modeller som inte är inlästa i den här sessionen står kvar (läses in när de tänds).
    const rest = (typeof l3bRememberedAll === "function" ? l3bRememberedAll() : []).filter(w => !l3b.models.some(m => m.id === w.id));
    const all = [...ms.map(m => ({ m, name: m.name })), ...rest.map(w => ({ w, name: w.name || "Modell" }))].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
    const del = id => `<button type="button" class="v3-lr-zoom v3-lr-del" data-l3l-forget="${esc(id)}" title="Ta bort från Hämtade 3D-modeller (inget i Trimble Connect ändras)">${L3_ICO.trash}</button>`;
    mh += all.length ? all.map(({ m, w, name }) => m
      ? row(`data-l3l-model="${esc(m.id)}"`, m.visible, esc(name), (pend(m) ? `<button type="button" class="v3-lr-save" data-l3l-save="${esc(m.id)}" title="Spara flyttarna som en ny IFC-fil i Trimble Connect">Spara ${pend(m)}</button>` : `<em class="v3-lr-k" title="${m.tris.toLocaleString("sv-SE")} trianglar">${(m.tris / 1000).toFixed(0)}k</em>`) + `<span class="v3-lr-acts"><button type="button" class="v3-lr-zoom" data-l3l-place="${esc(m.id)}" title="Placera modellen (flytta/vrid, samma placering som i Trimble Connect)">↔</button><button type="button" class="v3-lr-zoom" data-l3l-zoom="${esc(m.id)}" title="Zooma till modellen">${L3_ICO.focus}</button>${del(m.id)}</span>`)
      : row(`data-l3l-rem="${esc(w.id)}"`, false, esc(name), (l3lay.loading.has(w.id) ? '<span class="pm-spin"></span>' : "") + `<span class="v3-lr-acts">${del(w.id)}</span>`)).join("")
      : (noTc ? "" : `<div class="v3-pal-hint">Inga modeller är hämtade än. Lägg till med ＋ ovan.</div>`);
    // Utan kontakt med Trimble Connect (iPhone/iPad – lägesplanen öppnas i Safari, utan 4D-planering): de modeller
    // som datorn sparat som lätt kopia i datalagret (Victor 2026-10-11: "Nej får ingen kontakt").
    if (noTc && typeof l3ltList === "function") {
      if (!l3lay.ltAsked) { l3lay.ltAsked = true; l3ltList(true).then(() => l3LayersRender()).catch(() => {}); }
      const have = new Set([...l3b.models.map(m => m.id), ...(typeof l3bRememberedAll === "function" ? l3bRememberedAll() : []).map(w => w.id)]);
      const lt = ((typeof l3lt !== "undefined" && l3lt.list) || []).filter(e => e && e.key && !have.has(e.key));
      if (lt.length) mh += `<div class="v3-lg v3-lr-sub" style="margin-top:6px">Sparade för mobilen</div>` + lt.map(e => row(`data-l3l-lt="${esc(e.key)}"`, false, esc(e.name || "Modell"), (l3lay.loading.has(e.key) ? '<span class="pm-spin"></span>' : "") + `<em class="v3-lr-k">${e.bytes ? (e.bytes / 1e6).toFixed(0) + " MB" : ""}</em>`)).join("");
      else if (!all.length) mh += `<div class="v3-pal-hint">${l3lt.list ? "Inga modeller är sparade för mobilen än. Öppna modellen en gång i 3D-vyn på datorn (via 🗺️ i 4D-planering i Trimble Connect) – då sparas en lätt kopia som iPhone och iPad kan visa." : "Hämtar modellerna som är sparade för mobilen…"}</div>`;
    }
    // Grupperna Modeller och Punktmoln (hopfällbara).
    const nm = all.length;
    mh = l3lSub("models", "Modeller", nm, mh);
    l3lay.pcExtra = typeof l3pcHtml === "function" ? ((typeof l3pcSettingsHtml === "function" ? l3lMenu("pcset", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>', "Visning av punktmoln", l3pcSettingsHtml()) : "") + l3lMenu("pc", "＋", "Lägg till punktmoln", (noTc ? "" : `<button type="button" data-l3l-browse="pc" title="Projektets mappar i Trimble Connect – välj en LAS/LAZ/E57-fil">Från Trimble Connect…</button>`) + `<button type="button" data-pcfile2="1" title="LAS, LAZ, XYZ/PTS/TXT eller PLY från datorn (även över 2 GB)">Från datorn…</button>`) + l3lSw("pc", "Tänd/släck alla punktmoln")) : "";
  } else mh += l3lTreeHtml(l3lay.root, 0);
  let tb = browse && bk !== "models" ? l3lTreeBar(bk) + l3lTreeHtml(l3lay.root, 0) : "";
  mh += `<div id="v3LayBldgBox"></div>`;
  // Inställningar (sällan ändrade) i ett eget block längst ner – grupperade, korta namn, förklaring vid hovring.
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const chk = (id, on, label, hint, title) => `<label class="v3-set-chk" title="${title}"><span class="v3-set-t">${label}${hint ? `<em>${hint}</em>` : ""}</span><span class="v3-lay-sw"><input type="checkbox" id="${id}" role="switch" ${on ? "checked" : ""} /><i></i></span></label>`;
  const fld = (label, ctl, title) => `<label class="v3-set-f" title="${title}"><span>${label}</span>${ctl}</label>`;
  const setH = `<div class="v3-set-g"><div class="v3-set-h">Prestanda</div>`
    + fld("Trianglar", sel("v3LayCap", [["", `Auto (${(l3bAutoTris() / 1e6).toFixed(0)} milj.)`], ...L3B_CAPS.map(c => [String(c), `${c} milj.`])], P.triCap || ""), "Högsta antal trianglar för alla modeller tillsammans. Högre visar mer av stora modeller men kräver mer minne – för högt kan få fliken att stängas på en dator med lite minne. Gäller modeller som läses in efter att du ändrat.")
    + fld("Punkter per moln", sel("v3LayPcBudget", [["", `Auto (${typeof lowMemDevice !== "undefined" && lowMemDevice ? "1,5" : "6"} milj.)`], ["1000000", "1 milj."], ["3000000", "3 milj."], ["6000000", "6 milj."], ["10000000", "10 milj."], ["20000000", "20 milj."], ["50000000", "50 milj."], ["100000000", "100 milj."], ["all", "Full upplösning"]], P.pcBudget || ""), "Högsta antal punkter per punktmoln. Hela molnet visas alltid – glesare med en lägre siffra. Full upplösning läser varje punkt (upp till vad datorns minne klarar); medan du rör vyn ritas en glesare kopia så att det går lätt. Gäller moln som läses in efter att du ändrat.")
    + `</div><div class="v3-set-g"><div class="v3-set-h">Mobil</div>`
    + chk("v3LayLight", P.mobileCopy !== false, "Lätt kopia för iPhone/iPad", "", "När datorn läst in en modell sparas en lätt kopia av geometrin (utan egenskaper) i datalagret – inte i Trimble Connect. iPhone/iPad läser den i stället för IFC-filen.")
    + `</div>`;
  const mhPre = mh;
  if (P.laySort === "tree" && !l3lay.root && noTc) mh += `<div class="v3-pal-hint">Lägesplanen har ingen kontakt med Trimble Connect här. På iPhone/iPad öppnas den i Safari, utan 4D-planering, så mapparna går bara att bläddra i på datorn. Modellerna som är sparade för mobilen finns under Hämtade 3D-modeller.</div>`;
  else if (l3lay.err && !noTc) mh += `<div class="v3-pal-hint bad">${esc(l3lay.err)}</div><button type="button" class="v3-wide" id="v3LayRetry">Försök igen</button>`;
  if (browse && bk !== "models") { tb += mh.slice(mhPre.length); mh = mhPre; }
  // 3D-modeller överst (Victor 2026-10-10): flikarna Hämtade 3D-modeller (de inlästa) och Trimble Connect mapp.
  const sortNow = P.laySort || "list";
  const addItems = (noTc ? "" : `<button type="button" id="v3LayTcOn" title="De IFC-modeller som är tända i Trimble Connect just nu">Hämta tända modeller från Trimble Connect</button><button type="button" data-l3l-browse="1" title="Projektets mappar i Trimble Connect – IFC, DXF och punktmoln">Bläddra i Trimble Connect…</button>`)
    + `<button type="button" id="v3IfcLocal" title="IFC-fil från datorn – utan Trimble Connect">IFC från datorn…</button><button type="button" id="v3PcFile" title="LAS, LAZ, XYZ/PTS/TXT eller PLY från datorn (även över 2 GB)">Punktmoln från datorn…</button>`;
  // Modellerna och punktmolnen visas direkt; Trimble Connects mappar nås via ＋ (Victor 2026-10-12: "Hämtade och
  // trimble connect måste tonas ner … man kommer åt dom bara när man trycker på plusknappen").
  const tcBar = sortNow === "tree" && bk === "models" ? l3lTreeBar("models") : "";
  const mdlMenu = `<div class="v3-pcs" data-keep="1">
    <div class="v3-set-h">Visning</div>
    ${chk("v3MdlEdges", !!P.mdlEdges, "Kanter", "markerar konturer", "Ritar kanterna på modellerna (inte vid släta ytor). Bara för mindre modeller – stora blir för tunga.")}
    <label class="v3-pcs-r v3-pcs-g" title="Hur skarp en vinkel ska vara för att få en kant"><span>Kantvinkel</span><output>${P.mdlEdgeAng || 30}°</output><input type="range" id="v3MdlAng" min="5" max="80" step="5" value="${P.mdlEdgeAng || 30}" /></label>
    <label class="v3-pcs-r v3-pcz-r"><span>Kantfärg</span><input type="color" id="v3MdlCol" value="${P.mdlEdgeCol || "#1e293b"}" /></label>
    <label class="v3-pcs-r v3-pcs-g" title="Genomskinlighet för alla modeller – se igenom byggnaden"><span>Täckning</span><output>${P.mdlOp || 100} %</output><input type="range" id="v3MdlOp" min="10" max="100" step="5" value="${P.mdlOp || 100}" /></label>
    ${chk("v3MdlGray", !!P.mdlGray, "Enfärgad grå", "ritningsfärger av", "Modellerna i en enda grå ton – bra när punktmoln, kartor eller färgade objekt ska synas tydligt.")}
    <div class="v3-set-h">Prestanda</div>
    ${chk("v3PerfLod", P.lod !== false, "Förenklad bild vid rörelse", "små objekt göms medan du snurrar", "I stora modeller ritas bara objekt som är större än några bildpunkter medan kameran rör sig – allt syns igen en stund efter att du släppt. Inget ändras i modellen. Slå av om du vill se allt hela tiden (tyngre).")}
    ${chk("v3PerfAA", P.aa !== false, "Kantutjämning", "av = snabbare (gäller nästa gång 3D öppnas)", "Jämnare kanter kostar grafikkortet mycket i stora modeller. Av ger tydligt fler bilder per sekund; ändringen gäller nästa gång 3D-vyn öppnas.")}
    <div class="v3-set-h">Inläsning <em style="font-weight:400">(läses om)</em></div>
    ${chk("v3LayDetails", P.ifcDetails !== false, "Detaljer", "installationer, fästdon", "Armering, inredning, installationer (rör, kanaler, el) och fästdon. Ofta en stor del av modellen – av gör inläsningen snabbare. Inlästa modeller läses om.")}
    ${chk("v3LayRebar", !!P.ifcRebar, "Armering", "mycket långsammare", "Armeringsjärn och nät. Ofta tiotusentals objekt och det tyngsta i en byggmodell – kan göra att stora modeller inte orkar läsas in.")}
    ${chk("v3LayVoids", !!P.ifcVoids, "Urtag", "hål i väggar, långsammare", "Fönster- och dörrhål sågas ut ur väggar och bjälklag. Gör inläsningen av stora modeller många gånger långsammare – gäller modeller som läses in efter att du ändrat.")}
    <button type="button" class="v3-link" id="v3MdlReset">Återställ visningen</button></div>`;
  const modelsSec = l3lSec("models", "3D-modeller", `${tcBar}${mh}`, l3lMenu("mdlset", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>', "Visning av 3D-modeller", mdlMenu) + l3lMenu("models", "＋", "Lägg till modell eller punktmoln", addItems) + l3lSw("models", "Tänd/släck alla 3D-modeller"));
  const pcSec = typeof l3pcHtml === "function" ? l3lSec("pc", "PUNKTMOLN", (bk === "pc" ? tb : "") + l3pcHtml(row, esc), l3lay.pcExtra || "", l3pcCount() || null) : "";
  h = h.replace("<!--l3l-models-->", modelsSec + pcSec).replace("<!--l3l-tb-site2d-->", bk === "site2d" ? tb : "");
  if (typeof l3mapBody === "function") h += l3lSec("map", "BAKGRUNDSKARTA", l3mapBody(), l3lMenu("mapset", '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>', "Inställningar för kartan", l3mapSettingsHtml()) + `<label class="v3-lay-sw" title="Visa karta/satellit under modellerna"><input type="checkbox" data-lmapsw="1" ${l3Prefs().mapOn === true ? "checked" : ""} role="switch" aria-label="Bakgrundskarta" /><i></i></label>`);
  h += l3lSec("settings", "Inställningar", setH);
  host.innerHTML = h;
  if (q) {
    host.querySelectorAll(".v3-lsec-b .v3-lr, .v3-lsec-b .v3-lr-dir").forEach(r => { r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"; });
    host.querySelectorAll(".v3-lsec").forEach(s => { const any = [...s.querySelectorAll(".v3-lr, .v3-lr-dir")].some(r => r.style.display !== "none"); s.style.display = any ? "" : "none"; });
    if (![...host.querySelectorAll(".v3-lsec")].some(s => s.style.display !== "none")) host.insertAdjacentHTML("beforeend", `<div class="v3-pal-hint">Inget lager matchar "${esc(l3lay.q)}". (Filer i mappar som inte är öppnade söks inte.)</div>`);
  }
  const lq = host.querySelector("#v3LayQ");
  if (lq) lq.oninput = () => { l3lay.q = lq.value; const pos = lq.selectionStart; l3LayersRender(); const n = document.getElementById("v3LayQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  host.querySelectorAll("[data-lsec-t]").forEach(b => { b.onclick = () => {
    const id = b.dataset.lsecT;
    if (id === "settings") { l3SetPref("layAdv", !l3Prefs().layAdv); l3LayersRender(); return; }
    const c = new Set(l3Prefs().layClosed || []); if (c.has(id)) c.delete(id); else c.add(id); l3SetPref("layClosed", [...c]); l3LayersRender();
  }; });
  host.querySelectorAll("[data-lsw]").forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => l3lMaster(c.dataset.lsw, c.checked); });
  host.querySelectorAll("[data-l3l-model]").forEach(b => { const n = b.closest(".v3-lr") && b.closest(".v3-lr").querySelector(".v3-lr-n"); if (n) { n.classList.add("v3-lr-pick2"); n.onclick = () => l3lGlow(b.dataset.l3lModel); b.closest(".v3-lr").classList.toggle("glow", l3lay.glow === b.dataset.l3lModel); } });
  host.querySelectorAll("[data-pcfile2]").forEach(b => { b.onclick = () => { if (typeof l3pcFromFile === "function") l3pcFromFile(); }; });
  host.querySelectorAll("[data-lsub-t]").forEach(b => { b.onclick = () => { const c = new Set(l3Prefs().layClosed || []), k = "sub:" + b.dataset.lsubT; if (c.has(k)) c.delete(k); else c.add(k); l3SetPref("layClosed", [...c]); l3LayersRender(); }; });
  { const b = host.querySelector("#v3IfcLocal"); if (b) b.onclick = () => { if (typeof lokalFilVal === "function") lokalFilVal(".ifc,.ifczip", true, f => lokalFilOppna(f)); }; }
  host.querySelectorAll("[data-l3l-pickdxf]").forEach(b => { b.onclick = () => { const i = host.querySelector("#v3SDxfIn"); if (i) i.click(); }; });
  host.querySelectorAll("[data-l3l-browse]").forEach(b => { b.onclick = () => { const k = b.dataset.l3lBrowse === "1" ? "models" : b.dataset.l3lBrowse; l3SetPref("laySort", "tree"); l3SetPref("layBrowse", k); const c = new Set(l3Prefs().layClosed || []); c.delete(k); l3SetPref("layClosed", [...c]); l3LayersRender(); }; });
  l3lMenusBind(host);
  const fold = host.querySelector("#v3LayFold");
  if (fold) fold.onclick = () => {
    // Inställningar räknas inte: "fäll ut alla" öppnar bara lagren.
    const c = new Set(l3Prefs().layClosed || []), secs = L3L_SECS.filter(id => id !== "settings"), shut = secs.every(id => c.has(id));
    secs.forEach(id => (shut ? c.delete(id) : c.add(id)));
    if (!shut) { l3SetPref("layAdv", false); l3lay.open.clear(); if (typeof l3s !== "undefined") { l3s.open.clear(); l3s.fold = new Set(["*"]); } } else if (typeof l3s !== "undefined") l3s.fold = new Set();
    l3SetPref("layClosed", [...c]); l3LayersRender();
  };
  const rt = host.querySelector("#v3LayRetry");
  if (rt) rt.onclick = () => { l3lay.err = ""; l3lay.rootTried = true; l3lOpenDir(null); };

  host.querySelectorAll("[data-l3l]").forEach(b => { b.onclick = () => l3lToggle(b.dataset.l3l); });
  host.querySelectorAll("[data-l3m-eye]").forEach(b => { b.onclick = () => l3mToggle(); });
  host.querySelectorAll("[data-l3k-eye]").forEach(b => { b.onclick = () => l3kToggle(); });
  host.querySelectorAll("[data-l3ph-eye]").forEach(b => { b.onclick = () => l3phToggle(); });
  host.querySelectorAll("[data-l3ph-add]").forEach(b => { b.onclick = () => l3phAdd(); });
  host.querySelectorAll("[data-l3k-signs]").forEach(b => { b.onclick = () => { l3SetPref("cSigns", !l3kSigns()); l3kDraw(); }; });
  host.querySelectorAll("[data-l3l-texp]").forEach(b => { b.onclick = () => { const t = b.dataset.l3lTexp; l3lay.texp.has(t) ? l3lay.texp.delete(t) : l3lay.texp.add(t); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-obj]").forEach(b => { b.onclick = () => { const id = b.dataset.l3lObj; l3lSetIdsVisible([id], l3.hidden.has(id)); if (typeof l3UpdateHidden === "function") l3UpdateHidden(); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-osel]").forEach(b => {
    b.onclick = e => { const id = b.dataset.l3lOsel; if (e.shiftKey || e.ctrlKey || e.metaKey) { const s = new Set(l3.sel); s.has(id) ? s.delete(id) : s.add(id); l3SelectIds([...s]); } else l3SelectIds([id]); l3LayersRender(); };
    b.ondblclick = () => { l3SelectIds([b.dataset.l3lOsel]); l3View("sel"); };
  });
  host.querySelectorAll("[data-l3l-tsel]").forEach(b => { b.onclick = () => { const t = types.find(x => x.type === b.dataset.l3lTsel); if (t) { l3SelectIds(t.ids.filter(id => !l3.hidden.has(id))); l3LayersRender(); } }; });
  const csv = host.querySelector("#v3LayCsv"); if (csv) csv.onclick = () => l3ExportCsv();
  host.querySelectorAll("[data-l3l-type]").forEach(b => { b.onclick = () => { const t = types.find(x => x.type === b.dataset.l3lType); if (t) { l3lSetIdsVisible(t.ids, !l3lTypeOn(t)); l3LayersRender(); } }; });
  host.querySelectorAll("[data-l3l-rem]").forEach(b => { b.onclick = () => l3lLoadRemembered(b.dataset.l3lRem); });
  host.querySelectorAll("[data-l3l-lt]").forEach(b => { b.onclick = () => l3lLoadLight(b.dataset.l3lLt); });
  if (typeof l3pcBind === "function") l3pcBind(host);
  host.querySelectorAll("[data-pc-tc]").forEach(b => { b.onclick = async () => {
    const fid = b.dataset.pcTc, items = l3lay.folders.get(b.dataset.parent) || [], f = items.find(x => x.id === fid);
    l3lay.loading.add("pc:" + fid); l3LayersRender();
    try { await l3pcFromTc(fid, b.dataset.name, f, b.dataset.parent); } finally { l3lay.loading.delete("pc:" + fid); l3LayersRender(); }
  }; });
  host.querySelectorAll("[data-l3l-forget]").forEach(b => { b.onclick = () => l3lForget(b.dataset.l3lForget); });
  host.querySelectorAll("[data-l3l-model]").forEach(b => { b.onclick = () => { const m = l3b.models.find(x => x.id === b.dataset.l3lModel); if (m) { l3bShow(m.id, !m.visible); l3RenderLegend(); l3Render(); l3LayersRender(); } }; });
  host.querySelectorAll("[data-l3l-place]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3bPlaceDialog(b.dataset.l3lPlace); }; });
  host.querySelectorAll("[data-l3l-dxfdel]").forEach(b => { b.onclick = async () => { const r = cads().find(x => x.id === b.dataset.l3lDxfdel); if (!r) return; await deleteCad(r); l3sRefresh(0); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-dxfzoom]").forEach(b => { b.onclick = () => l3sZoomCad(b.dataset.l3lDxfzoom); });
  host.querySelectorAll("[data-l3l-zoom]").forEach(b => { b.onclick = () => l3lZoomModel(b.dataset.l3lZoom); });
  host.querySelectorAll("[data-l3l-save]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await l3bmSave(b.dataset.l3lSave); } catch (e) { /* statusraden */ } l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-sort]").forEach(b => { b.onclick = () => { l3SetPref("laySort", b.dataset.l3lSort); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-dir]").forEach(b => { b.onclick = () => l3lOpenDir(b.dataset.l3lDir); });
  host.querySelectorAll("[data-l3l-file]").forEach(b => { b.onclick = () => l3lFile(b.dataset.l3lFile, b.dataset.name); });
  host.querySelectorAll("[data-l3l-dxf]").forEach(b => { const n = b.closest(".v3-lr") && b.closest(".v3-lr").querySelector(".v3-lr-n"); if (n && b.dataset.cad) { n.classList.add("v3-lr-pick2"); n.onclick = () => { l3ssSelect({ kind: "cad", id: b.dataset.cad }); l3ssFlash({ kind: "cad", id: b.dataset.cad }); }; } });
  host.querySelectorAll("[data-l3l-dxf]").forEach(b => { b.onclick = () => { if (b.dataset.cad) { const k = "cad:" + b.dataset.cad; setLayersVisible([k], !ls(k).visible); l3sRefresh(0); l3LayersRender(); } else l3sDxfFromTc(b.dataset.l3lDxf, b.dataset.name); }; });
  if (typeof l3sBind === "function") l3sBind(host);
  if (typeof l3mapBind === "function") l3mapBind(host);
  if (typeof l3lyBind === "function") l3lyBind(host);
  const op = host.querySelector('[data-l3l-op="plan"]');
  if (op) op.oninput = () => { l3SetPref("planOp", Number(op.value)); l3lApplyPlanOp(); l3Render(); };
  const pl = host.querySelector("#v3PerfLod"); if (pl) pl.onchange = () => { l3SetPref("lod", pl.checked); if (!pl.checked && typeof l3lodApply === "function") { l3lodApply(-1); l3Render(); } l3Status(pl.checked ? "Förenklad bild vid rörelse är på." : "Förenklad bild vid rörelse är av."); };
  const pa = host.querySelector("#v3PerfAA"); if (pa) pa.onchange = () => { l3SetPref("aa", pa.checked); l3Status(`Kantutjämning ${pa.checked ? "på" : "av"} – gäller nästa gång 3D-vyn öppnas (ladda om sidan).`); };
  const de = host.querySelector("#v3LayDetails");
  if (de) de.onchange = () => {
    l3SetPref("ifcDetails", de.checked);
    // De inlästa modellerna läses om direkt (ur webbläsarens kopia av filen – ingen ny hämtning från TC).
    const ms = l3b.models.filter(m => m.src);
    l3Status(`${de.checked ? "Detaljer visas" : "Detaljer hoppas över"}${ms.length ? ` – ${ms.map(m => m.name).join(", ")} läses in igen` : " i modeller som läses in härefter"}.`);
    if (ms.length) l3bLoad(ms.map(m => m.src), { replace: true });
  };
  const lc = host.querySelector("#v3LayLight");
  if (lc) lc.onchange = () => { l3SetPref("mobileCopy", lc.checked); l3Status(lc.checked ? "Lätta kopior för mobilen sparas när modeller läses in." : "Inga nya lätta kopior för mobilen sparas."); if (lc.checked && typeof l3ltEnsure === "function") l3b.models.forEach(m => m.src && l3ltEnsure(m.src, m).catch(() => {})); };
  const en = host.querySelector("#v3LayEngine");
  if (en) en.onchange = () => {
    l3SetPref("ifcEngine", en.value);
    const ms = l3b.models.filter(m => m.src);
    l3Status(`Läsare: ${en.value === "lite" ? "ifc-lite för hela modellen" : "web-ifc, ifc-lite för det som saknas"}${ms.length ? ` – ${ms.map(m => m.name).join(", ")} läses in igen` : " – gäller modeller som läses in härefter"}.`);
    if (ms.length) l3bLoad(ms.map(m => m.src), { replace: true });
  };
  const rb = host.querySelector("#v3LayRebar");
  if (rb) rb.onchange = () => {
    l3SetPref("ifcRebar", rb.checked);
    const ms = l3b.models.filter(m => m.src);
    l3Status(`${rb.checked ? "Armeringen visas" : "Armeringen hoppas över"}${ms.length ? ` – ${ms.map(m => m.name).join(", ")} läses in igen` : " i modeller som läses in härefter"}.`);
    if (ms.length) l3bLoad(ms.map(m => m.src), { replace: true });
  };
  const vo = host.querySelector("#v3LayVoids");
  if (vo) vo.onchange = () => { l3SetPref("ifcVoids", vo.checked); l3Status(vo.checked ? "Urtag visas i modeller som läses in härefter (långsammare)." : "Urtag hoppas över i modeller som läses in härefter (snabbare)."); };
  const pcb = host.querySelector("#v3LayPcBudget");
  if (pcb) pcb.onchange = () => {
    l3SetPref("pcBudget", pcb.value === "all" ? "all" : pcb.value ? Number(pcb.value) : null);
    const all = pcb.value === "all";
    l3Status(all ? `Full upplösning: varje punkt läses (högst ${l3pcMil(l3pcMaxPts())} punkter per moln efter datorns minne). Stora moln tar en stund att läsa och sparas inte i webbläsaren. Gäller moln som läses in härefter – tryck på molnets ⋯ → Läs in igen.` : "Punkter per punktmoln ändrat – gäller moln som läses in härefter (molnets ⋯ → Läs in igen).");
  };
  { const g = id => host.querySelector("#" + id) || document.querySelector("#view3d > .v3-ldd-m #" + id), out = el => el.parentElement.querySelector("output");
    const ed = g("v3MdlEdges"); if (ed) ed.onchange = () => { l3SetPref("mdlEdges", ed.checked); l3bViewApply(true); };
    const an = g("v3MdlAng"); if (an) { an.oninput = () => { out(an).textContent = an.value + "°"; }; an.onchange = () => { l3SetPref("mdlEdgeAng", Number(an.value)); l3bViewApply(true); }; }
    const co = g("v3MdlCol"); if (co) co.oninput = () => { l3SetPref("mdlEdgeCol", co.value); l3bViewApply(true); };
    const op = g("v3MdlOp"); if (op) { op.oninput = () => { out(op).textContent = op.value + " %"; l3SetPref("mdlOp", Number(op.value)); l3bViewApply(); }; }
    const gr = g("v3MdlGray"); if (gr) gr.onchange = () => { l3SetPref("mdlGray", gr.checked); l3bViewApply(); };
    const rs = g("v3MdlReset"); if (rs) rs.onclick = () => { ["mdlEdges", "mdlEdgeAng", "mdlEdgeCol", "mdlOp", "mdlGray"].forEach(k => l3SetPref(k, null)); l3bViewApply(true); }; }
  const cap = host.querySelector("#v3LayCap");
  if (cap) cap.onchange = () => {
    l3SetPref("triCap", cap.value ? Number(cap.value) : null);
    const cut = l3b.models.filter(m => m.capped && m.src);
    l3Status(`Taket är ${(l3bMaxTris() / 1e6).toFixed(0)} miljoner trianglar.${cut.length ? ` ${cut.map(m => m.name).join(", ")} läses in igen.` : " Gäller modeller som läses in härefter."}`);
    if (cut.length) l3bLoad(cut.map(m => m.src), { replace: true });
  };
  const tcOn = host.querySelector("#v3LayTcOn");
  if (tcOn) tcOn.onclick = () => { if (typeof l3bOpenDialog === "function") l3bOpenDialog("v3LayBldgBox"); };
  // Rotmappen hämtas en gång (Försök igen i felraden om det misslyckas).
  if (P.laySort === "tree" && !l3lay.root && !l3lay.rootTried && (typeof bridgeOk !== "function" || bridgeOk())) { l3lay.rootTried = true; l3lOpenDir(null); }
}

/* Mappträdet: mappar fälls ut/ihop, IFC-filer har ett öga. */
function l3lTreeBar(kind) {
  const t = { pc: "punktmoln (LAS, LAZ, E57 …)", site2d: "DXF och DWG", models: "" }[kind] || "";
  return `<div class="v3-lay-tcbar"><button type="button" class="v3-link" data-l3l-sort="list" title="Tillbaka">‹ Tillbaka</button><span>Trimble Connect${t ? " – " + t : ""}</span></div>`;
}
function l3lTreeHtml(id, depth) {
  const esc = escHtml;
  if (!id) return l3lay.loading.has("root") ? `<div class="v3-pal-hint">Hämtar projektets mappar…</div>` : "";
  const items = l3lay.folders.get(id) || [];
  const dirs = items.filter(x => x.type === "folder"), files = items.filter(x => x.type === "file" && L3L_EXT.test(x.name) && (!l3lay.kind || l3lay.kind === "models" || (l3lay.kind === "pc" ? /\.(las|laz|xyz|pts|ply|e57)$/i : /\.(dxf|dwg)$/i).test(x.name)));
  const pad = `style="padding-left:${4 + depth * 12}px"`;
  let h = "";
  dirs.forEach(d => {
    const open = l3lay.open.has(d.id), busy = l3lay.loading.has(d.id);
    h += `<button type="button" class="v3-lr-dir" data-l3l-dir="${esc(d.id)}" aria-expanded="${open}" ${pad}><span class="v3-lr-n" title="${esc(d.name)}">${esc(d.name)}</span>${busy ? '<span class="pm-spin"></span>' : ""}</button>`;
    if (open) h += l3lTreeHtml(d.id, depth + 1);
  });
  files.forEach(f => {
    // Punktmoln (samma LAS/LAZ/E57-filer som Reality Capture tar emot): tryck = läs in och visa.
    if (typeof L3PC_EXT !== "undefined" && L3PC_EXT.test(f.name)) {
      const c = l3pc.clouds.find(x => x.id === "pc:f:" + f.id), busy = l3lay.loading.has("pc:" + f.id), e57 = /\.e57$/i.test(f.name);
      h += `<div class="v3-lr" ${pad}><button type="button" class="v3-eye ${c && c.visible ? "on" : ""}" data-pc-tc="${esc(f.id)}" data-name="${esc(f.name)}" data-parent="${esc(id)}" title="${e57 ? "E57 – exportera till LAZ/LAS för att visa här" : c ? (c.visible ? "Släck" : "Tänd") : "Läs in punktmolnet och visa"}">${busy ? '<span class="pm-spin"></span>' : l3lEye(!!(c && c.visible))}</button><span class="v3-lr-n" title="${esc(f.name)}">☁ ${esc(f.name)}</span>${c ? `<button type="button" class="v3-lr-zoom" data-pc-zoom="${esc(c.id)}" title="Zooma till molnet">${L3_ICO.focus}</button><em class="v3-lr-k">${l3pcMil(c.info.n)}</em>` : f.size ? `<em class="v3-lr-k">${typeof pmBytes === "function" ? pmBytes(f.size) : ""}${e57 ? " · E57" : ""}</em>` : ""}</div>`;
      return;
    }
    if (/\.(dxf|dwg)$/i.test(f.name)) {
      const cad = typeof cads === "function" ? cads().find(r => r.name === f.name.replace(/\.(dxf|dwg)$/i, "")) : null, on = cad && ls("cad:" + cad.id).visible;
      h += `<div class="v3-lr" ${pad}><button type="button" class="v3-eye ${on ? "on" : ""}" data-l3l-dxf="${esc(f.id)}" data-name="${esc(f.name)}" data-cad="${cad ? esc(cad.id) : ""}" title="${cad ? (on ? "Släck" : "Tänd") : "Läs in som CAD-lager" + (/\.dwg$/i.test(f.name) ? " (DWG, experimentellt)" : "")}">${l3lEye(!!on)}</button><span class="v3-lr-n" title="${esc(f.name)}">${esc(f.name)}</span>${cad ? `<button type="button" class="v3-lr-zoom" data-l3l-dxfzoom="${esc(cad.id)}" title="Zooma till ritningen">${L3_ICO.focus}</button><button type="button" class="v3-lr-zoom v3-lr-del" data-l3l-dxfdel="${esc(cad.id)}" title="Ta bort den inlästa ritningen från lägesplanen (originalet i Trimble Connect rörs inte)">${L3_ICO.trash}</button>` : ""}<em class="v3-lr-k">DXF</em></div>`;
      return;
    }
    const m = l3b.models.find(x => x.id === "f:" + f.id), busy = l3lay.loading.has(f.id);
    h += `<div class="v3-lr" ${pad}><button type="button" class="v3-eye ${m && m.visible ? "on" : ""}" data-l3l-file="${esc(f.id)}" data-name="${esc(f.name)}" title="${m ? (m.visible ? "Släck" : "Tänd") : "Läs in och visa"}">${busy ? '<span class="pm-spin"></span>' : l3lEye(!!(m && m.visible))}</button><span class="v3-lr-n" title="${esc(f.name)}">${esc(f.name)}</span>${m ? `<button type="button" class="v3-lr-zoom" data-l3l-zoom="${esc(m.id)}" title="Zooma till modellen">${L3_ICO.focus}</button>` : ""}${m ? `<em class="v3-lr-k">${(m.tris / 1000).toFixed(0)}k</em>` : f.size ? `<em class="v3-lr-k">${typeof pmBytes === "function" ? pmBytes(f.size) : ""}</em>` : ""}</div>`;
  });
  if (!dirs.length && !files.length && l3lay.folders.has(id)) h += `<div class="v3-pal-hint" ${pad}>Inga IFC-, DXF- eller punktmolnsfiler här.</div>`;
  return h;
}
async function l3lOpenDir(id) {
  if (id && l3lay.open.has(id)) { l3lay.open.delete(id); l3LayersRender(); return; }
  if (id) l3lay.open.add(id);
  if (id && l3lay.folders.has(id)) { l3LayersRender(); return; }
  const key = id || "root";
  l3lay.loading.add(key); l3lay.err = ""; l3LayersRender();
  try {
    const r = await askOpener("tcFolder", { folderId: id }, 30000);
    if (!r || !r.folderId) throw new Error("inget svar med mappar");
    if (!id) { l3lay.root = r.folderId; l3lay.project = r.projectName || ""; }
    l3lay.folders.set(r.folderId, r.items || []);
  } catch (e) { l3lay.err = `Kunde inte läsa mapparna i Trimble Connect: ${e.message}`; if (id) l3lay.open.delete(id); }
  l3lay.loading.delete(key); l3LayersRender();
}
/* En modell som datorn sparat för mobilen (lätt kopia i datalagret) tänds – utan Trimble Connect. */
async function l3lLoadLight(key) {
  const e = ((typeof l3lt !== "undefined" && l3lt.list) || []).find(x => x.key === key); if (!e) return;
  if (l3lay.loading.has(key) || l3b.busy) { l3Status("Vänta tills den andra modellen är inläst."); return; }
  const w = key.startsWith("f:") ? { id: key, fileId: key.slice(2), name: e.name, version: e.version } : { id: key, name: e.name, version: e.version };
  l3lay.loading.add(key); l3LayersRender();
  try { await l3bLoad([w]); }
  finally { l3lay.loading.delete(key); l3RenderLegend(); l3Render(); l3LayersRender(); }
}
/* En sparad, släckt modell tänds: läses in (ur cachen om den finns). */
async function l3lLoadRemembered(id) {
  const w = l3bRememberedAll().find(x => x.id === id); if (!w) return;
  if (l3lay.loading.has(id) || l3b.busy) { l3Status("Vänta tills den andra modellen är inläst."); return; }
  l3lay.loading.add(id); l3LayersRender();
  try { const { on, ...src } = w; await l3bLoad([{ ...src, on: true }]); }
  finally { l3lay.loading.delete(id); l3RenderLegend(); l3Render(); l3LayersRender(); }
}
async function l3lForget(id) {
  const m = l3b.models.find(x => x.id === id), w = l3bRememberedAll().find(x => x.id === id), name = (m || w || {}).name || "modellen";
  const pend = m && typeof l3bmPending === "function" ? l3bmPending(m.id) : 0;
  if (pend && !(await uiConfirm(`${name} har ${pend} flyttade objekt som inte är sparade. Ta bort den ändå? Flyttarna försvinner.`, { ok: "Ta bort" }))) return;
  l3bForget(id);
  if (typeof l3bm !== "undefined" && l3bm.edits) l3bm.edits.delete(id); // osparade flyttar i den

  l3Status(`${name} är borttagen från Hämtade 3D-modeller. Inget i Trimble Connect ändrades – den kan hämtas igen under Trimble Connect mapp.`);
  l3RenderLegend(); l3Render(); l3LayersRender();
  if (typeof l3RenderSide === "function") l3RenderSide();
}
async function l3lFile(fileId, name) {
  const id = "f:" + fileId, m = l3b.models.find(x => x.id === id);
  if (m) { l3bShow(id, !m.visible); l3RenderLegend(); l3Render(); l3LayersRender(); return; }
  if (l3lay.loading.has(fileId) || l3b.busy) { l3Status("Vänta tills den andra modellen är inläst."); return; }
  l3lay.loading.add(fileId); l3LayersRender();
  let f = {}, parentId = null;
  l3lay.folders.forEach((items, fid) => { const x = items.find(y => y.id === fileId); if (x) { f = x; parentId = fid; } });
  try { await l3bLoad([{ id, fileId, name, on: true, parentId, version: f.versionId || (f.modified ? String(f.modified) : "") }]); }
  finally { l3lay.loading.delete(fileId); l3RenderLegend(); l3Render(); l3LayersRender(); }
}
function l3lToggle(k) {
  const P = l3Prefs();
  if (k === "plan") {
    const v = !P.plan;
    l3SetPref("plan", v);
    if (l3.planMesh) l3.planMesh.visible = v;
    const c = document.getElementById("v3ShowPlan"); if (c) c.checked = v;
    l3lApplyPlanOp();
  } else if (k === "objs") {
    const on = P.objs !== "hidden";
    if (on) l3SetPref("objsLast", P.objs);
    if (typeof l3SetObjMode === "function") l3SetObjMode(on ? "hidden" : (P.objsLast && P.objsLast !== "hidden" ? P.objsLast : "solid"));
    document.querySelectorAll("[data-v3objs]").forEach(b => b.classList.toggle("on", b.dataset.v3objs === l3Prefs().objs));
  } else if (k === "etab") {
    const all = placements.map(p => p.id), on = l3lTypes().some(l3lTypeOn);
    l3lSetIdsVisible(all, !on);
  }
  l3Render(); l3LayersRender();
}
function l3lApplyPlanOp() {
  const m = l3 && l3.planMesh;
  if (!m || !m.material) return;
  const op = Math.max(0.1, Math.min(1, (l3Prefs().planOp || 100) / 100));
  m.material.transparent = op < 1; m.material.opacity = op; m.material.depthWrite = op >= 1; m.material.needsUpdate = true;
}

/* Dra i kanten för att bredda panelerna (bredden sparas). side: "right" = egenskapspanelen, "left" = biblioteket. */
function l3lResizable(el, pref, side, min, max) {
  if (!el || el.dataset.rs) return;
  el.dataset.rs = "1";
  const apply = w => { el.style.width = `${w}px`; if (side === "left") el.style.flexBasis = `${w}px`; };
  const saved = Number(l3Prefs()[pref]); if (saved) apply(Math.max(min, Math.min(max, saved)));
  // Greppet ligger bredvid panelen (panelen rullar) och följer dess kant.
  const host = el.parentElement || document.body;
  const hd = document.createElement("div");
  hd.className = `v3-rs v3-rs-${side}`; hd.title = "Dra för att ändra bredden (dubbelklick = standard)";
  host.appendChild(hd);
  const place = () => {
    const shown = !el.classList.contains("hidden") && el.offsetParent !== null && el.offsetWidth > 0 && getComputedStyle(el).display !== "none";
    hd.classList.toggle("hidden", !shown);
    if (!shown) return;
    hd.style.top = `${el.offsetTop}px`; hd.style.height = `${el.offsetHeight}px`; hd.style.bottom = "auto";
    hd.style.left = `${side === "right" ? el.offsetLeft - 3 : el.offsetLeft + el.offsetWidth - 3}px`; hd.style.right = "auto";
  };
  new ResizeObserver(place).observe(el);
  new MutationObserver(place).observe(el, { attributes: true, attributeFilter: ["class", "style"] });
  window.addEventListener("resize", place);
  hd.onpointerdown = e => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = el.getBoundingClientRect().width;
    hd.setPointerCapture(e.pointerId); hd.classList.add("drag");
    const mv = ev => { apply(Math.max(min, Math.min(max, w0 + (side === "right" ? x0 - ev.clientX : ev.clientX - x0)))); place(); };
    const up = () => { hd.classList.remove("drag"); hd.removeEventListener("pointermove", mv); hd.removeEventListener("pointerup", up); l3SetPref(pref, Math.round(el.getBoundingClientRect().width)); if (typeof l3Resize === "function") l3Resize(); l3Render(); };
    hd.addEventListener("pointermove", mv); hd.addEventListener("pointerup", up);
  };
  hd.ondblclick = () => { el.style.width = ""; el.style.flexBasis = ""; l3SetPref(pref, 0); place(); if (typeof l3Resize === "function") l3Resize(); l3Render(); };
  place();
}
/* Handtag nere i vänstra hörnet (Victor 2026-10-10: "justera storleken genom en dragable nere i vänster
   hörn"): drar bredd och höjd samtidigt. Sparas (sideW/sideH); dubbelklick = standard. */
function l3lCorner(el) {
  if (!el || el.dataset.rc) return;
  el.dataset.rc = "1";
  const host = el.parentElement || document.body;
  const maxH = () => host.clientHeight - el.offsetTop - 10;
  const applyH = h => { el.style.height = `${h}px`; el.style.maxHeight = "none"; };
  const savedH = Number(l3Prefs().sideH); if (savedH) applyH(Math.max(160, Math.min(maxH() > 200 ? maxH() : 2000, savedH)));
  // Handtaget ligger bredvid panelen (inte i den – panelen rullar) och följer dess hörn.
  const hd = document.createElement("div");
  hd.className = "v3-rc hidden"; hd.title = "Dra för att ändra storleken (dubbelklick = standard)";
  host.appendChild(hd);
  const place = () => {
    const shown = !el.classList.contains("hidden") && el.offsetParent !== null && el.offsetHeight > 0 && getComputedStyle(el).display !== "none";
    hd.classList.toggle("hidden", !shown);
    if (!shown) return;
    hd.style.left = `${el.offsetLeft}px`; hd.style.top = `${el.offsetTop + el.offsetHeight - 22}px`;
  };
  new ResizeObserver(place).observe(el);
  new MutationObserver(place).observe(el, { attributes: true, attributeFilter: ["class", "style"], childList: true });
  window.addEventListener("resize", place);
  hd.onpointerdown = e => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, r = el.getBoundingClientRect();
    hd.setPointerCapture(e.pointerId); hd.classList.add("drag");
    const mv = ev => {
      el.style.width = `${Math.max(240, Math.min(720, r.width + x0 - ev.clientX))}px`;
      applyH(Math.max(160, Math.min(maxH(), r.height + ev.clientY - y0)));
      place();
    };
    const up = () => { hd.classList.remove("drag"); hd.removeEventListener("pointermove", mv); hd.removeEventListener("pointerup", up); const b = el.getBoundingClientRect(); l3SetPref("sideW", Math.round(b.width)); l3SetPref("sideH", Math.round(b.height)); l3Render(); };
    hd.addEventListener("pointermove", mv); hd.addEventListener("pointerup", up);
  };
  hd.ondblclick = () => { el.style.width = ""; el.style.height = ""; el.style.maxHeight = ""; l3SetPref("sideW", 0); l3SetPref("sideH", 0); place(); l3Render(); };
  el.addEventListener("mouseenter", () => hd.classList.add("near")); el.addEventListener("mouseleave", () => hd.classList.remove("near"));
  place();
}
function l3LayersInit() {
  l3lResizable(document.getElementById("v3Side"), "sideW", "right", 240, 640);
  l3lCorner(document.getElementById("v3Side"));
  l3lResizable(document.getElementById("v3Pal"), "palW", "left", 170, 600);
}

/* Zooma till en inläst modell (släckt modell tänds först). */
function l3lZoomModel(id) {
  const m = l3b.models.find(x => x.id === id);
  if (!m) return;
  if (!m.visible) { l3bShow(m.id, true); l3RenderLegend(); l3LayersRender(); }
  const b = new THREE.Box3();
  m.meshes.forEach(x => { if (!x.geometry.boundingBox) x.geometry.computeBoundingBox(); x.updateMatrixWorld(true); b.union(x.geometry.boundingBox.clone().applyMatrix4(x.matrixWorld)); });
  if (b.isEmpty()) return;
  l3FlyTo(b.getCenter(new THREE.Vector3()), Math.max(6, b.getSize(new THREE.Vector3()).length() * 1.1));
  l3Status(`Zoomar till ${m.name}.`);
}
