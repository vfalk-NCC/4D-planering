/* Roterade fotavtryck: minsta omslutande rektangel ur punkter (ren geometri). */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../docs/lagesplan-footprint.js', 'utf8').replace(/if \(document\.readyState[\s\S]*$/, '');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
const fail = m => { console.error('FEL: ' + m); process.exit(1); };
const a = 0.6, c = Math.cos(a), s = Math.sin(a), pts = [];
for (let i = 0; i <= 10; i++) for (let j = 0; j <= 4; j++) { const u = i * 1.0, v = j * 0.5; pts.push([100 + u * c - v * s, 200 + u * s + v * c]); }
const R = ctx.fpMinRect(pts); if (!R) fail('ingen rektangel');
const w = Math.hypot(R.corners[1][0] - R.corners[0][0], R.corners[1][1] - R.corners[0][1]), d = Math.hypot(R.corners[3][0] - R.corners[0][0], R.corners[3][1] - R.corners[0][1]);
if (Math.abs(R.area - 20) > 1e-6 || Math.abs(Math.max(w, d) - 10) > 1e-6 || Math.abs(Math.min(w, d) - 2) > 1e-6) fail('fel mått ' + JSON.stringify({ area: R.area, w, d }));
console.log('OK test_lagesplan_footprint');
