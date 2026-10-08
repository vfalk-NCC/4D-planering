// PP-import (Victor 2026-10-08): entreprenören från Powerproject skriver bara över när aktiviteten har
// en kod i det valda kodbiblioteket – annars behålls den som fyllts i (i 4D-planering eller dashboarden).
const fs = require('fs'), path = require('path'), vm = require('vm');
const fail = m => { console.log('FEL: ' + m); process.exit(1); };
const ctx = { console, document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} }, window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'pp-import.js'), 'utf8') + '\nthis.ppToParsedItems = ppToParsedItems;', ctx);
const t = (id, codes) => ({ id, top: 1, topName: 'DP1', name: 'Akt ' + id, path: ['DP1', 'Prod', 'Grund'], kind: 'task', start: '2026-10-01', end: '2026-10-05', codes });
const pp = { tasks: [t(1, { 7: 'Wikströms AB' }), t(2, {}), t(3, { 7: '' })], links: [] };
const withLib = ctx.ppToParsedItems(pp, { groups: new Set([1]), areaLib: null, contractorLib: 7 });
const noLib = ctx.ppToParsedItems(pp, { groups: new Set([1]), areaLib: null, contractorLib: null });
if (withLib[0].contractor !== 'Wikströms AB') fail('Har PP en entreprenör ska den användas: ' + withLib[0].contractor);
if (withLib[1].contractor !== undefined || withLib[2].contractor !== undefined) fail('Saknas koden i PP ska entreprenören inte röras (undefined): ' + JSON.stringify(withLib.map(x => x.contractor)));
if (noLib.some(x => x.contractor !== undefined)) fail('Utan kodbibliotek ska entreprenören aldrig röras');
// Sammanslagningen i app.js: undefined behåller den befintliga.
const src = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app.js'), 'utf8');
if (!src.includes('contractor: p.contractor !== undefined ? p.contractor : (existing ? existing.contractor : null)')) fail('Sparningen ska behålla befintlig entreprenör när importen inte ger någon');
console.log('OK: PP-importen skriver bara över entreprenören när Powerproject har en; annars behålls den ifyllda');
console.log('ALLA TESTER OK');
