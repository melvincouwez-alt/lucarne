// One app window, built like Reddit's: the frame Chromium draws from the GTK
// theme is kept (rounded corners, shadow, resize edges, window buttons) with
// its title bar hidden through Window Controls Overlay. The window's own page
// is the header bar (assets/headerbar.html); the Microsoft page sits in a
// WebContentsView under it and stays hidden until it has drawn, so the window
// opens on the app's icon and a spinner rather than on a white page.

import path from "path";
import {
  BrowserWindow,
  clipboard,
  Menu,
  nativeTheme,
  WebContentsView,
  type Input,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
} from "electron";
import type { AppInfo } from "./identity";
import type { AppConfig } from "./config";
import { homeUrl } from "./config";
import { appFor, isInside, openExternal, openInApp, parse } from "./links";
import { t } from "./i18n";
import { attachContextMenu } from "./contextMenu";
import { saveSettings, settings } from "./settings";
import { brandScript, pageCss } from "./style";
import { noiseReady } from "./noise";
import type { TeamsFeatures } from "./teams";
import { MEDIA_HOOK, mediaFlags } from "./media";
import { customCss, elementaryCss } from "./housekeeping";
import { openPanel, type Panel } from "./panel";

export const HEADER_HEIGHT = 48;
const ZOOM_STEPS = [-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3];
/** Printed by the page (see FOCUS_HOOK) when one of its notifications is clicked. */
const FOCUS_SIGNAL = "__lucarne_focus__";
/** Teams meeting links, as copied from an invitation. */
const MEETING = /^https:\/\/teams\.(microsoft\.com|live\.com|cloud\.microsoft)\/(l\/meetup-join|meet|v2\/\?meetingjoin)\S*$/i;
/** "Get the app" buttons: this is the app. */
const PROMO_CSS = "#download-mobile-app-button, #download-app-button, #get-app-button { display: none !important; }";

export interface Shell {
  app: AppInfo;
  conf: () => AppConfig;
  accent: () => string;
  windows: Set<AppWindow>;
  open: (url: string | null) => void;
  quit: () => void;
  settingsApp: () => void;
  hidden: boolean;
  /** Set once the app is really quitting (Ctrl+Q, menu): closing no longer hides. */
  quitting: boolean;
  teams: TeamsFeatures | null;
  /** The page title changed: the unread count may have too. */
  badge: () => void;
  /** A page failed to load: try it again once the network is back. */
  failed: () => void;
  /** Teams: status, quick chat and accounts, for the window menu. */
  teamsMenu: () => MenuItemConstructorOptions[];
  /** Ctrl+Alt+1…5: that account's window (1 = main account). */
  openProfile: (index: number) => void;
  /** A page or pop-up that may show Microsoft's sign-in (fills it in, security keys). */
  signIn: (contents: WebContents) => void;
}

/** A Teams account: the main one (id "") or an extra one with its own session. */
export interface Profile {
  id: string;
  name: string;
  session: Session;
}

/** Page colour behind everything while loading. */
export const pageColour = (): string => (nativeTheme.shouldUseDarkColors ? "#1f1f1f" : "#fafafa");

/** The frame's window buttons, drawn over the bar: white on the brand colour. */
function symbolColour(conf: AppConfig): string {
  if (conf.tint) return "#ffffff";
  return nativeTheme.shouldUseDarkColors ? "#fafafa" : "#333333";
}

/**
 * "Courrier - Dupont Marie - Outlook" -> Courrier / Dupont Marie,
 * "(3) Conversation | Microsoft Teams" -> Conversation, "Rapport.docx" stays.
 */
export function splitTitle(raw: string, app: AppInfo): { title: string; subtitle: string } {
  let text = raw.replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/^\(\d+\)\s*/, "").trim();
  text = text.replace(new RegExp(`\\s*[-–|]\\s*(Microsoft\\s+)?(${app.name}|Microsoft 365|Office)(\\s+(Online|sur le web|for the web))?$`, "i"), "");
  if (!text || /^(Microsoft 365|Office|Se connecter|Connectez-vous|Sign in)/i.test(text)) return { title: app.name, subtitle: "" };
  const parts = text.split(/\s+[-–|]\s+/);
  if (parts.length > 1) return { title: parts[0], subtitle: parts.slice(1).join(" · ") };
  return { title: text, subtitle: "" };
}

/**
 * Wraps window.Notification so a click brings the window forward. Teams also
 * posts the same message a second time about 10 s later, which Chromium shows
 * as a second bubble: the same title and text within a minute reuse the first.
 * window.__lucarneNotified (title -> time) lets Teams' banner relay (src/teams.ts)
 * skip a message Teams already notified.
 */
const FOCUS_HOOK = `(() => {
  if (window.__lucarneHook || !window.Notification) return;
  window.__lucarneHook = true;
  const N = window.Notification;
  const recent = new Map();
  const notified = window.__lucarneNotified = new Map();
  const repeat = (title, opts) => {
    const key = String(title) + "\\n" + String(opts?.body ?? "");
    const now = Date.now();
    for (const [k, v] of recent) if (now - v.at > 60000) recent.delete(k);
    for (const [k, at] of notified) if (now - at > 60000) notified.delete(k);
    notified.set(String(title).slice(0, 200), now);
    return { key, seen: recent.get(key), now };
  };
  const show = window.ServiceWorkerRegistration?.prototype.showNotification;
  if (show) ServiceWorkerRegistration.prototype.showNotification = function (title, opts) {
    const { key, seen, now } = repeat(title, opts);
    if (seen) return Promise.resolve();
    recent.set(key, { n: null, at: now });
    return show.call(this, title, opts);
  };
  function W(title, opts) {
    const { key, seen, now } = repeat(title, opts);
    if (seen?.n) return seen.n;
    const n = new N(title, opts);
    recent.set(key, { n, at: now });
    n.addEventListener("click", () => console.log("${FOCUS_SIGNAL}"));
    return n;
  }
  W.prototype = N.prototype;
  Object.defineProperty(W, "permission", { get: () => N.permission });
  W.requestPermission = N.requestPermission.bind(N);
  window.Notification = W;
})();`;

/**
 * Hides the laptop's infrared camera (Windows Hello). It shows up as a second
 * webcam and Teams may pick it, which gives a grey, flickering picture.
 */
const CAMERA_HOOK = `(() => {
  const md = navigator.mediaDevices;
  if (window.__lucarneCamera || !md) return;
  window.__lucarneCamera = true;
  const IR = /\\bIR\\b|infrared|infrarouge/i;
  const enumerate = md.enumerateDevices.bind(md);
  md.enumerateDevices = async () => (await enumerate()).filter((d) => !(d.kind === "videoinput" && IR.test(d.label)));
  const getUserMedia = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints) => {
    const video = constraints && constraints.video;
    if (video) {
      // no camera chosen, or the infrared one (remembered by the page): use the real webcam
      const all = await enumerate();
      const ir = new Set(all.filter((d) => d.kind === "videoinput" && IR.test(d.label)).map((d) => d.deviceId));
      const want = typeof video === "object" ? video.deviceId : undefined;
      const id = want && (typeof want === "string" ? want : want.exact || want.ideal);
      const cam = all.find((d) => d.kind === "videoinput" && d.deviceId && !ir.has(d.deviceId));
      if (cam && (!id || ir.has(id))) {
        constraints = { ...constraints, video: { ...(typeof video === "object" ? video : {}), deviceId: { exact: cam.deviceId } } };
      }
    }
    return getUserMedia(constraints);
  };
})();`;

/**
 * Meetings: the microphone is the "Micro antibruit" source (src/noise.ts)
 * unless the page asked for a given device. window.__lucarneNoise is set from
 * the settings, so the switch in Réglages applies to the next call.
 */
const MIC_HOOK = `(() => {
  const md = navigator.mediaDevices;
  if (window.__lucarneMic || !md) return;
  window.__lucarneMic = true;
  const NOISE = /antibruit|rnnoise|noise-cancel/i;
  const PICK = new Set(["", "default", "communications"]);
  const getUserMedia = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints) => {
    const audio = constraints && constraints.audio;
    if (audio && window.__lucarneNoise) {
      const want = typeof audio === "object" ? audio.deviceId : undefined;
      let id = want && (typeof want === "string" || Array.isArray(want) ? want : want.exact || want.ideal);
      if (Array.isArray(id)) id = id[0];
      if (!id || PICK.has(id)) {
        const mic = (await md.enumerateDevices()).find((d) => d.kind === "audioinput" && !PICK.has(d.deviceId) && NOISE.test(d.label));
        if (mic) constraints = { ...constraints, audio: { ...(typeof audio === "object" ? audio : {}), deviceId: { exact: mic.deviceId } } };
      }
    }
    return getUserMedia(constraints);
  };
})();`;

export class AppWindow {
  win: BrowserWindow;
  view: WebContentsView;
  revealed = false;
  failed = false;
  htmlFullScreen = false;
  sharing: "monitor" | "window" | "browser" | null = null;
  private preview: Panel | null = null;

  constructor(private shell: Shell, url: string | null, offset: number, readonly profile: Profile | null = null) {
    const saved = settings();
    const conf = shell.conf();
    const bounds = { ...saved.bounds };
    if (offset && bounds.x !== undefined && bounds.y !== undefined) {
      bounds.x += 32 * offset;
      bounds.y += 32 * offset;
    }
    this.win = new BrowserWindow({
      ...bounds,
      minWidth: 480,
      minHeight: 400,
      title: shell.app.name,
      show: false,
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#00000000", symbolColor: symbolColour(conf), height: HEADER_HEIGHT },
      backgroundColor: pageColour(),
      icon: path.join(__dirname, "..", "assets", "icons", `${shell.app.id}.png`),
      webPreferences: {
        preload: path.join(__dirname, "headerbarPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        offscreen: shell.hidden,
      },
    });
    if (saved.maximized && !offset) this.win.maximize();

    this.view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "pagePreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        offscreen: shell.hidden,
        ...(profile?.id ? { session: profile.session } : {}),
      },
    });
    this.view.setBackgroundColor(pageColour());
    this.view.setVisible(false);
    this.win.contentView.addChildView(this.view);

    const page = this.view.webContents;
    page.setZoomLevel(saved.zoom);
    this.guardNavigation(page);
    attachContextMenu(page, (u) => this.load(u));
    this.handleKeys(page);
    this.handleKeys(this.win.webContents);

    page.on("dom-ready", () => {
      page.setZoomLevel(settings().zoom);
      void page.executeJavaScript(FOCUS_HOOK).catch(() => undefined);
      void page.executeJavaScript(CAMERA_HOOK).catch(() => undefined);
      void page.executeJavaScript(MIC_HOOK).catch(() => undefined);
      void page.executeJavaScript(MEDIA_HOOK).catch(() => undefined);
      this.applyNoise();
      this.applyStyle();
      shell.teams?.inject(page);
    });
    shell.signIn(page);
    page.on("did-finish-load", () => {
      setTimeout(() => this.reveal(), 150);
      this.push();
    });
    page.on("did-fail-load", (_e, code, _d, _u, isMainFrame) => {
      // -3 is an aborted load, which redirects cause all the time.
      if (!isMainFrame || code === -3) return;
      this.failed = true;
      this.revealed = false;
      this.view.setVisible(false);
      this.push();
      shell.failed();
    });
    page.on("did-navigate", () => this.setSharing(null));
    page.on("page-title-updated", () => shell.badge());
    for (const ev of ["page-title-updated", "did-start-loading", "did-stop-loading", "did-navigate", "did-navigate-in-page"] as const)
      page.on(ev as "did-stop-loading", () => this.push());
    page.on("enter-html-full-screen", () => this.setHtmlFullScreen(true));
    page.on("leave-html-full-screen", () => this.setHtmlFullScreen(false));
    page.on("console-message", (details) => {
      if (details.message === FOCUS_SIGNAL) this.show();
    });

    const remember = (): void => {
      if (this.win.isDestroyed() || this.win.isFullScreen()) return;
      const maximized = this.win.isMaximized();
      saveSettings(maximized ? { maximized } : { maximized, bounds: this.win.getNormalBounds() });
    };
    this.win.on("resize", () => {
      this.layout();
      remember();
    });
    this.win.on("move", remember);
    this.win.on("maximize", remember);
    this.win.on("unmaximize", remember);
    this.win.on("close", (event) => {
      // Teams keeps running without a window so calls still ring; the dock or
      // the launcher brings it back (second-instance), Ctrl+Q quits.
      // Extra accounts' windows close for real, and so does one of several
      // windows of the main account; extra accounts' windows do not count.
      const main = [...shell.windows].filter((w) => !w.profile?.id).length;
      if (shell.quitting || shell.hidden || !shell.conf().background || this.profile?.id || main > 1) return;
      event.preventDefault();
      this.win.hide();
    });
    this.win.on("closed", () => {
      shell.windows.delete(this);
      this.preview?.close();
      // A WebContentsView is not destroyed with its window: the page would keep running.
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
    });
    this.win.once("ready-to-show", () => this.show());

    this.layout();
    void this.win.loadFile(path.join(__dirname, "..", "assets", "headerbar.html"));
    this.load(url ?? homeUrl(shell.app, conf));
    shell.windows.add(this);
  }

  /** Microsoft 365 addresses (http or https) load here; others go to the browser. */
  load(url: string): void {
    const u = parse(url);
    if (!u) return;
    if (!isInside(u.href)) return openExternal(u.href);
    void this.view.webContents.loadURL(u.href).catch(() => undefined);
  }

  show(): void {
    if (this.win.isDestroyed() || this.shell.hidden) return;
    if (this.win.isMinimized()) this.win.restore();
    this.win.show();
    this.win.focus();
  }

  layout(): void {
    if (this.win.isDestroyed()) return;
    const { width, height } = this.win.getContentBounds();
    const top = this.htmlFullScreen ? 0 : HEADER_HEIGHT;
    this.view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
  }

  private setHtmlFullScreen(on: boolean): void {
    this.htmlFullScreen = on;
    this.layout();
    this.push();
  }

  private reveal(): void {
    if (this.revealed || this.view.webContents.isDestroyed()) return;
    this.revealed = true;
    this.failed = false;
    this.view.setVisible(true);
    this.push();
  }

  state(): Record<string, unknown> {
    const page = this.view.webContents;
    const history = page.navigationHistory;
    const conf = this.shell.conf();
    const split = splitTitle(page.getTitle(), this.shell.app);
    const title = split.title;
    const subtitle = this.profile?.id ? [this.profile.name, split.subtitle].filter(Boolean).join(" · ") : split.subtitle;
    return {
      app: this.shell.app.id,
      name: this.shell.app.name,
      title,
      subtitle,
      brand: this.shell.app.brand,
      tint: conf.tint,
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      loading: page.isLoading(),
      revealed: this.revealed,
      failed: this.failed,
      fullscreen: this.htmlFullScreen,
      sharing: this.sharing,
    };
  }

  push(): void {
    if (this.win.isDestroyed()) return;
    this.win.webContents.send("lucarne-header:state", this.state());
  }

  /** The interface language changed: the header bar page is drawn again in it. */
  relabel(): void {
    if (!this.win.isDestroyed()) this.win.webContents.reload();
  }

  /** New settings from Réglages: header colours, window buttons, page style. */
  refresh(): void {
    if (this.win.isDestroyed()) return;
    this.win.setTitleBarOverlay({ color: "#00000000", symbolColor: symbolColour(this.shell.conf()), height: HEADER_HEIGHT });
    this.win.setBackgroundColor(pageColour());
    this.view.setBackgroundColor(pageColour());
    this.applyStyle();
    this.applyNoise();
    this.push();
  }

  applyNoise(): void {
    const page = this.view.webContents;
    if (page.isDestroyed()) return;
    const on = this.shell.conf().noise && noiseReady();
    void page.executeJavaScript(`window.__lucarneNoise = ${on}; ${mediaFlags(this.shell.conf())}`).catch(() => undefined);
  }

  private applyStyle(): void {
    const page = this.view.webContents;
    if (page.isDestroyed()) return;
    const style = this.shell.conf().style;
    const own = this.shell.conf().customCss ? customCss(this.shell.app.id) : "";
    const look = this.shell.conf().elementaryCss ? elementaryCss() : "";
    const next = `${style ? pageCss() : "html, body { -webkit-app-region: no-drag; }"}\n${PROMO_CSS}\n${look}\n${own}`;
    const brand = brandScript(this.shell.app, style ? this.shell.accent() : null);
    if (brand) void page.executeJavaScript(brand).catch(() => undefined);
    // One sheet adopted by the page and rewritten in place: insertCSS keys
    // could outlive a redirect (teams.microsoft.com to teams.cloud.microsoft)
    // and leave an old sheet nobody could remove. Rewriting it restyles the
    // whole page, so the same text is not written again: any change in
    // config.json, for any of the seven apps, comes through here.
    void page.executeJavaScript(`((css) => {
  let sheet = window.__lucarneSheet;
  if (!sheet) sheet = window.__lucarneSheet = new CSSStyleSheet();
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  if (window.__lucarneCss === css) return;
  sheet.replaceSync(css);
  window.__lucarneCss = css;
})(${JSON.stringify(next)})`).catch(() => undefined);
  }

  setZoom(level: number): void {
    this.view.webContents.setZoomLevel(level);
    saveSettings({ zoom: level });
  }

  stepZoom(direction: 1 | -1): void {
    const current = this.view.webContents.getZoomLevel();
    const next = direction > 0
      ? ZOOM_STEPS.find((z) => z > current + 0.01)
      : [...ZOOM_STEPS].reverse().find((z) => z < current - 0.01);
    if (next !== undefined) this.setZoom(next);
  }

  async menu(point: [number, number] | null): Promise<void> {
    const page = this.view.webContents;
    // Read before the menu opens: the item says whether a meeting link is copied.
    const copied = this.shell.app.id === "teams" ? String(await Promise.resolve(clipboard.readText()).catch(() => "")).trim() : "";
    const zoom = Math.round(Math.pow(1.2, page.getZoomLevel()) * 100);
    const template: MenuItemConstructorOptions[] = [
      { label: t("Zoom arrière"), accelerator: "CmdOrCtrl+-", click: () => this.stepZoom(-1) },
      { label: t("Taille réelle ({zoom} %)", { zoom }), accelerator: "CmdOrCtrl+0", click: () => this.setZoom(0) },
      { label: t("Zoom avant"), accelerator: "CmdOrCtrl+Plus", click: () => this.stepZoom(1) },
      { type: "separator" },
      { label: t("Nouvelle fenêtre"), accelerator: "CmdOrCtrl+N", click: () => this.shell.open(null) },
      { label: t("Copier le lien de la page"), click: () => clipboard.writeText(page.getURL()) },
      { label: t("Ouvrir dans le navigateur"), click: () => openExternal(page.getURL()) },
      ...(this.shell.app.id === "teams" ? [...this.teamsItems(copied), { type: "separator" as const }, ...this.shell.teamsMenu()] : []),
      { type: "separator" },
      { label: t("Réglages de Lucarne…"), click: () => this.shell.settingsApp() },
      { label: t("Quitter {name}", { name: this.shell.app.name }), accelerator: "CmdOrCtrl+Q", click: () => this.shell.quit() },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup(point ? { window: this.win, x: point[0], y: point[1] } : { window: this.win });
  }

  private teamsItems(copied: string): MenuItemConstructorOptions[] {
    const meeting = MEETING.test(copied);
    return [
      {
        label: t("Rejoindre la réunion copiée"),
        enabled: meeting,
        toolTip: meeting ? copied : t("Copie d'abord le lien d'invitation Teams"),
        click: () => this.load(copied),
      },
      { label: t("Statistiques vidéo de la réunion"), click: () => this.webrtcStats() },
    ];
  }

  /** chrome://webrtc-internals: resolution and frame rate actually received, decoder in use. */
  private webrtcStats(): void {
    const stats = new BrowserWindow({ width: 1100, height: 800, title: t("Statistiques vidéo"), autoHideMenuBar: true });
    void stats.loadURL("chrome://webrtc-internals").catch(() => undefined);
  }

  /** The page started or stopped sharing a screen (src/pagePreload.ts). */
  setSharing(surface: "monitor" | "window" | "browser" | null): void {
    if (this.sharing === surface) return;
    this.sharing = surface;
    if (!surface) {
      this.preview?.close();
      this.preview = null;
    }
    this.push();
  }

  /** A frame of what is being shared, for the preview window. */
  setPreview(frame: string): void {
    if (!this.sharing || !this.shell.conf().sharePreview || this.shell.hidden) return;
    const label = t(this.sharing === "window" ? "Fenêtre partagée" : this.sharing === "browser" ? "Onglet partagé" : "Écran partagé");
    if (!this.preview || this.preview.win.isDestroyed()) {
      const panel = openPanel("share", { width: 320, height: 214, title: t("Partage en cours"), resizable: true, alwaysOnTop: true, minWidth: 200, minHeight: 150 },
        (m) => {
          if ((m as { stop?: boolean }).stop) this.action("stopshare", null);
        }, { frame, label });
      panel.win.on("closed", () => {
        if (this.preview === panel) this.preview = null;
      });
      this.preview = panel;
      return;
    }
    this.preview.post({ frame, label });
  }

  action(name: string, point: [number, number] | null): void {
    const page = this.view.webContents;
    const actions: Record<string, () => void> = {
      back: () => page.navigationHistory.goBack(),
      forward: () => page.navigationHistory.goForward(),
      reload: () => (page.isLoading() ? page.stop() : page.reload()),
      home: () => this.load(homeUrl(this.shell.app, this.shell.conf())),
      retry: () => page.reload(),
      external: () => openExternal(page.getURL()),
      menu: () => void this.menu(point),
      stopshare: () => void page.executeJavaScript("window.__lucarneStopSharing?.()").catch(() => undefined),
    };
    actions[name]?.();
  }

  /** Keys elementary's Web browser answers to; Microsoft's own shortcuts pass through. */
  private handleKeys(contents: WebContents): void {
    contents.on("before-input-event", (event, input: Input) => {
      if (input.type !== "keyDown") return;
      const ctrl = input.control || input.meta;
      const page = this.view.webContents;
      const key = input.key;
      let handled = true;
      if (input.alt && key === "ArrowLeft") page.navigationHistory.goBack();
      else if (input.alt && key === "ArrowRight") page.navigationHistory.goForward();
      else if (input.alt && key === "Home") this.action("home", null);
      else if (key === "F5" || (ctrl && !input.shift && key.toLowerCase() === "r")) page.reload();
      else if (ctrl && (key === "+" || key === "=")) this.stepZoom(1);
      else if (ctrl && key === "-") this.stepZoom(-1);
      else if (ctrl && key === "0") this.setZoom(0);
      else if (ctrl && key.toLowerCase() === "q") this.shell.quit();
      else if (ctrl && key.toLowerCase() === "w") this.win.close();
      else if (key === "F11") this.win.setFullScreen(!this.win.isFullScreen());
      else if (key === "F10") void this.menu(null);
      else if (ctrl && input.alt && /^[1-5]$/.test(key) && this.shell.app.id === "teams") this.shell.openProfile(Number(key));
      else if (ctrl && input.alt && key.toLowerCase() === "p" && this.shell.app.id === "teams") void this.shell.teams?.popOut(page);
      else handled = false;
      if (handled) event.preventDefault();
    });
  }

  private guardNavigation(contents: WebContents): void {
    const app = this.shell.app;
    contents.setWindowOpenHandler(({ url, frameName }) => {
      if (frameName === "lucarne-mini" && url === "about:blank" && this.shell.teams) {
        // Meeting mini window (assets/teams-mini.js draws its header bar).
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            show: false,
            width: 400,
            height: 270,
            minWidth: 260,
            minHeight: 180,
            titleBarStyle: "hidden",
            backgroundColor: "#1e1e1e",
            autoHideMenuBar: true,
            minimizable: false,
            fullscreenable: false,
            title: t("Réunion"),
            icon: path.join(__dirname, "..", "assets", "icons", `${app.id}.png`),
          },
        };
      }
      if (frameName === "lucarne-share" && url === "about:blank" && this.shell.teams) {
        // A colleague's shared screen in a window of its own (assets/teams-mini.js).
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1280,
            height: 760,
            minWidth: 480,
            minHeight: 300,
            titleBarStyle: "hidden",
            backgroundColor: "#1e1e1e",
            autoHideMenuBar: true,
            title: t("Partage d'écran"),
            icon: path.join(__dirname, "..", "assets", "icons", `${app.id}.png`),
          },
        };
      }
      const target = appFor(url);
      if (target && target !== app.id) {
        openInApp(target, url);
        return { action: "deny" };
      }
      if (target === app.id && app.documents) {
        this.shell.open(url);
        return { action: "deny" };
      }
      if (isInside(url) || url === "about:blank") {
        // Sign-in pop-ups, message and meeting pop-outs: a child window on the same session.
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            backgroundColor: pageColour(),
            icon: path.join(__dirname, "..", "assets", "icons", `${app.id}.png`),
            // Sign-in pop-ups get the same bridge (security keys) as the page.
            webPreferences: { preload: path.join(__dirname, "pagePreload.js"), contextIsolation: true, sandbox: true },
          },
        };
      }
      openExternal(url);
      return { action: "deny" };
    });
    contents.on("did-create-window", (child, { frameName }) => {
      if (frameName === "lucarne-mini") this.shell.teams?.setMini(child);
    });
    const keepInside = (event: Electron.Event, url: string): void => {
      if (url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return;
      if (!isInside(url)) {
        event.preventDefault();
        openExternal(url);
        return;
      }
      const target = appFor(url);
      if (target && target !== app.id && this.revealed) {
        event.preventDefault();
        openInApp(target, url);
      }
    };
    contents.on("will-navigate", keepInside);
    contents.on("did-create-window", (child) => {
      // Sign-in pop-ups, pop-out chats and meetings: same rules as the page
      // (their own pop-ups, links outside Microsoft 365), sign-in helpers and
      // the right-click menu.
      this.guardNavigation(child.webContents);
      this.shell.signIn(child.webContents);
      attachContextMenu(child.webContents, (u) => this.load(u));
    });
  }
}
