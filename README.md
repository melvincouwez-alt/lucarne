# Lucarne

Lucarne opens the Microsoft 365 web apps (Word, Excel, PowerPoint, OneNote, Outlook, Teams,
Power BI) in their own desktop windows on elementary OS. Each service gets a window, a dock
icon, system notifications and an unread counter, like an installed app. What you see inside
is the page Microsoft serves to a browser: Lucarne does not imitate or replace Office, it frames
it.

A *lucarne* is a small window set into a roof. The project is the sibling of
[Vasistas](https://github.com/melvincouwez-alt/vasistas), which does the same for Windows
applications running in a virtual machine.

Lucarne is an independent project, not affiliated with Microsoft. See [Trademarks](#trademarks).

![Lucarne icons](docs/icons.png)

## What it does

- One window per service, with an elementary header bar (in the service's colour, or neutral)
  and a fixed Wayland `app_id` (`lucarne-<app>`), so the dock groups windows properly.
- One Microsoft sign-in for all seven windows: the `login.microsoftonline.com` cookies are
  shared between the app profiles through a file only you can read.
- System notifications with an "Open" button, unread badges in the dock.
- Links clicked in Chrome (SharePoint and OneDrive documents, Outlook, Teams, Power BI) are
  sent to the right window by a small extension.
- Teams: screen sharing through the Wayland portal, noise-cancelling microphone (RNNoise),
  the infrared camera hidden from the camera list, incoming calls as notifications with
  buttons, status from the panel, several accounts, company network settings.
- A "Lucarne Settings" app (GTK 4 + Granite): home page, single window, notifications,
  autostart and style, per service.
- English and French. The language follows the system, or can be set in Settings.

## Install

Download the `.deb` from the [releases](https://github.com/melvincouwez-alt/lucarne/releases)
and install it:

```sh
sudo apt install ./lucarne-<version>-linux-amd64.deb
```

The package contains the windows (`lucarne-app`), the `lucarne` and `lucarne-settings`
commands, the launchers, the icons and the Chrome native messaging host. It replaces the
earlier `microsoft365-elementary` package; on first start the `~/.config/m365-linux`,
`~/.local/share/m365-linux` and `~/.cache/m365-linux` folders are renamed to `lucarne`, signed-in
profiles included.

To send links from Chrome to Lucarne, load the extension once: open `chrome://extensions`,
turn on developer mode, choose "Load unpacked" and pick
`/opt/Lucarne/resources/desktop/extension`.

Tested on elementary OS 9 (Wayland). Other Debian-based desktops should work; the
settings app needs Granite 7.

## Build from source

```sh
cd shell
npm ci
npm run dist        # shell/release/lucarne-<version>-linux-amd64.deb
```

For development without the package, `./install.sh` links the commands into `~/.local/bin`
and writes the launchers to `~/.local/share/applications`. Without `lucarne-app`, the
`lucarne` command falls back to a Chrome `--app` window that goes through a fixed local page,
which also gives each service a stable `app_id`.

## Command line

```
lucarne <app> [URL]                     open a service (word, excel, powerpoint, onenote, outlook, teams, powerbi)
lucarne open <URL|ms-word:…|file>       pick the service from the address
lucarne link <app> URL [file]           a clicked link: on the web, or in Office in Vasistas, per the settings
lucarne config get                      settings as JSON
lucarne config set <app> <key> <value>
lucarne config set language auto|en|fr
lucarne status                          state as JSON (services, extension, Vasistas)
```

## Working with Vasistas

The two projects share no code and each works on its own. When both are installed, they talk
through their commands only, looked up in `PATH` when needed. Nothing runs in the background
for it.

- Lucarne to Vasistas: when a service is set to "Windows VM", a clicked document goes to
  `vasistas launch "ms-word:ofe|u|<file address>"` (Office opens the file itself), and a local
  file to `vasistas open`. `LUCARNE_VASISTAS` overrides the command. Without Vasistas, the
  choice is hidden in Settings and in the extension.
- Vasistas to Lucarne: the "Browser" page of the Vasistas companion app reads
  `lucarne status` and `lucarne config get`, and saves the choice with
  `lucarne config set <app> target vm|web`.

## Layout

| Path | What it is |
|---|---|
| `shell/` | Electron app (TypeScript). One process per service: `lucarne-app --lucarne-app=<id> [URL]`. |
| `bin/lucarne` | Main command: opens a service, picks the service for an address, interface for other programs. |
| `bin/lucarne-settings` | Settings app. |
| `bin/lucarne-native-host` | Native messaging host for the Chrome extension. |
| `bin/lucarne_config.py`, `bin/lucarne_i18n.py` | `~/.config/lucarne/config.json`, translations. |
| `bin/lucarne-desktop-files` | Writes the `.desktop` launchers (used by `install.sh` and the package). |
| `extension/` | Chrome extension (Manifest V3). |
| `icons/lucarne_icons.py` | Draws the icons: generic pictograms in the elementary palette. |

## Development notes

- Test without touching your real profile: `HOME=<throwaway folder> LUCARNE_DEV_PROBE=/path.png
  shell/release/linux-unpacked/lucarne-app --no-sandbox --lucarne-app=outlook`. Never start it
  with an empty `HOME`: Electron then falls back to your real profile.
- Type check: `cd shell && npx tsc --noEmit -p .`.

## License

GPL-3.0-or-later, see [LICENSE](LICENSE). Lucarne includes GPL-3.0 code (teams-for-linux, the
RNNoise plugin). Sources and credits are listed in [CREDITS.md](CREDITS.md).

## Trademarks

Microsoft, Microsoft 365, Word, Excel, PowerPoint, OneNote, Outlook, Teams, Power BI,
SharePoint and OneDrive are trademarks of Microsoft Corporation. Lucarne is not affiliated
with or endorsed by Microsoft. These names are only used to say which service opens in which
window. The icons are generic pictograms drawn for the project. Lucarne contains no Microsoft
code, images or fonts.
