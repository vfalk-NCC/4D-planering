/* Excel-koppling (Victors önskemål 2026-10-02, fullskaligt test).
   I 4-veckorsplaneringen (.xlsm) finns makrot Koppling4D (docs/excel/Koppling4D.bas):
   - "Skicka till 4D" laddar upp arbetsboken till projects/<id>/excel_inbox/ med
     meta.json (när, vem, fil). Här visas då "Ny planering från Excel" med
     samma förhandsgranskning som en vanlig import.
   - "Hämta framdrift från 4D" läser plan_items/plan_item_activities och skriver
     framdriften på rätt rad (excel_sheet/excel_map, sparas vid importen). */

const excelInboxDir = () => `projects/${encodeURIComponent(projectId)}/excel_inbox`;
let excelInboxMeta = null;

let excelInboxCheckedAt = 0;
async function checkExcelInbox(force) {
  const box = document.getElementById("excelInbox");
  if (!box || !isBackendConfigured() || !projectId) return;
  if (!force && Date.now() - excelInboxCheckedAt < 60000) return;
  excelInboxCheckedAt = Date.now();
  try {
    const { data } = await ghGetFile(settings.githubToken, `${excelInboxDir()}/meta.json`, { fresh: true });
    excelInboxMeta = data && data.sent_at && data.path ? data : null;
  } catch (e) { excelInboxMeta = null; }
  const done = lastPlanImport && lastPlanImport.inbox_sent_at;
  const fresh = excelInboxMeta && (!done || done < excelInboxMeta.sent_at);
  if (!excelInboxMeta) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const when = formatDateTime(excelInboxMeta.sent_at);
  box.classList.remove("hidden");
  box.classList.toggle("fresh", !!fresh);
  box.innerHTML = fresh
    ? `<div>📄 <b>Ny planering från Excel</b> – ${escapeHtml(excelInboxMeta.file || "planering")}, skickad ${escapeHtml(when)}${excelInboxMeta.by ? ` av ${escapeHtml(excelInboxMeta.by)}` : ""}.</div>
       <div class="row"><button type="button" id="btnExcelInboxImport" class="primary">Granska och importera</button></div>`
    : `<div class="hint">✓ Senaste planeringen från Excel (${escapeHtml(when)}) är importerad.</div>
       <div class="row"><button type="button" id="btnExcelInboxImport">Granska igen</button></div>`;
  document.getElementById("btnExcelInboxImport").onclick = importFromExcelInbox;
}
async function importFromExcelInbox() {
  if (!excelInboxMeta) return;
  const status = document.getElementById("planImportStatus");
  status.innerText = "Hämtar planeringen som skickades från Excel...";
  try {
    const url = await ghReadBinaryUrl(settings.githubToken, excelInboxMeta.path);
    const buf = await (await fetch(url)).arrayBuffer();
    URL.revokeObjectURL(url);
    await importPlanFromBuffer(buf, excelInboxMeta.file || "Excel", excelInboxMeta);
  } catch (e) {
    console.error(e);
    status.innerText = "Kunde inte hämta filen från Excel: " + e.message;
  }
}
/* Instruktionen: projekt-id att klistra in i Excel och länk till makrot. */
function renderExcelLinkHelp() {
  const el = document.getElementById("excelLinkProject");
  if (el) el.textContent = projectId || "–";
  const btn = document.getElementById("btnCopyProjectId");
  if (btn) btn.onclick = async () => {
    try { await navigator.clipboard.writeText(projectId || ""); btn.textContent = "✓ Kopierat"; setTimeout(() => { btn.textContent = "Kopiera"; }, 1500); }
    catch (e) { prompt("Kopiera projekt-id:", projectId || ""); }
  };
}
