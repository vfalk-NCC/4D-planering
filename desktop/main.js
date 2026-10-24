/* Skrivbordsappen: öppnar lagesplan.html i fristående läge (utan Trimble Connect/GitHub). Filerna serveras lokalt; bibliotek som annars hämtas från CDN
   (pdf.js, jszip, xlsx …) läses från app/vendor-cdn/ om de finns (hämtas vid bygget av prepare.js) så att appen också går att använda utan internet. */
const { app, BrowserWindow, Menu, shell, session, dialog } = require("electron");
const path = require("path"), fs = require("fs");
const { startServer } = require("./server");
const ROOT = path.join(__dirname, "app");
const CDN = {
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js": "pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js": "pdf.worker.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js": "jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js": "xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js": "pako.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js": "pdf-lib.min.js",
  "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js": "pdf-lib.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js": "jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js": "qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web/dist/libredwg-web.js": "libredwg-web.js"
};
let win = null;
async function createWindow() {
  const { port } = await startServer(ROOT);
  const base = `http://127.0.0.1:${port}`;
  session.defaultSession.webRequest.onBeforeRequest({ urls: Object.keys(CDN) }, (details, cb) => {
    const f = CDN[details.url]; if (f && fs.existsSync(path.join(ROOT, "vendor-cdn", f))) return cb({ redirectURL: `${base}/vendor-cdn/${f}` });
    cb({});
  });
  win = new BrowserWindow({ width: 1500, height: 950, backgroundColor: "#f7f8fa", title: "3D-editor Lägesplan", autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(base)) { shell.openExternal(url); return { action: "deny" }; } return { action: "allow" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.session.on("will-download", () => { /* standard: Spara som-dialog */ });
  await win.loadURL(`${base}/lagesplan.html?fristaende=1`);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Arkiv", submenu: [{ label: "Ladda om", accelerator: "CmdOrCtrl+R", click: () => win.reload() }, { label: "Visa i helskärm", accelerator: "F11", click: () => win.setFullScreen(!win.isFullScreen()) }, { type: "separator" }, { role: "quit", label: "Avsluta" }] },
    { label: "Redigera", submenu: [{ role: "undo", label: "Ångra" }, { role: "redo", label: "Gör om" }, { type: "separator" }, { role: "cut", label: "Klipp ut" }, { role: "copy", label: "Kopiera" }, { role: "paste", label: "Klistra in" }] },
    { label: "Visa", submenu: [{ role: "zoomIn", label: "Zooma in" }, { role: "zoomOut", label: "Zooma ut" }, { role: "resetZoom", label: "Normal storlek" }, { role: "toggleDevTools", label: "Utvecklarverktyg" }] },
    { label: "Hjälp", submenu: [{ label: "Om programmet", click: () => dialog.showMessageBox(win, { type: "info", title: "3D-editor Lägesplan", message: "3D-editor Lägesplan", detail: "Fristående läge: allt sparas på den här datorn. Öppna IFC, DXF/DWG och punktmoln via Lager." }) }] }
  ]));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
