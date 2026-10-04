// Interface language. The interface is written in French; t("texte") returns
// the English text when English is chosen. The choice is the top-level
// "language" key of ~/.config/lucarne/config.json: "fr", "en" or "auto"
// (missing = auto, from LANGUAGE, LC_ALL, LC_MESSAGES then LANG).
// Pages of our own (assets/*.html) get the same dictionary through their
// preload (see strings()), and translate the elements marked data-i18n.
// A key may carry a context after "|" ("Annuler|undo"); French shows what precedes it.

export type Language = "fr" | "en";
export type LanguageSetting = "auto" | Language;

/** French -> English. Keys are the exact French strings; {name} is filled in by t(). */
const EN: Record<string, string> = {
  // window menu (window.ts)
  "Zoom arrière": "Zoom Out",
  "Taille réelle ({zoom} %)": "Actual Size ({zoom}%)",
  "Zoom avant": "Zoom In",
  "Nouvelle fenêtre": "New Window",
  "Copier le lien de la page": "Copy Page Link",
  "Ouvrir dans le navigateur": "Open in Browser",
  "Réglages de Lucarne…": "Lucarne Settings…",
  "Quitter {name}": "Quit {name}",
  "Rejoindre la réunion copiée": "Join Copied Meeting",
  "Copie d'abord le lien d'invitation Teams": "Copy a Teams meeting link first",
  "Statistiques vidéo de la réunion": "Meeting Video Statistics",
  "Statistiques vidéo": "Video Statistics",
  "Partage en cours": "Sharing",
  "Fenêtre partagée": "Sharing a window",
  "Onglet partagé": "Sharing a tab",
  "Écran partagé": "Sharing the screen",
  "Réunion": "Meeting",
  // Teams menu (main.ts)
  "Compte principal": "Main Account",
  "Compte {n}": "Account {n}",
  "Ajouter un compte…": "Add Account…",
  "Gérer les comptes…": "Manage Accounts…",
  "Statut : {status}": "Status: {status}",
  "Statut": "Status",
  "Réinitialiser le statut": "Reset Status",
  "Discussion rapide…": "Quick Chat…",
  "Détacher le partage d'écran": "Pop Out Shared Screen",
  "Comptes": "Accounts",
  "Personnaliser": "Customize",
  "Mes fonds d'écran d'appel…": "My Call Backgrounds…",
  "Style elementary": "elementary Style",
  "Mon style (CSS)…": "My Style (CSS)…",
  "/* CSS ajouté aux pages de Teams, appliqué à l'enregistrement.\n   Il passe après le style elementary, s'il est coché, et peut donc le corriger.\n   Ajouter !important si une règle de Teams, plus précise, l'emporte. */\n":
    "/* CSS added to Teams' pages, applied on save.\n   It comes after the elementary style, if checked, so it can override it.\n   Add !important when a more specific Teams rule wins. */\n",
  "Ajouter un compte Teams": "Add a Teams Account",
  "Nom du compte (par exemple « Client X » ou une adresse) :": "Account name (for example \"Client X\" or an email address):",
  "Statut Teams non changé": "Teams status not changed",
  "Partage d'écran": "Screen sharing",
  "Aucune vidéo à détacher dans Teams.": "No video to pop out in Teams.",
  "Téléchargement terminé": "Download complete",
  "Écran": "Screen",
  "Lucarne, projet indépendant sous licence GPL-3.0. {name} et Microsoft 365 sont des marques de Microsoft Corporation ; Lucarne affiche leur service web et n'est ni affilié à Microsoft ni approuvé par Microsoft.":
    "Lucarne, independent project under GPL-3.0. {name} and Microsoft 365 are trademarks of Microsoft Corporation; Lucarne shows their web service and is neither affiliated with nor endorsed by Microsoft.",
  "{name} a rencontré une erreur": "{name} ran into an error",
  "{message}. Si l'appli se comporte mal, quittez-la et relancez-la.": "{message}. If the app misbehaves, quit and start it again.",
  // tray (tray.ts)
  "Afficher {name}": "Show {name}",
  "{name} · {n} non lu": "{name} · {n} unread",
  "{name} · {n} non lus": "{name} · {n} unread",
  "{n} non lu": "{n} unread",
  "{n} non lus": "{n} unread",
  // right-click menu (contextMenu.ts)
  "Ajouter au dictionnaire": "Add to Dictionary",
  "Ouvrir le lien dans le navigateur": "Open Link in Browser",
  "Copier l'adresse du lien": "Copy Link Address",
  "Ouvrir l'image": "Open Image",
  "Copier l'image": "Copy Image",
  "Copier l'adresse de l'image": "Copy Image Address",
  "Enregistrer l'image sous…": "Save Image As…",
  "Copier l'adresse de la vidéo": "Copy Video Address",
  "Annuler": "Cancel",
  "Annuler|undo": "Undo",
  "Rétablir": "Redo",
  "Couper": "Cut",
  "Copier": "Copy",
  "Coller": "Paste",
  "Tout sélectionner": "Select All",
  "Précédent": "Back",
  "Suivant": "Forward",
  "Actualiser": "Reload",
  "Copier l'adresse de la page": "Copy Page Address",
  // Teams (teams.ts)
  "Afficher": "Show",
  "Répondre": "Answer",
  "Répondre|message": "Reply",
  "Vidéo": "Video",
  "Refuser": "Decline",
  "Appel de {name}": "Call from {name}",
  "Appel entrant": "Incoming call",
  "Disponible": "Available",
  "Occupé": "Busy",
  "Ne pas déranger": "Do not disturb",
  "De retour bientôt": "Be right back",
  "Absent": "Away",
  "Apparaître hors ligne": "Appear offline",
  "Teams n'a pas donné de jeton (pas encore connecté ?)": "Teams gave no token (not signed in yet?)",
  "{host} a répondu {status}": "{host} answered {status}",
  "Discussion rapide": "Quick Chat",
  "{message}. « Ouvrir dans Teams » reste possible.": "{message}. \"Open in Teams\" still works.",
  // sign-in (enterprise.ts)
  "Code PIN de la carte": "Smart Card PIN",
  "{host} demande un certificat. Code PIN de « {token} » :": "{host} asks for a certificate. PIN for \"{token}\":",
  " (le précédent était faux ; plusieurs erreurs bloquent la carte)": " (the last one was wrong; too many mistakes lock the card)",
  // noise-cancelling microphone (noise.ts): the device name shown in Teams
  "Micro antibruit": "Noise-cancelling mic",
  // header bar (assets/headerbar.html, headerbar.js)
  "Précédent (Alt+←)": "Back (Alt+←)",
  "Suivant (Alt+→)": "Forward (Alt+→)",
  "Actualiser (F5)": "Reload (F5)",
  "Accueil (Alt+Origine)": "Home (Alt+Home)",
  "Arrêter le partage": "Stop sharing",
  "Arrêter": "Stop",
  "Menu (F10)": "Menu (F10)",
  "Impossible de joindre Microsoft 365": "Can't reach Microsoft 365",
  "Vérifiez la connexion à Internet, puis réessayez.": "Check the Internet connection, then try again.",
  "Réessayer": "Try Again",
  // small windows (assets/panel-*.html)
  "Valider": "OK",
  "Répondre avec le micro seul": "Answer with audio only",
  "Répondre avec la caméra": "Answer with video",
  "Rechercher une personne": "Search for a person",
  "Message": "Message",
  "Ouvrir dans Teams": "Open in Teams",
  "Envoyer": "Send",
  "Envoi…": "Sending…",
  "Personne trouvée": "Nobody found",
  "Envoyé à {name}": "Sent to {name}",
  // meeting mini window (assets/teams-mini.js)
  "Fermer la petite fenêtre": "Close the mini window",
  "Revenir à la réunion": "Back to the meeting",
  "Garder au-dessus des autres fenêtres": "Keep above other windows",
  "Personne n'a la caméra allumée": "Nobody has their camera on",
  "Caméra": "Camera",
  "Micro": "Microphone",
  "Quitter la réunion": "Leave the meeting",
};

let current: Language = "fr";

/** The language "auto" stands for: the first locale variable set, French when it starts with fr. */
export function systemLanguage(env: NodeJS.ProcessEnv = process.env): Language {
  const first = [(env.LANGUAGE ?? "").split(":")[0], env.LC_ALL, env.LC_MESSAGES, env.LANG].find((v) => v && v.trim());
  return first && /^fr/i.test(first.trim()) ? "fr" : "en";
}

export function resolveLanguage(setting: unknown): Language {
  return setting === "fr" || setting === "en" ? setting : systemLanguage();
}

export function setLanguage(lang: Language): void {
  current = lang;
}

export const language = (): Language => current;

/** The text in the interface language; {key} replaced from vars. */
export function t(fr: string, vars?: Record<string, string | number>): string {
  // "Annuler|undo": a context after "|" tells apart two meanings of one French word.
  const text = current === "en" ? (EN[fr] ?? fr.split("|")[0]) : fr.split("|")[0];
  return vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : text;
}

/** For our own pages: the language and, in English, the whole dictionary. */
export function strings(): { lang: Language; strings: Record<string, string> } {
  return { lang: current, strings: current === "en" ? EN : {} };
}

/** Every French key (for the consistency check of the dictionary). */
export const KEYS = (): string[] => Object.keys(EN);
