// Preload for our small windows (assets/panel-*.html): one channel each way,
// scoped to the window by the main process.

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

contextBridge.exposeInMainWorld("lucarnePanel", {
  t,
  send(message: unknown): void {
    ipcRenderer.send("lucarne-panel:message", message);
  },
  onData(callback: (data: unknown) => void): void {
    ipcRenderer.on("lucarne-panel:data", (_event, data: unknown) => callback(data));
    ipcRenderer.send("lucarne-panel:ready");
  },
});
