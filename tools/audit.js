#!/usr/bin/env node
/* Statisk granskning av hela frontend-koden (docs/). Kräver acorn och eslint@8 (npm i acorn eslint@8 i valfri mapp, sätt NODE_PATH dit).
   Alla skript på en sida delar ett globalt namnrum, så granskningen görs per HTML-sida:
     1. NAMNKROCKAR  – samma globala namn deklareras i två skript på samma sida. const/let/class i två filer stoppar det andra skriptet helt (SyntaxError),
                       function/var i två filer skriver tyst över varandra (så föll l3lyPaint och v3-lf* i dag).
     2. SAKNADE NAMN – anrop/läsning av ett globalt namn som ingen definierar (så försvann ifcmLoad: IFC-modeller gick inte att läsa in).
     3. BUGGMÖNSTER  – dubbla nycklar/case, onåbar kod, const som tilldelas, isNaN-jämförelser, felstavade typeof m.m. (ESLint-regler).
   Användning: node tools/audit.js [--json] [sida.html …]   – avslutar med kod 1 om något fel (error) hittas. Ignorerar vendor/. */
const fs = require("fs"), path = require("path");
const acorn = require("acorn"), { Linter } = require("eslint");
const DOCS = path.join(__dirname, "..", "docs"), args = process.argv.slice(2), JSON_OUT = args.includes("--json"), pages = args.filter(a => a.endsWith(".html"));
const PAGES = pages.length ? pages : fs.readdirSync(DOCS).filter(f => f.endsWith(".html"));
/* Globaler som kommer från bibliotek eller webbläsaren utöver ESLints browser-miljö. */
const LIB = ["module", "exports", "require", "THREE", "fflate", "pdfjsLib", "WebIFC", "JSZip", "GeoTIFF", "rhino3dm", "occtimportjs", "initSqlJs", "L", "LAZPerf", "createLazPerf", "manifold", "Module", "ifcLite", "wasm_bindgen", "pdfjsWorker", "gapi", "google", "jspdf", "html2canvas", "XLSX", "supabase", "polygonClipping", "Chart", "Sortable", "marked", "DOMPurify", "mapboxgl", "maplibregl", "proj4", "turf", "earcut", "ClipperLib", "Plotly"];
/* Namn som med flit saknas på vissa sidor: kod som delas mellan 4D-planering (index.html, i Trimble Connect) och lägesplanen/3D-editorn (lagesplan.html) men bara körs i ena miljön,
   eller bibliotek som läses in vid behov (window.X). Varje rad är granskad för hand – lägg inte till nya utan att kontrollera att anropet är skyddat. */
const CONTEXT_ONLY = {
  "lagesplan.html": ["pako", "qrcode", "MeshBVHLib",   /* bibliotek som laddas vid behov */
    "hexToRgbaObj", "clearMarkupIds", "addedLineIds", "tcUploadFiles", "itemsPath", "tcFileBytes", "tcAccessToken", "tcApiBase"],   /* funktioner i app.js (bara i 4D-planering): anropen ligger bakom typeof API / askOpener */
  "index.html": ["TrimbleConnectWorkspace", "l3RebuildOne", "l3Changed", "UI_MINUS", "UI_PLUS", "downloadBlob"],   /* 3D-editorns sidopaneler (bara i lagesplan.html) */
  "fbx2ifc.html": ["l3msAdd", "l3msDeliver", "l3"],   /* "Visa i 3D" och IFC-leverans i lagesplan-3ddwf.js används inte av omvandlaren */
};
const read = f => fs.readFileSync(f, "utf8");
const scriptsOf = html => [...html.matchAll(/<script[^>]*\bsrc="([^"?]+)(?:\?[^"]*)?"[^>]*>/g)].map(m => m[1]).filter(s => !/^(https?:)?\/\//.test(s) && !/^vendor\//.test(s) && !/-worker\.js$/.test(s) && fs.existsSync(path.join(DOCS, s)));
const inlineOf = html => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
function declsOf(code) {   // översta nivåns deklarationer: [{name, kind, line}]
  let ast; try { ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", locations: true, allowHashBang: true }); } catch (e) { return { err: e.message, decls: [] }; }
  const out = [], names = p => { if (!p) return []; if (p.type === "Identifier") return [p.name]; if (p.type === "ObjectPattern") return p.properties.flatMap(q => names(q.value || q.argument)); if (p.type === "ArrayPattern") return p.elements.flatMap(names); if (p.type === "AssignmentPattern") return names(p.left); if (p.type === "RestElement") return names(p.argument); return []; };
  for (const n of ast.body) {
    if (n.type === "FunctionDeclaration") out.push({ name: n.id.name, kind: "function", line: n.loc.start.line });
    else if (n.type === "ClassDeclaration") out.push({ name: n.id.name, kind: "class", line: n.loc.start.line });
    else if (n.type === "VariableDeclaration") n.declarations.forEach(d => names(d.id).forEach(nm => out.push({ name: nm, kind: n.kind, line: n.loc.start.line })));
  }
  return { decls: out };
}
const RULES = { "no-undef": 2, "no-const-assign": 2, "no-dupe-keys": 2, "no-dupe-args": 2, "no-dupe-else-if": 2, "no-duplicate-case": 2, "no-unreachable": 1, "no-unsafe-negation": 2, "no-sparse-arrays": 1, "use-isnan": 2, "valid-typeof": 2,
  "no-empty-character-class": 2, "no-unsafe-finally": 2, "no-func-assign": 0, "getter-return": 2, "no-self-assign": 1, "no-loss-of-precision": 1, "no-redeclare": [2, { builtinGlobals: false }], "no-inner-declarations": 0, "no-unused-labels": 1, "no-useless-backreference": 1, "no-setter-return": 2, "no-compare-neg-zero": 1, "no-misleading-character-class": 0, "no-control-regex": 0 };
const report = { pages: {}, errors: 0, warnings: 0 }, linter = new Linter();
for (const page of PAGES) {
  const html = read(path.join(DOCS, page)), files = scriptsOf(html), res = { scripts: files.length, collisions: [], undefinedNames: [], problems: [], parseErrors: [] };
  const byName = new Map(), globals = {}; LIB.forEach(n => { globals[n] = "readonly"; });
  files.forEach(f => { const { decls, err } = declsOf(read(path.join(DOCS, f))); if (err) res.parseErrors.push(`${f}: ${err}`); decls.forEach(d => { (byName.get(d.name) || byName.set(d.name, []).get(d.name)).push({ file: f, ...d }); globals[d.name] = "writable"; }); });
  inlineOf(html).forEach((code, i) => { const { decls } = declsOf(code); decls.forEach(d => { (byName.get(d.name) || byName.set(d.name, []).get(d.name)).push({ file: `${page}#inline${i + 1}`, ...d }); globals[d.name] = "writable"; }); });
  byName.forEach((list, name) => { const files2 = new Set(list.map(x => x.file)); if (files2.size < 2) return; const fatal = list.some(x => x.kind !== "function" && x.kind !== "var"); res.collisions.push({ name, fatal, where: list.map(x => `${x.file}:${x.line} (${x.kind})`) }); });
  for (const f of files) {
    const code = read(path.join(DOCS, f)), msgs = linter.verify(code, { parserOptions: { ecmaVersion: 2022, sourceType: "script" }, env: { browser: true, es2022: true, worker: false }, globals, rules: RULES }, { filename: f });
    const guarded = new Set([...code.matchAll(/typeof\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]));   // namn som koden själv provar med typeof räknas som valfria (delad kod mellan sidor)
    msgs.forEach(m => { if (m.ruleId === "no-undef" && ((CONTEXT_ONLY[page] || []).includes((m.message.match(/'([^']+)'/) || [])[1]) || guarded.has((m.message.match(/'([^']+)'/) || [])[1]))) return; if (m.fatal) { res.parseErrors.push(`${f}:${m.line} ${m.message}`); return; }
      if (m.ruleId === "no-undef") res.undefinedNames.push({ name: (m.message.match(/'([^']+)'/) || [])[1], file: f, line: m.line });
      else res.problems.push({ rule: m.ruleId, severity: m.severity, file: f, line: m.line, message: m.message }); });
  }
  report.pages[page] = res;
  report.errors += res.collisions.filter(c => c.fatal).length + res.parseErrors.length + res.undefinedNames.length + res.problems.filter(p => p.severity === 2).length;
  report.warnings += res.collisions.filter(c => !c.fatal).length + res.problems.filter(p => p.severity === 1).length;
}
if (JSON_OUT) console.log(JSON.stringify(report, null, 1));
else for (const [page, r] of Object.entries(report.pages)) {
  console.log(`\n=== ${page} (${r.scripts} skript) ===`);
  r.parseErrors.forEach(e => console.log("  PARSEFEL  ", e));
  r.collisions.forEach(c => console.log(`  ${c.fatal ? "KROCK-FATAL" : "KROCK      "} ${c.name}: ${c.where.join("  |  ")}`));
  const und = new Map(); r.undefinedNames.forEach(u => { (und.get(u.name) || und.set(u.name, []).get(u.name)).push(`${u.file}:${u.line}`); });
  und.forEach((w, n) => console.log(`  SAKNAS      ${n}  ← ${w.slice(0, 4).join(", ")}${w.length > 4 ? ` (+${w.length - 4})` : ""}`));
  r.problems.forEach(p => console.log(`  ${p.severity === 2 ? "FEL " : "VARN"} ${p.rule} ${p.file}:${p.line} ${p.message}`));
}
console.log(`\nSammanlagt: ${report.errors} fel, ${report.warnings} varningar`);
process.exit(report.errors ? 1 : 0);
