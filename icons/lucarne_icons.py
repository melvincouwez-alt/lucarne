#!/usr/bin/env python3
"""Icônes Lucarne : pictogrammes neutres au style elementary OS.

Aucune lettre ni forme reprise des logos Microsoft. Les 7 applis sont dessinées
par deux_plans.py (tuile de la palette elementary, objet blanc devant) ; ce module
dessine l'engrenage de Réglages, écrit les SVG et la planche de contrôle.

Chaque taille est dessinée dans sa propre grille de pixels (viewBox = taille),
coordonnées arrondies au pixel : contours, filets et lignes restent nets en 16
et 24. Éclairage elementary : dégradé vertical, filet blanc intérieur 1 px,
contour 1 px plus foncé, ombre portée en trois rectangles.

Usage : python3 lucarne_icons.py              écrit hicolor/<t>x<t>/apps/lucarne-*.svg
        python3 lucarne_icons.py planche [png] + planche de contrôle (défaut docs/icons.png)
"""

import io
import math
import sys
from pathlib import Path

import deux_plans

HERE = Path(__file__).resolve().parent
SIZES = (128, 64, 48, 32, 24, 16)
APPS = ("word", "excel", "powerpoint", "onenote", "outlook", "teams", "powerbi", "settings")

# Palette elementary (100, 300, 500, 700, 900)
SLATE = ("#95a3ab", "#667885", "#485a6c", "#273445", "#0e141f")
SILVER = ("#fafafa", "#d4d4d4", "#abacae", "#7e8087", "#555761")


class Ids:
    def __init__(self):
        self.n = 0

    def __call__(self, p):
        self.n += 1
        return f"{p}{self.n}"


def grad(ids, top, bottom):
    i = ids("g")
    return i, (f'<linearGradient id="{i}" x1="0" y1="0" x2="0" y2="1">'
               f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>')


# ------------------------------------------------------------ formes

def rrect(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    if r <= 0:
        return f"M{x} {y}H{x + w}V{y + h}H{x}Z"
    return (f"M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}V{y + h - r}A{r} {r} 0 0 1 {x + w - r} {y + h}"
            f"H{x + r}A{r} {r} 0 0 1 {x} {y + h - r}V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z")


def shadow(s, d):
    """Ombre portée elementary : la forme décalée de 1, 2, 3 px, de plus en plus pâle."""
    if s <= 16:
        steps = ((1, .2),)
    else:
        steps = ((1, .22), (2, .1), (3, .05))
    return "".join(f'<path d="{d}" fill="#181818" opacity="{op}" transform="translate(0 {dy})"/>' for dy, op in steps)


def body(ids, s, d, top, bottom, line, hl=.3, sh=True, line_op=.7):
    """Forme éclairée : ombre, dégradé, filet blanc intérieur 1 px, contour 1 px.

    Le contour et le filet sont des traits centrés sur le bord, rognés par la
    forme elle-même : 2 px de trait = 1 px à l'intérieur, quelle que soit la forme.
    """
    gid, g = grad(ids, top, bottom)
    cid = ids("c")
    out = [f'<defs>{g}<clipPath id="{cid}"><path d="{d}"/></clipPath></defs>']
    if sh:
        out.append(shadow(s, d))
    out.append(f'<path d="{d}" fill="url(#{gid})"/>')
    out.append(f'<g clip-path="url(#{cid})" fill="none">'
               + (f'<path d="{d}" stroke="#fff" stroke-opacity="{hl}" stroke-width="4"/>' if hl else "")
               + f'<path d="{d}" stroke="{line}" stroke-opacity="{line_op}" stroke-width="2"/></g>')
    return "".join(out)


def relief(d, fill, op=.2):
    """Pictogramme en relief : copie noire décalée d'1 px dessous."""
    return (f'<path d="{d}" fill="#000" opacity="{op}" fill-rule="evenodd" transform="translate(0 1)"/>'
            f'<path d="{d}" fill="{fill}" fill-rule="evenodd"/>')


# ------------------------------------------------------------ settings : engrenage sur tuile ardoise

FRAMES = {16: (2, 2, 12, 1.5), 24: (3, 3, 18, 1.5), 32: (3, 3, 26, 2.5),
          48: (5, 6, 38, 3.5), 64: (5, 5, 54, 5.5), 128: (13, 16, 102, 9.5)}


def gear(cx, cy, r, teeth=8, depth=.24, hole=.36):
    pts = []
    n = teeth * 4
    for i in range(n):
        a = 2 * math.pi * (i - .5) / n - math.pi / 2
        rr = r if (i % 4) in (0, 1) else r * (1 - depth)
        pts.append(f"{cx + rr * math.cos(a):.2f} {cy + rr * math.sin(a):.2f}")
    h = r * hole
    return ("M" + "L".join(pts) + "Z"
            f"M{cx + h} {cy}A{h} {h} 0 1 0 {cx - h} {cy}A{h} {h} 0 1 0 {cx + h} {cy}Z")


def settings(ids, s):
    x, y, side, r = FRAMES[s]
    if s == 16:
        x, y, side, r = 1, 1, 14, 2
    out = [body(ids, s, rrect(x, y, side, side, r), SLATE[1], SLATE[2], SLATE[4], hl=.3 if s > 16 else .15)]
    teeth = 6 if s <= 16 else 8
    gr = side * (.42 if s <= 24 else .36)
    out.append(relief(gear(x + side / 2, y + side / 2, gr, teeth, .26 if s <= 24 else .24, .34),
                      SILVER[0], .3))
    return "".join(out)


def icon(app, s):
    """Les 7 applis viennent de deux_plans.py, Réglages est dessiné ici."""
    if app in deux_plans.APPS:
        return deux_plans.icon(app, s)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">'
            + settings(Ids(), s) + "</svg>\n")


def install():
    out = HERE / "hicolor"
    for s in SIZES:
        d = out / f"{s}x{s}" / "apps"
        d.mkdir(parents=True, exist_ok=True)
        for app in APPS:
            (d / f"lucarne-{app}.svg").write_text(icon(app, s))
    print(f"Icônes écrites dans {out} (lucarne-*.svg, {len(SIZES)} tailles)")


# ------------------------------------------------------------ planche de contrôle

def png(svg, px):
    import gi
    gi.require_version("GdkPixbuf", "2.0")
    from gi.repository import GdkPixbuf
    from PIL import Image
    loader = GdkPixbuf.PixbufLoader()
    loader.write(svg.encode())
    loader.close()
    pb = loader.get_pixbuf()
    if pb.get_width() != px:
        pb = pb.scale_simple(px, px, GdkPixbuf.InterpType.BILINEAR)
    return Image.open(io.BytesIO(pb.save_to_bufferv("png", [], [])[1])).convert("RGBA")


def planche(dest):
    """Toutes icônes, toutes tailles, fond clair puis sombre ; 16 et 24 aussi agrandies x4 (pixels nets)."""
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-Medium.otf", 18)
    except OSError:
        font = ImageFont.load_default()
    Z = 4
    label = 130
    cellw = sum(SIZES) + 14 * len(SIZES) + 16 * Z + 24 * Z + 40
    rowh = 140
    W = label + cellw
    H = 20 + rowh * len(APPS)
    sheet = Image.new("RGB", (W, H * 2), "#f5f5f5")
    sheet.paste("#2b2b2b", (0, H, W, H * 2))
    dr = ImageDraw.Draw(sheet)
    for half in (0, H):
        for i, app in enumerate(APPS):
            y = half + 10 + i * rowh
            dr.text((14, y + 56), app, fill="#333" if not half else "#ddd", font=font)
            x = label
            for z in SIZES:
                im = png(icon(app, z), z)
                sheet.paste(im, (x, y + 128 - z), im)
                x += z + 14
            for z in (16, 24):
                im = png(icon(app, z), z).resize((z * Z, z * Z), Image.NEAREST)
                sheet.paste(im, (x, y + 128 - z * Z if z * Z <= 128 else y), im)
                x += z * Z + 20
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest)
    print(f"Planche : {dest}")


if __name__ == "__main__":
    install()
    if len(sys.argv) > 1 and sys.argv[1] == "planche":
        planche(sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent.parent / "docs" / "icons.png"))
