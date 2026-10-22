/* Mobilkranen lyfter objekt ur modellen (Victor 2026-10-22: "visualisera montage av prefabpelare, prefabbalkar och prefabelement … ta tag i 3D-objekten med kranen,
   lyfta och flytta runt dem"). Sänk kroken ned mot ett objekt (eller markera objekt först) och tryck H: objektet hakas i kroken med slingor, pendlar lite när kranen
   svänger, kan vridas med , och . (eller knapparna) och sätts ner med H. Släppet blir en vanlig flytt i modellen (Ångra, och "Spara som ny IFC" i Trimble Connect
   som för andra flyttade objekt) – bygger på samma sessions-grupp som Flytta (l3bmStart med crane). */
const l3lift = { s: null, rig: null, cur: null, yaw: 0, h: 0, ext: null, supT: 0, supZ: null, last: 0 };
function l3liftHookPos() {
  const a = l3w.av; if (!a || !a.hookObj) return null; a.g.updateMatrixWorld(true);
  return a.hookObj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, -0.55));
}
const l3liftOk = x => x.object.visible && !x.object.userData.noHit && x.object.type !== "LineSegments" && x.object.type !== "Line" && (typeof l3VisibleChain !== "function" || l3VisibleChain(x.object));
/* Underlagets höjd under lasten (högsta träffen av fem strålar: mitten och hörnen) – lasten hänger aldrig under marken eller ner i andra objekt. */
function l3liftSupport(G, x, y, zTop) {
  const surf = l3Surfaces(), ex = l3lift.ext, pts = [[0, 0], [ex.x, ex.y], [-ex.x, ex.y], [ex.x, -ex.y], [-ex.x, -ex.y]], cs = Math.cos(G.rotation.z), sn = Math.sin(G.rotation.z); let best = typeof l3GroundZ === "function" ? l3GroundZ() : -1e9;
  pts.forEach(([px, py]) => { const o = new THREE.Vector3(x + px * cs - py * sn, y + px * sn + py * cs, zTop), rc = new THREE.Raycaster(o, new THREE.Vector3(0, 0, -1), 0, 400); rc.firstHitOnly = true; const h = rc.intersectObjects(surf, true).find(l3liftOk); if (h && h.point.z > best) best = h.point.z; });
  return best;
}
function l3liftGrab(entsIn, replay) {
  if (l3lift.s) { l3liftRelease(); return; }
  if (!l3w.on || l3w.kind !== "crane" || !l3w.workOn) { l3Status("Res kranen först (X, fäll ut stödben och bom) – sedan hakar du i objekt med H.", true); return; }
  if (l3bm.session) { l3Status("Avsluta pågående flytt först.", true); return; }
  const hp = l3liftHookPos(); if (!hp) return;
  let ents = entsIn && entsIn.length ? entsIn : null; const rc = new THREE.Raycaster(hp.clone().add(new THREE.Vector3(0, 0, 0.5)), new THREE.Vector3(0, 0, -1), 0, 4); rc.firstHitOnly = true;
  const h = ents ? null : rc.intersectObjects(l3Surfaces(), true).find(l3liftOk), e = h && l3bsFromHit(h);
  if (e && e.mesh.userData.l3b.ranges[e.ri].guid) { ents = l3bs.sel.some(s => s.mesh === e.mesh && s.ri === e.ri) ? l3bs.sel.map(s => ({ mesh: s.mesh, ri: s.ri })) : [{ mesh: e.mesh, ri: e.ri }]; }
  if (!ents && l3bs.sel.length) ents = l3bs.sel.map(s => ({ mesh: s.mesh, ri: s.ri }));
  if (!ents) { l3Status("Inget att haka i: sänk kroken (Lina) ner mot ett objekt i modellen och tryck H – eller markera objekt först.", true); return; }
  l3bsSet(ents); l3bmStart({ crane: true });
  const s = l3bm.session; if (!s) return; l3lift.s = s; const G = s.G, b = new THREE.Box3().setFromObject(G);
  l3lift.h = Math.max(0.3, b.max.z - G.position.z); if (!replay) { l3lift.loadT = Math.round(l3liftEstimate(G) * 10) / 10; l3lift.loadAuto = true; if (l3lift.rec) l3lift.rec.ev.push({ type: "grab", t: performance.now() - l3lift.rec.t0, ents: ents.map(x => ({ mesh: x.mesh, ri: x.ri })) }); } else { l3lift.loadT = Math.round(l3liftEstimate(G) * 10) / 10; l3lift.loadAuto = true; } l3lift.ext = { x: Math.max(0.1, (b.max.x - b.min.x) / 2), y: Math.max(0.1, (b.max.y - b.min.y) / 2) }; l3lift.yaw = 0; l3lift.cur = G.position.clone().add(new THREE.Vector3(0, 0, 0.3)); l3lift.supZ = null;
  const pts = []; for (let i = 0; i < 4; i++) pts.push(new THREE.Vector3(), new THREE.Vector3()); const rg = new THREE.BufferGeometry().setFromPoints(pts), rig = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffd23f })); rig.frustumCulled = false; rig.userData.noHit = true; rig.userData.noIfc = true; rig.raycast = () => {}; rig.renderOrder = 7; l3.scene.add(rig); l3lift.rig = rig;
  l3Status(`Haktade i ${ents.length} objekt. Kör/sväng kranen för att flytta, ‹ › (, .) vrider lasten, H sätter ner den.`); l3wCtlPanel(); l3Render();
}
function l3liftRig() { if (l3lift.rig) { l3.scene.remove(l3lift.rig); l3lift.rig.geometry.dispose(); l3lift.rig.material.dispose(); l3lift.rig = null; } }
function l3liftRelease(silent) {
  const s = l3lift.s; if (!s) return; const G = s.G;
  if (l3bm.session === s) { // sätt ner: på underlaget under lasten
    const z = l3liftSupport(G, G.position.x, G.position.y, G.position.z + l3lift.h + 60); G.position.z = Math.max(z, -1e6) + 0.01; G.rotation.x = G.rotation.y = 0; G.updateMatrix();
  }
  if (l3bm.session === s && l3lift.rec) { const D = l3bmDelta(), O = new THREE.Matrix4().makeTranslation(l3.O[0], l3.O[1], l3.O[2]); l3lift.rec.ev.push({ type: "release", t: performance.now() - l3lift.rec.t0, ents: s.ents.map(x => ({ mesh: x.mesh, ri: x.ri })), D, Dg: O.clone().multiply(D).multiply(O.clone().invert()) }); }
  l3liftRig(); l3lift.s = null; if (l3lift.loadAuto) { l3lift.loadT = 0; l3lift.loadAuto = false; }
  if (l3bm.session === s) l3bmAccept();
  if (!silent) l3wCtlPanel();
}
function l3liftYaw(d) { if (!l3lift.s) return; l3lift.yaw += d; if (l3lift.rec) l3lift.rec.ev.push({ type: "yaw", t: performance.now() - l3lift.rec.t0, yaw: l3lift.yaw }); }
/* Varje bildruta (anropas efter att kranen uppdaterats): lasten hänger under kroken med lite fördröjning och pendling. */
function l3liftUpdate() {
  const s = l3lift.s; if (!s) return;
  if (l3bm.session !== s || !l3w.on || l3w.kind !== "crane") { l3liftRig(); l3lift.s = null; if (l3bm.session === s) l3bmCancel(); return; }
  const now = performance.now(), dt = Math.min(0.1, (now - (l3lift.last || now)) / 1000); l3lift.last = now;
  const hp = l3liftHookPos(); if (!hp) return; const G = s.G, SL = 1.5, tgt = new THREE.Vector3(hp.x, hp.y, hp.z - SL - l3lift.h), k = 1 - Math.exp(-dt * 6), prev = l3lift.cur.clone();
  l3lift.cur.lerp(tgt, k);
  if (now - l3lift.supT > 90) { l3lift.supT = now; l3lift.supZ = l3liftSupport(G, l3lift.cur.x, l3lift.cur.y, l3lift.cur.z + l3lift.h + 40); }
  const touching = l3lift.supZ != null && l3lift.cur.z < l3lift.supZ + 0.02; if (touching) l3lift.cur.z = l3lift.supZ + 0.02;
  G.position.copy(l3lift.cur); const vx = (l3lift.cur.x - prev.x) / Math.max(dt, 1e-3), vy = (l3lift.cur.y - prev.y) / Math.max(dt, 1e-3);
  G.rotation.z += (l3lift.yaw - G.rotation.z) * Math.min(1, dt * 5); G.rotation.x = touching ? 0 : Math.max(-0.1, Math.min(0.1, vy * 0.02)); G.rotation.y = touching ? 0 : Math.max(-0.1, Math.min(0.1, -vx * 0.02)); G.updateMatrix(); G.updateMatrixWorld(true);
  const a = l3lift.rig.geometry.attributes.position, ex = l3lift.ext, hk = hp.clone(); let i = 0;
  [[ex.x, ex.y], [-ex.x, ex.y], [-ex.x, -ex.y], [ex.x, -ex.y]].forEach(([px, py]) => { const c = new THREE.Vector3(px, py, l3lift.h).applyMatrix4(G.matrixWorld); a.setXYZ(i++, hk.x, hk.y, hk.z); a.setXYZ(i++, c.x, c.y, c.z); });
  a.needsUpdate = true; l3lift.rig.geometry.computeBoundingSphere();
  const rel = Math.max(0, G.position.z - (l3lift.supZ != null ? l3lift.supZ : G.position.z));
  if (l3w.info) { l3w.info = l3w.info.filter(r => r[0] !== "Last"); l3w.info.push(["Last", `${l3bs.sel.length || s.ents.length} obj. · ${rel.toFixed(1).replace(".", ",")} m över underlaget`]); }
  l3Render();
}

/* ---- Lastdiagram: lastens vikt mot kranens förmåga vid aktuell radie --------------------------------------------------------------------------- */
/* Exempeldiagram för en mobilkran i 200-tonsklassen (ton vid radie, full motvikt, stödben utfällda). Byt mot kranens riktiga diagram i rutan "Lastdiagram" i kranpanelen. */
const L3L_DEF = "3:220\n5:160\n8:110\n10:95\n12:80\n16:62\n20:50\n25:38\n30:29\n35:23\n40:18\n45:14\n50:11\n55:8.5\n60:6.5";
/* Kranklasser med exempeldiagram (ton vid radie, full motvikt, stödben ute). Värdena är typiska för storleksklassen och INTE en tillverkares lastdiagram – välj "Egen" och skriv in kranens riktiga. */
const L3L_MODELS = [
  { id: "m60", name: "Mobilkran 60 t (exempel)", chart: "3:60\n4:50\n5:42\n6:36\n8:28\n10:22\n12:17.5\n14:14\n16:11.5\n18:9.5\n20:8\n24:5.8\n28:4.2\n32:3\n36:2.2" },
  { id: "m100", name: "Mobilkran 100 t (exempel)", chart: "3:100\n5:78\n8:55\n10:44\n12:36\n16:26\n20:19\n24:14\n28:10.5\n32:8\n36:6\n40:4.5\n44:3.3" },
  { id: "m160", name: "Mobilkran 160 t (exempel)", chart: "3:160\n5:120\n8:84\n10:68\n12:56\n16:42\n20:32\n25:23\n30:17\n35:12.5\n40:9.5\n45:7\n50:5.2" },
  { id: "m220", name: "Mobilkran 220 t (exempel)", chart: L3L_DEF },
  { id: "m300", name: "Mobilkran 300 t (exempel)", chart: "3:300\n5:230\n8:165\n10:135\n12:112\n16:84\n20:66\n25:50\n30:39\n35:31\n40:25\n50:17\n60:11.5" },
  { id: "m400", name: "Mobilkran 400 t (exempel)", chart: "3:400\n5:310\n8:225\n10:185\n12:155\n16:118\n20:92\n25:70\n30:55\n35:44\n40:36\n50:24\n60:16" },
];
const l3lModelId = () => { try { const m = l3Prefs().craneModel; return m === "own" || L3L_MODELS.some(x => x.id === m) ? m : "m220"; } catch (e) { return "m220"; } };
function l3lChartText() { const id = l3lModelId(); if (id === "own") { try { return l3Prefs().craneChart || L3L_DEF; } catch (e) { return L3L_DEF; } } return (L3L_MODELS.find(x => x.id === id) || L3L_MODELS[3]).chart; }
function l3lChart() {
  const pts = String(l3lChartText()).split(/\n+/).map(l => l.trim().split(/[:;\s]+/).map(x => parseFloat(x.replace(",", ".")))).filter(a => a.length >= 2 && a[0] >= 0 && a[1] >= 0).map(a => [a[0], a[1]]).sort((a, b) => a[0] - b[0]);
  return pts.length >= 2 ? pts : l3lChartDefault();
}
const l3lChartDefault = () => L3L_DEF.split("\n").map(l => l.split(":").map(Number));
function l3lCap(R, ch) {
  ch = ch || l3lChart(); if (R <= ch[0][0]) return ch[0][1]; if (R > ch[ch.length - 1][0] + 0.5) return 0;
  for (let i = 1; i < ch.length; i++) if (R <= ch[i][0]) { const [r0, t0] = ch[i - 1], [r1, t1] = ch[i]; return t0 + (t1 - t0) * (R - r0) / Math.max(1e-6, r1 - r0); }
  return ch[ch.length - 1][1];
}
/* Betongvikt ur lastens volym (slutna kroppar, 2,5 t/m³) – bara en uppskattning, skriv in verklig vikt i rutan. */
function l3liftEstimate(G) {
  let vol = 0; G.traverse(o => { if (!o.isMesh || !o.geometry || o.material.wireframe) return; const P = o.geometry.getAttribute("position"), I = o.geometry.index; if (!P) return; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = I ? I.count : P.count;
    for (let i = 0; i + 2 < n; i += 3) { const i0 = I ? I.getX(i) : i, i1 = I ? I.getX(i + 1) : i + 1, i2 = I ? I.getX(i + 2) : i + 2; a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2); vol += a.dot(b.clone().cross(c)) / 6; } });
  return Math.abs(vol) * 2.5;
}
l3lift.loadT = 0; l3lift.loadAuto = false; l3lift.util = 0; l3lift.R = 0;
function l3liftLoadInfo() {
  const rows = l3w.info || [], g = lab => { const x = rows.find(q => q[0] === lab); return x ? parseFloat(String(x[1]).replace(",", ".")) : NaN; }, R = g("Radie"); if (!isFinite(R)) return;
  l3lift.R = R; const cap = l3lCap(R), t = Number(l3lift.loadT) || 0; l3lift.util = t > 0 ? (cap > 0 ? t / cap : 9.99) : 0; l3w.util = l3lift.util;
  const f = v => (Math.round(v * 10) / 10).toString().replace(".", ",");
  l3w.info = rows.filter(q => !/^(Last|Lastförmåga|Utnyttjande)/.test(q[0]));
  l3w.info.push(["Lastförmåga vid radien", cap > 0 ? f(cap) + " ton" : "utanför diagrammet"]);
  if (t > 0) { l3w.info.push(["Lastens vikt", f(t) + " ton" + (l3lift.loadAuto ? " (uppskattad)" : "")]); l3w.info.push(["Utnyttjande", l3lift.util > 1 ? "ÖVERLAST " + Math.round(l3lift.util * 100) + " %" : Math.round(l3lift.util * 100) + " %"]); }
  if (l3lift.util > 1 && !l3lift.warned) { l3lift.warned = true; l3Status("⚠ Överlast: lasten är tyngre än kranens förmåga vid den här radien – minska radien, res bommen högre eller välj en större kran.", true); } else if (l3lift.util <= 1) l3lift.warned = false;
}
function l3liftChartSvg() {
  const ch = l3lChart(), W = 268, H = 112, L = 30, B = 18, T = 6, Rr = 6, rmax = Math.max(60, ch[ch.length - 1][0]), cmax = Math.max(...ch.map(p => p[1])), X = r => L + (W - L - Rr) * r / rmax, Y = t => H - B - (H - B - T) * t / cmax;
  const line = ch.map(([r, t]) => `${X(r).toFixed(1)},${Y(t).toFixed(1)}`).join(" "), area = `${X(ch[0][0]).toFixed(1)},${H - B} ${line} ${X(ch[ch.length - 1][0]).toFixed(1)},${H - B}`;
  const ut = l3lift.util, col = ut > 1 ? "#ff4d4d" : ut > 0.8 ? "#ffb020" : "#2ee66b", t = Number(l3lift.loadT) || 0, R = Math.min(rmax, l3lift.R || 0);
  let g = ""; for (let r = 0; r <= rmax; r += 10) g += `<text x="${X(r)}" y="${H - 5}" text-anchor="middle">${r}</text><line x1="${X(r)}" x2="${X(r)}" y1="${T}" y2="${H - B}" class="gr"/>`;
  [0, 0.5, 1].forEach(f => { const v = cmax * f; g += `<text x="${L - 3}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" class="v3-lc"><polygon points="${area}" fill="rgba(80,160,255,.18)"/>${g}<polyline points="${line}" fill="none" stroke="#5aa7ff" stroke-width="1.6"/><line x1="${X(R)}" x2="${X(R)}" y1="${T}" y2="${H - B}" stroke="#ff8a1a" stroke-dasharray="3 2"/>${t > 0 ? `<circle cx="${X(R)}" cy="${Y(Math.min(cmax, t))}" r="4.5" fill="${col}" stroke="#fff" stroke-width="1.2"/>` : ""}<text x="${W - 6}" y="${T + 8}" text-anchor="end" class="u">ton / radie (m)</text></svg>`;
}
function l3liftPanelRefresh(p) {
  const ms = p.querySelector('[data-ld="model"]'); if (ms && document.activeElement !== ms && ms.value !== l3lModelId()) ms.value = l3lModelId();
  { const ta = p.querySelector('[data-ld="chart"]'); if (ta) { ta.readOnly = l3lModelId() !== "own"; if (document.activeElement !== ta && ta.value !== l3lChartText()) ta.value = l3lChartText(); } }
  const w = p.querySelector('[data-ld="w"]'); if (w && document.activeElement !== w) w.value = l3lift.loadT ? Math.round(l3lift.loadT * 10) / 10 : "";
  const u = p.querySelector("#v3CtlUtil"); if (u) { const ut = l3lift.util, pc = Math.min(100, Math.round(ut * 100)); u.innerHTML = `<div class="v3-ub"><i style="width:${pc}%;background:${ut > 1 ? "#ff4d4d" : ut > 0.8 ? "#ffb020" : "#2ee66b"}"></i></div><small>${ut > 0 ? (ut > 1 ? "⚠ ÖVERLAST " : "Utnyttjande ") + Math.round(ut * 100) + " %" : "Skriv in lastens vikt (eller haka i ett objekt) för att se utnyttjandet"}</small>${l3liftChartSvg()}`; }
  const rc = p.querySelector('[data-cb="rec"]'); if (rc) rc.textContent = l3lift.rec ? `⏹ Stoppa (${Math.round((performance.now() - l3lift.rec.t0) / 1000)} s)` : "⏺ Spela in";
  const pl = p.querySelector('[data-cb="play"]'); if (pl) { pl.textContent = l3lift.play ? "⏹ Stoppa uppspelning" : "▶ Spela upp"; pl.disabled = !(l3lift.recd && l3lift.recd.samples.length > 2) && !l3lift.play; }
}
function l3liftPanelChange(e) {
  const t = e.target, k = t.dataset && t.dataset.ld; if (!k) return;
  if (k === "w") { const v = parseFloat(String(t.value).replace(",", ".")); l3lift.loadT = isFinite(v) && v > 0 ? v : 0; l3lift.loadAuto = false; }
  else if (k === "chart") { const v = String(t.value || "").trim(); l3SetPref("craneChart", v); l3SetPref("craneModel", "own"); }
  else if (k === "model") { const v = t.value; if (v === "own" && l3lModelId() !== "own") l3SetPref("craneChart", l3lChartText()); l3SetPref("craneModel", v); const p = l3w.ctlEl, ta = p && p.querySelector('[data-ld="chart"]'); if (ta) ta.value = l3lChartText(); }
  l3wCtlRefresh(true);
}

/* ---- Spela in och spela upp kranens rörelser (och när lasten hakas i / sätts ner) ------------------------------------------------------------------- */
function l3liftSample() { const c = l3w.ctl; return { t: performance.now() - l3lift.rec.t0, c: { slew: c.slew, ang: c.ang, ext: c.ext, hook: c.hook, out: c.out }, p: [l3w.p.x, l3w.p.y, l3w.p.z], h: l3w.heading }; }
function l3liftRecToggle() {
  if (l3lift.play) l3liftPlayStop();
  if (l3lift.rec) { const r = l3lift.rec; l3lift.rec = null; l3lift.recd = r; l3liftTrace(r); l3Status(`Inspelat: ${r.samples.length} punkter, ${Math.round((performance.now() - r.t0) / 1000)} s. ▶ Spela upp återställer objekten och kör samma rörelse igen.`); l3wCtlRefresh(true); return; }
  if (!l3w.on || l3w.kind !== "crane" || !l3w.workOn) { l3Status("Res kranen först (X) – sedan kan du spela in.", true); return; }
  l3liftTraceClear(); l3lift.rec = { t0: performance.now(), samples: [], ev: [], last: -1e9 }; l3liftSample(); l3Status("Inspelning pågår – kör kranen och haka i / sätt ner objekt som vanligt. ⏹ stoppar."); l3wCtlRefresh(true);
}
function l3liftTraceClear() { if (l3lift.trace) { l3.scene.remove(l3lift.trace); l3lift.trace.geometry.dispose(); l3lift.trace.material.dispose(); l3lift.trace = null; } l3lift.tracePts = null; }
function l3liftTrace(r) { // lastens/krokens bana som en gul linje
  l3liftTraceClear(); const pts = (r.hookPts || []).map(a => new THREE.Vector3(a[0], a[1], a[2])); if (pts.length < 2) return;
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd23f })); ln.frustumCulled = false; ln.userData.noHit = true; ln.userData.noIfc = true; ln.raycast = () => {}; ln.renderOrder = 7; l3.scene.add(ln); l3lift.trace = ln; l3lift.tracePts = pts; l3Render();
}
function l3liftRecTick(now) {
  const r = l3lift.rec; if (!r || now - r.last < 70) return; r.last = now; const s = l3liftSample(); r.samples.push(s); const hp = l3liftHookPos(); if (hp) (r.hookPts || (r.hookPts = [])).push([hp.x, hp.y, hp.z]);
}
function l3liftPlay() {
  if (l3lift.play) { l3liftPlayStop(); return; }
  const r = l3lift.recd; if (!r || r.samples.length < 3) { l3Status("Spela in en rörelse först (⏺).", true); return; }
  if (l3lift.s) l3liftRelease(true);
  // objekten tillbaka dit de stod när inspelningen började (flyttarna görs ogjorda i omvänd ordning)
  { const rel = r.ev.filter(e => e.type === "release" && e.D); // (ångra-historiken hålls i takt: återställningen är ett eget steg)
    if (rel.length && !l3bm.session) { rel.slice().reverse().forEach(e => l3bmApplyDelta(e.ents, e.D.clone().invert(), e.Dg.clone().invert()));
      if (typeof l3VPush === "function") l3VPush(() => rel.forEach(e => l3bmApplyDelta(e.ents, e.D, e.Dg)), () => rel.slice().reverse().forEach(e => l3bmApplyDelta(e.ents, e.D.clone().invert(), e.Dg.clone().invert())), "återställ före uppspelning"); } }
  const s0 = r.samples[0]; Object.assign(l3w.ctl, s0.c); Object.assign(l3w.ctlT, s0.c); l3w.p.set(s0.p[0], s0.p[1], s0.p[2]); l3w.heading = s0.h; l3w.keys.clear();
  l3lift.play = { t0: performance.now(), i: 0, e: 0 }; l3Status("Spelar upp … (Esc eller ⏹ avbryter)"); l3wCtlRefresh(true);
}
function l3liftPlayStop() { if (!l3lift.play) return; l3lift.play = null; if (l3lift.s) l3liftRelease(true); l3Status("Uppspelningen är klar."); l3wCtlRefresh(true); }
function l3liftPlayTick(now) {
  const pl = l3lift.play, r = l3lift.recd; if (!pl || !r) return; const t = now - pl.t0, S = r.samples; l3w.keys.clear();
  while (pl.i < S.length - 2 && S[pl.i + 1].t <= t) pl.i++; const a = S[pl.i], b = S[Math.min(S.length - 1, pl.i + 1)], k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1, lerp = (x, y) => x + (y - x) * k;
  ["slew", "ang", "ext", "hook", "out"].forEach(f => { const v = lerp(a.c[f], b.c[f]); l3w.ctl[f] = v; l3w.ctlT[f] = v; });
  l3w.p.set(lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1]), lerp(a.p[2], b.p[2])); l3w.heading = lerp(a.h, b.h); l3w.yaw = l3w.heading;
  while (pl.e < r.ev.length && r.ev[pl.e].t <= t) { const e = r.ev[pl.e++]; if (e.type === "yaw") { l3lift.yaw = e.yaw; } else if (e.type === "grab") { if (l3lift.s) l3liftRelease(true); l3liftGrab(e.ents, true); l3lift.yaw = e.yaw || 0; } else if (l3lift.s) l3liftRelease(true); }
  if (t > S[S.length - 1].t + 400 && pl.e >= r.ev.length) l3liftPlayStop();
}
function l3liftTick() { // anropas varje bildruta från gå-läget
  l3liftLoadInfo(); const now = performance.now(); if (l3lift.rec) l3liftRecTick(now); if (l3lift.play) l3liftPlayTick(now); l3liftUpdate();
}
