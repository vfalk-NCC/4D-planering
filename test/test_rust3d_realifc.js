// Rust-motorn mot en RIKTIG IFC-fil (ThatOpen/engine_web-ifc, exempelfil, IFC2X3, mm-enheter, sammansatta kurvor).
// Hämtas med curl; saknas nätverk hoppas testet över. Filen sparas inte i repot.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const URL = 'https://raw.githubusercontent.com/ThatOpen/engine_web-ifc/main/examples/example.ifc', tmp = path.join(os.tmpdir(), 'r3_real_example.ifc');
try { execFileSync('curl', ['-sSf', '--max-time', '40', '-o', tmp, URL], { stdio: 'pipe' }); } catch (e) { console.log('SKIP test_rust3d_realifc (ingen nätverksåtkomst till exempelfilen)'); process.exit(0); }
(async () => {
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(__dirname, '..', 'docs', 'rust3d', 'rust3d.wasm')), {}); const E = instance.exports, b = fs.readFileSync(tmp);
  const p = E.alloc(b.length); new Uint8Array(E.memory.buffer, p, b.length).set(b); const rc = E.model_load(p, b.length); if (rc !== 0) throw new Error('model_load ' + rc);
  const n = E.model_summary(), s = JSON.parse(Buffer.from(new Uint8Array(E.memory.buffer, E.out_ptr(), n)).toString());
  const bad = []; if (s.objects !== 116) bad.push('objekt ' + s.objects); if (s.skipped.length) bad.push('hoppade över ' + JSON.stringify(s.skipped)); if (Math.abs(s.scale - 0.001) > 1e-9) bad.push('enhet ' + s.scale);
  const w = s.bbox[3] - s.bbox[0], h = s.bbox[5] - s.bbox[2]; if (!(w > 20 && w < 30 && h > 4 && h < 8)) bad.push('byggnadens mått ' + w.toFixed(1) + '×' + h.toFixed(1) + ' m');
  const q = JSON.parse((() => { const m = E.model_quantities(); return Buffer.from(new Uint8Array(E.memory.buffer, E.out_ptr(), m)).toString(); })()); const vol = q.reduce((a, x) => a + x[1], 0); if (!(vol > 20 && vol < 500)) bad.push('volym ' + vol.toFixed(1));
  fs.unlinkSync(tmp); if (bad.length) { console.error('FEL: ' + bad.join(' | ')); process.exit(1); }
  console.log(`OK: riktig IFC (IFC2X3, mm): ${s.objects} objekt, ${s.tris} trianglar, ${w.toFixed(1)} × ${h.toFixed(1)} m, ${vol.toFixed(0)} m³ – inga geometrityper hoppades över`); console.log('OK test_rust3d_realifc');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
