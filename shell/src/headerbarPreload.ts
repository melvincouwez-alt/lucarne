// Preload for the header bar page. One send() limited to the header actions,
// one state subscription; nothing else crosses the bridge.

import { contextBridge, ipcRenderer } from "electron";

// Interface language (src/i18n.ts): the dictionary comes from the main
// process; elements marked data-i18n, and title / placeholder attributes,
// are translated once the page is parsed. A sandboxed preload cannot load
// src/i18n.ts itself, hence this small copy of t().
const i18n = (ipcRenderer.sendSync("lucarne-i18n") ?? { lang: "fr", strings: {} }) as { lang: string; strings: Record<string, string> };
const t = (fr: string, vars?: Record<string, string | number>): string => {
  const text = i18n.strings[fr] ?? fr.split("|")[0];
  return vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : text;
};
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.lang = i18n.lang;
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n || (el.textContent ?? "").trim());
  for (const attr of ["title", "placeholder", "alt"])
    for (const el of document.querySelectorAll<HTMLElement>(`[${attr}]`)) {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, t(value));
    }
});

const ACTIONS = new Set(["back", "forward", "reload", "home", "menu", "retry", "external", "stopshare"]);

contextBridge.exposeInMainWorld("lucarneHeader", {
  t,
  send(action: string, x?: number, y?: number): void {
    if (!ACTIONS.has(action)) return;
    const point = Number.isFinite(x) && Number.isFinite(y) ? [Math.round(x as number), Math.round(y as number)] : null;
    ipcRenderer.send("lucarne-header:action", action, point);
  },
  onState(callback: (state: unknown) => void): void {
    ipcRenderer.on("lucarne-header:state", (_event, state: unknown) => callback(state));
    ipcRenderer.send("lucarne-header:ready");
  },
});
