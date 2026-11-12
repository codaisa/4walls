"""
4Walls — camp props (Task 3 · A5): the campfire, the residents' tent, the vault and the journey board.

Run:  blender --background --python tools/blender/camp_props.py
Writes apps/web/public/models/camp_{fire,tent,vault,board}.glb (one cell ≈ 1 unit, Z up here,
facing -Y → +Z in three.js). The tent's cloth uses the material "Canvas", recolored in game per
service; flames stay procedural in the game (they flicker), only the hearth is modeled here.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'public', 'models')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


MATS = {}


def mat(name, hexcol, rough=0.7, metal=0.0, emission=None, strength=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexcol)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emission:
        b.inputs['Emission Color'].default_value = srgb(emission)
        b.inputs['Emission Strength'].default_value = strength
    MATS[name] = m
    return m


def put(o, m, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=False):
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    o.data.materials.clear()
    o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def cube(m, size, loc, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    put(o, m, loc, rot, size)
    if bevel:
        mod = o.modifiers.new('b', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return o


def cyl(m, r, depth, loc, rot=(0, 0, 0), verts=10, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts)
    return put(bpy.context.active_object, m, loc, rot)


def rock(m, r, loc, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=1)
    o = bpy.context.active_object
    for i, v in enumerate(o.data.vertices):
        k = 0.82 + 0.3 * abs(math.sin(seed * 12.9898 + i * 78.233))
        v.co *= k
    put(o, m, loc, (0, 0, seed), (1, 1, 0.62))
    return o


def export(name):
    for o in bpy.context.scene.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    os.makedirs(OUT, exist_ok=True)
    path = os.path.abspath(os.path.join(OUT, f'{name}.glb'))
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    print('wrote', path)


# ───────────────────────────── campfire hearth ─────────────────────────────

def build_fire():
    reset()
    MATS.clear()
    stone = mat('Stone', '#6a5f66', 0.9)
    stone2 = mat('StoneDark', '#4a424a', 0.95)
    wood = mat('Log', '#5b3a22', 0.85)
    bark = mat('Bark', '#3e2716', 0.95)
    ash = mat('Ash', '#2a2224', 1.0)
    ember = mat('Ember', '#ff5a1f', 0.6, emission='#ff6a1a', strength=3.0)
    for i in range(10):
        a = i / 10 * math.tau
        rock(stone if i % 2 else stone2, 0.12, (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.06), i + 1)
    cyl(ash, 0.33, 0.04, (0, 0, 0.02), verts=16)
    for i in range(4):
        a = i / 4 * math.pi + 0.3
        cyl(wood if i % 2 else bark, 0.06, 0.68, (0, 0, 0.16), (math.radians(68), 0, a), verts=7)
    for i in range(6):
        a = i / 6 * math.tau + 0.4
        rock(ember, 0.045, (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.05), i + 20)
    # A log bench on one side.
    cyl(bark, 0.07, 0.5, (0.0, 0.78, 0.08), (0, math.radians(90), 0), verts=8)
    export('camp_fire')


# ───────────────────────────── tent ─────────────────────────────

def build_tent():
    reset()
    MATS.clear()
    canvas = mat('Canvas', '#f2e6cc', 0.85)
    trim = mat('Trim', '#7a4a26', 0.8)
    pole = mat('Pole', '#5b3a22', 0.8)
    dark = mat('Inside', '#1d1416', 1.0)
    rope = mat('Rope', '#c9b28a', 0.9)
    w, d, h = 0.9, 0.92, 1.15
    # Two slanted cloth sides (an A-frame), slightly sagging.
    bm = bmesh.new()
    verts = [
        Vector((-w / 2, -d / 2, 0.02)), Vector((0, -d / 2, h)), Vector((w / 2, -d / 2, 0.02)),
        Vector((-w / 2, d / 2, 0.02)), Vector((0, d / 2, h)), Vector((w / 2, d / 2, 0.02)),
    ]
    v = [bm.verts.new(p) for p in verts]
    f0 = bm.faces.new([v[0], v[1], v[4], v[3]])
    f1 = bm.faces.new([v[1], v[2], v[5], v[4]])
    f0.material_index = 0
    f1.material_index = 1  # the shaded side (recolored darker in game)
    # Back wall.
    bm.faces.new([v[3], v[4], v[5]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('cloth')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('cloth', me)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.data.materials.append(canvas)
    o.data.materials.append(mat('CanvasShade', '#c9bca2', 0.9))
    sol = o.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.025
    # The door: a dark triangle with the two flaps folded back.
    bm = bmesh.new()
    a, b, c = bm.verts.new((-0.22, -d / 2 - 0.005, 0.02)), bm.verts.new((0, -d / 2 - 0.005, h * 0.62)), bm.verts.new((0.22, -d / 2 - 0.005, 0.02))
    bm.faces.new([a, c, b])
    me = bpy.data.meshes.new('door')
    bm.to_mesh(me)
    bm.free()
    door = bpy.data.objects.new('door', me)
    bpy.context.collection.objects.link(door)
    door.data.materials.append(dark)
    for s in (-1, 1):
        bm = bmesh.new()
        p0 = bm.verts.new((s * 0.22, -d / 2 - 0.01, 0.02))
        p1 = bm.verts.new((0, -d / 2 - 0.01, h * 0.62))
        p2 = bm.verts.new((s * 0.36, -d / 2 - 0.08, 0.22))
        bm.faces.new([p0, p1, p2] if s > 0 else [p0, p2, p1])
        me = bpy.data.meshes.new('flap')
        bm.to_mesh(me)
        bm.free()
        f = bpy.data.objects.new('flap', me)
        bpy.context.collection.objects.link(f)
        f.data.materials.append(canvas)
        f.modifiers.new('s', 'SOLIDIFY').thickness = 0.02
    # A darker band along the ridge so the roof reads from the top camera.
    for s in (-1, 1):
        cube(trim, (0.1, d + 0.04, 0.03), (s * 0.04, 0, h - 0.04), (0, s * math.atan2(w / 2, h), 0))
    # Ridge pole, front and back poles, trim along the bottom.
    cyl(pole, 0.025, d + 0.16, (0, 0, h + 0.01), (math.radians(90), 0, 0), verts=6)
    for y in (-d / 2 - 0.06, d / 2 + 0.06):
        cyl(pole, 0.025, h + 0.12, (0, y, (h + 0.12) / 2), verts=6)
    for s in (-1, 1):
        cube(trim, (0.04, d + 0.02, 0.04), (s * (w / 2 - 0.01), 0, 0.03))
        # Guy ropes and pegs.
        cyl(rope, 0.008, 0.5, (s * 0.52, -d / 2 - 0.1, 0.22), (math.radians(60), 0, math.radians(s * 35)), verts=4)
        cyl(pole, 0.02, 0.1, (s * 0.62, -d / 2 - 0.24, 0.03), verts=5)
    # A pennant on top.
    cyl(pole, 0.012, 0.3, (0, -d / 2 - 0.06, h + 0.25), verts=5)
    cube(canvas, (0.16, 0.01, 0.1), (0.09, -d / 2 - 0.06, h + 0.33))
    export('camp_tent')


# ───────────────────────────── vault ─────────────────────────────

def build_vault():
    reset()
    MATS.clear()
    iron = mat('Iron', '#3d3942', 0.45, metal=0.85)
    iron2 = mat('IronDark', '#26232a', 0.55, metal=0.8)
    gold = mat('Gold', '#f2b622', 0.25, metal=0.9, emission='#7a4a00', strength=0.4)
    wood = mat('Wood', '#5e3216', 0.8)
    cube(wood, (0.66, 0.5, 0.06), (0, 0, 0.03))
    cube(iron, (0.6, 0.46, 0.42), (0, 0, 0.27), bevel=0.02)
    cube(iron2, (0.62, 0.48, 0.05), (0, 0, 0.48), bevel=0.01)
    for x in (-0.2, 0.2):
        cube(gold, (0.05, 0.48, 0.44), (x, 0, 0.27))
    # Rivets.
    for x in (-0.26, -0.13, 0, 0.13, 0.26):
        for z in (0.1, 0.42):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, segments=8, ring_count=6)
            put(bpy.context.active_object, gold, (x, -0.235, z))
    # Padlock.
    cube(gold, (0.12, 0.05, 0.12), (0, -0.25, 0.26), bevel=0.01)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.045, minor_radius=0.012, major_segments=16, minor_segments=6)
    put(bpy.context.active_object, iron, (0, -0.25, 0.34), (math.radians(90), 0, 0))
    export('camp_vault')


# ───────────────────────────── journey board ─────────────────────────────

def build_board():
    reset()
    MATS.clear()
    wood = mat('Wood', '#7a4a26', 0.8)
    dark = mat('WoodDark', '#4a2d16', 0.85)
    paper = mat('Paper', '#f1e4c2', 0.9)
    ink = mat('Ink', '#3a2a22', 0.9)
    pin = mat('Pin', '#d9534f', 0.4)
    for x in (-0.34, 0.34):
        cube(dark, (0.07, 0.07, 1.0), (x, 0, 0.5))
    cube(wood, (0.78, 0.06, 0.5), (0, 0, 0.72), bevel=0.01)
    cube(dark, (0.84, 0.08, 0.06), (0, 0, 1.0))
    cube(dark, (0.84, 0.08, 0.05), (0, 0, 0.46))
    sheets = [(-0.2, 0.78, 0.22, 0.26, 0.08), (0.06, 0.7, 0.2, 0.24, -0.06), (0.25, 0.8, 0.16, 0.2, 0.1)]
    for x, z, w, h, r in sheets:
        cube(paper, (w, 0.008, h), (x, -0.036, z), (0, r, 0))
        for k in range(3):
            cube(ink, (w * 0.7, 0.004, 0.012), (x, -0.042, z + h * 0.25 - k * 0.06), (0, r, 0))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.016, segments=8, ring_count=6)
        put(bpy.context.active_object, pin, (x, -0.05, z + h / 2 - 0.02))
    export('camp_board')


build_fire()
build_tent()
build_vault()
build_board()
