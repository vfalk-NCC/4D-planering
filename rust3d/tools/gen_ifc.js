#!/usr/bin/env node
// Skapar en syntetisk IFC-fil (och valfritt punktmoln) för att prova/mäta Rust-labbet. Inga riktiga data.
// node gen_ifc.js <antal våningar> <ut.ifc> [punktmoln.xyz]
const fs = require('fs');
const floors = +process.argv[2] || 3, out = process.argv[3] || 'test.ifc', cloudOut = process.argv[4];
let n = 100; const L = [];
const id = () => ++n, add = (s) => { const i = id(); L.push(`#${i}=${s};`); return i; };
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const pt = (x, y, z) => add(`IFCCARTESIANPOINT((${x.toFixed(3)},${y.toFixed(3)}${z === undefined ? '' : ',' + z.toFixed(3)}))`);
const dir = (x, y, z) => add(`IFCDIRECTION((${x},${y},${z}))`);
const ax = (x, y, z, rel) => { const p = pt(x, y, z); return add(`IFCAXIS2PLACEMENT3D(#${p},$,$)`); };
const lp = (x, y, z, rel) => add(`IFCLOCALPLACEMENT(${rel ? '#' + rel : '$'},#${ax(x, y, z)})`);
const up = dir(0, 0, 1);
const rect = (w, d) => add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${add(`IFCAXIS2PLACEMENT2D(#${pt(0, 0)},$)`)},${w},${d})`);
const extr = (prof, h) => add(`IFCEXTRUDEDAREASOLID(#${prof},#${ax(0, 0, 0)},#${up},${h})`);
const colour = (item, r, g, b, tr) => { const c = add(`IFCCOLOURRGB($,${r},${g},${b})`); const s = add(`IFCSURFACESTYLERENDERING(#${c},${tr || 0},$,$,$,$,$,$,.NOTDEFINED.)`); const ss = add(`IFCSURFACESTYLE($,.BOTH.,(#${s}))`); const a = add(`IFCPRESENTATIONSTYLEASSIGNMENT((#${ss}))`); add(`IFCSTYLEDITEM(#${item},(#${a}),$)`); };
const shape = (items) => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${add(`IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(${items.map(i => '#' + i).join(',')}))`)}))`);
const pset = (obj, name, props) => { const ps = props.map(([k, v, t]) => add(`IFCPROPERTYSINGLEVALUE(${q(k)},$,${t}(${typeof v === 'string' ? q(v) : v}),$)`)); const set = add(`IFCPROPERTYSET(${q('G' + n)},$,${q(name)},$,(${ps.map(p => '#' + p).join(',')}))`); add(`IFCRELDEFINESBYPROPERTIES(${q('R' + n)},$,$,$,(#${obj}),#${set})`); };
add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`);
const proj = add(`IFCPROJECT('P',$,'Testprojekt',$,$,$,$,$,$)`);
const site = add(`IFCSITE('S',$,'Tomt',$,$,#${lp(6512300, 150100, 0)},$,$,.ELEMENT.,$,$,$,$,$)`);
const bld = add(`IFCBUILDING('B',$,'Hus A',$,$,#${lp(0, 0, 0, 0) && lp(0, 0, 0)},$,$,.ELEMENT.,$,$,$)`);
const rootPl = lp(6512300, 150100, 0);
// mappad pelare (instans)
const colProf = rect(0.4, 0.4), colSolid = extr(colProf, 3.0); colour(colSolid, 0.7, 0.55, 0.4);
const colRep = add(`IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${colSolid}))`);
const rmap = add(`IFCREPRESENTATIONMAP(#${ax(0, 0, 0)},#${colRep})`);
const cto = (x, y, z) => add(`IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#${pt(x, y, z)},1.,$)`);
const mapped = (x, y, z) => add(`IFCMAPPEDITEM(#${rmap},#${cto(x, y, z)})`);
// triangulerad kil (ramp)
const cl = add(`IFCCARTESIANPOINTLIST3D(((0.,0.,0.),(4.,0.,0.),(4.,2.,0.),(0.,2.,0.),(0.,0.,1.),(4.,0.,1.)))`);
const tfs = add(`IFCTRIANGULATEDFACESET(#${cl},$,.T.,((1,2,3),(1,3,4),(1,5,6),(1,6,2),(2,6,3),(1,4,5)),$)`);
let objCount = 0; const stor = [];
for (let f = 0; f < floors; f++) {
  const z = f * 3.2, spl = lp(0, 0, z, rootPl);
  const st = add(`IFCBUILDINGSTOREY(${q('ST' + f)},$,${q('Plan ' + (f + 1))},$,$,#${spl},$,$,.ELEMENT.,${z})`);
  const els = [];
  const slabItem = extr(rect(30, 20), 0.3); colour(slabItem, 0.66, 0.68, 0.7);
  const slab = add(`IFCSLAB(${q('SL' + f)},$,${q('Bjälklag ' + (f + 1))},$,$,#${lp(15, 10, 0, spl)},#${shape([slabItem])},$,.FLOOR.)`); els.push(slab); pset(slab, 'Pset_SlabCommon', [['Brandklass', 'REI60', 'IFCLABEL'], ['Tjocklek', 0.3, 'IFCLENGTHMEASURE'], ['IsExternal', '.F.', 'IFCBOOLEAN']].map(p => p[2] === 'IFCBOOLEAN' ? [p[0], 0, p[2]] : p));
  const walls = [[15, 0, 30, 0.25, 0], [15, 20, 30, 0.25, 0], [0, 10, 20, 0.25, 90], [30, 10, 20, 0.25, 90]];
  walls.forEach(([x, y, len, th, rot], i) => { const it = extr(rect(len, th), 2.9); colour(it, 0.84, 0.82, 0.79); const m = rot ? ax(x, y, 0.3) : ax(x, y, 0.3);
    const pl = add(`IFCLOCALPLACEMENT(#${spl},#${(() => { const p = pt(x, y, 0.3); const rd = rot ? dir(0, 1, 0) : dir(1, 0, 0); return add(`IFCAXIS2PLACEMENT3D(#${p},$,#${rd})`); })()})`);
    const w = add(`IFCWALL(${q('W' + f + i)},$,${q('Yttervägg ' + (f + 1) + '.' + (i + 1))},$,$,#${pl},#${shape([it])},$)`); els.push(w); pset(w, 'Pset_WallCommon', [['Brandklass', 'EI60', 'IFCLABEL'], ['LoadBearing', 1, 'IFCINTEGER']]); });
  for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) { const p = add(`IFCCOLUMN(${q('C' + f + c + r)},$,${q('Pelare ' + (f + 1) + '-' + c + r)},$,$,#${lp(3 + c * 4.8, 3 + r * 4.6, 0.3, spl)},#${add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${add(`IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#${mapped(0, 0, 0)}))`)}))`)},$)`); els.push(p); }
  const ramp = add(`IFCBUILDINGELEMENTPROXY(${q('RP' + f)},$,${q('Ramp ' + (f + 1))},$,$,#${lp(32, 2, 0.3, spl)},#${add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${add(`IFCSHAPEREPRESENTATION($,'Body','Tessellation',(#${tfs}))`)}))`)},$)`); els.push(ramp);
  const win = add(`IFCWINDOW(${q('WI' + f)},$,${q('Fönster ' + (f + 1))},$,$,#${lp(8, -0.05, 1.1, spl)},#${shape([(() => { const it = extr(rect(2, 0.1), 1.4); colour(it, 0.5, 0.75, 0.95, 0.6); return it; })()])},$,1.4,2.)`); els.push(win);
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${q('RC' + f)},$,$,$,(${els.map(e => '#' + e).join(',')}),#${st})`); stor.push(st); objCount += els.length;
}
const head = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME('test.ifc','2026-10-23T00:00:00',(''),(''),'gen_ifc','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n`;
fs.writeFileSync(out, head + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n');
console.log(`${out}: ${floors} våningar, ${objCount} objekt, ${(L.length)} entiteter`);
if (cloudOut) { // punktmoln: bjälklag plan 1 + 2 cm brus + en uppstickande "avvikelse" 5 cm
  const o = []; let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400000; i++) { const x = rnd() * 30, y = rnd() * 20; let z = 0.3 + (rnd() - 0.5) * 0.02; if (x > 20 && x < 24 && y > 5 && y < 9) z += 0.08; o.push(`${(6512300 + x).toFixed(3)} ${(150100 + y - 0).toFixed(3)} ${z.toFixed(3)}`); }
  fs.writeFileSync(cloudOut, o.join('\n')); console.log(`${cloudOut}: ${o.length} punkter`);
}
