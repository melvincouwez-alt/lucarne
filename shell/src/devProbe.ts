// Development aid, inert unless LUCARNE_DEV_PROBE names a PNG path. The windows
// then render offscreen, so a test run never puts a window on the desktop;
// once the page has settled, the header bar and the page are captured to
// <path>-header.png and <path>-page.png, and the app quits.
// LUCARNE_DEV_URL picks the page, LUCARNE_DEV_DARK=1 forces dark, LUCARNE_DEV_DELAY in ms.

import fs from "fs";
import { app, nativeTheme } from "electron";
import type { AppWindow } from "./window";

export function devProbeHidden(): boolean {
  return Boolean(process.env.LUCARNE_DEV_PROBE);
}

export function devProbe(win: AppWindow): void {
  const target = process.env.LUCARNE_DEV_PROBE;
  if (!target) return;
  if (process.env.LUCARNE_DEV_DARK === "1") nativeTheme.themeSource = "dark";
  // Straight to the page, past load()'s Microsoft-only rule: a test may use a local page.
  if (process.env.LUCARNE_DEV_URL) void win.view.webContents.loadURL(process.env.LUCARNE_DEV_URL).catch(() => undefined);
  const base = target.replace(/\.png$/, "");
  const delay = Number(process.env.LUCARNE_DEV_DELAY ?? 8000);
  setTimeout(async () => {
    try {
      const page = win.view.webContents;
      console.log("[probe]", JSON.stringify({ url: page.getURL(), title: page.getTitle(), state: win.state() }));
      fs.writeFileSync(`${base}-page.png`, (await page.capturePage()).toPNG());
      fs.writeFileSync(`${base}-header.png`, (await win.win.webContents.capturePage()).toPNG());
      console.log("[probe] captured");
    } catch (err) {
      console.log("[probe] failed", err);
    }
    app.quit();
  }, delay);
}
