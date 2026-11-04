// Statisk granskning (tools/audit.js): inga namnkrockar mellan skript på samma sida, inga anrop till namn som ingen definierar, inga klassiska buggmönster.
// Kräver acorn och eslint@8 (npm i acorn eslint@8; sätt NODE_PATH om de ligger utanför repot) – annars hoppas testet över.
const { spawnSync } = require('child_process'), path = require('path');
try { require.resolve('acorn'); require.resolve('eslint'); } catch (e) { console.log('SKIP test_audit (acorn/eslint saknas – npm i acorn eslint@8)'); process.exit(0); }
const r = spawnSync('node', [path.join(__dirname, '..', 'tools', 'audit.js')], { encoding: 'utf8' });
const tail = (r.stdout || '').trim().split('\n').slice(-12).join('\n');
if (r.status !== 0) { console.error('FAIL audit\n' + tail); process.exit(1); }
console.log('OK test_audit –', (r.stdout.match(/Sammanlagt:.*/) || [''])[0]);
