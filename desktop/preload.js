/* Brygga till disken för skrivbordsprogrammet (bara dessa tre funktioner): spara och läsa en fil i Dokument\\3D-editor Lägesplan, och öppna mappen. */
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktopDisk", {
  save: (name, buf) => ipcRenderer.invoke("disk-save", name, buf),
  load: name => ipcRenderer.invoke("disk-load", name),
  folder: () => ipcRenderer.invoke("disk-folder"),
});
