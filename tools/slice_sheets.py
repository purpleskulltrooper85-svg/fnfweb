"""
Converts the ripped sprite sheets in ../assets into Sparrow (FNF-style) atlases.

Ripped sheets have no XML, so frames are found automatically: each frame sits in
its own transparent box on a solid background colour. This script finds those
boxes, trims them, repacks the frames we need into small atlases and writes:

  assets/images/characters/BOYFRIEND.png/.xml
  assets/images/NOTE_assets.png/.xml
  assets/images/noteSplashes.png/.xml
  assets/images/mainmenu/menu_items.png/.xml
  assets/images/icons/icon-bf.png
  assets/images/stage.jpg, assets/images/logo.webp
  data/characters/bf.json   (animation list + auto-computed offsets)

Usage:  pip install pillow numpy scipy   then   python tools/slice_sheets.py
"""
import json
import os
import shutil

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "assets", "images")


def find_boxes(arr, bg, min_size=30):
    mask = ~np.all(arr == np.array(bg, dtype=arr.dtype), axis=2)
    lab, _ = ndimage.label(mask)
    boxes = []
    for s in ndimage.find_objects(lab):
        y0, y1, x0, x1 = s[0].start, s[0].stop, s[1].start, s[1].stop
        if x1 - x0 >= min_size and y1 - y0 >= min_size:
            boxes.append((x0, y0, x1, y1))
    return boxes


def trim(img, alpha_min=8):
    a = np.array(img)[:, :, 3]
    ys, xs = np.where(a > alpha_min)
    if len(xs) == 0:
        return img.crop((0, 0, 1, 1)), (0, 0)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return img.crop((x0, y0, x1, y1)), (int(x0), int(y0))


class Packer:
    """Collects frames (name, trimmed image, frameX/Y/W/H) and writes a Sparrow atlas."""

    def __init__(self):
        self.frames = []

    def add_anim(self, prefix, crops, center=True):
        """crops: list of RGBA images (one per frame, untrimmed boxes)."""
        cw = max(c.width for c in crops)
        ch = max(c.height for c in crops)
        for i, c in enumerate(crops):
            # boxes of different sizes are centred (or bottom-aligned) in a shared canvas
            bx = (cw - c.width) // 2 if center else 0
            by = (ch - c.height) // 2 if center else ch - c.height
            t, (tx, ty) = trim(c)
            self.frames.append({
                "name": "%s%04d" % (prefix, i), "img": t,
                "frameX": -(bx + tx), "frameY": -(by + ty),
                "frameWidth": cw, "frameHeight": ch,
            })

    def save(self, path, max_width=4096, pad=2):
        order = sorted(range(len(self.frames)), key=lambda i: -self.frames[i]["img"].height)
        x = y = row_h = 0
        width = 0
        for i in order:
            f = self.frames[i]
            w, h = f["img"].size
            if x + w + pad > max_width:
                x, y, row_h = 0, y + row_h + pad, 0
            f["x"], f["y"] = x, y
            x += w + pad
            row_h = max(row_h, h)
            width = max(width, x)
        height = y + row_h
        sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        for f in self.frames:
            sheet.paste(f["img"], (f["x"], f["y"]))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        sheet.save(path + ".png", optimize=True)
        lines = ['<?xml version="1.0" encoding="utf-8"?>',
                 '<TextureAtlas imagePath="%s.png">' % os.path.basename(path)]
        for f in self.frames:
            w, h = f["img"].size
            lines.append('\t<SubTexture name="%s" x="%d" y="%d" width="%d" height="%d" '
                         'frameX="%d" frameY="%d" frameWidth="%d" frameHeight="%d"/>' % (
                             f["name"], f["x"], f["y"], w, h, f["frameX"], f["frameY"],
                             f["frameWidth"], f["frameHeight"]))
        lines.append("</TextureAtlas>")
        with open(path + ".xml", "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        print("wrote %s.png (%dx%d, %d frames)" % (path, width, height, len(self.frames)))


def rows_of(boxes, tol=6):
    rows = []
    for b in sorted(boxes, key=lambda b: (b[1], b[0])):
        for r in rows:
            if abs(r[0][1] - b[1]) <= tol:
                r.append(b)
                break
        else:
            rows.append([b])
    return [sorted(r) for r in rows]


# ---------------------------------------------------------------- Boyfriend
def feet_anchor(img):
    """Bottom-centre of the character's feet inside a frame canvas."""
    a = np.array(img)[:, :, 3] > 40
    ys, xs = np.where(a)
    bottom = ys.max()
    feet = xs[ys > bottom - 40]
    return float(feet.mean()), float(bottom)


def build_bf():
    sheet = Image.open(os.path.join(SRC, "Boyfriend Spritesheet.png")).convert("RGBA")
    arr = np.array(sheet)
    bg = tuple(arr[0, 0])
    boxes = [b for b in find_boxes(arr, bg, 100)]
    rows = rows_of(boxes)

    # row order on the ripped sheet (top to bottom); None = skipped
    names = ["idle", None, "hey", None,
             "singUP", None, "singUPmiss",
             "singDOWN", None, "singDOWNmiss",
             "singLEFT", None, "singLEFTmiss",
             "singRIGHT", None, "singRIGHTmiss"]
    prefixes = {
        "idle": "BF idle dance", "hey": "BF HEY!!",
        "singUP": "BF NOTE UP", "singUPmiss": "BF NOTE UP MISS",
        "singDOWN": "BF NOTE DOWN", "singDOWNmiss": "BF NOTE DOWN MISS",
        "singLEFT": "BF NOTE LEFT", "singLEFTmiss": "BF NOTE LEFT MISS",
        "singRIGHT": "BF NOTE RIGHT", "singRIGHTmiss": "BF NOTE RIGHT MISS",
    }
    packer = Packer()
    anchors = {}
    for row, name in zip(rows, names):
        if not name:
            continue
        # keep only boxes with the row's dominant size (drops icons/labels)
        sizes = [(b[2] - b[0], b[3] - b[1]) for b in row]
        main = max(set(sizes), key=sizes.count)
        crops = [sheet.crop(b) for b, s in zip(row, sizes) if s == main]
        packer.add_anim(prefixes[name], crops, center=False)
        anchors[name] = feet_anchor(crops[0])
    packer.save(os.path.join(OUT, "characters", "BOYFRIEND"))

    # health icons: 300x150 box next to the idle row
    icon_box = [b for b in rows[0] if (b[2] - b[0], b[3] - b[1]) == (300, 150)]
    if icon_box:
        os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)
        sheet.crop(icon_box[0]).save(os.path.join(OUT, "icons", "icon-bf.png"))

    ix, iy = anchors["idle"]
    fps = {"idle": 24}
    indices = {"idle": [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]}
    char = {
        "image": "characters/BOYFRIEND",
        "scale": 1,
        "flip_x": False,
        "sing_duration": 4,
        "healthicon": "icon-bf",
        "healthbar_colors": [49, 176, 209],
        "anchor": [round(ix), round(iy)],
        "animations": [],
    }
    for name, prefix in prefixes.items():
        ax, ay = anchors[name]
        char["animations"].append({
            "anim": name, "name": prefix, "fps": fps.get(name, 24), "loop": False,
            "indices": indices.get(name, []),
            "offsets": [round(ax - ix), round(ay - iy)],
        })
    os.makedirs(os.path.join(ROOT, "data", "characters"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "characters", "bf.json"), "w") as fh:
        json.dump(char, fh, indent=2)
    print("wrote data/characters/bf.json")


# ---------------------------------------------------------------- Arrows
def build_arrows():
    sheet = Image.open(os.path.join(SRC, "Regular Arrows Sprites.png")).convert("RGBA")
    arr = np.array(sheet)
    bg = tuple(arr[0, 0])
    boxes = find_boxes(arr, bg, 30)
    half_x = sheet.width // 2
    half_y = sheet.height // 2
    quads = {  # (direction, colour): quadrant
        ("left", "purple"): (0, 0), ("down", "blue"): (1, 0),
        ("up", "green"): (0, 1), ("right", "red"): (1, 1),
    }
    notes = Packer()
    splashes = Packer()
    for (d, col), (qx, qy) in quads.items():
        q = [b for b in boxes if (b[0] >= half_x) == bool(qx) and (b[1] >= half_y) == bool(qy)]
        rows = rows_of(q, tol=10)
        r0, r1, r2, r3 = rows[0], rows[1], rows[2], rows[3]
        crop = lambda b: sheet.crop(b)
        notes.add_anim("%s press" % d, [crop(b) for b in r0[0:2]])
        notes.add_anim("arrow%s" % d.upper(), [crop(r0[2])])
        notes.add_anim("%s0" % col, [crop(r0[3])])
        notes.add_anim("%s hold piece" % col, [crop(r0[4])])
        notes.add_anim("%s hold end" % col, [crop(r0[5])])
        notes.add_anim("%s confirm" % d, [crop(b) for b in r1])
        splashes.add_anim("note impact 1 %s" % col, [crop(b) for b in r2])
        splashes.add_anim("note impact 2 %s" % col, [crop(b) for b in r3])
    notes.save(os.path.join(OUT, "NOTE_assets"), max_width=2048)
    splashes.save(os.path.join(OUT, "noteSplashes"), max_width=2048)


# ---------------------------------------------------------------- Main menu
MENU_REGIONS = {
    # name: (basic frame regions, white/selected frame regions) as (x0, y0, x1, y1)
    "story mode": (
        [(25, 425, 658, 560), (658, 425, 1284, 560), (1284, 425, 1910, 560)],
        [(25, 565, 827, 760), (827, 565, 1629, 760), (1629, 565, 2433, 762)]),
    "freeplay": (
        [(24, 752, 516, 890), (516, 752, 1007, 890), (1007, 752, 1500, 890)],
        [(25, 890, 662, 1072), (662, 890, 1304, 1072), (1304, 890, 1945, 1075)]),
    "donate": (
        [(20, 1072, 472, 1198), (472, 1072, 926, 1198), (926, 1072, 1380, 1198)],
        [(20, 1198, 624, 1370), (624, 1198, 1224, 1370), (1224, 1198, 1820, 1370)]),
    "options": (
        [(24, 1372, 522, 1495), (522, 1372, 1018, 1495), (1018, 1372, 1515, 1495)],
        [(24, 1498, 639, 1672), (639, 1498, 1254, 1672), (1254, 1498, 1875, 1672)]),
    "credits": (
        [(2150, 1296, 2700, 1417), (2150, 1417, 2700, 1541), (2150, 1541, 2700, 1668)],
        [(2150, 775, 2700, 950), (2150, 950, 2700, 1122), (2150, 1122, 2700, 1294)]),
    "merch": (
        [(2690, 1760, 3195, 1884), (2690, 1884, 3195, 2008), (2690, 2008, 3195, 2135)],
        [(2690, 1226, 3195, 1407), (2690, 1407, 3195, 1586), (2690, 1586, 3195, 1762)]),
}


def build_menu():
    sheet = Image.open(os.path.join(SRC, "menu elements icons.png")).convert("RGBA")
    packer = Packer()
    for name, (basic, white) in MENU_REGIONS.items():
        packer.add_anim("%s basic" % name, [trim(sheet.crop(r))[0] for r in basic])
        packer.add_anim("%s white" % name, [trim(sheet.crop(r))[0] for r in white])
    packer.save(os.path.join(OUT, "mainmenu", "menu_items"), max_width=2048)


def copy_plain():
    os.makedirs(OUT, exist_ok=True)
    menu_bg = os.path.join(SRC, "Stage-menu.jpg")
    if not os.path.exists(menu_bg):
        menu_bg = os.path.join(SRC, "Stage.jpg")
    shutil.copy(menu_bg, os.path.join(OUT, "stage-menu.jpg"))
    shutil.copy(os.path.join(SRC, "Friday_Night_Funkin'_logo.svg.webp"), os.path.join(OUT, "logo.webp"))


# ---------------------------------------------------------------- Stage (game)
def build_stage():
    """Stage-game.png holds the separate layers on a green background."""
    sheet = Image.open(os.path.join(SRC, "Stage-game.png")).convert("RGBA")
    arr = np.array(sheet)
    boxes = sorted(find_boxes(arr, tuple(arr[0, 0]), 100), key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    big = sorted(boxes[:3], key=lambda b: (b[1], b[0]))  # curtains, back wall, front floor
    light = boxes[3] if len(boxes) > 3 else None
    out = os.path.join(OUT, "stages", "stage")
    os.makedirs(out, exist_ok=True)
    for name, b in zip(["stagecurtains", "stageback", "stagefront"], big):
        sheet.crop(b).save(os.path.join(out, name + ".png"), optimize=True)
    if light:
        trim(sheet.crop(light))[0].save(os.path.join(out, "stage_light.png"))
    print("wrote stage layers")


# ---------------------------------------------------------------- Daddy Dearest
def aligned_anim(packer, prefix, frames, ref):
    """frames: list of (trimmed img, (anchor x, anchor y)); every frame's anchor lands on ref in a shared canvas."""
    rx, ry, cw, ch = ref
    for i, (img, (ax, ay)) in enumerate(frames):
        packer.frames.append({
            "name": "%s%04d" % (prefix, i), "img": img,
            "frameX": -int(round(rx - ax)), "frameY": -int(round(ry - ay)),
            "frameWidth": cw, "frameHeight": ch,
        })


def make_icon(img, path, frac=0.36):
    """Health icon (two 150x150 frames) from the head area of a character frame."""
    a = np.array(img)
    h = int(a.shape[0] * frac)
    head = a[:h]
    ys, xs = np.where(head[:, :, 3] > 40)
    cx = int(xs.mean())
    size = max(h, xs.max() - xs.min())
    x0 = max(0, cx - size // 2)
    crop = img.crop((x0, 0, x0 + size, size))
    crop.thumbnail((144, 144), Image.LANCZOS)
    icon = Image.new("RGBA", (300, 150), (0, 0, 0, 0))
    for fx in (0, 150):
        icon.paste(crop, (fx + (150 - crop.width) // 2, 150 - crop.height - 3), crop)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    icon.save(path)


def build_dad():
    sheet = Image.open(os.path.join(SRC, "Daddy-Dearest.png")).convert("RGBA")
    arr = np.array(sheet)
    lab, _ = ndimage.label(arr[:, :, 3] > 20)
    comps = []
    for idx, sl in enumerate(ndimage.find_objects(lab), 1):
        x0, y0, x1, y1 = sl[1].start, sl[0].start, sl[1].stop, sl[0].stop
        w, h = x1 - x0, y1 - y0
        if 500 < h < 1200 and 250 < w < 800:  # character frames (skips labels, arrows and the divider grid)
            comps.append((idx, (x0, y0, x1, y1)))
    rows = {}
    for idx, b in comps:
        rows.setdefault(b[1] > arr.shape[0] // 2, []).append((idx, b))
    order = sorted(rows[False], key=lambda c: c[1][0]) + sorted(rows[True], key=lambda c: c[1][0])
    assert len(order) == 15, "expected 15 Daddy frames, found %d" % len(order)
    frames = []
    for idx, (x0, y0, x1, y1) in order:
        sub = arr[y0:y1, x0:x1].copy()
        own = lab[y0:y1, x0:x1]
        sub[(own != idx) & (own != 0)] = 0
        img, _ = trim(Image.fromarray(sub))
        frames.append((img, feet_anchor(img)))
    groups = [("idle", "Dad idle dance", frames[0:6]), ("singLEFT", "Dad Sing Note LEFT", frames[6:7]),
              ("singDOWN", "Dad Sing Note DOWN", frames[7:9]), ("singUP", "Dad Sing Note UP", frames[9:12]),
              ("singRIGHT", "Dad Sing Note RIGHT", frames[12:15])]
    rx = max(ax for _, (ax, _) in frames)
    ry = max(ay for _, (_, ay) in frames)
    cw = int(max(rx - ax + im.width for im, (ax, _) in frames)) + 1
    ch = int(max(ry - ay + im.height for im, (_, ay) in frames)) + 1
    packer = Packer()
    for _, prefix, fr in groups:
        aligned_anim(packer, prefix, fr, (rx, ry, cw, ch))
    packer.save(os.path.join(OUT, "characters", "DADDY_DEAREST"))
    make_icon(frames[0][0], os.path.join(OUT, "icons", "icon-dad.png"))
    char = {
        "image": "characters/DADDY_DEAREST", "scale": 1, "flip_x": False, "sing_duration": 6.1,
        "healthicon": "icon-dad", "healthbar_colors": [175, 102, 206],
        "anchor": [round(rx), round(ry)],
        "animations": [{"anim": a, "name": p, "fps": 24, "loop": False, "indices": [], "offsets": [0, 0]}
                       for a, p, _ in groups],
    }
    with open(os.path.join(ROOT, "data", "characters", "dad.json"), "w") as fh:
        json.dump(char, fh, indent=2)
    print("wrote data/characters/dad.json")


# ---------------------------------------------------------------- Ratings / countdown / combo numbers
def build_game_text():
    sheet = Image.open(os.path.join(SRC, "Common Game Text.png")).convert("RGBA")
    arr = np.array(sheet)
    boxes = find_boxes(arr, tuple(arr[0, 0]), 60)
    rows = rows_of(boxes, tol=10)
    names = [["ready", "set", "go"], ["combo", "bad", "shit", "good", "sick"],
             ["num%d" % i for i in range(10)]]
    packer = Packer()
    for row, row_names in zip(rows, names):
        for b, name in zip(row, row_names):
            packer.add_anim(name, [trim(sheet.crop(b))[0]])
    packer.save(os.path.join(OUT, "ui", "gameText"), max_width=2048)


# ---------------------------------------------------------------- Alphabet (menu font)
def synth_bold(img, stroke=4):
    """White glyph with a black outline, made from a black glyph."""
    a = np.array(img)[:, :, 3] > 100
    a = np.pad(a, stroke + 1)
    outline = ndimage.binary_dilation(a, iterations=stroke)
    out = np.zeros(a.shape + (4,), np.uint8)
    out[outline] = (0, 0, 0, 255)
    out[ndimage.binary_erosion(a, iterations=1)] = (255, 255, 255, 255)
    return Image.fromarray(out)


def build_alphabet():
    sheet = Image.open(os.path.join(SRC, "Font.png")).convert("RGBA")
    arr = np.array(sheet)
    lab, _ = ndimage.label(arr[:, :, 3] > 20)
    comps = []
    for sl in ndimage.find_objects(lab):
        x0, y0, x1, y1 = sl[1].start, sl[0].start, sl[1].stop, sl[0].stop
        if max(x1 - x0, y1 - y0) >= 8 and y1 < 720:
            comps.append((x0, y0, x1, y1))

    def band(cy, xr, tol=38):
        sel = [b for b in comps if abs((b[1] + b[3]) / 2 - cy) <= tol and xr[0] <= b[0] < xr[1]]
        sel.sort()
        merged = []
        for b in sel:  # pieces that overlap horizontally belong to one glyph (%, :, ?, i, j...)
            if merged and b[0] < merged[-1][2] - 2:
                m = merged[-1]
                merged[-1] = (min(m[0], b[0]), min(m[1], b[1]), max(m[2], b[2]), max(m[3], b[3]))
            else:
                merged.append(b)
        return merged

    L, R = (0, 1250), (1250, 2400)
    packer = Packer()
    upper = [("ABCD", 165), ("EFGHI", 254), ("JKLMN", 343), ("OPQRS", 437), ("TUVW", 527), ("XYZ", 612)]
    for letters, cy in upper:
        g = band(cy, L)
        assert len(g) == 4 * len(letters), (letters, len(g))
        for i, ch in enumerate(letters):
            fr = [sheet.crop(b) for b in g[i * 4:i * 4 + 4]]
            packer.add_anim("bold %s" % ch, fr[0:2])
            packer.add_anim("cap %s" % ch, fr[2:4])

    def pairs(cy, chars, tol=38, kind="sym", pick=None):
        g = band(cy, R, tol)
        if pick is not None:
            g = [g[i] for i in pick]
        assert len(g) == 2 * len(chars), (chars, len(g))
        for i, ch in enumerate(chars):
            fr = [trim(sheet.crop(b))[0] for b in g[i * 2:i * 2 + 2]]
            packer.add_anim("%s %s" % (kind, ch), fr, center=False)
            packer.add_anim("bold %s" % ch, [synth_bold(f) for f in fr], center=False)

    pairs(136, "0123456789", kind="num")
    pairs(226, "#$%&()*+-:;")
    pairs(298, "<=>@")
    g4 = band(405, R)
    g5 = band(480, R)
    lower1, lower2 = band(567, R, 45), band(643, R, 45)
    for letters, g in (("abcdefghijklm", lower1), ("nopqrstuvwxyz", lower2)):
        assert len(g) == 2 * len(letters), (letters, len(g))
        for i, ch in enumerate(letters):
            packer.add_anim("low %s" % ch, [trim(sheet.crop(b))[0] for b in g[i * 2:i * 2 + 2]], center=False)
    print("row4 glyphs", len(g4), "row5 glyphs", len(g5))
    extra = {"/": (g5, 0), "?": (g5, 8), ".": (g5, 6), "!": (g4, None), "'": (g4, None)}
    extra["!"], extra["'"] = (g4, 20), (g4, 12)
    if len(g5) >= 10 and len(g4) >= 22:
        for ch in "/.?!'":
            row, i = extra[ch]
            fr = [trim(sheet.crop(b))[0] for b in row[i:i + 2]]
            packer.add_anim("sym %s" % ch, fr, center=False)
            packer.add_anim("bold %s" % ch, [synth_bold(f) for f in fr], center=False)
    packer.save(os.path.join(OUT, "ui", "alphabet"), max_width=2048)


def build_hud():
    """Health bar, health icons (150x150 cells, normal + losing) and volume tray from the HUD sheets."""
    sheet = Image.open(os.path.join(SRC, "Healthbar and Icons.png")).convert("RGBA")
    bg = np.array([198, 75, 182])
    os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "ui"), exist_ok=True)
    sheet.crop((9, 26, 610, 45)).save(os.path.join(OUT, "ui", "healthBar.png"))
    icons = {"bf": (9, 113), "gf": (314, 113), "dad": (619, 113), "spooky": (9, 283), "monster": (314, 283), "pico": (619, 283),
             "mom": (9, 433 + 20), "parents-christmas": (314, 453), "tankman": (9, 603 + 20), "face": (9, 1170 - 1)}
    a = np.array(sheet)
    for name, (x, y) in icons.items():
        if name in ("mom", "parents-christmas", "tankman", "face"):
            continue
        icon = a[y:y + 150, x:x + 302].copy()
        out = Image.new("RGBA", (300, 150))
        out.paste(Image.fromarray(icon[:, :150]), (0, 0))
        out.paste(Image.fromarray(icon[:, 151:301]), (150, 0))
        px = np.array(out)
        px[(np.abs(px[:, :, :3].astype(int) - bg).sum(2) < 30)] = 0
        Image.fromarray(px).save(os.path.join(OUT, "icons", "icon-%s.png" % name))
    vol = Image.open(os.path.join(SRC, "Volume.png")).convert("RGBA")
    vb = np.array([27, 89, 153])
    va = np.array(vol)
    va[(np.abs(va[:, :, :3].astype(int) - vb).sum(2) < 30)] = 0
    vol = Image.fromarray(va)
    vol.crop((3, 3, 263, 149)).save(os.path.join(OUT, "ui", "volumebox.png"))
    for i in range(10):
        vol.crop((276, 4 + 60 * i, 479, 61 + 60 * i)).save(os.path.join(OUT, "ui", "bars_%d.png" % (i + 1)))
    print("wrote hud")


if __name__ == "__main__":
    import sys
    only = sys.argv[1:]
    steps = {"plain": copy_plain, "arrows": build_arrows, "menu": build_menu, "bf": build_bf,
             "stage": build_stage, "dad": build_dad, "text": build_game_text, "alphabet": build_alphabet,
        "hud": build_hud}
    for name, fn in steps.items():
        if not only or name in only:
            fn()
