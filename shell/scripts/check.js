// Checks that run without the app (npm run check, after tsc): the desktop
// side of notifications and presence against fake services on a private
// session bus, and Teams' banner relay in a headless Chrome when there is one.
// Run under dbus-run-session: nothing reaches the real desktop.

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const Module = require("module");

if (!process.env.DBUS_SESSION_BUS_ADDRESS || process.env.DBUS_SESSION_BUS_ADDRESS.includes("/run/user/")) {
  console.error("Run it under dbus-run-session (npm run check), not on the desktop's bus.");
  process.exit(2);
}

// A home of its own: the modules move folders of the former name at load.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "lucarne-check-home-"));
process.env.HOME = home;
process.on("exit", () => fs.rmSync(home, { recursive: true, force: true }));

// The page scripts are built in modules that import electron: a stub does.
const stub = path.join(os.tmpdir(), `lucarne-check-electron-${process.pid}.js`);
fs.writeFileSync(stub, `const h = { get: (t, k) => (k in t ? t[k] : new Proxy(function () {}, h)), apply: () => undefined, construct: () => new Proxy({}, h) };
module.exports = new Proxy({ ipcMain: { on() {} }, nativeTheme: { shouldUseDarkColors: false } }, h);`);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolve.call(this, request === "electron" ? stub : request, ...rest);
};
process.on("exit", () => fs.rmSync(stub, { force: true }));

const dbus = require("@holusion/dbus-next");
const dist = path.join(__dirname, "..", "dist");
const desktop = require(path.join(dist, "desktop.js"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function service(name, objectPath, iface) {
  const bus = dbus.sessionBus();
  bus.export(objectPath, iface);
  await bus.requestName(name, 0);
  return bus;
}

async function notifications() {
  const calls = [];
  class Server extends dbus.interface.Interface {
    Notify(app, replaces, icon, summary, body, actions, hints, timeout) {
      calls.push({ app, icon, summary, actions, entry: hints["desktop-entry"]?.value, image: hints["image-path"]?.value, timeout });
      return 42;
    }
    CloseNotification() {}
    ActionInvoked(id, key) { return [id, key]; }
    NotificationClosed(id, why) { return [id, why]; }
  }
  Server.configureMembers({
    methods: { Notify: { inSignature: "susssasa{sv}i", outSignature: "u" }, CloseNotification: { inSignature: "u" } },
    signals: { ActionInvoked: { signature: "us" }, NotificationClosed: { signature: "uu" } },
  });
  const server = new Server("org.freedesktop.Notifications");
  const bus = await service("org.freedesktop.Notifications", "/org/freedesktop/Notifications", server);
  let clicked = "";
  const id = await desktop.notify({
    summary: "Alice", body: "salut", icon: "lucarne-teams", image: "/tmp/alice.png", desktopEntry: "lucarne-teams",
    actions: [["default", "Afficher"], ["reply", "Répondre"]], onAction: (key) => (clicked = key),
  });
  assert.strictEqual(id, 42);
  assert.deepStrictEqual(calls[0], { app: "Lucarne", icon: "lucarne-teams", summary: "Alice", actions: ["default", "Afficher", "reply", "Répondre"], entry: "lucarne-teams", image: "/tmp/alice.png", timeout: -1 });
  server.ActionInvoked(42, "reply");
  await wait(100);
  assert.strictEqual(clicked, "reply", "a button of the bubble reaches its handler");
  bus.disconnect();
  console.log("ok  notification with buttons, desktop-entry lucarne-teams");
}

async function idle() {
  let next = 10;
  const watches = new Map();
  class Monitor extends dbus.interface.Interface {
    GetIdletime() { return 0n; }
    AddIdleWatch(ms) {
      watches.set(++next, Number(ms));
      return next;
    }
    AddUserActiveWatch() {
      const id = ++next;
      watches.set(id, "active");
      // Input already there: the watch fires before its id is returned.
      if (this.instant) this.WatchFired(id);
      return id;
    }
    RemoveWatch() {}
    WatchFired(id) { return id; }
  }
  Monitor.configureMembers({
    methods: { GetIdletime: { outSignature: "t" }, AddIdleWatch: { inSignature: "t", outSignature: "u" },
      AddUserActiveWatch: { outSignature: "u" }, RemoveWatch: { inSignature: "u" } },
    signals: { WatchFired: { signature: "u" } },
  });
  class Saver extends dbus.interface.Interface {
    GetActive() { return false; }
    ActiveChanged(on) { return on; }
  }
  Saver.configureMembers({ methods: { GetActive: { outSignature: "b" } }, signals: { ActiveChanged: { signature: "b" } } });
  const monitor = new Monitor("org.gnome.Mutter.IdleMonitor");
  const saver = new Saver("org.gnome.ScreenSaver");
  const bus = await service("org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core", monitor);
  bus.export("/org/gnome/ScreenSaver", saver);
  await bus.requestName("org.gnome.ScreenSaver", 0);

  const seen = [];
  assert(await desktop.watchIdle([15_000, 300_000], {
    idle: (ms) => seen.push(`idle ${ms}`), active: () => seen.push("active"), locked: (on) => seen.push(`locked ${on}`),
  }));
  const idOf = (what) => [...watches].filter(([, v]) => v === what).map(([k]) => k).pop();
  assert.strictEqual(watches.size, 2, "two idle watches, no active watch while typing");
  monitor.WatchFired(idOf(15_000));
  await wait(100);
  monitor.WatchFired(idOf("active"));
  saver.ActiveChanged(true);
  await wait(100);
  monitor.instant = true;
  monitor.WatchFired(idOf(15_000));
  await wait(150);
  assert.deepStrictEqual(seen, ["idle 15000", "active", "locked true", "idle 15000", "active"]);

  // Gala restarts: the watches are set again on the new one.
  bus.disconnect();
  watches.clear();
  const again = await service("org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core", new Monitor("org.gnome.Mutter.IdleMonitor"));
  await wait(200);
  assert.strictEqual(watches.size, 2, "watches set again after a restart");
  again.disconnect();
  console.log("ok  idle watches, screen lock, active watch firing early, Gala restart");
}

function chrome() {
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
    } catch {
      // next
    }
  }
  return "";
}

/** Runs a page in a headless Chrome; the page puts its answer in body[data-result]. */
function inChrome(browser, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lucarne-check-"));
  try {
    fs.writeFileSync(path.join(dir, "t.html"), `<!doctype html><body><div id="app"></div><script>${script}</script>`);
    const dom = execFileSync(browser, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${dir}/profile`,
      "--virtual-time-budget=8000", "--dump-dom", `file://${dir}/t.html`], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000,
      // No bus for Chrome: it would start desktop portals on the private one.
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" },
    });
    return JSON.parse((dom.match(/data-result="([^"]*)"/)?.[1] ?? "null").replace(/&quot;/g, '"'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A template literal of a built module, as the page receives it. */
const literal = (file, name, vars = {}) => {
  const source = fs.readFileSync(path.join(dist, file), "utf8");
  return new Function(...Object.keys(vars), `return ${source.match(new RegExp(`const ${name} = (\`[\\s\\S]*?\`);\n`))[1]};`)(...Object.values(vars));
};

function pages() {
  const browser = chrome();
  if (!browser) return console.log("--  page scripts skipped (no Chrome)");
  const FOCUS_HOOK = literal("window.js", "FOCUS_HOOK", { FOCUS_SIGNAL: "__lucarne_focus__" });
  const { teamsHub } = require(path.join(dist, "teams.js"));
  const relayed = inChrome(browser, `${FOCUS_HOOK}\n${teamsHub()}
const got = [];
addEventListener("message", (e) => { const ev = e.data && e.data.lucarneEvent; if (ev && ev.type === "banner") got.push(ev.title); });
window.__lucarneTeams.banners(true);
const banner = (title) => { const d = document.createElement("div"); d.setAttribute("data-testid", "notification-wrapper");
  d.innerHTML = '<div id="cn-normal-notification-toast-title-1">' + title + '</div><div id="cn-normal-notification-main-text-1">msg</div>';
  document.body.append(d); };
document.hasFocus = () => false; // window not focused: Teams also notifies by itself
new Notification("Alice", { body: "salut" });
setTimeout(() => banner("Alice"), 200);
setTimeout(() => banner("Carol"), 400);
setTimeout(() => new Notification("Carol", { body: "salut" }), 2400);
setTimeout(() => banner("Bob"), 1500);
setTimeout(() => document.body.setAttribute("data-result", JSON.stringify(got)), 6000);`);
  // Alice and Carol were notified by Teams itself, before or 2 s after their
  // banner: relayed once, from Teams' own notification. Bob had only a banner.
  assert.deepStrictEqual(relayed, ["Alice", "Carol", "Bob"]);
  console.log("ok  Teams notifications and banners relayed once each");

  // "Pop out" button: on a colleague's shared screen, not on a camera. Trusted
  // Types enforced as on Teams' page: an HTML string anywhere would throw.
  const popout = inChrome(browser, `const csp = document.createElement("meta"); csp.httpEquiv = "Content-Security-Policy";
csp.content = "require-trusted-types-for 'script'"; document.head.append(csp);
${FOCUS_HOOK}\n${teamsHub()}
const tile = (tid) => { const d = document.createElement("div"); d.setAttribute("data-tid", tid);
  const v = document.createElement("video"); const c = document.createElement("canvas"); c.width = c.height = 8;
  c.getContext("2d").fillRect(0, 0, 8, 8); v.srcObject = c.captureStream(); v.muted = true; v.play();
  d.append(v); document.body.append(d); return d; };
const share = tile("screen-sharing-content"), cam = tile("participant-video");
window.__lucarneTeams.mini.auto(true);
setTimeout(() => document.body.setAttribute("data-result", JSON.stringify([
  !!share.querySelector(".lucarne-popout"), !!cam.querySelector(".lucarne-popout")])), 3000);`);
  assert.deepStrictEqual(popout, [true, false]);
  console.log("ok  Teams: pop-out button on shared screens only");

  // Outlook's folder tree, current layout (hidden text after icon glyphs) and the former one (aria-label).
  const INBOX_JS = literal("main.js", "INBOX_JS");
  const counts = inChrome(browser, `
const tree = (html) => { document.body.innerHTML = html; return ${INBOX_JS}; };
document.body.setAttribute("data-result", JSON.stringify([
  tree('<div role="treeitem">\\ue488\\uebe1Favoris</div><div role="treeitem"><i>\\ue488\\uebe1\\uebe2</i>Boîte de réception<span>sélectionné</span><span>27</span><span>non lus</span></div>'),
  tree('<div role="treeitem" aria-label="Inbox 4 unread"></div>'),
  tree('<div role="treeitem">Éléments envoyés</div><div role="treeitem">Boîte de réception</div>'),
]));`);
  assert.deepStrictEqual(counts, [27, 4, 0]);
  console.log("ok  Outlook unread count read from its folder tree");
}

// The same address goes to the same app in the window (links.ts), the
// launcher (bin/lucarne) and the Chrome extension.
function links() {
  const urls = [
    "https://outlook.office.com/mail/", "https://outlook.cloud.microsoft/calendar", "https://teams.microsoft.com/l/chat/0/0",
    "https://teams.cloud.microsoft/v2/", "https://app.powerbi.com/groups/me", "https://word.cloud.microsoft/x",
    "https://excel.officeapps.live.com/x/_layouts/xlviewerinternal.aspx", "https://contoso.sharepoint.com/:w:/r/sites/A/Doc.docx",
    "https://contoso.sharepoint.com/:x:/g/personal/a/EQ", "https://1drv.ms/p/s!abc",
    "https://contoso.sharepoint.com/sites/A/_layouts/15/Doc.aspx?sourcedoc=%7B1%7D&file=Budget.xlsx&action=default",
    "https://contoso.sharepoint.com/sites/A/_layouts/15/Doc.aspx?sourcedoc=%7B1%7D&action=edit&wd=target%28Notes.one%29",
    "https://contoso.sharepoint.com/sites/A/_layouts/15/Doc.aspx?sourcedoc=%7B1%7D&app=Word",
    "https://contoso.sharepoint.com/sites/A/_layouts/15/Doc.aspx?sourcedoc=%7B1%7D",
    "https://onedrive.live.com/edit.aspx?resid=ABC!1&file=Deck.pptx", "https://contoso.sharepoint.com/sites/A/Shared%20Documents/",
    "https://www.office.com/launch/word", "https://example.com/",
  ];
  const { appFor } = require(path.join(dist, "links.js"));
  const window = urls.map((u) => appFor(u));
  const ext = fs.readFileSync(path.join(__dirname, "..", "..", "extension", "background.js"), "utf8");
  const extAppFor = new Function(`${ext.match(/const APPS = [^\n]*\n/)[0]}${ext.match(/const EXT = \{[\s\S]*?\n\};\n/)[0]}
${ext.match(/const LETTER = [^\n]*\n/)[0]}${ext.match(/function appFor\(raw\) \{[\s\S]*?\n\}\n/)[0]}return appFor;`)();
  const extension = urls.map((u) => extAppFor(u));
  const launcher = JSON.parse(execFileSync("python3", ["-c", `
import importlib.machinery, importlib.util, json, sys
sys.path.insert(0, sys.argv[1])
loader = importlib.machinery.SourceFileLoader("lucarne", sys.argv[1] + "/lucarne")
lucarne = importlib.util.module_from_spec(importlib.util.spec_from_loader("lucarne", loader))
loader.exec_module(lucarne)
print(json.dumps([lucarne.app_for_url(u) for u in sys.argv[2:]]))`, path.join(__dirname, "..", "..", "bin"), ...urls],
  { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }));
  assert.deepStrictEqual(window, launcher, "links.ts and bin/lucarne");
  assert.deepStrictEqual(extension, launcher, "extension and bin/lucarne");
  console.log(`ok  ${urls.length} addresses go to the same app in the window, the launcher and the extension`);
}

// Over the limit: the code and GPU caches go at the next start, the HTTP
// cache only when it alone passes the limit; sign-in data always stays.
async function cache() {
  const { trimCache } = require(path.join(dist, "housekeeping.js"));
  const timers = [];
  const realTimeout = global.setTimeout;
  global.setTimeout = (f) => (timers.push(f), { unref() {} });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lucarne-check-cache-"));
  const put = (rel, kb) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), Buffer.alloc(kb * 1024));
  };
  const there = (rel) => fs.existsSync(path.join(dir, rel));
  const measure = async () => {
    timers.splice(0).forEach((f) => f());
    await new Promise((r) => realTimeout(r, 200));
  };
  try {
    put("Cache/Cache_Data/a", 600); put("Code Cache/js/b", 300); put("Partitions/teams-x/GPUCache/c", 200);
    put("Local Storage/keep", 1); put("Partitions/teams-x/IndexedDB/keep", 1);
    trimCache(dir, 2); await measure();
    assert(!there("cache-over-limit"), "1.1 MB under a 2 MB limit");
    trimCache(dir, 1); await measure();
    assert(there("Cache") && there("cache-over-limit"), "measured, nothing cleared yet");
    trimCache(dir, 1);
    assert(there("Cache/Cache_Data/a") && !there("Code Cache") && !there("Partitions/teams-x/GPUCache"), "code and GPU caches cleared, HTTP kept");
    put("Cache/Cache_Data/d", 600);
    trimCache(dir, 1); await measure(); trimCache(dir, 1);
    assert(!there("Cache"), "HTTP cache alone over the limit: cleared too");
    assert(there("Local Storage/keep") && there("Partitions/teams-x/IndexedDB/keep") && !there("cache-over-limit"));
    trimCache(dir, 0);
    assert(!timers.length, "limit 0: never");
  } finally {
    global.setTimeout = realTimeout;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("ok  cache limit: code and GPU caches cleared, HTTP cache left to Chromium");
}

(async () => {
  await cache();
  links();
  await notifications();
  await idle();
  pages();
  desktop.closeDesktop();
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
