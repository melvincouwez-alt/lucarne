# Sources et crédits

Lucarne s'appuie sur le travail d'autres personnes. Ce fichier liste ce qui vient d'ailleurs,
sous quelle licence, et ce qui en a été repris.

## Code inclus dans le dépôt

| Partie | Origine | Licence | Emplacement |
|---|---|---|---|
| Module WebAuthn / FIDO2 (clés de sécurité à la connexion) | [teams-for-linux](https://github.com/IsmaelMartinez/teams-for-linux) d'Ismael Martinez et ses contributeurs, commit `49ba4148` | GPL-3.0 | `shell/vendor/teams-for-linux/webauthn/` (copie non modifiée, licence jointe) |
| Greffon LADSPA RNNoise (micro antibruit) | [noise-suppression-for-voice](https://github.com/werman/noise-suppression-for-voice) de werman, v1.10 | GPL-3.0 | `shell/native/librnnoise_ladspa.so` (binaire publié par le projet) |
| Réseau de neurones RNNoise, intégré au greffon | [RNNoise](https://github.com/xiph/rnnoise) de Jean-Marc Valin / Xiph.Org | BSD-3-Clause (texte ci-dessous) | dans le même binaire |

## Idées et méthodes

- teams-for-linux a servi de référence pour une grande partie du travail sur Teams :
  lecture des événements d'appel et de présence dans la page, correctifs du micro et de la
  caméra, réglages des réseaux d'entreprise (proxy, certificats, cartes à puce, Intune), fonds
  personnalisés, contournement de `ERR_QUIC_PROTOCOL_ERROR` (ticket #2518). Le code de Lucarne
  est écrit à part en TypeScript, sauf le module WebAuthn ci-dessus. Merci à Ismael Martinez et
  à tous ceux qui y ont contribué.
- elementary OS : style des icônes (éclairage, filets de 1 px, palette de couleurs, sauf pour
  Outlook qui a un bleu denim propre au projet, plus éloigné du bleu de Word), barre de titre et
  [Human Interface Guidelines](https://docs.elementary.io/hig). Les couleurs d'accent sont lues
  dans le thème `io.elementary.stylesheet.*`. Aucun fichier d'icône d'elementary n'est copié :
  les icônes de Lucarne sont générées par `icons/deux_plans.py`.
- Granite et GTK 4 pour l'application de réglages.
- Inter de Rasmus Andersson (SIL Open Font License 1.1) remplace Segoe UI dans les pages
  quand elle est installée. Lucarne ne la fournit pas.

## Dépendances

| Paquet | Licence |
|---|---|
| [Electron](https://github.com/electron/electron) | MIT (le paquet `.deb` contient les licences de Chromium fournies par Electron) |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [@holusion/dbus-next](https://github.com/Holusion/node-dbus-next) | MIT |
| [cbor-x](https://github.com/kriszyp/cbor-x) | MIT |
| [PyGObject](https://gitlab.gnome.org/GNOME/pygobject) | LGPL-2.1 ou ultérieure |
| PipeWire (`pipewire-bin`, filtre antibruit) | MIT |
| `fido2-tools` (libfido2, Yubico), facultatif | BSD-2-Clause |

## Projet voisin

[Vasistas](https://github.com/melvincouwez-alt/vasistas) (MIT) affiche les applications
Windows d'une machine virtuelle fenêtre par fenêtre. Les deux projets ne partagent aucun code ;
le README explique comment ils communiquent.

## Marques

Microsoft, Microsoft 365, Office, Word, Excel, PowerPoint, OneNote, Outlook, Teams, Power BI,
SharePoint et OneDrive sont des marques de Microsoft Corporation. Lucarne est un projet
indépendant, non affilié à Microsoft et non approuvé par Microsoft. Il affiche les services web
de Microsoft tels que Microsoft les sert, avec le compte de l'utilisateur, et ne contient ni
code, ni image, ni police de Microsoft. Les noms de produits servent seulement à dire quel
service s'ouvre dans quelle fenêtre. Les icônes de Lucarne sont des dessins originaux faits
pour le projet, sans logo ni lettre de Microsoft.

elementary et Pantheon sont des marques d'elementary, Inc. Lucarne n'est pas un projet
elementary.

## Texte de licence de RNNoise

Texte d'origine, en anglais, tel que le demande la licence BSD-3-Clause pour une distribution
sous forme binaire.

```
Copyright (c) 2017, Mozilla
Copyright (c) 2007-2017, Jean-Marc Valin
Copyright (c) 2005-2017, Xiph.Org Foundation
Copyright (c) 2003-2004, Mark Borgerding

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

- Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.

- Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

- Neither the name of the Xiph.Org Foundation nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION
OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
