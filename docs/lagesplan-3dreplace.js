/* 3D-vyn – Smart Replace (Victor 2026-10-30: "ersätt ett objekt med ett annat och behåll position, rotation och egenskaper").

   I objektets egenskaper (ett eller flera markerade etableringsobjekt): "Ersätt med…" och en typ ur biblioteket. Objektet byter typ men
   behåller sitt id (kopplingen till 4D-aktiviteten, mappen, låsningen och historiken följer med), sin position, rotation, höjd över ytan,
   namn (om det var det automatiska), färg och genomskinlighet (om de ändrats för hand), textur, datum och kommentarer. Mått som hör till
   den gamla typen (längd, bredd, höjd, smarta fält) byts mot den nya typens – utom när båda är enkla lådor, då behålls de också.
   Ett steg i Ångra. IFC-objekt i byggnaden ersätts inte (deras GUID och egenskaper rörs aldrig). */

const L3RP_OWN = new Set(["type", "L", "B", "H", "R", "f", "count", "scale", "pts", "name", "color", "comment_crew", "model", "crewList", "slots"]);
const l3rpSimple = lib => !!lib && !lib.smart && !lib.crew && !lib.isModel && !lib.fence;

/* Ersätter list (placeringar) med typen newType. Returnerar antalet. */
function l3SmartReplace(list, newType) {
  const nl = placeLib(newType); if (!nl || !list.length) return 0;
  placeSnapshot();
  let n = 0;
  list.forEach(p => {
    const i = placements.findIndex(x => x.id === p.id); if (i < 0 || p.locked || p.type === newType) return;
    const ol = placeLib(p.type) || {}, np = placeNew(newType, [p.x, p.y, p.z]);
    Object.keys(p).forEach(k => { if (!L3RP_OWN.has(k)) np[k] = p[k]; }); // allt som inte hör till typen (läge, koppling, datum, mapp, lås …)
    np.id = p.id; np.type = newType; np.x = p.x; np.y = p.y; np.z = p.z; np.dz = p.dz || 0; np.rot = p.rot || 0;
    // Namnet: eget behålls; det automatiska ("Container 3") får den nya typens namn.
    const auto = ol.label && String(p.name || "").startsWith(ol.label);
    np.name = p.name && !auto ? p.name : placeNextName(nl.label);
    // Färgen: egen behålls, annars den nya typens.
    const own = p.color && String(p.color).toLowerCase() !== String(ol.color || "").toLowerCase();
    np.color = own ? p.color : nl.color;
    // Mått: enkla lådor behåller sina, andra får den nya typens.
    if (l3rpSimple(ol) && l3rpSimple(nl)) { np.L = p.L; np.B = p.B; np.H = p.H; np.R = nl.R ? (p.R || nl.R) : 0; }
    // Stängsel/vägar med punkter byter bara mot en sådan typ – punkterna behålls.
    if (ol.fence && nl.fence && p.pts) np.pts = p.pts.map(q => q.slice());
    np.updated_at = new Date().toISOString();
    placements[i] = np; placeTouch(np); l3RebuildOne(np); n++;
  });
  if (n) { l3Changed(); if (typeof l3RefreshSel === "function") l3RefreshSel(); if (typeof l3RenderSide === "function") l3RenderSide(); }
  return n;
}
/* Rutan i egenskapspanelen: alla typer ur biblioteket, grupperade. */
function l3rpHtml(list) {
  const items = typeof l3libItems === "function" ? l3libItems() : [];
  if (!items.length) return "";
  const cur = new Set(list.map(p => p.type)), byGroup = new Map();
  items.forEach(it => { const l = placeLib(it.k) || {}, g = l.group || (it.own ? "Egna modeller" : "Övrigt"); (byGroup.get(g) || byGroup.set(g, []).get(g)).push(it); });
  const opt = [...byGroup].map(([g, a]) => `<optgroup label="${escHtml(g)}">${a.filter(it => !(cur.size === 1 && cur.has(it.k))).map(it => `<option value="${escHtml(it.k)}">${escHtml(it.label)}</option>`).join("")}</optgroup>`).join("");
  return `<label class="v3-field v3-replace" title="Byter typ men behåller position, rotation, namn, koppling till aktiviteten och övriga egenskaper"><span>Ersätt med</span><select data-v3replace><option value="">Välj typ…</option>${opt}</select></label>`;
}
function l3rpBind(side, list) {
  const sel = side.querySelector("[data-v3replace]"); if (!sel) return;
  sel.onchange = async () => {
    const t = sel.value; if (!t) return; const lib = placeLib(t) || {};
    const ok = await uiConfirm(`Ersätta ${list.length > 1 ? list.length + " objekt" : "objektet"} med ${lib.label || t}?\n\nPosition, rotation, namn, koppling till aktiviteten och datum behålls. Mått som hör till den gamla typen byts. Ctrl+Z ångrar.`);
    if (!ok) { sel.value = ""; return; }
    const n = l3SmartReplace(list, t);
    l3Status(n ? `${n} objekt ersatta med ${lib.label || t}.` : "Inget ersattes (låsta objekt ersätts inte).", !n);
  };
}
