/* Samma avsnittsdesign överallt (Victor 2026-11-11: "exakt så som under Lager ska det vara på kommentarer och mått, 3D-bibliotek och 4D-planering").
   Korten i fliken 4D-planering (Tidsintervall, Grafik i filmen, Kameravyer, Spara …) får samma fällbara pill som Lager: pil, rubrik och
   (där det finns) reglage i samma ruta. Valet hopfälld/utfälld sparas per rubrik. Görs efter att fliken ritats (MutationObserver), utan att röra kortens innehåll. Prefix l3su. */
const l3su = { obs: null, raf: 0 };
const l3suShut = () => new Set((typeof l3Prefs === "function" && l3Prefs().suShut) || []);
function l3suApply() {
  l3su.raf = 0;
  const host = document.getElementById("v3PalPlan"); if (!host) return;
  host.querySelectorAll(".v3-card > .v3-card-h").forEach(h => {
    if (h.children.length || !h.textContent.trim()) return;   // bara rena textrubriker
    const card = h.parentElement, title = h.textContent.trim(), shut = l3suShut().has(title);
    const row = document.createElement("div"); row.className = "v3-lg v3-lsec-h v3-su-h";
    row.innerHTML = `<button type="button" class="v3-lsec-t" aria-expanded="${!shut}"><i>›</i>${escHtml(title)}</button>`;
    const body = document.createElement("div"); body.className = "v3-su-b"; if (shut) body.hidden = true;
    let n = h.nextSibling; const move = []; while (n) { move.push(n); n = n.nextSibling; }
    move.forEach(x => body.appendChild(x)); card.replaceChild(row, h); card.appendChild(body);
    row.querySelector("button").onclick = e => {
      const b = e.currentTarget, open = b.getAttribute("aria-expanded") !== "true", set = l3suShut(); b.setAttribute("aria-expanded", String(open)); body.hidden = !open;
      if (open) set.delete(title); else set.add(title); l3SetPref("suShut", [...set]);
    };
  });
}
function l3suInit() {
  const host = document.getElementById("v3PalPlan"); if (!host || l3su.obs) return;
  l3su.obs = new MutationObserver(() => { if (!l3su.raf) l3su.raf = requestAnimationFrame(l3suApply); });
  l3su.obs.observe(host, { childList: true, subtree: true }); l3suApply();
}
(() => { const t = setInterval(() => { if (document.getElementById("v3PalPlan")) { clearInterval(t); l3suInit(); } }, 500); setTimeout(() => clearInterval(t), 120000); })();
