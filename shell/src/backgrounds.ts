// Your own call backgrounds: pictures in ~/.config/lucarne/backgrounds take
// the place of Teams' stock ones, in the order Teams asks for them (as
// teams-for-linux does, by redirecting its requests for the stock images).

import fs from "fs";
import path from "path";
import { protocol, type Session } from "electron";
import { CONFIG_DIR } from "./identity";

export const BACKGROUNDS_DIR = path.join(CONFIG_DIR, "backgrounds");
const STOCK = "https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/";
const SCHEME = "lucarnebg";
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Must run before the app is ready. */
export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}

function pictures(): string[] {
  try {
    return fs.readdirSync(BACKGROUNDS_DIR).filter((f) => TYPES[path.extname(f).toLowerCase()]).sort((a, b) => a.localeCompare(b, "fr"));
  } catch {
    return [];
  }
}

const slots = new Map<string, number>();

export function enableBackgrounds(ses: Session, enabled: () => boolean): void {
  if (!ses.protocol.isProtocolHandled(SCHEME)) {
    ses.protocol.handle(SCHEME, (request) => {
      const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ""));
      const file = path.join(BACKGROUNDS_DIR, path.basename(name));
      try {
        return new Response(fs.readFileSync(file), {
          headers: { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
  }
  ses.webRequest.onBeforeRequest({ urls: [`${STOCK}*`] }, (details, callback) => {
    const mine = enabled() ? pictures() : [];
    if (!mine.length) return callback({});
    // "xyz_thumb.jpg" and "xyz.jpg" are the same background.
    const key = path.basename(new URL(details.url).pathname).replace(/(_thumb|-thumb|_thumbnail)?\.\w+$/i, "");
    if (!slots.has(key)) slots.set(key, slots.size);
    const index = slots.get(key)!;
    if (index >= mine.length) return callback({});
    callback({ redirectURL: `${SCHEME}://local/${encodeURIComponent(mine[index])}` });
  });
}
