// Service worker de Lucarne : renvoie vers les fenêtres du bureau (appli
// Electron lucarne, via l'hôte natif et le lanceur lucarne) les pages
// Microsoft 365 ouvertes dans un onglet Chrome ordinaire.
const HOST = "io.github.melvincouwez.lucarne";
const APPS = ["word", "excel", "powerpoint", "onenote", "outlook", "teams", "powerbi"];
const EXT = {
  word: ["doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "rtf"],
  excel: ["xls", "xlsx", "xlsm", "xlsb", "xlt", "xltx", "xltm", "ods", "csv"],
  powerpoint: ["ppt", "pptx", "pptm", "pps", "ppsx", "pot", "potx", "odp"],
  onenote: ["one", "onetoc2", "onepkg"],
};
const LETTER = { w: "word", x: "excel", p: "powerpoint", o: "onenote" };

let port = null;
let state = { config: null, vmApps: [], language: null };

// Même logique que app_for_url() dans bin/lucarne
function appFor(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname, path = u.pathname, q = u.searchParams;
  if (/(^|\.)outlook\.(office|office365|live)\.com$/.test(host) || host === "outlook.cloud.microsoft") return "outlook";
  if (["teams.microsoft.com", "teams.cloud.microsoft", "teams.live.com"].includes(host)) return "teams";
  if (["app.powerbi.com", "app.fabric.microsoft.com"].includes(host)) return "powerbi";
  for (const a of ["word", "excel", "powerpoint", "onenote"]) {
    if (host === `${a}.cloud.microsoft` || host === `${a}.office.com`) return a;
    if (host.endsWith(".officeapps.live.com") && host.startsWith(a)) return a;
  }
  if (host.endsWith(".sharepoint.com") || host === "onedrive.live.com" || host === "1drv.ms") {
    const m = path.match(/^\/:?([wxpo]):?\//);
    if (m) return LETTER[m[1]];
    if (/\/_layouts\/15\/(Doc|WopiFrame|WopiFrame2)\.aspx$/i.test(path) ||
        (host === "onedrive.live.com" && ["/edit", "/edit.aspx", "/view.aspx"].includes(path))) {
      const name = q.get("file") || q.get("resid") || "";
      const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
      for (const [a, list] of Object.entries(EXT)) if (list.includes(ext)) return a;
      if ((q.get("wd") || "").startsWith("target(")) return "onenote";
      const appq = (q.get("app") || "").toLowerCase();
      return APPS.includes(appq) ? appq : null;
    }
  }
  return null;
}

// Adresse du fichier derrière un lien SharePoint (partage /:x:/g/…, Doc.aspx?sourcedoc=…).
// Même principe que file_url() dans bin/lucarne, qui ne sait faire que les liens à chemin.
async function fileUrl(raw) {
  try {
    let u = new URL(raw);
    if (!u.hostname.endsWith(".sharepoint.com")) return null;
    let m = u.pathname.match(/^\/:[wxpo]:\/r(\/.+)$/);
    if (m) return u.origin + m[1];
    if (/^\/:[wxpo]:\//.test(u.pathname)) {
      // lien de partage à jeton : suivre la redirection jusqu'à Doc.aspx
      const r = await fetch(raw, { credentials: "include", redirect: "follow" });
      u = new URL(r.url);
    }
    const doc = u.pathname.match(/^(.*)\/_layouts\/15\/(Doc|WopiFrame2?)\.aspx$/i);
    const guid = (u.searchParams.get("sourcedoc") || "").replace(/[{}]/g, "");
    if (doc && guid) {
      const api = `${u.origin}${doc[1]}/_api/web/GetFileById('${guid}')?$select=ServerRelativeUrl`;
      const r = await fetch(api, { credentials: "include", headers: { Accept: "application/json;odata=nometadata" } });
      if (r.ok) {
        const j = await r.json();
        if (j.ServerRelativeUrl) return u.origin + encodeURI(j.ServerRelativeUrl);
      }
    }
  } catch (e) {
    console.warn("fileUrl", raw, e);
  }
  return null;
}

// ------------------------------------------------------------ langue

const TEXT = {
  fr: {
    on: "Lucarne : renvoi des liens activé",
    off: "Lucarne : renvoi des liens désactivé",
  },
  en: {
    on: "Lucarne: sending links to the apps",
    off: "Lucarne: link sending turned off",
  },
};

// Langue résolue envoyée par l'hôte natif ; sans elle, celle de Chrome
function lang() {
  if (state.language === "fr" || state.language === "en") return state.language;
  return (chrome.i18n.getUILanguage() || "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

// ------------------------------------------------------------ hôte natif

function connect() {
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (e) {
    port = null;
    return;
  }
  port.onMessage.addListener(msg => {
    if (msg.type === "config") {
      state = { config: msg.config, vmApps: msg.vmApps || [], language: msg.language || null };
      chrome.storage.session.set({ state });
      refreshBadge();
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 5000);
  });
  port.postMessage({ type: "hello" });
}

// Vrai si le message est parti (le port peut être tombé entre-temps)
function toHost(msg) {
  if (!port) return false;
  try {
    port.postMessage(msg);
    return true;
  } catch (e) {
    console.warn("toHost", e);
    port = null;
    return false;
  }
}

// La config est gardée dans storage.session : Chrome arrête le service worker quand il veut
async function loadState() {
  if (!state.config) {
    const { state: s } = await chrome.storage.session.get("state");
    if (s) state = s;
  }
  return state;
}

async function cfg(app) {
  await loadState();
  return state.config && state.config.apps && state.config.apps[app];
}

// ------------------------------------------------------------ onglets ordinaires

// Ensembles d'onglets gardés en storage.session pour survivre à l'arrêt du service worker :
// visited = onglets qui ont déjà affiché une page (on y revient en arrière au lieu de les
// fermer), exempt = onglets ouverts par « Ouvrir dans le navigateur » d'une appli Lucarne.
async function tabSet(name) {
  const got = await chrome.storage.session.get(name);
  return got[name] || {};
}
// Lecture-modification-écriture à la file, pour ne pas perdre un onglet entre deux appels
let chain = Promise.resolve();
function locked(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}
function tabSetAdd(name, tabId) {
  return locked(async () => {
    const set = await tabSet(name);
    if (set[tabId]) return;
    set[tabId] = true;
    await chrome.storage.session.set({ [name]: set });
  });
}
function tabSetDel(name, tabId) {
  return locked(async () => {
    const set = await tabSet(name);
    if (!set[tabId]) return;
    delete set[tabId];
    await chrome.storage.session.set({ [name]: set });
  });
}

chrome.tabs.onRemoved.addListener(id => {
  tabSetDel("visited", id);
  tabSetDel("exempt", id);
});

// Marqueur posé par l'appli Electron sur les adresses qu'elle envoie au navigateur :
// url#lucarne-browser, ou url#fragment&lucarne-browser. Renvoie l'adresse sans lui, ou null.
const MARK = "lucarne-browser";
function stripMark(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!u.hash) return null;
  const parts = u.hash.slice(1).split("&");
  if (!parts.includes(MARK)) return null;
  const rest = parts.filter(p => p !== MARK).join("&");
  u.hash = rest;
  // « url# » vide : on retire aussi le dièse
  return rest ? u.href : u.href.replace(/#$/, "");
}

async function captureOn() {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  return enabled;
}

// Retire l'onglet : retour en arrière s'il a un historique, fermeture sinon
async function back(tabId) {
  const visited = await tabSet("visited");
  if (visited[tabId]) {
    try {
      await chrome.tabs.goBack(tabId);
      return;
    } catch { /* pas d'historique finalement */ }
  }
  chrome.tabs.remove(tabId).catch(() => {});
}

async function markExempt(d) {
  const clean = stripMark(d.url);
  if (clean === null) return false;
  await tabSetAdd("exempt", d.tabId);
  chrome.tabs.update(d.tabId, { url: clean }).catch(() => {});
  return true;
}

chrome.webNavigation.onBeforeNavigate.addListener(async d => {
  if (d.frameId !== 0 || d.tabId < 0) return;
  if (await markExempt(d)) return;
  const app = appFor(d.url);
  if (!app || !port || !(await captureOn())) return;
  if ((await tabSet("exempt"))[d.tabId]) return;
  const c = await cfg(app);
  // Sans config (hôte pas encore répondu), on ne capture rien
  if (!c) return;
  // appli en ligne désactivée : le lien reste dans Chrome, sauf s'il part vers la VM
  if (!c.capture || (c.enabled === false && c.target !== "vm")) return;
  let tab, win;
  try {
    tab = await chrome.tabs.get(d.tabId);
    win = await chrome.windows.get(tab.windowId);
  } catch { return; }
  if (win.type !== "normal") return;
  const msg = { type: "launch", app, url: d.url };
  // Office de bureau (VM) : il lui faut l'adresse du fichier, pas la page SharePoint.
  // Résolue ici, avec la session SharePoint du navigateur.
  if (c.target === "vm" && ["word", "excel", "powerpoint"].includes(app)) {
    const file = await fileUrl(d.url);
    if (file) msg.file = file;
  }
  // L'onglet ne part qu'une fois le lien remis à l'hôte
  if (toHost(msg)) back(d.tabId);
});

// Page principale engagée : l'onglet a désormais un historique (visited), et
// filet de sécurité pour le marqueur vu seulement à ce moment-là
chrome.webNavigation.onCommitted.addListener(d => {
  if (d.frameId !== 0) return;
  if (/^https?:/.test(d.url)) tabSetAdd("visited", d.tabId);
  markExempt(d);
});

// ------------------------------------------------------------ fenêtre de l'extension

async function refreshBadge() {
  await loadState();
  const on = await captureOn();
  chrome.action.setBadgeText({ text: on ? "" : "off" });
  chrome.action.setBadgeBackgroundColor({ color: "#7a7a7a" });
  chrome.action.setTitle({ title: TEXT[lang()][on ? "on" : "off"] });
}
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);

// Messages de popup.html
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg.type === "get") {
      await loadState();
      reply({ connected: !!port, enabled: await captureOn(), config: state.config,
              vmApps: state.vmApps || [], language: lang() });
    } else if (msg.type === "enabled") {
      await chrome.storage.local.set({ enabled: !!msg.value });
      refreshBadge();
      reply({ ok: true });
    } else if (msg.type === "set") {
      // l'hôte écrit config.json puis renvoie la configuration à jour
      const ok = toHost({ type: "set", app: msg.app, key: msg.key, value: msg.value });
      if (ok && state.config && state.config.apps && state.config.apps[msg.app]) {
        state.config.apps[msg.app][msg.key] = msg.value;
      }
      reply({ ok });
    }
  })();
  return true;
});

connect();
