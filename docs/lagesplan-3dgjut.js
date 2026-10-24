/* Gjutetappens underkant mot berg (Victor 2026-10-24: "skära bort underdelen av formen med frihandsritning … mot ett berg som inte är rakt").
   Man ritar bottenlinjen fritt i modellen längs formens långsida (på sidoytan närmast kameran); linjen förenklas och sparas som en profil
   (p.f.prof = "t:z;t:z …", t 0–1 längs x, z = botten över plattans nivå). Formen, volymen, armeringen och träformen följer sedan profilen
   (place-smart-objs.js: gjutProfCtx / gjutConcreteSolid). Esc eller högerklick avbryter; "Rensa" i panelen tar bort profilen. */

const l3gp = { id: null, pts: [], down: false, line: null, frame: null, g: null, face: 0 };

function l3gpPoly(p) {
  if (p.type === "sm:gjutform") return gjutFreePoly(p);
  return gjutPoly(p);
}
/* Formens läge i scenen: mitt, riktningsvektorer (x längs formen, y vinkelrätt), plattans bas-z. */
function l3gpGeom(p) {
  const O = l3.O, poly = l3gpPoly(p); if (!poly) return null;
  const free = p.type === "sm:gjutform", t = free ? 0 : (Number(p.rot) || 0) * Math.PI / 180, dz = Number(p.dz) || 0;
  const u = new THREE.Vector3(Math.cos(t), Math.sin(t), 0), v = new THREE.Vector3(-Math.sin(t), Math.cos(t), 0), c = new THREE.Vector3((Number(p.x) || 0) - O[0], (Number(p.y) || 0) - O[1], 0);
  const zBase = (free ? ((p.pts[0] || [])[2] || 0) : (Number(p.z) || 0)) + dz - O[2], xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
  return { poly, u, v, c, zBase, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), H: Math.max(0.05, Number(p.H) || 0.25) };
}
const l3gpWorld = (G, x, z, y) => new THREE.Vector3().copy(G.c).addScaledVector(G.u, x).addScaledVector(G.v, y).setZ(G.zBase + z);
function l3gpStart(p) {
  if (!l3 || !p) return; const G = l3gpGeom(p); if (!G) { l3Status("Rita först formens hörn (minst tre punkter).", true); return; }
  l3gpStop(true); l3gp.id = p.id; l3gp.g = G; l3gp.pts = []; l3gp.down = false;
  l3.renderer.domElement.style.cursor = "crosshair"; l3.orbit.enabled = false;
  window.addEventListener("pointerdown", l3gpDown, true); window.addEventListener("pointermove", l3gpMove, true); window.addEventListener("pointerup", l3gpUp, true); window.addEventListener("keydown", l3gpKey, true); window.addEventListener("contextmenu", l3gpCtx, true);
  l3Status("Rita underkanten (berget) med frihand längs formens sida – håll ned och dra från vänster till höger. Esc avbryter.");
  document.body.classList.add("v3-gjdraw");
}
function l3gpStop(quiet) {
  window.removeEventListener("pointerdown", l3gpDown, true); window.removeEventListener("pointermove", l3gpMove, true); window.removeEventListener("pointerup", l3gpUp, true); window.removeEventListener("keydown", l3gpKey, true); window.removeEventListener("contextmenu", l3gpCtx, true);
  [l3gp.line, l3gp.frame].forEach(o => { if (o) { l3.scene.remove(o); o.geometry.dispose(); o.material.dispose(); } }); l3gp.line = l3gp.frame = null;
  if (l3 && l3.renderer) { l3.renderer.domElement.style.cursor = ""; if (l3.orbit) l3.orbit.enabled = true; l3Render(); }
  document.body.classList.remove("v3-gjdraw"); const was = l3gp.id; l3gp.id = null; l3gp.down = false; if (was && !quiet) l3Status("");
}
function l3gpPlane(e) {
  const G = l3gp.g, cam = l3.camera.position, camY = new THREE.Vector3().subVectors(cam, G.c).dot(G.v), yF = camY >= (G.minY + G.maxY) / 2 ? G.maxY : G.minY;
  return { yF, plane: new THREE.Plane(G.v.clone(), -G.v.dot(G.c) - yF) };
}
function l3gpHit(e) { const { yF, plane } = l3gpPlane(e), q = new THREE.Vector3(); if (!l3MouseRay(e).intersectPlane(plane, q)) return null; const G = l3gp.g; return { x: q.clone().sub(G.c).dot(G.u), z: q.z - G.zBase, yF }; }
function l3gpDraw() {
  const G = l3gp.g, yF = l3gp.face, pts = l3gp.pts.map(q => l3gpWorld(G, q[0], q[1], yF));
  if (!l3gp.frame) { const z0 = -1.5, z1 = G.H, f = [[G.minX, z0], [G.maxX, z0], [G.maxX, z1], [G.minX, z1], [G.minX, z0]].map(([x, z]) => l3gpWorld(G, x, z, yF)); l3gp.frame = new THREE.Line(new THREE.BufferGeometry().setFromPoints(f), new THREE.LineDashedMaterial({ color: 0x2f7bff, dashSize: 0.3, gapSize: 0.2, depthTest: false })); l3gp.frame.computeLineDistances(); l3gp.frame.renderOrder = 9; l3.scene.add(l3gp.frame); }
  if (l3gp.line) { l3.scene.remove(l3gp.line); l3gp.line.geometry.dispose(); l3gp.line = null; }
  if (pts.length > 1) { l3gp.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: false })); l3gp.line.renderOrder = 10; l3.scene.add(l3gp.line); }
  l3Render();
}
function l3gpDown(e) {
  if (e.button === 2) { e.preventDefault(); e.stopPropagation(); l3gpStop(); return; }
  if (e.button !== 0 || !e.target || e.target !== l3.renderer.domElement) return;
  e.preventDefault(); e.stopPropagation(); const h = l3gpHit(e); if (!h) return; l3gp.down = true; l3gp.face = h.yF; l3gp.pts = [[h.x, h.z]]; l3gpDraw();
}
function l3gpMove(e) { if (!l3gp.down) return; e.stopPropagation(); const h = l3gpHit(e); if (!h) return; const last = l3gp.pts[l3gp.pts.length - 1]; if (Math.hypot(h.x - last[0], h.z - last[1]) < 0.03) return; l3gp.pts.push([h.x, h.z]); l3gpDraw(); }
function l3gpUp(e) { if (!l3gp.down) return; e.stopPropagation(); l3gp.down = false; const p = placements.find(x => x.id === l3gp.id), pts = l3gp.pts.slice(); if (!p || pts.length < 4) { l3gp.pts = []; l3gpDraw(); l3Status("Rita en längre linje – håll ned och dra längs sidan."); return; } l3gpCommit(p, pts); l3gpStop(true); }
function l3gpKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); l3gpStop(); } }
function l3gpCtx(e) { e.preventDefault(); e.stopPropagation(); }
/* Förenklar ritade punkter (x, z) till en profil: sorterade längs x, Douglas–Peucker 4 cm, klippta till formens x-spann och tjocklek. */
function l3gpCommit(p, raw) {
  const G = l3gpGeom(p), W = Math.max(0.01, G.maxX - G.minX); let pts = raw.slice(); if (pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
  pts = pts.map(q => [Math.max(G.minX, Math.min(G.maxX, q[0])), Math.max(-3, Math.min(G.H - 0.05, q[1]))]).sort((a, b) => a[0] - b[0]);
  const dp = (a, eps) => { if (a.length < 3) return a; const A = a[0], B = a[a.length - 1], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz) || 1e-9; let m = 0, k = 0; for (let i = 1; i < a.length - 1; i++) { const d = Math.abs(dz * (a[i][0] - A[0]) - dx * (a[i][1] - A[1])) / L; if (d > m) { m = d; k = i; } } if (m <= eps) return [A, B]; return dp(a.slice(0, k + 1), eps).slice(0, -1).concat(dp(a.slice(k), eps)); };
  pts = dp(pts, 0.04); if (pts[0][0] > G.minX + 0.02) pts.unshift([G.minX, pts[0][1]]); if (pts[pts.length - 1][0] < G.maxX - 0.02) pts.push([G.maxX, pts[pts.length - 1][1]]);
  placeSnapshot(); p.f = p.f || {}; p.f.prof = pts.map(([x, z]) => ((x - G.minX) / W).toFixed(4) + ":" + z.toFixed(3)).join(";");
  placeTouch(p); l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); l3RenderSide();
  const st = gjutStats(p, G.poly); l3Status(`Underkanten ritad: tjocklek ${smFmt(st.PC.tmin * 1000, 0)}–${smFmt(st.PC.tmax * 1000, 0)} mm, volym ${smFmt(st.vol, 1)} m³.`);
}
function l3gpClear(p) { placeSnapshot(); if (p.f) delete p.f.prof; placeTouch(p); l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); l3RenderSide(); l3Status("Underkanten är rak igen."); }

/* Makadamen följer objekten som står i den: flyttas ett fundament byggs makadamen om så att avdraget och volymen stämmer. */
let l3mkT = 0;
function l3MkRefresh(p) {
  if (!p || /^sm:makadam/.test(String(p.type)) || !placements.some(q => /^sm:makadam/.test(String(q.type)))) return;
  clearTimeout(l3mkT); l3mkT = setTimeout(() => { placements.filter(q => /^sm:makadam/.test(String(q.type))).forEach(q => { try { l3RebuildOne(q); } catch (e) { console.warn(e); } }); if (typeof l3RenderSide === "function") l3RenderSide(true); }, 200);
}
