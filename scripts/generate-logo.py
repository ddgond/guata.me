#!/usr/bin/env python3
"""Generate src/images/dan-dangond-logo.png.

Renders "Dan" over "Dangond" in Rock Salt (Google Fonts). Each word is
rotated individually, then the two are left-aligned and stacked — so the
words are tilted but the stacking stays vertical.

Requires Pillow (pip install pillow). The font is downloaded from Google
Fonts on first run and cached next to this script.

Runner-up from the original font comparison: "mochiy-pop-title (title)" —
Mochiy Pop One in Title Case — was also good and could be worth switching
to in the future if preferences change.
"""

import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT = SCRIPT_DIR.parent / "src" / "images" / "dan-dangond-logo.png"
FONT_PATH = SCRIPT_DIR / "RockSalt.ttf"
FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Rock+Salt&display=swap"

WORDS = ("Dan", "Dangond")
FONT_SIZE = 300
ANGLE = 5  # degrees counterclockwise — tilts each word upward to the right
COLOR = (17, 17, 17, 255)
GAP = 24  # vertical gap between the two words
PAD = 40  # transparent padding around the result


def fetch_font():
    if FONT_PATH.exists():
        return
    # The CSS API serves TTF urls to clients without browser user agents
    css = urllib.request.urlopen(FONT_CSS_URL).read().decode()
    url = re.search(r"https://fonts\.gstatic\.com/[^)]+", css).group()
    FONT_PATH.write_bytes(urllib.request.urlopen(url).read())
    print(f"downloaded {FONT_PATH.name}")


def render_word(text, font):
    dummy = Image.new("RGBA", (10, 10))
    bbox = ImageDraw.Draw(dummy).textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    img = Image.new("RGBA", (w + 200, h + 200), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((100 - bbox[0], 100 - bbox[1]), text, font=font, fill=COLOR)
    img = img.crop(img.getbbox())
    img = img.rotate(ANGLE, expand=True, resample=Image.BICUBIC)
    return img.crop(img.getbbox())


def main():
    fetch_font()
    font = ImageFont.truetype(str(FONT_PATH), FONT_SIZE)
    top = render_word(WORDS[0], font)
    bottom = render_word(WORDS[1], font)

    width = max(top.width, bottom.width) + 2 * PAD
    height = top.height + GAP + bottom.height + 2 * PAD
    logo = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    logo.alpha_composite(top, (PAD, PAD))
    logo.alpha_composite(bottom, (PAD, PAD + top.height + GAP))

    logo.save(OUTPUT)
    print(f"saved {OUTPUT} {logo.size}")


if __name__ == "__main__":
    main()
