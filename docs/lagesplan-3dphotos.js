/* 3D-vyn – fotomarkörer (Victor 2026-10-11: "tända upp fotomarkörerna i 3d också och dom hamnar exakt rätt även
   på höjden?" – "GPS-höjd rakt av först").

   – Lagret Foton (Lager → Planering och etablering) visar lägesplanens foton där de togs, som i 2D (samma
     zon- och datumfilter).
   – Höjden: inställd för hand (ph.z) → fotots GPS-höjd rakt av (EXIF/iPhonens höjd över havet) → annars på ytan
     under punkten (ritningens nivå) + ögonhöjd – aldrig automatiskt på en modells yta. En tunn stolpe ner till ytan visar hur högt det är.
   – Riktningen (EXIF-kompassen) visas som en genomskinlig kon åt det håll kameran pekade.
   – Tryck på markören: fotot med höjd och riktning. Höjden går att dra (handtaget), stega en våning (±3 m),
     ställa på ytan eller sätta tillbaka till GPS-höjden. Sparas med fotot (plan.photos), Ctrl+Z ångrar. */

const L3PH_EYE = 1.6, L3PH_STOREY = 3;
const l3ph = { open: null, drag: null, h: null, big: null, pts: [], labels: [] };
const l3phUi = { sel: new Set(), anchor: null }; // markerade foton i listan (Ctrl/Skift-klick)
const l3phOn = () => l3Prefs().photos3d === true;
const l3phList = () => (typeof visiblePhotos === "function" ? visiblePhotos() : typeof photos === "function" ? photos() : []);
/* Fotona i tända mappar (en släckt mapp eller ett släckt foto syns inte i 3D). */
const l3phOnList = () => l3phList().filter(ph => typeof l3aOn !== "function" || l3aOn(ph));
const l3phR2 = v => Math.round(v * 100) / 100;

/* Ytan rakt under (x, y) i 3D-vyns koordinater: översta träffen, annars ritningens höjd. */
function l3phSurfaceZ(x, y) {
  const rc = new THREE.Raycaster(new THREE.Vector3(x, y, 1e5), new THREE.Vector3(0, 0, -1));
  const targets = typeof l3Surfaces === "function" ? l3Surfaces() : [];
  const h = rc.intersectObjects(targets, true).find(h => h.object.visible && !h.object.userData.noHit && h.object.type !== "LineSegments" && h.object.type !== "Line" && (typeof l3VisibleChain !== "function" || l3VisibleChain(h.object)));
  return h ? h.point.z : (plan && plan.calib ? (plan.calib.model[0][2] || 0) - l3.O[2] : 0);
}
/* Var fotot hamnar: { p (Vector3), ground, src: "hand" | "gps" | "yta" }. */
function l3phPos(ph) {
  const [mx, my] = l3PdfToModel(ph.x, ph.y), x = mx - l3.O[0], y = my - l3.O[1], ground = l3phSurfaceZ(x, y);
  const alt = ph.gps && Number.isFinite(ph.gps.alt) ? ph.gps.alt : null;
  if (Number.isFinite(ph.z)) return { p: new THREE.Vector3(x, y, ph.z - l3.O[2]), ground, src: "hand" };
  if (alt != null) return { p: new THREE.Vector3(x, y, alt - l3.O[2]), ground, src: "gps" };
  // Utan EXIF-höjd: ritningens nivå + ögonhöjd – inte ytan under punkten (där hamnade fotot på taket av en byggnad).
  const planZ = plan && plan.calib ? (plan.calib.model[0][2] || 0) - l3.O[2] : ground;
  return { p: new THREE.Vector3(x, y, planZ + L3PH_EYE), ground, src: "yta" };
}
/* Kompassriktning (grader från norr, medurs) → riktning i modellen (x = öst, y = norr). */
const l3phDir = deg => new THREE.Vector3(Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180), 0);

let l3phIcon = null;
function l3phIconTex() {
  if (l3phIcon) return l3phIcon;
  const S = 128, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const x = cv.getContext("2d");
  x.fillStyle = "rgba(15,23,42,.25)"; x.beginPath(); x.arc(S / 2, S / 2 + 4, S / 2 - 6, 0, Math.PI * 2); x.fill();
  const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, "#38bdf8"); g.addColorStop(1, "#0369a1");
  x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "#fff"; x.lineWidth = 6; x.stroke();
  // Kamera
  x.fillStyle = "#fff"; x.beginPath(); x.roundRect(30, 46, 68, 46, 8); x.fill(); x.fillRect(50, 38, 26, 12);
  x.fillStyle = "#0369a1"; x.beginPath(); x.arc(64, 69, 14, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#fff"; x.beginPath(); x.arc(64, 69, 7, 0, Math.PI * 2); x.fill();
  l3phIcon = new THREE.CanvasTexture(cv);
  if ("encoding" in l3phIcon) l3phIcon.encoding = THREE.sRGBEncoding;
  return l3phIcon;
}

function l3phBuild() {
  if (!l3 || !l3.scene) return;
  if (!l3.groups.photos) { const g = new THREE.Group(); g.name = "photos"; l3.groups.photos = g; l3.scene.add(g); }
  const grp = l3.groups.photos;
  // Ikonens textur delas av alla markörer – den tas inte bort när markörerna byggs om.
  while (grp.children.length) { const c = grp.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
  grp.visible = l3phOn() && !!(plan && plan.calib);
  l3ph.pts = [];
  if (!grp.visible) { l3phClose(); l3phHandlePlace(); l3phLabels(); return; }
  const tex = l3phIconTex();
  l3phOnList().forEach(ph => {
    const { p, ground } = l3phPos(ph), sel = l3ph.open && l3ph.open.id === ph.id;
    l3ph.pts.push({ ph, p: p.clone() });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    const s = sel ? 0.075 : 0.055; sp.scale.set(s, s, 1); sp.position.copy(p); sp.renderOrder = 7; // syns alltid, som en kartnål (stolpen visar var den står)
    sp.userData.photoId = ph.id; sp.userData.noHit = true;
    grp.add(sp);
    // Stolpe ner till ytan (eller upp, om GPS-höjden ligger under ytan).
    if (Math.abs(p.z - ground) > 0.15) {
      const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, new THREE.Vector3(p.x, p.y, ground)]), new THREE.LineDashedMaterial({ color: 0x0284c7, dashSize: 0.25, gapSize: 0.15 }));
      pole.computeLineDistances(); pole.userData.noHit = true; pole.raycast = () => {}; pole.userData.photoId = ph.id;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.55, depthWrite: false }));
      dot.position.set(p.x, p.y, ground + 0.02); dot.userData.noHit = true; dot.raycast = () => {};
      grp.add(pole, dot);
    }
    // Riktningen som en kon från kameran.
    const dir = ph.gps && Number.isFinite(ph.gps.dir) ? ph.gps.dir : null;
    if (dir != null) {
      const L = 2.2, geo = new THREE.ConeGeometry(0.9, L, 24, 1, true);
      geo.translate(0, -L / 2, 0); // spetsen i kameran
      const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: sel ? 0.4 : 0.25, side: THREE.DoubleSide, depthWrite: false }));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), l3phDir(dir));
      cone.position.copy(p); cone.userData.noHit = true; cone.raycast = () => {};
      grp.add(cone);
    }
  });
  l3phHandlePlace();
  l3phLabels();
  l3Render();
}
/* Datum (och fotots kommentar) vid markören (Victor 2026-10-13: "addera datumet på något snyggt sätt och om jag har lagt
   en kommentar på fotot"): en liten etikett under ikonen – valbart: datum + kommentar, bara datum eller ingen. */
const L3PH_MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function l3phDateTxt(ph) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(ph.date || ""));
  return m ? `${+m[3]} ${L3PH_MON[+m[2] - 1] || ""} ${m[1]}` : String(ph.date || "");
}
const l3phLblMode = () => { const v = l3Prefs().photoLbl; return v === "date" || v === "off" ? v : "all"; };
function l3phLabels() {
  (l3ph.labels || []).forEach(x => x.el.remove()); l3ph.labels = [];
  if (!l3 || !l3phOn() || !l3.groups.photos || !l3.groups.photos.visible || l3phLblMode() === "off") return;
  const host = l3.renderer.domElement.parentElement, mode = l3phLblMode(), esc = escHtml;
  l3ph.pts.forEach(({ ph, p }) => {
    const el = document.createElement("div"), cap = String(ph.caption || "").trim();
    el.className = "v3-phl" + (cap ? " has" : "");
    el.innerHTML = `<b>${esc(l3phDateTxt(ph))}</b>${mode === "all" && cap ? `<span>${esc(cap.length > 90 ? cap.slice(0, 89) + "…" : cap)}</span>` : cap ? `<i title="${esc(cap)}"></i>` : ""}`;
    el.title = `${ph.caption || "Foto"} · ${l3phDateTxt(ph)}${ph.by ? " · " + ph.by : ""}`;
    el.onpointerdown = e => e.stopPropagation(); el.onclick = e => { e.stopPropagation(); l3phOpen(ph); };
    host.appendChild(el); l3ph.labels.push({ el, p });
  });
  l3phLabelsPlace();
}
function l3phLabelsPlace() {
  (l3ph.labels || []).forEach(({ el, p }) => { const q = l3ToScreen(p); el.style.display = q.behind ? "none" : "flex"; el.style.left = q.x + "px"; el.style.top = q.y + "px"; });
}
/* Tryck på en markör (anropas i 3D-vyns tryck före objekten). */
function l3phTap(e) {
  const g = l3 && l3.groups.photos;
  if (!g || !g.visible || !g.children.length) return false;
  const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  const hit = rc.intersectObjects(g.children.filter(o => o.isSprite), false)[0];
  if (!hit) return false;
  const front = typeof l3Ray === "function" && typeof l3Surfaces === "function" ? l3Ray(e, l3Surfaces())[0] : null;
  if (front && front.distance < hit.distance - 0.3) return false; // byggnaden framför markören vinner
  const ph = l3phList().find(x => x.id === hit.object.userData.photoId);
  if (!ph) return false;
  l3phOpen(ph);
  return true;
}

/* ---- Popupen ------------------------------------------------------------------------------------- */
const l3phSrcText = (ph, src) => src === "hand" ? "inställd för hand"
  : src === "gps" ? `GPS-höjd${Number.isFinite(ph.gps.altAcc) ? ` ±${String(ph.gps.altAcc).replace(".", ",")} m` : " (osäker, ofta några meter)"}`
  : "ritningens nivå + ögonhöjd – fotot saknar GPS-höjd (ställ på ytan eller dra höjden)";
const L3PH_COMPASS = ["norr", "nordost", "öster", "sydost", "söder", "sydväst", "väster", "nordväst"];
const l3phCompass = d => L3PH_COMPASS[Math.round(d / 45) % 8];
function l3phOpen(ph) {
  l3ph.open = ph;
  let pop = document.getElementById("v3PhPop");
  if (!pop) {
    pop = document.createElement("div"); pop.id = "v3PhPop"; pop.className = "v3-cpop v3-phpop";
    l3.renderer.domElement.parentElement.appendChild(pop);
    pop.onpointerdown = e => e.stopPropagation(); pop.onclick = e => e.stopPropagation(); pop.onkeydown = e => e.stopPropagation();
  }
  l3phRenderPop();
  pop.classList.remove("hidden");
  l3phBuild();
  // Bilden
  const img = pop.querySelector(".v3-ph-img");
  const show = url => { if (l3ph.open === ph && img) { img.src = url; img.classList.remove("load"); } };
  if (typeof photoUrlCache !== "undefined" && photoUrlCache.has(ph.id)) show(photoUrlCache.get(ph.id));
  else ghReadBinaryUrl(token, ph.path).then(u => { if (typeof photoUrlCache !== "undefined") photoUrlCache.set(ph.id, u); show(u); }).catch(e => { if (img) img.alt = "Kunde inte hämta bilden: " + e.message; });
}
function l3phRenderPop() {
  const pop = document.getElementById("v3PhPop"), ph = l3ph.open;
  if (!pop || !ph) return;
  const esc = escHtml, { p, ground, src } = l3phPos(ph), abs = p.z + l3.O[2], above = p.z - ground;
  const hasAlt = ph.gps && Number.isFinite(ph.gps.alt), dir = ph.gps && Number.isFinite(ph.gps.dir) ? ph.gps.dir : null;
  const num = v => String(l3phR2(v).toFixed(2)).replace(".", ",").replace("-", "−");
  const keepSrc = pop.querySelector(".v3-ph-img") && pop.querySelector(".v3-ph-img").getAttribute("src");
  pop.innerHTML = `<div class="v3-cpop-h"><i class="v3-ph-ic"></i><div><b>${esc(ph.caption || "Foto")}</b><div class="v3-cpop-m">${esc(ph.date || "")}${ph.by ? " · " + esc(ph.by) : ""}${typeof l3aFolderName === "function" && l3aFolderName(ph.folder) ? " · " + esc(l3aFolderName(ph.folder)) : ""}</div></div><button type="button" class="v3-ghost v3-ph-x" data-ph="edit" title="Ändra namn, datum och mapp">✎</button><button type="button" class="v3-ghost v3-ph-x" data-ph="close" title="Stäng">✕</button></div>
    ${l3ph.edit ? `<div class="v3-ph-edit"><label>Namn / kommentar<input type="text" id="v3PhCap" value="${esc(ph.caption || "")}" placeholder="Beskrivning, t.ex. J15 byggställning" /></label>
      <label>Datum<input type="date" id="v3PhDate" value="${esc(/^\d{4}-\d{2}-\d{2}/.test(ph.date || "") ? ph.date.slice(0, 10) : "")}" /></label>
      <label>Mapp<select id="v3PhFolder"><option value="">Utan mapp</option>${(typeof l3a !== "undefined" ? l3a.folders : []).map(f => `<option value="${esc(f.id)}" ${ph.folder === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label>
      <div class="v3-ph-btns"><button type="button" class="v3-primary" data-ph="save">Spara</button><button type="button" data-ph="cancel">Avbryt</button></div></div>` : ""}
    <img class="v3-ph-img ${keepSrc ? "" : "load"}" alt="" ${keepSrc ? `src="${esc(keepSrc)}"` : ""} title="Tryck för att visa större" />
    <div class="v3-ph-meta"><div><b>Höjd</b> ${num(abs)} m <span>(${num(above)} m över ytan)</span></div><div class="v3-ph-src">${esc(l3phSrcText(ph, src))}</div>
    ${dir != null ? `<div><b>Riktning</b> ${Math.round(dir)}° (${l3phCompass(dir)})</div>` : ""}</div>
    <div class="v3-ph-btns"><button type="button" data-ph="up" title="En våning upp (+${L3PH_STOREY} m)">▲ Våning</button><button type="button" data-ph="down" title="En våning ner (−${L3PH_STOREY} m)">▼ Våning</button>
    <button type="button" data-ph="ground" title="Ställ fotot på ytan under punkten (+ ögonhöjd ${String(L3PH_EYE).replace(".", ",")} m)">Ställ på ytan</button>
    ${hasAlt && src !== "gps" ? `<button type="button" data-ph="gps" title="Tillbaka till fotots GPS-höjd (${num(ph.gps.alt)} m)">GPS-höjd</button>` : ""}</div>
    <div class="v3-pal-hint">Dra ↕-handtaget vid markören för att ändra höjden (Skift: jämna 10 cm).</div>`;
  pop.querySelector(".v3-ph-img").onclick = () => l3phBig();
  pop.querySelectorAll(".v3-ph-edit input").forEach(i => { i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") l3phSaveEdit(ph); else if (e.key === "Escape") { l3ph.edit = false; l3phRenderPop(); } }; });
  pop.querySelectorAll("[data-ph]").forEach(b => { b.onclick = () => {
    const a = b.dataset.ph, cur = l3phPos(ph);
    if (a === "close") return l3phClose();
    if (a === "edit") { l3ph.edit = !l3ph.edit; l3phRenderPop(); const c = document.getElementById("v3PhCap"); if (c) { c.focus(); c.select(); } return; }
    if (a === "cancel") { l3ph.edit = false; return l3phRenderPop(); }
    if (a === "save") return l3phSaveEdit(ph);
    if (a === "up" || a === "down") return l3phSetZ(ph, l3phR2(cur.p.z + l3.O[2] + (a === "up" ? L3PH_STOREY : -L3PH_STOREY)), a === "up" ? "en våning upp" : "en våning ner");
    if (a === "ground") return l3phSetZ(ph, l3phR2(cur.ground + L3PH_EYE + l3.O[2]), "på ytan");
    if (a === "gps") return l3phSetZ(ph, null, "GPS-höjden");
  }; });
  l3phPlacePop();
}
/* Ändra fotots namn (kommentar), datum och mapp – sparas med arbetsytan, som i 2D. Enter sparar, Esc avbryter. */
function l3phSaveEdit(ph) {
  const cap = (document.getElementById("v3PhCap") || {}).value, date = (document.getElementById("v3PhDate") || {}).value, folder = (document.getElementById("v3PhFolder") || {}).value;
  const patch = { caption: String(cap || "").trim(), folder: folder || null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) patch.date = date;
  const next = typeof updatePhoto === "function" ? updatePhoto(ph.id, patch) : null;
  l3ph.edit = false;
  if (next) l3ph.open = next;
  l3phBuild(); l3phRenderPop();
  if (typeof l3kRenderTab === "function") l3kRenderTab();
  l3Status(`Fotot heter nu "${(next && next.caption) || "Foto"}".`);
}
function l3phPlacePop() {
  const pop = document.getElementById("v3PhPop"), ph = l3ph.open;
  if (!pop || !ph || pop.classList.contains("hidden")) return;
  const q = l3ToScreen(l3phPos(ph).p), host = l3.renderer.domElement.getBoundingClientRect();
  const w = pop.offsetWidth || 300, h = pop.offsetHeight || 260;
  pop.style.left = Math.max(8, Math.min(host.width - w - 8, q.x + 22)) + "px";
  pop.style.top = Math.max(8, Math.min(host.height - h - 8, q.y - 30)) + "px";
  pop.classList.toggle("far", !!q.behind);
}
function l3phClose() {
  l3ph.edit = false;
  const pop = document.getElementById("v3PhPop");
  if (pop) pop.classList.add("hidden");
  const was = l3ph.open; l3ph.open = null;
  if (l3ph.big) { l3ph.big.remove(); l3ph.big = null; }
  if (was && l3 && l3.groups.photos) l3phBuild();
}
/* Bilden i helskärm, ovanpå 3D-vyn: zooma med hjul eller nyp (Victor 2026-10-13: "det ska gå att zooma i fotot också"),
   dra för att flytta, dubbelklick = zooma in/ut, knapparna ＋ − ↺ och ✕; Esc eller ett tryck utanför bilden stänger. */
function l3phBig() {
  const ph = l3ph.open, img0 = document.querySelector("#v3PhPop .v3-ph-img");
  if (!ph || !img0 || !img0.getAttribute("src")) return;
  const d = document.createElement("div"); d.className = "v3-phbig"; d.tabIndex = -1;
  d.innerHTML = `<div class="v3-phbig-stage"><img alt="" draggable="false" src="${escHtml(img0.getAttribute("src"))}" /></div>
    <div class="v3-phbig-cap">${escHtml(ph.caption || "Foto")} · ${escHtml(ph.date || "")}</div>
    <div class="v3-phbig-tools"><button type="button" data-z="in" title="Zooma in">${UI_PLUS}</button><button type="button" data-z="out" title="Zooma ut">−</button><button type="button" data-z="fit" title="Anpassa till rutan (dubbelklick)">↺</button><button type="button" data-z="x" title="Stäng (Esc)">✕</button></div>`;
  const stage = d.querySelector(".v3-phbig-stage"), img = d.querySelector("img"), S = { s: 1, x: 0, y: 0 };
  const close = () => { d.remove(); if (l3ph.big === d) l3ph.big = null; };
  const apply = () => {
    const r = stage.getBoundingClientRect(), w = img.offsetWidth * S.s, h = img.offsetHeight * S.s, mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2);
    S.x = Math.max(-mx, Math.min(mx, S.x)); S.y = Math.max(-my, Math.min(my, S.y)); // bilden lämnar inte rutan helt
    img.style.transform = `translate(${S.x}px, ${S.y}px) scale(${S.s})`;
    d.classList.toggle("zoomed", S.s > 1.001);
  };
  // Zoom kring en punkt (px, py relativt rutans mitt): punkten under markören stannar kvar.
  const zoomAt = (f, px, py) => { const s2 = Math.max(1, Math.min(12, S.s * f)), k = s2 / S.s; S.x = px - (px - S.x) * k; S.y = py - (py - S.y) * k; S.s = s2; if (s2 === 1) { S.x = 0; S.y = 0; } apply(); };
  const rel = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  stage.addEventListener("wheel", e => { e.preventDefault(); e.stopPropagation(); const [px, py] = rel(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, px, py); }, { passive: false });
  stage.addEventListener("dblclick", e => { e.preventDefault(); const [px, py] = rel(e); if (S.s > 1.001) { S.s = 1; S.x = S.y = 0; apply(); } else zoomAt(3, px, py); });
  // Dra (en pekare) och nyp (två pekare).
  const P = new Map(); let pinch = null, moved = false;
  stage.addEventListener("pointerdown", e => { e.stopPropagation(); P.set(e.pointerId, [e.clientX, e.clientY]); moved = false; try { stage.setPointerCapture(e.pointerId); } catch (er) { /* */ } if (P.size === 2) { const [a, b] = [...P.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  stage.addEventListener("pointermove", e => {
    if (!P.has(e.pointerId)) return;
    const prev = P.get(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size === 2 && pinch) { const [a, b] = [...P.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), r = stage.getBoundingClientRect(); zoomAt(dist / pinch, (a[0] + b[0]) / 2 - r.left - r.width / 2, (a[1] + b[1]) / 2 - r.top - r.height / 2); pinch = dist; moved = true; return; }
    if (P.size === 1 && S.s > 1.001) { S.x += e.clientX - prev[0]; S.y += e.clientY - prev[1]; if (Math.hypot(e.clientX - prev[0], e.clientY - prev[1]) > 0) moved = true; apply(); }
  });
  const end = e => { P.delete(e.pointerId); if (P.size < 2) pinch = null; };
  stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
  // Ett tryck utanför bilden (inte efter att ha dragit/zoomat) stänger.
  stage.addEventListener("click", e => { if (moved) { moved = false; return; } if (e.target === stage && S.s <= 1.001) close(); });
  d.querySelectorAll("[data-z]").forEach(b => { b.onclick = e => { e.stopPropagation(); const k = b.dataset.z; if (k === "x") return close(); if (k === "fit") { S.s = 1; S.x = S.y = 0; apply(); } else zoomAt(k === "in" ? 1.5 : 1 / 1.5, 0, 0); }; });
  d.onpointerdown = e => e.stopPropagation();
  d.onkeydown = e => { e.stopPropagation(); if (e.key === "Escape") close(); else if (e.key === "+" || e.key === "=") zoomAt(1.5, 0, 0); else if (e.key === "-") zoomAt(1 / 1.5, 0, 0); else if (e.key === "0") { S.s = 1; S.x = S.y = 0; apply(); } };
  img.addEventListener("load", apply);
  document.getElementById("view3d").appendChild(d); d.focus(); l3ph.big = d;
}
/* Ny höjd (absolut, modellens z) – null = tillbaka till GPS-höjden/ytan. Ctrl+Z ångrar. */
function l3phSetZ(ph, z, what) {
  const was = Number.isFinite(ph.z) ? ph.z : null;
  if (was === z) return;
  const apply = v => {
    const cur = (typeof photos === "function" ? photos() : []).find(x => x.id === ph.id);
    if (!cur) return;
    const patch = { z: v == null ? undefined : v };
    const next = typeof updatePhoto === "function" ? updatePhoto(ph.id, patch) : null;
    if (next && v == null) delete next.z;
    if (l3ph.open && l3ph.open.id === ph.id && next) l3ph.open = next;
    l3phBuild(); l3phRenderPop();
  };
  apply(z);
  if (typeof l3VPush === "function") l3VPush(() => apply(was), () => apply(z), "fotots höjd");
  const p = l3ph.open ? l3phPos(l3ph.open) : null;
  l3Status(`Fotot: ${what}${p ? ` – ${String(l3phR2(p.p.z + l3.O[2]).toFixed(2)).replace(".", ",")} m` : ""} (Ctrl+Z ångrar).`);
}

/* ---- Höjdhandtaget ------------------------------------------------------------------------------- */
function l3phHandlePlace() {
  const ph = l3ph.open, g = l3 && l3.groups.photos;
  if (!ph || !g || !g.visible) { if (l3ph.h) l3ph.h.style.display = "none"; return; }
  if (!l3ph.h) {
    const b = document.createElement("button"); b.type = "button"; b.className = "v3-khandle z v3-phh";
    b.title = "Dra för att ändra fotots höjd (Skift: jämna 10 cm)";
    b.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/></svg>`;
    b.onpointerdown = l3phHDown; b.onclick = e => e.stopPropagation();
    l3.renderer.domElement.parentElement.appendChild(b); l3ph.h = b;
  }
  const look = l3.camera.getWorldDirection(new THREE.Vector3());
  const q = l3ToScreen(l3phPos(ph).p);
  // Rakt uppifrån går höjden inte att dra – vrid vyn för höjden (knapparna i popupen fungerar alltid).
  l3ph.h.style.display = !q.behind && Math.abs(look.z) < 0.97 ? "grid" : "none";
  l3ph.h.style.left = q.x + "px"; l3ph.h.style.top = (q.y + 26) + "px";
}
function l3phHDown(e) {
  const ph = l3ph.open; if (!ph) return;
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget; el.setPointerCapture(e.pointerId);
  const { p } = l3phPos(ph), z0 = p.z + l3.O[2], was = Number.isFinite(ph.z) ? ph.z : null;
  const a = l3ToScreen(p), b = l3ToScreen(p.clone().add(new THREE.Vector3(0, 0, 1)));
  const v = [b.x - a.x, b.y - a.y], vv = v[0] * v[0] + v[1] * v[1] || 1;
  const d = l3ph.drag = { x0: e.clientX, y0: e.clientY, z: z0, moved: false };
  const sp = l3.groups.photos.children.find(o => o.isSprite && o.userData.photoId === ph.id);
  const mv = ev => {
    if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 2) d.moved = true;
    if (!d.moved) return;
    let z = z0 + ((ev.clientX - d.x0) * v[0] + (ev.clientY - d.y0) * v[1]) / vv;
    z = ev.shiftKey ? Math.round(z * 10) / 10 : l3phR2(z);
    d.z = z;
    if (sp) sp.position.z = z - l3.O[2];
    l3Status(`Fotots höjd: ${String(z.toFixed(2)).replace(".", ",")} m`);
    l3Render();
  };
  const up = () => {
    el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    l3ph.drag = null;
    if (!d.moved) return;
    ph.z = was; // l3phSetZ jämför med det sparade värdet
    l3phSetZ(ph, d.z, "höjden ändrad");
  };
  el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
function l3phToggle(on) {
  l3SetPref("photos3d", on == null ? !l3phOn() : !!on);
  const cb = document.getElementById("v3ShowPhotos"); if (cb) cb.checked = l3phOn(); // Visa → Foton
  l3phBuild();
  if (typeof l3LayersRender === "function") l3LayersRender();
  if (l3phOn()) {
    const list = l3phList(), n = list.length, gps = list.filter(ph => ph.gps && Number.isFinite(ph.gps.alt)).length;
    const hand = list.filter(ph => Number.isFinite(ph.z)).length;
    l3Status(n ? `${n} ${n === 1 ? "foto" : "foton"} i 3D – ${gps} med GPS-höjd, ${hand} ${hand === 1 ? "inställd" : "inställda"} för hand, resten på ytan. Tryck på en markör för fotot.` : "Den här arbetsytan har inga foton (eller så är de filtrerade bort i 2D).");
  }
}
/* Popup och handtag följer kameran (anropas efter varje bild i l3Render). */
function l3phPlace() { l3phLabelsPlace(); if (l3ph.open) { l3phHandlePlace(); l3phPlacePop(); } }

/* ---- Foton som lista under Kommentarer & mått (hopfällbar) ------------------------------------------------------
   Miniatyrer (Victor 2026-10-13), Ctrl/Skift-klick för att markera flera, dra in i mapparna (samma mappar som
   kommentarer och mått – de tänds och släcks där) och "Flytta markerade". Klick: zooma till fotot och visa det. */
function l3phTabHtml() {
  const esc = escHtml, list = l3phList(), shut = l3Prefs().phListShut === true, on = l3phOn(), mode = l3phLblMode();
  [...l3phUi.sel].forEach(id => { if (!list.some(p => p.id === id)) l3phUi.sel.delete(id); });
  const nSel = l3phUi.sel.size, folders = typeof l3a !== "undefined" ? l3a.folders : [];
  const rows = list.map(ph => {
    const hasAlt = ph.gps && Number.isFinite(ph.gps.alt), src = Number.isFinite(ph.z) ? "höjd satt för hand" : hasAlt ? `GPS-höjd ${String(l3phR2(ph.gps.alt)).replace(".", ",")} m` : "ingen höjd i fotot";
    const fn = typeof l3aFolderName === "function" ? l3aFolderName(ph.folder) : "", vis = typeof l3aOn !== "function" || l3aOn(ph);
    return `<div class="v3-kc v3-phr ${l3phUi.sel.has(ph.id) ? "sel" : ""} ${vis ? "" : "off"}"><img class="v3-ph-th" data-phth="${esc(ph.id)}" alt="" width="64" height="48" />
      <button type="button" class="v3-kc-b v3-kc-m" data-phgo="${esc(ph.id)}" title="Klick: zooma till fotot och visa det · Ctrl+klick: välj flera · Skift+klick: välj flera i rad · dra in i en mapp"><b>${esc(l3phDateTxt(ph) || "Foto")}</b><em>${esc(String(ph.caption || "").slice(0, 90) || "utan kommentar")} · ${esc(src)}${fn ? "" : ""}</em>${fn ? `<em><span class="v3-fchip">${esc(fn)}</span></em>` : ""}</button><button type="button" class="v3-ic" data-phedit="${esc(ph.id)}" title="Ändra namn, datum och mapp">${typeof L3_ICO !== "undefined" && L3_ICO.edit ? L3_ICO.edit : "✎"}</button></div>`;
  }).join("");
  return `<section class="v3-msec" id="v3PhSec"><button type="button" class="v3-msec-h" id="v3PhHead" aria-expanded="${!shut}"><i>›</i>Foton <span>${list.length}${nSel ? ` · ${nSel} markerade` : ""}</span></button>
    ${shut ? "" : `<div class="v3-kc-opts"><label class="v3-chk"><input type="checkbox" id="v3PhShow" ${on ? "checked" : ""} /> Visa i 3D</label>
      <select id="v3PhLbl" title="Text vid fotona i 3D">${[["all", "Datum + kommentar"], ["date", "Bara datum"], ["off", "Ingen text"]].map(([k, l]) => `<option value="${k}" ${mode === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button type="button" class="v3-ghost" id="v3PhAdd" title="Lägg till foton i 3D">＋ Foto…</button></div>
      ${list.length ? `<div class="v3-kc-opts"><button type="button" class="v3-ghost" id="v3PhAll">${nSel === list.length ? "Avmarkera alla" : "Markera alla"}</button>${nSel ? `<button type="button" class="v3-ghost" id="v3PhClr">Avmarkera (${nSel})</button><select id="v3PhMove" title="Flytta de markerade fotona till en mapp"><option value="">Flytta ${nSel} till mapp…</option>${folders.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}<option value="_">Utan mapp</option></select>` : ""}</div>` : ""}
      <div class="v3-kc-list">${rows || `<div class="v3-pal-hint">Inga foton på den här arbetsytan (eller så är de filtrerade bort i 2D).</div>`}</div>`}</section>`;
}
/* Miniatyrerna hämtas när raden syns (högst tre åt gången) och delar cache med fotofönstret. */
const l3phThumbQ = { run: 0, wait: [] };
function l3phThumb(img) {
  const id = img.dataset.phth, ph = l3phList().find(p => p.id === id); if (!ph) return;
  const set = u => { if (img.isConnected) { img.src = u; img.classList.add("ok"); } };
  if (typeof photoUrlCache !== "undefined" && photoUrlCache.has(id)) return set(photoUrlCache.get(id));
  l3phThumbQ.wait.push(async () => {
    try { const u = await ghReadBinaryUrl(token, ph.path); if (typeof photoUrlCache !== "undefined") photoUrlCache.set(id, u); set(u); } catch (e) { img.classList.add("bad"); }
  });
  l3phThumbPump();
}
function l3phThumbPump() {
  while (l3phThumbQ.run < 3 && l3phThumbQ.wait.length) { const f = l3phThumbQ.wait.shift(); l3phThumbQ.run++; f().finally(() => { l3phThumbQ.run--; l3phThumbPump(); }); }
}
function l3phBindTab(host) {
  const q = s => host.querySelector(s), re = () => { if (typeof l3kRenderTab === "function") l3kRenderTab(); };
  const head = q("#v3PhHead"); if (head) head.onclick = () => { l3SetPref("phListShut", !(l3Prefs().phListShut === true)); re(); };
  const show = q("#v3PhShow"); if (show) show.onchange = () => { l3phToggle(show.checked); };
  const lbl = q("#v3PhLbl"); if (lbl) lbl.onchange = () => { l3SetPref("photoLbl", lbl.value); l3phLabels(); l3Render(); };
  const add = q("#v3PhAdd"); if (add) add.onclick = () => l3phAdd();
  const order = [...host.querySelectorAll("[data-phgo]")].map(b => b.dataset.phgo);
  host.querySelectorAll("[data-phgo]").forEach(b => { b.onclick = e => {
    const id = b.dataset.phgo;
    if (e.ctrlKey || e.metaKey) { if (l3phUi.sel.has(id)) l3phUi.sel.delete(id); else l3phUi.sel.add(id); l3phUi.anchor = id; re(); return; }
    if (e.shiftKey && l3phUi.anchor && order.includes(l3phUi.anchor)) {
      const a = order.indexOf(l3phUi.anchor), z = order.indexOf(id); order.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(x => l3phUi.sel.add(x)); re(); return;
    }
    l3phUi.anchor = id; l3phGo(id);
  }; });
  host.querySelectorAll("[data-phedit]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3phGo(b.dataset.phedit); l3ph.edit = true; l3phRenderPop(); const c = document.getElementById("v3PhCap"); if (c) { c.focus(); c.select(); } }; });
  const all = q("#v3PhAll"); if (all) all.onclick = () => { if (l3phUi.sel.size === order.length) l3phUi.sel.clear(); else order.forEach(x => l3phUi.sel.add(x)); re(); };
  const clr = q("#v3PhClr"); if (clr) clr.onclick = () => { l3phUi.sel.clear(); re(); };
  const mv = q("#v3PhMove"); if (mv) mv.onchange = () => { if (!mv.value) return; const ids = new Set(l3phUi.sel); l3aMove(l3phList().filter(p => ids.has(p.id)), mv.value === "_" ? null : mv.value); };
  const imgs = [...host.querySelectorAll("img[data-phth]")];
  if (typeof IntersectionObserver === "function") { const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); l3phThumb(en.target); } }), { root: null, rootMargin: "120px" }); imgs.forEach(i => io.observe(i)); }
  else imgs.forEach(l3phThumb);
}
/* Zooma till fotots markör och öppna fotot. */
function l3phGo(id) {
  const ph = l3phList().find(x => x.id === id); if (!ph) return;
  if (!l3phOn()) l3phToggle(true);
  const { p } = l3phPos(ph);
  if (typeof l3FlyTo === "function") l3FlyTo(p.clone(), 14, null, 450);
  l3phOpen(ph);
}

/* ---- Lägg till foto i 3D (Victor 2026-10-11: "Hittar ingen knapp för att ladda upp foton i 3d-vyn") -------------
   📷 Foto i verktygsraden (⋯ Mer på iPhone), ＋ vid Foton under Lager eller "Lägg till foto…" i sökningen.
   Med GPS (fotots EXIF eller telefonens position för en nytagen bild) hamnar det direkt rätt – höjden enligt
   GPS-höjden. Utan GPS: tryck i 3D där fotot är taget – det ställs på ytan där du trycker + ögonhöjd.
   Samma uppladdning som i 2D (beskrivning och datum frågas), sparas med arbetsytan. */
let l3phInput = null, l3phQueue = [];
function l3phAdd() {
  if (!plan || !plan.calib) { l3Status("Arbetsytan behöver vara kalibrerad mot 3D för att foton ska kunna placeras.", true); return; }
  if (typeof startDevicePosition === "function") startDevicePosition(); // telefonens position, om bilden tas nu
  if (!l3phInput) {
    l3phInput = document.createElement("input");
    l3phInput.type = "file"; l3phInput.accept = "image/*"; l3phInput.multiple = true;
    l3phInput.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;";
    document.getElementById("view3d").appendChild(l3phInput);
    l3phInput.onchange = () => { const f = [...l3phInput.files]; l3phInput.value = ""; if (f.length) { l3phQueue = f; l3phNext(); } };
  }
  l3phInput.click();
}
async function l3phNext() {
  const f = l3phQueue.shift();
  if (!f) return;
  if (!l3phOn()) l3phToggle(true);
  let sug = null;
  try { sug = typeof suggestPhotoPosition === "function" ? await suggestPhotoPosition(f) : null; } catch (e) { sug = null; }
  if (sug && sug.pt) {
    l3Status(`📍 ${f.name} placeras enligt GPS (${sug.src}, ±${Math.round(sug.acc || 0)} m).`);
    const n0 = photos().length;
    await addPhotoFile(f, { pt: sug.pt, gps: sug.gps, quiet: l3phQueue.length > 0 });
    l3phAdded(n0);
    return l3phNext();
  }
  l3.phPick = f;
  const why = sug && sug.far ? "GPS-positionen ligger inte på den här arbetsytan" : "Fotot saknar GPS";
  l3Status(`📷 ${why} – tryck i 3D där "${f.name}" är taget (Esc avbryter).`);
  l3Toast(`Tryck där fotot är taget`, "Avbryt", l3phPickCancel, 60000);
}
function l3phPickTap(e) {
  const f = l3.phPick;
  const hit = l3Ray(e, l3Surfaces())[0];
  if (!hit) { l3Status("Tryck på marken eller ett objekt där fotot är taget.", true); return; }
  l3.phPick = null;
  const t = document.getElementById("v3Toast"); if (t) t.classList.add("hidden");
  const mx = hit.point.x + l3.O[0], my = hit.point.y + l3.O[1], z = Math.round((hit.point.z + l3.O[2] + L3PH_EYE) * 100) / 100;
  const n0 = photos().length;
  Promise.resolve(addPhotoFile(f, { pt: modelToPdf(mx, my), gps: null, z, quiet: l3phQueue.length > 0 })).then(() => { l3phAdded(n0); l3phNext(); });
}
function l3phPickCancel() {
  if (!l3.phPick) return;
  l3.phPick = null;
  const t = document.getElementById("v3Toast"); if (t) t.classList.add("hidden");
  l3Status(l3phQueue.length ? "Fotot hoppades över." : "Inget foto lades till.");
  l3phNext();
}
function l3phAdded(n0) {
  l3phBuild();
  if (typeof l3LayersRender === "function") l3LayersRender();
  // Bara om fotot faktiskt kom med (avbruten beskrivning eller misslyckad uppladdning: inget nytt foto).
  if (photos().length <= n0) { l3Status("Fotot lades inte till.", true); return; }
  const ph = photos().slice(-1)[0];
  if (ph) { const p = l3phPos(ph); l3Status(`✓ Fotot "${ph.caption || ph.date}" är sparat – ${String(l3phR2(p.p.z + l3.O[2]).toFixed(2)).replace(".", ",")} m (${l3phSrcText(ph, p.src)}).`); }
}
