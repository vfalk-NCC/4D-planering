/* Renderingsmaterial – egna material och materialredigerare (Victor: "PBR-texturset och materialredigerare").
   Eget material = ett utgångsmaterial ur biblioteket (eller en enfärgad yta) + egna värden för färg, storlek, råhet, metall, genomskinlighet och relief,
   och valfria egna bilder: färgbild (albedo), normalkarta och råhetskarta (t.ex. ett PBR-texturset du själv har hämtat eller fotograferat).
   Allt sparas i projektets renderingsdata (plan.render.custom) och gäller bara renderingen – editorns material rörs inte.
   Bilderna förminskas till högst 768 px (JPEG) för att projektfilen inte ska bli tung. Prefix l3rmed. */

const L3RMED_MAX = 12, L3RMED_PX = 768;
const l3rmedList = () => l3rmData().custom;
const l3rmedClamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };

/* Definitionen (samma form som biblioteket) för ett eget material. Cachas tills materialet ändras (c.v). */
const l3rmedDefs = new Map();
function l3rmCustomDef(id) {
  if (!String(id).startsWith("c_")) return null;
  const c = l3rmedList().find(x => x.id === id); if (!c) return null;
  const key = c.v || 0, hit = l3rmedDefs.get(id); if (hit && hit.v === key) return hit.def;
  const base = c.base ? L3RM_LIB.find(m => m.id === c.base) : null, col = /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#9ca3af", rgb = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16));
  const def = { id: c.id, name: c.name || "Eget material", group: "Egna", size: l3rmedClamp(c.size, 0.05, 50, base ? base.size : 1), rough: l3rmedClamp(c.rough, 0.03, 1, base ? base.rough : 0.7), metal: l3rmedClamp(c.metal, 0, 1, base ? base.metal : 0), op: l3rmedClamp(c.op, 0.05, 1, base ? base.op : 1), bump: l3rmedClamp(c.bump, 0, 2, base ? base.bump : 0), f: base ? base.f : rmPlain(rgb), custom: c };
  l3rmedDefs.set(id, { v: key, def }); return def;
}
/* Ändrad definition: töm texturer, miniatyr och materialcache för materialet. */
function l3rmedInvalidate(id) {
  l3rmedDefs.delete(id); const t = l3rm.texCache.get(id); if (t) { [t.alb, t.nrm, t.rgh].forEach(x => x && x.dispose && x.dispose()); l3rm.texCache.delete(id); }
  l3rm.thumbs.delete(id); [...l3rm.matCache.keys()].forEach(k => { if (k.startsWith(id + "|")) { const m = l3rm.matCache.get(k); m.dispose(); l3rm.matCache.delete(k); } });
}

/* Texturer: egna bilder där de finns, annars procedurellt ur utgångsmaterialet. Bilderna laddas asynkront (l3rmedReady väntar in dem). */
l3rm.pending = l3rm.pending || [];
function l3rmedTex(url, srgb, flipG) {
  const tx = new THREE.Texture(); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = Math.min(8, (l3.renderer && l3.renderer.capabilities.getMaxAnisotropy()) || 4); tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true;
  const img = new Image(); const done = new Promise(res => { img.onload = () => {
    if (flipG) { const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const g = cv.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height); for (let i = 1; i < d.data.length; i += 4) d.data[i] = 255 - d.data[i]; g.putImageData(d, 0, 0); tx.image = cv; } else tx.image = img;
    tx.needsUpdate = true; res(); }; img.onerror = () => res(); });
  img.src = url; l3rm.pending.push(done); return tx;
}
function l3rmCustomTextures(def, procedural) {
  const c = def.custom, M = c.maps || {}, proc = (M.alb && M.nrm) ? null : procedural(def), t = {};
  t.alb = M.alb ? l3rmedTex(M.alb) : proc.alb; t.nrm = M.nrm ? l3rmedTex(M.nrm, false, !!c.flipG) : proc.nrm; if (M.rgh) t.rgh = l3rmedTex(M.rgh);
  if (M.alb) t.alb.userData = { ...t.alb.userData, user: true };
  return t;
}
async function l3rmedReady() { const p = l3rm.pending.splice(0); if (p.length) await Promise.all(p); }

/* Förminskar en bild (File, Blob eller data-URL) → JPEG-data-URL. */
async function l3rmedShrink(src, px = L3RMED_PX) {
  const url = typeof src === "string" ? src : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Kunde inte läsa bilden")); r.readAsDataURL(src); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Filen är ingen bild som webbläsaren kan öppna")); i.src = url; });
  const k = Math.min(1, px / Math.max(img.width, img.height)), cv = document.createElement("canvas"); cv.width = Math.max(2, Math.round(img.width * k)); cv.height = Math.max(2, Math.round(img.height * k));
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL("image/jpeg", 0.88);
}
function l3rmedThumb(dataUrl) { return new Promise(res => { const i = new Image(); i.onload = () => { const cv = document.createElement("canvas"); cv.width = cv.height = 72; cv.getContext("2d").drawImage(i, 0, 0, 72, 72); res(cv.toDataURL("image/jpeg", 0.8)); }; i.onerror = () => res(""); i.src = dataUrl; }); }

/* Skapa/ändra/ta bort (används av redigeraren och MCP). Returnerar materialet. */
function l3rmedSet(o = {}) {
  const L = l3rmedList(); let c = o.id ? L.find(x => x.id === o.id) : null;
  if (!c) { if (L.length >= L3RMED_MAX) throw new Error(`Högst ${L3RMED_MAX} egna material per projekt`); if (o.base && !L3RM_LIB.some(m => m.id === o.base)) throw new Error(`Okänt utgångsmaterial "${o.base}"`); c = { id: "c_" + l3rmId(), name: "Eget material", base: o.base || null, color: "#9ca3af", size: 1, rough: 0.7, metal: 0, op: 1, bump: 0, maps: {}, v: 0 }; const b = o.base ? L3RM_LIB.find(m => m.id === o.base) : null; if (b) { c.name = b.name + " (eget)"; c.size = b.size; c.rough = b.rough; c.metal = b.metal; c.op = b.op; c.bump = b.bump; } L.push(c); l3rmedUi.id = c.id; if (typeof l3rnUi !== "undefined") l3rnUi.mat = c.id; }
  ["name", "color", "base"].forEach(k => { if (o[k] !== undefined) c[k] = o[k]; });
  [["size", 0.05, 50], ["rough", 0.03, 1], ["metal", 0, 1], ["op", 0.05, 1], ["bump", 0, 2]].forEach(([k, a, b]) => { if (o[k] !== undefined) c[k] = l3rmedClamp(o[k], a, b, c[k]); });
  if (o.flipG !== undefined) c.flipG = !!o.flipG; if (o.maps) { c.maps = c.maps || {}; Object.entries(o.maps).forEach(([k, v]) => { if (v) c.maps[k] = v; else delete c.maps[k]; }); }
  if (o.thumb !== undefined) c.thumb = o.thumb || undefined;
  c.v = (c.v || 0) + 1; l3rmedInvalidate(c.id); l3rmSave(); return c;
}
function l3rmedRemove(id) { const d = l3rmData(), n = d.custom.length; d.custom = d.custom.filter(x => x.id !== id); if (d.custom.length === n) return 0; d.rules = d.rules.filter(r => r.mat !== id); d.ground.areas.forEach(a => { if (a.mat === id) a.mat = "gras"; }); if (d.ground.base && d.ground.base.mat === id) d.ground.base = null; l3rmedInvalidate(id); l3rmSave(); return 1; }

/* ---- Redigeraren (visas under materialrutnätet när gruppen "Egna" är vald) ---- */
const l3rmedUi = { id: "" };
function l3rmedForm(body, onChange) {
  const D = l3rmData(), esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"), c = D.custom.find(x => x.id === l3rmedUi.id) || null;
  const box = document.createElement("div"); box.className = "rn-ed";
  const bases = `<option value="">Enfärgad yta</option>` + L3RM_LIB.map(m => `<option value="${m.id}"${c && c.base === m.id ? " selected" : ""}>${esc(m.group + " – " + m.name)}</option>`).join("");
  box.innerHTML = `<div class="rn-sub">Egna material (${D.custom.length}/${L3RMED_MAX})<span><button type="button" id="edNew">＋ Nytt</button>${l3rnUi.mat && L3RM_LIB.some(m => m.id === l3rnUi.mat) ? `<button type="button" id="edDup" title="Kopiera valt biblioteksmaterial och ändra det">Kopiera valt</button>` : ""}</span></div>
    ${c ? `<div class="rn-g rn-edg"><label>Namn<input id="edName" type="text" value="${esc(c.name)}" /></label><label>Utgångspunkt<select id="edBase">${bases}</select></label>
      <label>Färg (enfärgad)<input id="edColor" type="color" value="${esc(c.color || "#9ca3af")}" /></label><label>Storlek (m per upprepning)<input id="edSize" type="number" min="0.05" max="50" step="0.05" value="${c.size}" /></label>
      <label>Råhet <input id="edRough" type="range" min="0.03" max="1" step="0.01" value="${c.rough}" /></label><label>Metall <input id="edMetal" type="range" min="0" max="1" step="0.05" value="${c.metal}" /></label>
      <label>Genomskinlighet (1 = ogenomskinlig) <input id="edOp" type="range" min="0.05" max="1" step="0.05" value="${c.op}" /></label><label>Relief <input id="edBump" type="range" min="0" max="2" step="0.05" value="${c.bump}" /></label></div>
      <div class="rn-edf"><label>Färgbild <input id="edAlb" type="file" accept="image/*" /></label>${c.maps && c.maps.alb ? `<button type="button" data-clr="alb">Ta bort</button>` : ""}
      <label>Normalkarta <input id="edNrm" type="file" accept="image/*" /></label>${c.maps && c.maps.nrm ? `<button type="button" data-clr="nrm">Ta bort</button>` : ""}<label class="rn-chk"><input id="edFlip" type="checkbox"${c.flipG ? " checked" : ""} /> DirectX-normalkarta (vänd grönt)</label>
      <label>Råhetskarta <input id="edRgh" type="file" accept="image/*" /></label>${c.maps && c.maps.rgh ? `<button type="button" data-clr="rgh">Ta bort</button>` : ""}</div>
      <div class="rn-note">Bilderna förminskas till ${L3RMED_PX} px och sparas i projektet. Råhetskartan multipliceras med reglaget Råhet (1 = som kartan). <button type="button" id="edDel" class="rn-danger">Radera materialet</button></div>` : `<div class="rn-note">Välj ett eget material i rutnätet eller tryck ＋ Nytt. Du kan utgå från ett biblioteksmaterial, en enfärgad yta eller egna bilder (färgbild, normalkarta, råhetskarta).</div>`}`;
  const anchor = body.querySelector(".rn-sub"); if (anchor) body.insertBefore(box, anchor); else body.appendChild(box); const q = s => box.querySelector(s);
  q("#edNew").onclick = () => { try { l3rmedSet({ base: null }); } catch (e) { alert(e.message); } };
  const dup = q("#edDup"); if (dup) dup.onclick = () => { try { l3rnUi.grp = "Egna"; l3rmedSet({ base: l3rnUi.mat }); } catch (e) { alert(e.message); } };
  if (!c) return;
  const num = (id, k, f = parseFloat) => { const e = q(id); e.onchange = () => l3rmedSet({ id: c.id, [k]: f(e.value) }); };
  q("#edName").onchange = e => l3rmedSet({ id: c.id, name: e.target.value.trim() || "Eget material" }); q("#edBase").onchange = e => l3rmedSet({ id: c.id, base: e.target.value || null }); q("#edColor").onchange = e => l3rmedSet({ id: c.id, color: e.target.value });
  num("#edSize", "size"); num("#edRough", "rough"); num("#edMetal", "metal"); num("#edOp", "op"); num("#edBump", "bump"); q("#edFlip").onchange = e => l3rmedSet({ id: c.id, flipG: e.target.checked });
  [["#edAlb", "alb"], ["#edNrm", "nrm"], ["#edRgh", "rgh"]].forEach(([id, k]) => { q(id).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const u = await l3rmedShrink(f); l3rmedSet({ id: c.id, maps: { [k]: u }, ...(k === "alb" ? { thumb: await l3rmedThumb(u) } : {}) }); } catch (er) { alert(er.message); } }; });
  box.querySelectorAll("[data-clr]").forEach(b => { b.onclick = () => l3rmedSet({ id: c.id, maps: { [b.dataset.clr]: null }, ...(b.dataset.clr === "alb" ? { thumb: "" } : {}) }); });
  q("#edDel").onclick = () => { if (confirm(`Radera "${c.name}"? Regler som använder det tas bort.`)) { l3rmedRemove(c.id); l3rmedUi.id = ""; } };
}
