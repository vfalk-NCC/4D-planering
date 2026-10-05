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

/* Ritas efter (och, för "bara överzoner", i stället för) zonerna. */
function drawWbsShapes(ctx, fontPx, objects, groups, filled) {
  const badges = [];
  groups.forEach(g => {
    if (!g.polys.length) return;
    const color = g.items.length ? phaseColor(g.phase) : "#6b7280";
    ctx.save();
    ctx.beginPath();
    g.polys.forEach(rings => rings.forEach(r => {
      r.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }));
    if (filled && g.items.length) { ctx.globalAlpha = objects && objects.length ? ZONE_ALPHA / 3 : ZONE_ALPHA; ctx.fillStyle = color; ctx.fill("evenodd"); ctx.globalAlpha = 1; }
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, fontPx / 3.2);
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.stroke();
    ctx.lineWidth = Math.max(2, fontPx / 5); ctx.strokeStyle = filled ? shade(color, -0.35) : "#111827";
    if (!filled) ctx.setLineDash([fontPx * 0.9, fontPx * 0.45]);
    ctx.stroke();
    ctx.restore();
    // Etikett: i mitten när bara överzonerna visas, annars ovanför (zonernas egna etiketter ligger i mitten).
    let pt;
    if (filled) pt = toPx(wbsCentroid(g.polys));
    else {
      const P = g.polys.flatMap(rings => rings[0]).map(toPx);
      pt = [(Math.min(...P.map(p => p[0])) + Math.max(...P.map(p => p[0]))) / 2, Math.min(...P.map(p => p[1])) - fontPx * 0.9];
    }
    const text = `${g.name}${g.progress != null ? ` · ${g.progress} %` : ""}`;
    badges.push([pt, text, color, !g.items.length, { ...ZONE_STYLE_DEFAULT, labelSize: 1.25 }, null, -1]);
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
  if (!groups.length) return;
  const open = wbsOpenSet();
  const sel = selectedZoneId && (plan.zones || []).find(z => z.id === selectedZoneId);
  if (sel && wbsKey(sel.parent)) open.add(wbsKey(sel.parent));
  const box = document.createElement("div");
  box.className = "wbs-list";
  groups.forEach(g => {
    const row = document.createElement("div"), isOpen = open.has(g.key);
    row.className = "zone-item wbs-item" + (isOpen ? " open" : "");
    row.dataset.wbs = g.key;
    const tog = document.createElement("button"); tog.type = "button"; tog.className = "wbs-tog"; tog.textContent = isOpen ? "▾" : "▸";
    tog.title = isOpen ? "Fäll ihop" : "Visa zonerna i överzonen";
    const sw = document.createElement("span"); sw.className = "sw"; sw.style.background = g.items.length ? phaseColor(g.phase) : "#fff";
    const code = document.createElement("span"); code.className = "code"; code.textContent = g.name;
    const ph = document.createElement("span"); ph.textContent = g.items.length ? PHASE_LABELS[g.phase] : "";
    const pct = document.createElement("span"); pct.className = "pct";
    pct.textContent = `${g.progress != null ? g.progress + " % · " : ""}${g.children.length} zon${g.children.length === 1 ? "" : "er"}`;
    row.append(tog, sw, code, ph, pct);
    row.title = `Överzon (WBS nivå 1): ${g.children.map(z => z.code).join(", ")}. Klicka för att visa den på planen.`;
    tog.onclick = e => { e.stopPropagation(); wbsSetOpen(g.key, !isOpen); renderZoneList(); };
    row.onclick = () => { if (g.polys.length && typeof centerOnPdf === "function") centerOnPdf(wbsCentroid(g.polys)); };
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
  openEditor = function (id) { const r = origOpen.apply(this, arguments); renderWbsField(plan && (plan.zones || []).find(x => x.id === id)); return r; };
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
