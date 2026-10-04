// Icon in the panel (StatusNotifierItem, shown by the wingpanel tray
// indicator) for apps that keep running without a window: a click brings the
// window back, the menu quits for real.

import path from "path";
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import type { AppInfo } from "./identity";
import { t } from "./i18n";

let tray: Tray | null = null;
let unread = 0;
let actions: { show: () => void; settings: () => void; quit: () => void; extra?: () => MenuItemConstructorOptions[] } | null = null;
let app: AppInfo | null = null;

function rebuild(): void {
  if (!tray || !actions || !app) return;
  const a = actions;
  const name = app.name;
  tray.setToolTip(unread ? t(unread > 1 ? "{name} · {n} non lus" : "{name} · {n} non lu", { name, n: unread }) : name);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t("Afficher {name}", { name }), click: () => a.show() },
    ...(unread ? [{ label: t(unread > 1 ? "{n} non lus" : "{n} non lu", { n: unread }), enabled: false }] : []),
    { type: "separator" as const },
    // Status, quick chat, accounts (Teams).
    ...(a.extra ? [...a.extra(), { type: "separator" as const }] : []),
    { label: t("Réglages de Lucarne…"), click: () => a.settings() },
    { label: t("Quitter {name}", { name }), click: () => a.quit() },
  ]));
}

export function showTray(info: AppInfo, handlers: NonNullable<typeof actions>): void {
  app = info;
  actions = handlers;
  if (tray) return rebuild();
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icons", `${info.id}.png`)).resize({ width: 64, height: 64 });
  tray = new Tray(icon);
  tray.on("click", () => actions?.show());
  rebuild();
}

export function hideTray(): void {
  tray?.destroy();
  tray = null;
}

export function setTrayUnread(count: number): void {
  if (count === unread) return;
  unread = count;
  rebuild();
}
