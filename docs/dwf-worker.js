/* Läser en DWF i en egen tråd (tar en halv minut för stora filer) så att 3D-vyn inte fryser. */
importScripts("vendor/three/fflate.min.js", "dwf-reader.js");
onmessage = e => {
  try {
    const r = dwfParse(new Uint8Array(e.data.buf), { name: e.data.name, progress: (t, f) => postMessage({ stage: t, f }) });
    const tr = []; r.geoms.forEach(g => { tr.push(g.pos.buffer, g.idx.buffer); });
    postMessage({ r }, tr);
  } catch (err) { postMessage({ error: String(err && err.message || err) }); }
};
