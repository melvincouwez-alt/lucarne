// Small JSON store in the app profile: window geometry and zoom. A missing
// or broken file gives the defaults.

import fs from "fs";
import path from "path";
import { app } from "electron";

export interface Settings {
  bounds: { x?: number; y?: number; width: number; height: number };
  maximized: boolean;
  zoom: number;
}

const DEFAULTS: Settings = {
  bounds: { width: 1280, height: 860 },
  maximized: false,
  zoom: 0,
};

const file = (): string => path.join(app.getPath("userData"), "settings.json");

let current: Settings | null = null;

export function settings(): Settings {
  if (current) return current;
  try {
    current = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) } as Settings;
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

let saveTimer: NodeJS.Timeout | null = null;

export function saveSettings(patch: Partial<Settings>): void {
  current = { ...settings(), ...patch };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 500);
}

export function flushSettings(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!current) return;
  try {
    // Replaced in one step: a crash mid-write left an empty file and lost the geometry.
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
    fs.renameSync(tmp, file());
  } catch {
    // The profile folder is gone or read-only; keep the values in memory.
  }
}
