// Bubblor: egna anteckningar, tända/släcka, fält. Kör: NODE_PATH=/opt/node22/lib/node_modules node test/test_lagesplan_bubopts.js
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/../docs/lagesplan-3dbubbles.js', 'utf8');
const fx = fs.readFileSync(__dirname + '/../docs/lagesplan-3dfilmfx.js', 'utf8');
const pr = fs.readFileSync(__dirname + '/../docs/lagesplan-print3d.js', 'utf8');
const fail = m => { console.error('FEL: ' + m); process.exit(1); };
['["note", "Anteckning"]', '["resource", "Resurser"]', '["status", "Status"]', 'l3boEdit', 'data-ba="off"', 'data-ba="pin"', 'cfg.neutral', 'bubble_notes_3d.json'].forEach(k => { if (!s.includes(k)) fail('saknas i bubblor: ' + k); });
if (!fx.includes('L.note') || !fx.includes('cfg.line')) fail('canvas-bubblorna saknar anteckning/ledlinje');
if (!pr.includes('data-bf') || !pr.includes('bubNoLine')) fail('utskriften saknar fältval');
new Function(s.replace(/^const /gm, 'var '));  // syntax
console.log('OK test_lagesplan_bubopts (statisk)');
