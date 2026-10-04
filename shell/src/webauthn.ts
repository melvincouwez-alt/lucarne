// FIDO2 security keys at Microsoft sign-in. Electron has no WebAuthn UI on
// Linux, so navigator.credentials fails; teams-for-linux's module (vendored in
// vendor/teams-for-linux, GPL-3.0) talks to the key through fido2-tools and
// asks for the PIN and the touch in its own small windows. Its page-side part
// is run in the page's main world here, reaching the main process through the
// bridge src/pagePreload.ts exposes on sign-in pages only.

import fs from "fs";
import path from "path";
import type { WebContents } from "electron";

const VENDOR = path.join(__dirname, "..", "vendor", "teams-for-linux", "webauthn");
const LOGIN = /^https:\/\/login\.(microsoftonline\.com|microsoft\.com|live\.com)\//;
let ready: Promise<boolean> | null = null;
let script = "";

/** Registers the main-process side once; false when fido2-tools is missing. */
export function enableWebAuthn(first: WebContents): Promise<boolean> {
  ready ??= (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const backend = require(path.join(VENDOR, "fido2Backend.js")) as { isAvailable: () => Promise<boolean> };
      if (!(await backend.isAvailable())) return false;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webauthn = require(path.join(VENDOR, "index.js")) as { initialize: (w: unknown, c: unknown) => Promise<void> };
      await webauthn.initialize({ webContents: first }, { auth: { webauthn: { enabled: true } } });
      const allow = fs.readFileSync(path.join(VENDOR, "originAllowlist.js"), "utf8");
      const override = fs.readFileSync(path.join(VENDOR, "webauthnOverride.js"), "utf8");
      script = `(() => {
  if (window.__lucarneWebAuthnPatched || typeof window.__lucarneWebAuthn !== "function") return;
  window.__lucarneWebAuthnPatched = true;
  const process = { platform: "linux" };
  const allowlist = (() => { const module = { exports: {} }; ${allow}\n; return module.exports; })();
  const require = () => allowlist;
  const module = { exports: {} };
  ${override}
  ;module.exports.init({ auth: { webauthn: { enabled: true } } }, { invoke: (c, d) => window.__lucarneWebAuthn(c, d) });
})();`;
      return true;
    } catch {
      return false;
    }
  })();
  return ready;
}

/** Patches navigator.credentials on a Microsoft sign-in page. */
export function patchSignIn(contents: WebContents): void {
  if (!ready) return;
  void ready.then((ok) => {
    if (!ok || contents.isDestroyed() || !LOGIN.test(contents.getURL())) return;
    void contents.executeJavaScript(script).catch(() => undefined);
  });
}
