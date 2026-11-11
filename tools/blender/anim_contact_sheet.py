"""
Animation QA: loads a character GLB exactly as the game ships it and renders, for every action,
a side-view contact sheet (N evenly spaced frames in one PNG). Also prints per-clip metrics:
duration, hip height range, stride (front/back foot spread) and how far the first/last pose is
from Idle (to spot pops when clips blend).

Run:
  blender -b --factory-startup --python tools/blender/anim_contact_sheet.py -- <model.glb> <out_dir> [frames]
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Euler, Vector

args = sys.argv[sys.argv.index("--") + 1 :]
GLB, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])
N = int(args[2]) if len(args) > 2 else 8
W, H = 220, 260

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene
scene.render.fps = 24
rig = next(o for o in scene.objects if o.type == "ARMATURE")
rig.animation_data_create()

# Hide every expression except the default eyes (all live on the same face).
for m in bpy.data.materials:
    if m.name in ("EyeHappy", "EyeX") and m.node_tree:
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            bsdf.inputs["Alpha"].default_value = 0.0
            m.surface_render_method = "BLENDED"

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
scene.collection.objects.link(cam)
# Side view: the character faces the camera's left (−Y), so roll and gait read clearly.
cam.location = (3.4, -0.35, 0.75)
cam.rotation_euler = Euler((math.radians(85), 0, math.radians(90)))
cam.data.lens = 50
scene.camera = cam
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4
sun.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(60)))
scene.collection.objects.link(sun)
world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.3, 0.33, 1)
scene.world = world
# Floor line for reference.
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x = W
scene.render.resolution_y = H
scene.render.film_transparent = False
os.makedirs(OUT, exist_ok=True)

pb = rig.pose.bones


def world_of(name):
    return (rig.matrix_world @ pb[name].head).copy()


def pose_signature():
    return [q for b in pb for q in b.matrix.to_quaternion()]


idle = bpy.data.actions.get("Idle")
idle_sig = None
if idle:
    rig.animation_data.action = idle
    scene.frame_set(int(idle.frame_range[0]))
    idle_sig = np.array(pose_signature())

for act in bpy.data.actions:
    rig.animation_data.action = act
    f0, f1 = act.frame_range
    frames = [f0 + (f1 - f0) * i / (N - 1) for i in range(N)]
    tiles = []
    hips_z, spread = [], []
    for f in np.linspace(f0, f1, max(N, int(f1 - f0) + 1)):
        scene.frame_set(int(f), subframe=f - int(f))
        hips_z.append(world_of("hips").z)
        lf, rf = world_of("foot.L"), world_of("foot.R")
        spread.append(abs(lf.y - rf.y))
    for i, f in enumerate(frames):
        scene.frame_set(int(f), subframe=f - int(f))
        path = os.path.join(OUT, f"_tile_{i}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:]).reshape(H, W, 4)
        tiles.append(px)
        bpy.data.images.remove(img)
        os.remove(path)
    sheet = np.concatenate(tiles, axis=1)
    out = bpy.data.images.new(f"sheet_{act.name}", width=W * N, height=H, alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = os.path.join(OUT, f"sheet_{act.name}.png")
    out.file_format = "PNG"
    out.save()
    sig_start = sig_end = 0.0
    if idle_sig is not None:
        scene.frame_set(int(f0))
        sig_start = float(np.abs(np.array(pose_signature()) - idle_sig).mean())
        scene.frame_set(int(f1))
        sig_end = float(np.abs(np.array(pose_signature()) - idle_sig).mean())
    dur = (f1 - f0) / 24
    print(
        f"CLIP {act.name:8s} frames {f0:.0f}-{f1:.0f} ({dur:.2f}s) hipsZ {min(hips_z):.2f}..{max(hips_z):.2f} "
        f"footSpread max {max(spread):.3f} | pose vs Idle: start {sig_start:.3f} end {sig_end:.3f}"
    )
