/* Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM:s självständiga HTML): lägesplanen och 3D i EN fil
   som kan skickas till någon utan Trimble Connect och öppnas offline i en vanlig webbläsare.

   I filen: lägesplanen som bild (det som syns – datum, lager, zoner), 3D-scenen (marken med planen som textur,
   etableringen, de planerade objekten och de inlästa IFC-modellerna som de visas) och en liten visare (three.js
   inbäddad – ingen internetuppkoppling behövs). Geometrin packas: positioner som 16-bitars tal per bit, en färg
   per hörn, gzip och base64. Tryck på ett objekt i 3D: namnet visas. */

const HX_BIG_TRIS = 2500000;

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
    add(o, o.userData.l3b.ranges.map(r => [r.start, r.count, r.name || ""]));
  });
  l3.placeMeshes.forEach((grp, id) => {
    if (!l3VisibleChain(grp)) return;
    const p = placements.find(x => x.id === id), nm = p ? p.name || ((placeLib(p.type) || {}).label || "") : "";
    grp.traverse(o => { if (o.isMesh && !o.userData.selEdge && !o.userData.noHit && l3VisibleChain(o)) add(o, [[0, o.geometry.getAttribute("position").count, nm]]); });
  });
  if (l3.objMesh && l3VisibleChain(l3.objMesh) && l3.objMesh.isMesh) add(l3.objMesh, []);
  return parts;
}
/* Packas: rubrik (JSON) + binärt, gzip, base64. */
async function hxPack(parts, ground) {
  const body = []; let off = 0;
  const put = arr => { const pad = (4 - off % 4) % 4; if (pad) { body.push(new Uint8Array(pad)); off += pad; } const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); body.push(u); const at = off; off += u.byteLength; return at; };
  const meta = { parts: [], ground: null };
  parts.forEach(p => {
    const n = p.pos.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let a = 0; a < 3; a++) { const x = p.pos[i + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    const sz = mx.map((x, a) => Math.max(1e-6, x - mn[a])), q = new Uint16Array(p.pos.length);
    for (let i = 0; i < p.pos.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] = Math.round((p.pos[i + a] - mn[a]) / sz[a] * 65535);
    const i16 = n < 65536;
    meta.parts.push({ n, ni: p.idx.length, mn, sz, i16, op: p.op, names: p.names, pos: put(q), col: put(p.col), idx: put(i16 ? Uint16Array.from(p.idx) : p.idx) });
  });
  if (ground) meta.ground = { pos: Array.from(ground.pos), uv: Array.from(ground.uv), idx: Array.from(ground.idx) };
  const head = new TextEncoder().encode(JSON.stringify(meta));
  const pre = new Uint8Array(8 + head.length + ((4 - (8 + head.length) % 4) % 4));
  new DataView(pre.buffer).setUint32(0, 0x31584834, true); new DataView(pre.buffer).setUint32(4, head.length, true); pre.set(head, 8);
  const gz = new Uint8Array(await new Response(new Blob([pre, ...body]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let s = ""; for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
  return { b64: btoa(s), bytes: gz.length };
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
      busyProgress(key, "Fristående HTML: packar 3D", 0.4);
      const parts = hxCollect(withBldg);
      parts.forEach(p => { tris += p.idx.length / 3; });
      if (l3.planMesh) { const g = l3.planMesh.geometry; l3.planMesh.updateMatrixWorld(true); const P = g.getAttribute("position"), v = new THREE.Vector3(), pos = []; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(l3.planMesh.matrixWorld); pos.push(v.x, v.y, v.z); } ground = { pos, uv: Array.from(g.getAttribute("uv").array), idx: Array.from(g.index.array) }; }
      pack = await hxPack(parts, ground);
      if (!was3d && typeof close3d === "function") close3d();
    } else note = "Arbetsytan är inte kalibrerad mot 3D-modellen – bara lägesplanen är med.";
    busyProgress(key, "Fristående HTML: visaren", 0.8);
    const three = await hxText("vendor/three/three.min.js"), orbit = await hxText("vendor/three/OrbitControls.js");
    const date = ($("dateInput") && $("dateInput").value) || todayIso();
    const title = `Lägesplan – ${plan.name || ""}`;
    const info = { title, plan: plan.name || "", date, by: (settings && settings.userName) || "", at: new Date().toISOString().slice(0, 16).replace("T", " "), note, tris };
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
.note{position:absolute;right:12px;top:12px;max-width:320px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:6px 10px;font-size:12px}
</style></head><body>
<header><h1>${hxEsc(info.title)}</h1><span class="m">Datum ${hxEsc(info.date)} · exporterad ${hxEsc(info.at)}${info.by ? " av " + hxEsc(info.by) : ""}</span>
<div class="tabs"><button class="on" data-t="2">2D lägesplan</button>${b64 ? `<button data-t="3">3D</button>` : ""}</div></header>
<main><div id="v2"><img id="img" alt="Lägesplan" src="${img2d}"></div><div id="v3"><div id="tip"></div></div>
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
 if(tab==='3'){if(!r3)init3();else r3.resize();}};});
document.getElementById('fit').onclick=function(){if(tab==='2')fit2();else if(r3)r3.fit();};
window.addEventListener('resize',function(){if(tab==='2')fit2();else if(r3)r3.resize();});
async function unpack(){var bin=atob(D),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
 var buf=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();var dv=new DataView(buf),hl=dv.getUint32(4,true);
 var meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,8,hl)));return {meta:meta,buf:buf,base:8+hl+((4-(8+hl)%4)%4)};}
async function init3(){
 var R=new THREE.WebGLRenderer({antialias:true});R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));v3.appendChild(R.domElement);
 var S=new THREE.Scene();S.background=new THREE.Color(0xf7f8fa);var C=new THREE.PerspectiveCamera(50,1,0.1,50000);C.up.set(0,0,1);
 S.add(new THREE.HemisphereLight(0xffffff,0xd9d6cf,0.5));var sun=new THREE.DirectionalLight(0xffffff,0.62);sun.position.set(-0.5,-0.8,1.2);S.add(sun);var fl=new THREE.DirectionalLight(0xffffff,0.18);fl.position.set(0.7,0.6,0.25);S.add(fl);
 var O=new THREE.OrbitControls(C,R.domElement);O.screenSpacePanning=true;
 var d=await unpack(),m=d.meta,buf=d.buf,base=d.base,box=new THREE.Box3(),meshes=[];
 m.parts.forEach(function(p){var q=new Uint16Array(buf,base+p.pos,p.n*3),pos=new Float32Array(p.n*3);for(var i=0;i<pos.length;i+=3)for(var a=0;a<3;a++)pos[i+a]=p.mn[a]+q[i+a]/65535*p.sz[a];
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(new Uint8Array(buf.slice(base+p.col,base+p.col+p.n*3)),3,true));
  g.setIndex(new THREE.BufferAttribute(p.i16?new Uint16Array(buf.slice(base+p.idx,base+p.idx+p.ni*2)):new Uint32Array(buf.slice(base+p.idx,base+p.idx+p.ni*4)),1));g.computeBoundingSphere();g.computeBoundingBox();
  var mat=new THREE.MeshPhongMaterial({vertexColors:true,flatShading:true,shininess:0,specular:0x000000,side:THREE.DoubleSide,transparent:p.op<1,opacity:p.op,depthWrite:p.op>=1});
  var me=new THREE.Mesh(g,mat);me.userData.names=p.names;S.add(me);meshes.push(me);box.union(g.boundingBox);});
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
 r3={resize:resize,fit:fit};resize();fit();window.__hx3={meshes:meshes.length,scene:S};
}
})();
</script></body></html>`;
}
