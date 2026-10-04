// Unread count on the dock icon through the Unity LauncherEntry API, which
// elementary's dock reads (same as Reddit). The signal goes out from a
// connection kept for the app's lifetime: a dock drops a badge when the name
// that sent it leaves the bus.

import dbus from "@holusion/dbus-next";

type Props = Record<string, InstanceType<typeof dbus.Variant>>;

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

let entry: LauncherEntry | null = null;
let bus: ReturnType<typeof dbus.sessionBus> | null = null;
let desktop = "";

export function initBadge(desktopId: string): void {
  desktop = desktopId;
}

function ensure(): LauncherEntry | null {
  if (entry) return entry;
  try {
    bus = dbus.sessionBus();
    bus.on("error", () => undefined);
    entry = new LauncherEntry("com.canonical.Unity.LauncherEntry");
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
