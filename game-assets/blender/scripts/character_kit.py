"""
4Walls — modular adventurer kit (Phase 1 of the art plan).

One standard skeleton ("4W_Rig") and many interchangeable, independently exported parts:
  base body (with animations) · headgear · faces · outfits · back accessories · accessories.
Every part is a skinned mesh bound to the same bone names, so the game can attach any part to
any character at runtime (SkinnedMesh.bind to the base skeleton).

Run: blender -b --factory-startup --python game-assets/blender/scripts/character_kit.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

import fw_lib as L  # noqa: E402

HZ = 0.86  # head center height
HR = 0.28  # head radius (head ≈ 50% of the character's height)

# ───────────────────────────── palettes & materials ─────────────────────────────

PALETTES = {
    "rubro": {"primary": "#ff5a3c", "secondary": "#ffd23f", "accent": "#2a2130", "outfit": "#c2412b"},
    "celeste": {"primary": "#2fb8ff", "secondary": "#e8f7ff", "accent": "#1f3a66", "outfit": "#2479c7"},
    "lima": {"primary": "#7ddc3a", "secondary": "#fff3a0", "accent": "#2e4a1d", "outfit": "#4f9a2a"},
    "ametista": {"primary": "#b46bff", "secondary": "#ffd6ff", "accent": "#3a2160", "outfit": "#7b3fd1"},
    "sol": {"primary": "#ffb02e", "secondary": "#fff1d0", "accent": "#6a2e14", "outfit": "#e2701c"},
}


def make_materials():
    p = PALETTES["rubro"]
    return {
        # Recolorable slots (the game tints these by name):
        "Helmet": L.flat_mat("Helmet", p["primary"], rough=0.22, coat=1.0),
        "Outfit": L.flat_mat("Outfit", p["outfit"], rough=0.55, coat=0.2),
        "Suit": L.flat_mat("Suit", "#3b2c44", rough=0.5),
        "Glove": L.flat_mat("Glove", p["secondary"], rough=0.5),
        "Accent": L.flat_mat("Accent", p["accent"], rough=0.45),
        # Fixed look:
        "Skin": L.flat_mat("Skin", "#ffd9b8", rough=0.55),
        "Blush": L.flat_mat("Blush", "#ff8d9b", rough=0.7),
        "Eye": L.flat_mat("Eye", "#160f1f", rough=0.12, coat=1.0),
        "EyeShine": L.flat_mat("EyeShine", "#ffffff", emission="#ffffff", strength=1.6),
        "Brow": L.flat_mat("Brow", "#3a2418", rough=0.8),
        "Mouth": L.flat_mat("Mouth", "#5a1622", rough=0.6),
        "Tongue": L.flat_mat("Tongue", "#ff7088", rough=0.6),
        "Boot": L.flat_mat("Boot", "#2a2130", rough=0.6),
        "Sole": L.flat_mat("Sole", "#140f18", rough=0.85),
        "Metal": L.flat_mat("Metal", "#b8b2c8", rough=0.28, metal=0.9),
        "Gold": L.flat_mat("Gold", "#ffcc4d", rough=0.25, metal=0.9, emission="#ffb020", strength=0.25),
        "Glass": L.flat_mat("Glass", "#9fe0ff", rough=0.04, emission="#4fb6ff", strength=0.6),
        "Leather": L.flat_mat("Leather", "#8a5a33", rough=0.75),
        "Fuse": L.flat_mat("Fuse", "#cfa56a", rough=0.9),
        "Spark": L.flat_mat("Spark", "#ffe08a", emission="#ffb030", strength=10),
        "Flame": L.flat_mat("Flame", "#ffd06a", emission="#ff7a1a", strength=12),
        "Fabric": L.flat_mat("Fabric", "#f2ead8", rough=0.85),
    }


def apply_palette(mats, name):
    p = PALETTES[name]
    for slot, key in (("Helmet", "primary"), ("Glove", "secondary"), ("Accent", "accent"), ("Outfit", "outfit")):
        b = mats[slot].node_tree.nodes["Principled BSDF"]
        col = L.srgb(p[key])
        b.inputs["Base Color"].default_value = (*col, 1)
        mats[slot].diffuse_color = (*col, 1)


# ───────────────────────────── skeleton ─────────────────────────────

J = {
    "pelvis": (0, 0, 0.30),
    "chest": (0, 0, 0.46),
    "neck": (0, 0, 0.58),
    "hipL": (0.085, 0, 0.27),
    "kneeL": (0.095, -0.01, 0.16),
    "ankleL": (0.095, 0, 0.07),
    "shoulderL": (0.15, 0, 0.52),
    "elbowL": (0.24, 0, 0.44),
    "wristL": (0.3, -0.01, 0.36),
}


def mir(p):
    return (-p[0], p[1], p[2])


BONES = [
    ("root", (0, 0, 0), (0, 0, 0.1), None),
    ("hips", J["pelvis"], (0, 0, 0.42), "root"),
    ("chest", (0, 0, 0.42), J["neck"], "hips"),
    ("head", J["neck"], (0, 0, 1.2), "chest"),
]
for side, s in (("L", 1), ("R", -1)):
    m = (lambda p: p) if s == 1 else mir
    BONES += [
        (f"upper_arm.{side}", m(J["shoulderL"]), m(J["elbowL"]), "chest"),
        (f"forearm.{side}", m(J["elbowL"]), m(J["wristL"]), f"upper_arm.{side}"),
        (f"hand.{side}", m(J["wristL"]), m((0.34, -0.01, 0.29)), f"forearm.{side}"),
        (f"thigh.{side}", m(J["hipL"]), m(J["kneeL"]), "hips"),
        (f"shin.{side}", m(J["kneeL"]), m(J["ankleL"]), f"thigh.{side}"),
        (f"foot.{side}", m(J["ankleL"]), m((0.095, -0.12, 0.03)), f"shin.{side}"),
    ]

# Attachment points the game (and future items) can rely on.
ATTACH = {
    "headgear": "head",
    "face": "head",
    "back": "chest",
    "neck": "chest",
    "waist": "hips",
    "hand.L": "hand.L",
    "hand.R": "hand.R",
}


def build_rig():
    data = bpy.data.armatures.new("4W_Rig")
    rig = bpy.data.objects.new("4W_Rig", data)
    bpy.context.scene.collection.objects.link(rig)
    L.activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        b = data.edit_bones.new(name)
        b.head, b.tail, b.roll = head, tail, 0
        if parent:
            b.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def bind_rigid(obj, rig, bone):
    """Rigid part: 100% weight on one bone, deformed by the shared armature."""
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    obj.parent = rig
    return obj


def bind_auto(obj, rig):
    """Soft part (body, clothing shells): automatic weights from the shared armature."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    return obj


# ───────────────────────────── body ─────────────────────────────


def skin_mesh(name, joints, edges, radius_of, mat, subdiv=1):
    names = list(joints.keys())
    idx = {n: i for i, n in enumerate(names)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([joints[n] for n in names], [(idx[a], idx[b]) for a, b in edges], [])
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    L.activate(o)
    o.modifiers.new("Skin", "SKIN").use_smooth_shade = True
    sv = me.skin_vertices[0].data
    for n, i in idx.items():
        r = radius_of(n)
        sv[i].radius = (r, r * 0.92)
    sv[0].use_root = True
    sub = o.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = subdiv
    L.apply_modifiers(o)
    L.shade_smooth(o)
    L.assign(o, mat)
    return o


def body_joints():
    j = dict(J)
    j.update({k.replace("L", "R"): mir(v) for k, v in J.items() if k.endswith("L")})
    order = ["pelvis", "chest", "neck", "hipL", "kneeL", "ankleL", "hipR", "kneeR", "ankleR", "shoulderL", "elbowL", "wristL", "shoulderR", "elbowR", "wristR"]
    return {n: j[n] for n in order}


BODY_EDGES = [
    ("pelvis", "chest"), ("chest", "neck"),
    ("pelvis", "hipL"), ("hipL", "kneeL"), ("kneeL", "ankleL"),
    ("pelvis", "hipR"), ("hipR", "kneeR"), ("kneeR", "ankleR"),
    ("chest", "shoulderL"), ("shoulderL", "elbowL"), ("elbowL", "wristL"),
    ("chest", "shoulderR"), ("shoulderR", "elbowR"), ("elbowR", "wristR"),
]
BODY_R = {"pelvis": 0.14, "chest": 0.16, "neck": 0.075, "hip": 0.068, "knee": 0.052, "ankle": 0.048, "shoulder": 0.058, "elbow": 0.044, "wrist": 0.038}


def body_radius(extra=0.0):
    def f(n):
        key = n if n in ("pelvis", "chest", "neck") else n[:-1]
        return BODY_R[key] + extra
    return f


def build_base(rig, mats):
    parts = []
    body = skin_mesh("Body", body_joints(), BODY_EDGES, body_radius(), mats["Suit"])
    bind_auto(body, rig)
    parts.append(body)
    # Head: big skin sphere — the helmet and face are separate, swappable parts.
    head = L.uv_sphere("Head", HR, (0, 0, HZ), seg=40, rings=20, mat=mats["Skin"])
    bind_rigid(head, rig, "head")
    parts.append(head)
    for side, s in (("L", 1), ("R", -1)):
        palm = L.uv_sphere(f"Glove{side}", 0.068, (0.32 * s, -0.01, 0.325), scale=(0.9, 1, 1.05), mat=mats["Glove"])
        thumb = L.uv_sphere(f"Thumb{side}", 0.03, (0.29 * s, -0.06, 0.355), seg=16, rings=8, mat=mats["Glove"])
        cuff = L.torus(f"Cuff{side}", 0.044, 0.016, (0.305 * s, -0.01, 0.38), rot=(0, math.radians(35 * s), 0), mat=mats["Glove"], seg=24, mseg=8)
        for o in (palm, thumb, cuff):
            bind_rigid(o, rig, f"hand.{side}")
            parts.append(o)
        boot = L.uv_sphere(f"Boot{side}", 0.084, (0.095 * s, -0.03, 0.05), scale=(1.0, 1.45, 0.7), mat=mats["Boot"])
        sole = L.cyl(f"Sole{side}", 0.074, 0.074, 0.026, (0.095 * s, -0.035, 0.013), verts=24, mat=mats["Sole"])
        sole.scale = (1, 1.45, 1)
        L.apply_transform(sole)
        for o in (boot, sole):
            bind_rigid(o, rig, f"foot.{side}")
            parts.append(o)
    return parts


# ───────────────────────────── headgear ─────────────────────────────


def helmet_shell(name, r, mat, window=True):
    """Dome over the head with a clean, rounded face opening (boolean cut, not vertex deletion)."""
    shell = L.uv_sphere(name, r, (0, 0, HZ), seg=48, rings=24, mat=mat)
    L.solidify(shell, 0.02)
    if window:
        cutter = L.uv_sphere(name + "_cut", 1.0, (0, -0.25, HZ - 0.07), scale=(0.235, 0.2, 0.17), seg=48, rings=24)
        m = shell.modifiers.new("Window", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = cutter
        m.solver = "EXACT"
        L.apply_modifiers(shell)
        bpy.data.objects.remove(cutter)
    L.shade_smooth(shell, 50)
    return shell


def band_radius(r_dome, dz, tube):
    """Radius of a band that hugs a dome of radius r_dome at height dz above its center."""
    return math.sqrt(max(r_dome**2 - dz**2, 0.0)) + tube * 0.4


def headgear_classic(mats):
    """Signature bomb helmet: glossy dome, band, side bolts, fuse with a live spark."""
    objs = [helmet_shell("HelmetClassic", 0.305, mats["Helmet"])]
    objs.append(L.torus("HelmetBand", band_radius(0.325, 0.135, 0.024), 0.024, (0, 0, HZ + 0.135), mat=mats["Accent"]))
    for s in (1, -1):
        objs.append(L.cyl(f"Bolt{s}", 0.05, 0.05, 0.04, (0.305 * s, 0, HZ + 0.02), rot=(0, math.pi / 2, 0), verts=20, mat=mats["Metal"], bevel_w=0.008))
    objs.append(L.cyl("FuseCap", 0.075, 0.064, 0.07, (0, 0, HZ + 0.33), verts=20, mat=mats["Accent"], bevel_w=0.01))
    objs.append(L.tube("Fuse", [(0, 0, HZ + 0.36), (0.03, 0, HZ + 0.43), (0.075, 0.0, HZ + 0.47)], 0.016, mats["Fuse"]))
    objs.append(L.ico("Spark", 0.036, (0.08, 0, HZ + 0.485), subdiv=1, mat=mats["Spark"]))
    return L.join(objs, "helmet_classic")


def headgear_pilot(mats):
    """Aviator cap: soft dome, floppy ear flaps, chunky goggles on the forehead."""
    objs = [helmet_shell("PilotCap", 0.298, mats["Helmet"])]
    for s in (1, -1):
        flap = L.uv_sphere(f"Flap{s}", 0.1, (0.27 * s, -0.02, HZ - 0.1), scale=(0.35, 0.9, 1.25), mat=mats["Helmet"])
        objs.append(flap)
        objs.append(L.cyl(f"Rim{s}", 0.075, 0.075, 0.05, (0.095 * s, -0.27, HZ + 0.17), rot=(math.radians(-62), 0, 0), verts=24, mat=mats["Metal"], bevel_w=0.01))
        objs.append(L.cyl(f"Lens{s}", 0.06, 0.06, 0.02, (0.095 * s, -0.296, HZ + 0.185), rot=(math.radians(-62), 0, 0), verts=24, mat=mats["Glass"]))
    objs.append(L.torus("Strap", band_radius(0.318, 0.15, 0.02), 0.02, (0, 0, HZ + 0.15), rot=(math.radians(-12), 0, 0), mat=mats["Leather"]))
    objs.append(L.box("Bridge", (0.05, 0.03, 0.025), (0, -0.29, HZ + 0.17), mat=mats["Metal"]))
    objs.append(L.uv_sphere("Pompom", 0.045, (0, 0.02, HZ + 0.3), mat=mats["Glove"]))
    return L.join(objs, "helmet_pilot")


def headgear_wizard(mats):
    """Tall, bent wizard hat with a wide brim and a golden star."""
    objs = []
    brim = L.cyl("Brim", 0.44, 0.44, 0.03, (0, 0, HZ + 0.16), verts=48, mat=mats["Helmet"], bevel_w=0.01)
    objs.append(brim)
    cone = L.tube("Cone", [(0, 0, HZ + 0.16), (0, 0.01, HZ + 0.42), (0.02, 0.08, HZ + 0.62), (0.07, 0.2, HZ + 0.7)], 0.27, mats["Helmet"], resolution=14, taper_end=0.05)
    objs.append(cone)
    objs.append(L.torus("HatBand", 0.262, 0.03, (0, 0, HZ + 0.2), mat=mats["Accent"]))
    star = star_mesh("Star", 0.075, 0.032, 0.02, mats["Gold"])
    star.location = (0, -0.27, HZ + 0.22)
    star.rotation_euler = Euler((math.radians(90 - 10), 0, 0))
    L.apply_transform(star, loc=True)
    objs.append(star)
    objs.append(L.ico("Tip", 0.035, (0.075, 0.205, HZ + 0.7), subdiv=2, mat=mats["Gold"]))
    return L.join(objs, "helmet_wizard")


def star_mesh(name, r_out, r_in, depth, mat):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = r_out if i % 2 == 0 else r_in
        pts.append((math.cos(a) * r, math.sin(a) * r))
    verts = [(x, y, d) for d in (-depth / 2, depth / 2) for x, y in pts] + [(0, 0, -depth / 2 - 0.004), (0, 0, depth / 2 + 0.004)]
    faces = []
    n = 10
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
        faces.append((2 * n, j, i))
        faces.append((2 * n + 1, n + i, n + j))
    o = L.mesh_from(name, verts, faces, mat)
    L.bevel(o, 0.004, 2)
    return o


# ───────────────────────────── faces / expressions ─────────────────────────────


def on_head(obj, yaw, pitch, lift=0.0):
    return L.place_on_sphere(obj, (0, 0, HZ), HR, yaw, pitch, lift)


def head_point(yaw, pitch, lift=0.004):
    y, p = math.radians(yaw), math.radians(pitch)
    n = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
    return tuple(Vector((0, 0, HZ)) + n * (HR + lift))


def eye(name, mats, yaw, pitch, w=0.05, h=0.062, shine=True):
    objs = []
    e = L.uv_sphere(name, 1.0, (0, 0, 0), scale=(w, 0.022, h), seg=24, rings=12, mat=mats["Eye"])
    on_head(e, yaw, pitch, 0.006)
    L.apply_transform(e, loc=False)
    objs.append(e)
    if shine:
        s1 = L.uv_sphere(name + "Shine", 1.0, (0, 0, 0), scale=(w * 0.32, 0.01, w * 0.32), seg=12, rings=6, mat=mats["EyeShine"])
        on_head(s1, yaw + (4 if yaw > 0 else 4), pitch + 4, 0.024)
        s2 = L.uv_sphere(name + "Shine2", 1.0, (0, 0, 0), scale=(w * 0.16, 0.01, w * 0.16), seg=10, rings=6, mat=mats["EyeShine"])
        on_head(s2, yaw - 3, pitch - 4, 0.022)
        objs += [s1, s2]
    return objs


def brow(name, mats, yaw_in, yaw_out, pitch_in, pitch_out):
    pts = [head_point(yaw_in, pitch_in, 0.008), head_point((yaw_in + yaw_out) / 2, max(pitch_in, pitch_out) + 1.5, 0.01), head_point(yaw_out, pitch_out, 0.008)]
    return L.tube(name, pts, 0.012, mats["Brow"], resolution=8)


def cheeks(mats):
    out = []
    for s in (1, -1):
        c = L.uv_sphere(f"Cheek{s}", 1.0, (0, 0, 0), scale=(0.035, 0.01, 0.022), seg=12, rings=6, mat=mats["Blush"])
        on_head(c, 30 * s, -12, 0.002)
        out.append(c)
    return out


def face_happy(mats):
    objs = []
    for s in (1, -1):
        objs += eye(f"Eye{s}", mats, 17 * s, 4)
        objs.append(brow(f"Brow{s}", mats, 9 * s, 26 * s, 21, 19))
    smile = [head_point(-13, -14), head_point(-6, -20), head_point(0, -21.5), head_point(6, -20), head_point(13, -14)]
    objs.append(L.tube("Smile", smile, 0.011, mats["Mouth"], resolution=8))
    tongue = L.uv_sphere("Tongue", 1.0, (0, 0, 0), scale=(0.02, 0.006, 0.012), seg=12, rings=6, mat=mats["Tongue"])
    on_head(tongue, 0, -19.5, 0.006)
    objs.append(tongue)
    objs += cheeks(mats)
    return L.join(objs, "face_happy")


def face_angry(mats):
    objs = []
    for s in (1, -1):
        objs += eye(f"Eye{s}", mats, 17 * s, 2, w=0.048, h=0.05)
        # Thick brows slanting down toward the nose.
        b = brow(f"Brow{s}", mats, 7 * s, 27 * s, 11, 19)
        objs.append(b)
    frown = [head_point(-11, -21), head_point(-4, -17.5), head_point(4, -17.5), head_point(11, -21)]
    objs.append(L.tube("Frown", frown, 0.012, mats["Mouth"], resolution=8))
    return L.join(objs, "face_angry")


def face_surprised(mats):
    objs = []
    for s in (1, -1):
        objs += eye(f"Eye{s}", mats, 17 * s, 5, w=0.058, h=0.07)
        objs.append(brow(f"Brow{s}", mats, 9 * s, 25 * s, 26, 25))
    o = L.torus("MouthO", 0.026, 0.01, (0, 0, 0), mat=mats["Mouth"], seg=24, mseg=8)
    on_head(o, 0, -20, 0.006)
    L.activate(o)
    o.rotation_euler.rotate_axis("X", math.radians(90))
    L.apply_transform(o)
    objs.append(o)
    inner = L.uv_sphere("MouthInner", 1.0, (0, 0, 0), scale=(0.024, 0.006, 0.024), seg=16, rings=8, mat=mats["Tongue"])
    on_head(inner, 0, -20, 0.003)
    objs.append(inner)
    objs += cheeks(mats)
    return L.join(objs, "face_surprised")


# ───────────────────────────── outfits ─────────────────────────────


def shell(name, joints, edges, extra, mat, rig):
    o = skin_mesh(name, joints, edges, body_radius(extra), mat)
    bind_auto(o, rig)
    return o


def outfit_jumpsuit(rig, mats):
    """Classic bomber jumpsuit: full-body shell, collar, zipper, chest badge, utility belt."""
    j = body_joints()
    suit = shell("JumpsuitShell", j, BODY_EDGES, 0.012, mats["Outfit"], rig)
    details = [
        L.torus("Collar", 0.09, 0.03, (0, 0, 0.585), scale=(1, 0.95, 0.8), mat=mats["Outfit"]),
        L.box("Zipper", (0.022, 0.012, 0.2), (0, -0.168, 0.46), mat=mats["Metal"], bevel_w=0.004),
        L.cyl("Badge", 0.035, 0.035, 0.012, (0.075, -0.155, 0.5), rot=(math.radians(80), 0, math.radians(-25)), verts=24, mat=mats["Glove"], bevel_w=0.003),
        L.torus("UtilityBelt", 0.152, 0.026, (0, 0, 0.31), scale=(1, 0.92, 1), mat=mats["Leather"]),
        L.box("Buckle", (0.07, 0.02, 0.05), (0, -0.152, 0.31), mat=mats["Gold"], bevel_w=0.006),
    ]
    rigid = [bind_rigid(d, rig, "chest" if d.name in ("Collar", "Zipper", "Badge") else "hips") for d in details]
    return [suit] + rigid


def outfit_hoodie(rig, mats):
    """Casual hoodie: torso + sleeves shell, hood resting on the back, kangaroo pocket, drawstrings."""
    # Full-body shell (the Skin modifier is reliable on the complete skeleton), then trimmed:
    # keep the torso and upper arms, drop legs and forearms.
    top = skin_mesh("HoodieShell", body_joints(), BODY_EDGES, body_radius(0.02), mats["Outfit"])
    L.delete_verts(top, lambda co: co.z < 0.255 or abs(co.x) > 0.245)
    bind_auto(top, rig)
    hood = L.uv_sphere("Hood", 0.2, (0, 0.13, 0.62), scale=(1.1, 0.6, 0.75), mat=mats["Outfit"])
    # Mesh coordinates are local to the object (center = hood center).
    L.delete_verts(hood, lambda co: co.y < -0.05 and co.z > -0.02)
    L.solidify(hood, 0.02)
    pocket = L.box("Pocket", (0.17, 0.03, 0.08), (0, -0.16, 0.34), mat=mats["Outfit"], bevel_w=0.015)
    strings = [L.tube(f"String{s}", [(0.035 * s, -0.15, 0.56), (0.04 * s, -0.175, 0.5), (0.035 * s, -0.17, 0.45)], 0.007, mats["Fabric"]) for s in (1, -1)]
    tips = [L.uv_sphere(f"Tip{s}", 0.012, (0.035 * s, -0.17, 0.445), seg=10, rings=6, mat=mats["Metal"]) for s in (1, -1)]
    rigid = [bind_rigid(o, rig, "chest") for o in [hood, pocket] + strings + tips]
    return [top] + rigid


def outfit_armor(rig, mats):
    """Knightly armor: rounded chest plate, shoulder pauldrons, armored belt with crest."""
    plate = L.uv_sphere("ChestPlate", 0.185, (0, -0.015, 0.45), scale=(1.0, 0.82, 1.0), mat=mats["Metal"])
    L.delete_verts(plate, lambda co: co.z > 0.12 or co.z < -0.12 or co.y > 0.04)
    L.solidify(plate, 0.02)
    trim = L.torus("PlateTrim", 0.17, 0.016, (0, -0.012, 0.335), scale=(1, 0.82, 1), mat=mats["Gold"])
    crest = star_mesh("Crest", 0.045, 0.02, 0.015, mats["Accent"])
    crest.location = (0, -0.172, 0.47)
    crest.rotation_euler = Euler((math.radians(90), 0, 0))
    L.apply_transform(crest, loc=True)
    objs = [bind_rigid(o, rig, "chest") for o in (plate, trim, crest)]
    for side, s in (("L", 1), ("R", -1)):
        pad = L.uv_sphere(f"Pauldron{side}", 0.085, (0.17 * s, 0, 0.55), scale=(1.1, 1, 0.75), mat=mats["Metal"])
        L.delete_verts(pad, lambda co: co.z < -0.015)
        L.solidify(pad, 0.016)
        rim = L.torus(f"PauldronRim{side}", 0.088, 0.012, (0.17 * s, 0, 0.535), scale=(1.1, 1, 1), mat=mats["Gold"])
        objs += [bind_rigid(pad, rig, f"upper_arm.{side}"), bind_rigid(rim, rig, f"upper_arm.{side}")]
    belt = L.torus("ArmorBelt", 0.155, 0.03, (0, 0, 0.3), scale=(1, 0.92, 1), mat=mats["Accent"])
    objs.append(bind_rigid(belt, rig, "hips"))
    return objs


# ───────────────────────────── back & accessories ─────────────────────────────


def back_rocketpack(rig, mats):
    objs = [L.box("PackPlate", (0.2, 0.06, 0.18), (0, 0.17, 0.46), mat=mats["Accent"], bevel_w=0.02)]
    for s in (1, -1):
        objs.append(L.cyl(f"Rocket{s}", 0.055, 0.055, 0.24, (0.07 * s, 0.22, 0.46), verts=24, mat=mats["Metal"], bevel_w=0.01))
        objs.append(L.cyl(f"NoseCone{s}", 0.055, 0.0, 0.08, (0.07 * s, 0.22, 0.62), verts=24, mat=mats["Helmet"]))
        objs.append(L.cyl(f"Nozzle{s}", 0.035, 0.05, 0.05, (0.07 * s, 0.22, 0.315), verts=20, mat=mats["Accent"]))
        objs.append(L.cyl(f"Flame{s}", 0.035, 0.0, 0.12, (0.07 * s, 0.22, 0.23), rot=(math.pi, 0, 0), verts=16, mat=mats["Flame"]))
    for s in (1, -1):
        objs.append(L.torus(f"Strap{s}", 0.08, 0.015, (0.08 * s, 0.02, 0.5), rot=(0, math.radians(90), 0), scale=(1, 1.6, 1), mat=mats["Leather"]))
    return [bind_rigid(L.join(objs, "back_rocketpack"), rig, "chest")]


def back_bombpack(rig, mats):
    objs = [L.uv_sphere("PackBomb", 0.135, (0, 0.2, 0.45), mat=mats["Accent"])]
    objs.append(L.torus("PackBand", 0.133, 0.018, (0, 0.2, 0.45), rot=(math.pi / 2, 0, 0), mat=mats["Helmet"]))
    objs.append(L.cyl("PackCap", 0.04, 0.035, 0.04, (0, 0.2, 0.6), verts=16, mat=mats["Metal"]))
    objs.append(L.tube("PackFuse", [(0, 0.2, 0.62), (0.02, 0.24, 0.68), (0.06, 0.26, 0.7)], 0.011, mats["Fuse"]))
    objs.append(L.ico("PackSpark", 0.024, (0.065, 0.26, 0.71), subdiv=1, mat=mats["Spark"]))
    for s in (1, -1):
        objs.append(L.torus(f"Strap{s}", 0.08, 0.015, (0.08 * s, 0.03, 0.5), rot=(0, math.radians(90), 0), scale=(1, 1.6, 1), mat=mats["Leather"]))
    return [bind_rigid(L.join(objs, "back_bombpack"), rig, "chest")]


def acc_scarf(rig, mats):
    ring = L.torus("ScarfRing", 0.1, 0.042, (0, 0, 0.585), scale=(1, 0.95, 1), mat=mats["Glove"])
    tail = L.tube("ScarfTail", [(0.05, 0.08, 0.57), (0.1, 0.18, 0.5), (0.12, 0.27, 0.42)], 0.03, mats["Glove"], taper_end=0.7)
    stripe = L.torus("ScarfStripe", 0.1, 0.044, (0, 0, 0.585), scale=(1, 0.95, 0.25), mat=mats["Helmet"])
    return [bind_rigid(L.join([ring, tail, stripe], "acc_scarf"), rig, "chest")]


# ───────────────────────────── animation ─────────────────────────────


def action(rig, name, frames, keys, loop=True):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for frame, pose in keys:
        for pb in rig.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        for bone, v in pose.items():
            pb = rig.pose.bones[bone]
            if isinstance(v, tuple) and v and v[0] == "loc":
                pb.location = v[1]
            else:
                pb.rotation_euler = Euler([math.radians(a) for a in v])
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("location", frame=frame)
    act.frame_range = (1, frames)
    return act


def build_animations(rig):
    acts = {}
    acts["Idle"] = action(rig, "Idle", 48, [
        (1, {"chest": (2, 0, 0), "upper_arm.L": (0, 0, 8), "upper_arm.R": (0, 0, -8)}),
        (25, {"chest": (-1, 0, 0), "hips": ("loc", (0, 0, -0.008)), "upper_arm.L": (3, 0, 12), "upper_arm.R": (3, 0, -12), "head": (2, 0, 3)}),
        (48, {"chest": (2, 0, 0), "upper_arm.L": (0, 0, 8), "upper_arm.R": (0, 0, -8)}),
    ])

    def stride(a, lean, bob, n):
        def pose(s):
            return {
                "hips": (0, 0, 6 * s * a), "chest": (lean, 0, -8 * s * a),
                "thigh.L": (-42 * s * a, 0, 0), "thigh.R": (42 * s * a, 0, 0),
                "shin.L": (35 if s < 0 else 10, 0, 0), "shin.R": (35 if s > 0 else 10, 0, 0),
                "upper_arm.L": (45 * s * a, 0, 15), "upper_arm.R": (-45 * s * a, 0, -15),
                "forearm.L": (-30, 0, 0), "forearm.R": (-30, 0, 0), "head": (-lean / 2, 0, 4 * s * a),
            }
        mid = {"root": ("loc", (0, 0, bob)), "chest": (lean, 0, 0), "shin.L": (40, 0, 0), "shin.R": (40, 0, 0), "forearm.L": (-30, 0, 0), "forearm.R": (-30, 0, 0), "head": (-lean / 2, 0, 0)}
        q = n // 4
        return [(1, pose(1)), (1 + q, mid), (1 + 2 * q, pose(-1)), (1 + 3 * q, mid), (n, pose(1))]

    acts["Walk"] = action(rig, "Walk", 24, stride(0.55, 6, 0.025, 24))
    acts["Run"] = action(rig, "Run", 12, stride(1.0, 14, 0.05, 12))
    acts["PlaceBomb"] = action(rig, "PlaceBomb", 12, [
        (1, {}),
        (5, {"root": ("loc", (0, 0, -0.06)), "chest": (35, 0, 0), "head": (-10, 0, 0), "upper_arm.L": (70, 0, 10), "upper_arm.R": (70, 0, -10), "thigh.L": (-40, 0, 0), "thigh.R": (-40, 0, 0), "shin.L": (60, 0, 0), "shin.R": (60, 0, 0)}),
        (12, {}),
    ], loop=False)
    acts["Hit"] = action(rig, "Hit", 10, [
        (1, {}),
        (3, {"root": ("loc", (0, 0.06, 0.02)), "chest": (-25, 0, 8), "head": (-20, 0, -12), "upper_arm.L": (-40, 0, 50), "upper_arm.R": (-40, 0, -50)}),
        (10, {}),
    ], loop=False)
    up = {"root": ("loc", (0, 0, 0.22)), "upper_arm.L": (-20, 0, -70), "upper_arm.R": (-20, 0, 70), "forearm.L": (0, 0, -35), "forearm.R": (0, 0, 35), "head": (12, 0, 0), "thigh.L": (-30, 0, 0), "thigh.R": (-30, 0, 0), "shin.L": (60, 0, 0), "shin.R": (60, 0, 0)}
    down = {"hips": ("loc", (0, 0, -0.03)), "upper_arm.L": (-10, 0, -45), "upper_arm.R": (-10, 0, 45), "forearm.L": (0, 0, -20), "forearm.R": (0, 0, 20), "thigh.L": (-25, 0, 0), "thigh.R": (-25, 0, 0), "shin.L": (40, 0, 0), "shin.R": (40, 0, 0)}
    acts["Victory"] = action(rig, "Victory", 24, [(1, down), (8, up), (13, up), (24, down)])
    acts["Defeat"] = action(rig, "Defeat", 30, [
        (1, {}),
        (6, {"root": ("loc", (0, 0.05, 0.12)), "chest": (-35, 0, 0), "head": (-25, 0, 10), "upper_arm.L": (-60, 0, 80), "upper_arm.R": (-60, 0, -80)}),
        (16, {"root": ("loc", (0, 0.12, 0.0)), "hips": (-70, 0, 0), "chest": (-20, 0, 0), "head": (-20, 0, -15), "thigh.L": (-60, 0, 0), "thigh.R": (-50, 0, 0)}),
        (30, {"root": ("loc", (0, 0.15, -0.12)), "hips": (-80, 0, 0), "chest": (-5, 0, 0), "head": (-10, 0, -25), "thigh.L": (-80, 0, 0), "thigh.R": (-75, 0, 10)}),
    ], loop=False)
    acts["Cast"] = action(rig, "Cast", 10, [
        (1, {}),
        (4, {"chest": (8, 0, 25), "upper_arm.R": (60, 0, -10), "forearm.R": (-60, 0, 0), "upper_arm.L": (-20, 0, 25)}),
        (6, {"chest": (12, 0, -25), "upper_arm.R": (-85, 0, -5), "upper_arm.L": (30, 0, 25)}),
        (10, {}),
    ], loop=False)
    rig.animation_data.action = acts["Idle"]
    return acts


# ───────────────────────────── build, export, preview ─────────────────────────────

CATALOG = {
    "headgear": {"helmet_classic": headgear_classic, "helmet_pilot": headgear_pilot, "helmet_wizard": headgear_wizard},
    "faces": {"face_happy": face_happy, "face_angry": face_angry, "face_surprised": face_surprised},
    "clothing": {"outfit_jumpsuit": outfit_jumpsuit, "outfit_hoodie": outfit_hoodie, "outfit_armor": outfit_armor},
    "back": {"back_rocketpack": back_rocketpack, "back_bombpack": back_bombpack},
    "accessories": {"acc_scarf": acc_scarf},
}
LABELS = {
    "helmet_classic": "Capacete-bomba clássico", "helmet_pilot": "Gorro de piloto", "helmet_wizard": "Chapéu de mago",
    "face_happy": "Feliz", "face_angry": "Bravo", "face_surprised": "Surpreso",
    "outfit_jumpsuit": "Macacão de bombardeiro", "outfit_hoodie": "Moletom", "outfit_armor": "Armadura",
    "back_rocketpack": "Mochila-foguete", "back_bombpack": "Mochila-bomba", "acc_scarf": "Cachecol",
}


def build_kit():
    L.reset_scene()
    mats = make_materials()
    cols = {k: L.collection(k) for k in ("Characters", "Character_Headgear", "Character_Faces", "Character_Clothing", "Character_Accessories", "Preview")}
    rig = build_rig()
    L.move_to(rig, cols["Characters"])
    base_parts = build_base(rig, mats)
    base = L.join(base_parts, "adventurer_base")
    L.move_to(base, cols["Characters"])
    parts = {}
    for cat, items in CATALOG.items():
        col = cols["Character_Headgear" if cat == "headgear" else "Character_Faces" if cat == "faces" else "Character_Clothing" if cat == "clothing" else "Character_Accessories"]
        for pid, fn in items.items():
            if cat in ("headgear", "faces"):
                obj = fn(mats)
                bind_rigid(obj, rig, "head")
                objs = [obj]
            else:
                objs = fn(rig, mats)
            if len(objs) > 1:
                # Join rigid + skinned pieces: vertex groups merge by bone name.
                merged = L.join(objs, pid)
                merged.parent = rig
                objs = [merged]
            objs[0].name = pid
            for o in objs:
                L.move_to(o, col)
            parts[pid] = (cat, objs[0])
    acts = build_animations(rig)
    return rig, base, parts, mats, acts


def export_kit(rig, base, parts):
    entries = {}
    rig.data.pose_position = "REST"
    for pid, (cat, obj) in parts.items():
        info = L.export_glb([rig, obj], f"characters/{cat}/{pid}")
        entries[pid] = {"category": cat, **info}
    rig.data.pose_position = "POSE"
    base_info = L.export_glb([rig, base], "characters/base/adventurer_base", animations=True)
    return base_info, entries


def write_manifests(base_info, entries, acts):
    L.write_manifest("characters/adventurer", {
        "id": "adventurer",
        "category": "character",
        "skeleton": "4W_Rig",
        "bones": [b[0] for b in BONES],
        "attachments": ATTACH,
        "model": base_info["web"],
        "tris": base_info["tris"],
        "animations": list(acts.keys()),
        "materialSlots": {"Helmet": "primary", "Glove": "secondary", "Accent": "accent", "Outfit": "outfit", "Suit": "fixed (under-suit)"},
        "defaults": {"headgear": "helmet_classic", "face": "face_happy", "clothing": "outfit_jumpsuit", "back": None, "accessories": []},
        "height": 1.22,
        "origin": "center of the feet",
        "license": "original (4Walls)",
    })
    items = []
    for pid, e in entries.items():
        slot = {"headgear": "headgear", "faces": "face", "clothing": "clothing", "back": "back", "accessories": "neck"}[e["category"]]
        items.append({
            "id": pid,
            "name": LABELS[pid],
            "category": e["category"],
            "slot": slot,
            "attachBone": ATTACH.get(slot, "chest") if slot in ATTACH else ("chest" if slot == "clothing" else "head"),
            "skeleton": "4W_Rig",
            "model": e["web"],
            "preview": f"previews/characters/parts/{pid}.png",
            "tris": e["tris"],
            "rarity": "common",
            "license": "original (4Walls)",
        })
    L.write_manifest("customization/items", {"skeleton": "4W_Rig", "items": items})
    L.write_manifest("customization/palettes", {"palettes": PALETTES, "slots": ["primary", "secondary", "accent", "outfit"]})


def show_only(base, parts, selection):
    for pid, (_, obj) in parts.items():
        visible = pid in selection
        obj.hide_render = not visible
        obj.hide_viewport = not visible
    base.hide_render = False


def preview_setup():
    L.setup_world(strength=0.75)
    L.sun("Key", 3.2, (52, 6, 32))
    L.sun("Rim", 1.6, (120, 0, 200), color="#ffd0a8")
    ground = L.cyl("PreviewGround", 1.3, 1.3, 0.04, (0, 0, -0.02), verts=64, mat=L.flat_mat("PreviewGround", "#3a2e3c", rough=0.9))
    L.move_to(ground, bpy.data.collections["Preview"])


def tile_images(paths, cols, out, cell=(480, 560), bg=(0.16, 0.12, 0.15)):
    """Composites per-variant renders into one sheet (pure numpy, no external tools)."""
    rows = math.ceil(len(paths) / cols)
    W, H = cell[0] * cols, cell[1] * rows
    sheet = np.ones((H, W, 4), dtype=np.float32)
    sheet[..., :3] = bg
    for i, p in enumerate(paths):
        img = bpy.data.images.load(p)
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        r, c = divmod(i, cols)
        y0 = H - (r + 1) * cell[1]
        sheet[y0 : y0 + h, c * cell[0] : c * cell[0] + w] = px[:cell[1], :cell[0]]
        bpy.data.images.remove(img)
    res = bpy.data.images.new(os.path.basename(out), W, H)
    res.pixels[:] = sheet.ravel()
    res.filepath_raw = out
    res.file_format = "PNG"
    res.save()
    print(f"[4walls] sheet {os.path.relpath(out, L.ROOT)}")


def render_previews(rig, base, parts, mats):
    preview_setup()
    pdir = os.path.join(L.PREVIEW_DIR, "characters")
    rig.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(1)
    hero = ["helmet_classic", "face_happy", "outfit_jumpsuit", "acc_scarf"]
    show_only(base, parts, hero)
    tgt = (0, 0, 0.6)
    views = {
        "front": L.camera("CamFront", (0, -3.6, 0.75), tgt, lens=60),
        "side": L.camera("CamSide", (3.6, 0, 0.75), tgt, lens=60),
        "three_quarter": L.camera("Cam34", (2.3, -2.8, 1.1), tgt, lens=60),
        "iso": L.iso_camera("CamIso", tgt, 8, 1.9, elevation=55, azimuth=-35),
    }
    for v, cam in views.items():
        L.render(os.path.join(pdir, f"hero_{v}.png"), cam, res=(720, 860))

    small = (480, 560)
    cam = L.camera("CamSheet", (1.6, -3.0, 1.15), (0, 0, 0.62), lens=55)
    cam_back = L.camera("CamBack", (1.9, 2.8, 1.25), (0, 0, 0.6), lens=55)
    cam_face = L.camera("CamFace", (0.25, -1.6, 0.92), (0, 0, 0.86), lens=70)

    def sheet(name, configs, camera_obj, palette=None, cols=3):
        paths = []
        for i, cfg in enumerate(configs):
            if palette:
                apply_palette(mats, palette[i])
            show_only(base, parts, cfg)
            p = os.path.join(pdir, "parts", f"{name}_{i}.png")
            L.render(p, camera_obj, res=small, samples=24)
            paths.append(p)
        apply_palette(mats, "rubro")
        tile_images(paths, cols, os.path.join(pdir, f"sheet_{name}.png"), cell=small)
        return paths

    sheet("headgear", [["helmet_classic", "face_happy", "outfit_jumpsuit"], ["helmet_pilot", "face_happy", "outfit_jumpsuit"], ["helmet_wizard", "face_happy", "outfit_jumpsuit"]], cam)
    sheet("faces", [["face_happy"], ["face_angry"], ["face_surprised"]], cam_face)
    sheet("clothing", [["helmet_classic", "face_happy", "outfit_jumpsuit"], ["helmet_classic", "face_happy", "outfit_hoodie"], ["helmet_classic", "face_angry", "outfit_armor"]], cam)
    sheet("back", [["helmet_classic", "face_happy", "outfit_jumpsuit", "back_rocketpack"], ["helmet_pilot", "face_happy", "outfit_hoodie", "back_bombpack"]], cam_back, cols=2)
    combos = [
        ["helmet_classic", "face_happy", "outfit_jumpsuit", "acc_scarf"],
        ["helmet_pilot", "face_surprised", "outfit_hoodie", "back_rocketpack"],
        ["helmet_wizard", "face_happy", "outfit_jumpsuit", "back_bombpack"],
        ["helmet_classic", "face_angry", "outfit_armor"],
        ["helmet_pilot", "face_happy", "outfit_jumpsuit", "acc_scarf", "back_bombpack"],
    ]
    sheet("palettes", combos, cam, palette=list(PALETTES.keys()), cols=5)
    # Single-part previews referenced by the manifests.
    for pid in parts:
        cfg = [pid] if pid.startswith("face") else ["face_happy", pid] if pid.startswith("helmet") else ["helmet_classic", "face_happy", pid]
        show_only(base, parts, cfg)
        L.render(os.path.join(pdir, "parts", f"{pid}.png"), cam_back if pid.startswith("back") else cam_face if pid.startswith("face") else cam, res=(360, 420), samples=16)
    show_only(base, parts, hero)


def main():
    rig, base, parts, mats, acts = build_kit()
    base_info, entries = export_kit(rig, base, parts)
    write_manifests(base_info, entries, acts)
    if "--no-previews" not in sys.argv:
        render_previews(rig, base, parts, mats)
    L.save_blend("characters/adventurer_kit")


main()
