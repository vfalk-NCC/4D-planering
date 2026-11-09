/* Gjutform runt markerade fundament (Victor 2026-11-05: "om jag markerar fundament i modellen … automatiskt skapar en 4-sidig form runt dom? I TC?").
   Markera ett eller flera objekt i IFC-modellen → knappen "Gjutform" i markeringsrutan: för varje objekt räknas den minsta rätvinkliga rektangeln runt dess yta (roterad efter objektet),
   och en Gjutetapp (smart objekt: fyrsidig form med formvirke) läggs runt det, med objektets höjd och ett litet utstick. Formerna är vanliga 3D-objekt i etableringen: de kan flyttas, ändras
   (mått, vinkel, formvirke, armering) och sparas som IFC i Trimble Connect med "Spara som IFC i TC" (knappen i toasten gör det direkt). Originalobjekten i modellen rörs inte. */
function l3formCreate(sel, margin = 0) {
  const made = [];
  sel.forEach(s => {
    const o = l3rbObb(s.pts); if (!o || !(o.L > 0.05) || !(o.B > 0.05)) return;
    const p = placeNew("sm:gjutetapp", [o.cx, o.cy, o.z0]);
    p.L = Math.round((o.L + 2 * margin) * 100) / 100; p.B = Math.round((o.B + 2 * margin) * 100) / 100; p.H = Math.max(0.05, Math.round(o.H * 100) / 100);
    let deg = o.yaw * 180 / Math.PI; deg = ((deg % 180) + 180) % 180; if (deg > 90) deg -= 180; p.rot = Math.round(deg * 100) / 100;
    p.name = `Gjutform ${String(s.name || "objekt").slice(0, 40)}`; p.f = p.f || {}; p.f.arm = "Dölj";   // bara formen – armeringen läggs till vid behov
    p.note = `Skapad runt ${s.name || "objekt"}${s.guid ? " (" + s.guid + ")" : ""}`;
    placements.push(p); placeTouch(p); if (typeof l3AddPlacementMesh === "function" && typeof l3 !== "undefined" && l3 && l3.placeMeshes) l3AddPlacementMesh(p);
    made.push(p);
  });
  return made;
}
async function l3bsMakeForms() {
  if (typeof l3rbSelection !== "function" || typeof l3bs === "undefined" || !l3bs.sel.length) { l3Status("Markera fundamenten i modellen först.", true); return []; }
  let m = 0; if (typeof uiPrompt === "function") { const a = await uiPrompt(`Gjutform runt ${l3bs.sel.length} markerade objekt.\nUtstick utanför objektets kant (meter). 0 = formen ligger direkt mot betongen (du gjuter mot formen). Skriv ett värde bara om formen ska vara större än objektet:`, "0"); if (a === null || a === undefined) return []; const v = parseFloat(String(a).replace(",", ".")); if (isFinite(v) && v >= 0 && v <= 3) m = v; }
  const sel = l3rbSelection().filter(s => s.src === "ifc"); if (!sel.length) { l3Status("Inga objekt i IFC-modellen är markerade.", true); return []; }
  if (typeof placeSnapshot === "function") placeSnapshot();
  const made = l3formCreate(sel, m);
  if (!made.length) { l3Status("Kunde inte läsa formen på de markerade objekten.", true); return []; }
  if (typeof l3Changed === "function") l3Changed();
  if (typeof l3SelectIds === "function") { try { l3bsClear && l3bsClear(); l3SelectIds(made.map(p => p.id)); } catch (e) { /* */ } }
  l3Toast(`${made.length} gjutformar skapade runt de markerade objekten (utstick ${String(m).replace(".", ",")} m).`, typeof placeSaveIfc === "function" ? "Spara i TC" : null, () => { if (typeof placeSaveIfc === "function") placeSaveIfc().catch(e => l3Status("Kunde inte spara i Trimble Connect: " + e.message, true)); }, 12000);
  return made;
}
