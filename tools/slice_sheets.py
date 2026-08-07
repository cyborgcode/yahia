"""Slice the reference sprite sheets into a game-ready atlas.

The sheets are 5x5 grids of 256x256 cells whose contents share a common origin,
so every frame is cropped to ONE global bounding box rather than trimmed
individually. That is what preserves the run cycle's bob and the jump's arc —
per-frame trimming would flatten both into a figure that never leaves the floor.

Frames are then scaled so the standing figure matches the game's character
height, and anchored on the idle pose's ground line so every animation's feet
land in the same place.

Outputs an atlas PNG plus a JSON manifest of frame rects and sprite offsets.
"""

from PIL import Image
import json
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/9375a87e-b097-580e-a87f-765368f81832'
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else 'apps/client/src/render'
MANIFEST = sys.argv[3] if len(sys.argv) > 3 else 'apps/client/src/render/atlas.json'

SHEETS = {
    'idle': '143db5f1-IMG_1011.PNG',
    'run': 'e2a5ff67-IMG_1012.PNG',
    'jump': '653bc642-IMG_1013.PNG',
    'crouch': '31c01c5f-IMG_1014.PNG',
}
COLS = ROWS = 5

# The game's character height in backbuffer pixels at SCALE 1. The runner is
# px(24) tall on screen; everything else follows from this one number.
TARGET_STANDING_BASE = 24
SCALE = 3
TARGET_STANDING = TARGET_STANDING_BASE * SCALE

# Hitbox, from apps/client/src/game/player.ts, at the same scale.
HITBOX_W = 12 * SCALE
HITBOX_H_STAND = 20 * SCALE
HITBOX_H_SLIDE = 14 * SCALE


def load(name):
    return Image.open(os.path.join(SRC, SHEETS[name])).convert('RGBA')


def cells(im):
    W, H = im.size
    cw, ch = W // COLS, H // ROWS
    for r in range(ROWS):
        for c in range(COLS):
            cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            if cell.getchannel('A').getbbox() is not None:
                yield cell


def differ(a, b, threshold):
    """Mean per-pixel difference, used to drop near-identical frames."""
    if a is None:
        return threshold + 1
    pa, pb = a.load(), b.load()
    w, h = a.size
    total = 0
    n = 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            ra = pa[x, y]
            rb = pb[x, y]
            total += abs(ra[0] - rb[0]) + abs(ra[1] - rb[1]) + abs(ra[2] - rb[2]) + abs(ra[3] - rb[3])
            n += 1
    return total / max(1, n)


def main():
    sheets = {name: list(cells(load(name))) for name in SHEETS}

    # One bounding box across every frame of every sheet: the shared coordinate
    # space that keeps animations aligned to each other.
    boxes = [f.getchannel('A').getbbox() for fs in sheets.values() for f in fs]
    gx0 = min(b[0] for b in boxes)
    gy0 = min(b[1] for b in boxes)
    gx1 = max(b[2] for b in boxes)
    gy1 = max(b[3] for b in boxes)

    # Ground line and standing height come from the idle pose.
    idle_box = sheets['idle'][0].getchannel('A').getbbox()
    ground_y = idle_box[3]
    standing_h = idle_box[3] - idle_box[1]
    k = TARGET_STANDING / standing_h

    src_w, src_h = gx1 - gx0, gy1 - gy0
    fw, fh = round(src_w * k), round(src_h * k)

    ground_in_box = (ground_y - gy0) * k
    centre_in_box = (256 // 2 - gx0) * k
    stand_ox = round(HITBOX_W / 2 - centre_in_box)
    stand_oy = round(HITBOX_H_STAND - ground_in_box)

    print(f'global box {src_w}x{src_h} -> frame {fw}x{fh}  (scale {k:.3f})')
    print(f'ground line at {ground_in_box:.1f}; stand offset ({stand_ox}, {stand_oy})')

    def prep(cell):
        return cell.crop((gx0, gy0, gx1, gy1)).resize((fw, fh), Image.LANCZOS)

    # The run sheet holds TWO cycles of twelve; playing all 24 would replay the
    # stride twice per loop and read as a stutter. Measured by self-similarity.
    RUN_CYCLE = 12
    run = [prep(f) for f in sheets['run'][:RUN_CYCLE]]

    # The jump sheet is one arc: leap, descent, landing squat. Take one pose
    # from the rise and one from the fall.
    jump = prep(sheets['jump'][3])
    fall = prep(sheets['jump'][12])

    # Crouch and idle are effectively static — one frame each is the whole sheet.
    slide = prep(sheets['crouch'][-1])
    idle = prep(sheets['idle'][0])

    # No sheet contains a body lying down, so the corpse is derived: the idle
    # pose rotated onto its back. It is the only pose with a lying body's
    # proportions — a curled crouch rotated is two-thirds as thick as the
    # runner is tall, which reads as a boulder, not a body.
    corpse_src = sheets['idle'][0].crop(idle_box)
    corpse = corpse_src.rotate(90, expand=True, resample=Image.BICUBIC)
    cw = round(corpse.size[0] * k)
    chh = round(corpse.size[1] * k)
    corpse = corpse.resize((cw, chh), Image.LANCZOS)

    named = [('idle', idle), ('jump', jump), ('fall', fall), ('slide', slide)]
    named += [(f'run{i}', img) for i, img in enumerate(run)]
    named += [('corpse', corpse)]

    # Shelf pack: frames are near-uniform, so rows of equal height are tight.
    per_row = 6
    rows = []
    row = []
    for entry in named:
        row.append(entry)
        if len(row) == per_row:
            rows.append(row)
            row = []
    if row:
        rows.append(row)

    atlas_w = max(sum(img.size[0] for _, img in r) for r in rows)
    atlas_h = sum(max(img.size[1] for _, img in r) for r in rows)
    atlas = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))

    frames_meta = {}
    y = 0
    for r in rows:
        x = 0
        row_h = max(img.size[1] for _, img in r)
        for key, img in r:
            atlas.paste(img, (x, y))
            frames_meta[key] = [x, y, img.size[0], img.size[1]]
            x += img.size[0]
        y += row_h

    os.makedirs(OUT_DIR, exist_ok=True)
    atlas_path = os.path.join(OUT_DIR, 'yahia-atlas.png')
    atlas.quantize(colors=128, method=Image.FASTOCTREE, dither=Image.NONE).save(
        atlas_path, optimize=True
    )

    manifest = {
        'image': 'yahia-atlas.png',
        'scale': SCALE,
        'standOffset': [stand_ox, stand_oy],
        'slideOffset': [stand_ox, round(HITBOX_H_SLIDE - ground_in_box)],
        'frames': frames_meta,
        'runCycle': [f'run{i}' for i in range(len(run))],
    }
    with open(MANIFEST, 'w') as fh_out:
        json.dump(manifest, fh_out, indent=2)

    size_kb = os.path.getsize(atlas_path) / 1024
    print(f'  run cycle {len(run)} frames, corpse {cw}x{chh}, slide {fw}x{fh}')
    print(f'atlas {atlas.size[0]}x{atlas.size[1]} -> {atlas_path} ({size_kb:.0f} KB)')
    print(f'manifest -> {MANIFEST}')


if __name__ == '__main__':
    main()
