"""Icônes « deux plans » (choix TL du 2026-10-05) : style elementary, une scène par appli.

Plan arrière : tuile de couleur (palette PAL, dégradé diagonal 300 → 700, filet blanc
intérieur, contour 900). Plan avant : objet blanc du thème (papier argent) propre à
chaque appli, posé droit à toutes les tailles (net au pixel dans le dock).

128, 64 et 48 : même scène dessinée dans une grille de 128, filets ramenés à 1 pixel
réel quelle que soit la taille. 32 : scène droite. 24 et 16 : dessin simplifié propre
à la taille, coordonnées au pixel.
"""

import math

APPS = ("word", "excel", "powerpoint", "outlook", "onenote", "teams", "powerbi")

# Palette elementary (100, 300, 500, 700, 900)
BLUEBERRY = ("#8cd5ff", "#64baff", "#3689e6", "#0d52bf", "#002e99")
LIME = ("#d1ff82", "#9bdb4d", "#68b723", "#3a9104", "#206b00")
BUBBLEGUM = ("#fe9ab8", "#f4679d", "#de3e80", "#bc245d", "#910e38")
ORANGE = ("#ffc27d", "#ffa154", "#f37329", "#cc3b02", "#a62100")
GRAPE = ("#e4c6fa", "#cd9ef7", "#a56de2", "#7239b3", "#452981")
BANANA = ("#fff394", "#ffe16b", "#f9c440", "#d48e15", "#ad5f00")
OUTLOOK = ("#7fd8ff", "#28a8ea", "#0078d4", "#0358a7", "#032d60")
TEAMS = ("#c5cbfa", "#7b83eb", "#5b5fc7", "#444791", "#2b2c5e")   # violets Microsoft Teams
# Couleurs des icônes Microsoft 365 actuelles (2026-10-07), en cinq tons comme la palette elementary
WORD = ("#a9d6fb", "#41a5ee", "#2b7cd3", "#185abd", "#103f91")
EXCEL = ("#9ee6c2", "#33c481", "#21a366", "#107c41", "#185c37")
POWERPOINT = ("#ffc4b0", "#ff8f6b", "#ed6c47", "#c43e1c", "#8f2b12")
ONENOTE = ("#e7b9f5", "#ca64ea", "#ae4bd5", "#9332bf", "#7719aa")
POWERBI = ("#fff0a0", "#f2c811", "#e8b100", "#c08a00", "#8a5d00")
PAL = {"word": WORD, "excel": EXCEL, "powerpoint": POWERPOINT, "outlook": OUTLOOK,
       "onenote": ONENOTE, "teams": TEAMS, "powerbi": POWERBI}
INK = "#767e86"     # lignes de texte sur le papier
RULE = "#b8bfc5"    # filets de grille
# Reflet intérieur d'après les icônes système elementary, haut adouci (.45 au lieu de 1)
HL = ('<linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">'
      '<stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".063" stop-color="#fff" stop-opacity=".2"/>'
      '<stop offset=".95" stop-color="#fff" stop-opacity=".157"/><stop offset="1" stop-color="#fff" stop-opacity=".392"/>'
      '</linearGradient>')
SLATE = "#485a6c"
TILT = 0
# Intensité du rendu elementary : opacité du contour, épaisseur (px), ombre au sol, contour du papier
EDGE, THICK, SOL, PAPER = .2, 1, 0, (.1, .16)   # contours doux, sans ombre (2026-10-07)
SHADOW = False      # ombre portée sous les plaques


def _grad(gid, top, bot, otop=1, obot=1):
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{top}" stop-opacity="{otop}"/>'
            f'<stop offset="1" stop-color="{bot}" stop-opacity="{obot}"/></linearGradient>')


_SNAP = 0  # taille d'un pixel réel dans la grille 128 (0 = pas d'alignement)


def _diag(gid, top, bot):
    """Dégradé en biais, du coin haut gauche au coin bas droit (façon Fluent, piste W2)."""
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bot}"/></linearGradient>')


def _snap(v):
    return round(v / _SNAP) * _SNAP if _SNAP else v


def _rr(x, y, w, h, r, **a):
    """Rectangle arrondi ; les aplats (sans contour) sont calés sur la grille de pixels."""
    if _SNAP and "stroke" not in a:
        x2, y2 = _snap(x + w), _snap(y + h)
        x, y = _snap(x), _snap(y)
        w, h = max(x2 - x, _SNAP), max(y2 - y, _SNAP)
        if min(w, h) <= 2 * _SNAP:
            r = 0
    attrs = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in a.items())
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r:g}" {attrs}/>'


class Scene:
    """Scène en grille 128 ; `px` = taille d'un pixel réel dans cette grille."""

    def __init__(self, app, size):
        self.app, self.p, self.px = app, PAL[app], 128 / size
        self.size = size

    def defs(self):
        p, px = self.p, self.px
        return (f'<filter id="sh" x="-20%" y="-20%" width="140%" height="150%">'
                f'<feGaussianBlur in="SourceAlpha" stdDeviation="{max(1, .8 * px):g}"/><feOffset dy="{max(1, px):g}"/>'
                f'<feComponentTransfer><feFuncA type="linear" slope=".3"/></feComponentTransfer>'
                f'<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
                f'<radialGradient id="sol"><stop offset="0" stop-opacity="{SOL}"/><stop offset="1" stop-opacity="0"/></radialGradient>'
                + HL + _diag("bk", p[1], p[3]) + _grad("bks", p[3], p[4]) + _grad("pp", "#ffffff", "#e8e8e8")
                + _grad("pps", "#000", "#000", *PAPER) + _grad("ac", p[1], p[3]))

    def lit(self, x, y, w, h, r, fill, stroke, side):
        """Plaque elementary : épaisseur de 2 px, dégradé, contour opaque et reflet d'un pixel réel."""
        q, t = self.px, THICK * self.px
        x2, y2 = _snap(x + w), _snap(y + h)
        x, y = _snap(x), _snap(y)
        w, h = x2 - x, y2 - y
        return (_rr(x, y + t, w, h, r, fill=side)
                + _rr(x, y, w, h, r, fill=f"url(#{fill})")
                + _rr(x + q / 2, y + q / 2, w - q, h - q, max(r - q / 2, 0), fill="none",
                      stroke=f"url(#{stroke})", stroke_width=f"{q:g}", opacity=f"{EDGE if stroke == 'bks' else 1:g}")
                + _rr(x + q * 1.5, y + q * 1.5, w - 3 * q, h - 3 * q, max(r - q * 1.5, 0), fill="none",
                      stroke="url(#hl)", stroke_width=f"{q:g}", opacity=".9"))

    def card(self, x, y, w, h, r=6):
        return self.lit(x, y, w, h, r, "pp", "pps", "#c3c7cb")

    def back(self):
        return self.lit(40, 12, 76, 88, 10, "bk", "bks", self.p[3])

    def relief(self, frag):
        """Pictogramme en relief : copie sombre décalée d'un pixel réel."""
        return f'<g transform="translate(0,{self.px:g})" opacity=".16">{frag.replace("#fff", "#000")}</g>{frag}'

    def draw(self, tilt):
        p, W = self.p, "#fff"
        b, f = self.back(), ""
        a = self.app
        if a == "word":
            for i in range(5):
                b += self.relief(_rr(86, 24 + i * 10, 22, 4, 2, fill=W, opacity=".75"))
            f += self.card(12, 30, 70, 86)
            f += '<path d="M66,30 h10 a6,6 0 0 1 6,6 v10 z" fill="#d4d7da"/>'
            f += _rr(22, 42, 34, 6, 3, fill=p[2])
            for i, w in enumerate((50, 50, 44, 50, 30)):
                f += _rr(22, 56 + i * 9, w, 4, 2, fill=INK)
            f += _rr(52, 89, 2, 10, 1, fill=p[2])
        elif a == "excel":
            for i in range(3):
                b += self.relief(_rr(88, 24 + i * 12, 20, 7, 2, fill=W, opacity=".8" if i == 0 else ".5"))
            f += self.card(12, 32, 72, 82)
            f += '<path d="M12.5,38.5 a6,6 0 0 1 6,-6 h59 a6,6 0 0 1 6,6 v8 h-71 z" fill="url(#ac)"/>'
            for cx in (34, 56):
                f += f'<line x1="{cx}" y1="46" x2="{cx}" y2="113" stroke="{RULE}" stroke-width="{max(1, self.px * .8):g}"/>'
            for cy in (63, 80, 97):
                f += f'<line x1="13" y1="{cy}" x2="83" y2="{cy}" stroke="{RULE}" stroke-width="{max(1, self.px * .8):g}"/>'
            f += _rr(34.5, 63.5, 22, 17, 1.5, fill="none", stroke=p[3], stroke_width=2.4)
            f += _rr(54, 78, 5, 5, 1, fill=p[3])
            for i, cx in enumerate((18, 40, 62)):
                f += _rr(cx, 52, 10 + (i % 2) * 4, 4, 2, fill=INK)
        elif a == "powerpoint":
            for i in range(3):
                b += self.relief(_rr(88, 22 + i * 15, 20, 11, 2, fill=W, opacity=".85" if i == 1 else ".5"))
            f += self.card(8, 46, 84, 60)
            cx, cy, r = 32, 77, 16
            f += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{p[1]}"/>'
            f += f'<path d="M{cx + 2},{cy - 2} L{cx + 2},{cy - r - 2} A{r},{r} 0 0 1 {cx + r + 2},{cy - 2} Z" fill="{p[3]}"/>'
            f += _rr(56, 64, 26, 5, 2.5, fill=INK) + _rr(56, 74, 26, 5, 2.5, fill=INK) + _rr(56, 84, 16, 5, 2.5, fill=INK)
        elif a == "outlook":
            for row in range(4):
                for col in range(3):
                    op = ".95" if (row, col) == (1, 1) else ".45"
                    b += _rr(78 + col * 11, 24 + row * 11, 8, 8, 1.5, fill=W, opacity=op)
            f += self.card(8, 50, 82, 58)
            f += f'<path d="M10,106 L38,78 M88,106 L60,78" stroke="{RULE}" stroke-width="{max(2, self.px):g}"/>'
            f += f'<path d="M9,52 L49,82 L89,52" fill="none" stroke="{p[2]}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>'
        elif a == "onenote":
            for i, op in enumerate((".95", ".6", ".45")):
                b += _rr(108, 22 + i * 13, 8, 10, 2, fill=W, opacity=op)
            b += self.relief(_rr(80, 24, 20, 5, 2.5, fill=W, opacity=".8"))
            f += self.card(16, 30, 66, 86)
            for i in range(6):
                f += f'<line x1="22" y1="{50 + i * 10}" x2="76" y2="{50 + i * 10}" stroke="#c9d4e6" stroke-width="{max(1.2, self.px * .8):g}"/>'
            f += f'<line x1="30" y1="34" x2="30" y2="112" stroke="#f2a8a8" stroke-width="{max(1.2, self.px * .8):g}"/>'
            for i in range(6):
                f += f'<circle cx="16" cy="{40 + i * 13}" r="3.6" fill="#fff" stroke="#8a8f96" stroke-width="1.6"/>'
            f += f'<path d="M36,74 c6,-12 10,8 16,-2 s8,-10 14,2" fill="none" stroke="{p[2]}" stroke-width="4" stroke-linecap="round"/>'
            f += f'<path d="M36,92 c8,-6 16,4 26,-2" fill="none" stroke="{p[3]}" stroke-width="3" stroke-linecap="round" opacity=".7"/>'
        elif a == "teams":
            for cx, s, op in ((98, 1, ".55"), (80, 1.15, ".9")):
                b += self.relief(f'<g opacity="{op}"><circle cx="{cx}" cy="36" r="{8 * s:g}" fill="#fff"/>'
                                 f'<path d="M{cx - 14 * s:g},60 a{14 * s:g},{12 * s:g} 0 0 1 {28 * s:g},0 v4 h-{28 * s:g} z" fill="#fff"/></g>')
            q = self.px
            f += ('<path d="M18,52 h60 a8,8 0 0 1 8,8 v30 a8,8 0 0 1 -8,8 h-30 l-14,12 v-12 h-16 a8,8 0 0 1 -8,-8 v-30 a8,8 0 0 1 8,-8 z" fill="url(#pp)"/>'
                  f'<path d="M18,52.5 h60 a7.5,7.5 0 0 1 7.5,7.5 v30 a7.5,7.5 0 0 1 -7.5,7.5 h-30.2 l-13.3,11.4 v-11.4 h-16.5 a7.5,7.5 0 0 1 -7.5,-7.5 v-30 a7.5,7.5 0 0 1 7.5,-7.5 z" fill="none" stroke="url(#pps)" stroke-width="{q:g}"/>')
            for i in range(3):
                f += f'<circle cx="{34 + i * 14}" cy="75" r="5" fill="{p[2]}" opacity="{1 - i * .25:g}"/>'
        elif a == "powerbi":
            b += (_rr(80, 22, 28, 14, 2.5, fill=W, opacity=".55") + _rr(80, 40, 13, 14, 2.5, fill=W, opacity=".85")
                  + _rr(95, 40, 13, 14, 2.5, fill=W, opacity=".45"))
            f += self.card(10, 38, 76, 76)
            for i, h in enumerate((16, 28, 22, 40)):
                f += _rr(20 + i * 15, 104 - h, 10, h, 2, fill=p[2] if i < 3 else p[3])
            f += f'<polyline points="25,78 40,66 55,72 70,52" fill="none" stroke="{SLATE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'
            for x, y in ((25, 78), (40, 66), (55, 72), (70, 52)):
                f += f'<circle cx="{x}" cy="{y}" r="3.4" fill="#fff" stroke="{SLATE}" stroke-width="2"/>'
        if tilt:
            f = f'<g transform="rotate({tilt} 48 80)">{f}</g>'
        return wrap(b + f)


# ------------------------------------------------------------ petites tailles (24, 16)

def _small(app, s):
    """Tuile de couleur en haut à droite, carte blanche en bas à gauche, un signe par appli."""
    p = PAL[app]
    if s == 24:
        bx, by, bw, bh, br = 9, 2, 13, 17, 2
        fx, fy, fw, fh, fr = 2, 7, 13, 15, 1.5
    else:
        bx, by, bw, bh, br = 6, 1, 9, 12, 1.5
        fx, fy, fw, fh, fr = 1, 4, 10, 11, 1
    if app in ("powerpoint", "outlook", "teams"):   # cartes paysage
        if s == 24:
            fx, fy, fw, fh = 1, 10, 16, 12
        else:
            fx, fy, fw, fh = 1, 6, 12, 9
    defs = _diag("bk", p[1], p[3]) + _grad("pp", "#ffffff", "#e8e8e8")
    o = []
    # ombres d'un pixel
    o.append(_rr(bx, by, bw, bh, br, fill="url(#bk)"))
    o.append(_rr(bx + .5, by + .5, bw - 1, bh - 1, max(br - .5, 0), fill="none", stroke=p[3], stroke_opacity=".45"))
    o.append(f'<path d="M{bx + 1.5},{by + 1.5} h{bw - 3}" stroke="#fff" stroke-opacity=".35"/>')
    # marques blanches sur la tuile, côté droit (visibles hors de la carte)
    mx = fx + fw + 1 if fx + fw + 1 < bx + bw - 2 else bx + bw - 4
    mw = bx + bw - 2 - mx
    if mw >= 2:
        for i in range(3 if s == 24 else 2):
            o.append(_rr(mx, by + 3 + i * 3, mw, 1.5 if s == 24 else 1, 0, fill="#fff", opacity=".75"))
    big = s == 24
    if app == "teams":
        fh -= 3 if big else 2
        tail = (f'<path d="M{fx + 3},{fy + fh - 1} v{4 if big else 3} l{3 if big else 2.5},-{4 if big else 3} z"/>')
        o.append(f'<g fill="url(#pp)">{_rr(fx, fy, fw, fh, fr)}{tail}</g>')
        o.append(_rr(fx + .5, fy + .5, fw - 1, fh - 1, max(fr - .5, 0), fill="none", stroke="#000", stroke_opacity=".18"))
        step = 4 if big else 3
        for i in range(3):
            o.append(_rr(fx + (3 if big else 2.5) + i * step, fy + fh / 2 - 1, 2, 2, 1, fill=p[2]))
        return defs, o
    o.append(_rr(fx, fy, fw, fh, fr, fill="url(#pp)"))
    o.append(_rr(fx + .5, fy + .5, fw - 1, fh - 1, max(fr - .5, 0), fill="none", stroke="#000", stroke_opacity=".18"))
    big = s == 24
    if app == "word":
        o.append(_rr(fx + 2, fy + 2, 6 if big else 4, 2 if big else 1, 0, fill=p[2]))
        for i in range(4 if big else 3):
            w = (fw - 4) if i < (3 if big else 2) else (fw - 4) * .6
            o.append(_rr(fx + 2, fy + (6 if big else 5) + i * (2 if big else 2), round(w), 1, 0, fill=INK))
    elif app == "excel":
        o.append(_rr(fx + .5, fy + .5, fw - 1, 3 if big else 2, 0, fill=p[2]))
        for cx in ((5, 9) if big else (4, 7)):
            o.append(_rr(fx + cx, fy + 3, 1 if big else .8, fh - 4, 0, fill=RULE))
        for cy in ((7, 10) if big else (6, 8)):
            o.append(_rr(fx + 1, fy + cy, fw - 2, 1 if big else .8, 0, fill=RULE))
        o.append(_rr(fx + (5 if big else 4), fy + (7 if big else 6), 5 if big else 3.8, 4 if big else 2.8, 0, fill="none", stroke=p[3], stroke_width=1.2 if big else 1))
    elif app == "powerpoint":
        r = 3 if big else 2.2
        cx, cy = fx + (5 if big else 3.6), fy + fh / 2
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{p[1]}"/>')
        o.append(f'<path d="M{cx},{cy} v-{r} a{r},{r} 0 0 1 {r},{r} z" fill="{p[3]}"/>')
        for i in range(2):
            o.append(_rr(fx + (10 if big else 7), fy + (4 if big else 3) + i * 3, 4 if big else 3, 1, 0, fill=INK))
    elif app == "outlook":
        o.append(f'<path d="M{fx + 1},{fy + 1} L{fx + fw / 2},{fy + fh / 2 + .5} L{fx + fw - 1},{fy + 1}" fill="none" stroke="{p[2]}" stroke-width="{1.6 if big else 1.3}" stroke-linejoin="round" stroke-linecap="round"/>')
    elif app == "onenote":
        for i in range(3 if big else 2):
            o.append(_rr(fx + 2, fy + (4 if big else 4) + i * (3 if big else 3), fw - 3, .8, 0, fill="#c9d4e6"))
        o.append(f'<path d="M{fx + 3},{fy + (10 if big else 7)} q1.5,-3 3,0 t3,0" fill="none" stroke="{p[2]}" stroke-width="{1.4 if big else 1.1}" stroke-linecap="round"/>')
    elif app == "powerbi":
        hs = (3, 5, 4, 7) if big else (2, 4, 3, 5)
        bwid = 2 if big else 1.6
        gap = 3 if big else 2.2
        for i, h in enumerate(hs[:4] if big else hs[:3]):
            o.append(_rr(fx + 2 + i * gap, fy + fh - 2 - h, bwid, h, 0, fill=p[2] if i < 3 else p[3]))
    return defs, o


def wrap(body):
    """Ombre au sol et ombre portée, si elles sont demandées (SOL, SHADOW)."""
    sol = '<ellipse cx="62" cy="117" rx="56" ry="7" fill="url(#sol)"/>' if SOL else ""
    return sol + (f'<g filter="url(#sh)">{body}</g>' if SHADOW else body)


def _snap_lines(svg):
    """Filets horizontaux et verticaux au centre d'un pixel réel, traits en pixels entiers."""
    import re
    if not _SNAP:
        return svg

    def width(m):
        return f'stroke-width="{max(1, round(float(m.group(1)) / _SNAP)) * _SNAP:g}"'
    svg = re.sub(r'stroke-width="([\d.]+)"', width, svg)

    def circle(m):
        cx, cy, r = (float(v) / _SNAP for v in m.groups())
        r = max(1, round(r * 2) / 2)
        return f'<circle cx="{(math.floor(cx) + .5) * _SNAP:g}" cy="{(math.floor(cy) + .5) * _SNAP:g}" r="{r * _SNAP:g}"'
    svg = re.sub(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"', circle, svg)

    def centre(v):
        return (math.floor(float(v) / _SNAP) + .5) * _SNAP

    def fix(m):
        x1, y1, x2, y2 = (float(v) for v in m.groups())
        if x1 == x2:
            x1 = x2 = centre(x1)
        if y1 == y2:
            y1 = y2 = centre(y1)
        return f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}"'
    return re.sub(r'<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"', fix, svg)


def icon(app, size, tilt=None):
    if size <= 24:
        defs, parts = _small(app, size)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
                f'<defs>{defs}</defs>{"".join(parts)}</svg>\n')
    global _SNAP
    sc = Scene(app, size)
    _SNAP = sc.px
    try:
        body = _snap_lines(sc.draw(TILT if tilt is None and size >= 96 else (tilt or 0)))
    finally:
        _SNAP = 0
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 128 128">'
            f'<defs>{sc.defs()}</defs>{body}</svg>\n')
