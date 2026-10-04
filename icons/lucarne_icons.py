#!/usr/bin/env python3
"""Icônes Lucarne : pictogrammes neutres au style elementary OS.

Aucune lettre ni forme reprise des logos Microsoft : chaque appli est un objet
générique (page, feuille, tableau sur chevalet, carnet, enveloppe, bulles,
écran de tableau de bord, engrenage) aux couleurs de la palette elementary.

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

HERE = Path(__file__).resolve().parent
SIZES = (128, 64, 48, 32, 24, 16)
APPS = ("word", "excel", "powerpoint", "onenote", "outlook", "teams", "powerbi", "settings")

# Palette elementary (100, 300, 500, 700, 900)
BLUEBERRY = ("#8cd5ff", "#64baff", "#3689e6", "#0d52bf", "#002e99")
LIME = ("#d1ff82", "#9bdb4d", "#68b723", "#3a9104", "#206b00")
ORANGE = ("#ffc27d", "#ffa154", "#f37329", "#cc3b02", "#a62100")
GRAPE = ("#e4c6fa", "#cd9ef7", "#a56de2", "#7239b3", "#452981")
BUBBLEGUM = ("#fe9ab8", "#f4679d", "#de3e80", "#bc245d", "#910e38")
MINT = ("#89ffdd", "#43d6b5", "#28bca3", "#0e9a83", "#007367")
BANANA = ("#fff394", "#ffe16b", "#f9c440", "#d48e15", "#ad5f00")
SLATE = ("#95a3ab", "#667885", "#485a6c", "#273445", "#0e141f")
STRAWBERRY = ("#ff8c82", "#ed5353", "#c6262e", "#a10705", "#7a0000")
COCOA = ("#a3907c", "#8a715e", "#715344", "#57392d", "#3d211b")
SILVER = ("#fafafa", "#d4d4d4", "#abacae", "#7e8087", "#555761")
# Bleus de l'appli Outlook (cyan de l'enveloppe vers le bleu marine), même échelle clair → sombre
OUTLOOK = ("#7fd8ff", "#28a8ea", "#0078d4", "#0358a7", "#032d60")


def R(v):
    return int(math.floor(v + .5))


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


def split(total, n, gap):
    """Découpe total px en n segments séparés de gap px (entiers, reste réparti au centre)."""
    free = total - gap * (n - 1)
    base = free // n
    extra = free - base * n
    sizes = [base] * n
    order = sorted(range(n), key=lambda i: abs(i - (n - 1) / 2))
    for i in order[:extra]:
        sizes[i] += 1
    out, p = [], 0
    for w in sizes:
        out.append((p, w))
        p += w + gap
    return out


# ------------------------------------------------------------ word : page de texte

def word(ids, s):
    c = BLUEBERRY
    w, h = R(s * .69), R(s * .875)
    x, y = (s - w) // 2, R(s * .0625)
    f = max(3, R(w * .27))
    r = 0 if s <= 24 else max(1, R(s / 40))
    d = (f"M{x + r} {y}H{x + w - f}L{x + w} {y + f}V{y + h - r}" + (f"A{r} {r} 0 0 1 {x + w - r} {y + h}" if r else "")
         + f"H{x + r}" + (f"A{r} {r} 0 0 1 {x} {y + h - r}" if r else "") + f"V{y + r}"
         + (f"A{r} {r} 0 0 1 {x + r} {y}" if r else "") + "Z")
    out = [body(ids, s, d, c[1], c[2], c[4])]
    # coin plié
    fd = f"M{x + w - f} {y}V{y + f}H{x + w}Z"
    gid, g = grad(ids, c[0], c[1])
    out.append(f'<defs>{g}</defs><path d="{fd}" fill="url(#{gid})"/>'
               f'<path d="M{x + w - f + .5} {y}V{y + f - .5}H{x + w}" fill="none" stroke="{c[4]}" stroke-opacity=".5"/>')
    # lignes de texte blanches
    t = {16: 1, 24: 1, 32: 2, 48: 2, 64: 3, 128: 5}[s]
    pitch = {16: 2, 24: 3, 32: 4, 48: 5, 64: 7, 128: 12}[s]
    pad = {16: 2, 24: 3, 32: 5, 48: 7, 64: 9, 128: 17}[s]
    lx0, lx1 = x + pad, x + w - pad
    ly = y + pad + (1 if s <= 16 else 0)
    bottom = y + h - pad
    widths = (1, .55, 1, 1, .7, 1, 1, .45, 1, 1, .8)
    k = 0
    lines = []
    while ly + t <= bottom:
        right = lx1 if ly >= y + f + 1 else x + w - f - (2 if s <= 24 else pitch // 2 + 1)
        wfrac = widths[k % len(widths)] if ly >= y + f else .9
        lw = max(2, R((right - lx0) * wfrac)) if right > lx0 else 0
        if k == 0:  # titre
            lw = max(2, R((right - lx0) * .6))
        if lw > 0:
            lines.append(f"M{lx0} {ly}h{lw}v{t}h{-lw}Z")
        ly += pitch
        k += 1
        if k == 1 and s >= 32:
            ly += pitch // 2
    dl = "".join(lines)
    out.append(f'<path d="{dl}" fill="#000" opacity=".12" transform="translate(0 1)"/>' if s >= 32 else "")
    out.append(f'<path d="{dl}" fill="#fff" opacity=".95"/>')
    return "".join(out)


# ------------------------------------------------------------ excel : feuille à cellules

def excel(ids, s):
    c = LIME
    x = R(s * .09)
    w = s - 2 * x
    y, h = R(s * .125), R(s * .75)
    r = 1 if s <= 16 else max(1.5, R(s / 32))
    d = rrect(x, y, w, h, r)
    out = [body(ids, s, d, c[1], c[2], c[4])]
    m = {16: 2, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    g = {16: 1, 24: 1, 32: 1, 48: 2, 64: 2, 128: 3}[s]
    ncol = 3 if s <= 24 else 4
    nrow = 3 if s <= 24 else (4 if s <= 48 else 5)
    ax, ay, aw, ah = x + m, y + m, w - 2 * m, h - 2 * m
    cols = split(aw, ncol, g)
    rows = split(ah, nrow, g)
    head, cells = [], []
    rc = .5 if s >= 48 else 0
    for i, (ry, rh) in enumerate(rows):
        for j, (cx, cw) in enumerate(cols):
            p = rrect(ax + cx, ay + ry, cw, rh, rc)
            (head if (i == 0 or j == 0) else cells).append(p)
    out.append(f'<path d="{"".join(head)}" fill="#fff" opacity=".35"/>')
    if s >= 32:
        out.append(f'<path d="{"".join(cells)}" fill="#000" opacity=".1" transform="translate(0 1)"/>')
    out.append(f'<path d="{"".join(cells)}" fill="#fff"/>')
    # cellule active encadrée (à partir de 32 px)
    if s >= 32:
        (ry, rh), (cx, cw) = rows[2], cols[2]
        bw = 1 if s <= 48 else 2
        out.append(f'<rect x="{ax + cx - bw / 2}" y="{ay + ry - bw / 2}" width="{cw + bw}" height="{rh + bw}" rx="{rc}" '
                   f'fill="none" stroke="{c[3]}" stroke-width="{bw}"/>')
    return "".join(out)


# ------------------------------------------------------------ powerpoint : tableau sur chevalet

def powerpoint(ids, s):
    c = ORANGE
    x = R(s * .06)
    w = s - 2 * x
    y, h = R(s * .07), R(s * .6)
    if s == 16:
        x, w, y, h = 1, 14, 1, 10
    r = 1 if s <= 16 else max(1.5, R(s / 32))
    # pieds du chevalet (derrière le tableau)
    lt = max(1, R(s / 26))
    by, foot = y + h, s - max(1, R(s * .04))
    cx = s / 2
    spread = R(w * .3)
    leg_c = COCOA[1]
    legs = (f'<path d="M{cx} {by - 2}L{cx - spread} {foot}M{cx} {by - 2}L{cx + spread} {foot}" stroke="{leg_c}" '
            f'stroke-width="{lt}" stroke-linecap="round" fill="none"/>'
            f'<path d="M{cx} {by - 2}V{foot}" stroke="{COCOA[0]}" stroke-width="{lt}" stroke-linecap="round" fill="none"/>')
    if s <= 24:
        legs = (f'<path d="M{cx - spread + .5} {foot}L{cx - .5} {by}M{cx + spread - .5} {foot}L{cx + .5} {by}" '
                f'stroke="{leg_c}" stroke-width="1" fill="none"/>')
    out = [legs]
    d = rrect(x, y, w, h, r)
    out.append(body(ids, s, d, c[1], c[3], c[4]))
    # écran blanc
    m = {16: 2, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    sx, sy, sw, sh = x + m, y + m, w - 2 * m, h - 2 * m
    gid, g = grad(ids, "#ffffff", "#eaeaea")
    out.append(f'<defs>{g}</defs><rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{.5 if s >= 32 else 0}" fill="url(#{gid})"/>')
    # contenu : camembert à gauche, lignes de texte à droite
    pr = (sh - (2 if s <= 24 else R(sh * .3))) / 2
    pcx, pcy = sx + R(sw * .3), sy + sh / 2
    if s <= 16:
        pr, pcx = 2, sx + 2
    a = math.radians(-90 + 120)
    ex, ey = pcx + pr * math.cos(a), pcy + pr * math.sin(a)
    out.append(f'<circle cx="{pcx}" cy="{pcy}" r="{pr}" fill="{c[2]}"/>'
               f'<path d="M{pcx} {pcy}V{pcy - pr}A{pr} {pr} 0 0 1 {ex:.2f} {ey:.2f}Z" fill="{c[4] if s > 16 else c[3]}"/>')
    t = {16: 1, 24: 1, 32: 1, 48: 2, 64: 2, 128: 4}[s]
    pitch = {16: 2, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    lx0 = R(pcx + pr) + {16: 1, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    lx1 = sx + sw - {16: 1, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    n = 2 if s <= 24 else 3
    ly = R(pcy - (n * pitch - (pitch - t)) / 2)
    lines = []
    for k in range(n):
        lw = (lx1 - lx0) if k != n - 1 else max(1, R((lx1 - lx0) * .6))
        lines.append(f"M{lx0} {ly + k * pitch}h{lw}v{t}h{-lw}Z")
    out.append(f'<path d="{"".join(lines)}" fill="{SILVER[3]}"/>')
    return "".join(out)


# ------------------------------------------------------------ onenote : carnet à spirale

def onenote(ids, s):
    c = BUBBLEGUM
    x, w = R(s * .2), R(s * .66)
    y, h = R(s * .0625), R(s * .875)
    if s == 16:
        x, w = 3, 11
    r = 1 if s <= 16 else max(1.5, R(s / 32))
    out = []
    # onglets sur la tranche droite
    tw = {16: 1, 24: 2, 32: 2, 48: 3, 64: 4, 128: 7}[s]
    th = max(2, R(h * .16))
    tabs = (BANANA, MINT, BLUEBERRY)
    gap = {16: 1, 24: 1, 32: 2, 48: 2, 64: 3, 128: 5}[s]
    ty = y + R(h * .14)
    for k, tc in enumerate(tabs):
        td = rrect(x + w - r - 2, ty + k * (th + gap), r + 2 + tw, th, min(r, 1.5) if s > 16 else 0)
        if s <= 16:
            out.append(f'<rect x="{x + w}" y="{ty + k * (th + gap)}" width="1" height="{th}" fill="{tc[2]}"/>')
        else:
            out.append(body(ids, s, td, tc[1], tc[2], tc[4], hl=.25, sh=False))
    d = rrect(x, y, w, h, r)
    out.append(body(ids, s, d, c[1], c[3], c[4]))
    # étiquette blanche
    if s >= 24:
        lx, lw = x + R(w * .3), R(w * .52)
        ly, lh = y + R(h * .2), max(3, R(h * .16))
        out.append(f'<rect x="{lx}" y="{ly + 1}" width="{lw}" height="{lh}" rx="{min(2, lh / 4)}" fill="#000" opacity=".15"/>'
                   f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="{min(2, lh / 4)}" fill="#fff" opacity=".92"/>')
        if s >= 48:
            t = 1 if s < 128 else 2
            out.append(f'<rect x="{lx + R(lw * .15)}" y="{ly + R(lh / 2) - t // 2 - (1 if s < 128 else 0)}" width="{R(lw * .7)}" '
                       f'height="{t}" fill="{c[3]}" opacity=".6"/>')
    # spirale : anneaux à cheval sur le bord gauche
    n = {16: 6, 24: 7, 32: 8, 48: 9, 64: 10, 128: 11}[s]
    rh = 1 if s <= 24 else (2 if s <= 48 else (3 if s <= 64 else 5))
    rx0 = x - {16: 2, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    rx1 = x + {16: 2, 24: 3, 32: 4, 48: 5, 64: 6, 128: 11}[s]
    top, bot = y + max(2, R(h * .06)), y + h - max(2, R(h * .06))
    step = (bot - top - rh) / (n - 1)
    rings = []
    holes = []
    for k in range(n):
        yy = R(top + k * step)
        rings.append(rrect(rx0, yy, rx1 - rx0, rh, rh / 2))
        if s >= 32:
            hr = rh / 2 + .5
            holes.append(f'<circle cx="{rx1 - hr}" cy="{yy + rh / 2}" r="{hr}" fill="{c[4]}" opacity=".6"/>')
    out.append("".join(holes))
    dr = "".join(rings)
    if s >= 32:
        out.append(f'<path d="{dr}" fill="#000" opacity=".25" transform="translate(0 1)"/>')
        gid, g = grad(ids, SILVER[0], SILVER[2])
        out.append(f'<defs>{g}</defs><path d="{dr}" fill="url(#{gid})" stroke="{SILVER[4]}" stroke-opacity=".5" stroke-width="{1 if s < 128 else 1.5}"/>')
    else:
        out.append(f'<path d="{dr}" fill="{SILVER[1]}"/>')
    return "".join(out)


# ------------------------------------------------------------ outlook : enveloppe + petit calendrier

def envelope(ids, s, x, y, w, h):
    c = OUTLOOK
    r = 1 if s <= 16 else max(1.5, R(s / 32))
    d = rrect(x, y, w, h, r)
    out = [body(ids, s, d, c[1], c[2], c[4])]
    cid = ids("c")
    mx, my = x + w / 2, y + R(h * .58)
    lw = 1 if s <= 32 else (1.5 if s <= 64 else 2.5)
    gid, g = grad(ids, c[0], c[1])
    out.append(f'<defs><clipPath id="{cid}"><path d="{d}"/></clipPath>{g}</defs><g clip-path="url(#{cid})">'
               # plis du bas
               f'<path d="M{x} {y + h}L{mx} {my - h * .12}L{x + w} {y + h}" fill="none" stroke="{c[4]}" stroke-opacity=".35" stroke-width="{lw}"/>'
               # rabat
               f'<path d="M{x} {y}L{mx} {my}L{x + w} {y}Z" fill="#000" opacity=".15" transform="translate(0 1)"/>'
               f'<path d="M{x} {y}L{mx} {my}L{x + w} {y}Z" fill="url(#{gid})"/>'
               f'<path d="M{x} {y}L{mx} {my}L{x + w} {y}" fill="none" stroke="#fff" stroke-opacity="{.95 if s <= 24 else .6}" stroke-width="{lw}"/>'
               f'<path d="{d}" fill="none" stroke="{c[4]}" stroke-opacity=".7" stroke-width="2"/></g>')
    return "".join(out)


def calendar(ids, s, x, y, w, h):
    r = max(1, R(s / 40))
    d = rrect(x, y, w, h, r)
    out = [body(ids, s, d, "#ffffff", "#e8e8e8", SILVER[4], hl=0)]
    hh = max(2, R(h * .28))
    hd = (f"M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}V{y + hh}H{x}V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z")
    out.append(body(ids, s, hd, OUTLOOK[2], OUTLOOK[3], OUTLOOK[4], hl=.25, sh=False))
    # cases du mois
    m = max(2, R(w * .16))
    ax, ay, aw, ah = x + m, y + hh + max(1, R(h * .12)), w - 2 * m, h - hh - max(1, R(h * .12)) - m + 1
    nc, nr = (3, 2) if s <= 48 else (4, 3)
    g = 1 if s <= 64 else 3
    cols, rows = split(aw, nc, g), split(ah, nr, g)
    dots = []
    for i, (ry, rh) in enumerate(rows):
        for j, (cx, cw) in enumerate(cols):
            dots.append(f'<rect x="{ax + cx}" y="{ay + ry}" width="{cw}" height="{rh}" fill="{SILVER[3] if (i, j) != (0, 1) else OUTLOOK[2]}" '
                        f'opacity="{.55 if (i, j) != (0, 1) else 1}"/>')
    out.append("".join(dots))
    return "".join(out)


def outlook(ids, s):
    if s <= 24:
        x = R(s * .06)
        y, h = R(s * .19), R(s * .62)
        if s == 16:
            x, y, h = 1, 3, 10
        return envelope(ids, s, x, y, s - 2 * x, h)
    ex, ew = R(s * .05), R(s * .8)
    ey, eh = R(s * .12), R(s * .56)
    cw = R(s * .42)
    ch = R(s * .4)
    cx = s - cw - R(s * .04)
    cy = s - ch - R(s * .07)
    return envelope(ids, s, ex, ey, ew, eh) + calendar(ids, s, cx, cy, cw, ch)


# ------------------------------------------------------------ teams : deux bulles + caméra

def bubble(x, y, w, h, r, t, side):
    """Bulle arrondie avec une queue en bas, côté gauche ou droit."""
    b = y + h
    if side == "left":
        tail = f"H{x + r + t}L{x + r * .4} {b + t}L{x + r * .55} {b}"
        return (f"M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}V{b - r}A{r} {r} 0 0 1 {x + w - r} {b}"
                f"{tail}A{r} {r} 0 0 1 {x} {b - r}V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z")
    tail = f"H{x + w - r * .55}L{x + w - r * .4} {b + t}L{x + w - r - t} {b}"
    return (f"M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}V{b - r}A{r} {r} 0 0 1 {x + w - r * .55} {b - r * .1}"
            f"{tail}H{x + r}A{r} {r} 0 0 1 {x} {b - r}V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z")


def teams(ids, s):
    c = GRAPE
    if s == 16:
        bx, by, bw, bh = 5, 1, 10, 7
        fx, fy, fw, fh = 1, 5, 11, 8
        t = 2
    else:
        bx, by, bw, bh = R(s * .33), R(s * .06), R(s * .6), R(s * .44)
        fx, fy, fw, fh = R(s * .06), R(s * .32), R(s * .66), R(s * .5)
        t = R(s * .12)
    out = [body(ids, s, bubble(bx, by, bw, bh, R(bh * .32), t * .8, "right"), c[0], c[1], c[3])]
    # trois points dans la bulle du fond (message écrit)
    if s >= 32:
        dr = max(1, s / 40)
        for k in range(3):
            out.append(f'<circle cx="{bx + bw * (.5 + .16 * k):.1f}" cy="{by + bh * .33:.1f}" r="{dr:.1f}" fill="{c[3]}" opacity=".5"/>')
    out.append(body(ids, s, bubble(fx, fy, fw, fh, R(fh * .3), t, "left"), c[2], c[3], c[4]))
    # caméra vidéo blanche dans la bulle de devant
    if s >= 24:
        cw, ch = R(fw * .36), R(fh * .4)
        lw = R(fw * .18)
        cx = R(fx + (fw - cw - lw) / 2)
        cy = R(fy + (fh - ch) / 2)
        rr = max(.5, ch * .18)
        cam = rrect(cx, cy, cw, ch, rr) + (f"M{cx + cw + R(lw * .2)} {cy + ch * .5}L{cx + cw + lw} {cy + ch * .12}"
                                           f"V{cy + ch * .88}Z")
        out.append(relief(cam, "#fff", .25))
    else:
        out.append(f'<rect x="{fx + 3}" y="{fy + 3}" width="5" height="1" fill="#fff"/>'
                   f'<rect x="{fx + 3}" y="{fy + 5}" width="3" height="1" fill="#fff" opacity=".8"/>')
    return "".join(out)


# ------------------------------------------------------------ powerbi : écran de tableau de bord

def powerbi(ids, s):
    b, sl = BANANA, SLATE
    x = R(s * .06)
    w = s - 2 * x
    y, h = R(s * .08), R(s * .64)
    if s == 16:
        x, w, y, h = 1, 14, 1, 11
    r = 1 if s <= 16 else max(1.5, R(s / 32))
    out = []
    # pied
    nw = max(2, R(s * .16))
    nx = (s - nw) // 2
    by = y + h
    foot = s - max(1, R(s * .05))
    bh = max(1, R(s * .06))
    bw = max(6, R(s * .5))
    bxx = (s - bw) // 2
    gid0, g0 = grad(ids, sl[2], sl[1])
    out.append(f'<defs>{g0}</defs><rect x="{nx}" y="{by - 1}" width="{nw}" height="{foot - by}" fill="url(#{gid0})"/>')
    out.append(body(ids, s, rrect(bxx, foot - bh, bw, bh, min(bh / 2, 2)), sl[0], sl[1], sl[3], hl=.3 if s > 16 else 0))
    # écran
    d = rrect(x, y, w, h, r)
    out.append(body(ids, s, d, b[1], b[2], b[4]))
    m = {16: 1, 24: 2, 32: 3, 48: 4, 64: 5, 128: 9}[s]
    if s == 16:
        m = 1
    sx, sy, sw, sh = x + m, y + m, w - 2 * m, h - 2 * m
    if s == 16:
        sx, sy, sw, sh = 2, 2, 12, 9
    gid, g = grad(ids, sl[3], sl[4])
    out.append(f'<defs>{g}</defs><rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{.5 if s >= 32 else 0}" fill="url(#{gid})"/>')
    # barres verticales (hauteurs irrégulières) + courbe avec points
    pad = {16: 1, 24: 2, 32: 2, 48: 3, 64: 4, 128: 8}[s]
    ax, ay, aw, ah = sx + pad, sy + pad, sw - 2 * pad, sh - 2 * pad
    n = 5 if s <= 24 else 6
    gap = 1 if s <= 32 else (2 if s <= 64 else 4)
    cols = split(aw, n, gap)
    hs = (.45, .7, .55, .9, .65, .8)[:n] if s > 24 else (.35, .7, .5, .9, .6)
    bars = []
    for (cx, cw), k in zip(cols, hs):
        bh_ = max(1, R(ah * k * (.6 if s >= 32 else 1)))
        bars.append(f"M{ax + cx} {ay + ah - bh_}h{cw}v{bh_}h{-cw}Z")
    out.append(f'<path d="{"".join(bars)}" fill="{b[2]}"/>')
    if s >= 32:
        pts = [(ax + cx + cw / 2, ay + ah * k2) for (cx, cw), k2 in zip(cols, (.5, .38, .45, .2, .3, .08))]
        lw = 1.5 if s <= 48 else (2 if s <= 64 else 4)
        p = "M" + "L".join(f"{px:.1f} {py:.1f}" for px, py in pts)
        out.append(f'<path d="{p}" fill="none" stroke="{MINT[1]}" stroke-width="{lw}" stroke-linejoin="round" stroke-linecap="round"/>')
        if s >= 48:
            dr = lw * 1.1
            out.append("".join(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{dr:.1f}" fill="#fff"/>' for px, py in pts))
    return "".join(out)


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


DRAW = {"word": word, "excel": excel, "powerpoint": powerpoint, "onenote": onenote,
        "outlook": outlook, "teams": teams, "powerbi": powerbi, "settings": settings}


def icon(app, s):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">'
            + DRAW[app](Ids(), s) + "</svg>\n")


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
