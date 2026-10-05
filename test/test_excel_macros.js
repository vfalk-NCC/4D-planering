// Excel-makrona (Victors önskemål 2026-10-05): den enkla modulen Koppling4D (skicka planeringen,
// hämta framdriften) är fryst – den ändras inte när den avancerade modulen byggs vidare. Båda
// modulerna kontrolleras statiskt eftersom VBA inte kan köras här: kodning (Windows-1252, CRLF),
// balanserade block (Sub/Function, If, For, Do, Select, With), inga namnkrockar (VBA skiljer inte
// på stora och små bokstäver) och att den avancerade modulen är fristående.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = path.join(__dirname, '..', 'docs', 'excel');
const fail = m => { console.error('FEL: ' + m); process.exit(1); };

// 1) Den enkla modulen är fryst. Ändras den med avsikt: uppdatera hashen här.
const SIMPLE_SHA = 'fbdfc117948dbe2e3f8aca0ae9ce3e3febbe81529d06a5bd47babf6321cb7a3d';
const simpleBuf = fs.readFileSync(path.join(DIR, 'Koppling4D.bas'));
if (crypto.createHash('sha256').update(simpleBuf).digest('hex') !== SIMPLE_SHA) fail('Koppling4D.bas (den enkla framdriftshämtningen) har ändrats – den ska vara orörd');
console.log('OK: den enkla modulen (skicka + hämta framdrift) är oförändrad');

const decode = buf => new TextDecoder('windows-1252').decode(buf);
function check(file) {
  const buf = fs.readFileSync(path.join(DIR, file)), text = decode(buf);
  if (/[^\r]\n/.test(text)) fail(`${file}: radslut ska vara CRLF`);
  if (buf.includes(Buffer.from([0xc3, 0xa5]))) fail(`${file}: ser ut att vara UTF-8 (ska vara Windows-1252 för VBA-importen)`);
  const name = (/^Attribute VB_Name = "([^"]+)"/.exec(text) || [])[1];
  if (!name) fail(`${file}: saknar Attribute VB_Name`);
  // Ta bort kommentarer och strängar, slå ihop fortsättningsrader.
  const strip = line => { let out = '', inS = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { inS = !inS; out += '"'; continue; } if (inS) continue; if (ch === "'") break; out += ch; } return out; };
  const lines = [];
  text.split('\r\n').forEach((raw, i) => {
    const s = strip(raw).replace(/\s+$/, '');
    if (lines.length && /\s_$/.test(lines[lines.length - 1].s)) lines[lines.length - 1].s = lines[lines.length - 1].s.replace(/\s_$/, ' ') + s.trim();
    else lines.push({ s, n: i + 1 });
  });
  const stack = [], procs = [], modVars = [];
  let inProc = null;
  const push = (k, n) => stack.push({ k, n }), pop = (k, n) => { const t = stack.pop(); if (!t || t.k !== k) fail(`${file} rad ${n}: "${k}" stänger ${t ? `"${t.k}" från rad ${t.n}` : 'ingenting'}`); };
  lines.forEach(({ s, n }) => {
    const line = s.trim();
    if (!line) return;
    const stmts = line.split(/:(?=\s|$)/).map(x => x.trim()).filter(Boolean);
    const first = stmts[0];
    let m;
    if ((m = /^(?:(?:Private|Public)\s+)?(Sub|Function)\s+(\w+)/i.exec(first))) { if (inProc) fail(`${file} rad ${n}: ${m[2]} börjar inuti ${inProc}`); inProc = m[2]; procs.push(m[2]); push(m[1].toLowerCase(), n); return; }
    if (/^End\s+(Sub|Function)$/i.test(first)) { pop(first.split(/\s+/)[1].toLowerCase(), n); if (stack.length) fail(`${file} rad ${n}: öppna block i ${inProc}: ${stack.map(t => t.k + '@' + t.n).join(', ')}`); inProc = null; return; }
    if (!inProc) {
      if ((m = /^(?:Private|Public|Dim)\s+(?!Const\b|Sub\b|Function\b)(.+)$/i.exec(first))) m[1].split(',').forEach(d => { const v = (/^\s*(\w+)/.exec(d) || [])[1]; if (v) modVars.push(v); });
      if ((m = /^(?:Private|Public)\s+Const\s+(\w+)/i.exec(first))) modVars.push(m[1]);
      return;
    }
    // Block-If: raden slutar med Then (inget efter).
    if (/^If\b.*\bThen$/i.test(line)) { push('if', n); return; }
    stmts.forEach(st => {
      if (/^If\b/i.test(st)) return; // enradig If
      if (/^End\s+If$/i.test(st)) return pop('if', n);
      if (/^For\b/i.test(st)) return push('for', n);
      if (/^Next\b/i.test(st)) return pop('for', n);
      if (/^Do\b/i.test(st)) return push('do', n);
      if (/^Loop\b/i.test(st)) return pop('do', n);
      if (/^Select\s+Case\b/i.test(st)) return push('select', n);
      if (/^End\s+Select$/i.test(st)) return pop('select', n);
      if (/^With\b/i.test(st)) return push('with', n);
      if (/^End\s+With$/i.test(st)) return pop('with', n);
    });
  });
  if (inProc || stack.length) fail(`${file}: ${inProc} saknar End`);
  const lower = a => a.map(x => x.toLowerCase());
  const dupe = a => lower(a).filter((x, i, arr) => arr.indexOf(x) !== i);
  if (dupe(procs).length) fail(`${file}: samma procedurnamn flera gånger: ${dupe(procs)}`);
  const clash = modVars.filter(v => lower(procs).includes(v.toLowerCase()));
  if (clash.length) fail(`${file}: variabel/konstant med samma namn som en procedur (VBA skiljer inte på stora/små bokstäver): ${clash}`);
  const pub = [...text.matchAll(/^Public\s+(?:Sub|Function)\s+(\w+)/gim)].map(x => x[1]);
  return { name, text, procs, pub };
}
const simple = check('Koppling4D.bas'), adv = check('Koppling4DAvancerat.bas');
console.log(`OK: båda modulerna har balanserade block och inga namnkrockar (${simple.procs.length} + ${adv.procs.length} procedurer)`);

// 2) Fristående: egna publika namn, egna hjälpfunktioner, inga anrop till den enkla modulens publika makron.
if (simple.name === adv.name) fail('Modulerna måste ha olika namn');
const shared = lower(simple.pub).filter(p => lower(adv.pub).includes(p));
function lower(a) { return a.map(x => x.toLowerCase()); }
if (shared.length) fail('Publika makron med samma namn i båda modulerna: ' + shared);
const advBody = adv.text.replace(/'.*$/gm, '');
simple.pub.forEach(p => { if (new RegExp(`\\b${p}\\b`, 'i').test(advBody)) fail('Den avancerade modulen anropar den enkla modulens ' + p); });
['ParseJson', 'HamtaText', 'Token4D', 'Projekt4D', 'Falt', 'Txt', 'Tal'].forEach(f => { if (!adv.procs.includes(f)) fail('Den avancerade modulen saknar egen ' + f); });
// Anropade privata procedurer ska finnas i modulen.
['HittaRad', 'HittaKol', 'SkapaKol', 'SattCell', 'SkrivZonflik', 'ZonRad', 'SattDatum', 'KanSkriva', 'LasUppBlad', 'LasUppBok', 'LasIgen', 'Tyst', 'Vanligt', 'Slaihop', 'CellText', 'AnnatId', 'SistaKol'].forEach(f => { if (!adv.procs.includes(f)) fail('Saknar ' + f); });
console.log('OK: den avancerade modulen är fristående (egna namn och hjälpfunktioner)');

// 3) Originalet ändras aldrig: allt skrivs i kopian (wb), inte i ThisWorkbook.
const main = (/Public Sub Avancerat4D\(\)([\s\S]*?)\r\nEnd Sub/.exec(adv.text) || [])[1] || fail('Avancerat4D saknas');
if (!/ThisWorkbook\.SaveCopyAs kopia/.test(main) || !/Workbooks\.Open\(kopia/.test(main)) fail('Avancerat4D ska göra och öppna en kopia');
const writes = main.split('\r\n').filter(l => /ThisWorkbook\./.test(l.replace(/'.*$/, '')) && !/ThisWorkbook\.(Name|Path|SaveCopyAs)/.test(l));
if (writes.length) fail('Avancerat4D får bara läsa namn/sökväg och göra en kopia av originalet: ' + writes.join(' | '));
if (/ThisWorkbook\.Worksheets/.test(adv.text.replace(/'.*$/gm, '').replace(/Private Sub SattProjekt[\s\S]*?End Sub/, ''))) fail('Den avancerade modulen får inte skriva i originalets flikar');
console.log('OK: den avancerade modulen skriver bara i kopian – originalet ändras aldrig');
