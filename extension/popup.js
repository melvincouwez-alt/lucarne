const NAMES = { word: "Word", excel: "Excel", powerpoint: "PowerPoint", onenote: "OneNote",
                outlook: "Outlook", teams: "Teams", powerbi: "Power BI" };

const TEXT = {
  fr: {
    title: "Lucarne : renvoi des liens",
    toggle: "Renvoyer les liens hors de Chrome",
    hint: "Pour chaque appli, où s'ouvrent les liens cliqués dans Chrome : dans l'appli en ligne ou dans l'appli Windows de la VM (Vasistas).",
    warn: "Hôte natif injoignable : relancer Chrome ou réinstaller Lucarne.",
    web: "En ligne",
    vm: "VM Windows",
    noVm: "Pas disponible dans la VM",
  },
  en: {
    title: "Lucarne: link sending",
    toggle: "Send links out of Chrome",
    hint: "For each app, where links clicked in Chrome open: in the web app or in the Windows app of the VM (Vasistas).",
    warn: "Native host unreachable: restart Chrome or reinstall Lucarne.",
    web: "Web",
    vm: "Windows VM",
    noVm: "Not available in the VM",
  },
};

const send = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));

async function render() {
  const s = await send({ type: "get" });
  const lang = s.language === "fr" || s.language === "en" ? s.language
    : ((chrome.i18n.getUILanguage() || "").toLowerCase().startsWith("fr") ? "fr" : "en");
  const t = TEXT[lang];
  document.documentElement.lang = lang;
  document.getElementById("title").textContent = t.title;
  document.getElementById("hint").textContent = t.hint;

  const enabled = document.getElementById("enabled");
  enabled.checked = s.enabled;
  enabled.title = t.toggle;
  enabled.setAttribute("aria-label", t.toggle);
  enabled.onchange = () => send({ type: "enabled", value: enabled.checked }).then(render);

  const warn = document.getElementById("warn");
  warn.hidden = !!(s.connected && s.config);
  warn.textContent = t.warn;

  const list = document.getElementById("apps");
  list.textContent = "";
  if (!s.config || !s.config.apps) return;
  for (const [app, name] of Object.entries(NAMES)) {
    const c = s.config.apps[app];
    if (!c) continue;
    const li = document.createElement("li");
    if (!s.enabled) li.className = "off";
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = name;
    li.append(label);
    const seg = document.createElement("span");
    seg.className = "seg";
    const inVm = (s.vmApps || []).includes(app);
    for (const value of ["web", "vm"]) {
      const b = document.createElement("button");
      b.textContent = t[value];
      b.className = c.target === value ? "on" : "";
      b.disabled = !s.enabled || (value === "vm" && !inVm);
      if (value === "vm" && !inVm) b.title = t.noVm;
      b.onclick = async () => {
        await send({ type: "set", app, key: "target", value });
        render();
      };
      seg.append(b);
    }
    li.append(seg);
    list.append(li);
  }
}
render();
