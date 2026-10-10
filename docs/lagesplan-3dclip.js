/* 3D-vyn – saxen (snitt) i bilden (Victor 2026-10-10: "jag skulle vilja se en sax i 3d-vyn som jag kan
   dra i och att saxens urklippskanter markeras på ett snyggt sätt").

   – Varje snitt får ett handtag med en sax mitt i bilden på snittplanet. Dra i saxen för att flytta
     snittet längs sin normal (samma som reglaget i snittfönstret); medan man drar visas planet som en
     tonad yta med kant. Dubbelklick på saxen vänder snittet.
   – Snittkanterna: där en yta skärs av planet ritas en tunn rosa kant, och insidan av de avskurna
     föremålen (baksidorna som syns genom snittet) tonas i snittfärgen – snittet ser fyllt ut. Görs i
     ljussättningens shader (Lambert), så det kostar inget extra även för stora modeller. */

const L3C_EDGE = "vec3( 0.88, 0.16, 0.38 )", L3C_FILL = "vec3( 0.96, 0.80, 0.86 )";
let l3cShaderDone = false;
/* Lägger in snittkanten i Lambert-shadern (en gång, innan något ritas). */
function l3cShader() {
  if (l3cShaderDone || typeof THREE === "undefined" || !THREE.ShaderLib || !THREE.ShaderLib.lambert) return;
  l3cShaderDone = true;
  const L = THREE.ShaderLib.lambert;
  L.fragmentShader = L.fragmentShader
    .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
	float l3Edge = 0.0;
	#if NUM_CLIPPING_PLANES > 0
	vec4 l3Pl;
	#pragma unroll_loop_start
	for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
		l3Pl = clippingPlanes[ i ];
		l3Edge = max( l3Edge, 1.0 - smoothstep( 1.2, 2.6, ( l3Pl.w - dot( vClipPosition, l3Pl.xyz ) ) / max( fwidth( dot( vClipPosition, l3Pl.xyz ) ), 1e-6 ) ) );
	}
	#pragma unroll_loop_end
	#endif`)
    .replace("#include <dithering_fragment>", `#include <dithering_fragment>
	#if NUM_CLIPPING_PLANES > 0
	if ( ! gl_FrontFacing ) gl_FragColor.rgb = mix( gl_FragColor.rgb, ${L3C_FILL}, 0.82 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, ${L3C_EDGE}, l3Edge );
	#endif`);
}

/* ---- Saxhandtagen ------------------------------------------------------------------------------- */
const l3c = { els: [], drag: null, plane: null };
/* Punkt på snittet nära mitten av det man tittar på. */
function l3cAnchor(c) { return c.plane.projectPoint(l3.orbit.target, new THREE.Vector3()); }
function l3cPlace() {
  if (!l3) return;
  const clips = l3.clips || [], host = l3.renderer.domElement.parentElement;
  while (l3c.els.length > clips.length) l3c.els.pop().remove();
  while (l3c.els.length < clips.length) {
    const i = l3c.els.length, el = document.createElement("button");
    el.type = "button"; el.className = "v3-scissor";
    el.innerHTML = `${L3_ICO.scissors}<span></span>`;
    el.onpointerdown = e => l3cDragStart(e, i);
    el.ondblclick = e => { e.preventDefault(); const c = l3.clips[i]; if (!c) return; c.plane.negate(); c.base = c.plane.constant; c.off = 0; if (typeof l3RenderClipDlg === "function") l3RenderClipDlg(); l3Render(); };
    host.appendChild(el); l3c.els.push(el);
  }
  clips.forEach((c, i) => {
    const el = l3c.els[i], q = l3ToScreen(l3cAnchor(c));
    el.style.display = q.behind ? "none" : "flex";
    el.style.left = q.x + "px"; el.style.top = q.y + "px";
    el.title = `Snitt ${i + 1} (${c.label}): dra för att flytta snittet, dubbelklick vänder det`;
    el.querySelector("span").textContent = `${(c.off >= 0 ? "+" : "") + String(Math.round(c.off * 100) / 100).replace(".", ",")} m`;
    el.classList.toggle("drag", !!(l3c.drag && l3c.drag.i === i));
  });
}
function l3cDragStart(e, i) {
  const c = l3.clips[i]; if (!c) return;
  e.preventDefault(); e.stopPropagation();
  const a = l3cAnchor(c), p0 = l3ToScreen(a), p1 = l3ToScreen(a.clone().add(c.plane.normal.clone().multiplyScalar(-1))); // +off = planet mot -normal
  const v = [p1.x - p0.x, p1.y - p0.y], vv = v[0] * v[0] + v[1] * v[1];
  l3c.drag = { i, x0: e.clientX, y0: e.clientY, off0: c.off, v, vv: vv || 1 };
  const el = e.currentTarget; el.setPointerCapture(e.pointerId);
  l3cShowPlane(c);
  const mv = ev => {
    const d = l3c.drag; if (!d) return;
    const dx = ev.clientX - d.x0, dy = ev.clientY - d.y0;
    // Planet flyttas lika långt som markören längs normalens riktning på skärmen (snäpper till 5 cm, Skift = 1 cm).
    let off = d.off0 + (dx * d.v[0] + dy * d.v[1]) / d.vv;
    const st = ev.shiftKey ? 0.01 : 0.05; off = Math.round(off / st) * st;
    l3cSet(i, off);
  };
  const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); l3c.drag = null; l3cShowPlane(null); if (typeof l3RenderClipDlg === "function") l3RenderClipDlg(); l3Render(); };
  el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
}
function l3cSet(i, off) {
  const c = l3.clips[i]; if (!c) return;
  c.off = off; c.plane.constant = c.base - off;
  const d = document.getElementById("v3Clip");
  if (d) { const r = d.querySelector(`[data-clipoff="${i}"]`), nb = d.querySelector(`[data-clipnum="${i}"]`); if (r) r.value = off; if (nb && document.activeElement !== nb) nb.value = String(Math.round(off * 100) / 100).replace(".", ","); }
  l3cShowPlane(l3c.drag ? c : null);
  l3Render();
}
/* Planet som en tonad yta med kant medan man drar. */
function l3cShowPlane(c) {
  if (l3c.plane) { l3.scene.remove(l3c.plane); l3c.plane.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3c.plane = null; }
  if (!c) return;
  const b = new THREE.Box3();
  l3.groups.bldg.children.forEach(m => { if (m.visible && m.geometry) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
  l3.placeMeshes.forEach(g => { if (g.visible) b.expandByObject(g); });
  const size = Math.max(20, b.isEmpty() ? 60 : b.getSize(new THREE.Vector3()).length() * 0.75);
  const center = c.plane.projectPoint(b.isEmpty() ? l3.orbit.target : b.getCenter(new THREE.Vector3()), new THREE.Vector3());
  const grp = new THREE.Group();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size)), new THREE.LineBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.7 }));
  grp.add(quad, edge);
  grp.position.copy(center);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.plane.normal.clone().normalize());
  [quad, edge].forEach(o => { o.renderOrder = 7; o.raycast = () => {}; o.userData.noHit = true; });
  grp.position.add(c.plane.normal.clone().multiplyScalar(0.01)); // en centimeter på den sida som syns – klipps inte bort
  l3.scene.add(grp); l3c.plane = grp;
}
