// Lucarne: Microsoft 365 web apps as elementary OS windows. One process per app (--lucarne-app=<id>):
// its own Wayland app_id, dock icon, profile folder and single-instance lock.
// Sign-in is shared between the apps (src/sso.ts). Launching the app again
// brings its window forward; an address opens in the existing window, or in
// a new one for Word, Excel and PowerPoint documents.

import os from "os";
import path from "path";
import { spawn } from "child_process";
import fs from "fs";
import { app, ipcMain, Menu, nativeTheme, net, Notification, powerMonitor, session, shell as desktopShell, type DownloadItem, type IpcMainEvent, type MenuItemConstructorOptions, type Session, type WebContents } from "electron";
import { appFromArgv, command, CONFIG_DIR, desktopId } from "./identity";
import { loadConfig, updateConfig, watchConfig, type AppConfig } from "./config";
import { BACKGROUNDS_DIR, enableBackgrounds, registerBackgroundScheme } from "./backgrounds";
import { applyNetwork, closeEnterprise, enableIntune, enableSmartcardPin, watchSignIn } from "./enterprise";
import { trimCache } from "./housekeeping";
import { ask } from "./panel";
import { enableWebAuthn, patchSignIn } from "./webauthn";
import { mayUseDevices, isInside, urlFrom } from "./links";
import { resolveLanguage, setLanguage, t, language, strings, type Language } from "./i18n";
import { flushSettings } from "./settings";
import { closeBadge, initBadge, setBadge, setProgress } from "./badge";
import { closeDesktop } from "./desktop";
import { STATUSES, TeamsFeatures, type Availability, type TeamsEvent } from "./teams";
import { hideTray, setTrayUnread, showTray } from "./tray";
import { shareSignIn } from "./sso";
import { systemAccent } from "./style";
import { startNoise, stopNoise } from "./noise";
import { AppWindow, type Profile, type Shell } from "./window";
import { devProbe, devProbeHidden } from "./devProbe";

const info = appFromArgv(process.argv);

app.setName(info.name);
app.setPath("userData", path.join(CONFIG_DIR, "apps", info.id));
// WebRTCPipeWireCapturer: screen sharing through the xdg-desktop-portal picker on Wayland.
// The VA-API features move video decoding (calls, shared screens) to the GPU;
// without them the renderer does it all and the picture lags. Encoding stays
// in software: the VA-API encoder on the AMD iGPU sent green-striped camera
// frames and broke screen sharing (0.1.5/0.1.6).
const VIDEO = "VaapiVideoDecoder,AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL";
app.commandLine.appendSwitch("enable-features", `UseOzonePlatform,WaylandWindowDecorations,WebRTCPipeWireCapturer,${VIDEO}`);
app.commandLine.appendSwitch("enable-gpu-rasterization");
// HardwareMediaKeyHandling: the media keys stay with the music player, not a call.
app.commandLine.appendSwitch("disable-features", "WaylandWpColorManagerV1,HardwareMediaKeyHandling");
// Notification and ring sounds play without a click in the page first.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
// Two SharePoint downloads at once failed with ERR_QUIC_PROTOCOL_ERROR (teams-for-linux #2518).
app.commandLine.appendSwitch("disable-quic");
// Interface language (src/i18n.ts), from config.json's "language" or the system.
let conf: AppConfig = loadConfig(info);
setLanguage(resolveLanguage(conf.language));
// Language of Microsoft's pages, fixed for the life of the process: Chromium
// takes --lang at start only. Teams falls back to English on a bare "fr":
// send the full tag, as Chrome does.
const PAGE_LANGUAGE: Language = language();
const ENV_LOCALE = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "").split(/[.@]/)[0].replace("_", "-");
const LOCALE = PAGE_LANGUAGE === "fr" ? (/^fr-[A-Z]{2}$/i.test(ENV_LOCALE) ? ENV_LOCALE : "fr-FR") : "en-US";
const ACCEPT_LANGUAGES = PAGE_LANGUAGE === "fr" ? [...new Set([LOCALE, "fr", "en-US", "en"])].join(",") : "en-US,en";
app.commandLine.appendSwitch("lang", LOCALE);
// The Wayland app_id and the notifications' desktop-entry hint both come from here.
app.setDesktopName(`${desktopId(info)}.desktop`);
initBadge(desktopId(info));

// Microsoft serves reduced pages to anything that names Electron.
const CHROME = `${process.versions.chrome.split(".")[0]}.0.0.0`;
const userAgent = (windows: boolean): string =>
  `Mozilla/5.0 (${windows ? "Windows NT 10.0; Win64; x64" : "X11; Linux x86_64"}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME} Safari/537.36`;
app.userAgentFallback = userAgent(false);
registerBackgroundScheme();

if (!devProbeHidden() && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

if (conf.windowsMode) app.userAgentFallback = userAgent(true);
trimCache(app.getPath("userData"), conf.cacheLimit);
let accent = systemAccent();
let status: Availability | "" = "";
let pendingUrl = urlFrom(process.argv.slice(1));
let badgeTimer: NodeJS.Timeout | null = null;
let stopWatch: (() => void) | null = null;

const shell: Shell = {
  app: info,
  conf: () => conf,
  accent: () => accent,
  windows: new Set<AppWindow>(),
  hidden: devProbeHidden(),
  quitting: false,
  teams: null,
  badge: () => pollBadge(),
  teamsMenu: () => teamsMenu(),
  openProfile: (index) => void openProfile(index),
  signIn: (contents) => signIn(contents),
  open: (url) => new AppWindow(shell, url, shell.windows.size),
  quit: () => {
    shell.quitting = true;
    app.quit();
  },
  settingsApp: () => {
    const child = spawn(command("lucarne-settings"), [], { detached: true, stdio: "ignore" });
    child.on("error", () => undefined);
    child.unref();
  },
};

/** The main account's window (extra accounts have their own). */
const first = (): AppWindow | undefined => [...shell.windows].find((w) => !w.profile?.id);
const teamsPages = (): WebContents[] => {
  const all = [...shell.windows].sort((a, b) => Number(Boolean(a.profile?.id)) - Number(Boolean(b.profile?.id)));
  return all.map((w) => w.view.webContents).filter((p) => !p.isDestroyed());
};
const windowOf = (contents: WebContents): AppWindow | undefined =>
  [...shell.windows].find((w) => w.view.webContents === contents || w.win.webContents === contents);

/** Launched again (dock, launcher, link from Chrome). */
function handleLaunch(url: string | null): void {
  const win = first();
  if (!win) {
    shell.open(url);
    return;
  }
  if (url && info.documents) {
    // Same document already open: bring it forward instead of a second copy.
    const same = [...shell.windows].find((w) => w.view.webContents.getURL() === url);
    if (same) same.show();
    else shell.open(url);
    return;
  }
  win.show();
  if (url) win.load(url);
}

/** Unread count: "(3) …" in the title (Teams), or Outlook's Inbox folder. */
const UNREAD_JS = `(() => {
  const m = document.title.match(/^\\((\\d+)\\)/);
  if (m) return +m[1];
  for (const el of document.querySelectorAll('[role="treeitem"][aria-label], [role="treeitem"] [title]')) {
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
    const k = label.match(/^(Boîte de réception|Inbox)\\D*(\\d+)\\s*(élément|non lu|unread)/i);
    if (k) return +k[2];
  }
  return 0;
})()`;

function pollBadge(): void {
  const pages = [...shell.windows].map((w) => w.view.webContents).filter((p) => !p.isDestroyed());
  if (!pages.length || (!conf.badge && !conf.background)) {
    setBadge(0);
    setTrayUnread(0);
    return;
  }
  // Every account counts.
  void Promise.all(pages.map((p) => p.executeJavaScript(UNREAD_JS).catch(() => 0)))
    .then((counts: unknown[]) => {
      const count = counts.reduce<number>((n, c) => n + (typeof c === "number" ? c : 0), 0);
      setBadge(conf.badge ? count : 0);
      setTrayUnread(count);
    });
  void shell.teams?.status().then((s) => {
    if (s === status) return;
    status = s;
    applyTray();
  });
}

// ---------- sessions and accounts

const prepared = new WeakSet<Session>();
/** Granted to Microsoft 365 pages (src/links.ts INSIDE); full screen to any frame (a video in a chat). */
const ALLOWED = ["clipboard-sanitized-write"];
/** Granted only to this app's own pages (src/links.ts DEVICES), never to a third-party frame. */
const DEVICES = ["media", "display-capture", "clipboard-read"];

/**
 * Who asks: the requesting frame, and the page that embeds it. A pop-up still
 * on about:blank (Teams' pop-out chats and meetings) speaks for its opener.
 */
function askers(contents: WebContents | null, ...urls: (string | undefined)[]): string[] {
  const list = urls.filter((u): u is string => !!u && u !== "null");
  const blank = (u: string): boolean => u === "" || u.startsWith("about:");
  if (!list.length || list.some(blank)) {
    const page = contents && !contents.isDestroyed() ? contents.getURL() : "";
    const opener = contents && !contents.isDestroyed() ? contents.opener?.url ?? "" : "";
    return [...list.filter((u) => !blank(u)), blank(page) ? opener : page].filter((u) => u && !blank(u));
  }
  return list;
}

function permitted(permission: string, urls: string[], fileAccess?: string): boolean {
  if (permission === "fullscreen") return true;
  if (!urls.length) return false;
  if (permission === "notifications") return conf.notify && urls.every(isInside);
  // Dropped files are read through getAsFileSystemHandle(): read-only
  // "fileSystem" access, otherwise getFile() fails and the drop is lost.
  if (permission === "fileSystem") return fileAccess !== "writable" && urls.every(isInside);
  if (ALLOWED.includes(permission)) return urls.every(isInside);
  if (DEVICES.includes(permission)) return urls.every((u) => mayUseDevices(info.id, u));
  return false;
}

/** Permissions, downloads, screen sharing, network and sign-in helpers for one session. */
async function prepare(ses: Session): Promise<void> {
  if (prepared.has(ses)) return;
  prepared.add(ses);
  ses.setUserAgent(app.userAgentFallback, ACCEPT_LANGUAGES);
  ses.setSpellCheckerLanguages(PAGE_LANGUAGE === "fr" ? ["fr", "en-US"] : ["en-US", "fr"]);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const origin = "securityOrigin" in details ? details.securityOrigin : undefined;
    const urls = askers(contents, details.requestingUrl, origin);
    callback(permitted(permission, urls, "fileAccessType" in details ? details.fileAccessType : undefined));
  });
  // Checks never grant clipboard reading: the page has to ask (request handler above).
  ses.setPermissionCheckHandler((contents, permission, origin, details) =>
    permission !== "clipboard-read"
      && permitted(permission, askers(contents, details.requestingUrl ?? origin, details.embeddingOrigin), details.fileAccessType));
  ses.on("will-download", (_event, item) => followDownload(item));
  // Screen sharing (Teams, Outlook): without this handler getDisplayMedia() is refused.
  // On Wayland the PipeWire capturer opens the portal picker itself when capture
  // starts, so any screen id will do. Calling desktopCapturer.getSources() first
  // showed the picker twice: pantheon's portal hands out no restore token, so
  // the choice made for getSources() cannot be reused by the capture.
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ video: { id: "screen:0:0", name: t("Écran") } });
  });
  await applyNetwork(ses, conf);
  if (info.id === "teams") enableBackgrounds(ses, () => conf.backgrounds);
  if (conf.intune) await enableIntune(ses, conf.intuneUser);
}

/** A page or pop-up that may land on Microsoft's sign-in. */
function signIn(contents: WebContents): void {
  watchSignIn(contents, () => conf);
  contents.on("dom-ready", () => {
    if (conf.webauthn) patchSignIn(contents);
  });
}

function profile(p: { id: string; name: string }): Profile {
  const id = p.id.replace(/[^\w-]/g, "");
  return { id, name: p.name, session: session.fromPartition(`persist:${info.id}-${id}`) };
}

/** 1 = main account, 2… = extra accounts in the order of Réglages. */
async function openProfile(index: number): Promise<void> {
  if (index <= 1) {
    const main = first();
    if (main) main.show();
    else shell.open(null);
    return;
  }
  const entry = conf.profiles[index - 2];
  if (!entry?.id) return;
  const p = profile(entry);
  const open = [...shell.windows].find((w) => w.profile?.id === p.id);
  if (open) return open.show();
  await prepare(p.session);
  new AppWindow(shell, null, shell.windows.size, p);
}

async function addProfile(): Promise<void> {
  const name = await ask(t("Ajouter un compte Teams"), t("Nom du compte (par exemple « Client X » ou une adresse) :"), false);
  if (!name?.trim()) return;
  const id = `${Date.now().toString(36)}`;
  const profiles = [...conf.profiles, { id, name: name.trim() }];
  conf = { ...conf, profiles };
  updateConfig(info, { profiles });
  await openProfile(profiles.length + 1);
}

function report(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: path.join(__dirname, "..", "assets", "icons", `${info.id}.png`) }).show();
}

function setStatus(availability: Availability | null): void {
  if (!shell.teams) return;
  void shell.teams.setStatus(availability).then(() => {
    status = availability ?? "";
    applyTray();
    setTimeout(pollBadge, 3000);
  }).catch((err: Error) => report(t("Statut Teams non changé"), err.message));
}

/** Opens one of our files, creating it or its folder first. */
function openOwn(target: string, folder: boolean, initial = ""): void {
  try {
    if (folder) fs.mkdirSync(target, { recursive: true });
    else if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, initial);
    }
  } catch {
    return;
  }
  void desktopShell.openPath(target);
}

/** Status, quick chat, accounts and personal touches: window menu and panel icon. */
function teamsMenu(): MenuItemConstructorOptions[] {
  if (!shell.teams) return [];
  const accounts: MenuItemConstructorOptions[] = [
    { label: t("Compte principal"), accelerator: "Ctrl+Alt+1", click: () => void openProfile(1) },
    ...conf.profiles.slice(0, 20).map((p, i): MenuItemConstructorOptions => ({
      label: p.name || t("Compte {n}", { n: i + 2 }),
      accelerator: i < 4 ? `Ctrl+Alt+${i + 2}` : undefined,
      click: () => void openProfile(i + 2),
    })),
    { type: "separator" },
    { label: t("Ajouter un compte…"), click: () => void addProfile() },
    { label: t("Gérer les comptes…"), click: () => shell.settingsApp() },
  ];
  return [
    {
      label: status ? t("Statut : {status}", { status: t(STATUSES.find(([k]) => k === status)?.[1] ?? status) }) : t("Statut"),
      submenu: [
        ...STATUSES.map(([key, label]): MenuItemConstructorOptions => ({ label: t(label), type: "radio", checked: status === key, click: () => setStatus(key) })),
        { type: "separator" },
        { label: t("Réinitialiser le statut"), click: () => setStatus(null) },
      ],
    },
    { label: t("Discussion rapide…"), click: () => shell.teams?.quickChat() },
    { label: t("Détacher le partage d'écran"), accelerator: "Ctrl+Alt+P", click: () => void popOut() },
    { label: t("Comptes"), submenu: accounts },
    {
      label: t("Personnaliser"),
      submenu: [
        { label: t("Mes fonds d'écran d'appel…"), click: () => openOwn(BACKGROUNDS_DIR, true) },
        { type: "separator" },
        {
          label: t("Style elementary"),
          type: "checkbox",
          checked: conf.elementaryCss,
          click: () => updateConfig(info, { elementaryCss: !conf.elementaryCss }),
        },
        {
          label: t("Mon style (CSS)…"),
          click: () => openOwn(path.join(CONFIG_DIR, `${info.id}.css`), false,
            t("/* CSS ajouté aux pages de Teams, appliqué à l'enregistrement.\n   Il passe après le style elementary, s'il est coché, et peut donc le corriger.\n   Ajouter !important si une règle de Teams, plus précise, l'emporte. */\n")),
        },
      ],
    },
  ];
}

/** Focused window's page first, then the others. */
async function popOut(): Promise<void> {
  const focused = [...shell.windows].find((w) => w.win.isFocused())?.view.webContents;
  if (!(await shell.teams?.popOut(focused)) && !(await shell.teams?.popOut())) {
    new Notification({ title: t("Partage d'écran"), body: t("Aucune vidéo à détacher dans Teams.") }).show();
  }
}

/** Panel icon while the app may run without a window. */
function applyTray(): void {
  if (!conf.background || shell.hidden) return hideTray();
  showTray(info, {
    show: () => (first() ? first()?.show() : shell.open(null)),
    settings: () => shell.settingsApp(),
    quit: () => shell.quit(),
    extra: () => teamsMenu(),
  });
}

ipcMain.on("lucarne-header:action", (event: IpcMainEvent, action: unknown, point: unknown) => {
  const win = [...shell.windows].find((w) => w.win.webContents === event.sender);
  if (!win || typeof action !== "string") return;
  const valid = Array.isArray(point) && point.length === 2 && point.every((n) => Number.isFinite(n));
  win.action(action, valid ? (point as [number, number]) : null);
});
ipcMain.on("lucarne-page:sharing", (event: IpcMainEvent, surface: unknown) => {
  const win = [...shell.windows].find((w) => w.view.webContents === event.sender);
  win?.setSharing(surface === "monitor" || surface === "window" || surface === "browser" ? surface : null);
});
ipcMain.on("lucarne-page:event", (event: IpcMainEvent, data: unknown) => {
  const win = windowOf(event.sender);
  if (win && shell.teams && data && typeof (data as { type?: unknown }).type === "string") shell.teams.handle(data as TeamsEvent, event.sender);
});
ipcMain.on("lucarne-page:preview", (event: IpcMainEvent, frame: unknown) => {
  if (typeof frame === "string" && frame.length < 2_000_000) windowOf(event.sender)?.setPreview(frame);
});
ipcMain.on("lucarne-page:early", (event: IpcMainEvent) => {
  event.returnValue = { windowsMode: conf.windowsMode, lockDevices: conf.lockDevices, webauthn: conf.webauthn, sharePreview: conf.sharePreview };
});
ipcMain.on("lucarne-page:locale", (event: IpcMainEvent) => {
  event.returnValue = LOCALE;
});
// Our own pages (header bar, small windows): language and dictionary.
ipcMain.on("lucarne-i18n", (event: IpcMainEvent) => {
  event.returnValue = strings();
});

ipcMain.on("lucarne-header:ready", (event: IpcMainEvent) => {
  [...shell.windows].find((w) => w.win.webContents === event.sender)?.push();
});

app.on("second-instance", (_event, argv) => handleLaunch(urlFrom(argv.slice(1))));

function about(): void {
  app.setAboutPanelOptions({
    applicationName: info.name,
    applicationVersion: app.getVersion(),
    copyright: "© Lucarne contributors · GPL-3.0",
    credits: t("Lucarne, projet indépendant sous licence GPL-3.0. {name} et Microsoft 365 sont des marques de Microsoft Corporation ; Lucarne affiche leur service web et n'est ni affilié à Microsoft ni approuvé par Microsoft.", { name: info.name }),
    iconPath: path.join(__dirname, "..", "assets", "icons", `${info.id}.png`),
  });
}
about();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const ses = session.defaultSession;
  enableSmartcardPin();
  await prepare(ses);
  await shareSignIn(ses);

  const noise = (): void => {
    if (!conf.noise) return stopNoise();
    void startNoise().then(() => {
      for (const w of shell.windows) w.applyNoise();
    });
  };
  noise();

  if (info.id === "teams") {
    shell.teams = new TeamsFeatures(
      teamsPages,
      () => conf,
      (page) => (page ? windowOf(page) : first())?.show() ?? first()?.show(),
      (url) => {
        const main = first();
        if (!main) return shell.open(url);
        main.load(url);
        main.show();
      },
    );
  }
  const win = new AppWindow(shell, pendingUrl, 0);
  pendingUrl = null;
  devProbe(win);
  if (conf.webauthn) void enableWebAuthn(win.view.webContents);
  started = true;

  applyTray();
  badgeTimer = setInterval(pollBadge, 5000);
  stopWatch = watchConfig(info, (next) => {
    const network = next.proxy !== conf.proxy || next.caFingerprints.join() !== conf.caFingerprints.join();
    const lang = resolveLanguage(next.language);
    const relabel = lang !== language();
    conf = next;
    if (relabel) {
      // Menus are built when opened; the header bars and the About box are redone.
      // Microsoft's pages keep their language until the app restarts (--lang).
      setLanguage(lang);
      about();
      for (const w of shell.windows) w.relabel();
    }
    if (network) for (const w of shell.windows) void applyNetwork(w.view.webContents.session, conf);
    const page = first()?.view.webContents;
    if (conf.webauthn && page && !page.isDestroyed()) void enableWebAuthn(page);
    noise();
    applyTray();
    for (const w of shell.windows) w.refresh();
    pollBadge();
  });
  nativeTheme.on("updated", () => {
    accent = systemAccent();
    for (const w of shell.windows) w.refresh();
    shell.teams?.applyTheme();
  });
  // Back from suspend, or the network returns: pages that failed to load retry.
  powerMonitor.on("resume", () => setTimeout(retryFailed, 3000));
  setInterval(() => {
    if ([...shell.windows].some((w) => w.failed) && net.isOnline()) retryFailed();
  }, 10_000);
}).catch((err: unknown) => onCrash(err instanceof Error ? err : new Error(String(err)), true));

function retryFailed(): void {
  for (const w of shell.windows) if (w.failed) w.action("retry", null);
}

/** Downloads: progress on the dock icon, a notification when done. */
const downloads = new Set<DownloadItem>();
function followDownload(item: DownloadItem): void {
  downloads.add(item);
  const update = (): void => {
    let total = 0, got = 0;
    for (const d of downloads) {
      total += d.getTotalBytes();
      got += d.getReceivedBytes();
    }
    setProgress(downloads.size && total > 0 ? got / total : downloads.size ? 0 : -1);
  };
  item.on("updated", update);
  item.once("done", (_event, state) => {
    downloads.delete(item);
    update();
    if (state !== "completed" || !Notification.isSupported()) return;
    const file = item.getSavePath();
    const done = new Notification({ title: t("Téléchargement terminé"), body: path.basename(file), icon: path.join(__dirname, "..", "assets", "icons", `${info.id}.png`) });
    done.on("click", () => desktopShell.showItemInFolder(file));
    done.show();
  });
  update();
}

app.on("before-quit", () => {
  shell.quitting = true;
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  if (badgeTimer) clearInterval(badgeTimer);
  stopWatch?.();
  closeBadge();
  hideTray();
  shell.teams?.close();
  closeDesktop();
  closeEnterprise();
  stopNoise();
  flushSettings();
});

// An error nothing caught (or a failed start). It is logged (home folder kept out), then:
// - before the first window is up, twice, or once when the start itself
//   failed: the app starts over, once; a start that fails again tells the
//   user and quits;
// - otherwise the user is told, at most once a minute, rather than the app
//   carrying on silently in a state nobody knows.
let started = false;
let crashes = 0;
let toldAt = 0;
process.on("uncaughtException", (err) => onCrash(err));
function onCrash(err: Error, startFailed = false): void {
  const message = String(err?.message ?? err).split(os.homedir()).join("~");
  console.error(`[lucarne] ${message}${err?.stack ? `\n${err.stack.split(os.homedir()).join("~")}` : ""}`);
  crashes++;
  if (!started && (crashes >= 2 || startFailed) && !process.env.LUCARNE_RELAUNCHED) {
    process.env.LUCARNE_RELAUNCHED = "1";
    app.relaunch();
    app.exit(1);
    return;
  }
  const quit = startFailed && !started;
  if (quit) setTimeout(() => app.exit(1), 1000);
  if (!app.isReady() || !Notification.isSupported() || (!quit && Date.now() - toldAt < 60_000)) return;
  toldAt = Date.now();
  try {
    new Notification({
      title: t("{name} a rencontré une erreur", { name: info.name }),
      body: t("{message}. Si l'appli se comporte mal, quittez-la et relancez-la.", { message: message.slice(0, 200).replace(/\.$/, "") }),
      icon: path.join(__dirname, "..", "assets", "icons", `${info.id}.png`),
    }).show();
  } catch {
    // nothing more to do
  }
}
