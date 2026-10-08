// Unread count on the dock icon through the Unity LauncherEntry API, which
// elementary's dock reads (same as Reddit). The signal goes out from a
// connection kept for the app's lifetime: a dock drops a badge when the name
// that sent it leaves the bus.

import type dbusModule from "@holusion/dbus-next";

type DBus = typeof dbusModule;
type Props = Record<string, InstanceType<DBus["Variant"]>>;

// dbus-next is loaded on the first badge or download, not at start: it cost
// about 25 ms of every launch, including the ones that only raise the window.
function launcherEntry(dbus: DBus) {
  class LauncherEntry extends dbus.interface.Interface {
    count = 0;
    /** Download progress, 0..1, or -1 for none. */
    progress = -1;
    uri = "";

    props(): Props {
      return {
        count: new dbus.Variant("x", this.count),
        "count-visible": new dbus.Variant("b", this.count > 0),
        progress: new dbus.Variant("d", Math.max(0, this.progress)),
        "progress-visible": new dbus.Variant("b", this.progress >= 0),
      };
    }

    Update(): [string, Props] {
      return [this.uri, this.props()];
    }

    Query(): [string, Props] {
      return [this.uri, this.props()];
    }
  }

  LauncherEntry.configureMembers({
    methods: { Query: { outSignature: "sa{sv}" } },
    signals: { Update: { signature: "sa{sv}" } },
  });
  return new LauncherEntry("com.canonical.Unity.LauncherEntry");
}

let entry: ReturnType<typeof launcherEntry> | null = null;
let bus: ReturnType<DBus["sessionBus"]> | null = null;
let desktop = "";

export function initBadge(desktopId: string): void {
  desktop = desktopId;
}

function ensure(): typeof entry {
  if (entry) return entry;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbus = require("@holusion/dbus-next") as DBus;
    bus = dbus.sessionBus();
    bus.on("error", () => undefined);
    entry = launcherEntry(dbus);
    entry.uri = `application://${desktop}.desktop`;
    bus.export(`/io/github/melvincouwez/lucarne/${desktop.replace(/\W/g, "_")}`, entry);
  } catch {
    entry = null;
  }
  return entry;
}

export function setBadge(count: number): void {
  const n = Math.max(0, Math.floor(count));
  if (!entry && n === 0) return;
  const e = ensure();
  if (!e || e.count === n) return;
  e.count = n;
  try {
    e.Update();
  } catch {
    // No session bus: the badge is a nicety, not worth an error.
  }
}

/** Progress bar on the dock icon (downloads); a negative value hides it. */
export function setProgress(value: number): void {
  const p = value < 0 ? -1 : Math.min(1, value);
  if (!entry && p < 0) return;
  const e = ensure();
  if (!e || Math.abs(e.progress - p) < 0.01) return;
  e.progress = p;
  try {
    e.Update();
  } catch {
    // Same as the badge.
  }
}

export function closeBadge(): void {
  if (entry && entry.count > 0) setBadge(0);
  bus?.disconnect();
  bus = null;
  entry = null;
}
