// Lägesplanens skript delar globalt namnrymd: ett namn (function/const/let/class) som deklareras
// på toppnivå i två filer gör att den senare filen inte laddas alls ("already been declared").
// Testet hittar sådana krockar statiskt (Victors exporter 2026-10-05: zoneLabelBoxes krockade).
const fs = require('fs'), path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');
// Samma kontroll för 4D-planeringens index.html (delar ifc-writer.js med Lägesplan).
['lagesplan.html', 'index.html'].forEach(page => {
const html = fs.readFileSync(path.join(DOCS, page), 'utf8');
const files = [...html.matchAll(/<script src="([^"?]+\.js)(?:\?[^"]*)?"><\/script>/g)].map(m => m[1]).filter(f => fs.existsSync(path.join(DOCS, f)));
const seen = new Map(), dupes = [];
files.forEach(f => {
  const src = fs.readFileSync(path.join(DOCS, f), 'utf8');
  // Bara toppnivå: rader som börjar i kolumn 0.
  for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|class)\s+([A-Za-z_$][\w$]*))/gm)) {
    const name = m[1] || m[2];
    const kind = m[1] ? 'function' : 'lexical';
    if (seen.has(name)) {
      const prev = seen.get(name);
      // Två function-deklarationer skriver bara över varandra (fungerar, men varnas inte här); const/let/class krockar.
      if (kind === 'lexical' || prev.kind === 'lexical') dupes.push(`${name}: ${prev.file} och ${f}`);
    } else seen.set(name, { file: f, kind });
  }
});
if (dupes.length) { console.error('FEL: samma globala namn i flera filer (filen laddas inte):\n  ' + dupes.join('\n  ')); process.exit(1); }
console.log(`OK: inga krockande globala namn i ${page} (${files.length} skript, ${seen.size} namn)`);
});
