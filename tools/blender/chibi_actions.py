"""
Hand-keyed animations tailored to the chibi body (huge head, short limbs).

Human mocap reads badly on these proportions (fists stuck to the belly, the head digging into the
floor during rolls, throws that turn the body sideways), so locomotion and action clips are keyed
here; only Idle and Defeat come from Mixamo (see mixamo_retarget.py).

Pose-bone conventions on 4W_Rig (verified with contact sheets):
  - thigh X < 0 swings the leg forward; shin X > 0 bends the knee.
  - upper_arm X < 0 swings the arm forward/up; upper_arm Z < 0 (L) / > 0 (R) raises it sideways.
  - chest/head X > 0 leans forward; Y twists.
  - root/hips: local Y = world up, local Z = world forward; root X > 0 tips forward.
"""

import math

import bpy


def _replace(name):
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)


def _mirror(pose):
    """Left/right mirror of a pose dict (swaps .L/.R, flips Y/Z rotations)."""
    out = {}
    for bone, v in pose.items():
        if bone.endswith(".L"):
            target = bone[:-2] + ".R"
        elif bone.endswith(".R"):
            target = bone[:-2] + ".L"
        else:
            target = bone
        if isinstance(v, tuple) and v and isinstance(v[0], str):
            out[target] = v
        else:
            out[target] = (v[0], -v[1], -v[2])
    return out


def build_chibi_actions(rig, new_action):
    acts = []

    # ── Run: springy chibi run, 0.5 s loop (the game scales it with movement speed). ──
    # Contact (leg reaching forward, body low) → passing (high knee, body up) → mirrored.
    contact = {
        "hips": ("loc", (0, -0.02, 0)),
        "chest": (14, 8, 0),
        "head": (-6, -6, 0),
        "thigh.L": (-55, 0, 0), "shin.L": (12, 0, 0),
        "thigh.R": (38, 0, 0), "shin.R": (70, 0, 0),
        "upper_arm.L": (50, 0, -38), "forearm.L": (-22, 0, 0),
        "upper_arm.R": (-60, 0, 38), "forearm.R": (-30, 0, 0),
    }
    passing = {
        "hips": ("loc", (0, 0.035, 0)),
        "chest": (10, 0, 0),
        "head": (-4, 0, 0),
        "thigh.L": (-5, 0, 0), "shin.L": (8, 0, 0),
        "thigh.R": (-62, 0, 0), "shin.R": (105, 0, 0),
        "upper_arm.L": (5, 0, -42), "forearm.L": (-25, 0, 0),
        "upper_arm.R": (-5, 0, 42), "forearm.R": (-25, 0, 0),
    }
    _replace("Run")
    acts.append(new_action(rig, "Run", 13, True, [
        (1, contact), (4, passing), (7, _mirror(contact)), (10, _mirror(passing)), (13, contact),
    ]))

    # ── Roll: a ball-like forward roll around the body center (head tucked so it never digs in). ──
    def roll_root(deg, pivot=0.55, h=0.55):
        th = math.radians(deg)
        return ("rotloc", (deg, 0, 0), (0, pivot - h * math.cos(th), -h * math.sin(th)))

    tuck = {
        "thigh.L": (-110, 0, 0), "thigh.R": (-110, 0, 0),
        "shin.L": (125, 0, 0), "shin.R": (125, 0, 0),
        "upper_arm.L": (-60, 0, -10), "upper_arm.R": (-60, 0, 10),
        "forearm.L": (-80, 0, 0), "forearm.R": (-80, 0, 0),
        "chest": (30, 0, 0), "head": (35, 0, 0),
    }
    crouch = {
        "hips": ("loc", (0, -0.07, 0)),
        "thigh.L": (-45, 0, 0), "thigh.R": (-45, 0, 0), "shin.L": (80, 0, 0), "shin.R": (80, 0, 0),
        "upper_arm.L": (-40, 0, -15), "upper_arm.R": (-40, 0, 15), "chest": (25, 0, 0), "head": (15, 0, 0),
    }
    _replace("Roll")
    acts.append(new_action(rig, "Roll", 13, False, [
        (1, crouch),
        # Pivot height = distance from the body center to whatever is touching the floor:
        # the big head (~0.55) while upside down, the tucked back/legs (~0.36) afterwards.
        (3, {"root": roll_root(60, 0.47), **tuck}),
        (5, {"root": roll_root(150, 0.55), **tuck}),
        (7, {"root": roll_root(240, 0.38), **tuck}),
        (9, {"root": roll_root(320, 0.42), **tuck}),
        (11, {"root": roll_root(360, 0.5), **crouch}),
        (13, {"root": ("rotloc", (360, 0, 0), (0, 0, 0))}),
    ]))

    # ── Jump: anticipation → take-off → tuck at the apex → reach → land (game adds the arc). ──
    _replace("Jump")
    acts.append(new_action(rig, "Jump", 13, False, [
        (1, {"hips": ("loc", (0, -0.08, 0)), "thigh.L": (-45, 0, 0), "thigh.R": (-45, 0, 0), "shin.L": (85, 0, 0), "shin.R": (85, 0, 0),
             "upper_arm.L": (45, 0, -20), "upper_arm.R": (45, 0, 20), "chest": (22, 0, 0), "head": (8, 0, 0)}),
        (3, {"thigh.L": (8, 0, 0), "thigh.R": (12, 0, 0), "shin.L": (4, 0, 0), "shin.R": (8, 0, 0),
             "upper_arm.L": (-95, 0, -40), "upper_arm.R": (-95, 0, 40), "chest": (-10, 0, 0), "head": (-14, 0, 0)}),
        (6, {"thigh.L": (-75, 0, 0), "thigh.R": (-65, 0, 0), "shin.L": (110, 0, 0), "shin.R": (100, 0, 0),
             "upper_arm.L": (-30, 0, -75), "upper_arm.R": (-30, 0, 75), "forearm.L": (-25, 0, 0), "forearm.R": (-25, 0, 0), "chest": (6, 0, 0)}),
        (9, {"thigh.L": (-25, 0, 0), "thigh.R": (-15, 0, 0), "shin.L": (25, 0, 0), "shin.R": (15, 0, 0),
             "upper_arm.L": (-10, 0, -60), "upper_arm.R": (-10, 0, 60), "chest": (-4, 0, 0), "head": (-6, 0, 0)}),
        (11, {"hips": ("loc", (0, -0.09, 0)), "thigh.L": (-50, 0, 0), "thigh.R": (-50, 0, 0), "shin.L": (90, 0, 0), "shin.R": (90, 0, 0),
              "upper_arm.L": (-35, 0, -35), "upper_arm.R": (-35, 0, 35), "chest": (18, 0, 0)}),
        (13, {}),
    ]))

    # ── Slide (kick / ice): drop into a feet-first slide and hold it; the game blends out. ──
    slide = {
        "root": ("rotloc", (-28, 0, 0), (0, -0.04, 0.0)),
        "thigh.L": (-80, 0, 0), "shin.L": (5, 0, 0),
        "thigh.R": (-30, 0, -8), "shin.R": (100, 0, 0),
        "upper_arm.L": (45, 0, -40), "upper_arm.R": (45, 0, 40),
        "forearm.L": (-20, 0, 0), "forearm.R": (-20, 0, 0),
        "chest": (14, 0, 0), "head": (24, 0, 0),
    }
    _replace("Slide")
    acts.append(new_action(rig, "Slide", 11, False, [
        (1, {"chest": (12, 0, 0), "thigh.L": (-30, 0, 0), "shin.L": (30, 0, 0), "hips": ("loc", (0, -0.03, 0))}),
        (4, slide),
        (8, {**slide, "head": (20, 0, 6)}),
        (11, slide),
    ]))

    # ── Throw (glove): facing forward, wind the right arm up and back, lob it over the head. ──
    _replace("Throw")
    acts.append(new_action(rig, "Throw", 11, False, [
        (1, {}),
        (3, {"chest": (-12, 20, 0), "head": (-6, -8, 0), "upper_arm.R": (55, 0, 100), "forearm.R": (-85, 0, 0),
             "upper_arm.L": (-40, 0, -35), "thigh.L": (-25, 0, 0), "shin.L": (25, 0, 0), "hips": ("loc", (0, -0.02, 0))}),
        (6, {"chest": (16, -18, 0), "head": (8, 8, 0), "upper_arm.R": (-125, 0, 30), "forearm.R": (-15, 0, 0),
             "upper_arm.L": (30, 0, -25), "thigh.R": (-25, 0, 0), "shin.R": (25, 0, 0)}),
        (8, {"chest": (10, -8, 0), "upper_arm.R": (-70, 0, 20), "forearm.R": (-30, 0, 0), "upper_arm.L": (10, 0, -20)}),
        (11, {}),
    ]))

    # ── Victory: little hops with fists pumped out to the sides (visible past the big head). ──
    up = {"root": ("loc", (0, 0.2, 0)), "upper_arm.L": (-30, 0, -95), "upper_arm.R": (-30, 0, 95),
          "forearm.L": (-50, 0, 0), "forearm.R": (-50, 0, 0), "head": (-12, 0, 0),
          "thigh.L": (-35, 0, 0), "thigh.R": (-25, 0, 0), "shin.L": (60, 0, 0), "shin.R": (50, 0, 0)}
    down = {"hips": ("loc", (0, -0.05, 0)), "upper_arm.L": (-15, 0, -60), "upper_arm.R": (-15, 0, 60),
            "forearm.L": (-70, 0, 0), "forearm.R": (-70, 0, 0), "head": (6, 0, 0),
            "thigh.L": (-30, 0, 0), "thigh.R": (-30, 0, 0), "shin.L": (55, 0, 0), "shin.R": (55, 0, 0)}
    _replace("Victory")
    acts.append(new_action(rig, "Victory", 21, True, [(1, down), (7, up), (11, {**up, "head": (-16, 0, 8)}), (16, down), (21, down)]))

    return acts
