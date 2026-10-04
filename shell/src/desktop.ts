// Session services Electron cannot reach on elementary's Wayland session:
// idle time and screen lock come from Gala (powerMonitor reads 0 s of idle
// there), and notifications with buttons go straight to the notification
// server (Electron's own have no actions on Linux).

import dbus from "@holusion/dbus-next";

type Bus = ReturnType<typeof dbus.sessionBus>;
type Iface = Awaited<ReturnType<Awaited<ReturnType<Bus["getProxyObject"]>>["getInterface"]>> & Record<string, (...a: unknown[]) => Promise<unknown>>;

let bus: Bus | null = null;
const ifaces = new Map<string, Promise<Iface | null>>();

function sessionBus(): Bus | null {
  if (bus) return bus;
  try {
    bus = dbus.sessionBus();
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
    const on = (n as unknown as { on: (s: string, f: (...a: unknown[]) => void) => void }).on.bind(n);
    on("ActionInvoked", (id, key) => handlers.get(Number(id))?.(String(key)));
    on("NotificationClosed", (id) => handlers.delete(Number(id)));
  }
  return n;
}

/** Shows a notification with buttons; resolves to its id (0 when none could be shown). */
export async function notify(notice: Notice, replaces = 0): Promise<number> {
  const n = await notifications();
  if (!n) return 0;
  try {
    const hints = {
      "desktop-entry": new dbus.Variant("s", notice.desktopEntry),
      urgency: new dbus.Variant("y", notice.urgent ? 2 : 1),
      resident: new dbus.Variant("b", Boolean(notice.urgent)),
    };
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
