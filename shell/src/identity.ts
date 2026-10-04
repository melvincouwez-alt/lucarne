// The seven apps. One Electron process runs per app, so each has its own
// Wayland app_id (lucarne-<id>, matching ~/.local/share/applications/lucarne-<id>.desktop),
// its own dock icon and its own profile folder. The .desktop file, the app_id,
// the notification desktop-entry hint and the dock badge all name the same file.

import fs from "fs";
import os from "os";
import path from "path";

export type AppId = "word" | "excel" | "powerpoint" | "onenote" | "outlook" | "teams" | "powerbi";

export interface AppInfo {
  id: AppId;
  name: string;
  home: string;
  /** Header bar colours (elementary palette, matching the icon): top and bottom of the gradient, dark edge. */
  brand: [string, string, string];
  /** Documents open one window each; the others keep a single window. */
  documents: boolean;
}

export const APPS: Record<AppId, AppInfo> = {
  word: { id: "word", name: "Word", home: "https://www.office.com/launch/word?auth=2",
    brand: ["#3689e6", "#0d52bf", "#002e99"], documents: true },
  excel: { id: "excel", name: "Excel", home: "https://www.office.com/launch/excel?auth=2",
    brand: ["#68b723", "#3a9104", "#206b00"], documents: true },
  powerpoint: { id: "powerpoint", name: "PowerPoint", home: "https://www.office.com/launch/powerpoint?auth=2",
    brand: ["#f37329", "#cc3b02", "#a62100"], documents: true },
  onenote: { id: "onenote", name: "OneNote", home: "https://www.office.com/launch/onenote?auth=2",
    brand: ["#de3e80", "#bc245d", "#910e38"], documents: false },
  outlook: { id: "outlook", name: "Outlook", home: "https://outlook.office.com/mail/",
    brand: ["#28bca3", "#0e9a83", "#007367"], documents: false },
  teams: { id: "teams", name: "Teams", home: "https://teams.microsoft.com/v2/",
    brand: ["#a56de2", "#7239b3", "#452981"], documents: false },
  powerbi: { id: "powerbi", name: "Power BI", home: "https://app.powerbi.com/home",
    brand: ["#e6a520", "#ad5f00", "#7a4100"], documents: false },
};

export function isAppId(value: string): value is AppId {
  return Object.prototype.hasOwnProperty.call(APPS, value);
}

/** --lucarne-app=<id> on the command line; Word when missing. */
export function appFromArgv(argv: string[]): AppInfo {
  for (const arg of argv) {
    const m = arg.match(/^--lucarne-app=(\w+)$/);
    if (m && isAppId(m[1])) return APPS[m[1]];
  }
  return APPS.word;
}

export const desktopId = (app: AppInfo): string => `lucarne-${app.id}`;

// Former project name (m365-linux): its folders, signed-in profiles included,
// are taken over as they are on the first start.
for (const [from, to] of [[".config/m365-linux", ".config/lucarne"], [".local/share/m365-linux", ".local/share/lucarne"],
  [".cache/m365-linux", ".cache/lucarne"]]) {
  const a = path.join(os.homedir(), from), b = path.join(os.homedir(), to);
  try {
    if (fs.statSync(a).isDirectory() && !fs.existsSync(b)) fs.renameSync(a, b);
  } catch { /* nothing to move */ }
}

const runnable = (file: string): boolean => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * A command of the desktop side (bin/): the autostart PATH may lack ~/.local/bin.
 * Order: ~/.local/bin (install.sh), the copy inside the package
 * (resources/desktop/bin), /usr/bin, then the bare name through PATH.
 */
export function command(name: string): string {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    path.join(os.homedir(), ".local", "bin", name),
    ...(resources ? [path.join(resources, "desktop", "bin", name)] : []),
    path.join("/usr/bin", name),
  ];
  return candidates.find(runnable) ?? name;
}

export const CONFIG_DIR = path.join(os.homedir(), ".config", "lucarne");
export const DATA_DIR = path.join(os.homedir(), ".local", "share", "lucarne");
