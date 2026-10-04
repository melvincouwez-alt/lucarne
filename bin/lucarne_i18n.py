"""Traductions de Lucarne (bin/lucarne, Réglages).

    from lucarne_i18n import _
    _("Ouvrir {name}", name="Word")   # « Ouvrir Word » ou « Open Word »

La clé est le texte français ; EN donne l'anglais. La langue vient de
lucarne_config.language() (réglage "language" de config.json, sinon la langue du
système), lue une fois puis gardée : refresh() la relit après un changement.
Texte absent du dictionnaire : le français est affiché tel quel.
"""

import lucarne_config

_lang = None


def refresh(config=None):
    """Relit la langue (après un changement de réglage). Renvoie "fr" ou "en"."""
    global _lang
    _lang = lucarne_config.language(config)
    return _lang


def current():
    return _lang or refresh()


def _(text, **kw):
    if current() == "en":
        text = EN.get(text, text)
    return text.format(**kw) if kw else text


EN = {
    # ------------------------------------------------ bin/lucarne
    "Fichier local non pris en charge": "Local file not supported",
    "{file} : les fichiers locaux s'ouvrent dans l'Office de la VM Vasistas, qui n'est pas installée. "
    "En attendant, déposez-le dans OneDrive ou SharePoint.":
        "{file}: local files open in Office in the Vasistas VM, which is not installed. "
        "Until then, put the file in OneDrive or SharePoint.",
    "Adresse non reconnue : {url}": "Unrecognised address: {url}",
    "Adresse refusée (http ou https seulement) : {url}": "Address refused (http or https only): {url}",
    "Vasistas introuvable": "Vasistas not found",
    "{name} s'ouvre en ligne : Vasistas n'est pas installé.": "{name} opens on the web: Vasistas is not installed.",
    "Introuvable : {path}": "Not found: {path}",
    "Langue inconnue : {value} (auto, fr ou en)": "Unknown language: {value} (auto, fr or en)",
    "Réglage inconnu : {app} {key}": "Unknown setting: {app} {key}",
    "Commande inconnue : {cmd}": "Unknown command: {cmd}",

    # ------------------------------------------------ lucarne_config.APPS (noms génériques)
    "Traitement de texte": "Word processor",
    "Tableur": "Spreadsheet",
    "Présentation": "Presentation",
    "Bloc-notes": "Notebook",
    "Courrier et calendrier": "Mail and calendar",
    "Réunions et conversations": "Meetings and chat",
    "Rapports et tableaux de bord": "Reports and dashboards",

    # ------------------------------------------------ Réglages : page générale
    "Général": "General",
    "Services web Microsoft 365 dans des fenêtres du bureau": "Microsoft 365 web services in desktop windows",
    "Automatique (langue du système)": "Automatic (system language)",
    "Langue de Lucarne": "Lucarne language",
    "Réglages, notifications et fenêtre de l'extension Chrome": "Settings, notifications and the Chrome extension window",
    "Extension Chrome": "Chrome extension",
    "Connectée : les liens Word, Excel, Teams… cliqués dans Chrome s'ouvrent dans les applis.":
        "Connected: Word, Excel, Teams… links clicked in Chrome open in the apps.",
    "Pas connectée. Elle sert à ouvrir dans les applis les liens Word, Excel, Teams… cliqués dans Chrome. "
    "Pour l'ajouter : chrome://extensions, mode développeur, « Charger l'extension non empaquetée », "
    "puis choisir le dossier ci-dessous.":
        "Not connected. It opens Word, Excel, Teams… links clicked in Chrome in the apps. "
        "To add it: chrome://extensions, Developer mode, “Load unpacked”, then pick the folder below.",
    "Ouvrir la page des extensions": "Open the extensions page",
    "Ouvrir le dossier": "Open the folder",
    "Agenda Outlook": "Outlook calendar",
    "Module Microsoft 365 installé. Ajoute le compte dans Evolution (Fichier › Nouveau › Compte "
    "de collaboration › Microsoft 365) : l'heure du panneau et Agenda affichent ensuite les rendez-vous.":
        "Microsoft 365 module installed. Add the account in Evolution (File › New › Collaboration "
        "Account › Microsoft 365): the panel clock and Calendar then show your appointments.",
    "Module Microsoft 365 absent. Installe-le avec : sudo apt install evolution evolution-ews":
        "Microsoft 365 module missing. Install it with: sudo apt install evolution evolution-ews",
    "Ouvrir Evolution": "Open Evolution",

    # ------------------------------------------------ Réglages : page d'une appli
    "Appli": "App",
    "Activer {name}": "Turn on {name}",
    "Désactivée, le lanceur et les liens {name} s'ouvrent dans un onglet Chrome":
        "When off, the launcher and {name} links open in a Chrome tab",
    "Afficher dans le menu Applications": "Show in the Applications menu",
    "Sinon, le lanceur reste utilisable depuis le dock et les liens":
        "Otherwise the launcher still works from the dock and from links",
    "Appli en ligne": "Web app",
    "VM Windows (Vasistas)": "Windows VM (Vasistas)",
    "Ouvrir les liens dans": "Open links in",
    "Liens {name} cliqués dans Chrome ou dans d'autres applis": "{name} links clicked in Chrome or in other apps",
    "Page d'accueil": "Home page",
    "Vide = accueil par défaut. Colle ici l'adresse de la page que tu ouvres d'habitude.":
        "Empty = default home page. Paste the address of the page you usually open.",
    "Comportement": "Behaviour",
    "Ouvrir {name}": "Open {name}",
    "Comptes Teams": "Teams accounts",
    "Chaque compte a sa fenêtre et sa connexion. Ctrl+Alt+1 ouvre le compte principal, Ctrl+Alt+2 à 5 les suivants.":
        "Each account has its own window and sign-in. Ctrl+Alt+1 opens the main account, Ctrl+Alt+2 to 5 the others.",
    "Ajouter un compte": "Add an account",
    "Retirer ce compte": "Remove this account",
    "Compte {n}": "Account {n}",

    # ------------------------------------------------ Réglages : OPTIONS
    "Ouvrir les liens ici": "Open links here",
    "Les liens {name} cliqués dans Chrome s'ouvrent dans cette appli au lieu d'un onglet":
        "{name} links clicked in Chrome open in this app instead of a tab",
    "Non-lus dans le dock": "Unread count in the dock",
    "Pastille avec le nombre de messages non lus": "Badge with the number of unread messages",
    "Notifications au nom de l'appli": "Notifications under the app's name",
    "Les alertes s'affichent avec l'icône {name}, réglables dans Paramètres › Notifications":
        "Alerts show the {name} icon and can be set in System Settings › Notifications",
    "Micro antibruit": "Microphone noise reduction",
    "Réunions : le bruit de fond du micro est retiré par RNNoise avant d'arriver dans {name}":
        "Meetings: RNNoise removes background noise from the microphone before it reaches {name}",
    "Appels entrants en notification": "Incoming calls as notifications",
    "Répondre, répondre en vidéo ou refuser depuis la bulle, même fenêtre fermée":
        "Answer, answer with video or decline from the bubble, even with the window closed",
    "Rester « Disponible » quand je travaille ailleurs": "Stay “Available” while I work in other apps",
    "{name} ne voit que l'activité dans sa fenêtre ; celle du reste de la session lui est transmise":
        "{name} only sees activity in its own window; activity in the rest of the session is passed on to it",
    "Passer « Absent » quand la session est verrouillée": "Go “Away” when the session is locked",
    "Ou après 5 minutes sans clavier ni souris, sauf pendant un appel":
        "Or after 5 minutes without keyboard or mouse, except during a call",
    "Thème clair ou sombre selon le système": "Light or dark theme from the system",
    "Bannières de {name} en notifications du système": "{name} banners as system notifications",
    "Nouveau message, arrivée en réunion… sortent de la fenêtre au lieu de s'y afficher":
        "New message, someone joining a meeting… show outside the window instead of inside it",
    "Continuer après la fermeture de la fenêtre": "Keep running after the window is closed",
    "Appels et notifications continuent d'arriver ; rouvrir depuis le dock, quitter avec Ctrl+Q":
        "Calls and notifications keep coming; reopen from the dock, quit with Ctrl+Q",
    "Appels et partage": "Calls and sharing",
    "Appel entrant dans une petite fenêtre": "Incoming call in a small window",
    "Photo de l'appelant et gros boutons ; sinon une notification":
        "Caller's picture and large buttons; otherwise a notification",
    "Commande pendant la sonnerie": "Command while ringing",
    "Lancée par sh quand un appel sonne : $1 = appelant, $2 = texte de l'appel. Vide = rien":
        "Run by sh when a call rings: $1 = caller, $2 = call text. Empty = nothing",
    "Réunion dans une petite fenêtre à part": "Meeting in a separate small window",
    "Quand tu vas ailleurs dans {name} pendant une réunion, comme sous Windows ; la punaise la garde au-dessus":
        "When you move elsewhere in {name} during a meeting, as on Windows; the pin keeps it on top",
    "Aperçu de ce que je partage": "Preview of what I share",
    "Petite fenêtre avec l'écran partagé et un bouton Arrêter": "Small window with the shared screen and a Stop button",
    "Micro et caméra": "Microphone and camera",
    "Gain automatique du micro": "Automatic microphone gain",
    "Chromium monte le volume du micro tout seul ; coupé, ta voix ne peut plus saturer":
        "Chromium raises the microphone level by itself; when off, your voice can no longer clip",
    "Caméra non déformée en changeant d'écran": "Camera keeps its shape when changing screens",
    "Caméra en pleine résolution": "Camera at full resolution",
    "Au lieu du 720p que demande {name}": "Instead of the 720p that {name} asks for",
    "Ignorer la coupure du micro faite par le système": "Ignore microphone mute done by the system",
    "{name} ne recopie plus sur son bouton une coupure faite ailleurs":
        "{name} no longer mirrors a mute done elsewhere on its own button",
    "Garder le micro et la caméra choisis": "Keep the chosen microphone and camera",
    "Brancher un casque ou une webcam en cours d'appel ne change rien":
        "Plugging in a headset or webcam during a call changes nothing",
    "Affichage": "Appearance",
    "Barre d'en-tête à la couleur de l'appli": "Header bar in the app's colour",
    "Sinon, barre neutre comme les applis du système": "Otherwise a neutral bar like the system apps",
    "Police et accent elementary": "elementary font and accent",
    "Police Inter, couleur d'accent du système et barres de défilement fines dans les pages":
        "Inter font, the system accent colour and thin scrollbars in the pages",
    "Lancer à l'ouverture de session": "Start when I log in",
    "Avancé": "Advanced",
    "Style elementary": "elementary style",
    "Cadre gris et panneaux arrondis à la façon d'elementary dans {name}":
        "Grey frame and rounded panels in {name}, the elementary way",
    "Mon style (CSS)": "My style (CSS)",
    "Fichier ~/.config/lucarne/{app}.css ajouté aux pages": "File ~/.config/lucarne/{app}.css added to the pages",
    "Mes fonds d'écran d'appel": "My call backgrounds",
    "Images du dossier ~/.config/lucarne/backgrounds à la place de ceux de Microsoft":
        "Pictures from ~/.config/lucarne/backgrounds instead of Microsoft's",
    "Se présenter comme Windows": "Identify as Windows",
    "Certaines fonctions de Microsoft ne s'affichent que sous Windows ; à tester si l'une manque":
        "Some Microsoft features only show on Windows; try this if one is missing",
    "Taille maximale du cache (Mo)": "Maximum cache size (MB)",
    "Au-delà, le cache de {name} est vidé au démarrage ; 0 = jamais":
        "Above this, the {name} cache is cleared at startup; 0 = never",
    "Entreprise": "Enterprise",
    "Appareil géré par Intune": "Device managed by Intune",
    "Connexion par Microsoft Identity Broker (paquet intune-portal requis)":
        "Sign-in through Microsoft Identity Broker (needs the intune-portal package)",
    "Compte Intune": "Intune account",
    "Vide = le premier compte connu du broker": "Empty = the first account the broker knows",
    "Clés de sécurité FIDO2": "FIDO2 security keys",
    "YubiKey et autres à la connexion Microsoft (paquet fido2-tools requis)":
        "YubiKey and others at Microsoft sign-in (needs the fido2-tools package)",
    "Proxy": "Proxy",
    "Par exemple http://proxy:3128 ; vide = réglage du système": "For example http://proxy:3128; empty = system setting",
    "Certificats d'entreprise de confiance": "Trusted company certificates",
    "Empreintes SHA-256 des certificats racine, séparées par des virgules":
        "SHA-256 fingerprints of the root certificates, separated by commas",
    "Adresse de connexion": "Sign-in address",
    "Remplie d'office sur la page de connexion Microsoft": "Filled in on the Microsoft sign-in page",
    "Commande du mot de passe": "Password command",
    "Par exemple « pass show travail » ; le mot de passe est rempli, jamais envoyé seul":
        "For example “pass show work”; the password is filled in, never submitted by itself",
}
