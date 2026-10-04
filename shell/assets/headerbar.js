// Lucarne header bar. State arrives from src/window.ts through the preload
// (window.lucarneHeader); clicks go back as one of a fixed set of actions.
(function () {
  "use strict";
  var bridge = window.lucarneHeader;
  // Interface strings (src/i18n.ts) through the preload; French without it.
  var t = bridge && bridge.t ? bridge.t : function (s) { return s; };
  var root = document.documentElement;
  var SVG_NS = "http://www.w3.org/2000/svg";

  // 16px symbolic glyphs in the style of elementary's icon set. Entries with
  // stroke: true are drawn as lines rather than filled.
  var ICONS = {
    back: { d: "M10.3 2.6 11.4 3.7 7.1 8l4.3 4.3-1.1 1.1L4.9 8z" },
    forward: { d: "M5.7 2.6 4.6 3.7 8.9 8l-4.3 4.3 1.1 1.1L11.1 8z" },
    reload: { stroke: true, d: "M13.2 8.4A5.25 5.25 0 1 1 11.6 4.2M12.2 1.8v2.9H9.3" },
    stop: { d: "M4.1 3 8 6.9 11.9 3 13 4.1 9.1 8l3.9 3.9-1.1 1.1L8 9.1 4.1 13 3 11.9 6.9 8 3 4.1z" },
    home: { stroke: true, d: "M2.2 7.6 8 2.5l5.8 5.1M4 6.4v6.85h3V9.8h2v3.45h3V6.4" },
    external: { stroke: true, d: "M9.5 2.5h4v4M13.3 2.7 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" },
    menu: { d: "M2 3.5h12V5H2zm0 3.75h12v1.5H2zM2 11h12v1.5H2z" },
  };

  function icon(name) {
    var spec = ICONS[name];
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    if (spec.stroke) svg.setAttribute("class", "stroke");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", spec.d);
    svg.appendChild(path);
    return svg;
  }

  function setIcon(button, name) {
    if (button.dataset.icon === name) return;
    button.dataset.icon = name;
    button.replaceChildren(icon(name));
  }

  function $(id) { return document.getElementById(id); }

  document.querySelectorAll("button[data-action]").forEach(function (button) {
    if (ICONS[button.dataset.action]) setIcon(button, button.dataset.action);
    button.addEventListener("click", function () {
      if (!bridge) return;
      var r = button.getBoundingClientRect();
      bridge.send(button.dataset.action, r.left, r.bottom + 4);
    });
  });

  function applyState(state) {
    if (typeof state !== "object" || state === null) return;
    // Brand colours of the app, or elementary's neutral bar
    if (state.brand && state.brand.length === 3) {
      root.style.setProperty("--app-top", state.brand[0]);
      root.style.setProperty("--app-bottom", state.brand[1]);
      root.style.setProperty("--app-edge", state.brand[2]);
    }
    document.body.classList.toggle("tint", !!state.tint);
    if (state.app) {
      var img = $("appicon");
      var src = "icons/" + state.app + ".png";
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    }
    var title = state.title || state.name || "Lucarne";
    document.title = title;
    $("title").textContent = title;
    $("subtitle").textContent = state.subtitle || "";
    $("subtitle").hidden = !state.subtitle;
    $("back").disabled = !state.canGoBack;
    $("forward").disabled = !state.canGoForward;
    var reload = $("reload");
    setIcon(reload, state.loading ? "stop" : "reload");
    reload.title = t(state.loading ? "Arrêter" : "Actualiser (F5)");
    document.body.classList.toggle("loading", !state.revealed);
    document.body.classList.toggle("failed", !!state.failed);
    $("error").hidden = !state.failed;
    // Nothing marks the shared screen on Wayland, so the header says it
    var sharing = $("sharing");
    sharing.hidden = !state.sharing;
    $("sharing-label").textContent = t(state.sharing === "window" ? "Fenêtre partagée" : state.sharing === "browser" ? "Onglet partagé" : "Écran partagé");
  }

  if (bridge) bridge.onState(applyState);
})();
