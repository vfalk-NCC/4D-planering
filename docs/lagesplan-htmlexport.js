/* Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM:s självständiga HTML): lägesplanen och 3D i EN fil
   som kan skickas till någon utan Trimble Connect och öppnas offline i en vanlig webbläsare.

   I filen: lägesplanen som bild (det som syns – datum, lager, zoner), 3D-scenen (marken med planen som textur,
   etableringen, de planerade objekten och de inlästa IFC-modellerna som de visas) och en liten visare (three.js
   inbäddad – ingen internetuppkoppling behövs). Geometrin packas: positioner som 16-bitars tal per bit, en färg
   per hörn, gzip och base64. Tryck på ett objekt i 3D: namnet visas. */

const HX_BIG_TRIS = 2500000;

/* Tidslinjen som tillval (Victor 2026-10-13): aktiviteten bakom varje objekt följer med i filen, så att visaren kan visa
   läget ett valfritt datum. hxReg är null utan tillvalet. */
let hxReg = null;
function hxSchedIdx(itemId) {
  if (!hxReg || !itemId) return -1;
  if (hxReg.map.has(itemId)) return hxReg.map.get(itemId);
  const r = (typeof items !== "undefined" ? items : []).find(x => x.id === itemId);
  let k = -1;
  if (r && r.start_date) {
    const o = Number(r.done_opacity);
    k = hxReg.list.push({ s: r.start_date, e: r.end_date || r.start_date, a: r.actual_end_date || "", p: Number(r.progress) || 0, t: r.temporary === true ? 1 : 0, d: r.demolition === true ? 1 : 0, c: /^#[0-9a-f]{6}$/i.test(String(r.done_color || "")) ? r.done_color : "", o: r.done_opacity != null && r.done_opacity !== "" && Number.isFinite(o) ? o : -1, n: r.object_name || r.activity || "" }) - 1;
  }
  hxReg.map.set(itemId, k);
  return k;
}

/* 3D-scenen som delar: [{ pos: Float32 (världen, relativt O), col: Uint8 (rgb per hörn), idx: Uint32, op, names: [[start, count, namn]] }] */
function hxCollect(withBldg) {
  const parts = [], v = new THREE.Vector3(), c = new THREE.Color();
  l3.scene.updateMatrixWorld(true);
  const add = (mesh, names) => {
    const g = mesh.geometry, P = g.getAttribute("position");
    if (!P || !P.count) return;
    const pos = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
    const C = g.getAttribute("color"), col = new Uint8Array(P.count * 3), mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (C && mat && mat.vertexColors) {
      const k = C.array instanceof Uint8Array ? 1 : 255;
      for (let i = 0; i < P.count; i++) { col[i * 3] = Math.min(255, Math.round(C.getX(i) * (C.normalized ? 255 : k))); col[i * 3 + 1] = Math.min(255, Math.round(C.getY(i) * (C.normalized ? 255 : k))); col[i * 3 + 2] = Math.min(255, Math.round(C.getZ(i) * (C.normalized ? 255 : k))); }
    } else {
      c.copy(mat && mat.color ? mat.color : new THREE.Color(0x999999));
      for (let i = 0; i < P.count; i++) { col[i * 3] = c.r * 255; col[i * 3 + 1] = c.g * 255; col[i * 3 + 2] = c.b * 255; }
    }
    const idx = g.index ? Uint32Array.from(g.index.array.subarray(g.drawRange.start || 0, Math.min(g.index.count, (g.drawRange.start || 0) + (isFinite(g.drawRange.count) ? g.drawRange.count : g.index.count)))) : Uint32Array.from({ length: P.count }, (_, i) => i);
    if (!idx.length) return;
    parts.push({ pos, col, idx, op: mat && mat.transparent ? Math.max(0.15, mat.opacity) : 1, names: names || [] });
  };
  if (withBldg && typeof l3b !== "undefined") l3.groups.bldg.traverse(o => {
    if (!o.isMesh || !o.userData.l3b || o.userData.l3bMain || !l3VisibleChain(o)) return;
    add(o, o.userData.l3b.ranges.map(r => hxReg ? [r.start, r.count, r.name || "", hxSchedIdx(r.itemId)] : [r.start, r.count, r.name || ""]));
  });
  l3.placeMeshes.forEach((grp, id) => {
    if (!l3VisibleChain(grp)) return;
    const p = placements.find(x => x.id === id), nm = p ? p.name || ((placeLib(p.type) || {}).label || "") : "";
    grp.traverse(o => { if (o.isMesh && !o.userData.selEdge && !o.userData.noHit && l3VisibleChain(o)) add(o, [hxReg ? [0, o.geometry.getAttribute("position").count, nm, hxSchedIdx(p && p.itemId)] : [0, o.geometry.getAttribute("position").count, nm]]); });
  });
  if (l3.objMesh && l3VisibleChain(l3.objMesh) && l3.objMesh.isMesh) add(l3.objMesh, []);
  return parts;
}
/* Punktmolnen som syns i 3D-vyn (Victor 2026-10-19: "exportera aktuell vy med exakt de här inställningarna inklusive punktmoln"):
   punkterna med sina färger precis som de ritas nu (färgläge, höjdfilter m.m. ligger redan i färgerna) och molnets punktstorlek,
   rundhet och genomskinlighet. Är det fler än HX_PC_CAP punkter glesas de ut jämnt, lika mycket i alla moln. */
const HX_PC_CAP = 3e6;
function hxCloudCount() {
  if (typeof l3pc === "undefined") return 0;
  let n = 0; l3pc.clouds.forEach(c => { if (c.visible && c.group && c.group.visible && l3VisibleChain(c.group)) c.group.children.forEach(o => { if (o.isPoints && o.visible !== false) n += o.geometry.getAttribute("position").count; }); });
  return n;
}
function hxCollectClouds(cap) {
  const out = [], total = hxCloudCount(), k = Math.max(1, Math.ceil(total / cap)), v = new THREE.Vector3();
  if (!total) return out;
  l3.scene.updateMatrixWorld(true);
  l3pc.clouds.forEach(c => {
    if (!(c.visible && c.group && c.group.visible && l3VisibleChain(c.group))) return;
    const pts = [];
    c.group.children.forEach(o => { if (!o.isPoints || o.visible === false) return; const P = o.geometry.getAttribute("position"), C = o.geometry.getAttribute("color"); if (!P) return; for (let i = 0; i < P.count; i += k) pts.push([o, P, C, i]); });
    if (!pts.length) return;
    const pos = new Float32Array(pts.length * 3), col = new Uint8Array(pts.length * 3);
    pts.forEach(([o, P, C, i], j) => {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos[j * 3] = v.x; pos[j * 3 + 1] = v.y; pos[j * 3 + 2] = v.z;
      if (C) { const m = C.normalized || C.array instanceof Uint8Array ? 1 : 255; col[j * 3] = Math.min(255, C.getX(i) * m * (C.normalized ? 255 : 1)); col[j * 3 + 1] = Math.min(255, C.getY(i) * m * (C.normalized ? 255 : 1)); col[j * 3 + 2] = Math.min(255, C.getZ(i) * m * (C.normalized ? 255 : 1)); }
      else { col[j * 3] = col[j * 3 + 1] = col[j * 3 + 2] = 200; }
    });
    const mt = c.mat || {};
    out.push({ pos, col, name: c.name || "", size: mt.size || 2, atten: !!mt.sizeAttenuation, round: !!mt.map, op: mt.transparent ? mt.opacity : 1, k });
  });
  return out;
}
/* Vyn som den är just nu: kamera (läge, mål, bildvinkel), snittplan och bakgrund – så att filen öppnas i samma vy. */
function hxViewState() {
  const cam = l3.camera, t = l3.orbit.target, v = {
    cam: { p: [cam.position.x, cam.position.y, cam.position.z], t: [t.x, t.y, t.z], fov: cam.isPerspectiveCamera ? cam.fov : 0, ortho: !!cam.isOrthographicCamera, zoom: cam.zoom || 1 },
    clip: (l3.renderer.clippingPlanes || []).map(pl => ({ n: [pl.normal.x, pl.normal.y, pl.normal.z], c: pl.constant })),
    bg: l3.scene.background && l3.scene.background.isColor ? "#" + l3.scene.background.getHexString() : null
  };
  if (cam.isOrthographicCamera) v.cam.dist = cam.position.distanceTo(t);
  return v;
}

/* Packas: rubrik (JSON) + binärt, gzip, base64. */
async function hxPack(parts, ground, extra, clouds) {
  const body = []; let off = 0;
  const put = arr => { const pad = (4 - off % 4) % 4; if (pad) { body.push(new Uint8Array(pad)); off += pad; } const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); body.push(u); const at = off; off += u.byteLength; return at; };
  const meta = { parts: [], ground: null, ...(extra || {}) };
  parts.forEach(p => {
    const n = p.pos.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let a = 0; a < 3; a++) { const x = p.pos[i + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    const sz = mx.map((x, a) => Math.max(1e-6, x - mn[a])), q = new Uint16Array(p.pos.length);
    for (let i = 0; i < p.pos.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] = Math.round((p.pos[i + a] - mn[a]) / sz[a] * 65535);
    const i16 = n < 65536;
    meta.parts.push({ n, ni: p.idx.length, mn, sz, i16, op: p.op, names: p.names, pos: put(q), col: put(p.col), idx: put(i16 ? Uint16Array.from(p.idx) : p.idx) });
  });
  meta.clouds = [];
  (clouds || []).forEach(p => {
    const n = p.pos.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let a = 0; a < 3; a++) { const x = p.pos[i + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    const sz = mx.map((x, a) => Math.max(1e-6, x - mn[a])), q = new Uint16Array(p.pos.length);
    for (let i = 0; i < p.pos.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] = Math.round((p.pos[i + a] - mn[a]) / sz[a] * 65535);
    meta.clouds.push({ n, mn, sz, name: p.name, size: p.size, atten: p.atten, round: p.round, op: p.op, pos: put(q), col: put(p.col) });
  });
  if (ground) meta.ground = { pos: Array.from(ground.pos), uv: Array.from(ground.uv), idx: Array.from(ground.idx) };
  const head = new TextEncoder().encode(JSON.stringify(meta));
  const pre = new Uint8Array(8 + head.length + ((4 - (8 + head.length) % 4) % 4));
  new DataView(pre.buffer).setUint32(0, 0x31584834, true); new DataView(pre.buffer).setUint32(4, head.length, true); pre.set(head, 8);
  const gz = new Uint8Array(await new Response(new Blob([pre, ...body]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let s = ""; for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
  return { b64: btoa(s), bytes: gz.length, hasTl: !!(extra && extra.sched) };
}
async function hxText(path) { const r = await fetch(path); if (!r.ok) throw new Error("Kunde inte läsa " + path); return (await r.text()).replace(/<\/script/gi, "<\\/script"); }
const hxEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

/* Själva exporten. Från 2D utan öppen 3D-vy: 3D-vyn öppnas en kort stund för att samla in scenen. */
async function exportOfflineHtml() {
  if (!plan) { alert("Välj en arbetsyta först."); return; }
  const key = "hxexp";
  const v3 = document.getElementById("view3d"), was3d = !!(v3 && !v3.classList.contains("hidden") && typeof l3 !== "undefined" && l3.scene);
  try {
    busyProgress(key, "Fristående HTML: lägesplanen", 0.05);
    const cv = composeImage(4096, true);
    const img2d = cv.toDataURL("image/jpeg", 0.88);
    let pack = null, ground = null, tris = 0, note = "";
    const withTl = !!($("hxTimeline") && $("hxTimeline").checked);
    hxReg = withTl ? { list: [], map: new Map() } : null;
    if (plan.calib && typeof open3d === "function") {
      if (!was3d) {
        busyProgress(key, "Fristående HTML: 3D-scenen", 0.15);
        await open3d();
        // Byggnaden som var tänd förra gången läses ur cachen i bakgrunden – vänta in den (högst 60 s).
        for (let i = 0; i < 120 && typeof l3b !== "undefined" && (l3b.busy || (!l3b.models.length && typeof l3bRemembered === "function" && l3bRemembered().length && i < 10)); i++) await new Promise(r => setTimeout(r, 500));
      }
      let bldgTris = 0;
      if (typeof l3b !== "undefined") l3b.models.filter(m => m.visible).forEach(m => { bldgTris += m.tris || 0; });
      let withBldg = bldgTris > 0;
      if (bldgTris > HX_BIG_TRIS) withBldg = await uiConfirm(`Byggnaden har ${(bldgTris / 1e6).toFixed(1).replace(".", ",")} miljoner trianglar – filen kan bli stor (ungefär ${Math.round(bldgTris * 9 / 1e6)} MB) och tung att öppna på en svag dator. Ta med byggnaden?`, { ok: "Ta med", cancel: "Utan byggnaden" });
      if (!withBldg && bldgTris) note = "Byggnaden är inte med i den här filen.";
      let clouds = [], cloudNote = "";
      const nPts = hxCloudCount();
      if (nPts > 0) {
        clouds = hxCollectClouds(HX_PC_CAP);
        const kept = clouds.reduce((a, c) => a + c.pos.length / 3, 0);
        cloudNote = kept < nPts ? `Punktmolnet är utglesat till ${(kept / 1e6).toFixed(1).replace(".", ",")} av ${(nPts / 1e6).toFixed(1).replace(".", ",")} miljoner punkter.` : "";
      }
      const view = was3d ? hxViewState() : null;
      if (cloudNote) note = (note ? note + " " : "") + cloudNote;
      busyProgress(key, "Fristående HTML: packar 3D", 0.4);
      const parts = hxCollect(withBldg);
      parts.forEach(p => { tris += p.idx.length / 3; });
      if (l3.planMesh) { const g = l3.planMesh.geometry; l3.planMesh.updateMatrixWorld(true); const P = g.getAttribute("position"), v = new THREE.Vector3(), pos = []; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(l3.planMesh.matrixWorld); pos.push(v.x, v.y, v.z); } ground = { pos, uv: Array.from(g.getAttribute("uv").array), idx: Array.from(g.index.array) }; }
      let tlMeta = null;
      if (hxReg && hxReg.list.length) {
        const hex = ph => "#" + new THREE.Color(phaseColor(ph)).getHexString();
        const ds = hxReg.list.flatMap(x => [x.s, x.e, x.a]).filter(Boolean).sort(), today = todayIso();
        tlMeta = { sched: hxReg.list, tl: { c: { pagaende: hex("pagaende"), klar: hex("klar"), planerad: hex("planerad") }, o: 0.3, min: ds[0], max: ds[ds.length - 1], today } };
      } else if (withTl) note = (note ? note + " " : "") + "Tidslinjen: inga objekt har en kopplad aktivitet – den är inte med.";
      hxReg = null;
      pack = await hxPack(parts, ground, Object.assign({}, tlMeta || {}, view ? { view } : {}), clouds);
      if (!was3d && typeof close3d === "function") close3d();
    } else note = "Arbetsytan är inte kalibrerad mot 3D-modellen – bara lägesplanen är med.";
    busyProgress(key, "Fristående HTML: visaren", 0.8);
    const three = await hxText("vendor/three/three.min.js"), orbit = await hxText("vendor/three/OrbitControls.js");
    const date = ($("dateInput") && $("dateInput").value) || todayIso();
    const title = `Lägesplan – ${plan.name || ""}`;
    const info = { title, plan: plan.name || "", date, by: (settings && settings.userName) || "", at: new Date().toISOString().slice(0, 16).replace("T", " "), note, tris, tl: !!(pack && pack.hasTl) };
    const html = hxHtml(info, img2d, pack ? pack.b64 : "", three, orbit);
    const name = `${title} ${date}.html`.replace(/[\\/:*?"<>|]/g, "-");
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, name);
    busyProgress(key, "", null);
    const mb = (blob.size / 1e6).toFixed(1).replace(".", ",");
    const msg = `✓ ${name} (${mb} MB) – öppnas i en vanlig webbläsare, även utan internet.${note ? " " + note : ""}`;
    if (typeof setSaveStatus === "function") setSaveStatus(msg);
    if (typeof l3Status === "function" && was3d) l3Status(msg);
    return { name, size: blob.size, tris, html: window.__hxKeep ? html : undefined };
  } catch (e) {
    busyProgress(key, "", null);
    alert("Kunde inte skapa HTML-filen: " + e.message);
    return null;
  }
}

/* Visaren i den exporterade filen (allt inbäddat). */
function hxHtml(info, img2d, b64, three, orbit) {
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${hxEsc(info.title)}</title>
<style>
:root{--bg:#f7f8fa;--ink:#0f172a;--mut:#64748b;--line:#e2e8f0;--acc:#6d5efc}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px;background:#fff;border-bottom:1px solid var(--line)}
header h1{font-size:16px;margin:0;flex:1;min-width:180px}header .m{color:var(--mut);font-size:12px}
.tabs{display:flex;background:#eef0f5;border-radius:9px;padding:3px}.tabs button{border:0;background:transparent;padding:6px 14px;border-radius:7px;font:inherit;cursor:pointer;color:var(--mut)}
.tabs button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
main{position:absolute;top:57px;left:0;right:0;bottom:0;overflow:hidden}
#v2{position:absolute;inset:0;overflow:hidden;cursor:grab;touch-action:none;background:#fff}#v2 img{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none}
#v3{position:absolute;inset:0;display:none}#v3 canvas{display:block;width:100%;height:100%;touch-action:none}
.hint{position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--mut)}
#tip{position:absolute;display:none;background:#111827;color:#fff;font-size:12px;padding:4px 8px;border-radius:6px;pointer-events:none;transform:translate(-50%,-140%)}
.fit{position:absolute;right:12px;bottom:12px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
#tl{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:none;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;max-width:94%;background:#fff;border:1px solid var(--line);border-radius:12px;padding:7px 12px;box-shadow:0 6px 20px rgba(0,0,0,.14);font-size:12px}
#tl button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 10px;font:inherit;cursor:pointer}#tl input[type=range]{accent-color:#f59e0b}#tl .d{font-weight:700;min-width:96px;text-align:center}#tl .sm{color:var(--mut)}#tl label{display:flex;align-items:center;gap:5px;color:var(--mut)}
.note{position:absolute;right:12px;top:12px;max-width:320px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:6px 10px;font-size:12px}
</style></head><body>
<header><h1>${hxEsc(info.title)}</h1><span class="m">Datum ${hxEsc(info.date)} · exporterad ${hxEsc(info.at)}${info.by ? " av " + hxEsc(info.by) : ""}</span>
<div class="tabs"><button class="on" data-t="2">2D lägesplan</button>${b64 ? `<button data-t="3">3D</button>` : ""}</div></header>
<main><div id="v2"><img id="img" alt="Lägesplan" src="${img2d}"></div><div id="v3"><div id="tip"></div></div>
${info.tl ? `<div id="tl"><button id="tlPlay" title="Spela upp">▶</button><input type="range" id="tlSl" min="0" max="1" value="0" style="width:min(380px,48vw)"><span class="d" id="tlD"></span><button id="tlToday">Idag</button><label>Klart <input type="range" id="tlOp" min="0" max="100" step="5" value="30" style="width:80px"><span id="tlOpV">30</span>%</label><label><input type="checkbox" id="tlFut"> Kommande</label><span class="sm" id="tlSum"></span></div>` : ""}
<div class="hint" id="hint">Dra för att flytta · hjul eller nyp för att zooma</div><button class="fit" id="fit">Visa allt</button>${info.note ? `<div class="note">${hxEsc(info.note)}</div>` : ""}</main>
<script>${three}</script><script>${orbit}</script>
<script>
(function(){
var D=${JSON.stringify(b64)};
var v2=document.getElementById('v2'),img=document.getElementById('img'),v3=document.getElementById('v3'),hint=document.getElementById('hint'),tab='2';
var s=1,x=0,y=0;function ap(){img.style.transform='translate('+x+'px,'+y+'px) scale('+s+')';}
function fit2(){var W=v2.clientWidth,H=v2.clientHeight,iw=img.naturalWidth||1,ih=img.naturalHeight||1;s=Math.min(W/iw,H/ih);x=(W-iw*s)/2;y=(H-ih*s)/2;ap();}
img.onload=fit2;if(img.complete)fit2();
var pts={},last=null;
v2.addEventListener('pointerdown',function(e){v2.setPointerCapture(e.pointerId);pts[e.pointerId]=[e.clientX,e.clientY];last=null;});
v2.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;var ids=Object.keys(pts);var p=pts[e.pointerId];
 if(ids.length===1){x+=e.clientX-p[0];y+=e.clientY-p[1];}
 pts[e.pointerId]=[e.clientX,e.clientY];
 if(ids.length===2){var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a[0]-b[0],a[1]-b[1]),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2-57;if(last){var f=d/last;x=cx-(cx-x)*f;y=cy-(cy-y)*f;s*=f;}last=d;}
 ap();});
function up(e){delete pts[e.pointerId];last=null;}v2.addEventListener('pointerup',up);v2.addEventListener('pointercancel',up);
v2.addEventListener('wheel',function(e){e.preventDefault();var r=v2.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top,f=Math.exp(-e.deltaY*0.0015);x=cx-(cx-x)*f;y=cy-(cy-y)*f;s*=f;ap();},{passive:false});
var r3=null;
document.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){tab=b.dataset.t;document.querySelectorAll('.tabs button').forEach(function(o){o.classList.toggle('on',o===b);});
 v2.style.display=tab==='2'?'block':'none';v3.style.display=tab==='3'?'block':'none';
 hint.textContent=tab==='2'?'Dra för att flytta · hjul eller nyp för att zooma':'Vänster: rotera · höger/två fingrar: flytta · hjul/nyp: zooma · tryck: namn';
 if(tab==='3'){if(!r3)init3();else r3.resize();}var tlb=document.getElementById('tl');if(tlb){if(tab==='2')tlb.style.display='none';else if(tlb.dataset.on)tlb.style.display='flex';}};});
document.getElementById('fit').onclick=function(){if(tab==='2')fit2();else if(r3)r3.fit();};
window.addEventListener('resize',function(){if(tab==='2')fit2();else if(r3)r3.resize();});
async function unpack(){var bin=atob(D),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
 var buf=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();var dv=new DataView(buf),hl=dv.getUint32(4,true);
 var meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,8,hl)));return {meta:meta,buf:buf,base:8+hl+((4-(8+hl)%4)%4)};}
function timeline(m,P,S,meshes,draw){
 var T=m.tl,SC=m.sched,tl=document.getElementById('tl');
 function hex(h){var c=new THREE.Color(h);return [c.r*255,c.g*255,c.b*255];}
 var COL={pagaende:hex(T.c.pagaende),klar:hex(T.c.klar),planerad:hex(T.c.planerad)},future=false,doneOp=T.o,asof=T.today;
 function day(iso){return Math.round(Date.parse(iso+'T00:00:00Z')/86400000);}
 function iso(n){return new Date(n*86400000).toISOString().slice(0,10);}
 var d0=day(T.min),d1=day(T.max);if(asof<T.min)asof=T.min;if(asof>T.max)asof=T.max;
 P.forEach(function(q){var ns=q.p.names;if(!ns.some(function(r){return r.length>3&&r[3]>=0;})){q.tl=false;return;}
  q.tl=true;var n=q.p.n,g=q.g,vr=new Int32Array(n).fill(-1);
  ns.forEach(function(r,i){for(var v=r[0];v<r[0]+r[1]&&v<n;v++)vr[v]=i;});
  var idx=g.index.array,nt=idx.length/3,rc=new Int32Array(ns.length+1),tr=new Int32Array(nt),t,b;
  for(t=0;t<nt;t++){b=vr[idx[t*3]]+1;tr[t]=b;rc[b]++;}
  var off=new Int32Array(ns.length+2);for(var i=0;i<=ns.length;i++)off[i+1]=off[i]+rc[i];
  var cur=off.slice(),sorted=new idx.constructor(idx.length);
  for(t=0;t<nt;t++){b=tr[t];var o=cur[b]++*3;sorted[o]=idx[t*3];sorted[o+1]=idx[t*3+1];sorted[o+2]=idx[t*3+2];}
  q.off=off;q.sorted=sorted;
  var g2=new THREE.BufferGeometry();g2.setAttribute('position',g.getAttribute('position'));g2.setAttribute('color',g.getAttribute('color'));
  g2.setIndex(new THREE.BufferAttribute(new idx.constructor(idx.length),1));
  var m2=new THREE.Mesh(g2,new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:0,specular:0x000000,side:THREE.DoubleSide,transparent:true,opacity:doneOp,depthWrite:false}));
  m2.userData.names=ns;S.add(m2);q.g2=g2;q.m2=m2;meshes.push(m2);});
 /* 0 = dold, 1 = vanlig (färg), 2 = klar (genomskinlig) */
 function stateOf(s,d){var end=(s.a&&s.a>s.e)?s.a:s.e,tEnd=s.a||s.e;
  if(s.t&&(d<s.s||d>tEnd))return [0];
  if(s.d&&d>tEnd)return [0];
  if(d>end)return [2,s.c?hex(s.c):COL.klar];
  if(d>=s.s)return [1,COL.pagaende];
  return (s.d||future)?[1,COL.planerad]:[0];}
 var sum=document.getElementById('tlSum');
 function apply(){var d=asof,cnt={done:0,going:0,soon:0};
  SC.forEach(function(s){var end=(s.a&&s.a>s.e)?s.a:s.e;if(d>end)cnt.done++;else if(d>=s.s)cnt.going++;else cnt.soon++;});
  sum.textContent=cnt.done+' klara · '+cnt.going+' pågår · '+cnt.soon+' kvar';
  P.forEach(function(q){if(!q.tl)return;var ns=q.p.names,col=q.g.getAttribute('color'),arr=col.array,i1=q.g.index.array,i2=q.g2.index.array,n1=0,n2=0,o=q.off,srt=q.sorted;
   i1.set(srt.subarray(o[0]*3,o[1]*3),n1);n1+=(o[1]-o[0])*3;
   for(var i=0;i<ns.length;i++){var r=ns[i],k=r.length>3?r[3]:-1,a=o[i+1]*3,b=o[i+2]*3;
    if(k<0){i1.set(srt.subarray(a,b),n1);n1+=b-a;continue;}
    var st=stateOf(SC[k],d);if(st[0]===0)continue;
    var rgb=st[1];for(var v=r[0];v<r[0]+r[1]&&v<q.p.n;v++){arr[v*3]=rgb[0];arr[v*3+1]=rgb[1];arr[v*3+2]=rgb[2];}
    if(st[0]===2){i2.set(srt.subarray(a,b),n2);n2+=b-a;}else{i1.set(srt.subarray(a,b),n1);n1+=b-a;}}
   col.needsUpdate=true;q.g.index.needsUpdate=true;q.g2.index.needsUpdate=true;q.g.setDrawRange(0,n1);q.g2.setDrawRange(0,n2);q.m2.material.opacity=doneOp;});
  document.getElementById('tlD').textContent=asof;document.getElementById('tlSl').value=day(asof)-d0;draw();}
 var pend=0;function later(){if(pend)return;pend=requestAnimationFrame(function(){pend=0;apply();});}
 var sl=document.getElementById('tlSl');sl.max=Math.max(1,d1-d0);
 sl.oninput=function(){asof=iso(d0+Number(sl.value));later();};
 document.getElementById('tlToday').onclick=function(){asof=T.today<T.min?T.min:T.today>T.max?T.max:T.today;apply();};
 document.getElementById('tlOp').oninput=function(){doneOp=this.value/100;document.getElementById('tlOpV').textContent=this.value;later();};
 document.getElementById('tlFut').onchange=function(){future=this.checked;apply();};
 var timer=null,pb=document.getElementById('tlPlay');
 pb.onclick=function(){if(timer){clearInterval(timer);timer=null;pb.textContent='▶';return;}
  if(day(asof)>=d1)asof=T.min;pb.textContent='⏸';timer=setInterval(function(){if(day(asof)>=d1){clearInterval(timer);timer=null;pb.textContent='▶';return;}asof=iso(day(asof)+1);apply();},160);};
 tl.dataset.on='1';tl.style.display='flex';apply();}
async function init3(){
 var R=new THREE.WebGLRenderer({antialias:true});R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));v3.appendChild(R.domElement);
 var S=new THREE.Scene();S.background=new THREE.Color(0xf7f8fa);var C=new THREE.PerspectiveCamera(50,1,0.1,50000);C.up.set(0,0,1);
 S.add(new THREE.HemisphereLight(0xffffff,0xd9d6cf,0.5));var sun=new THREE.DirectionalLight(0xffffff,0.62);sun.position.set(-0.5,-0.8,1.2);S.add(sun);var fl=new THREE.DirectionalLight(0xffffff,0.18);fl.position.set(0.7,0.6,0.25);S.add(fl);
 var O=new THREE.OrbitControls(C,R.domElement);O.screenSpacePanning=true;
 var d=await unpack(),m=d.meta,buf=d.buf,base=d.base,box=new THREE.Box3(),meshes=[],P=[];
 m.parts.forEach(function(p){var q=new Uint16Array(buf,base+p.pos,p.n*3),pos=new Float32Array(p.n*3);for(var i=0;i<pos.length;i+=3)for(var a=0;a<3;a++)pos[i+a]=p.mn[a]+q[i+a]/65535*p.sz[a];
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(buf.slice(base+p.col,base+p.col+p.n*3)),3,true));
  g.setIndex(new THREE.BufferAttribute(p.i16?new Uint16Array(buf.slice(base+p.idx,base+p.idx+p.ni*2)):new Uint32Array(buf.slice(base+p.idx,base+p.idx+p.ni*4)),1));g.computeBoundingSphere();g.computeBoundingBox();
  var mat=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:0,specular:0x000000,side:THREE.DoubleSide,transparent:p.op<1,opacity:p.op,depthWrite:p.op>=1});
  var me=new THREE.Mesh(g,mat);me.userData.names=p.names;S.add(me);meshes.push(me);P.push({me:me,g:g,p:p});box.union(g.boundingBox);});
  function disc(){var cv=document.createElement('canvas');cv.width=cv.height=64;var x=cv.getContext('2d');x.beginPath();x.arc(32,32,30,0,7);x.fillStyle='#fff';x.fill();return new THREE.CanvasTexture(cv);}
 (m.clouds||[]).forEach(function(c){var q=new Uint16Array(buf,base+c.pos,c.n*3),pos=new Float32Array(c.n*3);for(var i=0;i<pos.length;i+=3)for(var a=0;a<3;a++)pos[i+a]=c.mn[a]+q[i+a]/65535*c.sz[a];
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(buf.slice(base+c.col,base+c.col+c.n*3)),3,true));g.computeBoundingBox();
  var pm=new THREE.PointsMaterial({size:c.size,sizeAttenuation:c.atten,vertexColors:true,transparent:c.op<1,opacity:c.op,depthWrite:c.op>=1});
  if(c.round){pm.map=disc();pm.alphaTest=0.5;}
  var pt=new THREE.Points(g,pm);pt.raycast=function(){};S.add(pt);box.union(g.boundingBox);});
 if(m.ground){var gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(m.ground.pos,3));gg.setAttribute('uv',new THREE.Float32BufferAttribute(m.ground.uv,2));gg.setIndex(m.ground.idx);
  var tx=new THREE.Texture(img);tx.needsUpdate=true;tx.anisotropy=8;
  var gm=new THREE.Mesh(gg,new THREE.MeshBasicMaterial({map:tx,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));S.add(gm);gg.computeBoundingBox();if(box.isEmpty())box.copy(gg.boundingBox);}
 function resize(){var w=v3.clientWidth,h=v3.clientHeight;R.setSize(w,h,false);C.aspect=w/Math.max(1,h);C.updateProjectionMatrix();draw();}
 function fit(){var c=box.getCenter(new THREE.Vector3()),sz=Math.max(10,box.getSize(new THREE.Vector3()).length());O.target.copy(c);C.position.copy(c).add(new THREE.Vector3(-0.45,-0.75,0.55).normalize().multiplyScalar(sz*0.95));C.near=Math.max(0.05,sz/5000);C.far=sz*40;C.updateProjectionMatrix();O.update();draw();}
 var q=0;function draw(){if(q)return;q=requestAnimationFrame(function(){q=0;R.render(S,C);});}
 O.addEventListener('change',draw);
 var tip=document.getElementById('tip'),rc=new THREE.Raycaster(),down=null;
 R.domElement.addEventListener('pointerdown',function(e){down=[e.clientX,e.clientY];});
 R.domElement.addEventListener('pointerup',function(e){if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;var r=R.domElement.getBoundingClientRect();
  rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),C);var h=rc.intersectObjects(meshes,false)[0],nm='';
  if(h&&h.face){var ns=h.object.userData.names||[],vi=h.face.a;for(var i=0;i<ns.length;i++)if(vi>=ns[i][0]&&vi<ns[i][0]+ns[i][1]){nm=ns[i][2];break;}}
  if(nm){tip.textContent=nm;tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px';tip.style.display='block';}else tip.style.display='none';});
 if(m.sched&&m.sched.length)timeline(m,P,S,meshes,draw);
 function applyView(V){if(!V||!V.cam)return;var c=V.cam;O.target.set(c.t[0],c.t[1],c.t[2]);C.position.set(c.p[0],c.p[1],c.p[2]);if(c.fov)C.fov=c.fov;
  if(c.ortho){var dr=C.position.clone().sub(O.target).normalize();C.position.copy(O.target).add(dr.multiplyScalar(c.dist||C.position.distanceTo(O.target)));}
  C.updateProjectionMatrix();O.update();
  if(V.clip&&V.clip.length)R.clippingPlanes=V.clip.map(function(p){return new THREE.Plane(new THREE.Vector3(p.n[0],p.n[1],p.n[2]),p.c);});
  if(V.bg)S.background=new THREE.Color(V.bg);draw();}
 r3={resize:resize,fit:fit};resize();fit();if(m.view)applyView(m.view);window.__hx3={meshes:meshes.length,clouds:(m.clouds||[]).length,scene:S,cam:C};
}
})();
</script></body></html>`;
}
