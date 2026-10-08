// Cache size kept in check, and the user's own CSS for the pages.

import fs from "fs";
import path from "path";
import { CONFIG_DIR } from "./identity";

async function size(dir: string): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    const p = path.join(dir, e.name);
    // a file gone meanwhile counts for nothing
    total += e.isDirectory() ? await size(p) : await fs.promises.stat(p).then((st) => st.size, () => 0);
  }
  return total;
}

/** Share of the limit the HTTP cache gets, kept by Chromium (--disk-cache-size, src/main.ts). */
export const HTTP_SHARE = 0.75;

/** The HTTP cache ("Cache"), or the code and GPU caches, of the main session and of each extra account. */
function caches(userData: string, http: boolean): string[] {
  const roots = [userData];
  try {
    for (const p of fs.readdirSync(path.join(userData, "Partitions"))) roots.push(path.join(userData, "Partitions", p));
  } catch {
    // no extra accounts
  }
  const names = http ? ["Cache"] : ["Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache"];
  return roots.flatMap((r) => names.map((c) => path.join(r, c)));
}

const total = async (dirs: string[]): Promise<number> => (await Promise.all(dirs.map(size))).reduce((n, s) => n + s, 0);

/**
 * Caches kept under the limit. Chromium holds the HTTP cache, the bulk of it,
 * under 3/4 of the limit and drops its oldest entries itself. When all the
 * caches together still pass the limit, the code and GPU caches go at the next
 * start, before the sessions open, and the HTTP cache too if it alone passes
 * the limit (several accounts). Sign-in, IndexedDB and local storage stay.
 * The size is measured a minute after start, off the start-up path (Teams'
 * 8,000 cache files took 50 ms of every start); a mark file holds the verdict.
 * ponytail: measured once per run, so a cache that grows past the limit during
 * a long run, or a lowered limit, is cleared one start later.
 */
export function trimCache(userData: string, limitMb: number): void {
  if (!limitMb || limitMb <= 0) return;
  const mark = path.join(userData, "cache-over-limit");
  let verdict: string | null = null;
  try {
    verdict = fs.readFileSync(mark, "utf8");
  } catch {
    // nothing to clear
  }
  if (verdict !== null) {
    const dirs = [...caches(userData, false), ...(verdict === "all" ? caches(userData, true) : [])];
    for (const c of dirs) fs.rmSync(c, { recursive: true, force: true });
    fs.rmSync(mark, { force: true });
    return;
  }
  const limit = limitMb * 1024 * 1024;
  setTimeout(() => {
    void Promise.all([total(caches(userData, true)), total(caches(userData, false))])
      .then(([http, rest]) => {
        if (http + rest >= limit) fs.writeFileSync(mark, http >= limit ? "all" : "code");
      })
      .catch(() => undefined);
  }, 60_000).unref();
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
