/* Datalagret: storlek och städning (Victor 2026-10-20: "optimera sparningen så att programmet inte växer sig större och större").
   Det som växer utan gräns är (1) säkerhetskopiorna – en full kopia av alla datafiler före varje import – och (2) historikfilerna
   (framdrift och datum, en rad per ändring och objekt). Här finns en storleksrapport (rör inget), en rensning av gamla säkerhetskopior
   och en gallring av historiken, båda med förhandsgranskning och bekräftelse. Gallringen tar en säkerhetskopia först.
   histAppendMerged används vid loggning: samma objekt och samma dag ersätter förra raden i stället för att lägga till en ny
   (den allra första raden per objekt behålls alltid – Planstabilitet jämför första och sista raden). */
function histAppendMerged(arr, rows) {
  const out = arr.slice(), last = new Map(), cnt = new Map();
  out.forEach((r, i) => { last.set(r.plan_item_id, i); cnt.set(r.plan_item_id, (cnt.get(r.plan_item_id) || 0) + 1); });
  rows.forEach(n => {
    const i = last.get(n.plan_item_id), c = cnt.get(n.plan_item_id) || 0;
    if (i !== undefined && c >= 2 && String(out[i].recorded_at || "").slice(0, 10) === String(n.recorded_at || "").slice(0, 10)) out[i] = { ...n, id: out[i].id };
    else { out.push(n); last.set(n.plan_item_id, out.length - 1); cnt.set(n.plan_item_id, c + 1); }
  });
  return out;
}

/* ---- GitHub: lista och ta bort ---------------------------------------------------------------------------------------------------------------- */
async function dmListDir(path) {
  const res = await fetch(`${ghContentsUrl(path)}?ref=${GH_BRANCH}`, { headers: ghHeaders(settings.githubToken), cache: "no-store" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Kunde inte lista ${path}: ${res.status}`);
  const j = await res.json(); return Array.isArray(j) ? j : [];
}
async function dmDeleteFile(path, message) {
  const meta = await ghGetMeta(settings.githubToken, path); if (!meta) return true;
  const res = await fetch(ghContentsUrl(path), { method: "DELETE", headers: { ...ghHeaders(settings.githubToken), "Content-Type": "application/json" }, body: JSON.stringify({ message, sha: meta.sha, branch: GH_BRANCH }) });
  return res.ok;
}
const dmMB = b => (b / 1048576).toFixed(b < 1048576 * 10 ? 2 : 1).replace(".", ",") + " MB";

/* ---- Storleksrapport (rör ingenting) ------------------------------------------------------------------------------------------------------ */
async function dmSizes() {
  const root = `projects/${encodeURIComponent(projectId)}`, rows = []; let total = 0;
  const walk = async (dir, depth) => {
    const list = await dmListDir(dir);
    for (const e of list) {
      if (e.type === "dir") { if (depth < 2) { const sub = await walk(e.path, depth + 1); rows.push({ path: e.path + "/", size: sub, dir: true }); } }
      else { rows.push({ path: e.path, size: e.size || 0 }); total += 0; }
    }
    return list.reduce((s, e) => s + (e.type === "dir" ? (rows.find(r => r.path === e.path + "/") || {}).size || 0 : e.size || 0), 0);
  };
  const sum = await walk(root, 0);
  return { rows: rows.sort((a, b) => b.size - a.size), total: sum };
}

/* ---- Säkerhetskopior ------------------------------------------------------------------------------------------------------------------------- */
function dmPickBackups(list, keepN, perMonth, keepManual) {
  const sorted = list.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), keep = new Set();
  sorted.slice(0, Math.max(0, keepN)).forEach(b => keep.add(b.id));
  if (perMonth) { const seen = new Set(); sorted.forEach(b => { const m = String(b.created_at).slice(0, 7); if (!seen.has(m)) { seen.add(m); keep.add(b.id); } }); }
  if (keepManual) sorted.forEach(b => { if (/^manuell/i.test(b.reason || "")) keep.add(b.id); });
  return { keep: sorted.filter(b => keep.has(b.id)), drop: sorted.filter(b => !keep.has(b.id)) };
}
async function dmBackupPlan(keepN, perMonth, keepManual) {
  const idx = await ghReadJSON(settings.githubToken, backupIndexPath()), dir = `${planDir()}/backups`, entries = await dmListDir(dir);
  const sizeOf = new Map(), dirsOf = new Map();
  for (const e of entries) { if (e.type === "dir") dirsOf.set(e.name, e); else sizeOf.set(e.name, e.size || 0); }
  const { keep, drop } = dmPickBackups(idx, keepN, perMonth, keepManual);
  let bytes = 0;
  for (const b of drop) {
    const base = String(b.path).split("/").pop(), d = dirsOf.get(base.replace(/\.json$/, ""));
    b._file = b.path; b._size = sizeOf.get(base) || 0;
    if (d) { b._dir = d.path; b._dirFiles = await dmListDir(d.path); b._size += b._dirFiles.reduce((s, f) => s + (f.size || 0), 0); }
    bytes += b._size;
  }
  return { keep, drop, bytes, total: idx.length };
}
async function dmDeleteBackups(drop, onProgress) {
  let done = 0, failed = 0; const gone = new Set();
  for (const b of drop) {
    let ok = true;
    for (const f of b._dirFiles || []) ok = (await dmDeleteFile(f.path, "Rensa gammal säkerhetskopia")) && ok;
    ok = (await dmDeleteFile(b._file, "Rensa gammal säkerhetskopia")) && ok;
    if (ok) gone.add(b.id); else failed++;
    done++; onProgress && onProgress(done, drop.length);
  }
  if (gone.size) await ghWriteJSON(settings.githubToken, backupIndexPath(), arr => arr.filter(b => !gone.has(b.id)), "Rensa gamla säkerhetskopior");
  return { removed: gone.size, failed };
}

/* Automatisk gallring (Victor 2026-10-27: "se till att det inte i bakgrunden sparas massa onödiga filer"): efter varje ny säkerhetskopia
   rensas de gamla bort i bakgrunden – de 8 senaste, en per månad och alla manuella behålls (samma regler som rensningen nedan). Tyst; fel
   stoppar inget. Körs bara när det finns fler än 10, så den vanliga importen får inget extra jobb. */
async function dmAutoPruneBackups() {
  try {
    const idx = await ghReadJSON(settings.githubToken, backupIndexPath());
    if (!Array.isArray(idx) || idx.length <= 10) return;
    const plan = await dmBackupPlan(8, true, true);
    if (!plan.drop.length) return;
    const r = await dmDeleteBackups(plan.drop);
    console.info(`Säkerhetskopior: ${r.removed} gamla rensades automatiskt (${dmMB(plan.bytes)})${r.failed ? `, ${r.failed} gick inte` : ""}.`);
  } catch (e) { console.warn("Automatisk gallring av säkerhetskopior misslyckades", e); }
}

/* ---- Historik ----------------------------------------------------------------------------------------------------------------------------------- */
const dmWeek = iso => { const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = Date.UTC(d.getUTCFullYear(), 0, 1); return d.getUTCFullYear() + "-" + Math.ceil(((d - y) / 864e5 + 1) / 7); };
/* Ren funktion: rader som ska finnas kvar. Första och sista raden per objekt, allt nyare än cutoff, och för äldre rader den sista per vecka. */
function dmThinHistory(rows, cutoffIso, validIds) {
  const by = new Map();
  rows.forEach(r => { if (validIds && !validIds.has(String(r.plan_item_id))) return; (by.get(r.plan_item_id) || by.set(r.plan_item_id, []).get(r.plan_item_id)).push(r); });
  const keep = new Set();
  by.forEach(list => {
    list.sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
    keep.add(list[0]); keep.add(list[list.length - 1]);
    const perWeek = new Map();
    list.forEach(r => { if (String(r.recorded_at).slice(0, 10) >= cutoffIso) keep.add(r); else perWeek.set(dmWeek(r.recorded_at), r); });
    perWeek.forEach(r => keep.add(r));
  });
  return rows.filter(r => keep.has(r));
}
async function dmHistoryPlan(days, dropOrphans) {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), valid = dropOrphans && items.length ? new Set(items.map(i => String(i.id))) : null, out = [];
  for (const [label, path] of [["Framdrift", progressHistoryPath()], ["Datum (baseline)", baselineHistoryPath()]]) {
    const rows = await ghReadJSON(settings.githubToken, path), next = dmThinHistory(rows, cutoff, valid);
    out.push({ label, path, before: rows.length, after: next.length, bytes: JSON.stringify(rows).length - JSON.stringify(next).length });
  }
  return { cutoff, valid, files: out };
}

/* ---- Gränssnittet ------------------------------------------------------------------------------------------------------------------------------ */
function initDataMaintenance() {
  const box = document.getElementById("dmBox"); if (!box || box.dataset.w) return; box.dataset.w = "1";
  const q = id => box.querySelector("#" + id), out = q("dmOut"), say = h => { out.innerHTML = h; };
  const need = () => { if (!isBackendConfigured()) { say(`<div class="hint">Ingen databas ansluten.</div>`); return false; } return true; };
  q("dmSizesBtn").onclick = async () => {
    if (!need()) return; say(`<div class="hint">Läser storlekar …</div>`);
    try { const r = await dmSizes();
      say(`<div class="hint"><b>Totalt ${dmMB(r.total)}</b> i projektets mapp. Störst först:</div><table class="dm-t">${r.rows.slice(0, 25).map(x => `<tr><td>${escapeHtml(x.path.replace(/^projects\/[^/]+\//, ""))}</td><td>${dmMB(x.size)}</td></tr>`).join("")}</table>`);
    } catch (e) { say(`<div class="hint">Kunde inte läsa: ${escapeHtml(e.message)}</div>`); }
  };
  q("dmBkPreview").onclick = async () => {
    if (!need()) return; say(`<div class="hint">Räknar …</div>`);
    try {
      const p = await dmBackupPlan(Number(q("dmKeepN").value) || 10, q("dmPerMonth").checked, q("dmKeepManual").checked);
      if (!p.drop.length) { say(`<div class="hint">Inget att rensa: alla ${p.total} säkerhetskopior behålls.</div>`); return; }
      say(`<div class="hint">${p.drop.length} av ${p.total} säkerhetskopior tas bort (≈ ${dmMB(p.bytes)}). ${p.keep.length} behålls.</div><button type="button" id="dmBkGo" class="danger">Rensa ${p.drop.length} säkerhetskopior</button>`);
      q("dmBkGo").onclick = async () => {
        if (!confirm(`Ta bort ${p.drop.length} gamla säkerhetskopior (≈ ${dmMB(p.bytes)})?\n\nDe finns kvar i GitHubs commit-historik men syns inte längre i listan.`)) return;
        q("dmBkGo").disabled = true;
        const r = await dmDeleteBackups(p.drop, (d, n) => say(`<div class="hint">Rensar … ${d} av ${n}</div>`));
        say(`<div class="hint">Klart: ${r.removed} säkerhetskopior borttagna${r.failed ? `, ${r.failed} kunde inte tas bort` : ""}.</div>`);
        if (typeof renderBackupList === "function") renderBackupList();
      };
    } catch (e) { say(`<div class="hint">Kunde inte förhandsgranska: ${escapeHtml(e.message)}</div>`); }
  };
  q("dmHiPreview").onclick = async () => {
    if (!need()) return; say(`<div class="hint">Räknar …</div>`);
    try {
      const days = Number(q("dmDays").value) || 90, p = await dmHistoryPlan(days, q("dmOrphans").checked), rm = p.files.reduce((s, f) => s + f.before - f.after, 0);
      if (!rm) { say(`<div class="hint">Inget att gallra i historiken.</div>`); return; }
      say(`<div class="hint">${p.files.map(f => `${f.label}: ${f.before} → ${f.after} rader`).join(" · ")} (≈ ${dmMB(p.files.reduce((s, f) => s + f.bytes, 0))} mindre). Detaljerna för de senaste ${days} dagarna, första och sista raden per objekt och en rad per vecka för äldre behålls.</div><button type="button" id="dmHiGo" class="danger">Gallra historiken</button>`);
      q("dmHiGo").onclick = async () => {
        if (!confirm(`Gallra historiken (${rm} rader tas bort)?\n\nEn säkerhetskopia tas först.`)) return;
        q("dmHiGo").disabled = true; say(`<div class="hint">Tar säkerhetskopia …</div>`);
        try {
          await createBackup("Före gallring av historik");
          for (const f of p.files) await ghWriteJSON(settings.githubToken, f.path, arr => dmThinHistory(arr, p.cutoff, p.valid), "Gallra historik");
          say(`<div class="hint">Klart: ${rm} rader borttagna ur historiken.</div>`);
          if (typeof renderBackupList === "function") renderBackupList();
        } catch (e) { say(`<div class="hint">Gallringen misslyckades: ${escapeHtml(e.message)}</div>`); }
      };
    } catch (e) { say(`<div class="hint">Kunde inte förhandsgranska: ${escapeHtml(e.message)}</div>`); }
  };
}
document.addEventListener("DOMContentLoaded", initDataMaintenance);
if (document.readyState !== "loading") initDataMaintenance();
