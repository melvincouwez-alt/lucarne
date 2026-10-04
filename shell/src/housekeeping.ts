// Cache size kept in check, and the user's own CSS for the pages.

import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "./identity";

function size(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += size(p);
    else {
      try {
        total += fs.statSync(p).size;
      } catch {
        // gone meanwhile
      }
    }
  }
  return total;
}

/**
 * Before the sessions open: past the limit, drop the HTTP, code and GPU caches
 * (of each account). Sign-in, IndexedDB and local storage stay, so Teams
 * starts signed in, just slower the first time.
 */
export function trimCache(userData: string, limitMb: number): void {
  if (!limitMb || limitMb <= 0) return;
  const roots = [userData];
  try {
    for (const p of fs.readdirSync(path.join(userData, "Partitions"))) roots.push(path.join(userData, "Partitions", p));
  } catch {
    // no extra accounts
  }
  const caches = roots.flatMap((r) => ["Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache"].map((c) => path.join(r, c)));
  const total = caches.reduce((n, c) => n + size(c), 0);
  if (total < limitMb * 1024 * 1024) return;
  for (const c of caches) fs.rmSync(c, { recursive: true, force: true });
}

/** The built-in elementary look (assets/elementary.css), read once. */
let elementary: string | null = null;
export function elementaryCss(): string {
  if (elementary === null) {
    try {
      elementary = fs.readFileSync(path.join(__dirname, "..", "assets", "elementary.css"), "utf8");
    } catch {
      elementary = "";
    }
  }
  return elementary;
}

/** ~/.config/lucarne/<app>.css, or "" when there is none. */
export function customCss(appId: string): string {
  try {
    return fs.readFileSync(path.join(CONFIG_DIR, `${appId}.css`), "utf8");
  } catch {
    return "";
  }
}
