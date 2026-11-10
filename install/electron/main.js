/* Skrivbordsskal (Electron) för 4D-planering: öppnar webbappen i ett eget fönster, med egen inloggning/cache som överlever omstarter.
   Appen laddas från sin webbadress (uppdateras alltså automatiskt) och fungerar offline via service worker + IndexedDB (se docs/offline.js). */
const { app, BrowserWindow, shell, Menu, dialog, session } = require("electron");
const path = require("path");
const URL_APP = process.env.PLANERING_URL || "https://vfalk-ncc.github.io/4D-planering/index.html";
const ORIGIN = new URL(URL_APP).origin;
if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
function create() {
  win = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1000, minHeight: 650, backgroundColor: "#0b1220", title: "4D-planering", autoHideMenuBar: true,
    webPreferences: { partition: "persist:4dplan", contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Fil", submenu: [{ label: "Ladda om", accelerator: "CmdOrCtrl+R", click: () => win.reload() }, { label: "Helskärm", accelerator: "F11", click: () => win.setFullScreen(!win.isFullScreen()) }, { type: "separator" }, { role: "quit", label: "Avsluta" }] },
    { label: "Visa", submenu: [{ role: "zoomIn", label: "Zooma in" }, { role: "zoomOut", label: "Zooma ut" }, { role: "resetZoom", label: "Normal zoom" }, { role: "toggleDevTools", label: "Utvecklarverktyg" }] },
  ]));
  win.loadURL(URL_APP);
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).origin === ORIGIN) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1400, height: 900 } }; } catch (e) { /* extern */ }
    shell.openExternal(url); return { action: "deny" };
  });
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="margin:0;background:#0b1220;color:#cbd5e1;font:16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center"><div><h2 style="color:#fff">Ingen anslutning</h2><p>Första starten kräver nät. Sedan fungerar appen offline.<br>(${desc})</p><button onclick="location.href='${URL_APP}'" style="padding:10px 22px;border:0;border-radius:20px;background:#3b82f6;color:#fff;font-size:15px;cursor:pointer">Försök igen</button></div></body>`));
  });
  win.on("closed", () => { win = null; });
}
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  const ses = session.fromPartition("persist:4dplan");
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(["fullscreen", "clipboard-read", "clipboard-sanitized-write", "media", "notifications", "pointerLock"].includes(perm)));
  ses.on("will-download", (e, item) => { item.setSavePath(path.join(app.getPath("downloads"), item.getFilename())); });
  create();
});
app.on("window-all-closed", () => app.quit());
