/* Gemensamt ikonsystem (Victor 2026-10-09: "premium känsla i varje meny och verktyg").
   Menyerna har vuxit fram en i taget och fått emoji som ikoner (🗑️ 💾 📐 …) i olika stilar.
   Här ritas samma sak som raka linjeikoner (24 × 24, 2 px linje, som 3D-vyn och utskriften),
   i en enda tabell. Emoji först i en knapp, rubrik, flik eller etikett byts automatiskt mot
   ikonen – även i menyer som byggs senare (MutationObserver). Texten i övrigt lämnas orörd,
   och innehåll (planen, utskriftsbladet, väder, fritext) rörs aldrig.
   uiIcon(name) ger en <svg> som sträng för den som bygger HTML själv. */

const UI_ICON_PATHS = {
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  setsquare: '<path d="M4 20V4l16 16z"/><path d="M8 16h4l-4-4z"/>',
  ruler: '<path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z"/><path d="m7.5 10.5 2 2M10.5 7.5l2 2M13.5 4.5l2 2M4.5 13.5l2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  rotccw: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotcw: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  truck: '<path d="M1 4h14v12H1zM15 8h4l4 4v4h-8z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>',
  satellite: '<path d="m13 7-4-4-4 4 4 4M17 11l4 4-4 4-4-4M8 12l4 4 6-6-4-4zM16 8l3-3M9 21a6 6 0 0 0-6-6"/>',
  zones: '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3z"/><path d="M13 13h8v8h-8z" stroke-dasharray="2 2"/>',
  crew: '<path d="M2 18h20M4 18v-2a8 8 0 0 1 16 0v2M10 8V5h4v3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  crane: '<path d="M6 22V3M6 3l14 4M6 7h14M18 7v5M16 12h4M2 22h8M6 11l4-4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22"/>',
  hook: '<path d="M12 2v9"/><path d="M12 11a4 4 0 1 1-4 4"/><path d="M9 2h6"/>',
  shapes: '<path d="M8.3 10a.7.7 0 0 1-.6-1l3.7-6.4a.7.7 0 0 1 1.2 0L16.3 9a.7.7 0 0 1-.6 1z"/><path d="M3 14h7v7H3z"/><circle cx="17.5" cy="17.5" r="3.5"/>',
  swap: '<path d="m7 4-4 4 4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
  package: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  pentagon: '<path d="M12 3 21 9.6 17.5 20h-11L3 9.6z"/>',
  film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 12h20M2 7.5h5M2 16.5h5M17 7.5h5M17 16.5h5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  files: '<path d="M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5M4 8v12a2 2 0 0 0 2 2h10"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 15h8"/>',
  door: '<path d="M4 22h16M6 22V3h12v19"/><path d="M14 12h.01"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4V3H6zM14 7h4V3h-4z"/>',
  palette: '<path d="M12 22a10 10 0 1 1 10-10c0 3-2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.7 1.7 0 0 1 12 22z"/><path d="M7.5 11h.01M10 7h.01M15 7h.01M17.5 11h.01"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  brush: '<path d="m9.1 11.1 8.9-8.9a1.9 1.9 0 0 1 2.8 2.8l-8.9 8.9"/><path d="M7 14c-1.7 0-3 1.3-3 3 0 1.3-1 2-2 2 1 1.5 3 2 4 2 2.2 0 4-1.8 4-4 0-1.7-1.3-3-3-3z"/>',
  updown: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 18h.01"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
  building: '<path d="M4 22V2h12v20M16 8h4v14M2 22h20M8 6h4M8 10h4M8 14h4M8 18h4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M20 17v5H6.5A2.5 2.5 0 0 1 4 19.5"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  chart: '<path d="M3 3v18h18M7 16v-5M12 16V8M17 16v-8"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  dashed: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  locate: '<circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="2"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M16 10l-2 2 2 2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  fence: '<path d="M4 3v18M10 3v18M16 3v18M2 8h18M2 15h18"/>',
  symbol: '<path d="M8.3 10a.7.7 0 0 1-.6-1l3.7-6.4a.7.7 0 0 1 1.2 0L16.3 9a.7.7 0 0 1-.6 1z"/><path d="M3 14h7v7H3z"/><circle cx="17.5" cy="17.5" r="3.5"/>',
  cube: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
};

/* Emoji (och några tecken) som används som ikoner i menyerna -> ikonnamn. Väder, fordonssymbolers
   innehåll m.m. finns medvetet inte här och lämnas som de är. */
const UI_EMOJI = {
  "⚠": "alert", "📍": "pin", "📐": "setsquare", "📏": "ruler", "✓": "check", "✔": "check", "🔒": "lock", "🔓": "unlock",
  "✕": "x", "✖": "x", "🗑": "trash", "💾": "save", "📷": "camera", "📸": "camera", "↺": "rotccw", "↻": "rotcw", "🗺": "map",
  "🎯": "target", "✏": "pencil", "🚚": "truck", "🚛": "truck", "🚐": "truck", "🛰": "satellite", "🟧": "zones", "👷": "users",
  "📄": "file", "🗂": "layers", "🏗": "crane", "💬": "message", "👁": "eye", "🙈": "eyeoff", "🪝": "hook", "🧩": "symbol",
  "⇆": "swap", "⇄": "swap", "↶": "undo", "↷": "redo", "📦": "package", "⛔": "ban", "⬠": "pentagon", "🎬": "film",
  "📅": "calendar", "🗓": "calendar", "🖼": "image", "🛡": "shield", "🧊": "box", "🔷": "cube", "📑": "files", "📁": "folder",
  "🏠": "home", "➡": "route", "🖨": "printer", "✂": "scissors", "⌨": "keyboard", "🚪": "door", "🧲": "magnet", "🎨": "palette",
  "📋": "clipboard", "📤": "upload", "🔎": "search", "🔍": "search", "💡": "bulb", "🧭": "compass", "☰": "menu", "⚙": "settings",
  "⏹": "stop", "🏷": "tag", "📝": "note", "🖌": "brush", "⇕": "updown", "📱": "phone", "⏱": "timer", "🏢": "building",
  "🕘": "history", "📚": "library", "⭐": "star", "📊": "chart", "🔤": "type", "🖥": "monitor", "✋": "hand", "⏸": "pause",
  "↔": "move", "⟳": "rotcw", "⟲": "rotccw", "▶": "play", "◀": "chevL", "⏵": "play", "⎘": "copy", "⧉": "copy", "＋": "plus", "⬚": "dashed", "〰": "fence", "⤢": "maximize", "▭": "dashed",
};
const UI_EMOJI_RE = new RegExp("^(\\s*)(" + Object.keys(UI_EMOJI).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\uFE0F?(?:\\s+|$)", "u");

function uiIcon(name, cls = "") {
  const p = UI_ICON_PATHS[name];
  return p ? `<svg class="ui-ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : "";
}
const UI_TMPL = document.createElement("template");
function uiIconNode(name) { UI_TMPL.innerHTML = uiIcon(name); return UI_TMPL.content.firstChild; }

/* Var ikoner får sättas: menyernas knappar, rubriker, flikar och etiketter. */
const UI_ICON_TARGETS = "button, summary, a, label, .si, .ti, i, b, h1, h2, h3, .sub-head, .field-label, .cad-exp-l, .v3-pop-l, .pb-lead, .pr-sec-h, .ui-icon-lead, .layer-row .ln, .stor-h, .dp-head, .sp-nav b, .kr > span:first-child, .ui-icon-lead, #tip, #siteHint, .dq-c, .dp-chips button, .v3-handles span, .hint";
/* Aldrig: innehåll och fritext. */
const UI_ICON_SKIP = "canvas, select, option, textarea, input, [contenteditable], [data-noicon], .v3-label, #v3Labels, .wx, .wx-box, .lp-label, .note-text, .zl-text";

function uiIconizeEl(el) {
  if (!el || el.nodeType !== 1 || el.closest(UI_ICON_SKIP)) return;
  // Första texten i elementet (efter t.ex. en kryssruta) – bara om den börjar med en ikon-emoji.
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = w.nextNode())) { if (t.nodeValue.trim()) break; }
  if (!t) return;
  const m = UI_EMOJI_RE.exec(t.nodeValue);
  if (!m) return;
  let name = UI_EMOJI[m[2]];
  // ▶ ensam i en knapp = nästa (pil), ▶ före text (Spela upp, Förhandsvisa) = spela.
  if (m[2] === "▶" && !t.nodeValue.slice(m[0].length).trim()) name = "chevR";
  if (!name || !UI_ICON_PATHS[name]) return;
  const rest = t.nodeValue.slice(m[0].length);
  t.parentNode.insertBefore(uiIconNode(name), t);
  t.nodeValue = rest;
  // Bara ikonen kvar (t.ex. <i>💬</i> eller en ikonknapp): markera för stilen.
  if (!rest.trim() && t.parentNode === el && el.childNodes.length <= 2) el.classList.add("ui-ic-only");
}
function uiIconize(root) {
  if (!root) return;
  if (root.nodeType === 3) { uiIconizeEl(root.parentElement && root.parentElement.closest(UI_ICON_TARGETS)); return; }
  if (root.nodeType !== 1) return;
  if (root.matches && root.matches(UI_ICON_TARGETS)) uiIconizeEl(root);
  root.querySelectorAll(UI_ICON_TARGETS).forEach(uiIconizeEl);
}
/* Nya och ändrade menyer får samma ikoner (knappar som byter text, popupfönster m.m.). */
(function uiIconsStart() {
  let queue = new Set(), raf = 0;
  const flush = () => { raf = 0; const q = queue; queue = new Set(); q.forEach(n => { if (n.isConnected) uiIconize(n); }); };
  const start = () => {
    uiIconize(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") queue.add(m.target);
        else m.addedNodes.forEach(n => { if (n.nodeType === 1 || n.nodeType === 3) queue.add(n); });
      }
      // Direkt i samma mikrouppgift: ingen blinkande emoji innan ikonen kommer.
      if (!raf) { raf = 1; queueMicrotask(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

// ---------------------------------------------------------------------
// Samma ikoner på duken (planens etiketter, PDF och utskrift): Path2D av SVG-banorna.
// ---------------------------------------------------------------------
const UI_P2D = new Map();
function uiPath2D(name) {
  if (UI_P2D.has(name)) return UI_P2D.get(name);
  const src = UI_ICON_PATHS[name];
  if (!src || typeof Path2D === "undefined") return null;
  const parts = [];
  const attr = (tag, a) => { const m = new RegExp(`\\b${a}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
  (src.match(/<(path|circle|rect)\b[^>]*>/g) || []).forEach(tag => {
    if (tag.startsWith("<path")) { const d = attr(tag, "d"); if (d) parts.push(d); return; }
    if (tag.startsWith("<circle")) { const cx = +attr(tag, "cx"), cy = +attr(tag, "cy"), r = +attr(tag, "r"); parts.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`); return; }
    const x = +attr(tag, "x"), y = +attr(tag, "y"), w = +attr(tag, "width"), h = +attr(tag, "height"), r = Math.min(+(attr(tag, "rx") || 0), w / 2, h / 2);
    parts.push(r ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z` : `M${x} ${y}h${w}v${h}h${-w}z`);
  });
  let p = null;
  try { p = new Path2D(parts.join(" ")); } catch (e) { p = null; }
  UI_P2D.set(name, p);
  return p;
}
/* Ritar ikonen med mitten i (cx, cy) och storleken size (px). */
function uiCanvasIcon(ctx, name, cx, cy, size, color) {
  const p = uiPath2D(name);
  if (!p) return false;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]);
  ctx.stroke(p);
  ctx.restore();
  return true;
}
/* "📦 Upplag" -> { name: "package", rest: "Upplag" } (eller null om raden inte börjar med en ikon). */
function uiLeadIcon(line) {
  const m = UI_EMOJI_RE.exec(String(line || ""));
  if (!m || !UI_EMOJI[m[2]]) return null;
  return { name: UI_EMOJI[m[2]], rest: String(line).slice(m[0].length) };
}
/* Text utan ikon-emoji (för rullistor, statusrader och filnamn där en ikon inte kan visas). */
function uiStripEmoji(text) {
  return String(text || "").replace(new RegExp(UI_EMOJI_RE.source.replace("^(\\s*)", "(^|\\s)"), "gu"), "$1").replace(/[\u{1F300}-\u{1FAFF}️]/gu, "").replace(/\s{2,}/g, " ").trim();
}
