// Where an address belongs. Microsoft 365 pages stay in the app; a document
// or page of another app goes to that app (through the lucarne launcher, so it
// lands in the right process and dock icon); everything else goes to the
// default browser.

import { spawn } from "child_process";
import { shell } from "electron";
import { command, type AppId } from "./identity";

const EXT: Record<string, string[]> = {
  word: ["doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "rtf"],
  excel: ["xls", "xlsx", "xlsm", "xlsb", "xlt", "xltx", "xltm", "ods", "csv"],
  powerpoint: ["ppt", "pptx", "pptm", "pps", "ppsx", "pot", "potx", "odp"],
  onenote: ["one", "onetoc2", "onepkg"],
};
const LETTER: Record<string, AppId> = { w: "word", x: "excel", p: "powerpoint", o: "onenote" };

/**
 * Hosts that stay inside any of the apps: sign-in, Office pages, SharePoint,
 * OneDrive, Outlook, Teams, Power BI. A name matches itself and its
 * subdomains. Microsoft's other sites (support, docs, store, aka.ms links)
 * go to the browser: "microsoft.com" and "live.com" are not listed whole.
 */
const INSIDE = [
  // sign-in (work or school, personal, seamless SSO, security info set-up)
  "login.microsoftonline.com", "microsoftonline.com", "microsoftonline-p.com", "login.microsoft.com",
  "login.windows.net", "login.live.com", "account.live.com", "signup.live.com", "autologon.microsoftazuread-sso.com",
  "mysignins.microsoft.com", "myaccount.microsoft.com", "account.activedirectory.windowsazure.com",
  "msauth.net", "msftauth.net", "msauthimages.net",
  // Office, SharePoint, OneDrive
  "office.com", "office.net", "office365.com", "cloud.microsoft", "microsoft365.com", "msocdn.com",
  "sharepoint.com", "officeapps.live.com", "onedrive.live.com", "onedrive.com", "1drv.ms", "1drv.com",
  "microsoftpersonalcontent.com", "storage.live.com", "livefilestore.com", "onenote.com",
  // Outlook
  "outlook.office.com", "outlook.office365.com", "outlook.live.com", "outlook.com",
  // Teams
  "teams.microsoft.com", "teams.live.com", "skype.com",
  // Power BI, Fabric
  "powerbi.com", "fabric.microsoft.com",
];

/**
 * Pages of each app that may use the microphone, the camera, screen capture
 * and the clipboard. Third-party frames (Teams apps, Outlook add-ins, Power BI
 * visuals) get none of these.
 */
const OFFICE = ["office.com", "cloud.microsoft", "microsoft365.com", "sharepoint.com", "officeapps.live.com",
  "onedrive.live.com", "onedrive.com"];
const DEVICES: Record<AppId, string[]> = {
  word: OFFICE,
  excel: OFFICE,
  powerpoint: OFFICE,
  onenote: OFFICE,
  outlook: [...OFFICE, "outlook.office.com", "outlook.office365.com", "outlook.live.com"],
  teams: [...OFFICE, "teams.microsoft.com", "teams.live.com", "skype.com"],
  powerbi: [...OFFICE, "powerbi.com", "fabric.microsoft.com"],
};

export function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const hostIn = (host: string, list: string[]): boolean =>
  list.some((h) => host === h || host.endsWith(`.${h}`));

export function isInside(url: string): boolean {
  const u = parse(url);
  return !!u && hostIn(u.hostname, INSIDE);
}

/** An https page of this app that may use devices and read the clipboard. */
export function mayUseDevices(app: AppId, url: string): boolean {
  const u = parse(url);
  return !!u && u.protocol === "https:" && hostIn(u.hostname, DEVICES[app]);
}

/** Same rules as app_for_url() in bin/lucarne. */
export function appFor(url: string): AppId | null {
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname;
  const q = u.searchParams;
  if (/(^|\.)outlook\.(office|office365|live)\.com$/.test(host) || host === "outlook.cloud.microsoft") return "outlook";
  if (["teams.microsoft.com", "teams.cloud.microsoft", "teams.live.com"].includes(host)) return "teams";
  if (["app.powerbi.com", "app.fabric.microsoft.com"].includes(host)) return "powerbi";
  for (const a of ["word", "excel", "powerpoint", "onenote"] as AppId[]) {
    if (host === `${a}.cloud.microsoft` || host === `${a}.office.com`) return a;
    if (host.endsWith(".officeapps.live.com") && host.startsWith(a)) return a;
  }
  if (host.endsWith(".sharepoint.com") || host === "onedrive.live.com" || host === "1drv.ms") {
    const m = u.pathname.match(/^\/:?([wxpo]):?\//);
    if (m) return LETTER[m[1]];
    if (/\/_layouts\/15\/(Doc|WopiFrame|WopiFrame2)\.aspx$/i.test(u.pathname) ||
        (host === "onedrive.live.com" && ["/edit", "/edit.aspx", "/view.aspx"].includes(u.pathname))) {
      const name = q.get("file") || q.get("resid") || "";
      const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      for (const [a, list] of Object.entries(EXT)) if (list.includes(ext)) return a as AppId;
      if ((q.get("wd") || "").startsWith("target(")) return "onenote";
    }
  }
  return null;
}

/** Fragment marker the Chrome extension looks for: this tab is not to be sent back to the app. */
export const BROWSER_MARK = "lucarne-browser";

/** url#lucarne-browser, or url#hash&lucarne-browser when it already has a hash. */
export function markForBrowser(href: string): string {
  const base = href.endsWith("#") ? href.slice(0, -1) : href;
  if (new URL(base).hash.slice(1).split("&").includes(BROWSER_MARK)) return base;
  return base.includes("#") ? `${base}&${BROWSER_MARK}` : `${base}#${BROWSER_MARK}`;
}

/**
 * Open an http(s) address in the default browser; anything else is refused.
 * Microsoft 365 addresses carry the marker, otherwise the extension would
 * hand them straight back to the app.
 */
export function openExternal(url: string): void {
  const u = parse(url);
  if (!u) return;
  const href = isInside(u.href) || appFor(u.href) ? markForBrowser(u.href) : u.href;
  void shell.openExternal(href).catch(() => undefined);
}

/**
 * Hand an address to another app through the launcher. "lucarne link" goes
 * where the user set that app to open (online, or the Windows VM).
 */
export function openInApp(app: AppId, url: string): void {
  const u = parse(url);
  if (!u) return;
  const child = spawn(command("lucarne"), ["link", app, u.href], { detached: true, stdio: "ignore" });
  child.on("error", () => openExternal(u.href));
  child.unref();
}

/** First http(s) argument on the command line, if any; Microsoft 365 addresses go over https. */
export function urlFrom(argv: string[]): string | null {
  for (const arg of argv) {
    if (!/^https?:\/\//i.test(arg)) continue;
    const u = parse(arg);
    if (!u) continue;
    if (u.protocol === "http:" && isInside(u.href)) u.protocol = "https:";
    return u.href;
  }
  return null;
}
