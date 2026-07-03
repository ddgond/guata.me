#!/usr/bin/env python3
"""Generate the site's logo assets from Rock Salt (Google Fonts).

Usage: generate-logo.py [logo|favicon|all]   (default: all)

- logo: src/images/dan-dangond-logo.png — "Dan" over "Dangond", each word
  rotated individually then left-aligned and stacked, so the words are
  tilted but the stacking stays vertical. Requires Pillow.
- favicon: public/favicon.svg — a single "D" monogram (ink on paper-white)
  traced from the font's glyph outline. Requires fontTools.

The font is downloaded from Google Fonts on first run and cached next to
this script.

Runner-up from the original font comparison: "mochiy-pop-title (title)" —
Mochiy Pop One in Title Case — was also good and could be worth switching
to in the future if preferences change.
"""

import re
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT = SCRIPT_DIR.parent / "src" / "images" / "dan-dangond-logo.png"
FAVICON_OUTPUT = SCRIPT_DIR.parent / "public" / "favicon.svg"
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


def generate_favicon():
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.ttLib import TTFont

    font = TTFont(FONT_PATH)
    glyph_set = font.getGlyphSet()
    glyph = glyph_set[font.getBestCmap()[ord("D")]]

    bounds = BoundsPen(glyph_set)
    glyph.draw(bounds)
    xmin, ymin, xmax, ymax = bounds.bounds
    svg_pen = SVGPathPen(glyph_set)
    glyph.draw(svg_pen)

    # Fit the glyph into a 100x100 viewBox over a paper-white rounded square,
    # flipping y (font coordinates are y-up, SVG is y-down).
    size, margin = 100, 15
    scale = (size - 2 * margin) / max(xmax - xmin, ymax - ymin)
    tx = (size - (xmax - xmin) * scale) / 2 - xmin * scale
    ty = (size - (ymax - ymin) * scale) / 2 + ymax * scale
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<rect width="{size}" height="{size}" rx="20" fill="#fbfaf6"/>'
        f'<path transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f} -{scale:.4f})" '
        f'fill="#1c1b18" d="{svg_pen.getCommands()}"/>'
        f"</svg>\n"
    )
    FAVICON_OUTPUT.write_text(svg)
    print(f"saved {FAVICON_OUTPUT}")


def render_word(text, font):
    from PIL import Image, ImageDraw

    dummy = Image.new("RGBA", (10, 10))
    bbox = ImageDraw.Draw(dummy).textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    img = Image.new("RGBA", (w + 200, h + 200), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((100 - bbox[0], 100 - bbox[1]), text, font=font, fill=COLOR)
    img = img.crop(img.getbbox())
    img = img.rotate(ANGLE, expand=True, resample=Image.BICUBIC)
    return img.crop(img.getbbox())


def generate_logo():
    from PIL import Image, ImageFont

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


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target not in ("logo", "favicon", "all"):
        sys.exit(f"usage: {Path(sys.argv[0]).name} [logo|favicon|all]")
    fetch_font()
    if target in ("logo", "all"):
        generate_logo()
    if target in ("favicon", "all"):
        generate_favicon()


if __name__ == "__main__":
    main()
