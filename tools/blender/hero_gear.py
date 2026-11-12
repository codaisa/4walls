"""
4Walls — gear for the six heroes rescued in Adventure (affectionate Brazilian parodies).

Each function dresses the shared base body (block head, chunky suit) with hats, props and face
details. Parts are rigid meshes listed per bone in `parts`; build_characters.py skins them.
Coordinates: Blender Z up, the character faces -Y. Head center z = HEAD_Z, half extents HEAD_HALF.

Materials named Suit / Glove / Boot are recolored with the player's color in game; everything
here uses fixed colors so each hero keeps a recognizable costume on any team.
"""

import math

import bmesh
import bpy
from mathutils import Vector

# Filled in by setup(): the helper module (build_characters) and a material cache.
H = None
M = {}


def setup(helpers):
    global H, M
    H = helpers
    M = {}


def mat(name, hexcol, rough=0.5, metal=0.0, coat=0.0, emission=None, strength=0.0):
    """Hero material by name (created once per character build)."""
    if name not in M:
        M[name] = H.material(
            name,
            H.srgb(hexcol),
            roughness=rough,
            metallic=metal,
            coat=coat,
            emission=H.srgb(emission) if emission else None,
            emission_strength=strength,
        )
    return M[name]


# ───────────────────────────── shape helpers ─────────────────────────────


def _obj_from_bm(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    H.activate(o)
    H.assign(o, m)
    return o


def prism(name, pts, depth, m, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.006, smooth=False):
    """2D outline (u, v) in the XZ plane (facing -Y), extruded `depth` along Y, then placed."""
    bm = bmesh.new()
    vs = [bm.verts.new((u, -depth / 2, v)) for u, v in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext["geom"]:
        if isinstance(v, bmesh.types.BMVert):
            v.co.y += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj_from_bm(name, bm, m)
    o.rotation_euler = rot
    o.location = loc
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        b = o.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = "ANGLE"
        H.apply_modifiers(o)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def star_pts(r_out, r_in, n=5, rot=math.pi / 2):
    pts = []
    for i in range(n * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + i * math.pi / n
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def brim_point(rx, ry, z, a, t, inner=0.5, lift_front=0.0, lift_back=0.0, lift_side=0.0, curl=1.8):
    """Position of a point on a brim() surface (angle a, normalized radius t) — to place studs/badges."""
    ca, sa = math.cos(a), math.sin(a)
    f = (max(0.0, t - inner) / (1 - inner)) ** curl
    lift = lift_front * max(0.0, -sa) ** 2 + lift_back * max(0.0, sa) ** 2 + lift_side * ca * ca
    return (rx * t * ca, ry * t * sa, z + f * lift)


def brim(name, m, rx, ry, z, inner=0.5, lift_front=0.0, lift_back=0.0, lift_side=0.0, curl=1.8, wave=0.0, wave_n=36, segs=72, rings=6, thickness=0.022, y_off=0.0):
    """Hat brim: a ring of quads (hole in the middle for the crown), edges lifted per side."""
    bm = bmesh.new()
    grid = []
    for ri in range(rings + 1):
        t = inner + (1 - inner) * ri / rings
        row = []
        for si in range(segs):
            a = 2 * math.pi * si / segs
            ca, sa = math.cos(a), math.sin(a)
            w = 1 + (wave * math.sin(a * wave_n) * ((t - inner) / (1 - inner)) if wave else 0)
            x = rx * t * ca * w
            y = ry * t * sa * w + y_off
            f = ((t - inner) / (1 - inner)) ** curl
            front = max(0.0, -sa) ** 2
            back = max(0.0, sa) ** 2
            side = ca * ca
            row.append(bm.verts.new((x, y, z + f * (lift_front * front + lift_back * back + lift_side * side))))
        grid.append(row)
    for ri in range(rings):
        for si in range(segs):
            a, b = grid[ri][si], grid[ri][(si + 1) % segs]
            c, d = grid[ri + 1][(si + 1) % segs], grid[ri + 1][si]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = _obj_from_bm(name, bm, m)
    sol = o.modifiers.new("Solid", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 0
    sub = o.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    H.apply_modifiers(o)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def dome(name, m, rx, ry, rz, z, y=0.0, x=0.0, cut=0.0):
    """Upper half of an ellipsoid (hat crowns, hair caps)."""
    o = H.uv_sphere(name, 1.0, (x, y, z), scale=(rx, ry, rz), mat=m, segments=48, rings=24)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut - 0.001], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    sol = o.modifiers.new("Solid", "SOLIDIFY")
    sol.thickness = 0.015
    H.apply_modifiers(o)
    return o


def fine_shell(name, half, loc, m, keep, thickness=0.012, bevel=0.17, taper=0.0):
    """Like shell_slice, on a densely subdivided box so thin bands keep their faces."""
    o = H.rounded_box(name, half, loc, m, bevel=bevel, subdiv=4, taper=taper)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    mod = o.modifiers.new("Solid", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 1.0
    H.apply_modifiers(o)
    return o


def facing(name, maker, at, direction):
    """Orient an object built along +Z so that it points along `direction`, centered at `at`."""
    o = maker()
    q = Vector(direction).normalized().to_track_quat("Z", "Y")
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = q
    o.location = at
    H.activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.name = name
    return o


def mouth(head, parts, cz=0.6, w=0.22, h=0.075, bend=3.2, teeth=(-0.06, -0.02, 0.02, 0.06), gap=None):
    """A big cartoon grin under the pill eyes, with optional individual teeth (and a gap)."""
    smile = -abs(bend)  # face_decal bends the shape down at the sides for positive values
    parts["head"].append(H.face_decal("Mouth", head, mat("Mouth", "#5a1622", rough=0.6), 0, cz, w, h, n=2.4, bend=smile))
    parts["head"].append(H.face_decal("Tongue", head, mat("Tongue", "#ff6f86", rough=0.6), 0.02, cz - h * 0.22, w * 0.42, h * 0.38, n=2.2, thickness=0.017))
    white = mat("Teeth", "#fffaf0", rough=0.3, coat=0.5)
    for i, x in enumerate(teeth):
        if gap is not None and i == gap:
            continue
        parts["head"].append(H.face_decal(f"Tooth{i}", head, white, x, cz + h / 2 - 0.017 - smile * x * x, 0.034, 0.028, n=3.0, thickness=0.02))


# ───────────────────────────── the heroes ─────────────────────────────


def bombzaga(mats, parts):
    """Luiz Bombzaga — leather cowboy hat with a star, accordion on the chest, red neckerchief."""
    hz = H.HEAD_Z
    head = parts["head"][0]
    leather = mat("HatLeather", "#8a5530", rough=0.7, coat=0.15)
    dark = mat("LeatherDark", "#5a3418", rough=0.75)
    gold = mats["Gold"]

    # Hat: dome crown + half-moon brim raised front and back (chapéu de couro de vaqueiro).
    parts["head"].append(dome("HatCrown", leather, 0.25, 0.235, 0.22, hz + 0.27))
    parts["head"].append(H.cylinder("HatBand", 0.253, 0.253, 0.05, (0, 0, hz + 0.3), dark, verts=48))
    B = dict(inner=0.5, lift_front=0.42, lift_back=0.3, lift_side=-0.03, curl=2.0)
    parts["head"].append(brim("HatBrim", leather, 0.48, 0.42, hz + 0.27, **B))
    # Golden star standing on the front fold, gold studs along its rim.
    sx, sy, sz = brim_point(0.48, 0.42, hz + 0.27, -math.pi / 2, 0.86, **B)
    parts["head"].append(prism("HatStar", star_pts(0.075, 0.032), 0.02, gold, loc=(sx, sy - 0.03, sz + 0.01), rot=(math.radians(-40), 0, 0)))
    for i in range(11):
        a = math.pi * (1.12 + 0.76 * i / 10)
        x, y, z = brim_point(0.48, 0.42, hz + 0.27, a, 0.97, **B)
        parts["head"].append(H.uv_sphere(f"Stud{i}", 0.013, (x, y - 0.012, z + 0.01), mat=gold, segments=10, rings=6))
    # Diamond pattern on the band.
    for i in range(12):
        a = 2 * math.pi * i / 12
        parts["head"].append(H.uv_sphere(f"BandGem{i}", 0.016, (0.258 * math.cos(a), 0.258 * math.sin(a), hz + 0.3), scale=(1, 1, 1.5), mat=gold if i % 2 else mats["Spark"], segments=8, rings=6))

    # Neckerchief (lenço) with white dots.
    red = mat("Kerchief", "#d6262b", rough=0.6)
    parts.setdefault("chest", []).append(prism("Kerchief", [(-0.13, 0.0), (0.13, 0.0), (0.0, -0.13)], 0.03, red, loc=(0, -0.2, 0.5), rot=(math.radians(-18), 0, 0)))
    parts["chest"].append(H.uv_sphere("KerchiefKnot", 0.03, (0, -0.19, 0.5), mat=red))
    for i, (x, z) in enumerate(((-0.05, 0.47), (0.04, 0.46), (0.0, 0.42))):
        parts["chest"].append(H.uv_sphere(f"Dot{i}", 0.009, (x, -0.225, z), mat=mat("White", "#fffaf0", rough=0.4), segments=8, rings=6))

    # Leather vest (gibão) around the torso, open at the front.
    vest = H.cylinder("Gibao", 0.2, 0.18, 0.24, (0, 0, 0.37), dark, verts=40)
    bm = bmesh.new()
    bm.from_mesh(vest.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.12 and abs(v.co.x) < 0.075], context="VERTS")
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.9], context="FACES")
    bm.to_mesh(vest.data)
    bm.free()
    s = vest.modifiers.new("Solid", "SOLIDIFY")
    s.thickness = 0.018
    H.apply_modifiers(vest)
    parts["chest"].append(vest)

    # Accordion (sanfona) held on the chest: two lacquered ends and striped bellows.
    lacquer = mat("Lacquer", "#b3121f", rough=0.18, coat=1.0)
    pearl = mat("Pearl", "#f4ecff", rough=0.15, coat=1.0)
    keyb = mat("KeyBlack", "#16121c", rough=0.3)
    y0, z0 = -0.25, 0.36
    for side, x in (("L", -0.18), ("R", 0.18)):
        parts["chest"].append(H.rounded_box(f"AccEnd{side}", (0.045, 0.07, 0.12), (x, y0, z0), lacquer, bevel=0.015, subdiv=1))
        parts["chest"].append(H.rounded_box(f"AccTrim{side}", (0.047, 0.072, 0.008), (x, y0, z0 + 0.11), gold, bevel=0.004, subdiv=0))
        parts["chest"].append(H.rounded_box(f"AccTrimB{side}", (0.047, 0.072, 0.008), (x, y0, z0 - 0.11), gold, bevel=0.004, subdiv=0))
    for i in range(7):
        x = -0.12 + i * 0.04
        parts["chest"].append(H.rounded_box(f"Bellow{i}", (0.017, 0.064 if i % 2 else 0.058, 0.108), (x, y0, z0), red if i % 2 else pearl, bevel=0.008, subdiv=0))
    # Piano keys on the right end, pearl buttons on the left end.
    for k in range(7):
        z = z0 + 0.09 - k * 0.03
        parts["chest"].append(H.rounded_box(f"Key{k}", (0.018, 0.012, 0.012), (0.215, y0 - 0.06, z), pearl, bevel=0.003, subdiv=0))
        if k % 3 != 2 and k < 6:
            parts["chest"].append(H.rounded_box(f"KeyB{k}", (0.012, 0.008, 0.007), (0.21, y0 - 0.075, z - 0.015), keyb, bevel=0.002, subdiv=0))
    for r in range(4):
        for c in range(2):
            parts["chest"].append(H.uv_sphere(f"Btn{r}{c}", 0.011, (-0.23, y0 - 0.03 + c * 0.04, z0 + 0.075 - r * 0.05), mat=pearl, segments=8, rings=6))
    # Straps over the shoulders.
    for s_, x in ((1, 0.12), (-1, -0.12)):
        parts["chest"].append(H.tube(f"AccStrap{s_}", [(x, y0 + 0.05, z0 + 0.1), (x * 1.05, -0.05, 0.53), (x, 0.14, 0.42)], 0.012, dark))


def tiringao(mats, parts):
    """Tiringão — frayed straw hat with a flower, a gap-toothed grin, suspenders and a toothpick."""
    hz = H.HEAD_Z
    head = parts["head"][0]
    straw = mat("Straw", "#e2c272", rough=0.9)
    straw_dark = mat("StrawDark", "#b38f45", rough=0.9)
    ribbon = mat("Ribbon", "#d9481f", rough=0.5)

    parts["head"].append(H.cylinder("StrawCrown", 0.235, 0.205, 0.17, (0, 0, hz + 0.36), straw, verts=40, bevel=0.03))
    for i, z in enumerate((hz + 0.33, hz + 0.37, hz + 0.41)):
        r = 0.232 - (z - hz - 0.29) * 0.18
        parts["head"].append(H.torus(f"Weave{i}", r, 0.006, (0, 0, z), straw_dark))
    parts["head"].append(H.cylinder("StrawBand", 0.24, 0.236, 0.04, (0, 0, hz + 0.3), ribbon, verts=40))
    parts["head"].append(brim("StrawBrim", straw, 0.56, 0.53, hz + 0.29, inner=0.42, lift_front=-0.04, lift_back=0.07, lift_side=0.05, curl=1.4, wave=0.035, wave_n=44))
    # Sunflower tucked in the band.
    petal = mat("Petal", "#ffc928", rough=0.5)
    fx, fy, fz = -0.15, -0.205, hz + 0.31
    for i in range(10):
        a = 2 * math.pi * i / 10
        parts["head"].append(H.uv_sphere(f"Petal{i}", 0.022, (fx + 0.035 * math.cos(a) * 0.7, fy - 0.01, fz + 0.035 * math.sin(a)), scale=(1, 0.5, 1.6), rot=(0, a + math.pi / 2, 0), mat=petal, segments=10, rings=6))
    parts["head"].append(H.uv_sphere("FlowerCore", 0.022, (fx, fy - 0.02, fz), scale=(1, 0.6, 1), mat=mats["Leather"]))

    # Gap-toothed grin, rosy cheeks and a toothpick.
    mouth(head, parts, cz=0.6, w=0.24, h=0.065, bend=2.6, teeth=(-0.063, -0.021, 0.021, 0.063), gap=2)
    for s in (1, -1):
        parts["head"].append(H.face_decal(f"Cheek{s}", head, mats["Blush"], 0.215 * s, 0.66, 0.08, 0.05, n=2.0))
    parts["head"].append(H.cylinder("Toothpick", 0.006, 0.004, 0.13, (0.15, -0.32, 0.6), mat("Wood", "#d6b27a", rough=0.8), verts=8, rot=(math.radians(80), 0, math.radians(-35))))

    # Suspenders with brass buttons, and a big shirt collar.
    strap = mat("Suspender", "#6b2d1a", rough=0.6)
    brass = mats["Gold"]
    for s in (1, -1):
        x = 0.08 * s
        parts.setdefault("chest", []).append(H.tube(f"Suspender{s}", [(x, -0.165, 0.26), (x * 1.2, -0.17, 0.42), (x * 1.3, 0.0, 0.53), (x * 1.2, 0.17, 0.42), (x, 0.165, 0.26)], 0.014, strap))
        parts["chest"].append(H.uv_sphere(f"SusBtn{s}", 0.017, (x, -0.18, 0.27), mat=brass, segments=10, rings=6))
    collar = mat("Collar", "#f3ead2", rough=0.7)
    for s in (1, -1):
        parts["chest"].append(prism(f"CollarTip{s}", [(0.0, 0.0), (0.11 * s, 0.0), (0.05 * s, -0.08)], 0.02, collar, loc=(0.0, -0.17, 0.51), rot=(math.radians(-30), 0, 0)))


def bombiao(mats, parts):
    """Bombião — half-moon cangaceiro hat with a golden star and coins, round glasses,
    crossed cartridge belts, an embroidered bag and a blunderbuss on the back."""
    hz = H.HEAD_Z
    leather = mat("CangaLeather", "#7a4a24", rough=0.65, coat=0.2)
    dark = mat("LeatherDark", "#4a2a14", rough=0.75)
    gold = mats["Gold"]

    parts["head"].append(dome("CangaCrown", leather, 0.24, 0.22, 0.16, hz + 0.27))
    # Front and back half-moon plates, curved around the head, pointed side tips.
    W, BEND = 0.52, 0.95

    def plate_point(x, zl, y0, tilt, out=0.0):
        """Point on a plate surface (x across, zl up from the brim line), `out` = outward offset."""
        sgn = 1 if y0 < 0 else -1
        y = y0 + sgn * BEND * x * x - sgn * out
        ct, st = math.cos(tilt), math.sin(tilt)
        return (x, y * ct - zl * st, y * st + zl * ct + hz + 0.27)

    def crescent(name, top, y0, tilt):
        """Half-moon plate as a clean quad grid (bottom edge -> top arc), bent around the head."""
        cols, rows = 40, 8
        bm = bmesh.new()
        grid = []
        for j in range(rows + 1):
            row = []
            for i in range(cols + 1):
                u = -1 + 2 * i / cols
                x = W * u
                lo = -0.05 * (1 - u * u)
                hi = top * max(0.0, 1 - u * u) ** (0.5 * 0.85)
                zl = lo + (hi - lo) * j / rows
                row.append(bm.verts.new(plate_point(x, zl, y0, tilt)))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = _obj_from_bm(name, bm, leather)
        sol = o.modifiers.new("Solid", "SOLIDIFY")
        sol.thickness = 0.024
        sol.offset = 0
        H.apply_modifiers(o)
        for p in o.data.polygons:
            p.use_smooth = True
        return o

    FT = math.radians(12)
    parts["head"].append(crescent("CangaFront", 0.31, -0.22, FT))
    parts["head"].append(crescent("CangaBack", 0.22, 0.2, -math.radians(14)))
    # Six-pointed golden star (signo de Salomao) in the middle of the front plate.
    sx, sy, sz = plate_point(0.0, 0.16, -0.22, FT, out=0.022)
    parts["head"].append(prism("Salomao", star_pts(0.085, 0.048, n=6), 0.014, gold, loc=(sx, sy, sz), rot=(FT, 0, 0)))
    cx_, cy_, cz_ = plate_point(0.0, 0.16, -0.22, FT, out=0.032)
    parts["head"].append(H.cylinder("StarCenter", 0.024, 0.024, 0.012, (cx_, cy_, cz_), mat("Ruby", "#e0193a", rough=0.1, coat=1.0, emission="#ff2040", strength=0.6), verts=16, rot=(math.radians(90) + FT, 0, 0)))
    # Gold coins following the front arc, flat on the leather.
    for i in range(11):
        a = math.pi * (0.1 + 0.8 * i / 10)
        x = (W - 0.07) * math.cos(a)
        zl = (0.31 - 0.06) * math.sin(a) ** 0.85
        px, py, pz = plate_point(x, zl, -0.22, FT, out=0.018)
        yaw = math.atan(2 * BEND * x)
        parts["head"].append(H.cylinder(f"Coin{i}", 0.024, 0.024, 0.008, (px, py, pz), gold, verts=20, rot=(math.radians(90) + FT, 0, -yaw)))
    # Leather lacing along the plate edge.
    for i in range(14):
        x = -W + 0.06 + (2 * W - 0.12) * i / 13
        px, py, pz = plate_point(x, -0.02 * (1 - (x / W) ** 2), -0.22, FT, out=0.016)
        parts["head"].append(H.uv_sphere(f"Lace{i}", 0.01, (px, py, pz), mat=dark, segments=8, rings=6))

    # Round glasses over the pill eyes.
    rim = mat("GlassRim", "#c9a24a", rough=0.25, metal=0.9)
    for s in (1, -1):
        r = H.torus(f"Rim{s}", 0.1, 0.011, (0.112 * s, -0.305, 0.775), rim, rot=(math.radians(90), 0, 0), scale=(1, 1, 1.32))
        parts["head"].append(r)
        parts["head"].append(H.tube(f"Temple{s}", [(0.21 * s, -0.3, 0.8), (0.32 * s, -0.2, 0.8), (0.33 * s, 0.05, 0.78)], 0.007, rim))
    parts["head"].append(H.tube("Bridge", [(-0.02, -0.31, 0.8), (0.0, -0.32, 0.815), (0.02, -0.31, 0.8)], 0.008, rim))

    # Red neckerchief.
    red = mat("Kerchief", "#c81d25", rough=0.6)
    parts.setdefault("chest", []).append(prism("Kerchief", [(-0.12, 0.0), (0.12, 0.0), (0.0, -0.12)], 0.03, red, loc=(0, -0.2, 0.5), rot=(math.radians(-18), 0, 0)))

    # Crossed cartridge belts with brass rounds, front and back.
    belt = mat("Bandolier", "#5e3a1c", rough=0.7)
    for s in (1, -1):
        pts = [(0.15 * s, -0.08, 0.5), (0.06 * s, -0.19, 0.4), (-0.06 * s, -0.19, 0.3), (-0.16 * s, -0.08, 0.22)]
        parts["chest"].append(H.tube(f"Bandolier{s}", pts, 0.022, belt))
        parts["chest"].append(H.tube(f"BandolierBack{s}", [(x, -y, z) for x, y, z in pts], 0.022, belt))
        for k in range(5):
            t = (k + 0.5) / 5
            x = (0.13 - 0.27 * t) * s
            z = 0.48 - 0.24 * t
            y = -0.2 + 0.06 * abs(x) / 0.15
            parts["chest"].append(H.cylinder(f"Round{s}{k}", 0.009, 0.009, 0.05, (x, y, z), gold, verts=10, rot=(0, math.radians(35 * s), 0)))

    # Embroidered bag (embornal) at the hip.
    bag = mat("Embornal", "#e3d3a8", rough=0.85)
    parts.setdefault("hips", []).append(H.rounded_box("Embornal", (0.065, 0.035, 0.07), (-0.2, -0.04, 0.2), bag, bevel=0.02, subdiv=1))
    for i, c in enumerate(("#d6262b", "#ffc928", "#1f8a3c")):
        parts["hips"].append(H.rounded_box(f"Embroid{i}", (0.067, 0.037, 0.007), (-0.2, -0.04, 0.23 - i * 0.022), mat(f"Embroid{i}", c, rough=0.6), bevel=0.003, subdiv=0))
    parts["hips"].append(H.tube("BagStrap", [(-0.2, -0.04, 0.26), (-0.05, -0.18, 0.42), (0.12, -0.1, 0.5)], 0.01, belt))

    # Blunderbuss (bacamarte) slung across the back: wooden stock, flared iron barrel.
    wood = mat("GunWood", "#6b3a1c", rough=0.6, coat=0.3)
    iron = mat("GunIron", "#3b3a44", rough=0.35, metal=0.8)
    gun = []
    gun.append(H.rounded_box("Stock", (0.035, 0.026, 0.11), (0, 0, -0.16), wood, bevel=0.014, subdiv=1))
    gun.append(H.cylinder("Barrel", 0.024, 0.024, 0.32, (0, 0, 0.1), iron, verts=16))
    gun.append(H.cylinder("Muzzle", 0.024, 0.075, 0.09, (0, 0, 0.3), iron, verts=24))
    for k, z in enumerate((-0.03, 0.12)):
        gun.append(H.torus(f"Band{k}", 0.028, 0.007, (0, 0, z), gold))
    for o in gun:
        o.rotation_euler = (0, math.radians(-62), 0)
        H.activate(o)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for v in o.data.vertices:
            v.co += Vector((-0.06, 0.215, 0.3))
    parts["chest"] += gun


def reipelota(mats, parts):
    """Rei Pelota — tilted golden crown, green collar and a big 10 on the back, striped socks and
    a classic black-and-white ball at his feet."""
    hz = H.HEAD_Z
    gold = mats["Gold"]
    green = mat("Green", "#0a9b45", rough=0.45, coat=0.4)
    ruby = mat("Ruby", "#e0193a", rough=0.1, coat=1.0, emission="#ff2040", strength=0.6)
    emerald = mat("Emerald", "#16c45f", rough=0.1, coat=1.0, emission="#20ff70", strength=0.5)

    crown = []
    crown.append(H.cylinder("CrownRing", 0.17, 0.18, 0.08, (0, 0, 0.0), gold, verts=40, bevel=0.006))
    for i in range(6):
        a = 2 * math.pi * i / 6
        x, y = 0.17 * math.cos(a), 0.17 * math.sin(a)
        crown.append(H.cylinder(f"Spike{i}", 0.04, 0.0, 0.1, (x, y, 0.09), gold, verts=8))
        crown.append(H.uv_sphere(f"SpikeBall{i}", 0.016, (x * 1.0, y * 1.0, 0.145), mat=gold, segments=10, rings=6))
        crown.append(H.uv_sphere(f"Gem{i}", 0.02, (x * 1.06, y * 1.06, 0.0), scale=(1, 1, 1.3), mat=ruby if i % 2 else emerald, segments=12, rings=8))
    for o in crown:
        H.activate(o)
        o.rotation_euler = (math.radians(8), math.radians(-14), 0)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for v in o.data.vertices:
            v.co += Vector((0.06, 0.02, hz + 0.33))
    parts["head"] += crown

    parts.setdefault("chest", []).append(H.torus("JerseyCollar", 0.13, 0.03, (0, 0, 0.5), green, scale=(1, 0.95, 1)))
    # "10" on the back.
    parts["chest"].append(H.rounded_box("Num1", (0.012, 0.012, 0.06), (0.055, 0.175, 0.37), green, bevel=0.006, subdiv=0))
    parts["chest"].append(H.torus("Num0", 0.035, 0.012, (-0.03, 0.175, 0.37), green, rot=(math.radians(90), 0, 0), scale=(1, 1, 1.6)))
    # Crest on the chest: green shield, golden star.
    parts["chest"].append(prism("Crest", [(-0.035, 0.03), (0.035, 0.03), (0.035, -0.01), (0.0, -0.045), (-0.035, -0.01)], 0.012, green, loc=(0.075, -0.175, 0.42), rot=(0, 0, 0)))
    parts["chest"].append(prism("CrestStar", star_pts(0.022, 0.009), 0.008, gold, loc=(0.075, -0.185, 0.42)))

    # Striped socks.
    white = mat("White", "#fffaf0", rough=0.4)
    for side, s in (("L", 1), ("R", -1)):
        parts.setdefault(f"shin.{side}", []).append(H.torus(f"Sock{side}", 0.075, 0.022, (0.095 * s, 0.0, 0.12), white))
        parts[f"shin.{side}"].append(H.torus(f"SockStripe{side}", 0.074, 0.012, (0.095 * s, 0.0, 0.145), green))

    # The ball at his feet: white sphere with 12 black pentagon patches.
    ball_c = Vector((0.15, -0.27, 0.09))
    r = 0.085
    ball = [H.uv_sphere("Ball", r, tuple(ball_c), mat=white, segments=32, rings=16)]
    black = mat("BallBlack", "#17131c", rough=0.4)
    phi = (1 + 5 ** 0.5) / 2
    dirs = [(0, 1, phi), (0, -1, phi), (0, 1, -phi), (0, -1, -phi), (1, phi, 0), (-1, phi, 0), (1, -phi, 0), (-1, -phi, 0), (phi, 0, 1), (-phi, 0, 1), (phi, 0, -1), (-phi, 0, -1)]
    for i, d in enumerate(dirs):
        dv = Vector(d).normalized()
        ball.append(facing(f"Patch{i}", lambda: H.cylinder("p", 0.032, 0.032, 0.012, (0, 0, 0), black, verts=5), tuple(ball_c + dv * (r - 0.002)), tuple(dv)))
    parts.setdefault("root", []).extend(ball)


def senha(mats, parts):
    """Ayrton Senha — yellow full-face racing helmet with green and blue stripes, a spoiler,
    racing collar with a flag pin, and a checkered flag in hand."""
    hz = H.HEAD_Z
    hw, hd, hh = H.HEAD_HALF
    yellow = mat("HelmetYellow", "#ffd400", rough=0.15, coat=1.0)
    green = mat("StripeGreen", "#0a8a3c", rough=0.2, coat=1.0)
    blue = mat("StripeBlue", "#1f3fbf", rough=0.2, coat=1.0)
    m = 0.035  # helmet is a shell around the block head

    def opening(c):
        return c.y < -0.12 and abs(c.x) < hw - 0.04 and -0.2 < c.z < 0.11

    parts["head"].append(H.shell_slice("Helmet", (hw + m, hd + m, hh + m), (0, 0, hz), yellow, lambda c: not opening(c) and c.z > -hh + 0.02, thickness=0.02, bevel=H.HEAD_BEVEL + 0.02, taper=H.HEAD_TAPER))
    big = (hw + m, hd + m, hh + m)
    bev = H.HEAD_BEVEL + 0.02
    parts["head"].append(fine_shell("StripeG", big, (0, 0, hz), green, lambda c: 0.1 < c.z < 0.155, bevel=bev, taper=H.HEAD_TAPER))
    parts["head"].append(fine_shell("StripeB", big, (0, 0, hz), blue, lambda c: 0.155 < c.z < 0.205, bevel=bev, taper=H.HEAD_TAPER))
    parts["head"].append(fine_shell("ChinStripe", big, (0, 0, hz), green, lambda c: -0.245 < c.z < -0.205 and c.y < 0.05, bevel=bev, taper=H.HEAD_TAPER))
    # Raised smoked visor across the top of the opening.
    visor = mat("Visor", "#2a3550", rough=0.05, coat=1.0, emission="#4060a0", strength=0.25)
    parts["head"].append(fine_shell("Visor", (hw + m + 0.012, hd + m + 0.012, hh + m + 0.012), (0, 0, hz), visor, lambda c: c.y < -0.1 and 0.205 < c.z < 0.25 and abs(c.x) < hw - 0.05, bevel=bev, taper=H.HEAD_TAPER))
    # Rear spoiler and air vents.
    parts["head"].append(H.rounded_box("Spoiler", (0.16, 0.03, 0.012), (0, hd + m + 0.02, hz + 0.27), mats["Dark"], bevel=0.008, subdiv=1))
    for s in (1, -1):
        parts["head"].append(H.rounded_box(f"SpoilerFin{s}", (0.008, 0.03, 0.03), (0.15 * s, hd + m + 0.02, hz + 0.25), mats["Dark"], bevel=0.004, subdiv=0))
        parts["head"].append(H.rounded_box(f"Vent{s}", (0.03, 0.006, 0.008), (0.1 * s, -hd - m - 0.005, hz - 0.255), mats["Dark"], bevel=0.003, subdiv=0))

    # Racing collar + flag pin (green field, yellow diamond, blue disc).
    white = mat("White", "#fffaf0", rough=0.4)
    parts.setdefault("chest", []).append(H.torus("RaceCollar", 0.13, 0.032, (0, 0, 0.5), white, scale=(1, 0.95, 1)))
    parts["chest"].append(H.rounded_box("PinField", (0.035, 0.006, 0.024), (-0.07, -0.175, 0.42), green, bevel=0.003, subdiv=0))
    parts["chest"].append(prism("PinDiamond", [(0.028, 0), (0, 0.018), (-0.028, 0), (0, -0.018)], 0.006, mat("FlagYellow", "#ffd400", rough=0.3), loc=(-0.07, -0.182, 0.42), bevel=0))
    parts["chest"].append(H.cylinder("PinDisc", 0.011, 0.011, 0.006, (-0.07, -0.187, 0.42), blue, verts=16, rot=(math.radians(90), 0, 0)))
    # Sponsor-free patches on the belly.
    parts["chest"].append(H.rounded_box("Patch", (0.05, 0.006, 0.018), (0.04, -0.172, 0.33), white, bevel=0.004, subdiv=0))

    # Checkered flag in the right hand.
    pole = mats["Dark"]
    hx, hy, hzz = -0.32, -0.05, 0.27
    flag = [H.cylinder("FlagPole", 0.009, 0.009, 0.5, (hx, hy, hzz + 0.22), pole, verts=10)]
    blackc = mat("Check", "#121018", rough=0.6)
    for i in range(5):
        for j in range(3):
            x = hx - 0.025 - i * 0.04
            z = hzz + 0.44 - j * 0.04 + 0.012 * math.sin(i * 1.3)
            flag.append(H.rounded_box(f"Sq{i}{j}", (0.02, 0.004, 0.02), (x, hy + 0.006 * math.sin(i * 1.7), z), blackc if (i + j) % 2 else white, bevel=0.002, subdiv=0))
    parts.setdefault("hand.R", []).extend(flag)


def silvio(mats, parts):
    """Silvio Bombos — glossy slicked-back hair, a showman's smile, tuxedo jacket with a white
    shirt and golden bow tie, the famous chest microphone and a money paper plane."""
    hz = H.HEAD_Z
    hw, hd, hh = H.HEAD_HALF
    head = parts["head"][0]
    hair = mat("Hair", "#2a1a12", rough=0.25, coat=0.9)
    m = 0.018

    parts["head"].append(H.shell_slice("HairCap", (hw + m, hd + m, hh + m), (0, 0, hz), hair, lambda c: c.z > 0.19 or (c.y > 0.02 and c.z > -0.06) or (abs(c.x) > hw - 0.02 and c.z > 0.1 and c.y > -0.12), thickness=0.03, bevel=H.HEAD_BEVEL, taper=H.HEAD_TAPER))
    # Pompadour roll at the front and comb lines going back.
    parts["head"].append(H.tube("Pompadour", [(-0.22, -0.19, hz + 0.27), (0.0, -0.27, hz + 0.31), (0.22, -0.19, hz + 0.27)], 0.04, hair))
    for i, x in enumerate((-0.12, 0.0, 0.12)):
        parts["head"].append(H.tube(f"Comb{i}", [(x, -0.2, hz + 0.31), (x * 1.05, 0.0, hz + 0.33), (x * 1.1, 0.22, hz + 0.27)], 0.008, mat("HairShine", "#5a3a26", rough=0.2, coat=1.0)))
    # Sideburns.
    for s in (1, -1):
        parts["head"].append(H.rounded_box(f"Sideburn{s}", (0.012, 0.04, 0.06), ((hw + 0.012) * s, -0.04, hz + 0.08), hair, bevel=0.01, subdiv=1))

    # The big TV smile.
    mouth(head, parts, cz=0.605, w=0.23, h=0.07, bend=3.0, teeth=(-0.068, -0.034, 0.0, 0.034, 0.068))

    # Tuxedo jacket (open front) over the suit, white shirt, gold bow tie.
    jacket = mat("Jacket", "#1b2440", rough=0.45, coat=0.3)
    j = H.cylinder("Jacket", 0.195, 0.178, 0.27, (0, 0, 0.36), jacket, verts=40)
    bm = bmesh.new()
    bm.from_mesh(j.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.1 and abs(v.co.x) < 0.07], context="VERTS")
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.9], context="FACES")
    bm.to_mesh(j.data)
    bm.free()
    sol = j.modifiers.new("Solid", "SOLIDIFY")
    sol.thickness = 0.018
    H.apply_modifiers(j)
    parts.setdefault("chest", []).append(j)
    satin = mat("Satin", "#0d1222", rough=0.15, coat=1.0)
    for s in (1, -1):
        parts["chest"].append(prism(f"Lapel{s}", [(0.0, 0.0), (0.07 * s, 0.0), (0.02 * s, -0.17)], 0.012, satin, loc=(0.025 * s, -0.19, 0.5), rot=(math.radians(-8), 0, 0)))
    white = mat("Shirt", "#fbf8f0", rough=0.5)
    parts["chest"].append(H.rounded_box("ShirtFront", (0.055, 0.01, 0.12), (0, -0.168, 0.37), white, bevel=0.01, subdiv=1))
    for i in range(3):
        parts["chest"].append(H.uv_sphere(f"Stud{i}", 0.008, (0, -0.18, 0.43 - i * 0.05), mat=satin, segments=8, rings=6))
    gold = mat("BowGold", "#f2c230", rough=0.2, metal=0.7, coat=0.8, emission="#ffb020", strength=0.2)
    for s in (1, -1):
        parts["chest"].append(prism(f"Bow{s}", [(0.0, 0.0), (0.065 * s, 0.035), (0.065 * s, -0.035)], 0.03, gold, loc=(0, -0.19, 0.49), bevel=0.008))
    parts["chest"].append(H.uv_sphere("BowKnot", 0.02, (0, -0.205, 0.49), mat=gold))

    # The chest microphone on its cord.
    silver = mat("MicSilver", "#c9ccd6", rough=0.2, metal=0.9)
    grille = mat("MicGrille", "#2a2a33", rough=0.5, metal=0.6)
    parts["chest"].append(H.torus("MicCord", 0.135, 0.006, (0, -0.01, 0.5), mats["Dark"], scale=(1, 1.05, 1)))
    parts["chest"].append(H.tube("MicDrop", [(0.06, -0.14, 0.5), (0.075, -0.2, 0.45), (0.085, -0.205, 0.4)], 0.005, mats["Dark"]))
    parts["chest"].append(H.cylinder("MicBody", 0.016, 0.022, 0.1, (0.085, -0.21, 0.35), silver, verts=16))
    parts["chest"].append(H.uv_sphere("MicHead", 0.03, (0.085, -0.21, 0.41), mat=grille))

    # A paper plane folded from a green banknote.
    money = mat("Money", "#7cc46a", rough=0.7)
    money_d = mat("MoneyInk", "#2f7a3a", rough=0.7)
    hx, hy, hzz = -0.34, -0.1, 0.36
    L = 0.22
    plane = [
        prism("PlaneL", [(0.0, 0.0), (L, 0.0), (0.0, 0.09)], 0.005, money, loc=(hx, hy, hzz), rot=(math.radians(80), 0, math.radians(90)), bevel=0),
        prism("PlaneR", [(0.0, 0.0), (L, 0.0), (0.0, -0.09)], 0.005, money, loc=(hx, hy, hzz), rot=(math.radians(100), 0, math.radians(90)), bevel=0),
        prism("PlaneKeel", [(0.0, 0.0), (L, 0.0), (0.03, -0.045)], 0.005, money_d, loc=(hx, hy, hzz), rot=(0, 0, math.radians(90)), bevel=0),
    ]
    parts.setdefault("hand.R", []).extend(plane)


GEAR = {
    "bombzaga": bombzaga,
    "tiringao": tiringao,
    "bombiao": bombiao,
    "reipelota": reipelota,
    "senha": senha,
    "silvio": silvio,
}
