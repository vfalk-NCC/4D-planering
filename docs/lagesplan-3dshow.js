/* 3D-vyn – Visa-menyn som en samlad, smart dropdown (Victor 2026-11-13: "väldigt smart … gjord av en riktig fullstack grafisk developer").
   Allt som styr vad som visas ligger här i ett enda fönster: sökfält överst, sektioner som fälls ut/ihop (minns hur du lämnade dem), en liten räknare per sektion
   ("2 på"), snabbknappar för att fälla alla, och en ren design med reglage, segmentval och tydliga rader. Menyns befintliga reglage och id:n är orörda – sektionerna byggs
   av menyns egna rubriker (.v3-pop-l och Visning-menyns .v3-orig-h), så allt som bindes av andra moduler fungerar som förut. Prefix l3sh. */
const L3SH_ORDER = ["Visning", "Visningsläge", "Rutnät", "Fler val", "Byggnad", "Övrigt", "Bakgrund", "Djup", "Mus", "Ritning"];
const L3SH_OPEN0 = ["Visning", "Visningsläge", "Rutnät", "Byggnad"];
const L3SH_ICO = {
  Visning: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  Visningsläge: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  Rutnät: '<path d="M4 4h16v16H4z"/><path d="M4 12h16M12 4v16"/>',
  "Fler val": '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  Byggnad: '<path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-5h6v5M8 10h2M14 10h2"/>',
  Övrigt: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  Bakgrund: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 15c4-5 7 2 11-2 3-3 5 0 7 1"/>',
  Djup: '<path d="M12 3v18"/><path d="M5 8l7-5 7 5M5 16l7 5 7-5"/>',
  Mus: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v6"/>',
  Ritning: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
};
const l3shState = { open: null, q: "" };
function l3shLoad() { if (l3shState.open) return; let a = null; try { a = JSON.parse(localStorage.getItem("l3sh-open") || "null"); } catch (e) { /* privat läge */ } l3shState.open = new Set(Array.isArray(a) ? a : L3SH_OPEN0); }
function l3shSave() { try { localStorage.setItem("l3sh-open", JSON.stringify([...l3shState.open])); } catch (e) { /* privat läge */ } }
const l3shChev = '<svg viewBox="0 0 24 24" class="sh-chev" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
function l3shSecEl(name) {
  const s = document.createElement("section"); s.className = "sh-sec"; s.dataset.sec = name; const ic = L3SH_ICO[name] || L3SH_ICO["Övrigt"];
  s.innerHTML = `<button type="button" class="sh-h" aria-expanded="false"><svg viewBox="0 0 24 24" class="sh-ic" aria-hidden="true">${ic}</svg><b class="sh-t">${name}</b><i class="sh-n" hidden></i>${l3shChev}</button><div class="sh-w"><div class="sh-b"></div></div>`;
  s.querySelector(".sh-h").onclick = e => { e.stopPropagation(); const open = !l3shState.open.has(name); if (open) l3shState.open.add(name); else l3shState.open.delete(name); l3shSave(); l3shApply(); };
  return s;
}
/* Grupperar en containers barn i [{ name, nodes }] efter rubrikklassen. */
function l3shGroups(cont, hCls) { const out = []; let cur = null; [...cont.childNodes].forEach(n => { if (n.nodeType === 1 && n.classList.contains(hCls)) { cur = { name: n.textContent.trim(), nodes: [] }; out.push(cur); n.remove(); } else if (cur && !(n.nodeType === 3 && !n.textContent.trim())) cur.nodes.push(n); }); return out; }
function l3shPut(body, name, nodes) {
  let sec = body.querySelector(`.sh-sec[data-sec="${CSS.escape(name)}"]`);
  if (!sec) { sec = l3shSecEl(name); const i = L3SH_ORDER.indexOf(name), after = [...body.children].find(c => { const j = L3SH_ORDER.indexOf(c.dataset.sec); return (i < 0 ? 999 : i) < (j < 0 ? 999 : j); }); body.insertBefore(sec, after || null); }
  const b = sec.querySelector(".sh-b"); b.replaceChildren(...nodes); return sec;
}
/* Bygger (en gång) sökfältet och sektionerna av menyns statiska innehåll; körs om efter varje ny rendering av Visning-delen. */
function l3shEnhance() {
  const pop = document.getElementById("v3Show"); if (!pop) return; l3shLoad();
  let head = pop.querySelector("#v3ShHead"), body = pop.querySelector("#v3ShBody");
  if (!head) {
    pop.classList.add("sh-pop");
    head = document.createElement("div"); head.id = "v3ShHead"; head.className = "sh-head";
    head.innerHTML = `<div class="sh-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg><input type="search" id="v3ShQ" placeholder="Sök inställning…" autocomplete="off" spellcheck="false" aria-label="Sök bland visningsinställningar" /></div><div class="sh-tools"><button type="button" id="v3ShAll" title="Fäll ut alla sektioner">Fäll ut</button><button type="button" id="v3ShNone" title="Fäll ihop alla sektioner">Fäll ihop</button></div>`;
    body = document.createElement("div"); body.id = "v3ShBody"; body.className = "sh-body";
    const keep = pop.querySelector("#v3OrigIn"); if (keep) keep.classList.add("sh-stage");
    const rest = [...pop.childNodes].filter(n => n !== keep); const tmp = document.createElement("div"); tmp.append(...rest);
    pop.prepend(head); pop.append(body);
    l3shGroups(tmp, "v3-pop-l").forEach(g => l3shPut(body, g.name, g.nodes));
    const q = head.querySelector("#v3ShQ"); q.oninput = () => { l3shState.q = q.value; l3shApply(); }; q.onkeydown = e => { if (e.key === "Escape" && q.value) { e.stopPropagation(); q.value = ""; l3shState.q = ""; l3shApply(); } };
    head.querySelector("#v3ShAll").onclick = e => { e.stopPropagation(); body.querySelectorAll(".sh-sec").forEach(s => l3shState.open.add(s.dataset.sec)); l3shSave(); l3shApply(); };
    head.querySelector("#v3ShNone").onclick = e => { e.stopPropagation(); l3shState.open.clear(); l3shSave(); l3shApply(); };
    pop.addEventListener("change", () => setTimeout(l3shCounts, 0)); pop.addEventListener("click", () => setTimeout(l3shCounts, 30));
  }
  const stage = pop.querySelector("#v3OrigIn");
  if (stage && stage.children.length) { l3shGroups(stage, "v3-orig-h").forEach(g => l3shPut(body, g.name, g.nodes)); [...stage.childNodes].forEach(n => n.remove()); }
  l3shApply();
}
function l3shCounts() {
  document.querySelectorAll("#v3ShBody .sh-sec").forEach(s => { const on = s.querySelectorAll('.sh-b input[type="checkbox"]:checked').length, n = s.querySelector(".sh-n"); if (!n) return; n.hidden = !on; n.textContent = on + " på"; });
}
function l3shApply() {
  const body = document.getElementById("v3ShBody"); if (!body) return; const q = l3shState.q.trim().toLowerCase(); let any = false;
  body.querySelectorAll(".sh-sec").forEach(s => {
    const name = s.dataset.sec, kids = [...s.querySelector(".sh-b").children]; let hit = 0;
    kids.forEach(k => { const m = !q || k.textContent.toLowerCase().includes(q) || name.toLowerCase().includes(q) || [...k.querySelectorAll("[title]")].some(x => (x.title || "").toLowerCase().includes(q)); k.classList.toggle("sh-off", !m); if (m) hit++; });
    const show = !q || hit > 0, open = q ? hit > 0 : l3shState.open.has(name); s.hidden = !show; s.classList.toggle("open", open); s.querySelector(".sh-h").setAttribute("aria-expanded", open ? "true" : "false"); if (show) any = true;
  });
  let em = body.querySelector(".sh-empty"); if (!any) { if (!em) { em = document.createElement("div"); em.className = "sh-empty"; body.append(em); } em.textContent = `Inget matchar ”${l3shState.q}”.`; } else if (em) em.remove();
  l3shCounts();
}
