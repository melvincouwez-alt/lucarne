"""Configuration partagée par lucarne, l'hôte natif et l'appli de réglages.

Fichier : ~/.config/lucarne/config.json, de la forme
  {"language": "fr", "apps": {"outlook": {"home": "", "single": true, ...}, ...}}
Seules les valeurs modifiées y sont écrites ; le reste vient de DEFAULTS. Les clés
inconnues (écrites par une version plus récente ou par l'appli Electron) sont gardées.
"""

import json
import os
import shlex
import shutil
from pathlib import Path

# Ancien nom du projet (m365-linux) : dossiers repris tels quels au premier lancement,
# profils connectés compris.
for _old, _new in ((".config/m365-linux", ".config/lucarne"), (".local/share/m365-linux", ".local/share/lucarne"),
                   (".cache/m365-linux", ".cache/lucarne")):
    _old, _new = Path.home() / _old, Path.home() / _new
    if _old.is_dir() and not _new.exists():
        try:
            _old.rename(_new)
        except OSError:
            pass

CONFIG_DIR = Path.home() / ".config/lucarne"
CONFIG = CONFIG_DIR / "config.json"
OLD_HOMES = CONFIG_DIR / "homes.json"
AUTOSTART = Path.home() / ".config/autostart"
DESKTOP_DIR = Path.home() / ".local/share/applications"
RUNTIME_DIR = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}"))
# Écrit par l'hôte natif tant que l'extension Chrome est connectée (contient son PID)
HOST_PID = RUNTIME_DIR / "lucarne-host.pid"
CACHE_DIR = Path.home() / ".cache/lucarne"
LANGUAGES = ("auto", "fr", "en")

APPS = {
    "word": ("Word", "Traitement de texte", "https://www.office.com/launch/word?auth=2"),
    "excel": ("Excel", "Tableur", "https://www.office.com/launch/excel?auth=2"),
    "powerpoint": ("PowerPoint", "Présentation", "https://www.office.com/launch/powerpoint?auth=2"),
    "onenote": ("OneNote", "Bloc-notes", "https://www.office.com/launch/onenote?auth=2"),
    "outlook": ("Outlook", "Courrier et calendrier", "https://outlook.office.com/mail/"),
    "teams": ("Teams", "Réunions et conversations", "https://teams.microsoft.com/v2/"),
    "powerbi": ("Power BI", "Rapports et tableaux de bord", "https://app.powerbi.com/home"),
}

# Connexion facultative avec Vasistas (applis Windows dans une VM) : seulement par sa
# commande `vasistas` (launch-app <id> [URL], launch <adresse>, open <fichier>), cherchée
# dans le PATH au moment du lien. LUCARNE_VASISTAS remplace la commande (ex. « env
# PYTHONPATH=… python3 -m vasistas »). Identifiants des applis côté Vasistas :
VM_APPS = {"word": "winword", "excel": "excel", "powerpoint": "powerpnt",
           "onenote": "onenote", "outlook": "outlook"}

# Applis à une seule fenêtre possible (les documents gardent une fenêtre chacun)
SINGLE_CAPABLE = {"outlook", "teams", "powerbi", "onenote"}
# Applis dont la page annonce un nombre de non-lus
BADGE_CAPABLE = {"outlook", "teams"}
# Applis de réunion : micro filtré par RNNoise (fourni avec le paquet de l'appli)
NOISE_CAPABLE = {"teams"}
# Réglages propres à Teams (appels, présence, thème), faux ailleurs
TEAMS_ONLY = ("presence", "calls", "background", "theme", "callWindow", "banners", "miniWindow", "sharePreview", "backgrounds")

DEFAULTS = {
    "enabled": True,     # faux = lanceur et liens renvoyés vers Chrome, fenêtre d'appli jamais ouverte
    "menu": True,        # lanceur visible dans le menu Applications
    "home": "",          # vide = accueil par défaut
    "capture": True,     # l'extension renvoie les liens de cette appli vers sa fenêtre
    "single": None,      # None = selon l'appli (vrai pour Outlook et Teams)
    "badge": True,       # compteur de non-lus dans le dock
    "notify": True,      # notifications au nom de l'appli
    "autostart": False,  # lancement à l'ouverture de session
    "tint": True,        # barre d'en-tête à la couleur de l'appli
    "style": True,       # police et accent elementary dans la page
    "noise": True,       # micro antibruit (RNNoise) pour les réunions
    "presence": True,    # Teams : l'activité dans les autres applis garde « Disponible »
    "awayIdle": False,   # Teams : « Absent » quand la session est verrouillée ou inactive
    "calls": True,       # Teams : appel entrant en notification avec boutons
    "callCommand": "",   # Teams : commande lancée pendant la sonnerie ($1 appelant, $2 texte)
    "background": True,  # fermer la fenêtre laisse l'appli tourner (appels, notifications)
    "theme": True,       # Teams : thème clair ou sombre selon le système
    "callWindow": True,  # Teams : appel entrant dans une petite fenêtre (sinon notification)
    "banners": True,     # Teams : bannières de la fenêtre envoyées en notifications système
    "miniWindow": True,  # Teams : réunion dans une petite fenêtre à part quand on la quitte des yeux
    "sharePreview": True,  # Teams : petite fenêtre montrant ce qui est partagé
    "autoGain": False,   # gain automatique du micro par Chromium (peut saturer)
    "cameraRatio": True,  # caméra non déformée en changeant d'écran
    "cameraFull": False,  # caméra en pleine résolution au lieu du 720p de Teams
    "ignoreSystemMute": False,  # la coupure du micro côté système ne coupe pas Teams
    "lockDevices": False,  # pas de bascule de micro ou caméra quand on branche un appareil
    "cacheLimit": 600,   # Mo de cache au-delà desquels il est vidé au démarrage (0 = jamais)
    "windowsMode": False,  # se présenter comme Windows aux pages Microsoft
    "customCss": True,   # ~/.config/lucarne/<appli>.css ajouté aux pages
    "elementaryCss": False,  # style elementary fourni (arrondis, gris, ombres) pour Teams et Outlook
    "backgrounds": True,  # Teams : ~/.config/lucarne/backgrounds remplace les fonds d'appel
    "profiles": [],      # Teams : comptes supplémentaires [{id, name}]
    "proxy": "",         # règles de proxy (vide = système)
    "caFingerprints": [],  # empreintes SHA-256 des certificats racine d'entreprise
    "loginUser": "",     # adresse remplie sur la page de connexion Microsoft
    "passwordCommand": "",  # commande qui affiche le mot de passe (pass, secret-tool…)
    "intune": False,     # connexion via Microsoft Identity Broker (appareils Intune)
    "intuneUser": "",
    "webauthn": False,   # clés de sécurité FIDO2 à la connexion (fido2-tools)
    "target": "web",     # liens cliqués : "web" = appli en ligne, "vm" = appli Windows de Vasistas
}


def app_defaults(app):
    d = dict(DEFAULTS)
    d["single"] = app in ("outlook", "teams")
    if app not in BADGE_CAPABLE:
        d["badge"] = False
    if app not in NOISE_CAPABLE:
        d["noise"] = False
    if app != "teams":
        for k in TEAMS_ONLY:
            d[k] = False
    return d


class ConfigUnreadable(OSError):
    """config.json existe mais ne se lit pas : il n'est jamais remplacé (copie dans config.json.bak)."""


def _read_raw(strict=False):
    """Contenu du fichier ; strict (avant une écriture) : un fichier illisible lève ConfigUnreadable
    au lieu d'être remplacé par un fichier qui ne contiendrait que le changement."""
    try:
        raw = json.loads(CONFIG.read_text())
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        raw = None
    if not strict or (isinstance(raw, dict) and isinstance(raw.get("apps", {}), dict)):
        return raw if isinstance(raw, dict) else {}
    try:
        shutil.copyfile(CONFIG, CONFIG.with_name("config.json.bak"))
    except OSError:
        pass
    raise ConfigUnreadable(str(CONFIG))


def load():
    """Configuration complète (valeurs par défaut + fichier)."""
    raw = _read_raw()
    apps = raw.get("apps")
    apps = {k: v for k, v in apps.items() if isinstance(v, dict)} if isinstance(apps, dict) else {}
    # Ancien fichier homes.json {"word": "https://…"}
    try:
        for app, home in json.loads(OLD_HOMES.read_text()).items():
            apps.setdefault(app, {}).setdefault("home", home)
    except (OSError, ValueError, AttributeError):
        pass
    out = {}
    for app in APPS:
        c = app_defaults(app)
        c.update({k: v for k, v in apps.get(app, {}).items() if k in DEFAULTS})
        if app not in SINGLE_CAPABLE:
            c["single"] = False
        if app not in VM_APPS or c["target"] not in ("web", "vm"):
            c["target"] = "web"
        out[app] = c
    lang = raw.get("language", "auto")
    return {"language": lang if lang in LANGUAGES else "auto", "apps": out}


def _write_json(data):
    """Écriture atomique, lisible par l'utilisateur seul (adresses, commandes)."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG.with_name(f".config.json.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, CONFIG)
    except BaseException:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise


def save(config):
    """Écrit seulement ce qui diffère des valeurs par défaut, en gardant les clés inconnues."""
    raw = _read_raw(strict=True)
    old_apps = raw.get("apps") if isinstance(raw.get("apps"), dict) else {}
    apps = {}
    for app, c in config["apps"].items():
        d = app_defaults(app)
        old = old_apps.get(app) if isinstance(old_apps.get(app), dict) else {}
        entry = {k: v for k, v in old.items() if k not in DEFAULTS}
        entry.update({k: v for k, v in c.items() if k in DEFAULTS and v != d[k]})
        if entry:
            apps[app] = entry
    for app, old in old_apps.items():
        if app not in config["apps"]:
            apps[app] = old
    out = {k: v for k, v in raw.items() if k not in ("apps", "language")}
    lang = config.get("language", raw.get("language", "auto"))
    if lang in LANGUAGES and lang != "auto":
        out["language"] = lang
    out["apps"] = apps
    _write_json(out)


def system_language():
    """fr ou en d'après LANGUAGE, LC_ALL, LC_MESSAGES puis LANG (première valeur non vide)."""
    for var in ("LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"):
        value = os.environ.get(var, "")
        if var == "LANGUAGE":
            value = value.split(":")[0]
        if value:
            return "fr" if value.lower().startswith("fr") else "en"
    return "en"


def language(config=None):
    """Langue résolue de l'interface : "fr" ou "en"."""
    lang = (config or load()).get("language", "auto")
    return lang if lang in ("fr", "en") else system_language()


def set_language(value):
    """"auto", "fr" ou "en" ; relit le fichier pour ne rien écraser."""
    if value not in LANGUAGES:
        raise ValueError(f"language {value}")
    config = load()
    config["language"] = value
    save(config)


def append_log(name, line, max_bytes=256 * 1024, keep=200):
    """Ajoute une ligne à ~/.cache/lucarne/<name> ; au-delà de max_bytes, ne garde que
    les `keep` dernières lignes. Fichier en 0600 (il contient des adresses de documents)."""
    path = CACHE_DIR / name
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a") as f:
            f.write(line.rstrip("\n") + "\n")
        if path.stat().st_size > max_bytes:
            lines = path.read_text(errors="replace").splitlines()[-keep:]
            tmp = path.with_name(f".{name}.{os.getpid()}.tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write("\n".join(lines) + "\n")
            os.replace(tmp, path)
    except OSError:
        pass


def host_connected():
    """Vrai si un hôte natif (donc l'extension Chrome) tourne."""
    try:
        pid = int(HOST_PID.read_text().strip())
        return Path(f"/proc/{pid}").exists()
    except (OSError, ValueError):
        return False


def vasistas_command():
    """Commande Vasistas (liste d'arguments), ou None si Vasistas n'est pas installé."""
    if os.environ.get("LUCARNE_VASISTAS"):
        return shlex.split(os.environ["LUCARNE_VASISTAS"])
    found = shutil.which("vasistas") or shutil.which("vasistas", path=str(Path.home() / ".local/bin"))
    return [found] if found else None


def vm_available():
    return vasistas_command() is not None


def set_value(app, key, value):
    """Change une valeur d'une appli (demandé par l'extension ou les réglages)."""
    if app not in APPS or key not in DEFAULTS:
        raise ValueError(f"{app}.{key}")
    config = load()
    config["apps"][app][key] = value
    save(config)


def home(app, config=None):
    config = config or load()
    return config["apps"][app]["home"] or APPS[app][2]


def set_autostart(app, enabled):
    path = AUTOSTART / f"lucarne-{app}.desktop"
    if enabled:
        AUTOSTART.mkdir(parents=True, exist_ok=True)
        # Chemin complet : le générateur systemd des applis au démarrage n'a pas ~/.local/bin
        # dans son PATH. Délai : une fenêtre ouverte avant que Gala ait lu les lanceurs
        # reste sans icône dans le dock (app-id « window:N »).
        lucarne = shutil.which("lucarne") or str(Path.home() / ".local/bin/lucarne")
        path.write_text(
            "[Desktop Entry]\nType=Application\n"
            f"Name={APPS[app][0]}\nExec=sh -c \"sleep 8; exec '{lucarne}' {app}\"\nIcon=lucarne-{app}\n"
            "X-GNOME-Autostart-enabled=true\nX-Lucarne=true\n")
    elif path.exists():
        path.unlink()


def _system_desktop(name):
    """Lanceur installé par le paquet (/usr/share/applications…), ou None."""
    dirs = os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share"
    for d in dirs.split(":"):
        if d:
            p = Path(d) / "applications" / name
            if p.is_file():
                return p
    return None


def set_menu(app, visible):
    """Montre ou cache le lanceur dans le menu Applications (NoDisplay=true).

    Lanceur du paquet seulement (/usr/share/applications) : il est copié dans
    ~/.local/share/applications pour être caché ; la copie est retirée quand il redevient
    visible, pour suivre ensuite les mises à jour du paquet.
    """
    name = f"lucarne-{app}.desktop"
    path = DESKTOP_DIR / name
    try:
        lines = path.read_text().splitlines()
    except OSError:
        system = None if visible else _system_desktop(name)
        if not system:
            return
        try:
            lines = system.read_text().splitlines()
        except OSError:
            return
        # marque de copie, dans la section principale
        idx = next((i + 1 for i, ln in enumerate(lines) if ln.strip() == "[Desktop Entry]"), None)
        if idx is None:
            return
        lines.insert(idx, "X-Lucarne-Copy=true")
    if visible and "X-Lucarne-Copy=true" in lines and _system_desktop(name):
        try:
            path.unlink()
        except OSError:
            pass
        return
    out, section = [], None
    for line in lines:
        if line.startswith("["):
            if section == "[Desktop Entry]" and not visible:
                out.insert(len(out) - (bool(out) and out[-1] == ""), "NoDisplay=true")
            section = line
        elif section == "[Desktop Entry]" and line.startswith("NoDisplay="):
            continue
        out.append(line)
    if section == "[Desktop Entry]" and not visible:
        out.append("NoDisplay=true")
    try:
        DESKTOP_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(out) + "\n")
    except OSError:
        pass


def apply(app, config=None):
    """Répercute enabled, menu et autostart sur les fichiers du bureau."""
    c = (config or load())["apps"][app]
    set_menu(app, c["enabled"] and c["menu"])
    set_autostart(app, c["enabled"] and c["autostart"])


if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["apply"]:
        config = load()
        for app in APPS:
            apply(app, config)
