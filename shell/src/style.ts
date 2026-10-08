// Light elementary touch on Microsoft's pages: Inter in place of Segoe UI,
// the system accent in place of Microsoft blue (Outlook and Teams, whose
// Fluent UI reads its brand colours from CSS variables), thin scrollbars.
// Kept shallow on purpose: Microsoft renames its classes often.

import { execFileSync } from "child_process";
import type { AppInfo } from "./identity";

const ACCENTS: Record<string, string> = {
  strawberry: "#c6262e", orange: "#f37329", banana: "#f9c440", lime: "#68b723",
  mint: "#28bca3", blueberry: "#3689e6", grape: "#a56de2", bubblegum: "#de3e80",
  cocoa: "#8a715e", slate: "#667885",
};

/** elementary's accent, from the stylesheet name (io.elementary.stylesheet.<colour>). */
export function systemAccent(): string {
  try {
    const theme = execFileSync("gsettings", ["get", "org.gnome.desktop.interface", "gtk-theme"], { encoding: "utf8" });
    const name = theme.trim().replace(/'/g, "").split(".").pop() ?? "";
    return ACCENTS[name] ?? ACCENTS.blueberry;
  } catch {
    return ACCENTS.blueberry;
  }
}

/** Fluent UI colour variables that carry Microsoft's brand colour. */
const BRAND_VARS = ["--colorBrandBackground", "--colorBrandBackgroundHover", "--colorBrandBackgroundPressed",
  "--colorBrandBackgroundSelected", "--colorCompoundBrandBackground", "--colorCompoundBrandBackgroundHover",
  "--colorCompoundBrandStroke", "--colorBrandStroke1", "--colorBrandForeground1", "--colorBrandForeground2",
  "--colorCompoundBrandForeground1", "--colorBrandForegroundLink", "--colorNeutralForeground2BrandHover",
  "--colorNeutralForeground2BrandSelected"];
/** Brand background of Teams and Outlook, light and dark. Other themes are left alone. */
const BRAND_DEFAULTS = ["#5b5fc7", "#4f52b2", "#0f6cbd", "#115ea3"];

/**
 * The system accent in place of Microsoft blue, for Outlook and Teams.
 * Each FluentProvider carries its own theme; some are inverted on purpose
 * (Teams' quick reply box, where the "brand" colour is white). Only the
 * providers still on Microsoft's default brand get the accent, so a CSS rule
 * on every provider is not enough: the script reads each one first.
 */
export function brandScript(app: AppInfo, accent: string | null): string | null {
  if (app.id !== "outlook" && app.id !== "teams") return null;
  return `((accent) => {
  const VARS = ${JSON.stringify(BRAND_VARS)};
  const DEFAULTS = new Set(${JSON.stringify(BRAND_DEFAULTS)});
  // Each provider is painted once per accent: rewriting its inline style on
  // every page change restyled the whole of Teams many times a second.
  const paint = (el) => {
    const want = accent || "";
    if (el.dataset.lucarnePainted === want) return;
    if (el.dataset.lucarneBrand === undefined)
      el.dataset.lucarneBrand = getComputedStyle(el).getPropertyValue("--colorBrandBackground").trim().toLowerCase();
    const ours = accent && DEFAULTS.has(el.dataset.lucarneBrand);
    for (const v of VARS) ours ? el.style.setProperty(v, accent, "important") : el.style.removeProperty(v);
    el.dataset.lucarnePainted = want;
  };
  const all = () => document.querySelectorAll(".fui-FluentProvider").forEach(paint);
  window.__lucarneAccent = accent;
  all();
  let watch = window.__lucarneBrandObserver;
  if (!watch) {
    let queued = false;
    watch = window.__lucarneBrandObserver = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        accent = window.__lucarneAccent;
        all();
      }, 500);
    });
  }
  // Without the accent there is nothing to paint on new providers: no watch.
  if (accent) watch.observe(document.documentElement, { childList: true, subtree: true });
  else watch.disconnect();
})(${JSON.stringify(accent)});`;
}

const SEGOE = ["Segoe UI", "Segoe UI Web (West European)", "Segoe UI Web", "Segoe UI Variable",
  "Segoe UI Variable Text", "Segoe UI Variable Display"];

export function pageCss(): string {
  const fonts = SEGOE.flatMap((family) => [300, 400, 600, 700].map((weight) =>
    `@font-face{font-family:"${family}";src:local("Inter Variable"),local("Inter");font-weight:${weight};font-style:normal}`)).join("");
  // The header bar's drag area sits under this page; with fractional scaling
  // on Wayland, Electron can let it reach into the page's top bar.
  return `${fonts}
html, body { -webkit-app-region: no-drag; }
::-webkit-scrollbar { width: 12px; height: 12px; background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,.3); border: 4px solid transparent; border-radius: 6px; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background-color: rgba(0,0,0,.45); border-width: 3px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
@media (prefers-color-scheme: dark) {
  ::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,.3); }
  ::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,.45); }
}`;
}
