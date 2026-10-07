/* Lägesplan – WBS-nivåer på zonerna (Victors önskemål 2026-10-02).
   Avancerat alternativ under Zoner → Fler zonfunktioner, avslaget från början.
   Två nivåer: zonerna (nivå 2, t.ex. 7421 Förtjockardelen) får en överzon
   (nivå 1, t.ex. "742 Sikthall") i zonrutan. Överzonen ritas aldrig för hand –
   den räknas fram som sammanslagningen av sina zoner, och dess status/framdrift
   ur zonernas aktiviteter. Visa: båda nivåerna, bara överzoner eller bara zoner. */

const wbsOn = () => typeof zoneOpt$ === "function" && zoneOpt$("wbs");
const wbsLevel = () => (typeof zoneOpts === "function" && zoneOpts().wbsLevel) || "both";
const wbsKey = s => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();

/* Överzonerna: [{ key, name, children, polys (pdf), items, phase, progress }]. */
function wbsGroups() {
  if (!plan) return [];
  const map = new Map();
  (plan.zones || []).forEach(z => {
    const k = wbsKey(z.parent);
    if (!k) return;
    if (!map.has(k)) map.set(k, { key: k, name: String(z.parent).trim(), children: [] });
    map.get(k).children.push(z);
  });
  const day = $("dateInput").value || todayIso();
  return [...map.values()].map(g => {
    const kids = g.children.filter(z => !(z.style && z.style.hidden));
    const seen = new Set(), items = [];
    kids.forEach(z => ((z._status || zoneStatus(z)).items || []).forEach(it => { if (!seen.has(it.id)) { seen.add(it.id); items.push(it); } }));
    return { ...g, kids, polys: wbsUnion(kids), items, phase: zonePhase(items, day), progress: zoneProgress(items) };
  }).sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true }));
}
/* Zonernas polygoner slås ihop (polygon-clipping). Ytterkanter och ev. hål. */
function wbsUnion(zones) {
  const geoms = zones.flatMap(z => (z.polys || []).filter(p => p.length > 2).map(p => [[...p.map(q => [q[0], q[1]]), [p[0][0], p[0][1]]]]));
  if (!geoms.length) return [];
  let mp;
  try { mp = geoms.length === 1 ? [geoms[0]] : polygonClipping.union(...geoms); } catch (e) { return geoms.map(g => g[0].slice(0, -1)); }
  return mp.map(poly => poly.map(ring => ring.slice(0, -1)));
}
const wbsCentroid = rings => { const r = rings.reduce((a, p) => (polyArea(p[0]) > polyArea(a[0]) ? p : a), rings[0])[0]; let x = 0, y = 0; r.forEach(p => { x += p[0]; y += p[1]; }); return [x / r.length, y / r.length]; };

/* Överzonernas utseende (Victors önskemål 2026-10-05): redigeras som zonernas, sparas i planen
   (plan.wbs[nyckel].style). Utan egen stil ser överzonen ut som förut. */
const WBS_STYLE_DEFAULT = { ...ZONE_STYLE_DEFAULT, labelSize: 1.25 };
let selectedWbsKey = null;
function wbsMeta(key, create = false) {
  if (!plan) return null;
  if (create && !plan.wbs) plan.wbs = {};
  const w = plan.wbs || {};
  if (create && !w[key]) w[key] = {};
  return w[key] || null;
}
const wbsStyle = key => ({ ...WBS_STYLE_DEFAULT, ...((wbsMeta(key) || {}).style || {}) });

/* Överzonens etikett: egen text ({namn}/{kod} = överzonens namn, {%} = framdrift, {m2} = zonernas
   sammanlagda yta) eller automatiskt namn (+ framdrift). */
function wbsLabelText(g, zs) {
  const area = () => {
    if (typeof zoneAreaM2 !== "function") return null;
    const a = g.children.map(z => zoneAreaM2(z)).filter(v => v != null);
    return a.length ? a.reduce((x, y) => x + y, 0) : null;
  };
  if (zs.labelText) {
    const m2 = /\{m2\}|\{m²\}/i.test(zs.labelText) ? area() : null;
    return String(zs.labelText).replace(/\{kod\}|\{namn\}/gi, g.name).replace(/\{%\}/g, g.progress != null ? `${g.progress} %` : "")
      .replace(/\{m2\}|\{m²\}/gi, m2 != null ? `${fmtArea(m2)} m²` : "");
  }
  return `${g.name}${zs.labelPct && g.progress != null ? ` · ${g.progress} %` : ""}`;
}
/* Överzonens etikett för etikettrutan och dra-för-att-flytta (zoneLabelTarget i lagesplan-zones.js). */
function wbsLabelTarget(key) {
  const g = wbsGroups().find(x => x.key === key);
  if (!g) return null;
  return {
    obj: wbsMeta(key, true), title: `överzon ${g.name}`, style: () => wbsStyle(key), chips: ["{namn}", "{%}", "{m2}"],
    autoText: s => ["{namn}", s.labelPct ? "{%}" : ""].filter(Boolean).join(" · "),
    longDeg: () => zoneLongSideDeg({ polys: g.polys.map(rings => rings[0]) }),
    all: () => wbsGroups().map(x => wbsMeta(x.key, true)), allLabel: "alla överzoners",
    select: () => { if (selectedWbsKey !== key) { selectedWbsKey = key; selectZone(null); selectedWbsKey = key; renderZones(); openWbsEditor(g); } },
    afterSave: () => { const ng = wbsGroups().find(x => x.key === key); if (ng && selectedWbsKey === key) openWbsEditor(ng); },
  };
}

/* Ritas efter (och, för "bara överzoner", i stället för) zonerna. */
function drawWbsShapes(ctx, fontPx, objects, groups, filled) {
  const badges = [];
  groups.forEach(g => {
    if (!g.polys.length) return;
    const own = (wbsMeta(g.key) || {}).style || {}, zs = wbsStyle(g.key), selected = g.key === selectedWbsKey;
    if (zs.hidden && !selected) return;
    const phaseCol = g.items.length ? phaseColor(g.phase) : "#6b7280";
    const color = zs.fill === "custom" ? zs.fillColor : phaseCol;
    const path = () => {
      ctx.beginPath();
      g.polys.forEach(rings => rings.forEach(r => {
        r.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
      }));
    };
    ctx.save();
    if (zs.hidden) ctx.globalAlpha = 0.4;
    path();
    // Fyllning: med "bara överzoner", eller när en egen fyllning valts.
    const doFill = zs.fill !== "none" && (filled || "fill" in own || "fillOpacity" in own) && (zs.fill === "custom" || g.items.length);
    if (doFill) {
      ctx.globalAlpha = (zs.fillOpacity != null ? zs.fillOpacity : objects && objects.length ? ZONE_ALPHA / 3 : ZONE_ALPHA) * (zs.hidden ? 0.3 : 1);
      ctx.fillStyle = color;
      if (zs.pattern === "none") ctx.fill("evenodd");
      else { ctx.globalAlpha *= 0.35; ctx.fill("evenodd"); ctx.globalAlpha /= 0.35; ctx.save(); ctx.clip("evenodd"); { const q = g.polys.flat(2).map(toPx); zonePatternFill(ctx, zs.pattern, color, fontPx, q.length ? [Math.min(...q.map(v => v[0])), Math.min(...q.map(v => v[1])), Math.max(...q.map(v => v[0])), Math.max(...q.map(v => v[1]))] : null); } ctx.restore(); path(); }
      ctx.globalAlpha = zs.hidden ? 0.4 : 1;
    }
    ctx.lineJoin = "round";
    const lw = Math.max(2, fontPx / 5) * (Number(zs.strokeWidth) || 1);
    if (selected) {
      ctx.lineWidth = Math.max(5, fontPx / 2.6, lw) * 1.9; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.stroke();
      ctx.lineWidth = Math.max(5, fontPx / 2.6, lw); ctx.strokeStyle = "#0b5fff"; ctx.stroke();
    } else if (zs.stroke !== "none") {
      ctx.lineWidth = Math.max(3, fontPx / 3.2) * (Number(zs.strokeWidth) || 1);
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.stroke();
      ctx.lineWidth = lw;
      ctx.strokeStyle = zs.stroke === "custom" ? zs.strokeColor : filled ? shade(color, -0.35) : "#111827";
      const dash = zs.dash === "auto" ? (filled ? "solid" : "dashed") : zs.dash;
      if (dash === "dashed") ctx.setLineDash([fontPx * 0.9, fontPx * 0.45]);
      else if (dash === "dotted") { ctx.setLineDash([lw * 0.2, lw * 2.2]); ctx.lineCap = "round"; }
      ctx.stroke();
    }
    ctx.restore();
    if (zs.label === "none") return;
    // Etikett: där den dragits (Victors önskemål 2026-10-06: flyttas och redigeras som zonernas),
    // annars i mitten när bara överzonerna visas, och ovanför (zonernas egna etiketter ligger i mitten).
    const meta = wbsMeta(g.key) || {};
    const moved = meta.labels && meta.labels.length && meta.labels[0];
    let pt;
    if (moved) pt = toPx(meta.labels[0]);
    else if (filled) pt = toPx(wbsCentroid(g.polys));
    else {
      const P = g.polys.flatMap(rings => rings[0]).map(toPx);
      pt = [(Math.min(...P.map(p => p[0])) + Math.max(...P.map(p => p[0]))) / 2, Math.min(...P.map(p => p[1])) - fontPx * 0.9];
    }
    const text = wbsLabelText(g, zs);
    badges.push([pt, text, color, !g.items.length && zs.fill !== "custom", zs, "wbs:" + g.key, moved ? 0 : -1]);
  });
  return badges;
}

/* Zonlistan: överzonerna överst med samlad status. Varje överzon kan fällas ut och visar då sina
   zoner under sig (Victors önskemål 2026-10-05); hopfälld från början. Zoner utan överzon ligger
   kvar under överzonerna. Den markerade zonens överzon fälls ut. */
const WBS_OPEN_KEY = () => "lagesplan-wbsopen-" + (typeof projectId !== "undefined" ? projectId : "");
function wbsOpenSet() { try { return new Set(JSON.parse(localStorage.getItem(WBS_OPEN_KEY()) || "[]")); } catch (e) { return new Set(); } }
function wbsSetOpen(key, open) {
  const s = wbsOpenSet();
  if (open) s.add(key); else s.delete(key);
  try { localStorage.setItem(WBS_OPEN_KEY(), JSON.stringify([...s])); } catch (e) {}
}
function renderWbsList() {
  const list = $("zoneList");
  if (!list || !wbsOn()) return;
  const groups = wbsGroups();
  if (selectedWbsKey && !groups.some(g => g.key === selectedWbsKey)) { selectedWbsKey = null; $("zoneEditor").classList.remove("wbs"); closeEditor(); }
  if (!groups.length) return;
  const open = wbsOpenSet();
  const sel = selectedZoneId && (plan.zones || []).find(z => z.id === selectedZoneId);
  if (sel && wbsKey(sel.parent)) open.add(wbsKey(sel.parent));
  const box = document.createElement("div");
  box.className = "wbs-list";
  groups.forEach(g => {
    const row = document.createElement("div"), isOpen = open.has(g.key);
    row.className = "zone-item wbs-item" + (isOpen ? " open" : "") + (g.key === selectedWbsKey ? " sel" : "");
    row.dataset.wbs = g.key;
    const tog = document.createElement("button"); tog.type = "button"; tog.className = "wbs-tog"; tog.textContent = isOpen ? "▾" : "▸";
    tog.title = isOpen ? "Fäll ihop" : "Visa zonerna i överzonen";
    const sw = document.createElement("span"); sw.className = "sw"; sw.style.background = g.items.length ? phaseColor(g.phase) : "#fff";
    const code = document.createElement("span"); code.className = "code"; code.textContent = g.name;
    const ph = document.createElement("span"); ph.textContent = g.items.length ? PHASE_LABELS[g.phase] : "";
    const pct = document.createElement("span"); pct.className = "pct";
    pct.textContent = `${g.progress != null ? g.progress + " % · " : ""}${g.children.length} zon${g.children.length === 1 ? "" : "er"}`;
    row.append(tog, sw, code, ph, pct);
    row.title = `Överzon (WBS nivå 1): ${g.children.map(z => z.code).join(", ")}. Klicka för att markera och redigera den.`;
    tog.onclick = e => { e.stopPropagation(); wbsSetOpen(g.key, !isOpen); renderZoneList(); };
    row.onclick = () => selectWbs(g.key, true);
    box.appendChild(row);
    // Zonerna i överzonen flyttas hit från listan (indragna).
    g.children.forEach(z => {
      const zr = list.querySelector(`.zone-item[data-zone="${CSS.escape(z.id)}"]`);
      if (!zr) return;
      zr.classList.add("wbs-child");
      zr.classList.toggle("hidden", !isOpen);
      box.appendChild(zr);
    });
  });
  list.prepend(box);
}

/* Markera en överzon (klick i zonlistan): redigeras i zonrutan – namn, utseende, 3D, ta bort. */
function selectWbs(key, center) {
  selectZone(null);
  selectedWbsKey = key;
  renderZones();
  const g = wbsGroups().find(x => x.key === key);
  if (!g) { selectedWbsKey = null; return; }
  openWbsEditor(g);
  if (center && g.polys.length && typeof centerOnPdf === "function") centerOnPdf(wbsCentroid(g.polys));
  flashOutline(g.polys);
}
function openWbsEditor(g) {
  const ed = $("zoneEditor");
  ed.classList.remove("hidden", "multi"); ed.classList.add("wbs");
  if (typeof openSec === "function") openSec("zones", true);
  $("zeTitle").textContent = `Överzon ${g.name}`;
  const nm = $("zwName");
  nm.value = g.name;
  nm.onchange = () => renameWbs(g.key, nm.value);
  $("zwInfo").textContent = `${g.children.length} zon${g.children.length === 1 ? "" : "er"} · ${g.items.length ? `${g.items.length} objekt · ${g.progress} % · ${PHASE_LABELS[g.phase]}` : "inga kopplade objekt"}. Status och framdrift räknas fram ur zonerna.`;
  const kids = $("zwKids");
  kids.innerHTML = g.children.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), "sv", { numeric: true }))
    .map(z => `<button type="button" data-zid="${escHtml(z.id)}" title="Markera zonen">${escHtml(z.code)}</button>`).join("");
  kids.querySelectorAll("[data-zid]").forEach(b => b.onclick = () => selectZone(b.dataset.zid, true));
  $("zw3d").disabled = !g.items.length;
  $("zw3d").onclick = async () => {
    const ids = g.items.map(it => it.id);
    try { await askOpener("select", { ids }, 30000); setSaveStatus(`🎯 ${ids.length} objekt i ${g.name} markerade i 3D`); } catch (e) { alert("Kunde inte markera i 3D: " + e.message); }
  };
  $("zwDelete").onclick = () => deleteWbs(g.key);
  renderZoneStyleUi(wbsMeta(g.key, true), { wbs: true, labelId: "wbs:" + g.key, onAll: m => {
    const others = wbsGroups().filter(x => x.key !== g.key);
    if (!others.length || !confirm(`Ge alla ${others.length} andra överzoner samma utseende som ${g.name}?`)) return;
    zoneSnapshot("Utseende på alla överzoner");
    others.forEach(x => { const o = wbsMeta(x.key, true); if (m.style) o.style = { ...m.style }; else delete o.style; });
    renderZones(); schedulePlanSave();
    setSaveStatus(`✓ Alla överzoner har nu samma utseende som ${g.name}`);
  } });
}
function renameWbs(key, name) {
  const v = String(name || "").trim().replace(/\s+/g, " "), nk = wbsKey(v);
  const g = wbsGroups().find(x => x.key === key);
  if (!g || !v || v === g.name) { if (g) $("zwName").value = g.name; return; }
  zoneSnapshot("Byt namn på överzon");
  g.children.forEach(z => { z.parent = v; });
  if (nk !== key && plan.wbs && plan.wbs[key]) { if (!plan.wbs[nk]) plan.wbs[nk] = plan.wbs[key]; delete plan.wbs[key]; }
  if (wbsOpenSet().has(key)) { wbsSetOpen(key, false); wbsSetOpen(nk, true); }
  selectedWbsKey = nk;
  renderZones(); schedulePlanSave();
  const ng = wbsGroups().find(x => x.key === nk);
  if (ng) openWbsEditor(ng);
  setSaveStatus(`Överzonen heter nu ${v} (Ctrl+Z ångrar).`);
}
function deleteWbs(key) {
  const g = wbsGroups().find(x => x.key === key);
  if (typeof zoneGuardBlock === "function" && zoneGuardBlock("Ta bort överzon")) return;
  if (!g || !confirm(`Ta bort överzonen ${g.name}? De ${g.children.length} zonerna ligger kvar, utan överzon.`)) return;
  zoneSnapshot("Ta bort överzon");
  g.children.forEach(z => { delete z.parent; });
  if (plan.wbs) delete plan.wbs[key];
  selectedWbsKey = null;
  $("zoneEditor").classList.remove("wbs"); closeEditor();
  renderZones(); schedulePlanSave();
  setSaveStatus(`Överzonen ${g.name} är borttagen – zonerna ligger kvar (Ctrl+Z ångrar).`);
}

/* Markering från sidomenyn (Victors önskemål 2026-10-05): zonen blinkar till – resten av planen
   tonas ned en kort stund och zonens yttre gränslinjer pulserar i blått. polys: [[ring, hål …], …]. */
let flashRaf = 0;
function flashOutline(polys) {
  const stage = $("stage");
  if (!stage || !polys || !polys.length || !plan || !viewport) return;
  let c = $("flashCanvas");
  if (!c) { c = document.createElement("canvas"); c.id = "flashCanvas"; stage.appendChild(c); }
  cancelAnimationFrame(flashRaf);
  const [x0, y0, x1, y1] = visibleStageBox();
  const dpr = window.devicePixelRatio || 1;
  const s = Math.min(view.scale * dpr, 4096 / Math.max(1, x1 - x0), 4096 / Math.max(1, y1 - y0));
  c.width = Math.max(1, Math.ceil((x1 - x0) * s)); c.height = Math.max(1, Math.ceil((y1 - y0) * s));
  Object.assign(c.style, { display: "", left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  const ctx = c.getContext("2d"), px = 1 / view.scale; // en skärmpixel i stage-px
  const rings = polys.flatMap(rs => rs).map(r => r.map(toPx));
  const path = () => { ctx.beginPath(); rings.forEach(r => { r.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }); };
  const T = 1700, t0 = performance.now();
  const frame = now => {
    const t = (now - t0) / T;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    if (t >= 1) { c.style.display = "none"; c.width = c.height = 0; return; }
    ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    const fade = t > 0.75 ? (1 - t) / 0.25 : 1, pulse = 0.5 + 0.5 * Math.cos(t * Math.PI * 6); // tre blinkningar
    // Allt utanför zonen tonas ned.
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0);
    rings.forEach(r => { r.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); });
    ctx.fillStyle = `rgba(15,23,42,${0.38 * fade})`; ctx.fill("evenodd");
    path();
    ctx.lineJoin = "round";
    ctx.fillStyle = `rgba(11,95,255,${0.18 * pulse * fade})`; ctx.fill("evenodd");
    ctx.lineWidth = (7 + 5 * pulse) * 1.9 * px; ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.stroke();
    ctx.lineWidth = (7 + 5 * pulse) * px; ctx.strokeStyle = `rgba(11,95,255,${fade})`; ctx.stroke();
    flashRaf = requestAnimationFrame(frame);
  };
  flashRaf = requestAnimationFrame(frame);
}

/* Fältet "Överzon" i zonrutan. */
function renderWbsField(z) {
  const box = $("zeWbs");
  if (!box) return;
  box.classList.toggle("hidden", !wbsOn() || !z);
  if (!wbsOn() || !z) return;
  const inp = $("zeParent");
  inp.value = z.parent || "";
  $("zeParents").innerHTML = [...new Set((plan.zones || []).map(x => String(x.parent || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv", { numeric: true })).map(v => `<option value="${escHtml(v)}"></option>`).join("");
  inp.onchange = () => {
    const v = inp.value.trim().replace(/\s+/g, " ");
    if (v === String(z.parent || "")) return;
    zoneSnapshot("Ändra överzon");
    if (v) z.parent = v; else delete z.parent;
    renderZones(); schedulePlanSave();
    setSaveStatus(v ? `${z.code} ligger nu i överzonen ${v}.` : `${z.code} har ingen överzon.`);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const origDraw = drawZoneShapes;
  drawZoneShapes = function (ctx, fontPx, objects, cached) {
    if (!wbsOn() || !plan) return origDraw.apply(this, arguments);
    const lvl = wbsLevel();
    if (lvl === "2") return origDraw.apply(this, arguments);
    let badges;
    if (lvl === "1") {
      // Bara överzonerna: zonerna som ingår i en överzon ritas inte.
      const all = plan.zones;
      plan.zones = all.filter(z => !wbsKey(z.parent));
      try { badges = origDraw.apply(this, arguments); } finally { plan.zones = all; }
      // Status för zonerna i överzonerna behövs för den samlade statusen.
      all.forEach(z => { if (wbsKey(z.parent) && !z._status) z._status = zoneStatus(z); });
    } else badges = origDraw.apply(this, arguments);
    return badges.concat(drawWbsShapes(ctx, fontPx, objects, wbsGroups(), lvl === "1"));
  };
  const origList = renderZoneList;
  renderZoneList = function () { const r = origList.apply(this, arguments); renderWbsList(); return r; };
  const origOpen = openEditor;
  openEditor = function (id) { $("zoneEditor").classList.remove("wbs"); const r = origOpen.apply(this, arguments); renderWbsField(plan && (plan.zones || []).find(x => x.id === id)); return r; };
  // En vanlig zon markeras: överzonen släpps. Från sidomenyn (center) blinkar zonen till.
  const origSel = selectZone;
  selectZone = function (id, center) {
    if (selectedWbsKey) { selectedWbsKey = null; $("zoneEditor").classList.remove("wbs"); }
    const r = origSel.apply(this, arguments);
    const z = id && center && plan && (plan.zones || []).find(x => x.id === id);
    if (z) flashOutline(wbsUnion([z]));
    return r;
  };
  // Alternativet och nivåvalet (sparas i webbläsaren som de andra zonalternativen).
  const cb = $("zoWbs"), sel = $("zoWbsLevel");
  if (!cb || !sel) return;
  const syncUi = () => { $("zoWbsRow").classList.toggle("hidden", !cb.checked); };
  cb.checked = wbsOn(); sel.value = wbsLevel(); syncUi();
  if (cb.checked) $("zoneOptsBox").open = true;
  const save = patch => { const o = { ...zoneOpts(), ...patch }; try { localStorage.setItem(ZONE_OPTS_KEY, JSON.stringify(o)); } catch (e) {} };
  cb.onchange = () => { save({ wbs: cb.checked }); syncUi(); renderZones(); if (selectedZoneId) openEditor(selectedZoneId); };
  sel.onchange = () => { save({ wbsLevel: sel.value }); renderZones(); };
});
