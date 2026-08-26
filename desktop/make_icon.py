"""Draws the app icon: a poker chip in the table's felt green and gold.

Geometry only, no font — the mark has to stay readable at the 16px the
taskbar draws it at, and letterforms do not survive that.
"""

from PIL import Image, ImageDraw

GOLD = (211, 172, 71, 255)
FELT = (19, 83, 52, 255)
FELT_DARK = (10, 47, 29, 255)
SIZES = [256, 64, 48, 32, 16]

# Drawn once at 4x the largest size, then downsampled — Pillow has no
# antialiased ellipse, so the smoothing has to come from the resize.
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

d.ellipse([0, 0, S - 1, S - 1], fill=GOLD)
d.ellipse([S * 0.055, S * 0.055, S * 0.945, S * 0.945], fill=FELT_DARK)

# Six gold edge stripes, the thing that makes a circle read as a chip.
for i in range(6):
    d.pieslice(
        [S * 0.03, S * 0.03, S * 0.97, S * 0.97],
        start=i * 60 - 13,
        end=i * 60 + 13,
        fill=GOLD,
    )

d.ellipse([S * 0.20, S * 0.20, S * 0.80, S * 0.80], fill=GOLD)
d.ellipse([S * 0.245, S * 0.245, S * 0.755, S * 0.755], fill=FELT)

img.resize((256, 256), Image.LANCZOS).save(
    "randomizer.ico", sizes=[(s, s) for s in SIZES]
)
print("randomizer.ico written")
