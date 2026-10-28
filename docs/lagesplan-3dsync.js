/* Tidsreglaget: en snygg, subtil förloppsstapel medan 4D-kopplingen uppdateras (Victor 2026-10-28: "när jag kopplar i slidern vill jag få fram en snygg
   subtil laddningsbar … så att jag kan se progress").
   När datumet ändras byggs etableringen, byggnadens statusfärger (bit för bit), etableringens 4D-läge och upplagen om. I stora modeller tar det en stund –
   nu görs det med andrum emellan (reglaget hänger inte) och en tunn stapel under reglaget fylls på. Går det snabbt (< 0,25 s) syns ingenting.
   Rör man reglaget igen medan det pågår avbryts det gamla och det nya tar vid. */
const l3sd = { tok: 0, t0: 0, shown: false, hideT: 0 };
function l3sdEls() {
  const host = document.querySelector("#view3d .v3-dsl"); if (!host) return null;
  let bar = host.querySelector(".v3-dsl-prog"), lab = host.querySelector(".v3-dsl-lab");
  if (!bar) { bar = document.createElement("i"); bar.className = "v3-dsl-prog"; host.appendChild(bar); }
  if (!lab) { lab = document.createElement("span"); lab.className = "v3-dsl-lab"; host.appendChild(lab); }
  return { bar, lab };
}
function l3sdShow(f, text) {
  const e = l3sdEls(); if (!e) return;
  clearTimeout(l3sd.hideT);
  const slow = performance.now() - l3sd.t0 > 250;
  e.bar.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + "%"; e.bar.style.opacity = slow ? "1" : "0";
  e.lab.textContent = slow ? `${text || "Uppdaterar 4D"} ${Math.round(f * 100)} %` : ""; e.lab.style.opacity = slow ? "1" : "0";
}
function l3sdDone() {
  const e = l3sdEls(); if (!e) return;
  e.bar.style.width = "100%"; clearTimeout(l3sd.hideT);
  l3sd.hideT = setTimeout(() => { e.bar.style.opacity = "0"; e.lab.style.opacity = "0"; setTimeout(() => { if (!l3sd.hideT) return; e.bar.style.width = "0%"; }, 400); }, 220);
}
const l3sdYield = () => new Promise(r => requestAnimationFrame(() => r()));
/* Datumet i dateInput gäller. cb körs när allt är klart (om det inte hunnit ersättas av en nyare ändring). */
async function l3DaySync(cb) {
  const tok = ++l3sd.tok, stale = () => tok !== l3sd.tok;
  l3sd.t0 = performance.now();
  try {
    l3sdShow(0.03);
    l3BuildObjects(); l3sdShow(0.1, "Uppdaterar etableringen");
    if (typeof l3bRecolor === "function") {
      await l3sdYield(); if (stale()) return;
      await l3bRecolor({ async: true, cancelled: stale, onProg: f => l3sdShow(0.1 + 0.72 * f, "Färgar byggnaden") });
      if (stale()) return;
    }
    await l3sdYield(); if (stale()) return;
    l3sdShow(0.86, "Uppdaterar etableringen"); l3Etab4dAll();
    if (typeof l3StorageBuild === "function") { l3sdShow(0.94, "Uppdaterar upplagen"); l3StorageBuild(); }
    l3sdShow(1);
    if (cb) cb();
    l3Render();
    l3sdDone();
  } catch (e) { console.warn("Tidsreglaget", e); l3sdDone(); }
}
