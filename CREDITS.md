# Sources and credits

Lucarne builds on other people's work. This file lists what comes from elsewhere, under which
license, and what was taken from it.

## Code included in the repository

| Part | Origin | License | Where |
|---|---|---|---|
| WebAuthn / FIDO2 module (security keys at sign-in) | [teams-for-linux](https://github.com/IsmaelMartinez/teams-for-linux) by Ismael Martinez and contributors, commit `49ba4148` | GPL-3.0 | `shell/vendor/teams-for-linux/webauthn/` (unmodified copy, license included) |
| RNNoise LADSPA plugin (noise-cancelling microphone) | [noise-suppression-for-voice](https://github.com/werman/noise-suppression-for-voice) by werman, v1.10 | GPL-3.0 | `shell/native/librnnoise_ladspa.so` (binary released by the project) |
| RNNoise neural network, built into the plugin | [RNNoise](https://github.com/xiph/rnnoise) by Jean-Marc Valin / Xiph.Org | BSD-3-Clause | inside the same binary |

## Ideas and methods

- **teams-for-linux** was the reference for much of the Teams work: reading call and presence
  events from the page, microphone and camera fixes, company network settings (proxy,
  certificates, smart cards, Intune), custom backgrounds, the `ERR_QUIC_PROTOCOL_ERROR`
  workaround (issue #2518). Lucarne's code is written separately in TypeScript, except for the
  WebAuthn module above. Thank you to Ismael Martinez and everyone who contributed to it.
- **elementary OS**: colour palette, icon style (lighting, 1 px strokes), header bar and the
  [Human Interface Guidelines](https://docs.elementary.io/hig). Accent colours are read from the
  `io.elementary.stylesheet.*` theme.
- **Granite** and **GTK 4** for the settings app.
- **Inter** by Rasmus Andersson (SIL Open Font License 1.1) replaces Segoe UI in the pages when
  it is installed. Lucarne does not ship it.

## Dependencies

| Package | License |
|---|---|
| [Electron](https://github.com/electron/electron) | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [@holusion/dbus-next](https://github.com/Holusion/node-dbus-next) | MIT |
| [cbor-x](https://github.com/kriszyp/cbor-x) | MIT |
| [PyGObject](https://gitlab.gnome.org/GNOME/pygobject) | LGPL-2.1-or-later |
| PipeWire (`pipewire-bin`, noise filter) | MIT |
| `fido2-tools` (libfido2, Yubico), optional | BSD-2-Clause |

## Sister project

[Vasistas](https://github.com/melvincouwez-alt/vasistas) (MIT) runs Windows applications one
window at a time from a virtual machine. The two projects share no code; see the README for how
they connect.

## Trademarks

Microsoft, Microsoft 365, Word, Excel, PowerPoint, OneNote, Outlook, Teams, Power BI,
SharePoint and OneDrive are trademarks of Microsoft Corporation. Lucarne is an independent
project, not affiliated with or endorsed by Microsoft. It shows Microsoft's web services as
Microsoft serves them, with the user's own account, and contains no Microsoft code or images.
Product names are only used to say which service opens in which window. Lucarne's icons are
generic pictograms drawn for the project.

elementary and Pantheon are trademarks of elementary, Inc. Lucarne is not an elementary project.
