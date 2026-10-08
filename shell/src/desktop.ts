// Session services Electron cannot reach on elementary's Wayland session:
// idle time and screen lock come from Gala (powerMonitor reads 0 s of idle
// there), and notifications with buttons go straight to the notification
// server (Electron's own have no actions on Linux).

import type dbusModule from "@holusion/dbus-next";

type DBus = typeof dbusModule;
type Bus = ReturnType<DBus["sessionBus"]>;
// Loaded on first use (src/badge.ts says why).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbus = (): DBus => require("@holusion/dbus-next") as DBus;
type Iface = Awaited<ReturnType<Awaited<ReturnType<Bus["getProxyObject"]>>["getInterface"]>> & Record<string, (...a: unknown[]) => Promise<unknown>>;

let bus: Bus | null = null;
const ifaces = new Map<string, Promise<Iface | null>>();

function sessionBus(): Bus | null {
  if (bus) return bus;
  try {
    bus = dbus().sessionBus();
    bus.on("error", () => undefined);
  } catch {
    bus = null;
  }
  return bus;
}

function iface(name: string, path: string, interfaceName: string): Promise<Iface | null> {
  const key = `${name}${path}${interfaceName}`;
  let found = ifaces.get(key);
  if (!found) {
    const b = sessionBus();
    found = b
      ? b.getProxyObject(name, path).then((o) => o.getInterface(interfaceName) as Iface).catch(() => null)
      : Promise.resolve(null);
    ifaces.set(key, found);
  }
  return found;
}

/** Seconds since the last keyboard or pointer input, or null when Gala does not say. */
export async function idleSeconds(): Promise<number | null> {
  const monitor = await iface("org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core", "org.gnome.Mutter.IdleMonitor");
  try {
    const ms = (await monitor?.GetIdletime()) as bigint | number | undefined;
    return ms === undefined ? null : Number(ms) / 1000;
  } catch {
    return null;
  }
}

const listen = (i: Iface, signal: string, f: (...a: unknown[]) => void): void =>
  (i as unknown as { on: (s: string, f: (...a: unknown[]) => void) => void }).on(signal, f);

export interface IdleEvents {
  /** No input for `ms` (one of the delays given). */
  idle: (ms: number) => void;
  /** First input after one of those idle moments. */
  active: () => void;
  locked: (on: boolean) => void;
}

/**
 * Gala's idle watches and screen-lock signal, instead of asking every few
 * seconds: nothing runs while the session is idle. Gala restarting drops its
 * watches, so they are set again for the new one. Resolves to false when
 * Gala offers no watches (the caller then polls idleSeconds()).
 */
export async function watchIdle(delays: number[], on: IdleEvents): Promise<boolean> {
  const monitor = await iface("org.gnome.Mutter.IdleMonitor", "/org/gnome/Mutter/IdleMonitor/Core", "org.gnome.Mutter.IdleMonitor");
  if (!monitor) return false;
  const idle = new Map<number, number>();
  // The user-active watch fires once, at the next input: set only after an
  // idle watch fired, otherwise it would fire on every key press.
  let active = 0;
  let asking = false;
  let early: number[] = [];
  const arm = async (): Promise<void> => {
    idle.clear();
    active = 0;
    asking = false;
    for (const ms of delays) idle.set(Number(await monitor.AddIdleWatch(BigInt(ms))), ms);
  };
  try {
    await arm();
  } catch {
    return false;
  }
  listen(monitor, "WatchFired", (raw) => {
    const id = Number(raw);
    if (id === active) {
      active = 0;
      return on.active();
    }
    const ms = idle.get(id);
    if (ms === undefined) {
      // The active watch may fire before its id is known.
      if (asking) early.push(id);
      return;
    }
    on.idle(ms);
    if (active || asking) return;
    asking = true;
    void monitor.AddUserActiveWatch().then((got) => {
      asking = false;
      const fired = early.includes(Number(got));
      early = [];
      if (fired) on.active();
      else active = Number(got);
    }, () => {
      asking = false;
    });
  });
  const saver = await iface("org.gnome.ScreenSaver", "/org/gnome/ScreenSaver", "org.gnome.ScreenSaver");
  if (saver) listen(saver, "ActiveChanged", (v) => on.locked(Boolean(v)));
  const names = await iface("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus");
  if (names) listen(names, "NameOwnerChanged", (name, _old, owner) => {
    if (name === "org.gnome.Mutter.IdleMonitor" && owner) void arm().catch(() => undefined);
  });
  return true;
}

/** Gala's "always on top" for the focused window, on or off (ActionType.TOGGLE_ALWAYS_ON_TOP_CURRENT). */
export async function toggleAbove(): Promise<boolean> {
  const gala = await iface("org.pantheon.gala", "/org/pantheon/gala", "org.pantheon.gala");
  try {
    await gala?.PerformAction(13);
    return Boolean(gala);
  } catch {
    return false;
  }
}

export async function screenLocked(): Promise<boolean> {
  const saver = await iface("org.gnome.ScreenSaver", "/org/gnome/ScreenSaver", "org.gnome.ScreenSaver");
  try {
    return Boolean(await saver?.GetActive());
  } catch {
    return false;
  }
}

export interface Notice {
  summary: string;
  body: string;
  icon: string;
  /** Picture shown beside the app's icon (a sender's photo). */
  image?: string;
  desktopEntry: string;
  /** [key, label] pairs, shown as buttons. "default" is a click on the bubble. */
  actions: [string, string][];
  urgent?: boolean;
  onAction: (key: string) => void;
}

const handlers = new Map<number, (key: string) => void>();
let listening = false;

async function notifications(): Promise<Iface | null> {
  const n = await iface("org.freedesktop.Notifications", "/org/freedesktop/Notifications", "org.freedesktop.Notifications");
  if (n && !listening) {
    listening = true;
    listen(n, "ActionInvoked", (id, key) => handlers.get(Number(id))?.(String(key)));
    listen(n, "NotificationClosed", (id) => handlers.delete(Number(id)));
  }
  return n;
}

/** Shows a notification with buttons; resolves to its id (0 when none could be shown). */
export async function notify(notice: Notice, replaces = 0): Promise<number> {
  const n = await notifications();
  if (!n) return 0;
  try {
    const { Variant } = dbus();
    const hints: Record<string, unknown> = {
      "desktop-entry": new Variant("s", notice.desktopEntry),
      urgency: new Variant("y", notice.urgent ? 2 : 1),
      resident: new Variant("b", Boolean(notice.urgent)),
    };
    if (notice.image) hints["image-path"] = new Variant("s", notice.image);
    const id = Number(await n.Notify("Lucarne", replaces, notice.icon, notice.summary, notice.body,
      notice.actions.flat(), hints, notice.urgent ? 0 : -1));
    handlers.set(id, notice.onAction);
    return id;
  } catch {
    return 0;
  }
}

export async function closeNotice(id: number): Promise<void> {
  if (!id) return;
  handlers.delete(id);
  const n = await notifications();
  await n?.CloseNotification(id).catch(() => undefined);
}

export function closeDesktop(): void {
  bus?.disconnect();
  bus = null;
  ifaces.clear();
  handlers.clear();
  listening = false;
}
