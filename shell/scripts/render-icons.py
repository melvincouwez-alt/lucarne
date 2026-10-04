#!/usr/bin/env python3
"""Render the apps' icons (../icons/hicolor, série B) to the PNGs the windows and
the splash use (assets/icons/<id>.png) and to the package icons (build/icons)."""

from pathlib import Path
import gi

gi.require_version("GdkPixbuf", "2.0")
from gi.repository import GdkPixbuf  # noqa: E402

root = Path(__file__).resolve().parent.parent
hicolor = root.parent / "icons" / "hicolor"
assets = root / "assets" / "icons"
build = root / "build" / "icons"
assets.mkdir(parents=True, exist_ok=True)
build.mkdir(parents=True, exist_ok=True)

for app in ("word", "excel", "powerpoint", "onenote", "outlook", "teams", "powerbi", "settings"):
    src = hicolor / "128x128" / "apps" / f"lucarne-{app}.svg"
    GdkPixbuf.Pixbuf.new_from_file_at_size(str(src), 192, 192).savev(str(assets / f"{app}.png"), "png", [], [])

for size in (16, 24, 32, 48, 64, 128, 256, 512):
    folder = hicolor / f"{min(size, 128)}x{min(size, 128)}" / "apps"
    GdkPixbuf.Pixbuf.new_from_file_at_size(str(folder / "lucarne-settings.svg"), size, size).savev(
        str(build / f"{size}x{size}.png"), "png", [], [])
print("icons rendered")
