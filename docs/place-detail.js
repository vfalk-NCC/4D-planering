/* Detaljerade grundobjekt (Victor 2026-10-30: "se över detaljeringsgraden på alla mina 3D-objekt och uppgradera – detaljerad low poly").

   De enkla biblioteksobjekten (Bod, Container, Upplag, Tornkran, Mobilkran) var en låda eller två. De byggs nu av riktiga delar med samma verktyg som
   de smarta objekten (place-smart.js, TK i place-geo.js): fönster, dörrar, trappor och tak på boden, korrugerade väggar, dörrstänger och hörnbeslag på
   containern, pallar med gods på upplaget, gittermast, bommar, motvikter och hytt på tornkranen samt lastbilschassi, stödben, teleskopbom och krok på
   mobilkranen. Mått (L, B, H, R), färg, vridning och 4D-koppling gäller som förut – detaljerna följer måtten. De mest ytliga delarna (nit, ribbor) markeras
   som dekor och följer med i 3D-editorn men inte i IFC-exporten, så filerna håller sig små. Delarna kommer ur placeParts (place3d.js). */

const DET_TYPES = new Set(["bod", "container", "upplag", "tornkran", "mobilkran"]);
const DET_STEEL = "#8b95a1", DET_DARK = "#2b3037", DET_GLASS = "#1c2b3a", DET_WHITE = "#f1f4f7";
const DET_G = { transp: 0.45, shin: 130, metal: 0.5, rough: 0.12 }, DET_M = { metal: 0.85, rough: 0.28, shin: 100 }, DET_L = { unlit: true }, DET_D = { deco: true };
function detShade(hex, k) { const n = parseInt(String(hex || "#888888").replace("#", ""), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return "#" + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, "0")).join(""); }
const detRnd = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/* Delarna för ett detaljerat objekt, eller null om typen inte är detaljerad. */
function detParts(p, z, ringN) {
  if (!DET_TYPES.has(p.type) || typeof smMakeCtx !== "function" || typeof TK === "undefined") return null;
  const lib = placeLib(p.type) || {}, col = p.color || lib.color || "#888888", c = smMakeCtx(p, z, col);
  try { DET[p.type](p, c, col, ringN || 48); detSign(p, c); c.flush(); } catch (e) { console.warn("Detaljerat objekt", p.type, e); return null; }
  return c.parts;
}
const DET = {};

/* ---- Bod (en eller två våningar, dörrar på/av) ---- */
DET.bod = (p, c, col) => {
  const bd = p.bod || {}, fl = bd.floors === 2 ? 2 : 1, doors = bd.doors !== false;
  const L = p.L / 2, B = p.B / 2, Ls = L - 0.08, Bs = B - 0.08, H = Math.max(2, p.H), sk = 0.24, hb = H - sk - 0.12, roof = "#d7dce2", frame = DET_WHITE, dx = L - 0.85;
  c.add(c.rect(-L, L, -B, B), 0, sk - 0.04, "#3f4650");
  for (let lv = 0; lv < fl; lv++) {
    const z0 = lv * H, top = lv === fl - 1;
    [-1, 1].forEach(s => c.box(DET_DARK, 0, s * (B - 0.35), z0 + 0.11, p.L, 0.16, 0.22, null, 0.02, DET_M));
    for (let i = 0; i <= 4; i++) c.box(DET_DARK, -L + 0.3 + i * (p.L - 0.6) / 4, 0, z0 + 0.1, 0.12, p.B - 0.5, 0.18, null, 0.02);
    c.box(col, 0, 0, z0 + sk + hb / 2, p.L - 0.16, p.B - 0.16, hb, null, 0.04, { shin: 40 });
    c.box(detShade(col, -0.22), 0, 0, z0 + sk + 0.14, p.L - 0.14, p.B - 0.14, 0.28, null, 0.02);                                    // socklar
    const n = Math.max(2, Math.round(p.L / 1.2)); for (let i = 1; i < n; i++) { const x = -L + i * p.L / n; [-1, 1].forEach(s => c.box(detShade(col, -0.18), x, s * (Bs + 0.005), z0 + sk + hb / 2 + 0.1, 0.025, 0.03, hb - 0.45, null, 0, DET_D)); }
    c.box(roof, 0, 0, z0 + H - 0.06, p.L, p.B, 0.12, null, 0.03);                                                                   // tak (eller mellanbjälklag)
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => c.box("#4b5563", a * (L - 0.3), b * (B - 0.25), z0 + H + 0.12, 0.14, 0.14, 0.12, null, 0.02));   // lyftöglor
    if (top) {
      c.box("#c4cbd3", 0, 0, z0 + H + 0.03, p.L - 0.3, p.B * 0.4, 0.08, null, 0.03);                                                 // nock
      [-1, 1].forEach(s => { c.cyl("#9ca3af", "x", 0, s * (B - 0.04), z0 + H - 0.14, 0.035, 0.035, p.L - 0.1, 8, null, DET_M); c.cyl("#9ca3af", "z", s * (L - 0.12), s * (B - 0.05), z0 + H / 2 + 0.1, 0.03, 0.03, H - 0.3, 8, null, DET_M); });   // hängrännor + stuprör
      [-1, 1].forEach(s => c.cyl("#9ca3af", "z", s * (L * 0.45), 0.2, z0 + H + 0.18, 0.1, 0.1, 0.2, 10, null, DET_M));               // takventiler
    }
    const nw = Math.max(2, Math.floor((p.L - 2.4) / 2.2)), x0 = -L + 1.1, x1 = L - 2.1, wz = z0 + sk + hb * 0.55, wh = Math.min(1.1, hb * 0.5), ww = 1.2;
    for (const s of [-1, 1]) for (let k = 0; k < nw; k++) {
      const x = nw === 1 ? (x0 + x1) / 2 : x0 + k * (x1 - x0) / (nw - 1), y = s * (Bs + 0.025);
      c.box(frame, x, y, wz, ww + 0.1, 0.07, wh + 0.1, null, 0.015); c.box(DET_GLASS, x, y + s * 0.035, wz, ww - 0.04, 0.03, wh - 0.04, null, 0.01, DET_G); c.box(frame, x, y + s * 0.045, wz, 0.04, 0.03, wh, null, 0, DET_D);
      c.box("#e5e7eb", x, y + s * 0.06, wz - wh / 2 - 0.08, ww + 0.2, 0.14, 0.04, null, 0.01);                                      // fönsterbräda
    }
    [-1, 1].forEach(s => { c.box(frame, s * (Ls + 0.025), 0, wz, 0.07, 0.9, wh + 0.1, null, 0.015); c.box(DET_GLASS, s * (Ls + 0.06), 0, wz, 0.03, 0.8, wh - 0.04, null, 0.01, DET_G); });   // gavelfönster
    if (doors) {
      const dy = -Bs - 0.03, dz = z0 + sk;
      c.box(frame, dx, dy, dz + 1.0, 1.05, 0.08, 2.05, null, 0.02); c.box(detShade(col, -0.35), dx, dy - 0.02, dz + 0.98, 0.9, 0.06, 1.95, null, 0.02);
      c.box(DET_GLASS, dx, dy - 0.055, dz + 1.45, 0.5, 0.02, 0.6, null, 0.01, DET_G); c.cyl("#cbd5e1", "y", dx - 0.32, dy - 0.07, dz + 1.0, 0.025, 0.025, 0.1, 8, null, DET_M); c.box("#cbd5e1", dx - 0.32, dy - 0.11, dz + 1.0, 0.14, 0.03, 0.03, null, 0, DET_M);
      c.box("#9ca3af", dx, dy - 0.28, dz + 2.1, 1.3, 0.55, 0.06, [0, 0.12, 0], 0.02);                                               // skärmtak
      if (lv === 0) {
        c.box("#8b95a1", dx, dy - 0.58, 0.07, 1.3, 0.3, 0.14, null, 0.02); c.box("#8b95a1", dx, dy - 0.88, 0.14, 1.3, 0.3, 0.28, null, 0.02);   // trappsteg
        c.box("#8b95a1", dx, dy - 0.3, sk + 0.04, 1.3, 0.55, 0.06, null, 0.02);                                                     // plan
        [-1, 1].forEach(s => { c.rod("#cbd5e1", [dx + s * 0.62, dy - 0.95, 0.9], [dx + s * 0.62, dy - 0.95, 0.3], 0.02, 0.02, 6, DET_M); c.rod("#cbd5e1", [dx + s * 0.62, dy - 0.1, sk + 0.95], [dx + s * 0.62, dy - 0.95, 0.95], 0.02, 0.02, 6, DET_M); });
      }
    }
    if (lv === 0) {
      c.box("#1f2937", -L + 1.0, Bs + 0.1, sk + 1.6, 0.4, 0.2, 0.5, null, 0.02); c.cyl("#9ca3af", "z", -L + 1.0, Bs + 0.1, sk + 2.1, 0.02, 0.02, 0.5, 6);   // elskåp
      c.box("#e5e7eb", L * 0.35, Bs + 0.22, H - 0.75, 0.9, 0.42, 0.55, null, 0.04, DET_M); c.cyl("#475569", "y", L * 0.35 - 0.2, Bs + 0.44, H - 0.75, 0.17, 0.17, 0.04, 14, null, DET_M);   // värmepump
    }
  }
  if (fl === 2 && doors) {      // yttertrappa och loftgång till övre våningen
    const zT = H + sk, yS = -Bs - 0.5, run = Math.min(p.L - 3.2, (zT / 0.19) * 0.26), xs = -L + 0.4, ns = Math.max(6, Math.round(zT / 0.19)), ds = run / ns;
    for (let i = 0; i < ns; i++) c.box("#8b95a1", xs + (i + 0.5) * ds, yS, (i + 1) * zT / ns - 0.03, ds + 0.01, 0.9, 0.06, null, 0.01);                // steg
    [-1, 1].forEach(sd => { c.rod("#6b7280", [xs, yS + sd * 0.45, 0.2], [xs + run, yS + sd * 0.45, zT - 0.05], 0.03, 0.03, 6, DET_M); c.rod("#cbd5e1", [xs, yS + sd * 0.45, 1.0], [xs + run, yS + sd * 0.45, zT + 0.95], 0.02, 0.02, 6, DET_M); });
    const gx0 = xs + run, gx1 = L - 0.25; c.box("#8b95a1", (gx0 + gx1) / 2, -Bs - 0.5, zT - 0.03, gx1 - gx0, 1.0, 0.06, null, 0.01);                       // loftgång
    c.rod("#cbd5e1", [gx0, -Bs - 1.0, zT + 0.95], [gx1, -Bs - 1.0, zT + 0.95], 0.025, 0.025, 6, DET_M); c.rod("#cbd5e1", [gx0, -Bs - 1.0, zT + 0.5], [gx1, -Bs - 1.0, zT + 0.5], 0.02, 0.02, 6, DET_M);
    for (let x = gx0; x <= gx1 + 0.01; x += 1.2) c.rod("#cbd5e1", [x, -Bs - 1.0, zT], [x, -Bs - 1.0, zT + 0.95], 0.02, 0.02, 6, DET_M);
    c.rod("#cbd5e1", [gx1, -Bs - 1.0, zT + 0.95], [gx1, -Bs - 0.1, zT + 0.95], 0.02, 0.02, 6, DET_M);
    [[gx0 + 0.05], [gx1 - 0.05]].forEach(([x]) => c.rod("#6b7280", [x, -Bs - 0.9, 0.05], [x, -Bs - 0.9, zT - 0.06], 0.04, 0.04, 6, DET_M));      // stödben
  }
};

/* ---- Container (20 fot) ---- */
DET.container = (p, c, col) => {
  const L = p.L / 2, B = p.B / 2, H = p.H, rail = detShade(col, -0.32), cast = "#20262c";
  c.add(c.rect(-L, L, -B, B), 0, 0.14, "#2b3037");
  c.box(col, 0, 0, H / 2 + 0.02, p.L - 0.1, p.B - 0.1, H - 0.18, null, 0.012, { shin: 35 });
  [-1, 1].forEach(s => { c.box(rail, 0, s * (B - 0.045), 0.11, p.L, 0.09, 0.2, null, 0.01); c.box(rail, 0, s * (B - 0.045), H - 0.07, p.L, 0.09, 0.14, null, 0.01); });
  [-1, 1].forEach(s => { c.box(rail, s * (L - 0.045), 0, 0.11, 0.09, p.B, 0.2, null, 0.01); c.box(rail, s * (L - 0.045), 0, H - 0.07, 0.09, p.B, 0.14, null, 0.01); });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.box(rail, sx * (L - 0.07), sy * (B - 0.07), H / 2, 0.14, 0.14, H, null, 0); c.box(cast, sx * (L - 0.1), sy * (B - 0.09), 0.09, 0.2, 0.18, 0.18, null, 0); c.box(cast, sx * (L - 0.1), sy * (B - 0.09), H - 0.09, 0.2, 0.18, 0.18, null, 0); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const z0 of [0.005, H - 0.005]) c.box(col, sx * (L - 0.005), sy * (B - 0.005), z0, 0.01, 0.01, 0.01, null, 0, DET_D);   // exakta hörn (fästning och mått)
  const pitch = 0.26, nr = Math.floor((p.L - 0.5) / pitch);
  for (let i = 0; i < nr; i++) { const x = -L + 0.3 + i * pitch; [-1, 1].forEach(s => c.box(detShade(col, -0.14), x, s * (B - 0.06), H / 2 + 0.02, 0.1, 0.045, H - 0.46, null, 0.01, DET_D)); }
  for (let i = 0; i < 6; i++) c.box(detShade(col, -0.12), -L + 0.4 + i * (p.L - 0.8) / 5, 0, H - 0.02, 0.14, p.B - 0.4, 0.04, null, 0.01, DET_D);   // takribbor
  c.box(rail, -0.0, 0, 0.06, 0.2, p.B - 0.1, 0.12, null, 0.01); [-1, 1].forEach(s => c.box(cast, s * 1.0, 0, 0.1, 0.5, p.B * 0.28, 0.14, null, 0.01));   // gaffelfickor
  // dörrgavel (+x): två dörrblad, fyra låsstänger med handtag, gångjärn och packning
  const xe = L - 0.1, hd = H - 0.5;
  c.box(detShade(col, -0.1), xe + 0.0, 0, H / 2, 0.03, p.B - 0.28, hd + 0.12, null, 0.006);
  [-1, 1].forEach(s => { for (let k = 0; k < 2; k++) { const y = s * (0.2 + k * 0.5), yy = y + (k ? s * 0.0 : 0); c.cyl("#aeb7c0", "z", xe + 0.045, yy, H / 2, 0.022, 0.022, hd + 0.04, 8, null, DET_M); c.box("#9aa3ad", xe + 0.07, yy, H / 2 - 0.15, 0.04, 0.14, 0.05, null, 0.01, DET_M); c.box("#6b7280", xe + 0.05, yy, H - 0.22, 0.04, 0.06, 0.06, null, 0.01); c.box("#6b7280", xe + 0.05, yy, 0.26, 0.04, 0.06, 0.06, null, 0.01); } });
  c.box("#111827", xe + 0.02, 0, H / 2, 0.02, 0.02, hd + 0.14, null, 0, DET_D);                                                    // dörrspalt
  [-1, 1].forEach(s => [0.4, H / 2, H - 0.4].forEach(z0 => c.cyl("#4b5563", "z", xe + 0.03, s * (B - 0.2), z0, 0.035, 0.035, 0.12, 8)));
  c.box("#f8fafc", xe + 0.03, B - 0.55, H - 0.5, 0.01, 0.5, 0.18, null, 0, DET_L); for (let i = 0; i < 5; i++) c.box("#0f172a", xe + 0.04, B - 0.72 + i * 0.09, H - 0.5, 0.005, 0.04, 0.12, null, 0, DET_D);   // ID-skylt
  c.box("#f8fafc", -L + 0.03, 0, H * 0.62, 0.01, 0.9, 0.3, null, 0, DET_L);                                                        // logotavla på gaveln
};

/* ---- Upplag: platta, pallar med gods ---- */
DET.upplag = (p, c, col) => {
  const L = p.L / 2, B = p.B / 2, hb = Math.max(0.06, Math.min(0.2, p.H * 0.4)), avail = p.H - hb - 0.12;   // gods bara om höjden räcker (låg höjd = platta med pallar)
  c.add(c.rect(-L, L, -B, B), 0, hb, detShade(col, -0.05));
  const px = 1.3, py = 1.1, nx = Math.max(1, Math.floor((p.L - 0.6) / (px + 0.15))), ny = Math.max(1, Math.floor((p.B - 0.6) / (py + 0.25))), goods = ["#c9a66b", "#b45309", "#9ca3af", "#a16207", "#d6d3d1"];
  let k = 0; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (k > 48) break; const x = -L + 0.4 + px / 2 + i * ((p.L - 0.8 - px) / Math.max(1, nx - 1 || 1)) * (nx > 1 ? 1 : 0), y = -B + 0.4 + py / 2 + j * ((p.B - 0.8 - py) / Math.max(1, ny - 1 || 1)) * (ny > 1 ? 1 : 0), r = detRnd(k * 3 + 1), h = avail * (0.55 + 0.45 * r), kind = Math.floor(detRnd(k * 7 + 2) * goods.length), z = hb;
    [-1, 0, 1].forEach(s => c.box("#a16207", x, y + s * (py / 2 - 0.07), z + 0.04, px, 0.1, 0.08, null, 0.01));                                       // pallens klackar
    c.box("#c08a4a", x, y, z + 0.1, px, py, 0.04, null, 0.008); for (let b = 0; b < 4; b++) c.box("#b07a3a", x, y - py / 2 + 0.14 + b * (py - 0.28) / 3, z + 0.122, px, 0.002, 0.004, null, 0, DET_D);
    if (avail >= 0.3) {
      c.box(goods[kind], x, y, z + 0.12 + h / 2, px - 0.1, py - 0.1, h, null, 0.02, { rough: 0.9 });
      for (let s2 = 0; s2 < 3; s2++) c.box("#374151", x - px * 0.3 + s2 * px * 0.3, y, z + 0.12 + h / 2, 0.025, py - 0.08, h + 0.01, null, 0, DET_D);   // spännband
      if (detRnd(k + 9) > 0.55) c.box("#e5e7eb", x, y, z + 0.12 + h + 0.015, px - 0.12, py - 0.12, 0.03, null, 0.01, { transp: 0.35 });                  // plastfolie
    }
    k++;
  }
  if (p.H >= 0.8) { c.box("#facc15", -L + 0.08, -B + 0.08, hb + 0.35, 0.06, 0.06, 0.7, null, 0.01); c.box("#facc15", L - 0.08, B - 0.08, hb + 0.35, 0.06, 0.06, 0.7, null, 0.01); }   // markeringsstolpar
};

/* ---- Tornkran ---- */
DET.tornkran = (p, c, col, ringN) => {
  const w = Math.max(1, p.L) / 2, H = Math.max(6, p.H), R = Math.max(10, Number(p.R) || 30), steel = DET_STEEL, dark = "#4b5563";
  c.add(c.rect(-w * 1.9, w * 1.9, -w * 1.9, w * 1.9), 0, 0.6, "#9ca3af");                                                          // fundament
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => c.box("#4b5563", a * w, b * w, 0.66, 0.4, 0.4, 0.12, null, 0.02));       // ankarplattor
  const ns = Math.max(2, Math.round(H / 2.4)), sh = (H - 0.6) / ns, zb = 0.6;
  const leg = (a, b, z0, z1) => c.rod(col, [a * w, b * w, z0], [a * w, b * w, z1], 0.06, 0.06, 6);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => leg(a, b, zb, H));
  const face = (A, Bp, z0, z1, up) => { c.rod(col, [A[0], A[1], up ? z0 : z1], [Bp[0], Bp[1], up ? z1 : z0], 0.028, 0.028, 4); };
  for (let k = 0; k < ns; k++) {
    const z0 = zb + k * sh, z1 = z0 + sh, ps = [[-w, -w], [w, -w], [w, w], [-w, w]];
    for (let f = 0; f < 4; f++) { const A = ps[f], Bp = ps[(f + 1) % 4]; face(A, Bp, z0, z1, (k + f) % 2 === 0); c.rod(col, [A[0], A[1], z1], [Bp[0], Bp[1], z1], 0.03, 0.03, 4); }
  }
  c.cyl(dark, "z", 0, 0, H + 0.15, w * 0.7, w * 0.7, 0.3, 18, null, DET_M); c.cyl("#20262c", "z", 0, 0, H + 0.4, w * 0.55, w * 0.55, 0.2, 18);   // svängkrans
  const jz = H + 0.9, top = x => jz + 1.9 * (1 - 0.55 * Math.min(1, Math.max(0, x) / R)), wy = 0.45;
  c.box(dark, 0, 0, H + 0.55, w * 1.5, w * 1.4, 0.5, null, 0.04, DET_M);                                                           // turntable
  const apex = [0, 0, H + 6.5 + Math.min(4, R * 0.05)];
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => c.rod(col, [a * 0.45, b * 0.45, H + 0.8], apex, 0.05, 0.04, 5));        // tornspets
  c.sph("#dc2626", apex[0], apex[1], apex[2] + 0.12, 0.09, 0.09, 0.09, 8, 5, null, DET_L);
  // lastarm
  const nj = Math.max(3, Math.floor(R / 2));
  [-1, 1].forEach(s => c.rod(col, [0.8, s * wy, jz], [R, s * wy, jz], 0.045, 0.04, 5)); c.rod(col, [0.8, 0, top(0.8)], [R, 0, top(R)], 0.05, 0.04, 5);
  for (let i = 0; i < nj; i++) {
    const xa = 0.8 + i * (R - 0.8) / nj, xb = 0.8 + (i + 1) * (R - 0.8) / nj, xm = (xa + xb) / 2;
    [-1, 1].forEach(s => { c.rod(col, [xa, s * wy, jz], [xm, 0, top(xm)], 0.02, 0.02, 4); c.rod(col, [xm, 0, top(xm)], [xb, s * wy, jz], 0.02, 0.02, 4); });
    c.rod(col, [xb, -wy, jz], [xb, wy, jz], 0.02, 0.02, 4);
  }
  c.box("#20262c", R + 0.1, 0, jz + 0.5, 0.3, 0.6, 0.6, null, 0.03); c.sph("#dc2626", R + 0.2, 0, jz + 1.0, 0.07, 0.07, 0.07, 8, 5, null, DET_L);
  // motarm med motvikter
  const cj = Math.max(8, R * 0.3), nc = Math.max(2, Math.floor(cj / 2));
  [-1, 1].forEach(s => c.rod(col, [-cj, s * wy, jz], [-0.2, s * wy, jz], 0.045, 0.04, 5)); c.rod(col, [-cj, 0, jz + 1.2], [-0.2, 0, jz + 1.9], 0.05, 0.04, 5);
  for (let i = 0; i < nc; i++) { const xa = -cj + i * cj / nc, xb = xa + cj / nc, xm = (xa + xb) / 2, zt = x => jz + 1.2 + 0.7 * (x + cj) / cj; [-1, 1].forEach(s => { c.rod(col, [xa, s * wy, jz], [xm, 0, zt(xm)], 0.02, 0.02, 4); c.rod(col, [xm, 0, zt(xm)], [xb, s * wy, jz], 0.02, 0.02, 4); }); c.rod(col, [xb, -wy, jz], [xb, wy, jz], 0.02, 0.02, 4); }
  for (let i = 0; i < 6; i++) c.box("#6b7280", -cj + 0.6 + i * 0.72, 0, jz - 0.5, 0.64, 1.3, 1.0, null, 0.02, { rough: 0.95 });         // betongmotvikter
  c.box(dark, -2.8, 0, jz + 0.4, 2.2, 1.5, 1.0, null, 0.06, DET_M); c.box("#9ca3af", -2.8, 0, jz + 1.0, 2.0, 1.2, 0.08, null, 0.02);      // maskinhus
  c.box(col, 1.6, -1.15, jz + 0.55, 1.5, 1.1, 1.4, null, 0.08, { shin: 60 }); c.box(DET_GLASS, 2.36, -1.15, jz + 0.7, 0.06, 0.9, 0.8, null, 0.02, DET_G); c.box(DET_GLASS, 1.6, -1.71, jz + 0.7, 1.2, 0.06, 0.8, null, 0.02, DET_G); c.box("#e5e7eb", 1.6, -1.15, jz + 1.3, 1.6, 1.2, 0.08, null, 0.03);   // förarhytt
  // hängstag
  const pend = (x0, z0, xs, tz) => { c.rod(steel, apex, [x0, 0, z0], 0.016, 0.016, 4, DET_M); void xs; void tz; };
  pend(R * 0.45, top(R * 0.45)); pend(R * 0.85, top(R * 0.85)); pend(-cj * 0.55, jz + 1.2 + 0.7 * 0.45); pend(-cj + 0.5, jz + 1.2);
  // löpvagn och krok
  const tx = R * 0.62, hz = Math.max(3, H * 0.4);
  c.box("#20262c", tx, 0, jz - 0.05, 1.0, 1.1, 0.35, null, 0.04, DET_M); c.rod("#374151", [tx - 0.15, -0.15, jz - 0.2], [tx - 0.15, -0.15, hz + 1.4], 0.012, 0.012, 4); c.rod("#374151", [tx + 0.15, 0.15, jz - 0.2], [tx + 0.15, 0.15, hz + 1.4], 0.012, 0.012, 4);
  c.box("#facc15", tx, 0, hz + 1.1, 0.5, 0.35, 0.4, null, 0.04); c.box("#111827", tx, 0, hz + 1.1, 0.52, 0.1, 0.1, null, 0.01); c.cyl("#6b7280", "z", tx, 0, hz + 0.75, 0.05, 0.05, 0.3, 8, null, DET_M); c.sph("#6b7280", tx, 0, hz + 0.55, 0.1, 0.08, 0.12, 8, 5, null, DET_M);   // krokblock
  const reach = typeof placeCircle === "function" && R > 0 ? { poly: placeCircle(p, R, ringN), z0: c.z, z1: c.z + 0.05, role: "reach", transp: 0.8 } : null;
  if (reach) c.parts.push(reach);
};

/* ---- Mobilkran: transportläge (inom sina mått) eller utskjutet läge (stödben ute, bom lyft och utskjuten) ---- */
const detMk = p => { const m = p.mk || {}, out = m.mode === "ut"; return { out, ang: out ? (m.ang == null ? 50 : Number(m.ang)) : 10, ext: out ? (m.ext == null ? 0.6 : Number(m.ext)) : 0 }; };
DET.mobilkran = (p, c, col, ringN) => {
  const L = p.L / 2, B = p.B / 2, R = Number(p.R) || 0, cabC = "#e5e7eb", mk = detMk(p), ang = Math.max(0, Math.min(82, mk.ang)) * Math.PI / 180, ext = Math.max(0, Math.min(1, mk.ext));
  c.add(c.rect(-L, L, -B, B), 0, 0.04, "#1f2328");
  smTruck(c, { L: p.L, B: p.B, cab: col, body: col, cabX: L - 1.4, axles: [L - 1.6, L - 3.0, -L + 1.8, -L + 3.2] });
  // stödben: infällda i transportläge, utskjutna med pelare och plattor i utskjutet läge
  [[L - 3.6, -1], [L - 3.6, 1], [-L + 1.2, -1], [-L + 1.2, 1]].forEach(([x, s]) => {
    if (!mk.out) { c.box(DET_DARK, x, s * (B - 0.2), 0.95, 0.4, 0.34, 0.3, null, 0.04, DET_M); c.box("#4b5563", x, s * (B - 0.2), 0.7, 0.34, 0.28, 0.18, null, 0.03); c.cyl("#9ca3af", "z", x, s * (B - 0.2), 0.78, 0.07, 0.07, 0.3, 8, null, DET_M); return; }
    const yo = B + 1.5; c.box(DET_DARK, x, s * ((B + yo) / 2 - 0.2), 0.95, 0.4, yo - B + 0.6, 0.3, null, 0.04, DET_M); c.box("#4b5563", x, s * (B - 0.1), 0.95, 0.5, 0.5, 0.36, null, 0.04);
    c.cyl("#9ca3af", "z", x, s * yo, 0.52, 0.09, 0.09, 0.9, 10, null, DET_M); c.cyl(DET_DARK, "z", x, s * yo, 0.1, 0.22, 0.22, 0.2, 10); c.box("#b45309", x, s * yo, 0.03, 0.9, 0.9, 0.06, null, 0.02);
  });
  // överbyggnad: svängkrans, maskinhus, motvikt, kranhytt
  const x0 = -1.1; c.cyl(DET_DARK, "z", x0, 0, 1.25, 1.2, 1.2, 0.2, 20, null, DET_M);
  c.box(col, x0 - 0.5, 0, 2.0, 3.2, p.B - 0.35, 1.3, null, 0.14, { shin: 70 }); c.box(DET_DARK, x0 - 2.2, 0, 1.85, 1.2, p.B - 0.4, 1.0, null, 0.08, { rough: 0.9 });
  for (let i = 0; i < 4; i++) c.box("#6b7280", x0 - 2.55 + (i % 2) * 0.6, 0, 1.55 + Math.floor(i / 2) * 0.55, 0.5, p.B - 0.5, 0.5, null, 0.02, { rough: 0.95 });   // motvikter
  c.box(cabC, x0 + 0.9, -B + 0.55, 2.7, 1.5, 1.0, 1.2, null, 0.1, { shin: 70 }); c.box(DET_GLASS, x0 + 1.66, -B + 0.55, 2.75, 0.06, 0.85, 0.85, [0, 0.1, 0], 0.02, DET_G); c.box(DET_GLASS, x0 + 0.9, -B + 0.05, 2.75, 1.1, 0.06, 0.85, null, 0.02, DET_G); c.box("#dc2626", x0 + 0.5, -B + 0.55, 3.35, 0.3, 0.3, 0.08, null, 0.02, DET_L);
  c.cyl("#9ca3af", "z", x0 - 1.6, B - 0.5, 2.9, 0.07, 0.07, 1.0, 8, null, DET_M);
  // teleskopbom i tre sektioner (utskjut 0–1), lutcylinder, krok
  const px = x0 + 0.6, pz = 3.0, d = [Math.cos(ang), 0, Math.sin(ang)], at = t => [px + d[0] * t, 0, pz + d[2] * t], e2 = 2.4 + 2.4 + ext * 4.8, e3 = 6.2 + ext * 7.3;
  c.cyl("#20262c", "y", px - 0.1, 0, pz - 0.05, 0.3, 0.3, 1.2, 14, null, DET_M);
  c.beam(col, at(-0.4), at(2.9), 0.95, 1.0, { shin: 70 }); c.beam(detShade(col, 0.25), at(2.4), at(e2), 0.8, 0.85, DET_M); c.beam(detShade(col, 0.5), at(e2 - 0.4), at(e3), 0.65, 0.7, DET_M);
  [-1, 1].forEach(sd => c.box("#111827", ...at(2.9).map((v, i) => i === 1 ? sd * 0.5 : v), 0.12, 0.05, 0.12, null, 0));
  const ramTop = at(1.6).map((v, i) => i === 1 ? 0.5 : v); c.rod("#9ca3af", [px - 1.3, 0.5, 1.9], ramTop, 0.12, 0.11, 10, DET_M); c.rod("#d1d5db", [px - 1.3 + (ramTop[0] - px + 1.3) * 0.45, 0.5, 1.9 + (ramTop[2] - 1.9) * 0.45], ramTop, 0.07, 0.07, 8, DET_M);
  const tip = at(e3); c.cyl("#20262c", "y", tip[0], 0, tip[2], 0.22, 0.22, 0.4, 14, null, DET_M);
  const hz = mk.out ? Math.max(0.9, Math.min(tip[2] - 2.5, tip[2] - 8)) : tip[2] - 1.3;
  c.rod("#374151", [tip[0], 0.1, tip[2] - 0.2], [tip[0], 0.1, hz + 0.6], 0.015, 0.015, 4); c.rod("#374151", [tip[0], -0.1, tip[2] - 0.2], [tip[0], -0.1, hz + 0.6], 0.015, 0.015, 4);
  c.box("#facc15", tip[0], 0, hz + 0.45, 0.4, 0.3, 0.36, null, 0.05); c.cyl("#6b7280", "z", tip[0], 0, hz + 0.15, 0.04, 0.04, 0.24, 8, null, DET_M); c.sph("#6b7280", tip[0], 0, hz - 0.05, 0.09, 0.07, 0.11, 8, 5, null, DET_M);
  if (R > 0 && typeof placeCircle === "function") c.parts.push({ poly: placeCircle(p, R, ringN), z0: c.z, z1: c.z + 0.05, role: "reach", transp: 0.8 });
};

/* ---- Skylt på alla objekt (Victor 2026-10-30: "alla objekt ska ha möjlighet att ha skyltar och kunna släcka och tända") ----
   Utan egen skylt tänd (p.sign) händer inget. Skylten följer de smarta objektens: vridning, höjd, fri placering, planvy – och släcks per objekt eller för alla. */
const DET_SIGN_ICON = { bod: "box", container: "box", upplag: "box", lada: "box", tornkran: "crane", mobilkran: "crane" };
function detPlain(p) { const l = placeLib(p.type) || {}; return !l.smart && !l.crew && !l.mod && !l.isModel && !l.fence; }
function detSign(p, c) {
  if (p.sign !== true || !detPlain(p) || typeof smCard !== "function" || typeof smSignSpec !== "function") return;
  const lib = placeLib(p.type) || {}, fl = p.type === "bod" && p.bod && p.bod.floors === 2 ? 2 : 1, H = (Number(p.H) || 0) * fl, f = v => (Math.round(v * 100) / 100).toString().replace(".", ","), dt = typeof smDateText === "function" ? smDateText(p) : "";
  const rows = [["Typ", lib.label || p.type], ["Mått", `${f(p.L)} × ${f(p.B)} × ${f(p.H)} m${fl === 2 ? " · 2 vån" : ""}`]]; if (dt) rows.push(["Gäller", dt]);
  smCard(c, smSignSpec(p, { title: p.name || lib.label || "Objekt", icon: DET_SIGN_ICON[p.type] || "box", color: p.color || lib.color || "#2563eb", rows, b0: -((Number(p.B) || 1) / 2 + 0.45), zb: Math.max(1.2, H) + 0.4 }));
}
/* Delar för enkla objekt utan detaljbygge (Egen låda, Barriär): själva lådan + ev. skylt. */
function detSignParts(p, z, parts) {
  if (p.sign !== true || !detPlain(p) || DET_TYPES.has(p.type) || typeof smMakeCtx !== "function") return parts;
  const c = smMakeCtx(p, z, p.color || (placeLib(p.type) || {}).color || "#888"); try { detSign(p, c); c.flush(); } catch (e) { return parts; }
  return parts.concat(c.parts);
}
function detSideHtml(p) {
  if (!detPlain(p)) return ""; const esc = typeof escHtml === "function" ? escHtml : s => String(s), bd = p.bod || {};
  const sw = (k, on, label, tip) => `<label class="v3-lay-sw-row" title="${esc(tip)}"><span>${label}</span><span class="v3-lay-sw"><input type="checkbox" role="switch" data-det="${k}" ${on ? "checked" : ""} /><i></i></span></label>`;
  const bodHtml = p.type === "bod" ? `<div class="v3-sec">Bod</div><div class="v3-field"><span>Våningar</span><div class="v3-segs">${[[1, "1 våning"], [2, "2 våningar"]].map(([v, t]) => `<button type="button" data-det="floors" data-v="${v}" class="${(bd.floors === 2 ? 2 : 1) === v ? "on" : ""}">${t}</button>`).join("")}</div></div>${sw("doors", bd.doors !== false, "Dörrar", "Släck dörrarna (dörrblad, skärmtak, trappor och loftgång tas bort från bilden)")}` : "";
  const mk = detMk(p), mkHtml = p.type === "mobilkran" ? `<div class="v3-sec">Mobilkran</div><div class="v3-field"><span>Läge</span><div class="v3-segs">${[["", "Transport"], ["ut", "Utskjutet"]].map(([v, t]) => `<button type="button" data-det="mkmode" data-v="${v}" class="${(mk.out ? "ut" : "") === v ? "on" : ""}">${t}</button>`).join("")}</div></div>${mk.out ? `<label class="v3-field v3-sm-range"><span>Bomvinkel <b data-detv="ang">${Math.round(mk.ang)}°</b></span><input type="range" min="0" max="82" step="1" data-det="mkang" value="${Math.round(mk.ang)}" /></label><label class="v3-field v3-sm-range"><span>Bomutskjut <b data-detv="ext">${Math.round(mk.ext * 100)} %</b></span><input type="range" min="0" max="100" step="5" data-det="mkext" value="${Math.round(mk.ext * 100)}" /></label>` : ""}` : "";
  return bodHtml + mkHtml + `${p.sign === true ? "" : `<div class="v3-sec">Skylt</div>`}${sw("sign", p.sign === true, "Visa skylt på objektet", "Lägg till en skylt med namn, mått och datum – släcks och tänds här eller för alla under Skyltar")}${p.sign === true && typeof smSignHtml === "function" ? smSignHtml(p) : ""}`;
}
function detSideBind(side, p, redraw) {
  if (!detPlain(p)) return;
  const apply = fn => { placeSnapshot(); fn(); placeTouch(p); l3RebuildOne(p); l3Changed(); redraw(); };
  side.querySelectorAll("[data-det]").forEach(el => { const k = el.dataset.det;
    if (k === "floors") el.onclick = () => apply(() => { p.bod = { ...(p.bod || {}), floors: Number(el.dataset.v) === 2 ? 2 : 1 }; });
    else if (k === "doors") el.onchange = () => apply(() => { p.bod = { ...(p.bod || {}), doors: el.checked }; });
    else if (k === "mkmode") el.onclick = () => apply(() => { p.mk = { ...(p.mk || {}), mode: el.dataset.v === "ut" ? "ut" : "" }; });
    else if (k === "mkang" || k === "mkext") { let t = 0; el.oninput = () => { const v = Number(el.value); p.mk = { ...(p.mk || {}), mode: "ut", [k === "mkang" ? "ang" : "ext"]: k === "mkang" ? v : v / 100 }; const bv = side.querySelector(`[data-detv="${k === "mkang" ? "ang" : "ext"}"]`); if (bv) bv.textContent = k === "mkang" ? Math.round(v) + "°" : Math.round(v) + " %"; clearTimeout(t); t = setTimeout(() => { placeTouch(p); l3RebuildOne(p); l3Changed(); }, 50); }; }
    else if (k === "sign") el.onchange = () => apply(() => { p.sign = el.checked ? true : false; if (el.checked) p.signOff = false; });
  });
  if (p.sign === true && typeof smSignBind === "function") smSignBind(side, p, redraw);
}
