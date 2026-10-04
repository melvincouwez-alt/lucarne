// Meeting mini window, as Teams for Windows has: going elsewhere in Teams
// during a meeting shrinks it to a small floating panel inside the page
// (floating-call-monitor); here that panel moves to a window of its own,
// with an elementary header bar, a pin that keeps it above the others
// (Gala, through src/teams.ts) and Teams' own buttons relayed.
// The window is opened by the page itself (same origin), so the meeting's
// MediaStream plays in it as it is, without being encoded again.
(() => {
  const hub = window.__lucarneTeams;
  if (!hub || hub.mini) return;
  const emit = (type, data) => window.postMessage({ lucarneEvent: { type, ...data } }, "*");
  const MONITOR = '[data-tid="floating-call-monitor"]';
  const control = (id) => document.querySelector(`[data-tid="${id}"], #${id}`);
  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  // Interface strings (src/i18n.ts), set by src/teams.ts before this script.
  const T = (s) => (window.__lucarneStrings && window.__lucarneStrings[s]) || s;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // Teams' in-page panel is hidden while the window shows the meeting.
  const style = document.createElement("style");
  style.textContent = `html.lucarne-mini-on ${MONITOR} { visibility: hidden !important; }`;
  document.head.append(style);

  const ICON = {
    close: '<path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
    pin: '<path d="M9.8 1.8l4.4 4.4-1.1 1.1-.9-.2-2.6 2.6.3 2.6-1.1 1.1-2.4-2.4-3.3 3.3-.9.1.1-.9 3.3-3.3-2.4-2.4 1.1-1.1 2.6.3 2.6-2.6-.2-.9z" fill="currentColor"/>',
    expand: '<path d="M9 2.5h4.5V7M13.5 2.5L8 8M7 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7a1.5 1.5 0 0 0 1.5-1.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    mic: '<rect x="5.75" y="1.5" width="4.5" height="8" rx="2.25" fill="currentColor"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>',
    micOff: '<rect x="5.75" y="1.5" width="4.5" height="8" rx="2.25" fill="currentColor"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M2 2l12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>',
    cam: '<rect x="1.5" y="4" width="9" height="8" rx="1.5" fill="currentColor"/><path d="M11.5 7l3-2v6l-3-2z" fill="currentColor"/>',
    camOff: '<rect x="1.5" y="4" width="9" height="8" rx="1.5" fill="currentColor"/><path d="M11.5 7l3-2v6l-3-2z" fill="currentColor"/><path d="M1.5 1.5l13 13" stroke="#1e1e1e" stroke-width="3"/><path d="M1.5 1.5l13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    hangup: '<path d="M8 6c2.6 0 4.9.8 6.3 2 .3.3.3.8 0 1.1l-1.2 1.2c-.3.3-.7.3-1 .1l-1.6-1a.8.8 0 0 1-.4-.7V7.4A9 9 0 0 0 8 7a9 9 0 0 0-2.1.4v1.3c0 .3-.2.6-.4.7l-1.6 1c-.3.2-.7.2-1-.1L1.7 9.1c-.3-.3-.3-.8 0-1.1C3.1 6.8 5.4 6 8 6z" fill="currentColor"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${ICON[name]}</svg>`;

  const PAGE = `<!doctype html><html lang="${window.__lucarneLang || "fr"}"><head><meta charset="utf-8"><title>${esc(T("Réunion"))}</title><style>
:root { color-scheme: dark; --fg: #fafafa; --dim: #abacae; --accent: #3689e6; --red: #c6262e; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #1e1e1e; color: var(--fg);
  font: 13px/1.3 "Inter Variable", Inter, "Open Sans", sans-serif; -webkit-user-select: none; cursor: default; }
header { height: 38px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 6px;
  background: #2b2b2b; border-bottom: 1px solid rgba(0,0,0,.4); box-shadow: inset 0 1px rgba(255,255,255,.07);
  -webkit-app-region: drag; }
header .end { display: flex; gap: 2px; justify-content: flex-end; }
#title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; text-align: center; }
#title small { font-weight: 400; color: var(--dim); margin-left: 6px; font-variant-numeric: tabular-nums; }
button { -webkit-app-region: no-drag; display: grid; place-items: center; border: 0; border-radius: 6px;
  width: 28px; height: 28px; padding: 0; background: transparent; color: var(--fg); cursor: pointer; }
header button:hover { background: rgba(255,255,255,.1); }
header button:active { background: rgba(255,255,255,.16); }
#pin.on { color: var(--accent); }
#pin.on svg { transform: rotate(-45deg); }
main { position: absolute; inset: 38px 0 0 0; background: #000; }
video { width: 100%; height: 100%; object-fit: contain; display: block; }
#empty { position: absolute; inset: 0; display: none; place-items: center; color: var(--dim); text-align: center; padding: 16px; }
main.empty #empty { display: grid; }
main.empty video { visibility: hidden; }
nav { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: flex; gap: 6px; padding: 5px;
  border-radius: 999px; background: rgba(30,30,30,.82); box-shadow: 0 2px 8px rgba(0,0,0,.4);
  opacity: 0; transition: opacity .15s; }
main:hover nav, nav:focus-within { opacity: 1; }
nav button { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.12); }
nav button:hover { background: rgba(255,255,255,.2); }
nav button.off { background: var(--fg); color: #1e1e1e; }
nav button[hidden] { display: none; }
#hangup { background: var(--red); width: 46px; border-radius: 17px; }
#hangup:hover { background: #d93a42; }
</style></head><body>
<header>
  <div><button id="close" title="${esc(T("Fermer la petite fenêtre"))}">${svg("close")}</button></div>
  <div id="title">${esc(T("Réunion"))}</div>
  <div class="end">
    <button id="expand" title="${esc(T("Revenir à la réunion"))}">${svg("expand")}</button>
    <button id="pin" title="${esc(T("Garder au-dessus des autres fenêtres"))}">${svg("pin")}</button>
  </div>
</header>
<main class="empty">
  <video autoplay muted playsinline></video>
  <div id="empty">${esc(T("Personne n'a la caméra allumée"))}</div>
  <nav>
    <button id="camera" title="${esc(T("Caméra"))}">${svg("cam")}</button>
    <button id="microphone" title="${esc(T("Micro"))}">${svg("mic")}</button>
    <button id="hangup" title="${esc(T("Quitter la réunion"))}">${svg("hangup")}</button>
  </nav>
</main>
</body></html>`;

  let win = null;
  let auto = false;
  let byHand = false;
  let dismissed = false;
  let pinned = false;
  try { pinned = localStorage.getItem("lucarneMiniPinned") === "1"; } catch {}

  // What Teams shows in its panel (it follows the speaker and shared screens),
  // else, opened by hand, a shared screen first, then anyone but me, then me.
  const pick = () => {
    const monitor = document.querySelector(MONITOR);
    const pool = [...(monitor || document).querySelectorAll("video")].filter((v) => v.srcObject && v.readyState >= 2);
    const score = (v) => (/screen|sharing|content/i.test(v.closest("[data-tid]")?.dataset.tid || "") ? 4 : 0)
      + (v.closest('[data-tid="myself-video"]') ? 0 : 2) + area(v) / 1e7;
    return pool.sort((a, b) => score(b) - score(a))[0] || null;
  };
  // Teams' labels say what a click would do: "Activer…" means it is off now.
  const isOff = (button) => /^(activer|réactiver|rétablir|turn on|unmute)/i.test(button?.getAttribute("aria-label") || "");

  const paint = () => {
    if (!win || win.closed) return;
    const d = win.document;
    const title = document.querySelector('[data-tid="call-monitor-title"]')?.innerText.trim() || T("Réunion");
    const time = document.querySelector('[data-tid="call-duration"]')?.innerText.trim() || "";
    const head = d.getElementById("title");
    head.textContent = title;
    if (time) head.append(Object.assign(d.createElement("small"), { textContent: time }));
    if (d.title !== title) d.title = title;
    const video = d.querySelector("video");
    const source = pick();
    if (video.srcObject !== (source?.srcObject ?? null)) video.srcObject = source?.srcObject ?? null;
    d.querySelector("main").classList.toggle("empty", !source);
    for (const [id, on, off] of [["microphone", "mic", "micOff"], ["camera", "cam", "camOff"]]) {
      const theirs = control(`${id === "camera" ? "video" : id}-button`);
      const mine = d.getElementById(id);
      mine.hidden = !theirs;
      const offNow = isOff(theirs);
      mine.classList.toggle("off", offNow);
      mine.innerHTML = svg(offNow ? off : on);
      mine.title = theirs?.getAttribute("aria-label") || "";
    }
    d.getElementById("hangup").hidden = !control("hangup-button");
    d.getElementById("expand").hidden = !document.querySelector(MONITOR);
    d.getElementById("pin").classList.toggle("on", pinned);
  };

  const close = () => {
    document.documentElement.classList.remove("lucarne-mini-on");
    if (win && !win.closed) win.close();
    win = null;
    byHand = false;
  };

  const open = (hand) => {
    if (win && !win.closed) return true;
    win = window.open("about:blank", "lucarne-mini", "width=400,height=270");
    if (!win) return false;
    byHand = hand;
    const d = win.document;
    d.open();
    d.write(PAGE);
    d.close();
    const relay = (id) => () => { control(id)?.click(); setTimeout(paint, 300); };
    d.getElementById("microphone").onclick = relay("microphone-button");
    d.getElementById("camera").onclick = relay("video-button");
    d.getElementById("hangup").onclick = () => { control("hangup-button")?.click(); close(); };
    d.getElementById("close").onclick = () => { dismissed = true; close(); };
    d.getElementById("expand").onclick = () => {
      control("call-monitor-navigate-cw-button")?.click();
      emit("mini-show", {});
      close();
    };
    d.getElementById("pin").onclick = () => {
      pinned = !pinned;
      try { localStorage.setItem("lucarneMiniPinned", pinned ? "1" : "0"); } catch {}
      emit("mini-pin", { on: pinned });
      paint();
    };
    document.documentElement.classList.add("lucarne-mini-on");
    paint();
    if (pinned) setTimeout(() => emit("mini-pin", { on: true }), 400);
    return true;
  };

  setInterval(() => {
    const monitor = document.querySelector(MONITOR);
    if (win && win.closed) {
      // Closed from outside (Alt+F4, the dock): same as its close button.
      win = null;
      document.documentElement.classList.remove("lucarne-mini-on");
      if (monitor) dismissed = true;
    }
    if (!monitor) dismissed = false;
    if (win) {
      // Back in the meeting view, or the meeting is over.
      if ((!monitor && !byHand) || !control("hangup-button")) close();
      else paint();
    } else if (auto && monitor && !dismissed) open(false);
  }, 700);

  hub.mini = {
    auto: (on) => { auto = Boolean(on); if (!auto && win && !byHand) close(); },
    toggle: () => {
      if (win && !win.closed) { close(); dismissed = Boolean(document.querySelector(MONITOR)); return true; }
      if (!pick() && !control("hangup-button")) return false;
      dismissed = false;
      return open(true);
    },
  };
})();
