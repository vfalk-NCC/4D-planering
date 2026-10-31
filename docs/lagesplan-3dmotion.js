/* Små animationer som tillför något (Victor 2026-10-31: punkt 5, 6, 7, 8 och 12 ur förslagen).
   5  Minimapen: ring där man trycker och ett spår efter kamerans väg (i lagesplan-3dsplit.js, använder l3moOK).
   6  Markerade IFC-objekt "poppar": ytan tonas in med en blänk och glödkanten sveper ut och sätter sig.
   7  Nya mått: en ljuspunkt ritar ut måttlinjen, ändpunkterna pulserar och siffran räknar upp.
   8  Snitt: ett ljust svep längs snittplanet när man börjar dra i det.
   12 Paneler, toasts och laddning: kort fjädrande rörelse (CSS) och en progressring (lagesplan.js/html).
   Alla animationer går några sekunder, renderar bara medan de pågår, och är avstängda med "Minska rörelser" i systemet, på svaga telefoner och med Animationer av i menyn. */
const l3mo = { jobs: new Set(), raf: 0 };
function l3moOK() {
  try { if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return false; } catch (e) { /* */ }
  if (typeof lowMemDevice !== "undefined" && lowMemDevice) return false;
  return typeof l3Prefs !== "function" || l3Prefs().anim !== false;
}
const l3moEase = { out: t => 1 - Math.pow(1 - t, 3), back: t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2), inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 };
/* Kör step(p) med p 0→1 under ms millisekunder; ritar om 3D-vyn varje bild; done() sist. Returnerar jobbet (job.cancel()). */
function l3moRun(ms, step, done) {
  const job = { t0: performance.now(), ms, step, done, cancel() { l3mo.jobs.delete(job); } }; l3mo.jobs.add(job); if (!l3mo.raf) l3mo.raf = requestAnimationFrame(l3moTick); return job;
}
function l3moTick() {
  l3mo.raf = 0; const now = performance.now();
  [...l3mo.jobs].forEach(j => { let p = Math.min(1, (now - j.t0) / j.ms); try { j.step(p); } catch (e) { console.warn("anim", e); p = 1; } if (p >= 1) { l3mo.jobs.delete(j); try { j.done && j.done(); } catch (e) { console.warn("anim", e); } } });
  if (typeof l3Render === "function") l3Render(); if (l3mo.jobs.size) l3mo.raf = requestAnimationFrame(l3moTick);
}
function l3moTemp(name) { const g = new THREE.Group(); g.name = name; g.userData.noHit = true; l3.scene.add(g); return g; }
function l3moDrop(g) { if (!g) return; l3.scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }

/* ---- 6. Markering av IFC-objekt ----------------------------------------------------------------------------------------------- */
function l3moSelPop() {
  if (!l3moOK() || typeof l3bs === "undefined" || !l3bs.ov || !l3bs.ov.length) return; const ov = l3bs.ov.slice(), rows = [];
  ov.forEach(o => { if (!o.material) return; if (o.material.uniforms && o.material.uniforms.w) rows.push({ o, kind: "halo", w: o.material.uniforms.w.value, a: o.material.uniforms.a.value }); else if (o.userData.bselFill && o.material.opacity != null && o.material.colorWrite !== false) rows.push({ o, kind: "fill", op: o.material.opacity }); });
  if (!rows.length) return; if (l3mo.sel) l3mo.sel.cancel();
  const set = p => rows.forEach(r => { if (!r.o.parent) return; if (r.kind === "halo") { r.o.material.uniforms.w.value = r.w * (1 + 3.2 * (1 - l3moEase.back(Math.min(1, p * 1.15)))); r.o.material.uniforms.a.value = Math.min(1, r.a * (0.35 + 0.65 * l3moEase.out(p))); } else r.o.material.opacity = Math.min(1, r.op * (0.1 + 0.9 * l3moEase.out(p)) + 0.4 * Math.sin(Math.PI * p) * (1 - p * 0.3)); });
  set(0); l3mo.sel = l3moRun(560, set, () => { l3mo.sel = null; rows.forEach(r => { if (!r.o.parent) return; if (r.kind === "halo") { r.o.material.uniforms.w.value = r.w; r.o.material.uniforms.a.value = r.a; } else r.o.material.opacity = r.op; }); });
}

/* ---- 7. Nya mått ----------------------------------------------------------------------------------------------------------- */
function l3moMeasure(m) {
  if (!l3moOK() || !m || !m.pts || m.pts.length < 1) return; const O = l3.O, P = m.pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2]));
  let path = P; try { if (typeof l3mDimPts === "function" && typeof l3mCanOff === "function" && l3mCanOff(m) && m.off) path = l3mDimPts(m).map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2])); } catch (e) { /* */ }
  const g = l3moTemp("moMeas"), segs = [], tot = path.reduce((a, p, i) => { if (!i) return 0; const d = p.distanceTo(path[i - 1]); segs.push(d); return a + d; }, 0) || 1;
  const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.length > 1 ? path : [path[0], path[0]]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false })); trail.renderOrder = 60; trail.raycast = () => {};
  const head = new THREE.Points(new THREE.BufferGeometry().setFromPoints([path[0]]), new THREE.PointsMaterial({ color: 0xfbbf24, size: 13, sizeAttenuation: false, transparent: true, opacity: 1, depthTest: false })); head.renderOrder = 61; head.raycast = () => {};
  const pulses = P.map(p => { const q = new THREE.Points(new THREE.BufferGeometry().setFromPoints([p]), new THREE.PointsMaterial({ color: 0x2563eb, size: 8, sizeAttenuation: false, transparent: true, opacity: 0, depthTest: false })); q.renderOrder = 61; q.raycast = () => {}; g.add(q); return q; });
  g.add(trail, head);
  const at = d => { let a = d; for (let i = 0; i < segs.length; i++) { if (a <= segs[i]) return [i, a / (segs[i] || 1)]; a -= segs[i]; } return [segs.length - 1, 1]; };
  const lab0 = l3m.labels && l3m.labels.get(m.id), txt0 = lab0 ? lab0.textContent : "", num = txt0.match(/-?\d+[.,]?\d*/), val = num ? Number(num[0].replace(",", ".")) : null, dec = num && /[.,](\d+)/.exec(num[0]) ? /[.,](\d+)/.exec(num[0])[1].length : 0;
  if (lab0) lab0.style.opacity = "0.25";
  l3moRun(900, p => {
    const e = l3moEase.inOut(Math.min(1, p / 0.62)), d = e * tot; if (path.length > 1) { const [i, f] = at(d), pts = path.slice(0, i + 1).concat([path[i].clone().lerp(path[i + 1], f)]); trail.geometry.setFromPoints(pts); head.geometry.setFromPoints([pts[pts.length - 1]]); } trail.material.opacity = p < 0.62 ? 0.95 : 0.95 * (1 - (p - 0.62) / 0.38); head.material.opacity = p < 0.62 ? 1 : Math.max(0, 1 - (p - 0.62) / 0.15);
    pulses.forEach((q, k) => { const t0 = P.length > 1 ? (k / (P.length - 1)) * 0.5 : 0, q2 = Math.max(0, Math.min(1, (p - t0 - 0.08) / 0.5)); q.material.size = 8 + 26 * q2; q.material.opacity = q2 <= 0 ? 0 : 0.7 * (1 - q2); });
    const lab = l3m.labels && l3m.labels.get(m.id); if (lab && val != null) { const f = l3moEase.out(Math.min(1, p / 0.8)); lab.textContent = txt0.replace(num[0], (val * f).toFixed(dec).replace(".", ",")); lab.style.opacity = String(0.25 + 0.75 * Math.min(1, p / 0.5)); }
  }, () => { l3moDrop(g); const lab = l3m.labels && l3m.labels.get(m.id); if (lab && txt0) { lab.textContent = txt0; lab.style.opacity = ""; } });
}

/* ---- 8. Snitt: svep längs planet -------------------------------------------------------------------------------------------- */
function l3moClipSweep(grp, size, normal) {
  if (!l3moOK() || !grp || performance.now() - (l3mo.clipT || 0) < 900) return; l3mo.clipT = performance.now();
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 4; const c = cv.getContext("2d"), gr = c.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.95)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, 128, 4);
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.18, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0xff4d6d, transparent: true, opacity: 0.55, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); sw.renderOrder = 8; sw.raycast = () => {}; sw.userData.noHit = true;
  l3.scene.add(sw); if (l3mo.sweep) { l3mo.sweep.cancel(); l3moDrop(l3mo.sweepObj); } l3mo.sweepObj = sw;
  l3mo.sweep = l3moRun(800, p => { const g = l3c && l3c.plane; if (!g) { sw.visible = false; return; } sw.visible = true; sw.quaternion.copy(g.quaternion); const e = l3moEase.inOut(p); sw.position.copy(g.position).add(new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion).multiplyScalar((e - 0.5) * size * 1.1)).add(normal.clone().normalize().multiplyScalar(0.02)); sw.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, p * 1.02)); }, () => { l3moDrop(sw); l3mo.sweepObj = null; l3mo.sweep = null; });
}
