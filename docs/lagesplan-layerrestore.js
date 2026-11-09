/* Återställ lager, mappar och sparade vyer från tidigare versioner (Victor 2026-11-09: "jag tappade mapparna och alla sparade vyer – se till att det inte händer igen").
   Projektets lagerfil (site_layers.json) har en versionshistorik i GitHub. Här listas de senaste versionerna; välj en så visas vad som finns där men saknas nu
   (mappar, sparade vyer, DXF-lager, ortofoton, utskriftsmallar, ritade objekt) och du lägger tillbaka det du vill. Inget som redan finns skrivs över. */
const LR_LABEL = { layermeta: "Mappar och visningsnamn", objview: "Sparade vyer", cad: "DXF-lager", ortho: "Ortofoton", printtpl: "Utskriftsmallar", layer: "Egna lager" };
const lrType = r => LR_LABEL[r.type] ? r.type : "obj";
const lrName = t => t === "obj" ? "Ritade objekt (etablering, noteringar …)" : LR_LABEL[t];
async function lrCommits() {
  const res = await ghFetchRetry(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/commits?path=${encodeURIComponent("projects/" + projectId + (typeof planSource !== "undefined" && false ? "" : "") + "/site_layers.json")}&sha=${GH_BRANCH}&per_page=40`, { headers: ghHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error("Kunde inte läsa versionerna (" + res.status + ")");
  return (await res.json()).map(c => ({ sha: c.sha, at: (c.commit && c.commit.author && c.commit.author.date) || "", msg: (c.commit && c.commit.message || "").split("\n")[0] }));
}
async function lrFetch(sha) {
  const url = `${ghContentsUrl(sitePath())}?ref=${sha}`;
  const res = await ghFetchRetry(url, { headers: ghHeaders(token), cache: "no-store" }); if (!res.ok) throw new Error("Kunde inte läsa versionen (" + res.status + ")");
  const json = await res.json(); let text;
  if (json.content) text = await ghB64ToText(json.content); else { const raw = await ghFetchRetry(url, { headers: ghHeaders(token, "application/vnd.github.raw"), cache: "no-store" }); if (!raw.ok) throw new Error("Kunde inte läsa versionen (" + raw.status + ")"); text = await ghDecodeRaw(raw); }
  const arr = text.trim() ? JSON.parse(text) : []; return Array.isArray(arr) ? arr : [];
}
/* Det som finns i den äldre versionen men saknas nu: { typ: [poster] }. Mappar (layermeta) räknas som saknade om någon mapp, något visningsnamn eller någon mapptillhörighet saknas. */
function lrMissing(old) {
  const have = new Map(siteItems.map(r => [r.id, r])), out = {};
  old.forEach(r => {
    if (r.id === META_ID) { const cur = have.get(META_ID), curIds = new Set(((cur && cur.folders) || []).map(f => f.id)), miss = (r.folders || []).filter(f => !curIds.has(f.id)); if (miss.length || !cur) (out.layermeta = out.layermeta || []).push(r); return; }
    if (!have.has(r.id)) (out[lrType(r)] = out[lrType(r)] || []).push(r);
  });
  return out;
}
function lrMergeMeta(old) { const cur = layerMeta(); const ids = new Set(cur.folders.map(f => f.id)); return { ...cur, folders: [...cur.folders, ...(old.folders || []).filter(f => !ids.has(f.id)).map(f => ({ ...f }))], folderOf: { ...(old.folderOf || {}), ...cur.folderOf }, names: { ...(old.names || {}), ...cur.names } }; }
/* Skriver först till lagret (så att en ritfel i panelen aldrig kan hindra återställningen) och uppdaterar sedan vyn. */
async function lrSave(recs, message) {
  const ids = new Set(recs.map(r => r.id));
  await ghWriteJSON(token, sitePath(), arr => [...arr.filter(x => !ids.has(x.id)), ...recs], message);
  siteItems = [...siteItems.filter(x => !ids.has(x.id)), ...recs];
  try { renderLayerPanel(); renderZones(); } catch (e) { console.error(e); }
}
async function lrOpen() {
  const el = document.createElement("div"); el.className = "na-modal"; el.innerHTML = `<div class="na-card" role="dialog" aria-label="Återställ lager" style="max-width:520px"><h3>Återställ lager från tidigare version</h3><p>Hämtar versionerna …</p><div class="na-btns"><button type="button" data-lr-x>Stäng</button></div></div>`;
  document.body.appendChild(el); const card = el.querySelector(".na-card"), close = () => el.remove(); el.querySelector("[data-lr-x]").onclick = close; el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  const head = `<h3>Återställ lager från tidigare version</h3>`;
  try {
    const list = await lrCommits();
    if (!list.length) { card.innerHTML = head + `<p>Hittar ingen versionshistorik för lagerfilen.</p><div class="na-btns"><button type="button" data-lr-x>Stäng</button></div>`; card.querySelector("[data-lr-x]").onclick = close; return; }
    card.innerHTML = head + `<p>Välj en version att hämta från. Därefter får du se vad som saknas nu och välja vad som ska läggas tillbaka.</p><div style="max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:4px">${list.map((c, i) => `<button type="button" data-lr-v="${i}" style="text-align:left;padding:6px 8px"><b>${escHtml(String(c.at).slice(0, 16).replace("T", " "))}</b> <span style="color:#64748b">${escHtml(c.msg)}</span></button>`).join("")}</div><div class="na-btns"><button type="button" data-lr-x>Stäng</button></div>`;
    card.querySelector("[data-lr-x]").onclick = close;
    card.querySelectorAll("[data-lr-v]").forEach(b => { b.onclick = async () => {
      card.querySelectorAll("button").forEach(x => x.disabled = true); const c = list[+b.dataset.lrV];
      try {
        const old = await lrFetch(c.sha), miss = lrMissing(old), types = Object.keys(miss);
        if (!types.length) { card.innerHTML = head + `<p>Version ${escHtml(String(c.at).slice(0, 16).replace("T", " "))} innehåller inget som saknas nu (${old.length} poster).</p><div class="na-btns"><button type="button" data-lr-x>Stäng</button></div>`; card.querySelector("[data-lr-x]").onclick = close; return; }
        card.innerHTML = head + `<p>Det här saknas nu jämfört med ${escHtml(String(c.at).slice(0, 16).replace("T", " "))}. Välj vad som ska läggas tillbaka (det som redan finns rörs inte):</p><div style="display:flex;flex-direction:column;gap:4px">${types.map(t => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-lr-t="${t}" checked style="width:auto"> <b>${miss[t].length}</b> ${escHtml(lrName(t))}${t === "layermeta" ? ` <span style="color:#64748b">(${(miss.layermeta[0].folders || []).length} mappar i den versionen)</span>` : ""}</label>`).join("")}</div><div class="na-btns"><button type="button" data-lr-x>Avbryt</button><button type="button" class="primary" data-lr-go>Lägg tillbaka</button></div>`;
        card.querySelector("[data-lr-x]").onclick = close;
        card.querySelector("[data-lr-go]").onclick = async () => {
          const chosen = [...card.querySelectorAll("[data-lr-t]")].filter(i => i.checked).map(i => i.dataset.lrT || i.dataset.lrT), recs = [];
          [...card.querySelectorAll("[data-lr-t]")].filter(i => i.checked).forEach(i => { const t = i.dataset.lrT; (miss[t] || []).forEach(r => recs.push(t === "layermeta" ? lrMergeMeta(r) : r)); });
          void chosen; if (!recs.length) { close(); return; }
          card.querySelectorAll("button").forEach(x => x.disabled = true);
          try { await lrSave(recs, `Lägesplan: återställ ${recs.length} poster från tidigare version`); setSaveStatus(`⟲ ${recs.length} poster återställda från ${String(c.at).slice(0, 16).replace("T", " ")}.`); } catch (e) { (console.error(e), setSaveStatus("⚠ Kunde inte återställa: " + e.message)); }
          close();
        };
      } catch (e) { card.innerHTML = head + `<p>⚠ ${escHtml(e.message)}</p><div class="na-btns"><button type="button" data-lr-x>Stäng</button></div>`; card.querySelector("[data-lr-x]").onclick = close; }
    }; });
  } catch (e) { card.innerHTML = head + `<p>⚠ ${escHtml(e.message)}</p><div class="na-btns"><button type="button" data-lr-x>Stäng</button></div>`; card.querySelector("[data-lr-x]").onclick = close; }
}
(function lrBind() { const go = () => { const b = document.getElementById("btnLayerRestore"); if (b) b.onclick = lrOpen; }; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go(); })();
