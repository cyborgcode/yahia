"""Slice the environment tileset, props and enemies into the game atlas.

Three source images:
  IMG_1016  17x8 tiles of 16px — terrain edges, a dead tree, a hedge, props
  IMG_1015  23x4 frames of 32px — four enemy characters
  IMG_1017  crescent moons

Terrain is upscaled 3x, an exact integer multiple onto the game's 48px tiles, so
the pixel art stays crisp. Enemies are upscaled 2x instead: the tileset was
authored for a two-tile-tall protagonist and YAHIA's runner is 1.25 tiles, so a
3x enemy would tower over the player it is meant to threaten.

The tileset draws platforms as outlined shells with see-through interiors, but
YAHIA's ground is a solid mass. Interiors are therefore composited over an
opaque base sampled from the art itself, so the ground can never be mistaken
for background.
"""

from PIL import Image
import json
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/9375a87e-b097-580e-a87f-765368f81832'
OUT_DIR = 'apps/client/src/render'

TILES = '5466f778-IMG_1016.PNG'
ENEMIES = '2f299042-IMG_1015.PNG'
MOONS = '1a2bfb6c-IMG_1017.PNG'

SCALE = 3
TILE_SRC = 16
TILE = TILE_SRC * SCALE          # 48
ENEMY_SCALE = 2
ENEMY_SRC = 32

# Terrain tiles, by (col, row) in the 16px source grid.
# Read off an enlarged grid rather than guessed: (12,1) is a right edge, not a
# fill, and (11,1) is the only genuinely blank interior.
GROUND_TOP = (8, 0)              # orange crust, grass fringe
GROUND_TOP_ALT = (7, 0)
GROUND_FILL = (11, 1)            # platform interior
EDGE_LEFT = (10, 1)
EDGE_RIGHT = (12, 1)
WEAK_TOP = (8, 2)                # the teal set, visibly different for breakables
WEAK_FILL = (11, 1)

# Props, as exact pixel boxes.
#
# Found by flood-filling the source for opaque islands and printing their bounds
# rather than read off a grid: these are hand-placed on the sheet at arbitrary
# sizes, and a guessed box clips a leaf or drags in a neighbour.
#
# Only things that read as SCENERY are taken. The sheet also has a ladder and
# signs, and both are promises the game does not keep — a ladder you cannot climb
# is worse than no ladder, because the one thing terrain must never do is lie
# about what you can do with it.
TREE = (0, 0, 112, 128)
HEDGE = (176, 64, 224, 112)

SCATTER = {
    'tuft': (227, 90, 237, 96),
    'tuft2': (242, 91, 252, 96),
    'tuft3': (227, 106, 237, 112),
    'tuft4': (242, 107, 252, 112),
    'rock': (259, 88, 270, 96),
    'rock2': (257, 103, 270, 112),
    'fence': (229, 40, 267, 48),
    'fence2': (229, 56, 267, 64),
    'crate': (130, 66, 142, 78),
    'bench': (225, 69, 239, 80),
    'campfire': (257, 67, 271, 80),
}


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def tile(im, col, row, w=1, h=1):
    return im.crop((col * TILE_SRC, row * TILE_SRC,
                    (col + w) * TILE_SRC, (row + h) * TILE_SRC))


def coverage(img):
    """Alpha coverage per quadrant — tells an edge tile's orientation."""
    a = img.getchannel('A')
    w, h = img.size
    def frac(box):
        crop = a.crop(box)
        px = list(crop.getdata())
        return sum(1 for v in px if v > 32) / max(1, len(px))
    return {
        'left': round(frac((0, 0, w // 3, h)), 2),
        'right': round(frac((w - w // 3, 0, w, h)), 2),
        'top': round(frac((0, 0, w, h // 3)), 2),
        'all': round(frac((0, 0, w, h)), 2),
    }


def opaque_base(img):
    """Darkest saturated colour present — the ground's own shadow tone."""
    best = None
    for r, g, b, a in img.getdata():
        if a < 200:
            continue
        lum = r + g + b
        if best is None or lum < best[0]:
            best = (lum, (r, g, b))
    return best[1] if best else (30, 24, 40)


def upscale(img, factor):
    return img.resize((img.size[0] * factor, img.size[1] * factor), Image.NEAREST)


def main():
    src = load(TILES)
    enemies_img = load(ENEMIES)
    moons_img = load(MOONS)

    print('edge tile orientation (alpha coverage):')
    for name, pos in [('EDGE_LEFT', EDGE_LEFT), ('EDGE_RIGHT', EDGE_RIGHT),
                      ('GROUND_FILL', GROUND_FILL), ('GROUND_TOP', GROUND_TOP)]:
        print(f'  {name:12s} {coverage(tile(src, *pos))}')

    fill_src = tile(src, *GROUND_FILL)
    base = opaque_base(tile(src, *GROUND_TOP))
    print(f'  opaque base sampled from the art: rgb{base}')

    def solid(img):
        """Composite a shell tile onto an opaque base so ground reads as mass."""
        out = Image.new('RGBA', img.size, (*base, 255))
        out.alpha_composite(img)
        return out

    frames = {}

    def add(key, img):
        frames[key] = img

    add('groundTop', upscale(solid(tile(src, *GROUND_TOP)), SCALE))
    add('groundTop2', upscale(solid(tile(src, *GROUND_TOP_ALT)), SCALE))
    add('groundFill', upscale(solid(fill_src), SCALE))
    add('groundLeft', upscale(solid(tile(src, *EDGE_LEFT)), SCALE))
    add('groundRight', upscale(solid(tile(src, *EDGE_RIGHT)), SCALE))
    add('weakTop', upscale(solid(tile(src, *WEAK_TOP)), SCALE))
    add('weakFill', upscale(solid(tile(src, *WEAK_FILL)), SCALE))

    # Crust colour, for drawing the lit edge along a slope's diagonal where the
    # tileset has no slope tiles of its own.
    # The surface is two-tone — a green fringe over an orange crust — so sample
    # both, or a slope's diagonal ends up a single neon stripe.
    top_img = tile(src, *GROUND_TOP)
    rows_lit = []
    for y in range(TILE_SRC):
        lit = [top_img.getpixel((x, y)) for x in range(TILE_SRC)]
        lit = [p for p in lit if p[3] > 200]
        if lit:
            rows_lit.append(max(lit, key=lambda p: p[0] + p[1] + p[2]))
    crust = rows_lit[0]
    crust2 = rows_lit[min(3, len(rows_lit) - 1)]
    print(f'  slope crust: fringe rgb{crust[:3]} over rgb{crust2[:3]}')

    add('tree', upscale(src.crop(TREE), SCALE))
    add('hedge', upscale(src.crop(HEDGE), SCALE))
    for key, box in SCATTER.items():
        add(key, upscale(src.crop(box), SCALE))

    for i, box in enumerate([(48, 0, 80, 32), (80, 0, 112, 32), (112, 0, 128, 32)]):
        add(f'moon{i}', upscale(moons_img.crop(box), SCALE))

    # Four enemies, four idle frames each. Frames beyond these are attack and
    # death animations the game has no use for while they are static hazards.
    ENEMY_ROWS = ['grub', 'knight', 'soldier', 'worm']
    enemy_meta = {}
    for row, name in enumerate(ENEMY_ROWS):
        kept = []
        for col in range(4):
            f = enemies_img.crop((col * ENEMY_SRC, row * ENEMY_SRC,
                                  (col + 1) * ENEMY_SRC, (row + 1) * ENEMY_SRC))
            if f.getchannel('A').getbbox() is None:
                continue
            key = f'{name}{len(kept)}'
            add(key, upscale(f, ENEMY_SCALE))
            kept.append(key)
        # Hitbox from the union of the frames' content, so collision matches art.
        boxes = [enemies_img.crop((c * ENEMY_SRC, row * ENEMY_SRC,
                                   (c + 1) * ENEMY_SRC, (row + 1) * ENEMY_SRC))
                 .getchannel('A').getbbox() for c in range(len(kept))]
        bx0 = min(b[0] for b in boxes) * ENEMY_SCALE
        by0 = min(b[1] for b in boxes) * ENEMY_SCALE
        bx1 = max(b[2] for b in boxes) * ENEMY_SCALE
        by1 = max(b[3] for b in boxes) * ENEMY_SCALE
        enemy_meta[name] = {
            'frames': kept,
            'box': [bx0, by0, bx1 - bx0, by1 - by0],
        }
        print(f'  enemy {name:8s} {len(kept)} frames, content {bx1-bx0}x{by1-by0} '
              f'at +{bx0},+{by0} of {ENEMY_SRC*ENEMY_SCALE}px')

    # Shelf pack, tallest first so rows stay tight.
    order = sorted(frames.items(), key=lambda kv: -kv[1].size[1])
    max_w = 1024
    rows = []
    row, row_w, row_h = [], 0, 0
    for key, img in order:
        if row_w + img.size[0] > max_w and row:
            rows.append((row, row_h))
            row, row_w, row_h = [], 0, 0
        row.append((key, img))
        row_w += img.size[0]
        row_h = max(row_h, img.size[1])
    if row:
        rows.append((row, row_h))

    atlas_w = max(sum(i.size[0] for _, i in r) for r, _ in rows)
    atlas_h = sum(h for _, h in rows)
    atlas = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))
    meta = {}
    y = 0
    for r, h in rows:
        x = 0
        for key, img in r:
            atlas.paste(img, (x, y))
            meta[key] = [x, y, img.size[0], img.size[1]]
            x += img.size[0]
        y += h

    path = os.path.join(OUT_DIR, 'world-atlas.png')
    atlas.quantize(colors=200, method=Image.FASTOCTREE, dither=Image.NONE).save(
        path, optimize=True
    )

    manifest = {
        'image': 'world-atlas.png',
        'scale': SCALE,
        'tile': TILE,
        'frames': meta,
        'enemies': enemy_meta,
        'base': list(base),
        'crust': list(crust[:3]),
        'crust2': list(crust2[:3]),
    }
    with open(os.path.join(OUT_DIR, 'world-atlas.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)

    print(f'\natlas {atlas.size[0]}x{atlas.size[1]} -> {path} '
          f'({os.path.getsize(path)/1024:.0f} KB)')


if __name__ == '__main__':
    main()
