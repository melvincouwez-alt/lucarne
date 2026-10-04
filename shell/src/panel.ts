// Small windows of our own: incoming call, shared-screen preview, quick chat,
// PIN prompt. Each is a page in assets/ talking through src/panelPreload.ts.
// On Wayland a window cannot place itself or stay above others: Gala centres
// it, and "always on top" is only a request.

import path from "path";
import { BrowserWindow, ipcMain, nativeTheme, type BrowserWindowConstructorOptions, type IpcMainEvent } from "electron";

export interface Panel {
  win: BrowserWindow;
  post: (data: unknown) => void;
  close: () => void;
}

const panels = new Map<number, { onMessage: (m: unknown) => void; last: unknown }>();

ipcMain.on("lucarne-panel:message", (event: IpcMainEvent, message: unknown) => panels.get(event.sender.id)?.onMessage(message));
ipcMain.on("lucarne-panel:ready", (event: IpcMainEvent) => {
  const p = panels.get(event.sender.id);
  if (p && p.last !== undefined) event.sender.send("lucarne-panel:data", p.last);
});

export function openPanel(
  name: string,
  options: BrowserWindowConstructorOptions,
  onMessage: (message: unknown) => void,
  first?: unknown,
): Panel {
  const win = new BrowserWindow({
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#2b2b2b" : "#fafafa",
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "panelPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...options.webPreferences,
    },
  });
  const id = win.webContents.id;
  panels.set(id, { onMessage, last: first });
  win.on("closed", () => panels.delete(id));
  win.once("ready-to-show", () => win.showInactive());
  void win.loadFile(path.join(__dirname, "..", "assets", `panel-${name}.html`));
  return {
    win,
    post: (data) => {
      const p = panels.get(id);
      if (p) p.last = data;
      if (!win.isDestroyed()) win.webContents.send("lucarne-panel:data", data);
    },
    close: () => {
      if (!win.isDestroyed()) win.close();
    },
  };
}

/** Asks for a line of text (a smartcard PIN); resolves to null when cancelled. */
export function ask(title: string, message: string, secret: boolean, parent?: BrowserWindow): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      resolve(value);
      panel.close();
    };
    const panel = openPanel("ask", { width: 420, height: 240, title, parent, modal: Boolean(parent), alwaysOnTop: true },
      (m) => {
        const msg = m as { ok?: boolean; value?: unknown };
        finish(msg.ok && typeof msg.value === "string" ? msg.value : null);
      },
      { title, message, secret });
    panel.win.once("ready-to-show", () => panel.win.show());
    panel.win.on("closed", () => finish(null));
  });
}
