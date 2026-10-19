"""
Prepares the photos for the akokofeeds.com storefront: resizes the originals to
web sizes (.webp), crops the small generator sparkle mark off the AI-made
pictures, and cuts the four bag artworks out of their white background so they
can float over a photo.

    python scripts/prepare-storefront-photos.py <folder-with-originals> [out-dir]

Originals are large (up to 13 MB), so they are NOT committed - only the output
in apps/storefront/public/photos/ and public/bags/cutouts/ is. Edit PHOTOS /
BAGS below to match the file names in your folder.
"""
import os
import sys
from collections import deque

from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "apps", "storefront", "public")
PHOTO_DIR = os.path.join(OUT, "photos")
CUT_DIR = os.path.join(OUT, "bags", "cutouts")
os.makedirs(PHOTO_DIR, exist_ok=True)
os.makedirs(CUT_DIR, exist_ok=True)

# output name -> (source file, max width, crop fraction off the bottom/right edge)
PHOTOS = {
    "hero-hen-sunset": ("11.jpg", 2200, 0),
    "feed-trough": ("13.jpg", 1800, 0),
    "layer-house": ("14.jpg", 1800, 0),
    "house-aisle": ("12.png", 1400, 0.08),      # crop the sparkle mark
    "farm-feeding": ("15.png", 1400, 0.08),
    "expert-team": ("9.png", 1400, 0.08),
    "farmer-tablet": ("20.jpg", 1600, 0),
    "hen-portrait": ("21.jpg", 1400, 0),
}

# bag artwork -> cutout name (the plain bag; the ticked product images are separate)
BAGS = {
    "22.png": "broiler",
    "23.png": "grower",
    "24.png": "layer1",
    "25.png": "layer2",
}


def save_photo(name, src, max_w, crop):
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    if crop:
        w, h = im.size
        im = im.crop((0, 0, int(w * (1 - crop * 0.5)), int(h * (1 - crop))))
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(os.path.join(PHOTO_DIR, f"{name}.webp"), "WEBP", quality=80, method=6)
    print("photo", name, im.size)


def cut_out(src, name):
    """Silhouette the bag: seal its outline, fill the inside, make the rest transparent."""
    import numpy as np
    from scipy import ndimage as ndi

    im = Image.open(os.path.join(SRC, src)).convert("RGBA")
    rgb = np.array(im.convert("RGB")).astype(int)
    ink = rgb.min(axis=2) < 238                      # anything that is not paper-white
    sealed = ndi.binary_closing(ink, structure=np.ones((3, 3)), iterations=8)
    body = ndi.binary_fill_holes(sealed)             # everything inside the outline
    lab, n = ndi.label(body)
    if n > 1:                                        # keep only the bag itself
        sizes = ndi.sum(body, lab, range(1, n + 1))
        body = lab == (1 + int(np.argmax(sizes)))
    body = ndi.binary_erosion(body, iterations=2)    # trim the halo
    alpha = ndi.gaussian_filter(body.astype(float), 1.2)
    out = np.array(im)
    out[..., 3] = (alpha * 255).astype("uint8")
    im = Image.fromarray(out, "RGBA")
    im.thumbnail((640, 960), Image.LANCZOS)
    im.save(os.path.join(CUT_DIR, f"{name}.webp"), "WEBP", quality=88, method=6)
    print("cutout", name, im.size)


for out_name, (src, max_w, crop) in PHOTOS.items():
    save_photo(out_name, src, max_w, crop)
for src, name in BAGS.items():
    cut_out(src, name)
