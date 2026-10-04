// Single sign-on across the seven processes. Each app has its own profile, so
// without help each would ask for the password and the second factor. Only
// the Microsoft sign-in cookies (login.microsoftonline.com, login.live.com)
// are shared, through one file readable by the user alone: an app starting
// later finds the sign-in and gets its own tokens silently. The app's other
// cookies stay in its profile.

import fs from "fs";
import path from "path";
import type { Cookie, Session } from "electron";
import { DATA_DIR } from "./identity";

const FILE = path.join(DATA_DIR, "sso.json");
const DOMAINS = ["login.microsoftonline.com", "login.live.com", "login.microsoft.com"];

const isSso = (domain: string | undefined): boolean =>
  !!domain && DOMAINS.some((d) => domain.replace(/^\./, "") === d);

const key = (c: Cookie): string => `${c.domain}|${c.path}|${c.name}`;

function readFile(): Cookie[] {
  try {
    const list = JSON.parse(fs.readFileSync(FILE, "utf8")) as Cookie[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeFile(list: Cookie[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.rmSync(tmp, { force: true });
    fs.writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch {
    // Sharing the sign-in is a convenience; the app works without it.
  }
}

const LOCK = `${FILE}.lock`;

/**
 * Seven processes read, merge and write the file: one at a time. The lock is
 * a file created exclusively; one left by a crashed app is taken over after 10 s.
 */
async function locked<T>(work: () => T): Promise<T> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (let i = 0; i < 50; i++) {
    try {
      fs.closeSync(fs.openSync(LOCK, "wx", 0o600));
      try {
        return work();
      } finally {
        fs.rmSync(LOCK, { force: true });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 10_000) fs.rmSync(LOCK, { force: true });
      } catch {
        // released meanwhile
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("sso.json locked");
}

async function importInto(ses: Session): Promise<void> {
  const now = Date.now() / 1000;
  for (const c of readFile()) {
    if (!isSso(c.domain) || (c.expirationDate && c.expirationDate < now)) continue;
    const host = (c.domain ?? "").replace(/^\./, "");
    await ses.cookies
      .set({
        url: `https://${host}${c.path ?? "/"}`,
        name: c.name,
        value: c.value,
        domain: c.hostOnly ? undefined : c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
      })
      .catch(() => undefined);
  }
}

/** Cookies this app saw go away (sign-out, expiry), to drop from the shared file too. */
const removed = new Set<string>();

async function exportFrom(ses: Session): Promise<void> {
  const mine: Cookie[] = [];
  for (const domain of DOMAINS) mine.push(...(await ses.cookies.get({ domain }).catch(() => [])));
  const gone = new Set(removed);
  removed.clear();
  await locked(() => {
    const now = Date.now() / 1000;
    // The other apps' cookies stay: an app with fewer cookies (signed in
    // later, or not to every service) must not wipe them out. Only expired
    // ones, and those this app saw removed, leave the file.
    const merged = new Map(readFile().filter((c) => isSso(c.domain) && !(c.expirationDate && c.expirationDate < now)).map((c) => [key(c), c]));
    for (const k of gone) merged.delete(k);
    for (const c of mine) merged.set(key(c), c);
    writeFile([...merged.values()]);
  }).catch(() => {
    // Not written this time: put the removals back for the next try.
    for (const k of gone) removed.add(k);
  });
}

/** Load the shared sign-in, then keep the file up to date. Await before the first page load. */
export async function shareSignIn(ses: Session): Promise<void> {
  await importInto(ses);
  let timer: NodeJS.Timeout | null = null;
  ses.cookies.on("changed", (_event, cookie, cause, isRemoved) => {
    if (!isSso(cookie.domain)) return;
    // "overwrite" is a new value replacing the old one (a set follows); "evicted"
    // is the store making room. Neither means signed out.
    if (isRemoved && (cause === "explicit" || cause === "expired" || cause === "expired-overwrite")) removed.add(key(cookie));
    else if (!isRemoved) removed.delete(key(cookie));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void exportFrom(ses), 1500);
  });
}
