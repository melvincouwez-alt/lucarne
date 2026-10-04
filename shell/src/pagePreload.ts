// Preload for the Microsoft 365 page. Chromium trims --lang=fr-FR to "fr",
// so navigator.language reads "fr" and Teams, which wants a regional tag,
// falls back to English and remembers it in localStorage.localeCode. This
// runs before the page's own scripts and hands them the full tag (fr-FR, or
// en-US when Lucarne is set to English). Side effect: a language picked in
// Teams' own settings does not stick; Lucarne's language setting decides.

import { contextBridge, ipcRenderer } from "electron";

const locale = ipcRenderer.sendSync("lucarne-page:locale") as string;
const early = (ipcRenderer.sendSync("lucarne-page:early") ?? {}) as { windowsMode?: boolean; lockDevices?: boolean; webauthn?: boolean; sharePreview?: boolean };

// Security keys at sign-in (src/webauthn.ts): the page's navigator.credentials
// is replaced by a script that asks the main process, which runs fido2-tools.
// Only Microsoft's sign-in pages get the bridge; the main process checks again.
const LOGIN = /^https:\/\/login\.(microsoftonline\.com|microsoft\.com|live\.com)$/;
if (early.webauthn && LOGIN.test(location.origin)) {
  contextBridge.exposeInMainWorld("__lucarneWebAuthn", (channel: string, data: unknown) =>
    channel === "webauthn:create" || channel === "webauthn:get" ? ipcRenderer.invoke(channel, data) : Promise.reject(new Error("refused")));
}

// Before the page's own scripts: what they read once at start.
contextBridge.executeInMainWorld({
  func: (windowsMode: boolean, lockDevices: boolean) => {
    if (windowsMode) {
      // Microsoft's pages keep some features for Windows and macOS.
      Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32", configurable: true });
      const real = (navigator as Navigator & { userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<Record<string, unknown>> } }).userAgentData;
      if (real) {
        const fake = {
          brands: (real as unknown as { brands: unknown }).brands,
          mobile: false,
          platform: "Windows",
          getHighEntropyValues: async (hints: string[]) => ({ ...(await real.getHighEntropyValues(hints)), platform: "Windows", platformVersion: "15.0.0" }),
          toJSON: () => ({ brands: (real as unknown as { brands: unknown }).brands, mobile: false, platform: "Windows" }),
        };
        Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => fake, configurable: true });
      }
    }
    const md = navigator.mediaDevices;
    if (lockDevices && md) {
      // A headset or webcam plugged in mid-call no longer takes over.
      const add = md.addEventListener.bind(md);
      md.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "devicechange") return;
        return (add as (...a: unknown[]) => void)(type, ...rest);
      }) as typeof md.addEventListener;
      Object.defineProperty(md, "ondevicechange", { configurable: true, set() {}, get: () => null });
    }
  },
  args: [Boolean(early.windowsMode), Boolean(early.lockDevices)],
});

// Screen sharing shows in the header bar (there is no border around the shared
// screen on Wayland). The page's getDisplayMedia() is wrapped to follow its
// tracks; the header's stop button calls __lucarneStopSharing() in the page.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (typeof event.data?.lucarneSharing === "string") ipcRenderer.send("lucarne-page:sharing", event.data.lucarneSharing || null);
  if (typeof event.data?.lucarnePreview === "string" && event.data.lucarnePreview.startsWith("data:image/jpeg")) ipcRenderer.send("lucarne-page:preview", event.data.lucarnePreview);
  // Teams calls and presence (src/teams.ts).
  const ev = event.data?.lucarneEvent;
  if (ev && typeof ev.type === "string") ipcRenderer.send("lucarne-page:event", ev);
});

contextBridge.executeInMainWorld({
  func: (preview: boolean) => {
    const media = navigator.mediaDevices;
    if (!media?.getDisplayMedia) return;
    // What is being shared, twice a second, for the preview window. A clone of
    // the track: no second capture, so no second portal prompt.
    const watch = (track: MediaStreamTrack) => {
      const copy = track.clone();
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = new MediaStream([copy]);
      void video.play().catch(() => undefined);
      const canvas = document.createElement("canvas");
      const timer = setInterval(() => {
        if (copy.readyState !== "live" || !video.videoWidth) return;
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.postMessage({ lucarnePreview: canvas.toDataURL("image/jpeg", 0.6) }, "*");
      }, 500);
      const stop = () => { clearInterval(timer); copy.stop(); video.srcObject = null; };
      track.addEventListener("ended", stop);
      return stop;
    };
    const live = new Set<MediaStreamTrack>();
    const report = () => {
      const first = [...live][0];
      window.postMessage({ lucarneSharing: first ? String(first.getSettings().displaySurface ?? "monitor") : "" }, "*");
    };
    const original = media.getDisplayMedia.bind(media);
    media.getDisplayMedia = async (options?: DisplayMediaStreamOptions) => {
      const stream = await original(options);
      for (const track of stream.getVideoTracks()) {
        live.add(track);
        const unwatch = preview ? watch(track) : () => undefined;
        const done = () => { live.delete(track); unwatch(); report(); };
        track.addEventListener("ended", done);
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); done(); };
      }
      report();
      return stream;
    };
    (window as unknown as { __lucarneStopSharing: () => void }).__lucarneStopSharing = () => {
      for (const track of [...live]) {
        track.stop();
        track.dispatchEvent(new Event("ended"));
      }
    };
  },
  args: [Boolean(early.sharePreview)],
});

contextBridge.executeInMainWorld({
  func: (tag: string) => {
    const languages = [...new Set([tag, tag.split("-")[0], "en-US", "en"])];
    Object.defineProperty(Navigator.prototype, "language", { get: () => tag, configurable: true });
    Object.defineProperty(Navigator.prototype, "languages", { get: () => Object.freeze([...languages]), configurable: true });
    if (!/(^|\.)teams\.(cloud\.)?microsoft(\.com)?$/.test(location.hostname)) return;
    // Teams also rewrites the code later: the redirect from teams.microsoft.com
    // carries language=en-us in its settings hash, whatever Accept-Language says,
    // so a value in another language is swapped for ours on every write too.
    // (Switching Lucarne from French to English undoes a remembered fr-fr.)
    const wanted = tag.toLowerCase();
    const primary = wanted.split("-")[0];
    const other = (value: unknown): boolean => typeof value === "string" && value !== "" && value.toLowerCase().split("-")[0] !== primary;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "localeCode" && other(String(value))) value = wanted;
      return setItem.call(this, key, value);
    };
    try {
      const saved = localStorage.getItem("localeCode");
      if (other(saved)) localStorage.setItem("localeCode", wanted);
    } catch {
      // Storage refused (opaque origin): nothing to fix.
    }
  },
  args: [locale],
});
