"""
Builds the per-product bag images for the akokofeeds.com shop.

Each bag artwork carries a checklist of its variants (Mash / Concentrate). For
every product we want the SAME bag with ITS OWN box ticked, so this script
(1) erases any tick already printed on the artwork by copying a clean,
untouched box over it, then (2) draws a fresh tick on the wanted box, and
(3) saves a web-sized .webp per product.

    python scripts/make-bag-images.py <folder-with-bag-artwork> [out-dir]

The folder must contain broiler.png, chicks.png, layer1.png, layer2.png (the
four artwork files). Output defaults to apps/storefront/public/bags/.
Re-run it whenever the artwork changes; the shop only reads the .webp files.
"""
import os
import sys

from PIL import Image, ImageDraw

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "apps", "storefront", "public", "bags")
os.makedirs(OUT, exist_ok=True)

TICK = (17, 17, 17)

# bag -> (file, existing-tick eraser or None, {variant: (centre_x, centre_y, tick_size)})
BAGS = {
    "broiler": ("broiler.png", {
        # a tick is printed on the first box: copy the clean 2nd box over it
        "erase": dict(src=(198, 470, 284, 544), dst_y=396),
        "boxes": {
            "broiler-starter-mash": (239, 437, 78),
            "broiler-starter-concentrate": (239, 511, 78),
            "broiler-finisher-mash": (239, 595, 78),
            "broiler-finisher-concentrate": (239, 668, 78),
        },
    }),
    "chicks": ("chicks.png", {
        "erase": None,
        "boxes": {
            "chicks-starter-mash": (70, 430, 58),
            "chicks-starter-concentrate": (70, 488, 58),
            "super-chicks-mash": (68, 568, 58),
            "super-chicks-concentrate": (70, 627, 58),
            "developer-mash": (462, 430, 58),
            "developer-concentrate": (462, 484, 58),
            "prelayer-mash": (462, 566, 58),
            "prelayer-concentrate": (462, 620, 58),
        },
    }),
    "layer1": ("layer1.png", {
        # tick on the Mash box; the Concentrate box (95 px lower) is clean
        "erase": dict(src=(96, 553, 183, 645), dst_y=458, patch_orange=(184, 455, 198, 492)),
        "boxes": {
            "layer-1-mash": (137, 506, 84),
            "layer-1-concentrate": (137, 601, 84),
        },
    }),
    "layer2": ("layer2.png", {
        "erase": None,
        "boxes": {
            "layer-2-mash": (136, 516, 84),
            "layer-2-concentrate": (136, 623, 84),
        },
    }),
}


def draw_tick(img, cx, cy, size):
    """Heavy black check mark, a touch up and to the right like the printed one."""
    scale = 4
    layer = Image.new("RGBA", (img.width * scale, img.height * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ox, oy = cx + size * 0.08, cy - size * 0.10
    pts = [(-0.34, 0.02), (-0.10, 0.34), (0.40, -0.40)]
    pts = [((ox + px * size) * scale, (oy + py * size) * scale) for px, py in pts]
    w = int(size * 0.17 * scale)
    d.line(pts, fill=TICK + (255,), width=w, joint="curve")
    for x, y in (pts[0], pts[2]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=TICK + (255,))
    layer = layer.resize(img.size, Image.LANCZOS)
    img.alpha_composite(layer)


def save_plain(slug, fname):
    """Pre-Starter has no checkbox on any printed bag yet, so it shows the plain
    grower bag with nothing ticked until its own artwork exists."""
    img = Image.open(os.path.join(SRC, fname)).convert("RGB")
    img.thumbnail((720, 1100), Image.LANCZOS)
    for form in ("mash", "concentrate"):
        img.save(os.path.join(OUT, f"{slug}-{form}.webp"), "WEBP", quality=86, method=6)
        print("wrote", f"{slug}-{form}")


for key, (fname, cfg) in BAGS.items():
    base = Image.open(os.path.join(SRC, fname)).convert("RGBA")
    erase = cfg["erase"]
    if erase:
        x0, y0, x1, y1 = erase["src"]
        patch = base.crop((x0, y0, x1, y1))
        base.paste(patch, (x0, erase["dst_y"]))
        if "patch_orange" in erase:
            ax0, ay0, ax1, ay1 = erase["patch_orange"]
            sample = base.crop((205, ay0, 235, ay1)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
            ImageDraw.Draw(base).rectangle([ax0, ay0, ax1, ay1], fill=sample)
    for slug, (cx, cy, size) in cfg["boxes"].items():
        img = base.copy()
        draw_tick(img, cx, cy, size)
        out = img.convert("RGB")
        out.thumbnail((720, 1100), Image.LANCZOS)
        out.save(os.path.join(OUT, f"{slug}.webp"), "WEBP", quality=86, method=6)
        print("wrote", slug)

save_plain("pre-starter", BAGS["chicks"][0])
