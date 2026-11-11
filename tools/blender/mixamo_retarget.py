"""
4W rig ← Mixamo animation retargeting (Blender, headless).

Mixamo clips (FBX, "Without Skin", 30 fps) live in game-assets/mixamo/<Name>.fbx. For every clip in
CLIPS whose file exists, the hand-keyed action of the same name is replaced by a retargeted one.

Method: per mapped bone, the source's world-space rotation *relative to its rest pose* is applied to
the target's rest pose, after aligning the target rest bone direction to the source's (Mixamo rests
in T-pose; our arms rest angled down). Hip height is remapped to our proportions, horizontal root
motion is dropped (the game moves the character), and the arms are opened up a little so the big
fists clear the body. Mixamo animations are free to use in games (Adobe Mixamo terms); they are
downloaded by the project owner with their own account and are not redistributed as raw FBX.
"""

import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

SRC_FPS = 30

# action name → (file, first frame, last frame, vertical mode, lift when low)
#   vertical: "none" (no hip height change), "crouch" (only downward), "full"
CLIPS = {
    # Mocap is used only where it reads well on the chibi body (contact-sheet review, 2026-11-11).
    # Run / Jump / Roll / Slide / Throw / Victory are hand-keyed in chibi_actions.py: human mocap
    # pressed the fists into the belly, dug the big head into the floor and turned throws sideways.
    "Idle": ("Idle.fbx", 1, 61, "none", 0.0),
    "Defeat": ("Defeat.fbx", 1, 60, "full", 0.24),
}

# target bone → Mixamo bone (without the "mixamorigN:" prefix). Parents first.
MAP = [
    ("hips", "Hips"),
    ("chest", "Spine2"),
    ("head", "Head"),
    ("upper_arm.L", "LeftArm"),
    ("forearm.L", "LeftForeArm"),
    ("hand.L", "LeftHand"),
    ("thigh.L", "LeftUpLeg"),
    ("shin.L", "LeftLeg"),
    ("foot.L", "LeftFoot"),
    ("upper_arm.R", "RightArm"),
    ("forearm.R", "RightForeArm"),
    ("hand.R", "RightHand"),
    ("thigh.R", "RightUpLeg"),
    ("shin.R", "RightLeg"),
    ("foot.R", "RightFoot"),
]
NO_ALIGN = {"hips", "chest", "head"}
# Open the arms outward (rotation about the world front axis) so fists clear the round body.
ARM_BIAS_DEG = 22


def _arm_bias(tname):
    if tname.endswith(".L") and tname.split(".")[0] in ("upper_arm", "forearm", "hand"):
        return Quaternion((0, 1, 0), math.radians(-ARM_BIAS_DEG))
    if tname.endswith(".R") and tname.split(".")[0] in ("upper_arm", "forearm", "hand"):
        return Quaternion((0, 1, 0), math.radians(ARM_BIAS_DEG))
    return Quaternion()


def _import(path):
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    scene = bpy.context.scene
    fps, fps_base = scene.render.fps, scene.render.fps_base
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    # The FBX importer switches the scene to the file's 30 fps; the export timeline must stay at
    # the project's 24 fps or every hand-keyed clip would come out 25% faster.
    scene.render.fps, scene.render.fps_base = fps, fps_base
    new_objs = [o for o in bpy.data.objects if o not in before]
    new_actions = [a for a in bpy.data.actions if a not in before_actions]
    arm = next(o for o in new_objs if o.type == "ARMATURE")
    return arm, new_objs, new_actions


def retarget(rig, src, name, start, end, vertical, lift):
    scene = bpy.context.scene
    prefix = src.pose.bones[0].name.split(":")[0]
    Ms = src.matrix_world
    Mt = rig.matrix_world
    mt_rot_inv = Mt.to_quaternion().inverted()

    rest = {}
    for t, s in MAP:
        sb = src.data.bones[f"{prefix}:{s}"]
        tb = rig.data.bones[t]
        srest = (Ms @ sb.matrix_local).to_quaternion()
        trest = (Mt @ tb.matrix_local).to_quaternion()
        align = Quaternion()
        if t not in NO_ALIGN:
            sdir = (Ms.to_3x3() @ (sb.tail_local - sb.head_local)).normalized()
            tdir = (Mt.to_3x3() @ (tb.tail_local - tb.head_local)).normalized()
            align = tdir.rotation_difference(sdir)
        rest[t] = (srest, align @ trest)

    src_hips = src.pose.bones[f"{prefix}:Hips"]
    src_hips_rest_z = (Ms @ src.data.bones[f"{prefix}:Hips"].matrix_local).translation.z
    tgt_hips_rest = rig.data.bones["hips"].head_local.copy()
    ratio = tgt_hips_rest.z / max(1e-6, src_hips_rest_z)

    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action

    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)

    n = max(1, round((end - start) / SRC_FPS * scene.render.fps))
    prev = {}
    for i in range(n + 1):
        sf = start + i * (end - start) / n
        scene.frame_set(int(sf), subframe=sf - int(sf))
        for t, s in MAP:
            pb = rig.pose.bones[t]
            srest, trest = rest[t]
            q_src = (Ms @ src.pose.bones[f"{prefix}:{s}"].matrix).to_quaternion()
            q_t = _arm_bias(t) @ q_src @ srest.inverted() @ trest
            loc = pb.matrix.translation.copy()
            if t == "hips":
                z = (Ms @ src_hips.matrix).translation.z
                dz = (z - src_hips_rest_z) * ratio
                if vertical == "none":
                    dz = 0.0
                elif vertical == "crouch":
                    dz = min(0.0, dz)
                low = max(0.0, 1.0 - z / src_hips_rest_z)
                loc = Vector((tgt_hips_rest.x, tgt_hips_rest.y, tgt_hips_rest.z + dz + low * lift))
            pb.matrix = Matrix.LocRotScale(loc, mt_rot_inv @ q_t, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
            e = pb.rotation_euler.copy()
            if t in prev:
                e.make_compatible(prev[t])
            pb.rotation_euler = e
            prev[t] = e.copy()
        frame = i + 1
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("location", frame=frame)
    action.frame_range = (1, n + 1)
    return action


def apply_mixamo(rig, folder):
    """Replaces hand-keyed actions with retargeted Mixamo clips that exist in `folder`."""
    if not os.path.isdir(folder):
        return []
    done = []
    current = rig.animation_data.action if rig.animation_data else None
    for name, (file, start, end, vertical, lift) in CLIPS.items():
        path = os.path.join(folder, file)
        if not os.path.exists(path):
            continue
        src, objs, actions = _import(path)
        retarget(rig, src, name, start, end, vertical, lift)
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in actions:
            if a.users == 0 or a.name != name:
                bpy.data.actions.remove(a)
        done.append(name)
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
    idle = bpy.data.actions.get("Idle") or current
    if idle:
        rig.animation_data.action = idle
    print(f"[4walls] mixamo clips retargeted: {', '.join(done) or 'none'}")
    return done
