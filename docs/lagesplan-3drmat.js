/* Lägesplan – renderingsmaterial, markytor och miljö (Victor 2026-11-14: "allt … ska sparas i renderingsläget men inte påverka 3d-editorns material eller utseende").

   Ett eget lager ovanpå 3D-editorn som BARA används av renderingsmotorn (lagesplan-3drender.js). Editorns material, texturer och färger rörs aldrig: motorn byter material
   i den stund bilden ritas och sätter tillbaka allt efteråt.
   – Bibliotek: ca 50 material (mark, betong, murverk, trä, metall, glas & vatten, puts/färg/tak). Varje material har färg, relief (normalkarta), råhet, metall och genomskinlighet,
     och ritas upp i koden som sömlösa 512 px-texturer med verklig storlek i meter. Ytan läggs på från alla håll (triplanar) – därför behövs inga UV-koordinater och det fungerar på
     ritade objekt, biblioteksobjekt och IFC-delar.
   – Regler (som i Twinmotion: markera → klicka på ett material): per objekt, per IFC-klass eller per ursprungsfärg. Skala, vridning och tona per regel.
   – Mark: ett grundmaterial för hela marken plus markytor och vägar (polygoner/linjer med bredd) med eget material.
   – Miljö: tid på dygnet (sol), molnighet, dis och exponering.
   – Allt sparas i projektet (plan.render, arbetsytans data) och följer med planen.
   Prefix l3rm. */

const l3rm = { texCache: new Map(), matCache: new Map(), thumbs: new Map(), mem: null, ground: null };
const L3RM_TEX = 512;

/* ---- Procedurella ytor (sömlösa) ---- */
const rmN = (u, v, p, s) => l3texNoise(u, v, p, p, s);
const rmF = (u, v, s, p0 = 4, k = 4) => { let a = 0, w = 0.5, t = 0; for (let i = 0; i < k; i++) { a += w * l3texNoise(u, v, p0 << i, p0 << i, s + i * 3); t += w; w *= 0.5; } return a / t; };
const rmMix = (a, b, t) => a + (b - a) * t, rmC = (c, k) => [c[0] * k, c[1] * k, c[2] * k], rmSS = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rmLerpC = (a, b, t) => [rmMix(a[0], b[0], t), rmMix(a[1], b[1], t), rmMix(a[2], b[2], t)];
function rmCell(u, v, n, s) {   // sömlös voronoi: [närmaste avstånd, näst närmaste, id 0–1]
  const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y); let d1 = 9, d2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = x0 + dx, cy = y0 + dy, hx = ((cx % n) + n) % n, hy = ((cy % n) + n) % n, px = cx + l3texHash(hx, hy, s), py = cy + l3texHash(hy, hx, s + 7), d = Math.hypot(x - px, y - py);
    if (d < d1) { d2 = d1; d1 = d; id = l3texHash(hx, hy, s + 3); } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
}
/* Murverk/plattor: kolumner × rader, förskjuten varannan rad. Returnerar [fogkant 0–1 (0 = fog), cellens id, kantavstånd]. */
function rmBricks(u, v, cols, rows, joint, s, offs = 0.5) {
  const ry = v * rows, row = Math.floor(ry), fy = ry - row, rx = u * cols + (row % 2 ? offs : 0), cx = Math.floor(rx), fx = rx - cx;
  const jx = joint * rows / cols * 1.0, jy = joint;
  const ex = Math.min(fx, 1 - fx) / Math.max(1e-6, jx), ey = Math.min(fy, 1 - fy) / Math.max(1e-6, jy), e = Math.min(ex, ey);
  return [rmSS(0.0, 1.0, e), l3texHash(((cx % cols) + cols) % cols, ((row % rows) + rows) % rows, s), e];
}
const rmGrain = (u, v, s, k = 96) => l3texNoise(u, v, k, k, s);

const L3RM_GROUPS = ["Mark", "Betong", "Murverk", "Trä", "Metall", "Glas & vatten", "Puts, färg & tak"];
const rmStone = (base, var_, n, s, joint = [40, 38, 36], gap = 0.12) => (u, v) => { const [d1, d2, id] = rmCell(u, v, n, s), k = rmSS(0, gap, d2 - d1), c = rmLerpC(joint, rmC(base, 0.72 + 0.5 * id + 0.12 * (rmF(u, v, s + 5) - 0.5)), k); return [...c, rmMix(0.2, 1, k) * (0.85 + 0.15 * rmF(u, v, s + 9)) - (var_ || 0) * 0.0]; };
const rmBrick = (c, mortar, s, var_ = 0.28) => (u, v) => { const [k, id] = rmBricks(u, v, 4, 16, 0.07, s), shade = 0.82 + var_ * id + 0.12 * (rmF(u, v, s + 2) - 0.5); return [...rmLerpC(mortar, rmC(c, shade), k), rmMix(0, 1, k) * (0.8 + 0.2 * rmGrain(u, v, s + 4, 48))]; };
const rmPlaster = (c, s, g = 0.08) => (u, v) => { const n = rmGrain(u, v, s, 128), m = rmF(u, v, s + 3, 2, 3); return [...rmC(c, 0.94 + g * (n - 0.5) * 2 + 0.06 * (m - 0.5)), 0.5 + 0.5 * n]; };
const rmPlain = c => () => [c[0], c[1], c[2], 0.5];
const rmWood = (c, s, planks = 6, grainF = 36) => (u, v) => {
  const pl = Math.floor(u * planks), pu = u * planks - pl, tone = 0.86 + 0.26 * l3texHash(pl, 3, s), warp = (rmF(u, v, s + 1, 2, 3) - 0.5) * 0.5 + 0.08 * Math.sin(pl * 5), g = 0.5 + 0.5 * Math.sin((pu * 3 + v * 0.0 + warp * 6 + v * 0.0) * Math.PI * 2 + (rmN(u, v, 4, s + 4) - 0.5) * 8) * 0.0;
  const ring = 0.5 + 0.5 * Math.sin((v * 2 + warp * 3 + rmN(pu, v, 6, s + 2) * 1.5) * Math.PI * 2 * 3 + pl), fine = rmN(pu * 8, v, 64, s + 6), seam = rmSS(0, 0.05, Math.min(pu, 1 - pu));
  const k = 0.82 + 0.2 * ring + 0.1 * (fine - 0.5) + g; return [...rmC(c, k * tone * (0.6 + 0.4 * seam)), 0.4 + 0.3 * ring * seam + 0.3 * fine];
};
const rmMetal = (c, s, streak = 0.05) => (u, v) => { const n = l3texNoise(u, v, 2, 128, s), k = 1 + streak * (n - 0.5) * 2; return [...rmC(c, k), 0.5 + 0.2 * n]; };
const rmGlass = c => () => [c[0], c[1], c[2], 0.5];

/* [id, namn, grupp, storlek m, råhet, metall, opacitet, relief, generator] */
const L3RM_DEFS = [
  ["asfalt", "Asfalt", 0, 3, 0.92, 0, 1, 0.5, (u, v) => { const g = rmGrain(u, v, 1, 160), st = l3texHash(Math.floor(u * 128), Math.floor(v * 128), 3) > 0.93 ? 1.9 : 1, k = 46 + 20 * g * st + 12 * rmF(u, v, 4); return [k, k, k + 2, 0.3 + 0.7 * g]; }],
  ["asfalt_ny", "Asfalt, nylagd", 0, 3, 0.85, 0, 1, 0.35, (u, v) => { const g = rmGrain(u, v, 2, 192), k = 30 + 12 * g + 6 * rmF(u, v, 6); return [k, k, k + 1, 0.4 + 0.6 * g]; }],
  ["grus", "Grus", 0, 1.2, 0.95, 0, 1, 1.4, rmStone([168, 160, 146], 0, 26, 11, [70, 66, 60], 0.18)],
  ["kross", "Krossmaterial", 0, 1.5, 0.95, 0, 1, 1.6, rmStone([135, 140, 148], 0, 16, 12, [58, 60, 64], 0.2)],
  ["sand", "Sand", 0, 2, 1, 0, 1, 0.3, (u, v) => { const g = rmGrain(u, v, 5, 192), m = rmF(u, v, 6, 3, 3); return [...rmC([205, 184, 142], 0.9 + 0.16 * g + 0.1 * m), g]; }],
  ["jord", "Jord", 0, 2, 1, 0, 1, 1.0, (u, v) => { const [d1, , id] = rmCell(u, v, 14, 15), f = rmF(u, v, 16, 4, 5); return [...rmC([96, 68, 45], 0.55 + 0.7 * f + 0.15 * id * rmSS(0.3, 0, d1)), 0.3 + 0.7 * (f * 0.7 + (1 - d1) * 0.3)]; }],
  ["jord_fukt", "Jord, fuktig", 0, 2, 0.7, 0, 1, 1.0, (u, v) => { const f = rmF(u, v, 17, 4, 5); return [...rmC([58, 42, 30], 0.6 + 0.8 * f), 0.3 + 0.7 * f]; }],
  ["lera", "Lera", 0, 2, 0.8, 0, 1, 0.6, (u, v) => { const [d1, d2] = rmCell(u, v, 7, 18), crack = rmSS(0, 0.05, d2 - d1), f = rmF(u, v, 19, 3, 4); return [...rmC(rmLerpC([60, 46, 34], [150, 118, 86], crack), 0.8 + 0.4 * f), crack * (0.6 + 0.4 * f)]; }],
  ["gras", "Gräs", 0, 2.5, 0.95, 0, 1, 1.0, (u, v) => { const bl = l3texNoise(u, v, 6, 128, 21) * 0.6 + l3texNoise(u, v, 12, 256, 22) * 0.4, p = rmF(u, v, 23, 3, 4); return [...rmLerpC([46, 82, 30], [112, 150, 62], 0.35 + 0.5 * bl + 0.3 * (p - 0.5)), 0.2 + 0.8 * bl]; }],
  ["gras_torr", "Gräs, torrt", 0, 2.5, 0.95, 0, 1, 1.0, (u, v) => { const bl = l3texNoise(u, v, 6, 128, 24) * 0.6 + l3texNoise(u, v, 12, 256, 25) * 0.4, p = rmF(u, v, 26, 3, 4); return [...rmLerpC([118, 108, 54], [186, 172, 98], 0.3 + 0.55 * bl + 0.3 * (p - 0.5)), 0.2 + 0.8 * bl]; }],
  ["sno", "Snö", 0, 2, 0.6, 0, 1, 0.5, (u, v) => { const f = rmF(u, v, 27, 3, 5), sp = l3texHash(Math.floor(u * 256), Math.floor(v * 256), 28) > 0.985 ? 1.07 : 1; return [...rmC(rmLerpC([218, 228, 242], [248, 250, 253], f), sp), f]; }],
  ["singel", "Singel", 0, 1.4, 0.9, 0, 1, 1.6, rmStone([196, 186, 168], 0, 12, 29, [60, 56, 52], 0.25)],
  ["marksten", "Marksten", 0, 1.6, 0.85, 0, 1, 0.8, (u, v) => { const [k, id] = rmBricks(u, v, 6, 12, 0.05, 30), g = rmGrain(u, v, 31, 96); return [...rmLerpC([70, 68, 64], rmC([156, 154, 150], 0.82 + 0.25 * id + 0.1 * g), k), k * (0.8 + 0.2 * g)]; }],
  ["kullersten", "Kullersten", 0, 1.2, 0.85, 0, 1, 1.4, rmStone([128, 124, 118], 0, 12, 32, [46, 44, 42], 0.2)],
  ["plattor", "Betongplattor", 0, 1.8, 0.85, 0, 1, 0.6, (u, v) => { const [k, id] = rmBricks(u, v, 3, 3, 0.03, 33, 0), g = rmGrain(u, v, 34, 128); return [...rmLerpC([60, 60, 58], rmC([168, 168, 164], 0.88 + 0.16 * id + 0.12 * g), k), k * (0.85 + 0.15 * g)]; }],

  ["betong", "Betong", 1, 2.5, 0.9, 0, 1, 0.8, (u, v) => { const f = rmF(u, v, 40, 3, 5), pore = l3texHash(Math.floor(u * 96), Math.floor(v * 96), 41) > 0.975 ? 0.55 : 1; return [...rmC([152, 152, 148], (0.8 + 0.35 * f) * pore), 0.4 + 0.6 * f * pore]; }],
  ["betong_ljus", "Betong, ljus", 1, 2.5, 0.88, 0, 1, 0.7, (u, v) => { const f = rmF(u, v, 42, 3, 5), pore = l3texHash(Math.floor(u * 96), Math.floor(v * 96), 43) > 0.98 ? 0.6 : 1; return [...rmC([192, 190, 184], (0.85 + 0.25 * f) * pore), 0.4 + 0.6 * f]; }],
  ["betong_form", "Betong, brädform", 1, 2.4, 0.88, 0, 1, 1.0, (u, v) => { const rows = 16, r = Math.floor(v * rows), fy = v * rows - r, tone = 0.88 + 0.2 * l3texHash(r, 7, 44), f = rmF(u, v, 45, 3, 5), line = rmSS(0, 0.06, Math.min(fy, 1 - fy)), tie = Math.hypot(((u * 2) % 1) - 0.5, ((v * 4) % 1) - 0.5) < 0.03 ? 0.5 : 1; return [...rmC([158, 157, 152], tone * (0.82 + 0.3 * f) * (0.55 + 0.45 * line) * tie), line * (0.6 + 0.4 * f)]; }],
  ["betong_slipad", "Betong, slät (prefab)", 1, 3, 0.5, 0, 1, 0.15, (u, v) => { const f = rmF(u, v, 46, 2, 4); return [...rmC([178, 178, 175], 0.95 + 0.08 * f), 0.5 + 0.1 * f]; }],
  ["betong_sand", "Betong, sandblästrad", 1, 2.5, 0.95, 0, 1, 1.2, (u, v) => { const g = rmGrain(u, v, 47, 192), f = rmF(u, v, 48, 3, 4); return [...rmC([166, 160, 150], 0.82 + 0.2 * g + 0.15 * f), g]; }],

  ["tegel_rod", "Tegel, rött", 2, 1, 0.88, 0, 1, 1.2, rmBrick([172, 80, 56], [196, 190, 178], 50)],
  ["tegel_gul", "Tegel, gult", 2, 1, 0.88, 0, 1, 1.2, rmBrick([208, 172, 102], [198, 192, 180], 51)],
  ["tegel_mork", "Tegel, mörkt", 2, 1, 0.85, 0, 1, 1.2, rmBrick([112, 62, 48], [150, 146, 138], 52, 0.4)],
  ["natursten", "Natursten", 2, 2, 0.9, 0, 1, 1.6, rmStone([150, 140, 126], 0, 6, 53, [70, 66, 60], 0.12)],
  ["granit", "Granit, polerad", 2, 1.5, 0.35, 0.02, 1, 0.1, (u, v) => { const a = l3texHash(Math.floor(u * 200), Math.floor(v * 200), 54), b = l3texHash(Math.floor(u * 120), Math.floor(v * 120), 55), f = rmF(u, v, 56, 3, 3), base = rmC([128, 118, 116], 0.85 + 0.3 * f); return [a > 0.88 ? 30 : b > 0.9 ? 205 : base[0], a > 0.88 ? 30 : b > 0.9 ? 190 : base[1], a > 0.88 ? 32 : b > 0.9 ? 190 : base[2], 0.5]; }],

  ["furu", "Trä, furu", 3, 1.2, 0.7, 0, 1, 0.5, rmWood([206, 164, 104], 60)],
  ["ek", "Trä, ek", 3, 1.2, 0.65, 0, 1, 0.5, rmWood([152, 108, 62], 61)],
  ["trapanel", "Träpanel, grå", 3, 1.2, 0.85, 0, 1, 0.9, rmWood([124, 104, 84], 62, 8)],
  ["osb", "Spånskiva (OSB)", 3, 1.2, 0.85, 0, 1, 0.6, (u, v) => { const [d1, , id] = rmCell(u, v, 22, 63), f = rmF(u, v, 64, 4, 3); return [...rmC([204, 168, 104], 0.74 + 0.4 * id + 0.12 * f), 0.4 + 0.6 * (1 - d1 * 0.5)]; }],
  ["plywood", "Plywood", 3, 1.2, 0.75, 0, 1, 0.3, (u, v) => { const l = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 22 + rmF(u, v, 65, 3, 3) * 6), f = rmF(u, v, 66, 2, 4); return [...rmC([214, 184, 128], 0.88 + 0.14 * l + 0.08 * f), 0.5 + 0.2 * l]; }],

  ["stal", "Stål, blankt", 4, 1, 0.3, 1, 1, 0.1, rmMetal([156, 160, 166], 70)],
  ["rostfritt", "Rostfritt, borstat", 4, 1, 0.28, 1, 1, 0.1, rmMetal([196, 200, 205], 71, 0.09)],
  ["rutad", "Rutad plåt", 4, 0.8, 0.4, 1, 1, 1.4, (u, v) => { const x = (u * 6) % 1, y = (v * 6) % 1, a = (Math.floor(u * 6) + Math.floor(v * 6)) % 2, d = a ? Math.abs(x - 0.5) + Math.abs(y - 0.5) * 3 : Math.abs(x - 0.5) * 3 + Math.abs(y - 0.5), h = 1 - rmSS(0.15, 0.5, d), n = rmGrain(u, v, 72, 96); return [...rmC([134, 138, 144], 0.9 + 0.15 * h + 0.06 * n), h]; }],
  ["korrugerad", "Plåt, trapets/korrugerad", 4, 1, 0.45, 1, 1, 1.6, (u, v) => { const w = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 8), n = rmGrain(u, v, 73, 96); return [...rmC([172, 177, 182], 0.78 + 0.3 * w + 0.05 * n), w]; }],
  ["rost", "Rost", 4, 1.5, 0.8, 0.5, 1, 1.2, (u, v) => { const f = rmF(u, v, 74, 3, 5), g = rmGrain(u, v, 75, 96); return [...rmLerpC([84, 64, 54], [168, 86, 40], rmSS(0.3, 0.7, f)), 0.4 + 0.6 * g]; }],
  ["aluminium", "Aluminium", 4, 1, 0.33, 1, 1, 0.1, rmMetal([204, 206, 210], 76, 0.04)],
  ["svartplat", "Svart plåt", 4, 1, 0.4, 0.7, 1, 0.2, rmMetal([46, 48, 52], 77, 0.16)],

  ["glas", "Glas", 5, 1, 0.03, 0, 0.28, 0, rmGlass([176, 212, 216])],
  ["glas_gront", "Glas, grönt", 5, 1, 0.04, 0, 0.36, 0, rmGlass([118, 172, 150])],
  ["vatten", "Vatten", 5, 4, 0.03, 0, 0.86, 0.5, (u, v) => { const w = rmF(u, v, 80, 3, 4), r = 0.5 + 0.5 * Math.sin((u + v * 0.7 + w * 0.4) * Math.PI * 2 * 6); return [...rmC(rmLerpC([24, 70, 96], [46, 110, 128], w), 0.9 + 0.2 * r), 0.5 + 0.4 * r * w]; }],

  ["puts_vit", "Puts, vit", 6, 1.5, 0.9, 0, 1, 0.6, rmPlaster([236, 233, 226], 90)],
  ["puts_gra", "Puts, grå", 6, 1.5, 0.9, 0, 1, 0.6, rmPlaster([152, 152, 149], 91)],
  ["puts_beige", "Puts, beige", 6, 1.5, 0.9, 0, 1, 0.6, rmPlaster([216, 196, 160], 92)],
  ["farg_vit", "Färg, vit matt", 6, 1, 0.55, 0, 1, 0, rmPlain([240, 240, 237])],
  ["farg_svart", "Färg, svart", 6, 1, 0.5, 0, 1, 0, rmPlain([30, 30, 32])],
  ["farg_rod", "Färg, falurött", 6, 1, 0.6, 0, 1, 0, rmPlain([150, 42, 36])],
  ["takpapp", "Takpapp", 6, 1.5, 0.95, 0, 1, 0.5, (u, v) => { const g = rmGrain(u, v, 95, 160), f = rmF(u, v, 96, 3, 3), seam = Math.abs(((u * 3) % 1) - 0.5) > 0.47 ? 0.6 : 1; return [...rmC([54, 56, 60], (0.85 + 0.3 * g + 0.1 * f) * seam), 0.4 + 0.6 * g]; }],
  ["takpannor", "Takpannor, tegel", 6, 1.2, 0.8, 0, 1, 1.4, (u, v) => { const rows = 10, r = Math.floor(v * rows), fy = v * rows - r, cols = 8, rx = u * cols + (r % 2 ? 0.5 : 0), cx = Math.floor(rx), fx = rx - cx, tone = 0.8 + 0.3 * l3texHash(cx, r, 97), edge = rmSS(0, 0.18, 1 - fy) * rmSS(0, 0.1, Math.min(fx, 1 - fx)), h = fy * 0.8 + 0.2 * (1 - Math.abs(fx - 0.5) * 2); return [...rmC([142, 58, 42], tone * (0.6 + 0.4 * edge) * (0.9 + 0.1 * rmF(u, v, 98, 3, 3))), h]; }],
  ["gummi", "Gummi", 6, 1, 0.9, 0, 1, 0.1, rmPlain([36, 36, 38])]
];
const L3RM_LIB = L3RM_DEFS.map(d => ({ id: d[0], name: d[1], group: L3RM_GROUPS[d[2]], size: d[3], rough: d[4], metal: d[5], op: d[6], bump: d[7], f: d[8] }));
const l3rmDef = id => L3RM_LIB.find(m => m.id === id) || null;

/* ---- Texturer (albedo + normalkarta) – byggs första gången ett material används ---- */
function l3rmRaster(def, n) {
  const A = new Uint8ClampedArray(n * n * 4), H = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = def.f((x + 0.5) / n, (y + 0.5) / n), i = (y * n + x) * 4; A[i] = r[0]; A[i + 1] = r[1]; A[i + 2] = r[2]; A[i + 3] = 255; H[y * n + x] = r[3]; }
  return { A, H };
}
function l3rmTextures(def) {
  let t = l3rm.texCache.get(def.id); if (t) return t;
  const n = L3RM_TEX, { A, H } = l3rmRaster(def, n), cv = document.createElement("canvas"), cn = document.createElement("canvas"); cv.width = cv.height = cn.width = cn.height = n;
  cv.getContext("2d").putImageData(new ImageData(A, n), 0, 0);
  const N = new Uint8ClampedArray(n * n * 4), k = (def.bump || 0) * 3.2, hh = (x, y) => H[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (hh(x - 1, y) - hh(x + 1, y)) * k, dy = (hh(x, y - 1) - hh(x, y + 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    N[i] = (dx / l * 0.5 + 0.5) * 255; N[i + 1] = (dy / l * 0.5 + 0.5) * 255; N[i + 2] = (1 / l * 0.5 + 0.5) * 255; N[i + 3] = 255;
  }
  cn.getContext("2d").putImageData(new ImageData(N, n), 0, 0);
  const mk = c => { const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = Math.min(8, (l3.renderer && l3.renderer.capabilities.getMaxAnisotropy()) || 4); tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; return tx; };
  t = { alb: mk(cv), nrm: mk(cn) }; l3rm.texCache.set(def.id, t); return t;
}
/* Miniatyr (data-URL) till materialrutorna. */
function l3rmThumb(id) {
  let u = l3rm.thumbs.get(id); if (u) return u; const def = l3rmDef(id); if (!def) return "";
  const n = 72, { A } = l3rmRaster(def, n), cv = document.createElement("canvas"); cv.width = cv.height = n;
  if (def.op < 1) { const g = cv.getContext("2d"); g.fillStyle = "#e5e7eb"; g.fillRect(0, 0, n, n); g.fillStyle = "#f8fafc"; for (let y = 0; y < n; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < n; x += 24) g.fillRect(x, y, 12, 12); const im = new ImageData(A, n); for (let i = 0; i < A.length; i += 4) A[i + 3] = 255 * Math.max(0.45, def.op + 0.3); const c2 = document.createElement("canvas"); c2.width = c2.height = n; c2.getContext("2d").putImageData(im, 0, 0); g.drawImage(c2, 0, 0); }
  else cv.getContext("2d").putImageData(new ImageData(A, n), 0, 0);
  u = cv.toDataURL("image/png"); l3rm.thumbs.set(id, u); return u;
}

/* ---- Materialet: MeshStandardMaterial med triplanar yta (färg, relief, råhet) ---- */
const L3RM_VERT = "varying vec3 vRmW; varying vec3 vRmN;";
const L3RM_FRAG_PARS = `varying vec3 vRmW; varying vec3 vRmN; uniform sampler2D tRmA; uniform sampler2D tRmN; uniform float uRmScale; uniform float uRmRot; uniform vec3 uRmTint; uniform float uRmBump; uniform float uRmRv;
  vec2 rmUV(vec2 p) { float c = cos(uRmRot), s = sin(uRmRot); return vec2(c * p.x - s * p.y, s * p.x + c * p.y) * uRmScale; }
  vec2 rmUn(vec2 g) { float c = cos(uRmRot), s = sin(uRmRot); return vec2(c * g.x + s * g.y, -s * g.x + c * g.y); }
  vec3 rmW(vec3 n) { vec3 a = pow(abs(n), vec3(4.0)); return a / (a.x + a.y + a.z + 1e-5); }`;
function l3rmMaterial(def, o = {}) {
  const sc = Number(o.s) > 0 ? Number(o.s) : 1, rot = (Number(o.r) || 0) * Math.PI / 180, tint = /^#[0-9a-f]{6}$/i.test(o.tint || "") ? o.tint.toLowerCase() : "#ffffff";
  const key = [def.id, sc, rot, tint].join("|"); let m = l3rm.matCache.get(key); if (m) return m;
  const T = l3rmTextures(def), tc = new THREE.Color(tint);
  m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: def.rough, metalness: def.metal, side: THREE.DoubleSide, transparent: def.op < 1, opacity: def.op, depthWrite: def.op >= 1 || def.op > 0.6, envMapIntensity: def.metal > 0.5 ? 1.4 : def.op < 1 ? 1.6 : 0.55 });
  m.userData.l3rm = true;
  const U = { tRmA: { value: T.alb }, tRmN: { value: T.nrm }, uRmScale: { value: 1 / (def.size * sc) }, uRmRot: { value: rot }, uRmTint: { value: new THREE.Vector3(tc.r, tc.g, tc.b) }, uRmBump: { value: def.bump ? 0.55 : 0 }, uRmRv: { value: def.metal > 0.5 ? 0.12 : 0.28 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + L3RM_VERT).replace("#include <begin_vertex>", "#include <begin_vertex>\n vRmW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRmN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + L3RM_FRAG_PARS)
      .replace("#include <map_fragment>", "vec3 rmWt = rmW(vRmN); vec3 rmAlb = texture2D(tRmA, rmUV(vRmW.zy)).rgb * rmWt.x + texture2D(tRmA, rmUV(vRmW.xz)).rgb * rmWt.y + texture2D(tRmA, rmUV(vRmW.xy)).rgb * rmWt.z; vec3 rmAlb2 = texture2D(tRmA, rmUV(vRmW.zy + 7.3) * 0.173).rgb * rmWt.x + texture2D(tRmA, rmUV(vRmW.xz + 3.1) * 0.173).rgb * rmWt.y + texture2D(tRmA, rmUV(vRmW.xy + 5.7) * 0.173).rgb * rmWt.z; rmAlb = mix(rmAlb, rmAlb * (0.55 + 0.9 * dot(rmAlb2, vec3(0.3333))), 0.35); float rmLum = dot(rmAlb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb *= rmAlb * uRmTint;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + (0.5 - rmLum) * uRmRv, 0.03, 1.0);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      if (uRmBump > 0.0) {
        vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
        vec3 tx = texture2D(tRmN, rmUV(vRmW.zy)).xyz * 2.0 - 1.0; vec3 ty = texture2D(tRmN, rmUV(vRmW.xz)).xyz * 2.0 - 1.0; vec3 tz = texture2D(tRmN, rmUV(vRmW.xy)).xyz * 2.0 - 1.0;
        vec2 gx = rmUn(tx.xy), gy = rmUn(ty.xy), gz = rmUn(tz.xy); float sx = sign(vRmN.x + 1e-5), sy = sign(vRmN.y + 1e-5), sz = sign(vRmN.z + 1e-5);
        vec3 pert = vec3(0.0, gx.y, gx.x * sx) * rmWt.x + vec3(gy.x * sy, 0.0, gy.y) * rmWt.y + vec3(gz.x * sz, gz.y, 0.0) * rmWt.z;
        nW = normalize(nW + pert * uRmBump);
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`);
  };
  m.customProgramCacheKey = () => "l3rm-1";
  l3rm.matCache.set(key, m); return m;
}

/* ---- Data (plan.render): regler, mark, miljö ---- */
function l3rmData() {
  const holder = typeof plan !== "undefined" && plan ? plan : (l3rm.mem = l3rm.mem || {});
  if (!holder.render) holder.render = { v: 1, rules: [], ground: { base: null, areas: [] }, env: {} };
  const d = holder.render; d.rules = d.rules || []; d.ground = d.ground || { base: null, areas: [] }; d.ground.areas = d.ground.areas || []; d.env = d.env || {};
  return d;
}
function l3rmSave() {
  l3rm.matCache.forEach(() => {}); // materialen ligger kvar i minnet (de är små)
  if (typeof plan !== "undefined" && plan && typeof schedulePlanSave === "function") { const d = plan.render; if (d && !d.rules.length && !d.ground.base && !d.ground.areas.length && !Object.keys(d.env).length) delete plan.render; schedulePlanSave(); }
  if (typeof l3rmUiRefresh === "function") l3rmUiRefresh();
}
const l3rmId = () => (typeof ghNewId === "function" ? ghNewId() : Math.random().toString(36).slice(2, 10));
const l3rmHexOf = c => "#" + [0, 1, 2].map(i => Math.round(Math.max(0, Math.min(1, c[i])) * 255).toString(16).padStart(2, "0")).join("");
const L3RM_REF = { obj: "Objekt", cls: "IFC-klass", guid: "IFC-element", color: "Färg" };
/* Lägger/uppdaterar en regel (samma mål ersätts). Mål: { t: "obj"|"cls"|"guid"|"color", ref } */
function l3rmSetRule(target, mat, o = {}) {
  if (!l3rmDef(mat)) throw new Error(`Okänt material "${mat}". Se list_render_materials.`);
  if (!target || !L3RM_REF[target.t] || !target.ref) throw new Error("Mål saknas: object_id, ifc_class, ifc_guid eller color");
  const d = l3rmData(), ref = target.t === "cls" ? String(target.ref).toUpperCase() : target.t === "color" ? String(target.ref).toLowerCase() : String(target.ref);
  let r = d.rules.find(x => x.t === target.t && x.ref === ref);
  if (!r) { r = { id: l3rmId(), t: target.t, ref }; d.rules.push(r); }
  Object.assign(r, { mat, s: Number(o.s) > 0 ? Number(o.s) : (r.s || 1), r: o.r != null ? Number(o.r) || 0 : (r.r || 0), tint: o.tint !== undefined ? (o.tint || "") : (r.tint || "") });
  l3rmSave(); return r;
}
function l3rmRemoveRule(id) { const d = l3rmData(), n = d.rules.length; d.rules = d.rules.filter(r => r.id !== id && !(r.t + ":" + r.ref === id)); if (d.rules.length !== n) l3rmSave(); return n - d.rules.length; }
function l3rmSetGroundBase(mat, o = {}) {
  const d = l3rmData(); if (!mat) { d.ground.base = null; l3rmSave(); return null; }
  if (!l3rmDef(mat)) throw new Error(`Okänt material "${mat}"`);
  d.ground.base = { mat, s: Number(o.s) > 0 ? Number(o.s) : 1, r: Number(o.r) || 0, tint: o.tint || "", z: o.z != null && Number.isFinite(Number(o.z)) ? Number(o.z) : null }; l3rmSave(); return d.ground.base;
}
function l3rmAddArea(a) {
  if (!l3rmDef(a.mat)) throw new Error(`Okänt material "${a.mat}"`);
  const pts = (a.pts || []).map(p => [Number(p[0]), Number(p[1])]); if (pts.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error("Ogiltiga punkter");
  const road = a.kind === "road"; if (pts.length < (road ? 2 : 3)) throw new Error(road ? "En väg behöver minst 2 punkter" : "En yta behöver minst 3 punkter");
  const r = { id: l3rmId(), src: a.src || undefined, name: a.name || (road ? "Väg" : "Markyta"), kind: road ? "road" : "area", pts, width: road ? Math.max(0.5, Number(a.width) || 6) : undefined, mat: a.mat, s: Number(a.s) > 0 ? Number(a.s) : 1, r: Number(a.r) || 0, tint: a.tint || "", z: a.z != null && Number.isFinite(Number(a.z)) ? Number(a.z) : null };
  l3rmData().ground.areas.push(r); l3rmSave(); return r;
}
function l3rmRemoveArea(id) { const d = l3rmData(), n = d.ground.areas.length; d.ground.areas = d.ground.areas.filter(x => x.id !== id); if (d.ground.areas.length !== n) l3rmSave(); return n - d.ground.areas.length; }
function l3rmSetAreaMat(id, mat, o = {}) { const a = l3rmData().ground.areas.find(x => x.id === id); if (!a) throw new Error("Hittar ingen markyta med det id:t"); if (mat) { if (!l3rmDef(mat)) throw new Error(`Okänt material "${mat}"`); a.mat = mat; } if (o.s > 0) a.s = o.s; if (o.r != null) a.r = Number(o.r) || 0; if (o.tint !== undefined) a.tint = o.tint; l3rmSave(); return a; }

/* ---- Miljö ---- */
const L3RM_TIMES = { morgon: { az: 95, el: 14, warm: 0.7, name: "Morgon" }, formiddag: { az: 140, el: 38, warm: 0.2, name: "Förmiddag" }, dag: { az: 195, el: 58, warm: 0, name: "Middag" }, eftermiddag: { az: 250, el: 32, warm: 0.25, name: "Eftermiddag" }, kvall: { az: 285, el: 7, warm: 1, name: "Kväll" } };
function l3rmEnvResolved(over = {}) {
  const e = { ...(l3rmData().env || {}), ...over }, t = L3RM_TIMES[e.time] || null;
  const az = e.az != null ? Number(e.az) : t ? t.az : null, el = e.el != null ? Number(e.el) : t ? t.el : null;
  return { az, el, warm: t ? t.warm : (el != null && el < 15 ? 0.6 : 0), clouds: Math.max(0, Math.min(1, Number(e.clouds) || 0)), haze: Math.max(0, Math.min(1, Number(e.haze) || 0)), exposure: Number(e.exposure) > 0 ? Number(e.exposure) : 1 };
}
function l3rmSetEnv(p) {
  const d = l3rmData(); ["time", "az", "el", "clouds", "haze", "exposure"].forEach(k => { if (p[k] === undefined) return; if (p[k] === null || p[k] === "") delete d.env[k]; else d.env[k] = p[k]; });
  if (p.time && p.az === undefined) delete d.env.az; if (p.time && p.el === undefined) delete d.env.el;
  l3rmSave(); return l3rmEnvResolved();
}

/* ---- Under renderingen: byt material, lägg ut marken, miljö – och sätt tillbaka allt ---- */
const l3rmFlat = o => o && o.isMesh && o.material && !o.userData.noVm && !o.userData.l3rmTmp;
function l3rmSplitIfc(mesh, decide, S) {   // IFC-bit: delar upp efter regel (delar geometrins buffertar, egna index) – originalet göms tillfälligt
  const u = mesh.userData.l3b, geo = mesh.geometry, orig = u.origIdx || (geo.index && geo.index.array); if (!u || !u.ranges || !orig) return false;
  const buckets = new Map(), rest = []; let any = false;
  u.ranges.forEach((rg, ri) => {
    if (u.hidden && u.hidden.has(ri)) return;
    const k = decide(rg), s = orig.subarray ? orig.subarray(rg.idxStart, rg.idxStart + rg.idxCount) : orig.slice(rg.idxStart, rg.idxStart + rg.idxCount);
    if (k) { any = true; if (!buckets.has(k.key)) buckets.set(k.key, { rule: k.rule, parts: [] }); buckets.get(k.key).parts.push(s); } else rest.push(s);
  });
  if (!any) return false;
  const mk = (parts, mat) => {
    let n = 0; parts.forEach(p => { n += p.length; }); if (!n) return null;
    const idx = (geo.attributes.position.count > 65535 ? new Uint32Array(n) : new Uint16Array(n)); let o = 0; parts.forEach(p => { idx.set(p, o); o += p.length; });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", geo.attributes.position); if (geo.attributes.normal) g.setAttribute("normal", geo.attributes.normal); if (geo.attributes.color && !mat.userData.l3rm) g.setAttribute("color", geo.attributes.color);
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
    const m = new THREE.Mesh(g, mat); m.userData.l3rmTmp = true; m.userData.noHit = true; m.raycast = () => {}; m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale); m.castShadow = mesh.castShadow; m.receiveShadow = true; m.renderOrder = mesh.renderOrder;
    return m;
  };
  const add = m => { if (m) { mesh.parent.add(m); S.restore.push(() => { mesh.parent && mesh.parent.remove(m); m.geometry.dispose(); }); } };
  add(mk(rest, mesh.userData.vmStd && mesh.userData.vmStd !== mesh.material ? mesh.material : mesh.material));
  buckets.forEach(b => add(mk(b.parts, l3rmMaterial(l3rmDef(b.rule.mat), b.rule))));
  const was = mesh.visible; mesh.visible = false; S.restore.push(() => { mesh.visible = was; });
  return true;
}
/* Marken: grundplan + markytor + vägar som egna nät på marknivå (tas bort efteråt). */
function l3rmGroundZ() {
  if (typeof l3sZ === "function" && typeof plan !== "undefined" && plan && plan.calib) { const z = l3sZ(); if (Number.isFinite(z)) return z; }
  const b = new THREE.Box3(); ["bldg", "places", "objs"].forEach(k => { const g = l3.groups[k]; if (g) b.expandByObject(g); }); return b.isEmpty() ? 0 : b.min.z;
}
function l3rmPolyMesh(pts, z, mat, rot) {   // pts i projektets koordinater → nät i scenen
  const L = pts.map(p => [p[0] - l3.O[0], p[1] - l3.O[1]]), tr = MG.triangulate([L]); if (!tr.t.length) return null;
  const pos = new Float32Array(tr.v.length * 3); tr.v.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = z; });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(Float32Array.from(tr.v.flatMap(() => [0, 0, 1])), 3)); g.setIndex(tr.t.flat()); g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, mat); m.userData.l3rmTmp = true; m.userData.noHit = true; m.raycast = () => {}; m.receiveShadow = true; m.castShadow = false; m.renderOrder = -1; return m;
}
function l3rmBegin(S, opt = {}) {
  S.restore = S.restore || []; const d = l3rmData(), env = l3rmEnvResolved(opt.env || {}), out = { env, base: null, any: false };
  if (opt.materials === false) return out;
  const rules = d.rules, scene = l3.scene;
  const ruleOf = (p, rg, mesh) => {   // p = placering, rg = IFC-område, mesh = nät (för färg)
    if (p) { const r = rules.find(x => x.t === "obj" && x.ref === p.id); if (r) return r; }
    if (rg) { const r = (rg.guid && rules.find(x => x.t === "guid" && x.ref === rg.guid)) || (rg.cls && rules.find(x => x.t === "cls" && x.ref === String(rg.cls).toUpperCase())); if (r) return r; }
    let hex = null; if (rg && rg.base) { const b = Array.from(rg.base).slice(0, 3), mx = Math.max(...b); hex = l3rmHexOf(mx > 1.01 ? b.map(v => v / 255) : b); } else if (mesh) { const m = [].concat(mesh.material)[0]; if (m && m.color) hex = "#" + m.color.getHexString(); }
    return hex ? rules.find(x => x.t === "color" && x.ref === hex) || null : null;
  };
  if (rules.length) {
    // placerade och ritade objekt (och objekt-gruppen)
    const byGroup = new Map(); placements.forEach(p => { const g = l3.placeMeshes.get(p.id); if (g) byGroup.set(g, p); });
    scene.traverse(o => {
      if (!l3rmFlat(o) || o.userData.l3b || o === (l3vm && l3vm.groundMesh)) return;
      let p = null; for (let q = o; q; q = q.parent) { if (byGroup.has(q)) { p = byGroup.get(q); break; } }
      const r = ruleOf(p, null, o); if (!r) return; const def = l3rmDef(r.mat); if (!def) return;
      const orig = o.material, mat = l3rmMaterial(def, r); o.material = Array.isArray(orig) ? orig.map(() => mat) : mat; if (def.op < 1) o.castShadow = false; S.restore.push(() => { o.material = orig; }); out.any = true;
    });
    // IFC-modeller
    scene.traverse(o => { if (l3rmFlat(o) && o.userData.l3b && o.visible) { if (l3rmSplitIfc(o, rg => { const r = ruleOf(null, rg, null); return r ? { key: r.id, rule: r } : null; }, S)) out.any = true; } });
  }
  // marken
  const g0 = d.ground, hasGround = g0.base || g0.areas.length;
  if (hasGround) {
    const zg = (g0.base && g0.base.z != null ? g0.base.z - l3.O[2] : l3rmGroundZ()), grp = new THREE.Group(); grp.userData.l3rmTmp = true; scene.add(grp);
    S.restore.push(() => { scene.remove(grp); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); });
    const bb = new THREE.Box3(); ["bldg", "places", "objs"].forEach(k => { const g = l3.groups[k]; if (g && g.visible) bb.expandByObject(g); }); if (bb.isEmpty()) bb.set(new THREE.Vector3(-30, -30, 0), new THREE.Vector3(30, 30, 10));
    const sp = bb.getBoundingSphere(new THREE.Sphere()), R = Math.max(60, sp.radius * 4);
    if (g0.base) { const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), l3rmMaterial(l3rmDef(g0.base.mat), g0.base)); m.position.set(sp.center.x, sp.center.y, zg - 0.004); m.userData.l3rmTmp = true; m.userData.noHit = true; m.raycast = () => {}; m.receiveShadow = true; m.renderOrder = -3; grp.add(m); out.base = m; if (l3.planMesh && l3.planMesh.visible) { const pm = l3.planMesh; S.vis.push([pm, pm.visible]); pm.visible = false; } if (l3vm.groundMesh) { S.vis.push([l3vm.groundMesh, l3vm.groundMesh.visible]); l3vm.groundMesh.visible = false; } }
    g0.areas.forEach((a, i) => {
      const def = l3rmDef(a.mat); if (!def) return; let pts = a.pts;
      if (a.kind === "road") { const ol = l3apiWallOutline(a.pts, a.width || 6, false); pts = ol; }
      const m = l3rmPolyMesh(pts, (a.z != null ? a.z - l3.O[2] : zg) + 0.006 + i * 0.004, l3rmMaterial(def, a), a.r); if (m) { m.renderOrder = -2 + i * 0.001; grp.add(m); }
    });
    g0.areas.forEach(a => { if (a.src) { const sg = l3.placeMeshes.get(a.src); if (sg) { S.vis.push([sg, sg.visible]); sg.visible = false; } } });   // ritobjektet som markytan kommer från göms i bilden
    out.any = true; out.ground = true;
  }
  if (out.any) S.restore.push(() => { l3.renderer.shadowMap.needsUpdate = true; });
  return out;
}
function l3rmEnd(S) { (S.restore || []).splice(0).reverse().forEach(f => { try { f(); } catch (e) { /* bara visning */ } }); }
/* Material som finns i scenen att peka på (för menyn): IFC-klasser, färger och markerade objekt. */
function l3rmTargets() {
  const cls = new Map(), colors = new Map();
  l3.scene.traverse(o => {
    if (!l3rmFlat(o) || o.userData.l3rmTmp) return;
    const u = o.userData.l3b;
    if (u && u.ranges) { u.ranges.forEach(r => { if (r.cls) cls.set(String(r.cls).toUpperCase(), (cls.get(String(r.cls).toUpperCase()) || 0) + 1); }); return; }
    const m = [].concat(o.material)[0]; if (m && m.color && !(o === (l3vm && l3vm.groundMesh))) { const h = "#" + m.color.getHexString(); colors.set(h, (colors.get(h) || 0) + 1); }
  });
  return { cls: [...cls.entries()].sort((a, b) => b[1] - a[1]), colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24) };
}

/* Markyta/väg ur ett ritat objekt (yta, kropp eller linje) i projektets koordinater. */
function l3rmFootprint(p, road) {
  if (!p || !p.m) throw new Error("Markera ett objekt som är ritat i editorn (yta, kropp eller linje)");
  const m = p.m, rot = (Number(p.rot) || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot), abs = q => [p.x + q[0] * cr - q[1] * sr, p.y + q[0] * sr + q[1] * cr];
  if (m.k === "curve") { if (!road) throw new Error("Linjer används för vägar (Väg av markerad linje)"); return (m.pts || []).map(q => abs(q)); }
  if ((m.k === "face" || m.k === "solid") && m.loops && m.loops[0]) { if (road) throw new Error("Vägar görs av en linje"); return m.loops[0].map(q => abs(MG.to3(m.pl, q))); }
  throw new Error("Objektet kan inte användas som mark");
}
