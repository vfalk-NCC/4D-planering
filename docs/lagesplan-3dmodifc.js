/* 3D-vyn – IFC-export av ritade objekt (Victor 2026-11-11: "en ifc som jag exporterar på muren som jag kopierat från ifcen och delat upp i mindre bitar … blir en tom IFC på 33 kb").
   Orsak: exporten gjordes av 4D-planering i Trimble Connect (öppnaren), som inte har ritverktygens kod (lagesplan-3dmod.js) och därför inte kunde bygga formen på ritade
   objekt (byggdelar, delade bitar, nät, kroppar, gjutformar, väg och slänter) – filen fick bara projektstrukturen. Nu bygger 3D-editorn (som har formen) IFC-texten själv
   och 4D-planering laddar bara upp den (placeUploadIfc). Gäller både "Spara som IFC" och "Exportera markerade" (etablering tillsammans med IFC-objekt). */
(() => {
  if (typeof askOpener !== "function" || typeof buildPlacementsIfc !== "function") return;
  const ao0 = askOpener, isMod = p => p && /^mod:/.test(String(p.type || ""));
  const byIds = ids => (ids ? placements.filter(p => ids.includes(p.id)) : placements.slice());
  askOpener = window.askOpener = async function (type, payload, ...rest) {
    if ((type === "placeSaveIfc" || type === "placeIfcText") && payload) {
      const ids = Array.isArray(payload.ids) && payload.ids.length ? payload.ids.map(String) : null, list = byIds(ids), mods = list.filter(isMod), others = list.filter(p => !isMod(p));
      if (mods.length) {
        const pn = (typeof projectName !== "undefined" && projectName) || "";
        if (type === "placeIfcText") {   // etableringsobjekten som text att lägga in i en IFC-fil: bygg här om allt går (egna IFC-modeller kräver 4D-planering)
          const ok = list.every(p => !(placeLib(p.type) || {}).isModel);
          if (ok) { const r = buildPlacementsIfc(pn, new Set(list.map(p => p.id))); return r ? { text: r.text, n: r.n } : { text: null, n: 0 }; }
        } else {
          const r = buildPlacementsIfc(pn, new Set(mods.map(p => p.id)));
          if (r) {
            const up = await ao0("placeUploadIfc", { fileName: payload.fileName || "", text: r.text, n: r.n, count: mods.length }, 0);
            let res = { ...(up || {}), n: (up && up.n) || r.n, files: (up && up.files) || (up && up.name ? [up.name] : []) };
            if (!ids || others.length) {   // övriga etableringsobjekt (inte ritade) sparas som förut
              try { const p2 = ids ? { ...payload, ids: others.map(p => p.id), placementData: (payload.placementData || []).filter(g => !isMod(g)) } : payload, r2 = await ao0(type, p2, ...rest); if (r2 && r2.n) { res.n += r2.n; res.files = [...res.files, ...(r2.files || [r2.name]).filter(Boolean)]; } } catch (e) { /* de ritade är redan sparade */ }
            }
            return res;
          }
        }
      }
    }
    return ao0.apply(this, [type, payload, ...rest]);
  };
})();
