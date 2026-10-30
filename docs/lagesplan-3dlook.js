/* 3D-vyn – IFC-objektens färg, opacitet och textur sparas i projektet (Victor 2026-10-30: "så att det jag gjort finns kvar när sidan laddas om").

   – Tidigare låg färgen (u.tint), opaciteten (u.alpha) och texturen (u.tex) bara i sessionen. Nu skrivs de per objekt (IFC-id, GUID) till
     projects/<id>/ifc_looks.json – egen fil som rör inget annat – och läggs på igen när modellerna läses in. GUID gäller även nya modellversioner.
   – Posterna är { guid, c: "#rrggbb", a: 0–1, t: { id, s, k } }. Egna texturbilder ligger som poster med guid "__tex__<id>" så att alla ser dem.
   – Sparningen sker en kort stund efter ändringen och slås ihop med andras ändringar i filen (bara de objekt du rört skrivs om). */

const l3look = { map: null, loading: false, dirty: new Set(), timer: 0, texDefs: new Map() };
const l3lookPath = () => `projects/${encodeURIComponent(projectId)}/ifc_looks.json`;

async function l3lookLoad() {
  if (l3look.map || l3look.loading) return;
  l3look.loading = true;
  const map = new Map();
  try {
    const a = await ghReadJSON(token, l3lookPath());
    (Array.isArray(a) ? a : []).forEach(r => {
      if (!r || !r.guid) return;
      if (String(r.guid).startsWith("__tex__")) { if (r.data && typeof l3texRegisterUser === "function") l3texRegisterUser(String(r.guid).slice(7), r.name, r.data, true); l3look.texDefs.set(String(r.guid).slice(7), r); return; }
      map.set(r.guid, r);
    });
  } catch (e) { console.warn("Kunde inte läsa ifc_looks.json", e); }
  l3look.map = map; l3look.loading = false;
  for (const m of l3b.models) m.lookDone = false;
  if (typeof l3bRecolor === "function") l3bRecolor();
  if (typeof l3Render === "function") l3Render();
}

/* Läggs på modellerna som läses in (anropas från l3bRecolor). */
function l3lookApplyPending() {
  if (typeof projectId === "undefined" || !projectId || typeof token === "undefined" || !token) return;
  if (!l3look.map) { l3lookLoad(); return; }
  if (!l3look.map.size) { l3b.models.forEach(m => { m.lookDone = true; }); return; }
  const touched = [];
  l3b.models.forEach(m => {
    if (m.lookDone) return; m.lookDone = true;
    m.meshes.forEach(x => {
      const u = x.userData.l3b; let any = false;
      u.ranges.forEach((r, ri) => {
        const rec = r.guid && l3look.map.get(r.guid); if (!rec) return;
        if (rec.c) { if (!u.tint) u.tint = new Map(); const c = new THREE.Color(rec.c); u.tint.set(ri, [c.r, c.g, c.b]); any = true; }
        if (rec.a && rec.a < 1) { if (!u.alpha) u.alpha = new Map(); u.alpha.set(ri, rec.a); any = true; }
        if (rec.t && rec.t.id && typeof l3texWrite === "function") { l3texWrite(x, ri, { id: rec.t.id, s: Number(rec.t.s) || 1, k: rec.t.k == null ? 1 : Number(rec.t.k) }); any = true; }
      });
      if (any) touched.push(x);
    });
  });
  if (touched.length) setTimeout(() => { touched.forEach(x => { if (x.parent && typeof l3bApplyHidden === "function") l3bApplyHidden(x); }); if (typeof l3Render === "function") l3Render(); }, 0);
}

/* Något har ändrats på de här objekten (poster med mesh + ri): spara om dem. */
function l3lookTouch(entries) {
  if (typeof projectId === "undefined" || !projectId || typeof token === "undefined" || !token || !entries) return;
  entries.forEach(e => { const r = e.mesh && e.mesh.userData.l3b && e.mesh.userData.l3b.ranges[e.ri]; if (r && r.guid) l3look.dirty.add(r.guid); });
  if (!l3look.dirty.size) return;
  clearTimeout(l3look.timer); l3look.timer = setTimeout(l3lookFlush, 1500);
}
async function l3lookFlush() {
  const want = new Set(l3look.dirty); l3look.dirty.clear(); if (!want.size) return;
  const state = new Map([...want].map(g => [g, null])), needTex = new Set();
  l3b.models.forEach(m => m.meshes.forEach(x => {
    const u = x.userData.l3b;
    u.ranges.forEach((r, ri) => {
      if (!want.has(r.guid)) return;
      const c = u.tint && u.tint.get(ri), a = u.alpha && u.alpha.get(ri), t = u.tex && u.tex.get(ri);
      if (!c && !(a && a < 1) && !t) return;
      const rec = { guid: r.guid }; if (c) rec.c = l3tHex(c); if (a && a < 1) rec.a = a; if (t) { rec.t = { id: t.id, s: t.s, k: t.k }; if (/^u/.test(t.id) && !L3TEX_LIB.some(l => l.id === t.id)) needTex.add(t.id); }
      state.set(r.guid, rec);
    });
  }));
  const defs = [...needTex].map(id => { const u = typeof l3tex !== "undefined" && l3tex.user.find(x => x.id === id); return u ? { guid: "__tex__" + id, name: u.name, data: u.data } : null; }).filter(Boolean);
  const mine = new Set(defs.map(d => d.guid));
  try {
    const next = await ghWriteJSON(token, l3lookPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(r => r && r.guid && !want.has(r.guid) && !mine.has(r.guid)), ...[...state.values()].filter(Boolean), ...defs], "IFC-utseende");
    if (Array.isArray(next) && l3look.map) { const mp = new Map(); next.forEach(r => { if (r && r.guid && !String(r.guid).startsWith("__tex__")) mp.set(r.guid, r); }); l3look.map = mp; }
    if (typeof l3SaveState === "function") l3SaveState("ok", "Utseendet sparat");
  } catch (e) { l3Status("Kunde inte spara färgerna/texturerna: " + (e && e.message ? e.message : e), true); want.forEach(g => l3look.dirty.add(g)); }
}
