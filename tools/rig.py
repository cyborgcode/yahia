"""Generate YAHIA's sprites with outline + shading passes.

Poses are authored once in an 80x96 space and emitted at the game's current
SCALE, so a resolution change is a one-line edit here rather than a redraw.
"""
import math

AUTHORED_SCALE = 4          # the space the poses below are written in
TARGET_SCALE = 3            # must match SCALE in apps/client/src/game/scale.ts
K = TARGET_SCALE / AUTHORED_SCALE
PROBE = max(2, round(3 * K))  # shading probe distance, in target pixels

OUTLINE = 'K'
# material -> (shadow, base, light)
PAL = {
    1: ('H', 'H', 'h'),   # hair
    2: ('d', 'S', 'L'),   # skin, near
    3: ('v', 'T', 'W'),   # shirt
    4: ('q', 'P', 'Q'),   # shorts
    5: ('n', 'B', 'b'),   # shoe, near
    6: ('D', 'D', 'd'),   # skin, far limb — reads as depth
    7: ('N', 'N', 'n'),   # shoe, far
}

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = round(w * K), round(h * K)
        self.m = [[0] * self.w for _ in range(self.h)]

    def get(self, x, y):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return 0
        return self.m[y][x]

    def capsule(self, x0, y0, x1, y1, r0, r1, mat):
        x0, y0, x1, y1 = x0 * K, y0 * K, x1 * K, y1 * K
        r0, r1 = r0 * K, r1 * K
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy or 1e-6
        rmax = max(r0, r1) + 1
        for y in range(max(0, int(min(y0, y1) - rmax)), min(self.h, int(max(y0, y1) + rmax) + 1)):
            for x in range(max(0, int(min(x0, x1) - rmax)), min(self.w, int(max(x0, x1) + rmax) + 1)):
                t = ((x - x0) * dx + (y - y0) * dy) / L2
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                px, py = x0 + dx * t, y0 + dy * t
                r = r0 + (r1 - r0) * t
                if (x - px) ** 2 + (y - py) ** 2 <= r * r:
                    self.m[y][x] = mat

    def ellipse(self, cx, cy, rx, ry, mat):
        cx, cy, rx, ry = cx * K, cy * K, rx * K, ry * K
        for y in range(max(0, int(cy - ry)), min(self.h, int(cy + ry) + 1)):
            for x in range(max(0, int(cx - rx)), min(self.w, int(cx + rx) + 1)):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.m[y][x] = mat

    def limb(self, root, elbow, hand, r0, r1, r2, mat):
        self.capsule(*root, *elbow, r0, r1, mat)
        self.capsule(*elbow, *hand, r1, r2, mat)

    def shade(self, stamps=()):
        """Outline every silhouette edge, light the top of each region, shadow
        its underside and its right flank. Light from the upper left."""
        out = [['.'] * self.w for _ in range(self.h)]
        for y in range(self.h):
            for x in range(self.w):
                m = self.m[y][x]
                if m == 0:
                    continue
                if any(self.get(x + dx, y + dy) == 0
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = OUTLINE
                    continue
                sh, base, li = PAL[m]
                if self.get(x, y - PROBE) != m:
                    out[y][x] = li
                elif self.get(x, y + PROBE) != m or self.get(x + PROBE, y) != m:
                    out[y][x] = sh
                else:
                    out[y][x] = base
        # Curls: scattered highlights so the afro isn't a flat blob.
        for y in range(self.h):
            for x in range(self.w):
                if self.m[y][x] == 1 and out[y][x] != OUTLINE:
                    if (x * 7 + y * 13) % 11 == 0:
                        out[y][x] = 'G'
                    elif (x * 5 + y * 3) % 9 == 0:
                        out[y][x] = 'h'
        for (sx0, sy0, ch) in stamps:
            sx, sy = round(sx0 * K), round(sy0 * K)
            if 0 <= sx < self.w and 0 <= sy < self.h and out[sy][sx] != '.':
                out[sy][sx] = ch
        return [''.join(r) for r in out]

def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

# ---------------------------------------------------------------- upright rig
W, H = 80, 96
HIP_N, HIP_F = (44, 58), (38, 58)
SHO_N, SHO_F = (47, 29), (37, 29)

# Face is stamped after shading: an eye, a brow and a mouth line.
FACE_STAMPS = [
    (49, 11, 'K'), (50, 11, 'K'), (49, 12, 'K'),
    (47, 8, 'K'), (48, 8, 'K'), (49, 8, 'K'),
    (48, 16, 'd'), (49, 16, 'd'),
]

def upright(far_arm, near_arm, far_leg, near_leg):
    c = Canvas(W, H)
    # Far limbs first — they sit behind the torso.
    c.limb(SHO_F, far_arm[0], far_arm[1], 4, 3.4, 3, 6)
    c.capsule(*HIP_F, *far_leg[0], 6, 5, 6)
    c.capsule(*far_leg[0], *far_leg[1], 5, 4, 6)
    c.capsule(*far_leg[1], *far_leg[2], 4.5, 4.5, 7)
    # Near leg, then shorts and shirt over the top of it.
    c.capsule(*HIP_N, *near_leg[0], 6.5, 5.2, 2)
    c.capsule(*near_leg[0], *near_leg[1], 5.2, 4.2, 2)
    c.capsule(*near_leg[1], *near_leg[2], 4.8, 4.8, 5)
    # Shorts are a waist block plus a short leg down each thigh, so they read as
    # shorts rather than a skirt when the legs spread.
    c.capsule(41, 45, 41, 55, 11.5, 10.5, 4)
    c.capsule(*HIP_F, *lerp(HIP_F, far_leg[0], 0.45), 9, 7.5, 4)
    c.capsule(*HIP_N, *lerp(HIP_N, near_leg[0], 0.45), 9.5, 8, 4)
    # Shirt hem sits above the shorts, not over them.
    c.capsule(43, 26, 41, 47, 12.5, 10.5, 3)
    c.capsule(*SHO_F, *lerp(SHO_F, far_arm[0], 0.5), 6.5, 4.8, 3)   # far sleeve
    c.capsule(44, 18, 43, 26, 3.6, 4.6, 2)       # neck
    c.limb(SHO_N, near_arm[0], near_arm[1], 4.2, 3.6, 3.2, 2)
    # Sleeves follow the arm and stop early, so the forearm stays visible.
    c.capsule(*SHO_N, *lerp(SHO_N, near_arm[0], 0.5), 7, 5.2, 3)    # near sleeve
    c.ellipse(40, 9, 11, 10, 1)                  # hair mass
    c.ellipse(46, 11, 8, 8.5, 2)                 # face, offset forward
    c.ellipse(41, 5, 9.5, 6, 1)                  # fringe over the brow
    return c.shade(FACE_STAMPS)

FRAMES = {}
# Contact: near leg reaching forward and planted, far leg pushed off, heel up.
FRAMES['RUN_1'] = upright(
    far_arm=[(28, 38), (32, 48)], near_arm=[(59, 36), (61, 26)],
    far_leg=[(26, 70), (16, 78), (8, 82)], near_leg=[(56, 70), (58, 86), (68, 92)])
# Passing: far knee driven through under the body, foot lifted.
FRAMES['RUN_2'] = upright(
    far_arm=[(34, 38), (38, 46)], near_arm=[(55, 36), (55, 26)],
    far_leg=[(51, 62), (46, 74), (53, 78)], near_leg=[(42, 72), (42, 86), (52, 92)])
# Full stride, arms at their widest — the airborne beat.
FRAMES['RUN_3'] = upright(
    far_arm=[(27, 34), (29, 24)], near_arm=[(59, 38), (61, 49)],
    far_leg=[(24, 68), (12, 78), (4, 82)], near_leg=[(58, 66), (66, 81), (75, 87)])
# Passing, opposite phase: heel kicked up behind.
FRAMES['RUN_4'] = upright(
    far_arm=[(32, 36), (36, 26)], near_arm=[(57, 38), (57, 49)],
    far_leg=[(33, 64), (26, 72), (17, 75)], near_leg=[(44, 72), (44, 86), (54, 92)])
FRAMES['JUMP'] = upright(
    far_arm=[(26, 32), (18, 24)], near_arm=[(59, 32), (67, 24)],
    far_leg=[(30, 66), (26, 78), (18, 82)], near_leg=[(56, 66), (58, 79), (68, 85)])
FRAMES['FALL'] = upright(
    far_arm=[(24, 34), (11, 30)], near_arm=[(60, 34), (73, 30)],
    far_leg=[(28, 72), (20, 86), (12, 92)], near_leg=[(56, 72), (64, 86), (73, 92)])

# ------------------------------------------------------------------ the slide
c = Canvas(96, 56)
c.capsule(36, 30, 22, 38, 4, 3, 6)              # trailing far arm
c.capsule(62, 42, 76, 47, 6, 5, 6)              # far leg
c.capsule(76, 47, 86, 50, 5, 4.5, 6)
c.capsule(86, 50, 92, 51, 4.5, 4.5, 7)
c.capsule(64, 39, 78, 43, 6.5, 5.2, 2)          # near leg, thrown forward
c.capsule(78, 43, 88, 46, 5.2, 4.4, 2)
c.capsule(88, 46, 94, 47, 4.8, 4.8, 5)
c.capsule(52, 36, 66, 41, 10.5, 9.5, 4)         # shorts
c.capsule(31, 28, 52, 36, 13, 10.5, 3)          # torso, angled back
c.capsule(25, 22, 32, 28, 4, 5, 2)              # neck
c.capsule(38, 30, 52, 31, 4.2, 3.4, 2)          # near arm reaching forward
c.capsule(52, 31, 61, 29, 3.4, 3, 2)
c.capsule(40, 30, 47, 31, 6.5, 5, 3)            # sleeve
c.ellipse(17, 14, 10.5, 9.5, 1)
c.ellipse(23, 16, 7.5, 8, 2)
c.ellipse(18, 10, 9, 5.5, 1)
FRAMES['SLIDE'] = c.shade([
    (26, 16, 'K'), (27, 16, 'K'), (26, 17, 'K'),
    (24, 13, 'K'), (25, 13, 'K'), (26, 13, 'K'),
])

# ----------------------------------------------------------------- the corpse
# Face-down and horizontal, after the prone reference. Sized to the collision
# box exactly, so the platform's edges are never ambiguous.
c = Canvas(80, 26)
c.capsule(28, 15, 14, 21, 3.6, 3, 6)            # far arm, flung out
c.capsule(58, 15, 69, 18, 5.5, 4.5, 6)          # far leg
c.capsule(69, 18, 75, 20, 4.5, 4.4, 7)
c.capsule(57, 13, 68, 15, 6, 5, 2)              # near leg
c.capsule(68, 15, 78, 17, 5, 4.6, 5)
c.capsule(45, 12, 58, 14, 9, 8, 4)              # shorts
c.capsule(26, 10, 46, 12, 10, 9, 3)             # torso
c.capsule(31, 13, 36, 16, 6, 4.6, 3)            # sleeve
c.capsule(24, 12, 28, 13, 4.5, 4, 2)            # neck
c.capsule(30, 14, 6, 18, 4, 3, 2)               # near arm flung past the head
c.ellipse(14, 12, 8.5, 7.5, 1)
c.ellipse(17, 14, 6, 6, 2)
FRAMES['CORPSE'] = c.shade([(19, 13, 'K'), (20, 13, 'K')])

DOCS = {
 'RUN_1': 'Contact: near leg reaching forward and planted, far leg pushed off with the heel up.',
 'RUN_2': 'Passing: the far knee driven through under the body, foot lifted.',
 'RUN_3': 'Full stride, arms at their widest — the airborne beat of the cycle.',
 'RUN_4': 'Passing, opposite phase: heel kicked up behind.',
 'JUMP': 'Arms thrown up and out, knees tucked.',
 'FALL': 'Arms wide, legs splayed and trailing.',
 'SLIDE': 'Leaning back, legs thrown forward. Invented — the reference has no slide.',
 'CORPSE': ('Face-down and horizontal, after the prone reference. Sized to the collision\n'
            ' * box exactly, so the platform edges are never ambiguous.'),
}

chunks = []
for name in ['RUN_1','RUN_2','RUN_3','RUN_4','JUMP','FALL','SLIDE','CORPSE']:
    rows = FRAMES[name]
    w = len(rows[0])
    for r in rows:
        assert len(r) == w, (name, len(r))
    body = '\n'.join(f"  '{r}'," for r in rows)
    chunks.append(f"/** {DOCS[name]} */\nconst {name}: readonly string[] = [\n{body}\n];")
open('/tmp/claude-0/-home-user-yahia/9375a87e-b097-580e-a87f-765368f81832/scratchpad/frames.ts','w').write('\n\n'.join(chunks))
for n in FRAMES:
    print(f'{n}: {len(FRAMES[n][0])}x{len(FRAMES[n])}')
