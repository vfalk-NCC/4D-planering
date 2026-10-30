const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const keys = ['grav','hjullastare','dumper','betongpump','valt','minilastare','teleskoplastare','gaffeltruck','bandkran','asfaltutlaggare','traktorgravare','bandschaktare','vaghyvel','aggregat','krossverk','servicebil','lastbil','betongbil','borrigg'];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); const pg = await b.newPage({ viewport: { width: 1560, height: 700 } });
  for (let n = 0; n < keys.length; n += 6) {
    const grp = keys.slice(n, n + 6), html = '<body style="margin:0;display:grid;grid-template-columns:repeat(3,520px);background:#fff">' + grp.map(k => `<div style="position:relative"><img width="520" src="data:image/png;base64,${fs.readFileSync('/tmp/claude-0/veh_' + k + '.png').toString('base64')}"><b style="position:absolute;left:8px;top:6px;font:700 16px sans-serif;background:#fff9">${k}</b></div>`).join('') + '</body>';
    await pg.setContent(html); await pg.waitForTimeout(200); await pg.screenshot({ path: `/tmp/claude-0/sheet${n / 6}.png` });
  }
  await b.close();
})();
