/* Egna dialogrutor och notiser (Victor 2026-10-09: "modernt och intuitivt när jag använder det").
   Ersätter webbläsarens grå alert/confirm/prompt med rutor i appens stil:
     uiAlert(text)                       – meddelande (blockerar inte; window.alert pekar hit)
     await uiConfirm(text, { ok, danger }) – true/false; "Ta bort …" får en röd knapp automatiskt
     await uiPrompt(text, standard)        – texten eller null (Avbryt)
     uiToast(text, { action, fn, ms })     – kort notis nere till höger, t.ex. med Ångra
   Första stycket i texten blir rubrik, resten brödtext. Enter = OK, Esc = Avbryt.
   Testerna kan svara på rutorna via window.__uiDialogBridge (test/_dialogs.js). */

let uiDlgQueue = Promise.resolve();

function uiSplitText(text) {
  const parts = String(text ?? "").split(/\n\s*\n/);
  if (parts.length > 1) return { title: parts[0].trim(), body: parts.slice(1).join("\n\n").trim() };
  const t = parts[0].trim();
  // En lång mening: hela som brödtext, ingen rubrik.
  return t.length > 90 ? { title: "", body: t } : { title: t, body: "" };
}
function uiEsc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function uiDialog(kind, text, opts = {}) {
  // Testerna: svara via bryggan i stället för att visa rutan.
  if (typeof window.__uiDialogBridge === "function") {
    return window.__uiDialogBridge(kind, String(text ?? ""), opts.def ?? "").then(r => kind === "confirm" ? !!(r && r.ok) : kind === "prompt" ? (r && r.ok ? String(r.v ?? "") : null) : undefined);
  }
  const run = () => new Promise(resolve => {
    const { title, body } = uiSplitText(text);
    const danger = opts.danger ?? (kind === "confirm" && /^(ta bort|radera|släng)/i.test(String(text).trim()));
    const okText = opts.ok || (kind === "alert" ? "OK" : danger ? "Ta bort" : kind === "prompt" ? "OK" : "Fortsätt");
    const wrap = document.createElement("div");
    wrap.className = "ui-dlg-wrap";
    wrap.innerHTML = `<div class="ui-dlg${danger ? " danger" : ""}" role="${kind === "alert" ? "alertdialog" : "dialog"}" aria-modal="true">
      <div class="ui-dlg-ic">${typeof uiIcon === "function" ? uiIcon(danger ? "trash" : kind === "alert" ? (opts.error ? "alert" : "bulb") : kind === "prompt" ? "pencil" : "help") : ""}</div>
      <div class="ui-dlg-main">
        ${title ? `<div class="ui-dlg-title">${uiEsc(title)}</div>` : ""}
        ${body ? `<div class="ui-dlg-body">${uiEsc(body).replace(/\n/g, "<br>")}</div>` : ""}
        ${kind === "prompt" ? `<input type="text" class="ui-dlg-in" value="${uiEsc(opts.def ?? "")}" autocomplete="off" />` : ""}
        <div class="ui-dlg-btns">${kind === "alert" ? "" : `<button type="button" class="ui-dlg-cancel">${uiEsc(opts.cancel || "Avbryt")}</button>`}<button type="button" class="ui-dlg-ok ${danger ? "danger" : "primary"}">${uiEsc(okText)}</button></div>
      </div></div>`;
    document.body.appendChild(wrap);
    const inp = wrap.querySelector(".ui-dlg-in"), okB = wrap.querySelector(".ui-dlg-ok"), cB = wrap.querySelector(".ui-dlg-cancel");
    const prevFocus = document.activeElement;
    const done = v => {
      document.removeEventListener("keydown", key, true);
      wrap.classList.add("out"); setTimeout(() => wrap.remove(), 120);
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); } catch (e) {}
      resolve(v);
    };
    const ok = () => done(kind === "prompt" ? inp.value : kind === "confirm" ? true : undefined);
    const cancel = () => done(kind === "prompt" ? null : kind === "confirm" ? false : undefined);
    const key = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); }
      else if (e.key === "Enter" && !(e.target && e.target.tagName === "TEXTAREA")) { e.preventDefault(); e.stopImmediatePropagation(); ok(); }
      else if (e.key === "Tab") { const f = [inp, cB, okB].filter(Boolean), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
      else e.stopImmediatePropagation(); // inga kortkommandon bakom rutan
    };
    document.addEventListener("keydown", key, true);
    okB.onclick = ok; if (cB) cB.onclick = cancel;
    wrap.addEventListener("mousedown", e => { if (e.target === wrap && kind !== "prompt") cancel(); });
    requestAnimationFrame(() => { wrap.classList.add("in"); if (inp) { inp.focus(); inp.select(); } else (danger && cB ? cB : okB).focus(); });
  });
  // En ruta i taget.
  const p = uiDlgQueue.then(run, run);
  uiDlgQueue = p.catch(() => {});
  return p;
}
function uiAlert(text, opts = {}) { const s = String(text ?? ""); return uiDialog("alert", s, { error: /kunde inte|fel|misslyck|går inte/i.test(s), ...opts }); }
function uiConfirm(text, opts = {}) { return uiDialog("confirm", text, opts); }
function uiPrompt(text, def = "", opts = {}) { return uiDialog("prompt", text, { ...opts, def }); }
window.alert = text => { uiAlert(text); };

// ---------------------------------------------------------------------
// Notiser nere till höger (en i taget, med valfri knapp som Ångra)
// ---------------------------------------------------------------------
let uiToastTimer = 0;
function uiToast(text, opts = {}) {
  let el = document.getElementById("uiToast");
  if (!el) { el = document.createElement("div"); el.id = "uiToast"; el.className = "ui-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  clearTimeout(uiToastTimer);
  el.innerHTML = `${typeof uiIcon === "function" ? uiIcon(opts.icon || (opts.error ? "alert" : "check")) : ""}<span>${uiEsc(text)}</span>${opts.action ? `<button type="button" class="ui-toast-act">${uiEsc(opts.action)}</button>` : ""}<button type="button" class="ui-toast-x" aria-label="Stäng">${typeof uiIcon === "function" ? uiIcon("x") : "✕"}</button>`;
  el.classList.toggle("error", !!opts.error);
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  const hide = () => el.classList.remove("show");
  const act = el.querySelector(".ui-toast-act");
  if (act) act.onclick = () => { hide(); try { opts.fn && opts.fn(); } catch (e) { console.error(e); } };
  el.querySelector(".ui-toast-x").onclick = hide;
  uiToastTimer = setTimeout(hide, opts.ms || (opts.action ? 7000 : 3500));
}
