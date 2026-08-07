"""
Slice the hero turnaround into a sheet, and segment his kit so it can recolour.

The source is an 8-frame 360-degree turnaround. It is the character people meet
before they play — the loading screen and the PLAY button — and in a twelve
player race it is also how you pick a colour nobody else took.

Two things this has to get right:

  ONE BOUNDING BOX, shared by all eight frames. Trimming each frame to its own
  content would make the figure jitter as it spins, because the silhouette is
  narrower in profile than face-on.

  A GARMENT MASK, not a hue rotation. The shirt is cream — saturation 0.14 —
  and rotating the hue of something that desaturated does nothing at all. To
  recolour it you have to replace the colour and keep only the shading, which
  means knowing which pixels are shirt. That is decided here, once, where it can
  be looked at, rather than guessed at runtime.

Emits hero.png (art), hero-mask.png (red = shirt, green = shorts) and hero.json.
Run: npm run hero
"""

import colorsys
import json
import pathlib
import sys

from PIL import Image, ImageSequence

UPLOADS = "/root/.claude/uploads/9375a87e-b097-580e-a87f-765368f81832"
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else f"{UPLOADS}/cdaa71c7-IMG_1020.gif")
OUT = pathlib.Path("apps/client/src/render")
DEBUG = pathlib.Path("tools/.hero-debug.png")

SHIRT = (255, 0, 0)
SHORTS = (0, 255, 0)


def classify(r: int, g: int, b: int) -> str:
    """Which garment a pixel belongs to, from its place in HSV.

    The clusters are well separated in the source art: cream shirt at hue ~48
    and saturation ~0.14, pink shorts at ~356 and ~0.38, skin at ~20 and ~0.49.
    Skin is the one that can be mistaken for either, so it is bracketed out from
    both sides rather than left to a single threshold.
    """
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    hue = h * 360

    # Too dark to carry colour: hair, outlines, the shadow under the shoes.
    if v < 0.35:
        return "other"

    if s < 0.30 and 25 <= hue <= 80:
        return "shirt"
    # Pink wraps past 0, and the shorts' pale logo sits at hue 0 exactly.
    if s >= 0.20 and (hue >= 320 or hue <= 10):
        return "shorts"
    return "other"


def despeckle(mask: Image.Image, w: int, h: int, floor: int = 24) -> int:
    """Drop classified blobs too small to be a garment.

    The HSV clusters overlap slightly at their edges, so a few lit hair and
    outline pixels land in a garment. Counting neighbours only removes lone
    pixels and leaves the little clumps, which are the ones you actually see —
    invisible while the shirt is cream, a bright dot on someone's forehead once
    it is blue. Measure whole connected regions instead and drop the small ones.
    """
    px = mask.load()
    seen = bytearray(w * h)
    removed = 0

    for y0 in range(h):
        for x0 in range(w):
            if seen[y0 * w + x0] or px[x0, y0][:3] == (0, 0, 0):
                continue
            kind = px[x0, y0][:3]
            seen[y0 * w + x0] = 1
            blob = [(x0, y0)]
            stack = [(x0, y0)]
            while stack:
                x, y = stack.pop()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h) or seen[ny * w + nx]:
                        continue
                    if px[nx, ny][:3] != kind:
                        continue
                    seen[ny * w + nx] = 1
                    blob.append((nx, ny))
                    stack.append((nx, ny))
            if len(blob) < floor:
                for x, y in blob:
                    px[x, y] = (0, 0, 0, 255)
                removed += len(blob)
    return removed


def save_mask(mask: Image.Image, path: pathlib.Path) -> None:
    """Three flat colours, so paletting costs nothing and saves a great deal."""
    mask.convert("RGB").quantize(colors=4).save(path, optimize=True)


def save_paletted(sheet: Image.Image, path: pathlib.Path) -> None:
    """PNG-8 with a transparent index.

    The source is GIF, so its alpha is already 1-bit and nothing is lost by
    carrying it in a palette index. As truecolour RGBA this sheet is 107 KB,
    which is four times the entire rest of the game's art.
    """
    alpha = sheet.getchannel("A")
    flat = sheet.convert("RGB").quantize(colors=255, method=Image.Quantize.MAXCOVERAGE)

    # The quantiser fills 0..254, so 255 is free to be the hole — but it has to
    # exist in the palette first. Writing info["transparency"] by hand instead
    # made Pillow emit a 256-entry tRNS table that was opaque all the way
    # through, and the cut-out background shipped as a solid colour.
    palette = flat.getpalette() or []
    flat.putpalette(palette[: 255 * 3] + [0, 0, 0])

    # No dithering: this is a yes/no cut, and dither would scatter the edge.
    hole = alpha.point(lambda a: 255 if a < 128 else 0).convert("1", dither=Image.Dither.NONE)
    flat.paste(255, hole)
    flat.save(path, optimize=True, transparency=255)


def mask_for(img: Image.Image) -> tuple[Image.Image, dict[str, list[float]], int]:
    """Segment any sheet of this character into shirt / shorts.

    Used for the turnaround and, unchanged, for the in-game runner atlas: it is
    the same person in the same clothes, so it is the same classifier. A kit
    colour that stopped at the menu would be decoration; carrying it into the
    race is the entire reason twelve players need one.
    """
    w, h = img.size
    mask = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    px = img.load()
    mpx = mask.load()
    spans = {"shirt": [1.0, 0.0], "shorts": [1.0, 0.0]}

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            kind = classify(r, g, b)
            if kind == "other":
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            span = spans[kind]
            span[0] = min(span[0], lum)
            span[1] = max(span[1], lum)
            mpx[x, y] = (SHIRT if kind == "shirt" else SHORTS) + (255,)

    removed = despeckle(mask, w, h)
    rounded = {k: [round(v[0], 4), round(v[1], 4)] for k, v in spans.items()}
    return mask, rounded, removed


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"no source art at {SRC}")

    frames = [f.convert("RGBA") for f in ImageSequence.Iterator(Image.open(SRC))]

    # One box for every frame, so the figure does not swim as it turns.
    box = None
    for f in frames:
        b = f.getchannel("A").getbbox()
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])
        )
    cropped = [f.crop(box) for f in frames]
    fw, fh = cropped[0].size

    sheet = Image.new("RGBA", (fw * len(cropped), fh), (0, 0, 0, 0))
    for i, frame in enumerate(cropped):
        sheet.paste(frame, (i * fw, 0))

    mask, spans, speckles = mask_for(sheet)

    OUT.mkdir(parents=True, exist_ok=True)
    save_paletted(sheet, OUT / "hero.png")
    # The mask is three flat colours, so paletting it costs nothing and saves a
    # lot: it is the same pixel count as the art it describes.
    save_mask(mask, OUT / "hero-mask.png")

    # The same clothes on the in-game runner, so a kit picked in the menu is the
    # kit you race in. Read back off the built atlas rather than re-sliced from
    # the source sheets — the atlas is what actually ships.
    runner = Image.open(OUT / "yahia-atlas.png").convert("RGBA")
    runner_mask, runner_spans, runner_speckles = mask_for(runner)
    save_mask(runner_mask, OUT / "yahia-mask.png")

    manifest = {
        "frameW": fw,
        "frameH": fh,
        "frames": len(cropped),
        "shirtSpan": spans["shirt"],
        "shortsSpan": spans["shorts"],
        "runner": {"shirtSpan": runner_spans["shirt"], "shortsSpan": runner_spans["shorts"]},
    }
    (OUT / "hero.json").write_text(json.dumps(manifest, indent=2) + "\n")

    # A picture of what got classified, because a mask that is subtly wrong is
    # invisible in numbers and obvious the moment you look at it.
    pad = 8
    dh = fh + pad + runner.height
    debug = Image.new("RGBA", (max(sheet.width, runner.width * 2 + pad), dh * 2), (18, 12, 24, 255))
    debug.paste(sheet, (0, 0), sheet)
    debug.paste(mask, (0, dh))
    debug.paste(runner, (0, fh + pad), runner)
    debug.paste(runner_mask, (runner.width + pad, fh + pad))
    debug.save(DEBUG)

    kb = lambda p: (OUT / p).stat().st_size / 1024  # noqa: E731
    print(f"hero   frame {fw}x{fh} x{len(cropped)}  sheet {sheet.width}x{sheet.height}")
    print(f"       shirt lum {manifest['shirtSpan']}  shorts lum {manifest['shortsSpan']}")
    print(f"       despeckled {speckles} px   art {kb('hero.png'):.1f} KB"
          f"  mask {kb('hero-mask.png'):.1f} KB")
    print(f"runner {runner.width}x{runner.height}")
    print(f"       shirt lum {runner_spans['shirt']}  shorts lum {runner_spans['shorts']}")
    print(f"       despeckled {runner_speckles} px  mask {kb('yahia-mask.png'):.1f} KB")
    print(f"debug -> {DEBUG}")


if __name__ == "__main__":
    main()
