/* Placera en IFC-modell (Victor 2026-10-21): modeller som flyttats eller vridits i Trimble Connect hamnade fel när de hämtades ur en mapp,
   eftersom filen inte bär TC:s placering. Nu hämtas placeringen automatiskt från samma modell om den är tänd i TC (se l3bLoad),
   och här kan den justeras för hand: förskjutning i X, Y, Z (meter, projektkoordinater) och vridning runt modellens origo.
   Justeringen sparas på modellen (w.adj) och följer med när den läses in igen. */

/* TC:s placering (mm, refDirection) + justering (m, grader moturs) -> placering som l3bParse använder. */
function l3bPlaceCompose(base, adj) {
  if (!adj || !(adj.x || adj.y || adj.z || adj.rot)) return base || null;
  const b = base || { position: { x: 0, y: 0, z: 0 }, refDirection: { x: 1, y: 0, z: 0 } }, P = b.position || { x: 0, y: 0, z: 0 }, rd = b.refDirection || { x: 1, y: 0, z: 0 };
  const a = Math.atan2(rd.y, rd.x) + (Number(adj.rot) || 0) * Math.PI / 180;
  return { ...b, position: { x: (P.x || 0) + (Number(adj.x) || 0) * 1000, y: (P.y || 0) + (Number(adj.y) || 0) * 1000, z: (P.z || 0) + (Number(adj.z) || 0) * 1000 }, refDirection: { x: Math.cos(a), y: Math.sin(a), z: rd.z || 0 } };
}

function l3bPlaceInfo(w) {
  const pl = w && w.pl;
  if (!pl || !pl.position) return "Ingen placering från Trimble Connect (modellen ligger i filens egna koordinater).";
  const P = pl.position, rd = pl.refDirection || { x: 1, y: 0 }, ang = Math.atan2(rd.y, rd.x) * 180 / Math.PI;
  const f = v => (Number(v || 0) / 1000).toFixed(3).replace(".", ",");
  return `Placering från Trimble Connect: X ${f(P.x)} m, Y ${f(P.y)} m, Z ${f(P.z)} m, vridning ${ang.toFixed(2).replace(".", ",")}°.`;
}

function l3bPlaceDialog(id) {
  const m = l3b.models.find(x => x.id === id), w = m && m.src;
  if (!w) return;
  const adj = { x: 0, y: 0, z: 0, rot: 0, ...(w.adj || {}) }, wrap = document.createElement("div");
  wrap.className = "ui-dlg-wrap";
  const num = v => String(v).replace(".", ",");
  wrap.innerHTML = `<div class="ui-dlg" role="dialog" aria-modal="true" style="max-width:420px">
    <div class="ui-dlg-main"><div class="ui-dlg-title">Placera ${uiEsc(m.name || "modellen")}</div>
    <div class="ui-dlg-body">${uiEsc(l3bPlaceInfo(w))}<br>Flytta modellen här om den är flyttad i Trimble Connect men hamnar fel. Värdena läggs ovanpå placeringen ovan.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">
      ${[["x", "Förskjutning X (m)"], ["y", "Förskjutning Y (m)"], ["z", "Höjd Z (m)"], ["rot", "Vridning (° moturs)"]].map(([k, l]) => `<label style="display:flex;flex-direction:column;font-size:12px;gap:3px">${l}<input type="text" inputmode="decimal" data-pk="${k}" value="${num(adj[k] || 0)}" class="ui-dlg-in" style="margin:0"></label>`).join("")}
    </div>
    <div class="ui-dlg-btns"><button type="button" data-pa="tc" title="Läs placeringen på nytt från Trimble Connect (modellen måste vara tänd där)">Hämta från TC</button><button type="button" data-pa="zero">Nollställ</button><button type="button" class="ui-dlg-cancel" data-pa="cancel">Avbryt</button><button type="button" class="ui-dlg-ok" data-pa="ok">Använd</button></div></div></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("in"));
  const close = () => { wrap.classList.add("out"); setTimeout(() => wrap.remove(), 120); };
  const read = () => { const o = {}; wrap.querySelectorAll("[data-pk]").forEach(i => { const v = parseFloat(String(i.value).replace(/\s/g, "").replace(",", ".")); o[i.dataset.pk] = isFinite(v) ? v : 0; }); return o; };
  const apply = async (next, opts) => { close(); w.adj = next && (next.x || next.y || next.z || next.rot) ? next : null; l3bRemember(w, true); await l3bLoad([w], { replace: true, ...opts }); };
  wrap.querySelectorAll("[data-pa]").forEach(b => { b.onclick = () => {
    const a = b.dataset.pa;
    if (a === "cancel") close(); else if (a === "ok") apply(read()); else if (a === "zero") apply(null);
    else if (a === "tc") { w.pl = null; apply(read(), { freshPlace: true, noCache: true }); }
  }; });
  wrap.addEventListener("keydown", e => { if (e.key === "Escape") close(); else if (e.key === "Enter") apply(read()); });
  const first = wrap.querySelector("[data-pk]"); if (first) first.focus();
}
