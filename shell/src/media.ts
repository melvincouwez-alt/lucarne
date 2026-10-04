// Microphone and camera fixes for calls, after teams-for-linux's
// disableAutogain, cameraResolution, cameraAspectRatio and ignoreSystemMute.
// The page reads window.__lucarneMedia on every getUserMedia(), so a switch in
// Réglages applies to the next call.

import type { AppConfig } from "./config";

export function mediaFlags(conf: AppConfig): string {
  const flags = {
    autoGain: conf.autoGain,
    cameraRatio: conf.cameraRatio,
    cameraFull: conf.cameraFull,
    ignoreSystemMute: conf.ignoreSystemMute,
  };
  return `window.__lucarneMedia = ${JSON.stringify(flags)};`;
}

export const MEDIA_HOOK = `(() => {
  const md = navigator.mediaDevices;
  if (window.__lucarneMediaHook || !md) return;
  window.__lucarneMediaHook = true;
  const flags = () => window.__lucarneMedia || {};
  const isDesktop = (c) => c && typeof c === "object" && (c.mandatory?.chromeMediaSource || c.chromeMediaSource);

  const audioConstraints = (audio) => {
    if (!audio || flags().autoGain !== false) return audio;
    const base = typeof audio === "object" ? { ...audio } : {};
    base.autoGainControl = false;
    // Older names some builds of Teams still send.
    for (const k of ["googAutoGainControl", "googAutoGainControl2"]) if (k in base) base[k] = false;
    if (base.mandatory) base.mandatory = { ...base.mandatory, googAutoGainControl: false, googAutoGainControl2: false };
    if (Array.isArray(base.optional)) base.optional = base.optional.map((o) => ("googAutoGainControl" in o ? { googAutoGainControl: false } : o));
    return base;
  };
  const videoConstraints = (video) => {
    if (!video || !flags().cameraFull || typeof video !== "object" || isDesktop(video)) return video;
    const { width, height, aspectRatio, ...rest } = video;
    return rest;
  };

  // Teams copied the system mute (PipeWire reports it every second) onto its own button.
  const quiet = (track) => {
    if (track.kind !== "audio" || track.__lucarneQuiet) return;
    track.__lucarneQuiet = true;
    try { Object.defineProperty(track, "muted", { configurable: true, get: () => false }); } catch {}
    const add = track.addEventListener;
    track.addEventListener = function (type, ...rest) { if (type === "mute" || type === "unmute") return; return add.call(this, type, ...rest); };
    for (const p of ["onmute", "onunmute"]) try { Object.defineProperty(track, p, { configurable: true, set() {}, get: () => null }); } catch {}
  };

  // Moving the window to another screen could stretch the camera picture.
  const cameras = new Set();
  const keepShape = async (track) => {
    if (track.readyState !== "live") return;
    const { width, height } = track.getSettings();
    if (!width || !height) return;
    try { await track.applyConstraints({ width: { ideal: width }, height: { ideal: height }, aspectRatio: { exact: width / height } }); }
    catch { try { await track.applyConstraints({ aspectRatio: { ideal: width / height } }); } catch {} }
  };
  let last = innerWidth + "x" + innerHeight;
  const recheck = () => {
    if (!flags().cameraRatio) return;
    const now = innerWidth + "x" + innerHeight;
    if (now === last) return;
    last = now;
    for (const t of cameras) keepShape(t);
  };
  addEventListener("resize", () => setTimeout(recheck, 300));
  screen.addEventListener?.("change", () => { last = ""; setTimeout(recheck, 300); });

  const getUserMedia = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints) => {
    const wanted = constraints && typeof constraints === "object"
      ? { ...constraints, audio: audioConstraints(constraints.audio), video: videoConstraints(constraints.video) }
      : constraints;
    const stream = await getUserMedia(wanted);
    if (flags().ignoreSystemMute) stream.getAudioTracks().forEach(quiet);
    if (constraints?.video && !isDesktop(constraints.video)) {
      for (const t of stream.getVideoTracks()) {
        cameras.add(t);
        // "ended" only fires when the device goes away; stop() from the page
        // does not send it, so the stopped track is dropped here too.
        t.addEventListener("ended", () => cameras.delete(t));
        const stop = t.stop;
        t.stop = function () { cameras.delete(t); return stop.call(this); };
        if (flags().cameraRatio) keepShape(t);
      }
    }
    return stream;
  };
})();`;
