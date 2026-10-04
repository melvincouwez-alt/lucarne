// Company networks and sign-in, after teams-for-linux's certificate,
// clientCertificate, intune and ssoPasswordPrefill modules:
// - proxy rules for every session;
// - company root certificates trusted by fingerprint;
// - smartcard PIN asked in a small window;
// - Intune-managed devices: Microsoft Identity Broker's PRT cookie added to
//   sign-in requests, so the device-compliance check passes;
// - sign-in address filled in, password from a command (pass, secret-tool…).

import { exec } from "child_process";
import { X509Certificate } from "crypto";
import dbus from "@holusion/dbus-next";
import { app, type Session, type WebContents } from "electron";
import type { AppConfig } from "./config";
import { ask } from "./panel";
import { t } from "./i18n";

// ---------- proxy and certificates

export async function applyNetwork(ses: Session, conf: AppConfig): Promise<void> {
  const rules = conf.proxy.trim();
  await ses.setProxy(rules ? { proxyRules: rules, proxyBypassRules: "<local>" } : { mode: "system" }).catch(() => undefined);
  const fingerprints = conf.caFingerprints.filter((f) => typeof f === "string" && f.trim()).map((f) => f.trim().toLowerCase().replace(/^sha256\//, ""));
  if (!fingerprints.length) {
    ses.setCertificateVerifyProc(null);
    return;
  }
  ses.setCertificateVerifyProc((request, callback) => {
    // -3: Chromium's own verdict. Only "unknown authority" can be overridden,
    // never a wrong name, an expired or revoked certificate.
    // (-202 is net::ERR_CERT_AUTHORITY_INVALID.)
    const authority = request.errorCode === -202 || /^(net::)?(ERR_)?CERT_AUTHORITY_INVALID$/.test(request.verificationResult);
    if (!authority) return callback(-3);
    callback(pinnedChain(request, fingerprints) ? 0 : -3);
  });
}

// Electron gives "sha256/<base64>"; people copy "AB:CD:…" hex from a browser.
function forms(fp: string): string[] {
  const b64 = fp.replace(/^sha256\//, "");
  const hex = Buffer.from(b64, "base64").toString("hex");
  return [b64.toLowerCase(), hex, hex.match(/../g)?.join(":") ?? ""];
}

/**
 * The server's chain leads, signature by signature, to a company certificate
 * the user pinned: the leaf names the host, every certificate up to the
 * pinned one is in date, each is signed by the next, and the signers are CAs.
 * The chain is the one the server sent (and the one Chromium built, as a
 * second try); the pinned certificate must be part of it.
 */
function pinnedChain(request: Electron.Request, pinned: string[]): boolean {
  const now = Date.now() / 1000;
  for (const start of [request.certificate, request.validatedCertificate]) {
    const chain: { cert: Electron.Certificate; x509: X509Certificate }[] = [];
    try {
      for (let c: Electron.Certificate | undefined = start; c && chain.length < 10; c = c.issuerCert) chain.push({ cert: c, x509: new X509Certificate(c.data) });
    } catch {
      continue;
    }
    if (!chain.length) continue;
    const leaf = chain[0].x509;
    const host = request.hostname.replace(/^\[|\]$/g, "");
    const named = /^[\d.]+$|:/.test(host) ? Boolean(leaf.checkIP(host)) : Boolean(leaf.checkHost(host));
    if (!named) continue;
    for (let i = 0; i < chain.length; i++) {
      const { cert, x509 } = chain[i];
      if (!(cert.validStart <= now && now <= cert.validExpiry)) break;
      const mine = [...forms(cert.fingerprint), x509.fingerprint256.toLowerCase(), x509.fingerprint256.toLowerCase().replace(/:/g, "")];
      if (mine.some((f) => pinned.includes(f))) return true;
      const parent = chain[i + 1]?.x509;
      if (!parent || !parent.ca || !x509.checkIssued(parent) || !x509.verify(parent.publicKey)) break;
    }
  }
  return false;
}

// ---------- smartcard PIN

const pinTries = new Map<string, number>();
let pinHandler = false;

export function enableSmartcardPin(): void {
  if (pinHandler) return;
  const setter = (app as unknown as { setClientCertRequestPasswordHandler?: (h: (d: { hostname: string; tokenName: string; isRetry: boolean }) => Promise<string>) => void }).setClientCertRequestPasswordHandler;
  if (typeof setter !== "function") return;
  pinHandler = true;
  setter.call(app, async ({ hostname, tokenName, isRetry }) => {
    const tries = pinTries.get(tokenName) ?? 0;
    // Too many wrong PINs lock the card for good: stop after three.
    if (tries >= 3) throw new Error("PIN attempts exhausted");
    const pin = await ask(t("Code PIN de la carte"),
      t("{host} demande un certificat. Code PIN de « {token} » :", { host: hostname, token: tokenName }) + (isRetry ? t(" (le précédent était faux ; plusieurs erreurs bloquent la carte)") : ""),
      true);
    if (pin === null) throw new Error("PIN entry cancelled");
    pinTries.set(tokenName, tries + 1);
    return pin;
  });
}

// ---------- Intune (Microsoft Identity Broker)

const BROKER = { destination: "com.microsoft.identity.broker1", path: "/com/microsoft/identity/broker1", interface: "com.microsoft.identity.Broker1" };
let brokerBus: ReturnType<typeof dbus.sessionBus> | null = null;
let brokerAccount: Record<string, unknown> | null = null;

async function broker(member: string, request: unknown): Promise<Record<string, unknown>> {
  brokerBus ??= dbus.sessionBus();
  const reply = await brokerBus.call(new dbus.Message({ ...BROKER, member, signature: "sss", body: ["0.0", "", JSON.stringify(request)] }));
  return JSON.parse(String(reply?.body?.[0] ?? "{}")) as Record<string, unknown>;
}

/** Hooks the broker into a session's sign-in requests; false when no broker answers. */
export async function enableIntune(ses: Session, user: string): Promise<boolean> {
  try {
    if (!brokerAccount) {
      const res = await broker("getAccounts", { clientId: "88200948-af09-45a1-9c03-53cdcc75c183", redirectUri: "urn:ietf:oob" });
      const accounts = (res.accounts as Record<string, unknown>[] | undefined) ?? [];
      brokerAccount = accounts.find((a) => !user || String(a.username).toLowerCase() === user.toLowerCase()) ?? null;
    }
  } catch {
    return false;
  }
  if (!brokerAccount) return false;
  ses.webRequest.onBeforeSendHeaders({ urls: ["https://login.microsoftonline.com/*"] }, (details, callback) => {
    const account = brokerAccount;
    if (!account) return callback({ requestHeaders: details.requestHeaders });
    broker("acquirePrtSsoCookie", {
      account,
      authParameters: {
        account,
        additionalQueryParametersForAuthorization: {},
        authority: "https://login.microsoftonline.com/common",
        authorizationType: 8,
        clientId: "d7b530a4-7680-4c23-a8bf-c52c121d2e87",
        redirectUri: "https://login.microsoftonline.com/common/oauth2/nativeclient",
        requestedScopes: ["openid", "profile", "offline_access"],
        username: account.username,
        uxContextHandle: -1,
        ssoUrl: details.url,
      },
      mamEnrollment: false,
      ssoUrl: details.url,
    }).then((res) => {
      const items = res.cookieItems as { cookieContent?: string }[] | undefined;
      const cookie = items?.[0]?.cookieContent ?? (res.cookieContent as string | undefined);
      if (cookie) details.requestHeaders["X-Ms-Refreshtokencredential"] = cookie;
    }).catch(() => undefined).finally(() => callback({ requestHeaders: details.requestHeaders }));
  });
  return true;
}

// ---------- sign-in page: address and password

const LOGIN_HOSTS = /^(login\.microsoftonline\.com|login\.microsoft\.com|login\.live\.com)$/;

function passwordFrom(command: string): Promise<string> {
  return new Promise((resolve, reject) =>
    exec(command, { timeout: 15_000, maxBuffer: 1 << 20 }, (err, out) => (err ? reject(err) : resolve(String(out).split(/\r?\n/, 1)[0]))));
}

/** Fills Microsoft's sign-in form in this page. Never submits the password itself. */
export function watchSignIn(contents: WebContents, conf: () => AppConfig): void {
  let busy = false;
  contents.on("did-finish-load", () => {
    const { loginUser, passwordCommand } = conf();
    if (busy || (!loginUser && !passwordCommand)) return;
    let host = "";
    try {
      host = new URL(contents.getURL()).hostname;
    } catch {
      return;
    }
    if (!LOGIN_HOSTS.test(host)) return;
    busy = true;
    const fill = async (): Promise<void> => {
      const password = passwordCommand ? await passwordFrom(passwordCommand).catch(() => "") : "";
      // The command may take a while (a pass prompt): the page could have left
      // Microsoft's sign-in meanwhile. The password only goes to that page.
      if (contents.isDestroyed()) return;
      let now = "";
      try {
        const u = new URL(contents.getURL());
        now = u.protocol === "https:" ? u.hostname : "";
      } catch {
        return;
      }
      if (!LOGIN_HOSTS.test(now)) return;
      await contents.executeJavaScript(`((user, pwd) => new Promise((done) => {
        const visible = (el) => el && (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
        const set = (el, v) => {
          el.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        let userDone = !user, pwdDone = !pwd;
        const step = () => {
          if (!userDone) {
            const el = [...document.querySelectorAll('input[type=email], input[name=loginfmt]')].find(visible);
            if (el) {
              userDone = true;
              if (!el.value) { set(el, user); document.querySelector("#idSIButton9")?.click(); }
            }
          }
          if (!pwdDone) {
            const el = [...document.querySelectorAll("input[type=password]")].find(visible);
            if (el && !el.value) { pwdDone = true; set(el, pwd); }
          }
          return userDone && pwdDone;
        };
        if (step()) return done(true);
        const obs = new MutationObserver(() => { if (step()) { obs.disconnect(); done(true); } });
        obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(() => { obs.disconnect(); done(false); }, 20000);
      }))(${JSON.stringify(loginUser)}, ${JSON.stringify(password)})`);
    };
    void fill().catch(() => undefined).finally(() => (busy = false));
  });
}

export function closeEnterprise(): void {
  brokerBus?.disconnect();
  brokerBus = null;
}
