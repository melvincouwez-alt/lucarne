// Noise-cancelling microphone for meetings (Teams). The package carries the
// RNNoise LADSPA plugin (werman/noise-suppression-for-voice, GPL-3.0); a
// PipeWire filter-chain started here turns the default microphone into a
// "Micro antibruit" source, and MIC_HOOK (window.ts) hands that source to the
// page. The capture side is passive: the microphone only runs while a call
// reads the source. An RNNoise source that already exists (the system's own
// filter, or ours left behind by a crash) is used as is.

import fs from "fs";
import os from "os";
import path from "path";
import { execFile, spawn, type ChildProcess } from "child_process";
import { app } from "electron";
import { t } from "./i18n";

const NODE = "lucarne_rnnoise_source";
const RNNOISE = /rnnoise/i;

let child: ChildProcess | null = null;
let ready = false;

function plugin(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "rnnoise", "librnnoise_ladspa.so")
    : path.join(__dirname, "..", "native", "librnnoise_ladspa.so");
}

function config(so: string): string {
  // Device name shown in Teams; MIC_HOOK (window.ts) finds it by this name.
  const LABEL = t("Micro antibruit");
  const mono = "audio.rate = 48000 audio.channels = 1 audio.position = [ MONO ]";
  return `context.properties = { log.level = 0 }
context.spa-libs = {
  audio.convert.* = audioconvert/libspa-audioconvert
  support.*       = support/libspa-support
}
context.modules = [
  { name = libpipewire-module-rt args = { nice.level = -11 } flags = [ ifexists nofail ] }
  { name = libpipewire-module-protocol-native }
  { name = libpipewire-module-client-node }
  { name = libpipewire-module-adapter }
  { name = libpipewire-module-filter-chain
    args = {
      node.description = "${LABEL}"
      media.name = "${LABEL}"
      filter.graph = {
        nodes = [ {
          type = ladspa
          name = rnnoise
          plugin = "${so}"
          label = noise_suppressor_mono
          control = { "VAD Threshold (%)" = 50.0 "VAD Grace Period (ms)" = 200 "Retroactive VAD Grace (ms)" = 0 }
        } ]
      }
      capture.props = { node.name = "capture.${NODE}" node.passive = true ${mono} }
      playback.props = { node.name = "${NODE}" media.class = Audio/Source ${mono} }
    }
  }
]
`;
}

/** Names of the audio sources PipeWire knows, or null when pw-dump is missing. */
function sources(): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile("pw-dump", [], { timeout: 4000, maxBuffer: 32 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(null);
      try {
        const all = JSON.parse(out) as { type?: string; info?: { props?: Record<string, unknown> } }[];
        resolve(all
          .filter((o) => o.type?.endsWith("Node") && o.info?.props?.["media.class"] === "Audio/Source")
          .map((o) => String(o.info?.props?.["node.name"] ?? "")));
      } catch {
        resolve(null);
      }
    });
  });
}

/** True once an RNNoise source is there for the page to pick. */
export const noiseReady = (): boolean => ready;

/** The start in progress: two calls close together share it (one pipewire only). */
let starting: Promise<boolean> | null = null;
/** Bumped by stopNoise(): a start still running then drops what it launched. */
let generation = 0;

export function startNoise(): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  if (child) return Promise.resolve(ready);
  starting ??= launch().finally(() => {
    starting = null;
  });
  return starting;
}

async function launch(): Promise<boolean> {
  const gen = generation;
  const names = await sources();
  if (!names || gen !== generation) return false;
  if (names.some((n) => RNNOISE.test(n))) return (ready = true);
  const so = plugin();
  if (!fs.existsSync(so)) return false;
  const dir = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), "lucarne");
  const file = path.join(dir, "rnnoise.conf");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, config(so));
  } catch {
    return false;
  }
  if (gen !== generation) return false;
  const proc = spawn("pipewire", ["-c", file], { stdio: "ignore" });
  child = proc;
  proc.on("error", () => undefined);
  proc.on("exit", () => {
    if (child !== proc) return;
    child = null;
    ready = false;
  });
  // The source shows up within a few hundred milliseconds.
  for (let i = 0; i < 20 && child === proc && gen === generation; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if ((await sources())?.includes(NODE) && child === proc && gen === generation) return (ready = true);
  }
  // Stopped meanwhile, or no source after 3 s: no pipewire left running for nothing.
  if (child === proc) child = null;
  proc.kill();
  return false;
}

export function stopNoise(): void {
  generation++;
  ready = false;
  child?.kill();
  child = null;
}
