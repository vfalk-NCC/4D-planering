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

const L3L_EXT = /\.(ifc|ifczip|dxf)$/i; // DXF blir ett CAD-lager (lagesplan-3dsite.js)
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
const L3L_SECS = ["models", "base", "plan", "site2d"];
const l3lClosed = () => new Set(l3Prefs().layClosed || []);
function l3lSec(id, title, body, extra = "") {
  const shut = l3lClosed().has(id) && !(l3lay.q || "").trim();
  return `<section class="v3-lsec ${shut ? "shut" : ""}" data-lsec="${id}"><div class="v3-lg v3-lsec-h"><button type="button" class="v3-lsec-t" data-lsec-t="${id}" aria-expanded="${!shut}"><i>›</i>${title}</button>${extra}</div>${shut ? "" : `<div class="v3-lsec-b">${body}</div>`}</section>`;
}
function l3LayersRender() {
  const host = document.getElementById("v3PalLayers");
  if (!host || !l3 || host.classList.contains("hidden")) return; // ritas när fliken visas
  const P = l3Prefs(), esc = escHtml;
  const row = (attrs, on, label, extra = "", cls = "") => `<div class="v3-lr ${cls}"><button type="button" class="v3-eye ${on ? "on" : ""}" ${attrs} title="${on ? "Släck" : "Tänd"}">${l3lEye(on)}</button><span class="v3-lr-n" title="${esc(label)}">${label}</span>${extra}</div>`;
  const types = l3lTypes(), etabOn = types.some(l3lTypeOn);
  const objsOn = P.objs !== "hidden";
  const allShut = L3L_SECS.every(id => l3lClosed().has(id));
  // Sök i lagermenyn (Victor 2026-10-10): filtrerar raderna, blocken visas utfällda medan man söker.
  const q = (l3lay.q || "").trim().toLowerCase();
  let h = `<div class="v3-lay-top"><input type="search" class="v3-pp-q" id="v3LayQ" placeholder="Sök lager, modell, DXF…" value="${esc(l3lay.q || "")}" /><button type="button" class="v3-link" id="v3LayFold" title="${allShut ? "Fäll ut alla block" : "Fäll ihop alla block"}">${allShut ? "Fäll ut alla" : "Fäll ihop alla"}</button></div><!--l3l-models-->`;
  h += l3lSec("base", "Underlag", `${row('data-l3l="plan"', !!P.plan, "Ritningen (PDF) som mark")}
    <div class="v3-lr-opr" title="Ritningens synlighet i 3D (genomskinlighet)"><input type="range" data-l3l-op="plan" min="10" max="100" step="5" value="${P.planOp || 100}" /></div>`);
  h += l3lSec("plan", "Planering och etablering", `${row('data-l3l="objs"', objsOn, "Planerade objekt (lådor)")}
    ${row('data-l3l="etab"', etabOn, `Etablering <em>${placements.length}</em>`, "", "v3-lr-b")}
    ${types.map(t => {
      // Varje typ går att fälla ut till sina objekt (Victor 2026-10-10: fliken Objekt var "kaka på kaka").
      const ex = l3lay.texp.has(t.type) || !!q;
      return row(`data-l3l-type="${esc(t.type)}"`, l3lTypeOn(t), `<i class="v3-lr-dot" style="background:${esc(t.color)}"></i><b class="v3-lr-tsel" data-l3l-tsel="${esc(t.type)}" title="Markera alla ${esc(t.label)}">${esc(t.label)}</b> <em>${t.ids.length}</em>`, `<button type="button" class="v3-lr-texp" data-l3l-texp="${esc(t.type)}" aria-expanded="${ex}" title="${ex ? "Fäll ihop" : "Visa objekten"}"><i>›</i></button>`, "v3-lr-sub")
        + (ex ? t.ids.map(id => { const p = placements.find(x => x.id === id); if (!p) return ""; const on = !l3.hidden.has(id); return `<div class="v3-lr v3-lr-obj ${l3.sel.has(id) ? "on" : ""}"><button type="button" class="v3-eye ${on ? "on" : ""}" data-l3l-obj="${esc(id)}" title="${on ? "Dölj" : "Visa"}">${l3lEye(on)}</button><button type="button" class="v3-lr-n v3-lr-pick" data-l3l-osel="${esc(id)}" title="Klick: markera (Skift = flera) · Dubbelklick: zooma">${esc(p.name || t.label)}</button></div>`; }).join("") : "");
    }).join("")}
    ${placements.length ? `<button type="button" class="v3-link v3-lay-csv" id="v3LayCsv" title="Lista över etableringen som öppnas i Excel (namn, typ, mått, läge, 4D)">Exportera etableringen som lista (Excel/CSV)</button>` : ""}
    ${typeof l3m !== "undefined" ? row('data-l3m-eye="1"', !(typeof l3mAllHidden === "function" && l3mAllHidden()), `Mått <em>${l3m.list.length}</em>`) : ""}
    ${typeof l3k !== "undefined" ? row('data-l3k-eye="1"', !l3k.hidden, `Kommentarer <em>${l3k.list.filter(c => !c.done).length}${l3k.list.some(c => c.done) ? ` + ${l3k.list.filter(c => c.done).length} klara` : ""}</em>`) + row('data-l3k-signs="1"', l3kSigns(), "Som skyltar i 3D", "", "v3-lr-sub") : ""}`);
  if (typeof l3sHtml === "function") { const s2 = l3sHtml(row, l3lEye); if (s2) h += l3lSec("site2d", "2D-lager och DXF", s2.body, s2.extra); }
  let mh = "";
  if ((P.laySort || "list") === "list") {
    const ms = l3b.models.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
    const pend = m => (typeof l3bmPending === "function" ? l3bmPending(m.id) : 0);
    // Även släckta, sparade modeller som inte är inlästa i den här sessionen står kvar (läses in när de tänds).
    const rest = (typeof l3bRememberedAll === "function" ? l3bRememberedAll() : []).filter(w => !l3b.models.some(m => m.id === w.id));
    const all = [...ms.map(m => ({ m, name: m.name })), ...rest.map(w => ({ w, name: w.name || "Modell" }))].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
    const del = id => `<button type="button" class="v3-lr-zoom v3-lr-del" data-l3l-forget="${esc(id)}" title="Ta bort från Hämtade 3D-modeller (inget i Trimble Connect ändras)">${L3_ICO.trash}</button>`;
    mh += all.length ? all.map(({ m, w, name }) => m
      ? row(`data-l3l-model="${esc(m.id)}"`, m.visible, esc(name), `<button type="button" class="v3-lr-zoom" data-l3l-zoom="${esc(m.id)}" title="Zooma till modellen">${L3_ICO.focus}</button>` + (pend(m) ? `<button type="button" class="v3-lr-save" data-l3l-save="${esc(m.id)}" title="Spara flyttarna som en ny IFC-fil i Trimble Connect">Spara ${pend(m)}</button>` : `<em class="v3-lr-k">${(m.tris / 1000).toFixed(0)}k</em>`) + del(m.id))
      : row(`data-l3l-rem="${esc(w.id)}"`, false, esc(name), (l3lay.loading.has(w.id) ? '<span class="pm-spin"></span>' : "") + del(w.id))).join("")
      : `<div class="v3-pal-hint">Inga modeller är hämtade än. Välj under Trimble Connect mapp eller hämta de som är tända i Trimble Connect.</div>`;
  } else mh += l3lTreeHtml(l3lay.root, 0);
  mh += `<button type="button" class="v3-wide" id="v3LayTcOn" title="De IFC-modeller som är tända i Trimble Connect just nu">Hämta tända modeller från TC…</button><div id="v3LayBldgBox"></div>`;
  // Sällan använt (Victor 2026-10-10: "flytta ner dessa under en avancerad flik"): ihopfällt längst ner.
  mh += `<details class="v3-lay-adv" ${P.layAdv ? "open" : ""}><summary>Avancerat</summary><label class="v3-chk v3-lay-voids" title="Armering, inredning, installationer (rör, kanaler, el) och fästdon. Ofta en stor del av modellen – gäller modeller som läses in efter att du ändrat."><input type="checkbox" id="v3LayDetails" ${P.ifcDetails !== false ? "checked" : ""} /> Visa detaljer (installationer, fästdon, beslag) – av: snabbare</label><label class="v3-chk v3-lay-voids" title="Armeringsjärn och nät. Ofta tiotusentals objekt och det tyngsta i en byggmodell – kan göra att stora modeller inte orkar läsas in."><input type="checkbox" id="v3LayRebar" ${P.ifcRebar ? "checked" : ""} /> Visa armering – mycket långsammare</label><label class="v3-chk v3-lay-voids" title="Fönster- och dörrhål sågas ut ur väggar och bjälklag. Gör inläsningen av stora modeller många gånger långsammare – gäller modeller som läses in efter att du ändrat."><input type="checkbox" id="v3LayVoids" ${P.ifcVoids ? "checked" : ""} /> Visa urtag (hål i väggar) – långsammare</label>`
    + `<label class="v3-chk v3-lay-voids" title="Högsta antal trianglar för alla modeller tillsammans. Högre visar mer av stora modeller men kräver mer minne – för högt kan få fliken att stängas på en dator med lite minne. Gäller modeller som läses in efter att du ändrat.">Tak för trianglar <select id="v3LayCap">${[["", `Auto (${(l3bAutoTris() / 1e6).toFixed(0)} milj.)`], ...L3B_CAPS.map(c => [String(c), `${c} miljoner`])].map(([v, l]) => `<option value="${v}" ${String(P.triCap || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></details>`;
  if (l3lay.err) mh += `<div class="v3-pal-hint bad">${esc(l3lay.err)}</div><button type="button" class="v3-wide" id="v3LayRetry">Försök igen</button>`;
  // 3D-modeller överst (Victor 2026-10-10): flikarna Hämtade 3D-modeller (de inlästa) och Trimble Connect mapp.
  const sortNow = P.laySort || "list";
  const modelsSec = l3lSec("models", "3D-modeller", `<div class="v3-segs v3-lay-sort"><button type="button" data-l3l-sort="list" class="${sortNow === "list" ? "on" : ""}" title="De modeller som är hämtade och visas, i bokstavsordning">Hämtade 3D-modeller</button><button type="button" data-l3l-sort="tree" class="${sortNow === "tree" ? "on" : ""}" title="Projektets mappar i Trimble Connect">Trimble Connect mapp</button></div>${mh}`);
  h = h.replace("<!--l3l-models-->", modelsSec);
  host.innerHTML = h;
  if (q) {
    host.querySelectorAll(".v3-lsec-b .v3-lr, .v3-lsec-b .v3-lr-dir").forEach(r => { r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none"; });
    host.querySelectorAll(".v3-lsec").forEach(s => { const any = [...s.querySelectorAll(".v3-lr, .v3-lr-dir")].some(r => r.style.display !== "none"); s.style.display = any ? "" : "none"; });
    if (![...host.querySelectorAll(".v3-lsec")].some(s => s.style.display !== "none")) host.insertAdjacentHTML("beforeend", `<div class="v3-pal-hint">Inget lager matchar "${esc(l3lay.q)}". (Filer i mappar som inte är öppnade söks inte.)</div>`);
  }
  const lq = host.querySelector("#v3LayQ");
  if (lq) lq.oninput = () => { l3lay.q = lq.value; const pos = lq.selectionStart; l3LayersRender(); const n = document.getElementById("v3LayQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  host.querySelectorAll("[data-lsec-t]").forEach(b => { b.onclick = () => { const c = l3lClosed(), id = b.dataset.lsecT; if (c.has(id)) c.delete(id); else c.add(id); l3SetPref("layClosed", [...c]); l3LayersRender(); }; });
  const fold = host.querySelector("#v3LayFold");
  if (fold) fold.onclick = () => { const c = l3lClosed(), shut = L3L_SECS.every(id => c.has(id)); L3L_SECS.forEach(id => (shut ? c.delete(id) : c.add(id))); if (!shut) { l3lay.open.clear(); if (typeof l3s !== "undefined") { l3s.open.clear(); l3s.fold = new Set(["*"]); } } else if (typeof l3s !== "undefined") l3s.fold = new Set(); l3SetPref("layClosed", [...c]); l3LayersRender(); };
  const rt = host.querySelector("#v3LayRetry");
  if (rt) rt.onclick = () => { l3lay.err = ""; l3lay.rootTried = true; l3lOpenDir(null); };

  host.querySelectorAll("[data-l3l]").forEach(b => { b.onclick = () => l3lToggle(b.dataset.l3l); });
  host.querySelectorAll("[data-l3m-eye]").forEach(b => { b.onclick = () => l3mToggle(); });
  host.querySelectorAll("[data-l3k-eye]").forEach(b => { b.onclick = () => l3kToggle(); });
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
  host.querySelectorAll("[data-l3l-forget]").forEach(b => { b.onclick = () => l3lForget(b.dataset.l3lForget); });
  host.querySelectorAll("[data-l3l-model]").forEach(b => { b.onclick = () => { const m = l3b.models.find(x => x.id === b.dataset.l3lModel); if (m) { l3bShow(m.id, !m.visible); l3RenderLegend(); l3Render(); l3LayersRender(); } }; });
  host.querySelectorAll("[data-l3l-zoom]").forEach(b => { b.onclick = () => l3lZoomModel(b.dataset.l3lZoom); });
  host.querySelectorAll("[data-l3l-save]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await l3bmSave(b.dataset.l3lSave); } catch (e) { /* statusraden */ } l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-sort]").forEach(b => { b.onclick = () => { l3SetPref("laySort", b.dataset.l3lSort); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3l-dir]").forEach(b => { b.onclick = () => l3lOpenDir(b.dataset.l3lDir); });
  host.querySelectorAll("[data-l3l-file]").forEach(b => { b.onclick = () => l3lFile(b.dataset.l3lFile, b.dataset.name); });
  host.querySelectorAll("[data-l3l-dxf]").forEach(b => { b.onclick = () => { if (b.dataset.cad) { const k = "cad:" + b.dataset.cad; setLayersVisible([k], !ls(k).visible); l3sRefresh(0); l3LayersRender(); } else l3sDxfFromTc(b.dataset.l3lDxf, b.dataset.name); }; });
  if (typeof l3sBind === "function") l3sBind(host);
  const op = host.querySelector('[data-l3l-op="plan"]');
  if (op) op.oninput = () => { l3SetPref("planOp", Number(op.value)); l3lApplyPlanOp(); l3Render(); };
  const adv = host.querySelector(".v3-lay-adv"); if (adv) adv.ontoggle = () => l3SetPref("layAdv", adv.open);
  const de = host.querySelector("#v3LayDetails");
  if (de) de.onchange = () => {
    l3SetPref("ifcDetails", de.checked);
    // De inlästa modellerna läses om direkt (ur webbläsarens kopia av filen – ingen ny hämtning från TC).
    const ms = l3b.models.filter(m => m.src);
    l3Status(`${de.checked ? "Detaljer visas" : "Detaljer hoppas över"}${ms.length ? ` – ${ms.map(m => m.name).join(", ")} läses in igen` : " i modeller som läses in härefter"}.`);
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
  if (P.laySort === "tree" && !l3lay.root && !l3lay.rootTried) { l3lay.rootTried = true; l3lOpenDir(null); }
}

/* Mappträdet: mappar fälls ut/ihop, IFC-filer har ett öga. */
function l3lTreeHtml(id, depth) {
  const esc = escHtml;
  if (!id) return l3lay.loading.has("root") ? `<div class="v3-pal-hint">Hämtar projektets mappar…</div>` : "";
  const items = l3lay.folders.get(id) || [];
  const dirs = items.filter(x => x.type === "folder"), files = items.filter(x => x.type === "file" && L3L_EXT.test(x.name));
  const pad = `style="padding-left:${4 + depth * 12}px"`;
  let h = "";
  dirs.forEach(d => {
    const open = l3lay.open.has(d.id), busy = l3lay.loading.has(d.id);
    h += `<button type="button" class="v3-lr-dir" data-l3l-dir="${esc(d.id)}" aria-expanded="${open}" ${pad}><span class="v3-lr-n" title="${esc(d.name)}">${esc(d.name)}</span>${busy ? '<span class="pm-spin"></span>' : ""}</button>`;
    if (open) h += l3lTreeHtml(d.id, depth + 1);
  });
  files.forEach(f => {
    if (/\.dxf$/i.test(f.name)) {
      const cad = typeof cads === "function" ? cads().find(r => r.name === f.name.replace(/\.dxf$/i, "")) : null, on = cad && ls("cad:" + cad.id).visible;
      h += `<div class="v3-lr" ${pad}><button type="button" class="v3-eye ${on ? "on" : ""}" data-l3l-dxf="${esc(f.id)}" data-name="${esc(f.name)}" data-cad="${cad ? esc(cad.id) : ""}" title="${cad ? (on ? "Släck" : "Tänd") : "Läs in som CAD-lager"}">${l3lEye(!!on)}</button><span class="v3-lr-n" title="${esc(f.name)}">${esc(f.name)}</span><em class="v3-lr-k">DXF</em></div>`;
      return;
    }
    const m = l3b.models.find(x => x.id === "f:" + f.id), busy = l3lay.loading.has(f.id);
    h += `<div class="v3-lr" ${pad}><button type="button" class="v3-eye ${m && m.visible ? "on" : ""}" data-l3l-file="${esc(f.id)}" data-name="${esc(f.name)}" title="${m ? (m.visible ? "Släck" : "Tänd") : "Läs in och visa"}">${busy ? '<span class="pm-spin"></span>' : l3lEye(!!(m && m.visible))}</button><span class="v3-lr-n" title="${esc(f.name)}">${esc(f.name)}</span>${m ? `<button type="button" class="v3-lr-zoom" data-l3l-zoom="${esc(m.id)}" title="Zooma till modellen">${L3_ICO.focus}</button>` : ""}${m ? `<em class="v3-lr-k">${(m.tris / 1000).toFixed(0)}k</em>` : f.size ? `<em class="v3-lr-k">${typeof pmBytes === "function" ? pmBytes(f.size) : ""}</em>` : ""}</div>`;
  });
  if (!dirs.length && !files.length && l3lay.folders.has(id)) h += `<div class="v3-pal-hint" ${pad}>Inga IFC- eller DXF-filer här.</div>`;
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
