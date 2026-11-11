/* Av/på-switch på varje avsnitt i Kommentarer & Mått (Victor 2026-11-11: "on/off switch på mått, foton osv så att jag kan släcka hela avsnittet snabbt").
   Kommentarer, Mått, Foton och Körvägar får en switch på rubrikraden. Den använder avsnittens egna tänd/släck-funktioner, så allt hänger ihop med de
   befintliga knapparna ("Visa i 3D", "Dölj måtten", körvägens "linje"). Läggs på efter att fliken ritats (l3kRenderTab omsluten). Prefix l3ss. */
const L3SS = [
  { head: "#v3KListHead", name: "kommentarerna", on: () => !l3k.hidden, count: () => l3k.list.length, set: v => { l3k.hidden = !v; if (!v && typeof l3kClose === "function") l3kClose(); l3kDraw(); } },
  { head: "#v3MeasHead", name: "måtten", on: () => !l3mAllHidden(), count: () => l3m.list.length, set: v => l3mToggle(v) },
  { head: "#v3PhHead", name: "fotona", on: () => l3phOn(), count: () => l3phList().length, set: v => l3phToggle(v) },
  { head: "#v3RtHead", name: "körvägarna", on: () => l3rt.list.some(r => r.show !== false), count: () => l3rt.list.length, set: v => { l3rt.list.forEach(r => { if (r.show === v || (v === true && r.show === undefined)) return; r.show = v; if (typeof l3rtWriteSoon === "function") l3rtWriteSoon(r); }); l3rtLines(); } },
];
function l3ssApply(host) {
  host = host || document.getElementById("v3PalComments"); if (!host) return;
  L3SS.forEach(s => {
    const h = host.querySelector(s.head); if (!h || h.parentElement.classList.contains("v3-ss-row")) return;
    let on = true, n = 0; try { on = !!s.on(); n = s.count(); } catch (e) { return; }
    // Samma pill som i Lager: rubrik, antal och switch ligger i en och samma ruta.
    h.className = "v3-lsec-t"; const sp = h.querySelector("span"); if (sp) { const em = document.createElement("em"); em.className = "v3-lsec-n"; em.innerHTML = sp.innerHTML; sp.replaceWith(em); }
    const row = document.createElement("div"); row.className = "v3-lg v3-lsec-h v3-ss-row"; h.parentElement.insertBefore(row, h); row.appendChild(h);
    const lb = document.createElement("label"); lb.className = "v3-lay-sw"; lb.title = n ? `${on ? "Släck" : "Tänd"} alla ${s.name} i 3D` : `Inga ${s.name} än`;
    lb.innerHTML = `<input type="checkbox" role="switch" ${on || !n ? "checked" : ""} ${n ? "" : "disabled"} aria-label="Visa ${s.name} i 3D" /><i></i>`;
    lb.addEventListener("click", e => e.stopPropagation());
    lb.querySelector("input").onchange = e => { try { s.set(e.target.checked); } catch (er) { console.warn(er); } if (typeof l3kRenderTab === "function") l3kRenderTab(); if (typeof l3Render === "function") l3Render(); };
    row.appendChild(lb);
  });
}
const l3ssWrap = () => { const f = window.l3kRenderTab; if (typeof f !== "function" || f.__ss) return; const w = function () { const r = f.apply(this, arguments); try { l3ssApply(); } catch (e) { console.warn("Avsnittsswitch", e); } return r; }; w.__ss = true; window.l3kRenderTab = w; };
if (document.readyState === "complete") l3ssWrap(); else window.addEventListener("load", l3ssWrap);
