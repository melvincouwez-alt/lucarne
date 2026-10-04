// What teams-for-linux adds to the Teams web page, done our way: Teams' own
// services are reached through its React root (coreServices), as that project
// does, and report back through window.postMessage (src/pagePreload.ts).
//
// - Incoming call: our own window (or a notification) with Answer / Video / Decline.
// - Presence: Teams only sees activity inside its own window, so working in
//   another app turns you "Away"; system activity (Gala's idle monitor) is
//   passed on to it, and a locked or idle session can turn you Away.
// - Status set from the panel icon (Teams' presence service, with its token).
// - Quick chat: find someone and write to them without opening Teams (Graph).
// - Calls keep the screen awake; the shared screen shows in a small window.
// - Teams' light or dark theme follows elementary's.

import { spawn, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { nativeTheme, net, powerSaveBlocker, type BrowserWindow, type WebContents } from "electron";
import type { AppConfig } from "./config";
import { closeNotice, idleSeconds, notify, screenLocked, toggleAbove } from "./desktop";
import { openPanel, type Panel } from "./panel";
import { strings, t } from "./i18n";

/** Injected into the page (main world) once it is up. */
const HUB = `(() => {
  if (window.__lucarneTeams) return;
  const emit = (type, data) => window.postMessage({ lucarneEvent: { type, ...data } }, "*");
  const core = () => {
    try {
      const el = document.getElementById("app");
      const root = el && (el._reactRootContainer?._internalRoot || el._reactRootContainer);
      const props = root?.current?.updateQueue?.baseState?.element?.props;
      return props?.coreServices || props?.children?.props?.coreServices || null;
    } catch { return null; }
  };
  const tracker = () => core()?.clientState?._idleTracker;
  const buttons = () => {
    const box = document.querySelector('[data-testid="calling-actions"],[data-testid="msn-actions"]');
    return box ? [...box.querySelectorAll("button")] : [];
  };
  // The caller's photo needs the page's cookies: read it here, hand over a data URL.
  const picture = async (src) => {
    if (!src || typeof src !== "string") return "";
    try {
      const blob = await (await fetch(src, { credentials: "include" })).blob();
      if (!blob.type.startsWith("image/") || blob.size > 2e6) return "";
      return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(""); r.readAsDataURL(blob); });
    } catch { return ""; }
  };

  // Calls: the page's command stream (same filters as teams-for-linux).
  let tries = 0;
  const subscribe = () => {
    const reporting = core()?.commandChangeReportingService;
    if (!reporting) return false;
    reporting.observeChanges().subscribe((e) => {
      try {
        if (!["CommandStart", "ScenarioMarked"].includes(e.type)) return;
        if (!["internal-command-handler", "use-command-reporting-callbacks"].includes(e.context?.target)) return;
        const opts = e.context.entityCommand?.entityOptions;
        if (opts?.isIncomingCall) {
          if (opts.crossClientScenarioName === "incoming_call") {
            const data = { caller: String(opts.title || ""), text: String(opts.text || "") };
            emit("incoming", data);
            picture(opts.mainImage?.src).then((image) => image && emit("incoming", { ...data, image }));
          } else emit("incoming-end", {});
        } else if (e.context.step === "calling-screen-rendered") emit("call", { on: true });
        else if (e.context.step === "render_disconected") emit("call", { on: false });
      } catch {}
    });
    emit("ready", {});
    return true;
  };
  const timer = setInterval(() => { if (subscribe() || ++tries > 60) clearInterval(timer); }, 5000);

  // Fallback for the end of a call (hanging up from a pop-out does not always
  // report): count the peer connections that are up.
  const PC = window.RTCPeerConnection;
  if (PC) {
    const live = new Set();
    const sync = (pc, up) => { const had = live.size; up ? live.add(pc) : live.delete(pc); if (!had !== !live.size) emit("rtc", { live: live.size }); };
    const Wrapped = function (...args) {
      const pc = new PC(...args);
      pc.addEventListener("connectionstatechange", () => sync(pc, pc.connectionState === "connected"));
      const close = pc.close.bind(pc);
      pc.close = () => { close(); sync(pc, false); };
      return pc;
    };
    Wrapped.prototype = PC.prototype;
    Object.setPrototypeOf(Wrapped, PC);
    window.RTCPeerConnection = Wrapped;
  }

  // Own status as shown on the avatar (aria-label), for the panel icon's menu.
  const STATUS = [
    ["DoNotDisturb", /ne pas déranger|do not disturb|présentation|presenting|focus/i],
    ["Busy", /occupé|busy|en réunion|in a meeting|en communication|in a call/i],
    ["BeRightBack", /de retour|be right back/i],
    ["Away", /absent|away/i],
    ["Offline", /hors connexion|offline|invisible/i],
    ["Available", /disponible|available/i],
  ];
  const status = () => {
    const el = document.querySelector('[data-tid="me-control-avatar-presence"], [data-tid="me-control-presence-icon"], [data-tid="me-control-avatar-trigger"] [class*="presence" i]');
    const label = el ? (el.getAttribute("aria-label") || el.getAttribute("title") || "") : "";
    const hit = STATUS.find(([, re]) => re.test(label));
    return hit ? hit[0] : "";
  };

  // Banners Teams draws in its own window (new message…): sent to the system's
  // notifications and hidden; a click on ours clicks theirs (opens the chat).
  const BANNER = '[data-testid="notification-wrapper"]';
  const shown = new Map();
  let bannersOn = false;
  let bannerId = 0;
  let pending = 0;
  const part = (box, name) => (box.querySelector('[id^="cn-normal-notification-' + name + '"]')?.innerText || "").trim();
  const scan = () => {
    pending = 0;
    for (const box of document.querySelectorAll(BANNER)) {
      if (box.__lucarneBanner) continue;
      let title = part(box, "toast-title");
      let body = part(box, "main-text");
      const subtitle = part(box, "subtitle");
      if (!title && !body) {
        const noise = new Set(["Microsoft Teams", "Envoyer une réponse rapide", "Send a quick reply"]);
        const lines = (box.innerText || "").split("\\n").map((s) => s.trim()).filter((s) => s && !noise.has(s));
        if (!lines.length) continue;
        [title, body] = [lines[0], lines.slice(1, 4).join("\\n")];
      }
      box.__lucarneBanner = true;
      box.style.setProperty("display", "none", "important");
      const id = ++bannerId;
      shown.set(id, new WeakRef(box));
      if (shown.size > 50) shown.delete(shown.keys().next().value);
      const data = { id, title: title.slice(0, 200), body: (subtitle && subtitle !== title ? subtitle + " : " : "") + body.slice(0, 500) };
      const src = box.querySelector('[data-testid="normal-toast-image"] img')?.src;
      picture(src).then((image) => emit("banner", { ...data, image }));
    }
  };
  new MutationObserver(() => { if (bannersOn && !pending) pending = setTimeout(scan, 300); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.__lucarneTeams = {
    banners: (on) => { bannersOn = Boolean(on); },
    openBanner: (id) => {
      const box = shown.get(id)?.deref();
      if (!box?.isConnected) return false;
      box.click();
      return true;
    },
    active: () => { try { tracker()?.handleMonitoredWindowEvent(); } catch {} },
    idle: () => { try { tracker()?.transitionToIdle(); } catch {} },
    status,
    theme: (dark) => {
      const theme = core()?.clientPreferences?.clientPreferences?.theme;
      // Only light <-> dark: a high-contrast choice made in Teams stays.
      if (theme && ["default", "dark"].includes(theme.userTheme)) theme.userTheme = dark ? "dark" : "default";
    },
    // Toast buttons: [video, audio, decline] or [accept, decline].
    answer: (how) => {
      const b = buttons();
      if (!b.length) return false;
      if (how === "decline") b[b.length - 1].click();
      else if (how === "audio" && b.length === 3) b[1].click();
      else b[0].click();
      return true;
    },
    // A token for another Microsoft service, from Teams' own sign-in.
    token: async (resource) => {
      const c = core();
      const auth = c?.authenticationService?._coreAuthService?._authProvider;
      if (!auth?.acquireToken) return "";
      try {
        const r = await auth.acquireToken(resource, { correlation: c.correlation, forceRenew: false, forceRefresh: false, skipCache: false, prompt: "none" });
        return r?.token || "";
      } catch { return ""; }
    },
  };
})();`;

const MINI = fs.readFileSync(path.join(__dirname, "..", "assets", "teams-mini.js"), "utf8");

/** Injected into the page (main world) once it is up: the interface strings, the hub, then the meeting mini window. */
export function teamsHub(): string {
  const { lang, strings: dict } = strings();
  return `window.__lucarneLang = ${JSON.stringify(lang)}; window.__lucarneStrings = ${JSON.stringify(dict)};\n${HUB}${MINI}`;
}

/** Messages the page script sends. */
export type TeamsEvent =
  | { type: "ready" }
  | { type: "incoming"; caller: string; text: string; image?: string }
  | { type: "incoming-end" }
  | { type: "call"; on: boolean }
  | { type: "rtc"; live: number }
  | { type: "banner"; id: number; title: string; body: string; image?: string }
  | { type: "mini-pin"; on: boolean }
  | { type: "mini-show" };

export type Availability = "Available" | "Busy" | "DoNotDisturb" | "BeRightBack" | "Away" | "Offline";
/** Status and its label (French; t() at display time). */
export const STATUSES: [Availability, string][] = [
  ["Available", "Disponible"],
  ["Busy", "Occupé"],
  ["DoNotDisturb", "Ne pas déranger"],
  ["BeRightBack", "De retour bientôt"],
  ["Away", "Absent"],
  ["Offline", "Apparaître hors ligne"],
];

const AVATARS = path.join(os.homedir(), ".cache/lucarne/avatars");

/** Senders' photos for notifications: those over 30 days old go, and no more than 200 are kept. */
function trimAvatars(): void {
  try {
    const files = fs.readdirSync(AVATARS).flatMap((name) => {
      const file = path.join(AVATARS, name);
      try {
        const st = fs.statSync(file);
        return st.isFile() ? [{ file, at: st.mtimeMs }] : [];
      } catch {
        return [];
      }
    }).sort((a, b) => b.at - a.at);
    const old = Date.now() - 30 * 86_400_000;
    files.forEach((f, i) => {
      if (i >= 200 || f.at < old) fs.rmSync(f.file, { force: true });
    });
  } catch {
    // no folder yet
  }
}
const AWAY_AFTER = 300;
const GRAPH = "https://graph.microsoft.com";
const PRESENCE = "https://presence.teams.microsoft.com";

async function evalIn<T>(page: WebContents | null, js: string): Promise<T | null> {
  if (!page || page.isDestroyed()) return null;
  try {
    return (await page.executeJavaScript(js)) as T;
  } catch {
    return null;
  }
}

export class TeamsFeatures {
  private notice = 0;
  private callPanel: Panel | null = null;
  private ringing: WebContents | null = null;
  private blocker = -1;
  private inCall = false;
  private rtc = false;
  private away = false;
  private timer: NodeJS.Timeout;
  private command: ChildProcess | null = null;
  private chat: Panel | null = null;
  private mini: BrowserWindow | null = null;
  private miniAbove = false;

  constructor(
    /** Teams pages, main account first. */
    private pages: () => WebContents[],
    private conf: () => AppConfig,
    private show: (page: WebContents | null) => void,
    private openUrl: (url: string) => void,
  ) {
    this.timer = setInterval(() => void this.presence(), 10_000);
    trimAvatars();
  }

  private run(js: string, page?: WebContents | null): void {
    for (const p of page ? [page] : this.pages())
      if (!p.isDestroyed()) void p.executeJavaScript(js).catch(() => undefined);
  }

  inject(page: WebContents): void {
    this.run(teamsHub(), page);
  }

  handle(event: TeamsEvent, page: WebContents): void {
    switch (event.type) {
      case "ready":
        this.applyTheme(page);
        this.run(`window.__lucarneTeams?.banners(${this.conf().banners && this.conf().notify}); window.__lucarneTeams?.mini?.auto(${this.conf().miniWindow})`, page);
        break;
      case "banner":
        void this.banner(event, page);
        break;
      case "mini-pin":
        void this.pinMini(event.on, page);
        break;
      case "mini-show":
        this.show(page);
        break;
      case "incoming":
        void this.ring(event, page);
        break;
      case "incoming-end":
        this.stopRinging();
        break;
      case "call":
        this.inCall = event.on;
        this.awake();
        break;
      case "rtc":
        this.rtc = event.live > 0;
        if (!this.rtc) this.inCall = false;
        this.awake();
        break;
    }
  }

  /** A banner from inside the window, as a system notification (with the sender's photo). */
  private async banner(b: { id: number; title: string; body: string; image?: string }, page: WebContents): Promise<void> {
    let icon = "lucarne-teams";
    const m = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/.exec(b.image ?? "");
    if (m) {
      try {
        const file = path.join(AVATARS, `${createHash("sha1").update(m[2]).digest("hex").slice(0, 16)}.${m[1]}`);
        if (!fs.existsSync(file)) {
          fs.mkdirSync(AVATARS, { recursive: true });
          fs.writeFileSync(file, Buffer.from(m[2], "base64"));
        }
        icon = file;
      } catch {
        // the app icon then
      }
    }
    const open = (): void => {
      this.show(page);
      this.run(`window.__lucarneTeams?.openBanner(${b.id})`, page);
    };
    await notify({
      summary: b.title,
      body: b.body,
      icon,
      desktopEntry: "lucarne-teams",
      actions: [["default", t("Afficher")], ["reply", t("Répondre|message")]],
      onAction: open,
    });
  }

  /** The meeting mini window (assets/teams-mini.js) was opened by the page. */
  setMini(child: BrowserWindow): void {
    this.mini = child;
    this.miniAbove = false;
    child.once("ready-to-show", () => child.showInactive());
    child.on("closed", () => {
      if (this.mini === child) this.mini = null;
    });
  }

  /** Pin: Gala keeps the window above the others (its "always on top" acts on the focused window). */
  private async pinMini(on: boolean, page: WebContents): Promise<void> {
    const mini = this.mini;
    if (!mini || mini.isDestroyed() || on === this.miniAbove) return;
    const hadFocus = mini.isFocused();
    mini.focus();
    await new Promise((done) => setTimeout(done, hadFocus ? 0 : 150));
    if (await toggleAbove()) this.miniAbove = on;
    if (!hadFocus && on) this.show(page);
  }

  applyTheme(page?: WebContents): void {
    if (this.conf().theme) this.run(`window.__lucarneTeams?.theme(${nativeTheme.shouldUseDarkColors})`, page);
  }

  private answer(how: string): void {
    const page = this.ringing;
    this.run(`window.__lucarneTeams?.answer(${JSON.stringify(how)})`, page);
    if (how !== "decline") this.show(page);
    this.stopRinging();
  }

  private async ring(call: { caller: string; text: string; image?: string }, page: WebContents): Promise<void> {
    const conf = this.conf();
    const again = this.ringing === page && (this.callPanel || this.notice);
    this.ringing = page;
    if (!again && conf.callCommand.trim()) {
      this.stopCommand();
      // Its own process group: stopping the ring stops what the command started too (a player…).
      const proc = spawn("sh", ["-c", conf.callCommand, "lucarne-call", call.caller, call.text], { stdio: "ignore", detached: true });
      this.command = proc;
      proc.on("error", () => undefined);
      proc.on("exit", () => {
        if (this.command === proc) this.command = null;
      });
    }
    if (!conf.calls) return;
    if (conf.callWindow) {
      // The photo arrives in a second message: the open window is updated.
      if (this.callPanel && !this.callPanel.win.isDestroyed()) return this.callPanel.post(call);
      const panel = openPanel("call", { width: 380, height: 170, title: t("Appel de {name}", { name: call.caller || "Teams" }), alwaysOnTop: true, skipTaskbar: false },
        (m) => {
          const how = (m as { answer?: unknown }).answer;
          if (how === "audio" || how === "video" || how === "decline") this.answer(how);
        }, call);
      panel.win.once("ready-to-show", () => panel.win.show());
      panel.win.on("closed", () => {
        if (this.callPanel === panel) this.callPanel = null;
      });
      this.callPanel = panel;
      return;
    }
    if (again) return;
    this.notice = await notify({
      summary: call.caller ? t("Appel de {name}", { name: call.caller }) : t("Appel entrant"),
      body: call.text || "Teams",
      icon: "lucarne-teams",
      desktopEntry: "lucarne-teams",
      urgent: true,
      actions: [["default", t("Afficher")], ["audio", t("Répondre")], ["video", t("Vidéo")], ["decline", t("Refuser")]],
      onAction: (key) => (key === "default" ? this.show(this.ringing) : this.answer(key)),
    }, this.notice);
  }

  private stopRinging(): void {
    void closeNotice(this.notice);
    this.notice = 0;
    this.callPanel?.close();
    this.callPanel = null;
    this.stopCommand();
  }

  /** The ring command and everything it started (its process group). */
  private stopCommand(): void {
    const proc = this.command;
    this.command = null;
    if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return;
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      proc.kill();
    }
  }

  /** Screen stays on during a call. */
  private awake(): void {
    const want = this.inCall || this.rtc;
    const on = this.blocker >= 0 && powerSaveBlocker.isStarted(this.blocker);
    if (want && !on) this.blocker = powerSaveBlocker.start("prevent-display-sleep");
    else if (!want && on) {
      powerSaveBlocker.stop(this.blocker);
      this.blocker = -1;
    }
  }

  private async presence(): Promise<void> {
    const conf = this.conf();
    if (!conf.presence && !conf.awayIdle) return;
    const [idle, locked] = await Promise.all([idleSeconds(), screenLocked()]);
    if (idle === null) return;
    const gone = locked || idle >= AWAY_AFTER;
    if (!gone) {
      this.away = false;
      // Recent input anywhere in the session counts as activity in Teams.
      if (conf.presence && idle < 15) this.run("window.__lucarneTeams?.active()");
    } else if (conf.awayIdle && !this.away && !this.inCall && !this.rtc) {
      this.away = true;
      this.run("window.__lucarneTeams?.idle()");
    }
  }

  private token(resource: string, page?: WebContents | null): Promise<string | null> {
    return evalIn<string>(page ?? this.pages()[0] ?? null, `window.__lucarneTeams?.token(${JSON.stringify(resource)})`);
  }

  private async call(page: WebContents | null, resource: string, url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
    const token = await this.token(resource, page);
    if (!token) throw new Error(t("Teams n'a pas donné de jeton (pas encore connecté ?)"));
    const res = await net.fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      session: page?.session,
    } as RequestInit);
    if (!res.ok) throw new Error(t("{host} a répondu {status}", { host: new URL(url).host, status: res.status }));
    return res;
  }

  /** Status shown on the avatar of the main account ("" when unknown). */
  async status(): Promise<Availability | ""> {
    return (await evalIn<Availability | "">(this.pages()[0] ?? null, "window.__lucarneTeams?.status() || ''")) ?? "";
  }

  /** Sets the status of the main account; null goes back to automatic. */
  async setStatus(availability: Availability | null): Promise<void> {
    const page = this.pages()[0] ?? null;
    const url = `${PRESENCE}/v1/me/forceavailability/`;
    if (availability) await this.call(page, PRESENCE, url, { method: "PUT", body: { availability } });
    else await this.call(page, PRESENCE, url, { method: "DELETE" });
  }

  /** Meeting mini window opened or closed by hand (menu, Ctrl+Alt+P). */
  async popOut(page?: WebContents | null): Promise<boolean> {
    for (const p of page ? [page] : this.pages()) {
      if (p.isDestroyed()) continue;
      for (const frame of p.mainFrame.framesInSubtree) {
        const done = await frame.executeJavaScript("window.__lucarneTeams?.mini?.toggle() ?? false", true).catch(() => false);
        if (done) return true;
      }
    }
    return false;
  }

  /** Small window: search people, write a message, send it through Graph. */
  quickChat(): void {
    if (this.chat && !this.chat.win.isDestroyed()) {
      this.chat.win.show();
      this.chat.win.focus();
      return;
    }
    const page = this.pages()[0] ?? null;
    let me = "";
    const chat = openPanel("chat", { width: 460, height: 440, title: t("Discussion rapide"), resizable: true }, async (m) => {
      const msg = m as { search?: string; send?: { id?: string; mail?: string; text?: string }; open?: string };
      try {
        if (typeof msg.search === "string") {
          if (msg.search.length < 2) return chat.post({ results: [] });
          const q = encodeURIComponent(`"${msg.search.replace(/"/g, "")}"`);
          const res = await this.call(page, GRAPH, `${GRAPH}/v1.0/me/people?$search=${q}&$top=12&$select=id,displayName,jobTitle,scoredEmailAddresses,userPrincipalName`);
          const data = (await res.json()) as { value: { id: string; displayName: string; jobTitle?: string; userPrincipalName?: string; scoredEmailAddresses?: { address: string }[] }[] };
          chat.post({ results: data.value.map((p) => ({ id: p.id, name: p.displayName, title: p.jobTitle ?? "", mail: p.userPrincipalName || p.scoredEmailAddresses?.[0]?.address || "" })) });
        } else if (msg.send?.text && (msg.send.id || msg.send.mail)) {
          if (!me) me = ((await (await this.call(page, GRAPH, `${GRAPH}/v1.0/me?$select=id`)).json()) as { id: string }).id;
          const member = (who: string) => ({
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            roles: ["owner"],
            // OData string: a quote in the address is doubled.
            "user@odata.bind": `${GRAPH}/v1.0/users('${who.replace(/'/g, "''")}')`,
          });
          const other = msg.send.mail || msg.send.id!;
          const created = await this.call(page, GRAPH, `${GRAPH}/v1.0/chats`, { method: "POST", body: { chatType: "oneOnOne", members: [member(me), member(other)] } });
          const { id } = (await created.json()) as { id: string };
          const html = msg.send.text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>");
          await this.call(page, GRAPH, `${GRAPH}/v1.0/chats/${encodeURIComponent(id)}/messages`, { method: "POST", body: { body: { contentType: "html", content: html } } });
          chat.post({ sent: true });
        } else if (typeof msg.open === "string" && msg.open) {
          this.openUrl(`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(msg.open)}`);
        }
      } catch (err) {
        chat.post({ error: t("{message}. « Ouvrir dans Teams » reste possible.", { message: (err as Error).message }) });
      }
    });
    chat.win.once("ready-to-show", () => chat.win.show());
    chat.win.on("closed", () => {
      if (this.chat === chat) this.chat = null;
    });
    this.chat = chat;
  }

  close(): void {
    clearInterval(this.timer);
    this.stopRinging();
    this.chat?.close();
    this.inCall = this.rtc = false;
    this.awake();
  }
}
