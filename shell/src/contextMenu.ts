// Right-click menu for the page. Electron shows none by default, so
// copy, paste, spelling suggestions, links and images are offered here, in
// the order elementary's Web browser uses.

import { clipboard, Menu, type MenuItemConstructorOptions, type WebContents } from "electron";
import { isInside, openExternal, parse } from "./links";
import { t } from "./i18n";

/** http(s) only: Microsoft 365 addresses in the app (open), the rest in the browser. */
function follow(url: string, open: (url: string) => void): void {
  const u = parse(url);
  if (!u) return;
  if (isInside(u.href)) open(u.href);
  else openExternal(u.href);
}

export function attachContextMenu(contents: WebContents, openInApp: (url: string) => void): void {
  contents.on("context-menu", (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    const sep = (): void => {
      if (items.length && items[items.length - 1].type !== "separator") items.push({ type: "separator" });
    };

    if (params.misspelledWord) {
      for (const word of params.dictionarySuggestions.slice(0, 5))
        items.push({ label: word, click: () => contents.replaceMisspelling(word) });
      items.push({
        label: t("Ajouter au dictionnaire"),
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      sep();
    }

    if (params.linkURL) {
      items.push(
        { label: t("Ouvrir le lien dans le navigateur"), click: () => openExternal(params.linkURL) },
        { label: t("Copier l'adresse du lien"), click: () => clipboard.writeText(params.linkURL) },
      );
      sep();
    }

    if (params.mediaType === "image" && params.srcURL) {
      items.push(
        { label: t("Ouvrir l'image"), enabled: Boolean(parse(params.srcURL)), click: () => follow(params.srcURL, openInApp) },
        { label: t("Copier l'image"), click: () => contents.copyImageAt(params.x, params.y) },
        { label: t("Copier l'adresse de l'image"), click: () => clipboard.writeText(params.srcURL) },
        { label: t("Enregistrer l'image sous…"), click: () => contents.downloadURL(params.srcURL) },
      );
      sep();
    } else if (params.mediaType === "video" && params.srcURL && !params.srcURL.startsWith("blob:")) {
      items.push({ label: t("Copier l'adresse de la vidéo"), click: () => clipboard.writeText(params.srcURL) });
      sep();
    }

    if (params.isEditable) {
      items.push(
        { label: t("Annuler|undo"), role: "undo", enabled: params.editFlags.canUndo },
        { label: t("Rétablir"), role: "redo", enabled: params.editFlags.canRedo },
        { type: "separator" },
        { label: t("Couper"), role: "cut", enabled: params.editFlags.canCut },
        { label: t("Copier"), role: "copy", enabled: params.editFlags.canCopy },
        { label: t("Coller"), role: "paste", enabled: params.editFlags.canPaste },
        { label: t("Tout sélectionner"), role: "selectAll" },
      );
    } else if (params.selectionText.trim()) {
      items.push({ label: t("Copier"), role: "copy" });
    }

    if (!items.length || items.every((i) => i.type === "separator")) {
      const history = contents.navigationHistory;
      items.push(
        { label: t("Précédent"), enabled: history.canGoBack(), click: () => history.goBack() },
        { label: t("Suivant"), enabled: history.canGoForward(), click: () => history.goForward() },
        { label: t("Actualiser"), click: () => contents.reload() },
        { type: "separator" },
        { label: t("Copier l'adresse de la page"), click: () => clipboard.writeText(contents.getURL()) },
      );
    }

    while (items.length && items[items.length - 1].type === "separator") items.pop();
    Menu.buildFromTemplate(items).popup();
  });
}
