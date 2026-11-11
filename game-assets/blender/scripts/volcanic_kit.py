"""
4Walls — Volcanic Lands kit + Enchanted Forest transition pieces (Phase 1 environment).

Every asset: 1 tile = 1 unit, origin at the tile center, resting on Z = 0, exported as its own GLB.
Textures: CC0 sources (Poly Haven / ambientCG) adapted to the cartoon direction by
fw_lib.stylize_texture (originals untouched in textures/downloaded/).

Run standalone:  blender -b --factory-startup --python game-assets/blender/scripts/volcanic_kit.py
The showcase script imports build_kit() to assemble chunks from these same assets.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

import fw_lib as L  # noqa: E402

# ───────────────────────────── materials ─────────────────────────────


def textures():
    d, p = L.downloaded, L.processed
    rock = d("polyhaven", "dark_rock", "dark_rock_diff_1k.jpg")
    t = {
        "basalt": L.stylize_texture(rock, p("vol_basalt_a.jpg"), "#5b4c66", detail=0.55),
        "basalt_b": L.stylize_texture(rock, p("vol_basalt_b.jpg"), "#4c4157", detail=0.5, contrast=1.6),
        "ash": L.stylize_texture(rock, p("vol_ash.jpg"), "#77707a", detail=0.35, contrast=1.1),
        "stone": L.stylize_texture(rock, p("vol_stone_block.jpg"), "#a38877", detail=0.5, warm=0.4),
        "wood": L.stylize_texture(d("polyhaven", "brown_planks_03", "brown_planks_03_diff_1k.jpg"), p("wood_planks.jpg"), "#c98b4e", detail=0.6, contrast=1.5),
        "moss": L.stylize_texture(d("polyhaven", "mossy_rock", "mossy_rock_diff_1k.jpg"), p("trans_mossy_rock.jpg"), "#6f8f45", detail=0.5),
        "rock_n": L.resize_map(d("polyhaven", "dark_rock", "dark_rock_nor_gl_1k.jpg"), p("vol_rock_normal.jpg")),
        "wood_n": L.resize_map(d("polyhaven", "brown_planks_03", "brown_planks_03_nor_gl_1k.jpg"), p("wood_planks_normal.jpg")),
        "moss_n": L.resize_map(d("polyhaven", "mossy_rock", "mossy_rock_nor_gl_1k.jpg"), p("trans_mossy_normal.jpg")),
        # Only the hottest veins of the CC0 lava become glowing cracks; the lava pool glows wider.
        "crack_e": L.voronoi_cracks(p("vol_crack_emission.jpg"), "#ff5a0a", cells=4, width=0.03),
        "lava_e": L.emission_mask(d("ambientcg", "Lava004", "Lava004_1K-JPG_Emission.jpg"), p("vol_lava_emission.jpg"), "#ff7a12", threshold=0.25, power=1.0),
        "lava_c": L.stylize_texture(d("ambientcg", "Lava004", "Lava004_1K-JPG_Color.jpg"), p("vol_lava_color.jpg"), "#c2300a", detail=0.9, contrast=1.8),
    }
    return t


def make_materials(t):
    return {
        "Basalt": L.tex_mat("Basalt", t["basalt"], t["rock_n"], normal_strength=0.45, rough=0.85),
        "BasaltB": L.tex_mat("BasaltB", t["basalt_b"], t["rock_n"], normal_strength=0.5, rough=0.85),
        "Ash": L.tex_mat("Ash", t["ash"], t["rock_n"], normal_strength=0.3, rough=0.95),
        "CrackedBasalt": L.tex_mat("CrackedBasalt", t["basalt_b"], t["rock_n"], normal_strength=0.4, rough=0.85, emission_path=t["crack_e"], emission_strength=4.0),
        "Lava": L.tex_mat("Lava", t["lava_c"], rough=0.35, emission_path=t["lava_e"], emission_strength=3.0),
        "Stone": L.tex_mat("Stone", t["stone"], t["rock_n"], normal_strength=0.5, rough=0.8),
        "Wood": L.tex_mat("Wood", t["wood"], t["wood_n"], normal_strength=0.5, rough=0.75),
        "Moss": L.tex_mat("Moss", t["moss"], t["moss_n"], normal_strength=0.4, rough=0.9),
        "WoodDark": L.flat_mat("WoodDark", "#6b4428", rough=0.85),
        "Charcoal": L.flat_mat("Charcoal", "#2b2224", rough=0.9),
        "Ember": L.flat_mat("Ember", "#ff6a1a", emission="#ff4a0a", strength=3.5),
        "EmberDim": L.flat_mat("EmberDim", "#7a2a10", emission="#ff4a10", strength=1.2),
        "IronCold": L.flat_mat("IronCold", "#5d5864", rough=0.45, metal=0.7),
        "Iron": L.flat_mat("Iron", "#8a8496", rough=0.35, metal=0.85),
        "Rune": L.flat_mat("Rune", "#ffb347", emission="#ff8a20", strength=4),
        "BombBody": L.flat_mat("BombBody", "#1f1a33", rough=0.18, coat=1.0),
        "BombBand": L.flat_mat("BombBand", "#ff5a3c", rough=0.35, coat=0.6),
        "Fuse": L.flat_mat("Fuse", "#cfa56a", rough=0.9),
        "Spark": L.flat_mat("Spark", "#ffe08a", emission="#ffb030", strength=10),
        "Flame": L.flat_mat("Flame", "#e8420a", emission="#ff3800", strength=1.8),
        "FlameCore": L.flat_mat("FlameCore", "#ffb020", emission="#ff9a10", strength=2.6),
        "Obsidian": L.flat_mat("Obsidian", "#2a1c3a", rough=0.08, coat=1.0, emission="#6a2cff", strength=0.25),
        "Grass": L.flat_mat("Grass", "#6fae3e", rough=0.85),
        "GrassDark": L.flat_mat("GrassDark", "#4f8a2e", rough=0.9),
        "Leaf": L.flat_mat("Leaf", "#4f9a3a", rough=0.8),
        "LeafLight": L.flat_mat("LeafLight", "#7cc24a", rough=0.8),
        "Bark": L.flat_mat("Bark", "#7a5032", rough=0.9),
        "MushCap": L.flat_mat("MushCap", "#d83a52", rough=0.45, coat=0.4),
        "MushStem": L.flat_mat("MushStem", "#f3e6cf", rough=0.7),
        "MushDot": L.flat_mat("MushDot", "#fff8ea", rough=0.6),
        "Vine": L.flat_mat("Vine", "#3f7d33", rough=0.85),
        "TokenBase": L.flat_mat("TokenBase", "#2b2240", rough=0.3, coat=1.0),
        "Common": L.flat_mat("Common", "#e8e2d6", rough=0.35, emission="#ffffff", strength=0.4),
        "RareGem": L.flat_mat("RareGem", "#4fa8ff", rough=0.05, emission="#2f86ff", strength=1.6),
        "EpicGem": L.flat_mat("EpicGem", "#c46bff", rough=0.05, emission="#a040ff", strength=2.0),
        "Gold": L.flat_mat("Gold", "#ffcc4d", rough=0.22, metal=0.9, emission="#ffb020", strength=0.3),
        "Plus": L.flat_mat("Plus", "#fff1b8", emission="#ffe08a", strength=1.2),
        "Bolt": L.flat_mat("Bolt", "#7af2ff", emission="#3ee0ff", strength=3.0),
        "SignInk": L.flat_mat("SignInk", "#2a1d14", rough=0.9),
    }


# ───────────────────────────── helpers ─────────────────────────────


def tile(name, mat, thickness=0.3, size=0.98, bev=0.035):
    o = L.box(name, (size, size, thickness), (0, 0, -thickness / 2), mat=mat, bevel_w=bev, segments=2)
    L.uv_cube_project(o, 1.0)
    return o


def finish(objs, name, col):
    o = L.join(objs, name) if len(objs) > 1 else objs[0]
    o.name = name
    L.set_origin(o, (0, 0, 0))
    L.move_to(o, col)
    return o


def rock(name, mat, r=0.35, squash=0.7, seed=1):
    o = L.ico(name, r, (0, 0, 0), subdiv=3, scale=(1.0, 0.9 + 0.1 * (seed % 3), squash), mat=mat)
    L.displace_noise(o, strength=r * 0.35, size=0.25 + 0.05 * seed, seed=seed)
    L.shade_smooth(o, 40)
    L.uv_cube_project(o, 0.8)
    return o


# ───────────────────────────── ground ─────────────────────────────


def ground_assets(m, col):
    out = {}
    out["vol_ground_basalt_a"] = finish([tile("BasaltA", m["Basalt"])], "vol_ground_basalt_a", col)
    pebbles = [rock(f"Pebble{i}", m["BasaltB"], r=0.06 + 0.02 * (i % 2), seed=i) for i in range(3)]
    for i, pb in enumerate(pebbles):
        pb.location = ((-0.25, 0.2, 0.28)[i], (0.22, -0.28, 0.05)[i], 0.02)
    out["vol_ground_basalt_b"] = finish([tile("BasaltB", m["BasaltB"])] + pebbles, "vol_ground_basalt_b", col)
    out["vol_ground_cracked"] = finish([tile("Cracked", m["CrackedBasalt"])], "vol_ground_cracked", col)
    out["vol_ground_ash"] = finish([tile("AshTile", m["Ash"], bev=0.05)], "vol_ground_ash", col)
    lava = L.box("LavaSurface", (1.0, 1.0, 0.12), (0, 0, -0.16), mat=m["Lava"])
    L.uv_cube_project(lava, 1.0)
    out["vol_lava_tile"] = finish([lava], "vol_lava_tile", col)
    # Transition: basalt invaded by moss and the first grass tufts.
    mossy = tile("MossyTile", m["Moss"])
    tufts = grass_tufts(m, 7, spread=0.38, seed=3)
    out["trans_ground_mossy"] = finish([mossy] + tufts, "trans_ground_mossy", col)
    grass = tile("GrassTile", m["Grass"], bev=0.05)
    out["for_ground_grass"] = finish([grass] + grass_tufts(m, 11, spread=0.42, seed=9), "for_ground_grass", col)
    return out


def grass_tufts(m, n, spread=0.4, seed=0):
    out = []
    for i in range(n):
        a = (i * 2.399 + seed) % (2 * math.pi)
        r = spread * math.sqrt(((i * 37 + seed * 11) % 100) / 100)
        x, y = math.cos(a) * r, math.sin(a) * r
        for k in range(3):
            blade = L.cyl(f"Blade{i}_{k}", 0.025, 0.0, 0.14 + 0.04 * ((i + k) % 3), (x + 0.02 * (k - 1), y, 0.06), verts=5, rot=(math.radians(15 * (k - 1)), math.radians(12 * (k - 1)), 0), mat=m["GrassDark" if k == 1 else "Grass"], smooth=False)
            out.append(blade)
    return out


# ───────────────────────────── blocks ─────────────────────────────


def solid_column(m, col):
    c = L.cyl("Column", 0.47, 0.5, 1.0, (0, 0, 0.5), verts=6, mat=m["Basalt"], bevel_w=0.04)
    L.uv_cube_project(c, 1.0)
    cap = L.cyl("Cap", 0.36, 0.42, 0.08, (0, 0, 1.02), verts=6, mat=m["BasaltB"], bevel_w=0.02)
    # A small ember vein on top (a hint of heat, not a beacon).
    glow = L.tube("CapVein", [(-0.16, -0.05, 1.065), (-0.02, 0.04, 1.065), (0.14, -0.02, 1.065)], 0.014, m["EmberDim"], resolution=6)
    return finish([c, cap, glow], "vol_solid_column", col)


def crate_parts(m, damaged=False):
    """A sturdy wooden crate built from real planks (posts, beams, panels, braces, iron corners)."""
    s = 0.86
    h = s / 2
    parts = []
    for ix in (-1, 1):
        for iy in (-1, 1):
            parts.append(L.box(f"Post{ix}{iy}", (0.11, 0.11, s), (ix * (h - 0.055), iy * (h - 0.055), h), mat=m["Wood"], bevel_w=0.015))
    for z in (0.055, s - 0.055):
        for axis in ("x", "y"):
            for sgn in (-1, 1):
                if axis == "x":
                    parts.append(L.box(f"Beam{axis}{sgn}{z:.2f}", (s - 0.2, 0.1, 0.1), (0, sgn * (h - 0.05), z), mat=m["Wood"], bevel_w=0.015))
                else:
                    parts.append(L.box(f"Beam{axis}{sgn}{z:.2f}", (0.1, s - 0.2, 0.1), (sgn * (h - 0.05), 0, z), mat=m["Wood"], bevel_w=0.015))
    panels = []
    for i, (px, py, sx, sy) in enumerate([(0, -h + 0.03, s - 0.14, 0.04), (0, h - 0.03, s - 0.14, 0.04), (-h + 0.03, 0, 0.04, s - 0.14), (h - 0.03, 0, 0.04, s - 0.14)]):
        panels.append(L.box(f"Panel{i}", (sx, sy, s - 0.14), (px, py, h), mat=m["Wood"], bevel_w=0.01))
    top = L.box("Lid", (s - 0.14, s - 0.14, 0.04), (0, 0, s - 0.04), mat=m["Wood"], bevel_w=0.01)
    braces = []
    for i, (px, py, rz) in enumerate([(0, -h - 0.005, 0), (0, h + 0.005, 0), (-h - 0.005, 0, 90), (h + 0.005, 0, 90)]):
        b = L.box(f"Brace{i}", (s - 0.16, 0.035, 0.08), (px, py, h), rot=(0, math.radians(45), math.radians(rz)), mat=m["WoodDark"], bevel_w=0.01)
        braces.append(b)
    corners = []
    for ix in (-1, 1):
        for iy in (-1, 1):
            for z in (0.06, s - 0.06):
                corners.append(L.box(f"Iron{ix}{iy}{z:.2f}", (0.13, 0.13, 0.13), (ix * (h - 0.05), iy * (h - 0.05), z), mat=m["Iron"], bevel_w=0.02))
    for o in parts + panels + [top] + braces:
        L.uv_cube_project(o, 0.9)
    if damaged:
        # Lost a panel and a brace, the lid cracked open.
        for o in (panels[0], braces[0], corners[0]):
            bpy.data.objects.remove(o)
        panels, braces, corners = panels[1:], braces[1:], corners[1:]
        top.rotation_euler = Euler((math.radians(8), math.radians(-6), math.radians(4)))
        top.location.z += 0.04
    return parts + panels + [top] + braces + corners


def crate_assets(m, col):
    out = {"crate_wood": finish(crate_parts(m), "crate_wood", col), "crate_wood_damaged": finish(crate_parts(m, damaged=True), "crate_wood_damaged", col)}
    # Fragments: separate pieces (one node each) the game can throw around on destruction.
    frags = []
    for i in range(7):
        f = L.box(f"crate_frag_{i}", (0.34 - 0.03 * (i % 3), 0.1, 0.05 + 0.01 * (i % 2)), (0, 0, 0), mat=m["Wood"], bevel_w=0.01)
        L.uv_cube_project(f, 0.9)
        a = i * 2 * math.pi / 7
        f.location = (math.cos(a) * 0.35, math.sin(a) * 0.35, 0.03 + 0.02 * i)
        f.rotation_euler = Euler((0, 0, a + 0.4 * i))
        L.move_to(f, col)
        frags.append(f)
    for i in range(2):
        f = L.box(f"crate_frag_iron_{i}", (0.12, 0.12, 0.12), (0.2 - 0.4 * i, -0.15 + 0.3 * i, 0.06), mat=m["Iron"], bevel_w=0.02)
        L.move_to(f, col)
        frags.append(f)
    out["crate_wood_fragments"] = frags
    return out


def stone_block(m, damaged=False):
    b = L.box("StoneCore", (0.86, 0.86, 0.82), (0, 0, 0.41), mat=m["Stone"], bevel_w=0.12, segments=4)
    L.subdivide(b, 1)
    L.displace_noise(b, strength=0.035, size=0.35, seed=2)
    L.uv_cube_project(b, 0.9)
    L.shade_smooth(b, 45)
    rune = L.cyl("Rune", 0.12, 0.12, 0.02, (0, 0, 0.83), verts=6, mat=m["Rune"])
    ring = L.torus("RuneRing", 0.16, 0.014, (0, 0, 0.83), mat=m["Rune"], seg=24, mseg=6)
    parts = [b, rune, ring]
    if damaged:
        cut = L.ico("Chip", 0.32, (0.42, -0.42, 0.8), subdiv=1)
        mod = b.modifiers.new("Chip", "BOOLEAN")
        mod.operation, mod.object, mod.solver = "DIFFERENCE", cut, "EXACT"
        L.apply_modifiers(b)
        bpy.data.objects.remove(cut)
        for i, pts in enumerate([
            [(-0.43, -0.2, 0.7), (-0.44, -0.05, 0.5), (-0.43, 0.1, 0.35)],
            [(0.1, -0.44, 0.75), (0.0, -0.45, 0.55), (0.12, -0.44, 0.3)],
        ]):
            parts.append(L.tube(f"Crack{i}", pts, 0.012, m["Ember"], resolution=6))
    return parts


def bomb_classic(m, col):
    body = L.uv_sphere("BombBody", 0.36, (0, 0, 0.37), seg=40, rings=20, mat=m["BombBody"])
    band = L.torus("BombBand", 0.358, 0.035, (0, 0, 0.37), mat=m["BombBand"])
    rivets = []
    for i in range(10):
        a = i * 2 * math.pi / 10
        rivets.append(L.uv_sphere(f"Rivet{i}", 0.018, (math.cos(a) * 0.392, math.sin(a) * 0.392, 0.37), seg=10, rings=6, mat=m["Iron"]))
    cap = L.cyl("Cap", 0.11, 0.13, 0.1, (0, 0, 0.74), verts=24, mat=m["Iron"], bevel_w=0.015)
    lip = L.torus("CapLip", 0.1, 0.018, (0, 0, 0.79), mat=m["Iron"], seg=24, mseg=8)
    fuse = L.tube("Fuse", [(0, 0, 0.79), (0.04, 0, 0.88), (0.11, 0, 0.92)], 0.022, m["Fuse"])
    spark = L.ico("Spark", 0.05, (0.125, 0, 0.935), subdiv=1, mat=m["Spark"])
    shine = L.uv_sphere("Shine", 0.06, (-0.15, -0.26, 0.55), scale=(1, 0.4, 1.5), seg=12, rings=8, mat=L.flat_mat("BombShine", "#ffffff", emission="#ffffff", strength=0.6))
    return finish([body, band, cap, lip, fuse, spark, shine] + rivets, "bomb_classic", col)


# ───────────────────────────── power-ups (rarity = shape + color) ─────────────────────────────


def star_prism(name, r_out, r_in, depth, mat, points=5):
    pts = []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        r = r_out if i % 2 == 0 else r_in
        pts.append((math.cos(a) * r, math.sin(a) * r))
    n = len(pts)
    verts = [(x, y, z) for z in (0, depth) for x, y in pts] + [(0, 0, 0), (0, 0, depth)]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(i, j, n + j, n + i), (2 * n, j, i), (2 * n + 1, n + i, n + j)]
    o = L.mesh_from(name, verts, faces, mat)
    L.bevel(o, 0.01, 2)
    return o


def pedestal(rarity, m):
    if rarity == "common":
        base = L.cyl("Base", 0.32, 0.36, 0.08, (0, 0, 0.04), verts=32, mat=m["TokenBase"], bevel_w=0.015)
        ring = L.torus("Ring", 0.3, 0.022, (0, 0, 0.09), mat=m["Common"])
        return [base, ring]
    if rarity == "rare":
        base = L.cyl("Base", 0.34, 0.38, 0.09, (0, 0, 0.045), verts=6, mat=m["TokenBase"], bevel_w=0.015)
        ring = L.torus("Ring", 0.31, 0.022, (0, 0, 0.1), mat=m["RareGem"], seg=6, mseg=8)
        gems = [L.ico(f"Gem{i}", 0.05, (math.cos(i * 2.094) * 0.3, math.sin(i * 2.094) * 0.3, 0.16), subdiv=0, scale=(1, 1, 1.6), mat=m["RareGem"]) for i in range(3)]
        return [base, ring] + gems
    # epic: star base, floating halo and gems
    base = star_prism("Base", 0.4, 0.26, 0.09, m["TokenBase"])
    halo = L.torus("Halo", 0.33, 0.016, (0, 0, 0.78), mat=m["EpicGem"])
    gems = [L.ico(f"Gem{i}", 0.045, (math.cos(i * 1.2566 + 1.57) * 0.36, math.sin(i * 1.2566 + 1.57) * 0.36, 0.14), subdiv=0, scale=(1, 1, 1.5), mat=m["EpicGem"]) for i in range(5)]
    return [base, halo] + gems


def powerups(m, col):
    out = {}
    # Bomb Up (common): mini bomb + plus sign.
    icon = [
        L.uv_sphere("MiniBomb", 0.15, (0, 0, 0.5), mat=m["BombBody"]),
        L.torus("MiniBand", 0.148, 0.018, (0, 0, 0.5), mat=m["BombBand"]),
        L.cyl("MiniCap", 0.04, 0.045, 0.04, (0, 0, 0.66), verts=12, mat=m["Iron"]),
        L.ico("MiniSpark", 0.03, (0.03, 0, 0.71), subdiv=1, mat=m["Spark"]),
        L.box("PlusH", (0.13, 0.04, 0.035), (0.19, -0.1, 0.62), mat=m["Plus"], bevel_w=0.01),
        L.box("PlusV", (0.04, 0.04, 0.13), (0.19, -0.1, 0.62), mat=m["Plus"], bevel_w=0.01),
    ]
    out["pu_bomb_up"] = finish(pedestal("common", m) + icon, "pu_bomb_up", col)
    # Fire Up (rare): layered, twisting flame.
    flame = [
        L.tube("FlameOuter", [(0, 0, 0.28), (0.05, 0, 0.45), (-0.03, 0.02, 0.6), (0.04, 0, 0.75)], 0.13, m["Flame"], taper_end=0.05),
        L.tube("FlameInner", [(0, -0.03, 0.3), (0.03, -0.04, 0.42), (-0.01, -0.03, 0.55)], 0.07, m["FlameCore"], taper_end=0.05),
    ]
    out["pu_fire_up"] = finish(pedestal("rare", m) + flame, "pu_fire_up", col)
    # Speed Up (epic): lightning bolt.
    bolt_pts = [(0.06, 0.32), (-0.1, 0.02), (0.0, 0.02), (-0.07, -0.3), (0.12, 0.05), (0.02, 0.05), (0.1, 0.32)]
    n = len(bolt_pts)
    verts = [(x, -0.03, z + 0.5) for x, z in bolt_pts] + [(x, 0.03, z + 0.5) for x, z in bolt_pts]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    bolt = L.mesh_from("Bolt", verts, faces, m["Bolt"])
    L.bevel(bolt, 0.012, 2)
    out["pu_speed_up"] = finish(pedestal("epic", m) + [bolt], "pu_speed_up", col)
    return out


# ───────────────────────────── props & hazard ─────────────────────────────


def props(m, col):
    out = {}
    out["vol_rock_a"] = finish([rock("RockA", m["Basalt"], 0.42, 0.65, seed=1)], "vol_rock_a", col)
    r1 = rock("RockB1", m["BasaltB"], 0.3, 0.8, seed=2)
    r2 = rock("RockB2", m["Basalt"], 0.2, 0.7, seed=3)
    r2.location = (0.28, 0.18, -0.02)
    out["vol_rock_b"] = finish([r1, r2], "vol_rock_b", col)
    shards = []
    for i, (x, y, h, tilt) in enumerate([(0, 0, 0.75, 0), (0.17, 0.05, 0.5, 18), (-0.14, 0.1, 0.45, -20), (0.04, -0.16, 0.38, 14)]):
        s = L.cyl(f"Shard{i}", 0.09, 0.0, h, (x, y, h / 2), verts=6, rot=(math.radians(tilt * 0.6), math.radians(tilt), 0), mat=m["Obsidian"], smooth=False)
        shards.append(s)
    out["vol_obsidian_cluster"] = finish(shards + [rock("ObsBase", m["BasaltB"], 0.22, 0.4, seed=4)], "vol_obsidian_cluster", col)
    trunk = L.tube("DeadTrunk", [(0, 0, 0), (0.05, 0.02, 0.6), (-0.04, 0, 1.2), (0.03, 0.03, 1.6)], 0.09, m["Charcoal"], taper_end=0.35)
    branches = [
        L.tube("Branch1", [(0.02, 0.01, 0.9), (0.3, 0.05, 1.15), (0.45, 0.0, 1.4)], 0.04, m["Charcoal"], taper_end=0.2),
        L.tube("Branch2", [(-0.02, 0.0, 1.1), (-0.28, -0.05, 1.3), (-0.38, 0.05, 1.55)], 0.035, m["Charcoal"], taper_end=0.2),
    ]
    embers = [L.ico(f"EmberTip{i}", 0.03, p, subdiv=1, mat=m["Ember"]) for i, p in enumerate([(0.45, 0.0, 1.42), (-0.38, 0.05, 1.57)])]
    out["trans_dead_tree"] = finish([trunk] + branches + embers, "trans_dead_tree", col)
    # Enchanted forest pieces (the destination biome of the transition).
    stem = L.cyl("MushStem", 0.14, 0.18, 0.7, (0, 0, 0.35), verts=20, mat=m["MushStem"])
    cap = L.uv_sphere("MushCap", 0.48, (0, 0, 0.68), scale=(1, 1, 0.6), mat=m["MushCap"])
    L.delete_verts(cap, lambda co: co.z < 0.0)
    L.solidify(cap, 0.04)
    dots = [L.uv_sphere(f"Dot{i}", 0.06, (0, 0, 0), scale=(1, 1, 0.4), seg=12, rings=6, mat=m["MushDot"]) for i in range(6)]
    for i, d in enumerate(dots):
        L.place_on_sphere(d, (0, 0, 0.68), 0.36, i * 60, 25 + 15 * (i % 2), 0.0)
        d.location.z = 0.68 + (d.location.z - 0.68) * 0.75
    out["for_mushroom_giant"] = finish([stem, cap] + dots, "for_mushroom_giant", col)
    trunk2 = L.cyl("TreeTrunk", 0.12, 0.17, 0.9, (0, 0, 0.45), verts=10, mat=m["Bark"])
    crowns = []
    for i, (x, y, z, r) in enumerate([(0, 0, 1.15, 0.5), (0.3, 0.1, 0.95, 0.32), (-0.28, -0.05, 1.0, 0.34), (0.05, -0.2, 1.45, 0.3)]):
        crowns.append(L.ico(f"Crown{i}", r, (x, y, z), subdiv=2, mat=m["Leaf" if i % 2 == 0 else "LeafLight"]))
    for c in crowns:
        L.shade_smooth(c)
    out["for_tree_round"] = finish([trunk2] + crowns, "for_tree_round", col)
    bush = [L.ico(f"Bush{i}", r, (x, y, r * 0.7), subdiv=2, mat=m["Leaf" if i else "LeafLight"]) for i, (x, y, r) in enumerate([(0, 0, 0.28), (0.22, 0.08, 0.2), (-0.2, 0.05, 0.22)])]
    for b in bush:
        L.shade_smooth(b)
    out["for_bush"] = finish(bush, "for_bush", col)
    post = L.box("SignPost", (0.08, 0.08, 1.0), (0, 0, 0.5), mat=m["WoodDark"], bevel_w=0.01)
    board_pts = [(-0.3, -0.12), (0.22, -0.12), (0.34, 0.0), (0.22, 0.12), (-0.3, 0.12)]
    nb = len(board_pts)
    bverts = [(x, -0.03, z + 0.82) for x, z in board_pts] + [(x, 0.03, z + 0.82) for x, z in board_pts]
    bfaces = [tuple(range(nb))[::-1], tuple(range(nb, 2 * nb))] + [(i, (i + 1) % nb, nb + (i + 1) % nb, nb + i) for i in range(nb)]
    board = L.mesh_from("SignBoard", bverts, bfaces, m["Wood"])
    L.bevel(board, 0.01, 2)
    L.uv_cube_project(board, 0.8)
    leaf_icon = L.uv_sphere("SignLeaf", 0.05, (0.0, -0.04, 0.82), scale=(1.4, 0.3, 0.8), seg=12, rings=6, mat=m["Leaf"])
    out["sign_post_forest"] = finish([post, board, leaf_icon], "sign_post_forest", col)
    return out


def gate_arch(m, col):
    """Chunk connection gate (2 tiles wide): basalt on the volcanic side, mossy on the forest side."""
    left = L.cyl("PillarL", 0.32, 0.36, 2.0, (-1.3, 0, 1.0), verts=6, mat=m["Basalt"], bevel_w=0.03)
    right = L.cyl("PillarR", 0.32, 0.36, 2.0, (1.3, 0, 1.0), verts=6, mat=m["Moss"], bevel_w=0.03)
    for p in (left, right):
        L.uv_cube_project(p, 1.0)
    arch = L.torus("Arch", 1.3, 0.2, (0, 0, 2.0), rot=(math.pi / 2, 0, 0), mat=m["Stone"], seg=40, mseg=10)
    L.delete_verts(arch, lambda co: co.z < -0.05)
    L.uv_cube_project(arch, 1.0)
    key = L.box("Keystone", (0.34, 0.3, 0.4), (0, 0, 3.32), mat=m["Stone"], bevel_w=0.04)
    rune = L.cyl("KeyRune", 0.09, 0.09, 0.02, (0, -0.16, 3.32), rot=(math.pi / 2, 0, 0), verts=6, mat=m["Rune"])
    vines = [
        L.tube("Vine1", [(1.5, -0.2, 0.2), (1.35, -0.25, 1.0), (1.1, -0.22, 2.4), (0.5, -0.25, 3.15)], 0.035, m["Vine"]),
        L.tube("Vine2", [(1.1, -0.25, 0.4), (1.25, -0.28, 1.4), (0.9, -0.24, 2.9)], 0.028, m["Vine"]),
    ]
    leaves = [L.uv_sphere(f"VineLeaf{i}", 0.07, p, scale=(1.3, 0.5, 0.8), seg=10, rings=6, mat=m["LeafLight"]) for i, p in enumerate([(1.35, -0.3, 1.0), (1.12, -0.28, 2.4), (0.6, -0.3, 3.1), (1.22, -0.32, 1.8)])]
    embers = [L.ico(f"GateEmber{i}", 0.04, (-1.3 + 0.12 * i, -0.33, 0.6 + 0.4 * i), subdiv=1, mat=m["Ember"]) for i in range(3)]
    return finish([left, right, arch, key, rune] + vines + leaves + embers, "gate_arch_vol_forest", col)


def fire_vent(m, col, state):
    """Hazard with visual states: disabled · idle · warning · active."""
    ring = L.cyl("VentRing", 0.42, 0.46, 0.14, (0, 0, 0.07), verts=12, mat=m["BasaltB"], bevel_w=0.03)
    L.uv_cube_project(ring, 0.9)
    inner_mat = {"disabled": m["Charcoal"], "idle": m["EmberDim"], "warning": m["Ember"], "active": m["Ember"]}[state]
    hole = L.cyl("VentHole", 0.3, 0.3, 0.02, (0, 0, 0.13), verts=24, mat=inner_mat)
    bars = [L.box(f"Grate{i}", (0.62, 0.035, 0.03), (0, -0.2 + 0.1 * i, 0.15), mat=m["IronCold" if state == "disabled" else "Iron"], bevel_w=0.008) for i in range(5)]
    parts = [ring, hole] + bars
    if state == "warning":
        parts += [L.cyl(f"Tongue{i}", 0.05, 0.0, 0.22, (math.cos(i * 2.1) * 0.15, math.sin(i * 2.1) * 0.15, 0.26), verts=8, mat=m["Flame"]) for i in range(3)]
    if state == "active":
        # A licking fire column: three twisting tongues around a hot core.
        for i in range(3):
            a = i * 2.094
            pts = [(math.cos(a) * 0.12, math.sin(a) * 0.12, 0.15), (math.cos(a + 0.9) * 0.16, math.sin(a + 0.9) * 0.16, 0.6), (math.cos(a + 1.8) * 0.08, math.sin(a + 1.8) * 0.08, 1.1), (math.cos(a + 2.4) * 0.03, math.sin(a + 2.4) * 0.03, 1.5 - 0.15 * i)]
            parts.append(L.tube(f"Tongue{i}", pts, 0.15, m["Flame"], taper_end=0.05))
        parts.append(L.tube("Core", [(0, 0, 0.15), (0.03, 0, 0.55), (-0.02, 0.02, 0.95)], 0.1, m["FlameCore"], taper_end=0.05))
    return finish(parts, f"hz_fire_vent_{state}", col)


# ───────────────────────────── kit build & export ─────────────────────────────

ASSET_META = {
    # id: (category, biome, kind, destructible, hazard)
    "vol_ground_basalt_a": ("ground", "volcanic_lands", "tile", False, False),
    "vol_ground_basalt_b": ("ground", "volcanic_lands", "tile", False, False),
    "vol_ground_cracked": ("ground", "volcanic_lands", "tile", False, False),
    "vol_ground_ash": ("ground", "volcanic_lands", "tile", False, False),
    "vol_lava_tile": ("ground", "volcanic_lands", "liquid", False, True),
    "trans_ground_mossy": ("ground", "transition:volcanic_lands>enchanted_forest", "tile", False, False),
    "for_ground_grass": ("ground", "enchanted_forest", "tile", False, False),
    "vol_solid_column": ("blocks", "volcanic_lands", "solid", False, False),
    "crate_wood": ("blocks", "shared", "destructible", True, False),
    "crate_wood_damaged": ("blocks", "shared", "destructible_state", True, False),
    "crate_wood_fragments": ("blocks", "shared", "fragments", False, False),
    "stone_block": ("blocks", "volcanic_lands", "destructible", True, False),
    "stone_block_damaged": ("blocks", "volcanic_lands", "destructible_state", True, False),
    "bomb_classic": ("bombs", "shared", "bomb", False, False),
    "pu_bomb_up": ("powerups", "shared", "powerup:common", False, False),
    "pu_fire_up": ("powerups", "shared", "powerup:rare", False, False),
    "pu_speed_up": ("powerups", "shared", "powerup:epic", False, False),
    "vol_rock_a": ("props", "volcanic_lands", "decor", False, False),
    "vol_rock_b": ("props", "volcanic_lands", "decor", False, False),
    "vol_obsidian_cluster": ("props", "volcanic_lands", "decor", False, False),
    "trans_dead_tree": ("props", "transition:volcanic_lands>enchanted_forest", "decor", False, False),
    "for_mushroom_giant": ("props", "enchanted_forest", "decor", False, False),
    "for_tree_round": ("props", "enchanted_forest", "decor", False, False),
    "for_bush": ("props", "enchanted_forest", "decor", False, False),
    "sign_post_forest": ("props", "shared", "decor", False, False),
    "gate_arch_vol_forest": ("environments", "transition:volcanic_lands>enchanted_forest", "connector", False, False),
    "hz_fire_vent_disabled": ("hazards", "volcanic_lands", "hazard_state", False, True),
    "hz_fire_vent_idle": ("hazards", "volcanic_lands", "hazard_state", False, True),
    "hz_fire_vent_warning": ("hazards", "volcanic_lands", "hazard_state", False, True),
    "hz_fire_vent_active": ("hazards", "volcanic_lands", "hazard_state", False, True),
}


def build_kit():
    """Builds every asset into a hidden 'Kit' collection; returns {id: object | [objects]}."""
    m = make_materials(textures())
    kit = L.collection("Kit")
    assets = {}
    assets.update(ground_assets(m, kit))
    assets["vol_solid_column"] = solid_column(m, kit)
    assets.update(crate_assets(m, kit))
    assets["stone_block"] = finish(stone_block(m), "stone_block", kit)
    assets["stone_block_damaged"] = finish(stone_block(m, damaged=True), "stone_block_damaged", kit)
    assets["bomb_classic"] = bomb_classic(m, kit)
    assets.update(powerups(m, kit))
    assets.update(props(m, kit))
    assets["gate_arch_vol_forest"] = gate_arch(m, kit)
    for st in ("disabled", "idle", "warning", "active"):
        assets[f"hz_fire_vent_{st}"] = fire_vent(m, kit, st)
    return assets, m


def export_kit(assets):
    entries = []
    for aid, obj in assets.items():
        cat, biome, kind, destructible, hazard = ASSET_META[aid]
        objs = obj if isinstance(obj, list) else [obj]
        info = L.export_glb(objs, f"{cat}/{aid}")
        dims = [round(v, 3) for v in (objs[0].dimensions if len(objs) == 1 else (1, 1, 0.2))]
        entries.append({
            "id": aid,
            "category": cat,
            "biome": biome,
            "kind": kind,
            "destructible": destructible,
            "hazard": hazard,
            "model": info["web"],
            "tris": info["tris"],
            "kb": info["kb"],
            "dimensions": dims,
            "gridFootprint": [2, 1] if aid.startswith("gate") else [1, 1],
            "origin": "tile center, resting on Z=0",
            "preview": f"previews/assets/{aid}.png",
            "license": "original geometry; textures CC0 (see docs/LICENSES.md)",
        })
    return entries


def kit_sheet(assets):
    """Lays the kit out on a grid and renders a reference sheet from the gameplay angle."""
    L.setup_world(strength=0.8)
    L.sun("Key", 3.0, (55, 8, 35))
    bpy.data.collections["Kit"].hide_render = True  # only the laid-out copies appear
    order =[k for k in assets if not k.endswith("fragments")]
    cols = 8
    for i, aid in enumerate(order):
        obj = assets[aid]
        r, c = divmod(i, cols)
        dup = bpy.data.objects.new(aid + "_sheet", obj.data)
        bpy.context.scene.collection.objects.link(dup)
        dup.location = (c * 2.0, -r * 2.2, 0)
        if aid.startswith("gate"):
            dup.scale = (0.45, 0.45, 0.45)
    rows = math.ceil(len(order) / cols)
    center = ((cols - 1) * 1.0, -(rows - 1) * 1.1, 0.3)
    cam = L.iso_camera("CamKit", center, 40, 18.5, elevation=48, azimuth=-28)
    L.render(os.path.join(L.PREVIEW_DIR, "assets", "volcanic_kit_sheet.png"), cam, res=(1800, 1150), samples=32)
    for o in [o for o in bpy.context.scene.collection.objects if o.name.endswith("_sheet")]:
        bpy.data.objects.remove(o)


def main():
    L.reset_scene()
    assets, _ = build_kit()
    entries = export_kit(assets)
    L.write_manifest("assets/volcanic_kit", {"kit": "volcanic_lands_phase1", "unit": "1 grid tile = 1 unit", "assets": entries})
    kit_sheet(assets)
    bpy.data.collections["Kit"].hide_render = False
    L.save_blend("environments/volcanic_kit")


if __name__ == "__main__":
    main()
