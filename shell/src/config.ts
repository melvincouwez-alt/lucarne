// Settings shared with the launcher and the Réglages app (bin/lucarne_config.py):
// ~/.config/lucarne/config.json holds only what differs from the defaults.
// The file is watched, so a switch flipped in Réglages applies at once.

import fs from "fs";
import path from "path";
import { CONFIG_DIR, type AppInfo } from "./identity";
import { t, type LanguageSetting } from "./i18n";

export interface AppConfig {
  home: string;
  capture: boolean;
  badge: boolean;
  notify: boolean;
  autostart: boolean;
  tint: boolean;
  style: boolean;
  noise: boolean;
  /** Teams: activity in other apps keeps you Available. */
  presence: boolean;
  /** Teams: locked or idle session turns you Away. */
  awayIdle: boolean;
  /** Teams: incoming calls as a notification with buttons. */
  calls: boolean;
  /** Shell command run while a call rings (caller and text as $1 $2). */
  callCommand: string;
  /** Closing the window keeps the app running (calls, notifications). */
  background: boolean;
  /** Teams' light or dark theme follows the system. */
  theme: boolean;
  /** Incoming call in our own window (true) or as a notification (false). */
  callWindow: boolean;
  /** Teams: banners drawn inside its window go to the system's notifications. */
  banners: boolean;
  /** Teams: leaving the meeting view puts the meeting in a small window of its own. */
  miniWindow: boolean;
  /** Small window showing what is being shared. */
  sharePreview: boolean;
  /** Chromium's automatic microphone gain; off, it cannot push the level into clipping. */
  autoGain: boolean;
  /** Camera keeps its own shape when the window moves to another screen. */
  cameraRatio: boolean;
  /** Camera at its full resolution instead of the 720p Teams asks for. */
  cameraFull: boolean;
  /** The system's microphone mute does not flip Teams' mute button. */
  ignoreSystemMute: boolean;
  /** Plugging in a headset or webcam does not switch devices mid-call. */
  lockDevices: boolean;
  /** Cache cleared at start when over this many MB (0 = never). */
  cacheLimit: number;
  /** Tell Microsoft's pages this is Windows (features kept from Linux). */
  windowsMode: boolean;
  /** ~/.config/lucarne/<app>.css injected into the pages. */
  customCss: boolean;
  /** Built-in elementary look for Fluent pages (assets/elementary.css). */
  elementaryCss: boolean;
  /** Pictures in ~/.config/lucarne/backgrounds replace Teams' stock backgrounds. */
  backgrounds: boolean;
  /** Extra Teams accounts, each with its own window and sign-in. */
  profiles: { id: string; name: string }[];
  /** Proxy rules, e.g. "http://proxy:3128" ("" = system). */
  proxy: string;
  /** SHA-256 fingerprints of company root certificates to trust. */
  caFingerprints: string[];
  /** Microsoft sign-in: address to fill in, and a command printing the password. */
  loginUser: string;
  passwordCommand: string;
  /** Sign-in through Microsoft Identity Broker (Intune-managed devices). */
  intune: boolean;
  intuneUser: string;
  /** FIDO2 security keys at sign-in, through fido2-tools. */
  webauthn: boolean;
  /** Interface language, shared by all the apps (top-level "language" key, not per app). */
  language: LanguageSetting;
}

const FILE = path.join(CONFIG_DIR, "config.json");

function defaults(app: AppInfo): AppConfig {
  return {
    home: "",
    capture: true,
    badge: app.id === "outlook" || app.id === "teams",
    notify: true,
    autostart: false,
    tint: true,
    style: true,
    noise: app.id === "teams",
    presence: app.id === "teams",
    awayIdle: false,
    calls: app.id === "teams",
    callCommand: "",
    background: app.id === "teams",
    theme: app.id === "teams",
    callWindow: app.id === "teams",
    banners: app.id === "teams",
    miniWindow: app.id === "teams",
    sharePreview: app.id === "teams",
    autoGain: false,
    cameraRatio: true,
    cameraFull: false,
    ignoreSystemMute: false,
    lockDevices: false,
    cacheLimit: 600,
    windowsMode: false,
    customCss: true,
    elementaryCss: false,
    backgrounds: app.id === "teams",
    profiles: [],
    proxy: "",
    caFingerprints: [],
    loginUser: "",
    passwordCommand: "",
    intune: false,
    intuneUser: "",
    webauthn: false,
    language: "auto",
  };
}

export function loadConfig(app: AppInfo): AppConfig {
  const conf = defaults(app);
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8")) as { apps?: Record<string, Partial<AppConfig>>; language?: unknown };
    const mine = raw.apps?.[app.id] ?? {};
    if (raw.language === "fr" || raw.language === "en" || raw.language === "auto") conf.language = raw.language;
    for (const key of Object.keys(conf) as (keyof AppConfig)[]) {
      if (key === "language") continue;
      const value = mine[key];
      if (value === undefined || typeof value !== typeof conf[key] || Array.isArray(value) !== Array.isArray(conf[key])) continue;
      (conf as unknown as Record<string, unknown>)[key] = value;
    }
  } catch {
    // No file yet, or a broken one: the defaults stand.
  }
  return conf;
}

export function homeUrl(app: AppInfo, conf: AppConfig): string {
  return /^https:\/\//i.test(conf.home) ? conf.home : app.home;
}

/** Call back with the new settings whenever the file, or the app's own CSS, changes. */
export function watchConfig(app: AppInfo, onChange: (conf: AppConfig) => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    // Watch the folder: the file is replaced (write then rename), not edited.
    watcher = fs.watch(CONFIG_DIR, (_event, name) => {
      if (name !== "config.json" && name !== `${app.id}.css`) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(loadConfig(app)), 200);
    });
  } catch {
    watcher = null;
  }
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

/**
 * Changes some of this app's settings in config.json, keeping everything else.
 * A file that cannot be read or parsed is never replaced by one holding only
 * this change: it is copied to config.json.bak and the change is refused.
 */
export function updateConfig(app: AppInfo, patch: Partial<AppConfig>): void {
  let raw: unknown = {};
  try {
    raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") raw = null;
  }
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!object(raw) || (raw.apps !== undefined && !object(raw.apps))) {
    try {
      fs.copyFileSync(FILE, `${FILE}.bak`);
    } catch {
      // unreadable: nothing to copy either
    }
    throw new Error(t("config.json est illisible : rien n'a été enregistré (copie gardée dans config.json.bak)"));
  }
  const apps = (raw.apps ??= {}) as Record<string, Record<string, unknown>>;
  const { language: _shared, ...own } = patch;
  apps[app.id] = { ...(apps[app.id] ?? {}), ...own };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // The file holds the sign-in address and password command: user only, and
  // replaced in one step so the other apps never read half a file.
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
