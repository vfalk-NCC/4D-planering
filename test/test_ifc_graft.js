// En IFC-fil med både de utplockade IFC-objekten och etableringsobjekten (Victor 2026-10-13): ifcGraft sätter in
// etableringsfilens objekt i urvalets IFC – IFC4 direkt, IFC2X3 som IfcFacetedBrep – med filens enhet, plats och ägarhistorik.
const S = require('../docs/ifc-subset.js'), fs = require('fs'), vm = require('vm');
const fail = m => { throw new Error(m); };
const G = c => c.repeat(22).slice(0, 22);
// Skrivaren (browser-skript) i en egen kontext.
const ctx = { settings: { userName: 'Test' }, console, Math, String, Number, Array, Object, Set, Map, JSON };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/../docs/ifc-writer.js', 'utf8') + '\nthis.ifcDoc = ifcDoc; this.ifcPt = ifcPt;', ctx);
const IFC = (schema, unitPrefix, withSite = true) => [
  'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');", "FILE_NAME('original.ifc','2026-10-01T10:00:00',('V'),('NCC'),'Tekla','Tekla','');", `FILE_SCHEMA(('${schema}'));`, 'ENDSEC;', 'DATA;',
  `#1=IFCPROJECT('${G('P')}',#2,'Projektet',$,$,$,$,(#10),#11);`, '#2=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,0);', '#3=IFCPERSONANDORGANIZATION(#5,#6,$);', "#4=IFCAPPLICATION(#6,'1','Tekla','T');",
  "#5=IFCPERSON($,'F','V',$,$,$,$,$);", "#6=IFCORGANIZATION($,'NCC',$,$,$);",
  "#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#12,$);", '#11=IFCUNITASSIGNMENT((#13));', '#12=IFCAXIS2PLACEMENT3D(#14,$,$);', `#13=IFCSIUNIT(*,.LENGTHUNIT.,${unitPrefix},.METRE.);`, '#14=IFCCARTESIANPOINT((0.,0.,0.));',
  ...(withSite ? [`#20=IFCSITE('${G('S')}',#2,'Plats',$,$,#26,$,$,.ELEMENT.,$,$,$,$,$);`, `#21=IFCRELAGGREGATES('${G('a')}',#2,$,$,#1,(#20));`, '#26=IFCLOCALPLACEMENT($,#12);'] : []),
  `#30=IFCBUILDINGELEMENTPROXY('${G('A')}',#2,'Fundament',$,$,#26,$,$,$);`, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
// Etableringsfilen som buildPlacementsIfc skriver den (IFC4, meter): en pelare 1×1×3 m vid (100, 200, 5) med egenskaper.
function placeDoc() {
  const doc = ctx.ifcDoc('Test', 'Etablering'), E = doc.E;
  const pts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 3], [1, 0, 3], [1, 1, 3], [0, 1, 3]];
  const pl = E(`IFCCARTESIANPOINTLIST3D((${pts.map(ctx.ifcPt).join(',')}))`);
  const faces = [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]];
  const mesh = E(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${faces.map(f => `(${f.join(',')})`).join(',')}),$)`);
  E(`IFCSTYLEDITEM(${mesh},(${doc.style('c:0.5', '#7c3aed', 'Pelare', 0.5)}),$)`);
  const el = E(`IFCBUILDINGELEMENTPROXY('${G('K')}',$,'Egen låda 3','Placerad',${"'Container'"},${doc.place([100, 200, 5])},${doc.shape(mesh, 'Tessellation')},'x',.NOTDEFINED.)`);
  doc.props(el, [['Typ', 'Egen låda'], ['Höjd m', 3]]);
  return doc.finish([el], 'Etablering.ifc');
}
const check = text => { const P = S.ifcParse(text), ids = new Set(), seen = new Set(); P.ids.forEach(i => { if (ids.has(i)) fail('dubblett #' + i); ids.add(i); }); P.ids.forEach((id, k) => S.ifcRefs(text.slice(P.starts[k], P.ends[k])).forEach(r => { if (!ids.has(r)) fail(`#${id} (${P.types[k]}) pekar på #${r} som saknas`); })); return P; };
const add = placeDoc();
{ // IFC4, millimeter
  const r = S.ifcGraft(IFC('IFC4', '.MILLI.'), add);
  if (!r.text || r.added !== 1) fail('IFC4: ' + JSON.stringify({ why: r.why, added: r.added }));
  const P = check(r.text), has = t => P.types.includes(t);
  if (!has('IFCTRIANGULATEDFACESET') || has('IFCFACETEDBREP')) fail('IFC4 ska behålla IfcTriangulatedFaceSet');
  if (!/IFCCARTESIANPOINT\(\(100000\.,200000\.,5000\.\)\)/.test(r.text) || !/\(0\.,0\.,3000\.\)/.test(r.text)) fail('Punkterna ska räknas om till millimeter');
  if (!r.text.includes(`IFCRELCONTAINEDINSPATIALSTRUCTURE('`) || !/\(#\d+\),#20\);/.test(r.text.split('\n').find(l => /IFCRELCONTAINEDINSPATIALSTRUCTURE/.test(l)))) fail('Etableringen ska ligga på filens plats (#20)');
  if (!/IFCOWNERHISTORY/.test(r.text) || !r.text.includes(`'${G('A')}'`) || !r.text.includes(`'${G('K')}'`)) fail('Originalet och etableringsobjektet ska finnas i filen');
  console.log('OK: IFC4 (mm) – etableringsobjektet sitter på filens plats, punkterna omräknade, inga dubblettid');
}
{ // IFC2X3, meter: IfcFacetedBrep + ägarhistorik
  const r = S.ifcGraft(IFC('IFC2X3', '$'), add);
  if (!r.text || r.added !== 1) fail('IFC2X3: ' + JSON.stringify({ why: r.why }));
  const P = check(r.text), has = t => P.types.includes(t);
  if (has('IFCTRIANGULATEDFACESET') || has('IFCCARTESIANPOINTLIST3D') || has('IFCSURFACESTYLESHADING') || !has('IFCFACETEDBREP') || !has('IFCCLOSEDSHELL') || !has('IFCPRESENTATIONSTYLEASSIGNMENT') || !has('IFCSURFACESTYLERENDERING')) fail('IFC2X3 ska inte ha IFC4-typer: ' + [...new Set(P.types)].join());
  if (P.types.filter(t => t === 'IFCFACE').length !== 12) fail('12 trianglar → 12 ytor');
  const proxy = r.text.split('\n').find(l => /IFCBUILDINGELEMENTPROXY\('K/.test(l));
  if (!/'K{22}',#2,'Egen/.test(proxy) || !/,\$\);\s*$/.test(proxy)) fail('Ägarhistorik (#2) och CompositionType $ i IFC2X3: ' + proxy);
  if (!/IFCRELDEFINESBYPROPERTIES\('[^']+',#2,/.test(r.text)) fail('Egenskaperna ska ha ägarhistorik');
  if (!/'Brep'/.test(r.text) || /'Tessellation'/.test(r.text)) fail('Representationen ska vara Brep');
  console.log('OK: IFC2X3 – etableringsobjektet som IfcFacetedBrep med ägarhistorik och stilar');
}
{ // Kan inte: ingen plats / okänt schema
  const a = S.ifcGraft(IFC('IFC4', '$', false), add), b = S.ifcGraft(IFC('IFC9', '$'), add), c = S.ifcGraft(IFC('IFC2X3', '$').replace(/#2=IFCOWNERHISTORY[^\n]*\n/, '').replace(/,#2,/g, ',$,'), add);
  if (a.text || !/plats/.test(a.why)) fail('Utan plats ska det inte gå: ' + JSON.stringify(a.why));
  if (b.text || !/schema/.test(b.why)) fail('Okänt schema ska inte gå: ' + JSON.stringify(b.why));
  if (c.text) fail('IFC2X3 utan ägarhistorik ska inte gå');
  console.log('OK: utan plats / ägarhistorik sparas det i separata filer (ingen trasig fil)');
}
