"""
4Walls — Phase 1 showcase: two connected world chunks, a biome transition and the character kit.

Assembles chunks from the modular kits (linked duplicates — never a single giant mesh), exports
each chunk as an instanced GLB + JSON layout manifest, renders the gameplay-camera previews and
saves the .blend scene.

Run (after character_kit.py and volcanic_kit.py):
  blender -b --factory-startup --python game-assets/blender/scripts/showcase.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bpy  # noqa: E402
from mathutils import Euler  # noqa: E402

import fw_lib as L  # noqa: E402
import volcanic_kit as VK  # noqa: E402

CHUNK = 16

# Legend: lowercase/punctuation = ground; uppercase/digits = object placed on the region's ground.
# "." = the region's default ground (so the same symbol works on both sides of a transition).
GROUND = {":": "vol_ground_basalt_b", "~": "vol_ground_cracked", ",": "vol_ground_ash", "L": "vol_lava_tile", "m": "trans_ground_mossy", "g": "for_ground_grass"}
OBJECTS = {
    "P": "vol_solid_column", "C": "crate_wood", "c": "crate_wood_damaged", "S": "stone_block", "s": "stone_block_damaged",
    "R": "vol_rock_a", "r": "vol_rock_b", "O": "vol_obsidian_cluster", "V": "hz_fire_vent_active", "v": "hz_fire_vent_idle",
    "w": "hz_fire_vent_warning", "B": "bomb_classic", "1": "pu_bomb_up", "2": "pu_fire_up", "3": "pu_speed_up",
    "T": "trans_dead_tree", "M": "for_mushroom_giant", "F": "for_tree_round", "b": "for_bush", "N": "sign_post_forest",
}

CHUNKS = [
    {
        "id": "vol_exploration_01",
        "biome": "volcanic_lands",
        "type": "exploration",
        "offset": (0, 0),
        # rows listed north (y = 15) → south (y = 0)
        # Exploration, not an arena: a winding basalt path, a lava pool, pockets of crates and
        # a few column clusters instead of a perfect pillar grid.
        "rows": [
            "RrRPRrRRrRPRrRRr",
            "r..:.,,.:.CC.:.R",
            "R.P..~...O..C.Pr",
            "r.C:.LLL..S...rR",
            "R..PLLLL.C..1..r",
            "rC..~LL..:.CC..R",
            "R.P..~..P.V..P.r",
            "r..S..~..B..~...",
            "RO...:.2..P.....",
            "r..CC..:..s..C.R",
            "R.PT...P.....P.r",
            "r.:..O..c..~3..R",
            "R..P.SS..P...wPr",
            "r..,,..C..S..:.R",
            "r..P....:..O...R",
            "RrRrRPRrRRrRPRrR",
        ],
        "region_ground": lambda x: "vol_ground_basalt_a" if (x * 7) % 3 else "vol_ground_basalt_b",
        "connections": {"east": {"cells": [[15, 7], [15, 8]], "to": ["transition:volcanic_lands>enchanted_forest", "volcanic_lands"], "gate": "gate_arch_vol_forest"}},
    },
    {
        "id": "trans_vol_forest_01",
        "biome": "transition:volcanic_lands>enchanted_forest",
        "type": "transition",
        "offset": (CHUNK, 0),
        "rows": [
            "RrRrRTrbFbFbFbFb",
            "r.:.,mm.mgggg.gF",
            "R~..mTmm.gMgg.gb",
            "r..C.m.SmgggbggF",
            "R:.~.m.mgg.Fg.gb",
            "r..m..Tm.gMg.ggF",
            "R.~.m.mmgNggg.gb",
            "..:..m.mmgg.gg..",
            "..2.mm.m.gg.ggg.",
            "R:.m.mTmgg.b.ggF",
            "r.~..m.mggMggg.b",
            "R..C.m.mg.gFgggF",
            "r.:.,mmTmgg.Mggb",
            "R~..m.m.mgggg.gF",
            "r..:.m.mgg.bgg.b",
            "RrRrRrbFbFbFbFbF",
        ],
        "region_ground": lambda x: "vol_ground_basalt_b" if x < 5 else "trans_ground_mossy" if x < 9 else "for_ground_grass",
        "connections": {
            "west": {"cells": [[0, 7], [0, 8]], "to": ["volcanic_lands"], "gate": "gate_arch_vol_forest"},
            "east": {"cells": [[15, 7], [15, 8]], "to": ["enchanted_forest"], "gate": None},
        },
    },
]


def assemble(chunk, kit, parent_col):
    col = L.collection(chunk["id"], parent_col)
    rows = chunk["rows"]
    assert len(rows) == CHUNK and all(len(r) == CHUNK for r in rows), chunk["id"]
    ox, oy = chunk["offset"]
    used = set()

    def place(asset_id, x, y, rot=0.0, z=0.0):
        src = kit[asset_id]
        o = bpy.data.objects.new(f"{chunk['id']}_{asset_id}_{x}_{y}", src.data)  # linked duplicate (shared mesh)
        o.location = (ox + x + 0.5, oy + y + 0.5, z)
        o.rotation_euler = Euler((0, 0, rot))
        col.objects.link(o)
        used.add(asset_id)
        return o

    for row_i, row in enumerate(rows):
        y = CHUNK - 1 - row_i
        for x, ch in enumerate(row):
            ground = GROUND.get(ch, chunk["region_ground"](x))
            place(ground, x, y, rot=(x * 3 + y * 5) % 4 * math.pi / 2)
            if ch in OBJECTS:
                aid = OBJECTS[ch]
                spin = ((x * 13 + y * 7) % 6) * math.pi / 3 if aid.startswith(("vol_rock", "for_", "trans_dead", "vol_obsidian")) else 0.0
                place(aid, x, y, rot=spin)
    return col, sorted(used)


def chunk_manifest(chunk, used):
    return {
        "id": chunk["id"],
        "biome": chunk["biome"],
        "type": chunk["type"],
        "dimensions": [CHUNK, CHUNK],
        "tileSize": 1,
        "origin": "south-west corner; cell (x, y) center = (x + 0.5, y + 0.5)",
        "rowsOrder": "north (y=15) to south (y=0)",
        "layout": chunk["rows"],
        "legend": {"ground": GROUND, "objects": OBJECTS, "default": "region ground (see regions)"},
        "connections": chunk["connections"],
        "assets": used,
        "model": f"/assets/world-chunks/{chunk['id']}.glb",
        "preview": "previews/environments/phase1_world_overview.png",
    }


def load_characters():
    path = os.path.join(L.BLEND_DIR, "characters", "adventurer_kit.blend")
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in ("4W_Rig", "adventurer_base") or n.startswith(("helmet_", "face_", "outfit_", "back_", "acc_"))]
        dst.actions = list(src.actions)
    return {o.name: o for o in dst.objects if o}


PALETTES = {
    "rubro": {"Helmet": "#ff5a3c", "Glove": "#ffd23f", "Accent": "#2a2130", "Outfit": "#c2412b"},
    "celeste": {"Helmet": "#2fb8ff", "Glove": "#e8f7ff", "Accent": "#1f3a66", "Outfit": "#2479c7"},
    "lima": {"Helmet": "#7ddc3a", "Glove": "#fff3a0", "Accent": "#2e4a1d", "Outfit": "#4f9a2a"},
    "ametista": {"Helmet": "#b46bff", "Glove": "#ffd6ff", "Accent": "#3a2160", "Outfit": "#7b3fd1"},
}


def spawn_character(src, col, name, parts, palette, action, loc, rot_deg):
    rig = src["4W_Rig"].copy()
    rig.name = f"{name}_rig"
    rig.hide_render = False
    col.objects.link(rig)
    rig.location = loc
    rig.rotation_euler = Euler((0, 0, math.radians(rot_deg)))
    rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions[action]
    mats = {}
    for slot, hexcol in PALETTES[palette].items():
        base = bpy.data.materials[slot]
        m = base.copy()
        m.name = f"{name}_{slot}"
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*L.srgb(hexcol), 1)
        mats[slot] = m
    for pid in ["adventurer_base"] + parts:
        o = src[pid].copy()
        o.name = f"{name}_{pid}"
        o.hide_render = False  # the appended originals are hidden; copies must render
        col.objects.link(o)
        o.parent = rig
        o.matrix_parent_inverse.identity()
        for mod in o.modifiers:
            if mod.type == "ARMATURE":
                mod.object = rig
        for ms in o.material_slots:
            if ms.material and ms.material.name in mats:
                slot_name = ms.material.name  # read before switching the slot to object-level (it starts empty)
                ms.link = "OBJECT"
                ms.material = mats[slot_name]
    return rig


def main():
    L.reset_scene()
    kit, mats = VK.build_kit()
    bpy.data.collections["Kit"].hide_render = True
    bpy.data.collections["Kit"].hide_viewport = True
    world_col = L.collection("World_Chunks")
    manifests = []
    for ch in CHUNKS:
        col, used = assemble(ch, kit, world_col)
        manifests.append((ch, col, used))

    # The connection: a gate on the shared edge (x = 16), spanning the two open cells (y = 7..8).
    gate = bpy.data.objects.new("gate_vol_forest", kit["gate_arch_vol_forest"].data)
    gate.location = (CHUNK, 8.0, 0)
    gate.rotation_euler = Euler((0, 0, math.radians(90)))
    world_col.objects.link(gate)
    # Under-world: magma sea on the volcanic side, dark meadow beyond the transition.
    sea = L.box("MagmaSea", (40, 40, 0.1), (-4, 8, -0.4), mat=mats["Lava"])
    L.uv_cube_project(sea, 4.0)
    meadow = L.box("Meadow", (30, 40, 0.1), (CHUNK + 15, 8, -0.38), mat=mats["GrassDark"])
    for o in (sea, meadow):
        L.move_to(o, world_col)

    # Characters (modular kit) to show the scale and personality in context.
    chars = L.collection("Characters_Showcase")
    src = load_characters()
    for o in src.values():
        o.hide_render = True
    spawn_character(src, chars, "hero", ["helmet_classic", "face_happy", "outfit_jumpsuit", "acc_scarf"], "rubro", "Run", (13.5, 8.0, 0), 90)
    spawn_character(src, chars, "pilot", ["helmet_pilot", "face_surprised", "outfit_hoodie", "back_rocketpack"], "celeste", "PlaceBomb", (9.5, 7.5, 0), 0)
    spawn_character(src, chars, "knight", ["helmet_classic", "face_angry", "outfit_armor"], "ametista", "Idle", (6.5, 4.5, 0), 20)
    spawn_character(src, chars, "wizard", ["helmet_wizard", "face_happy", "outfit_jumpsuit", "back_bombpack"], "lima", "Victory", (CHUNK + 3.5, 7.5, 0), -30)
    bpy.context.scene.frame_set(6)

    # Lighting: CC0 sunset HDRI + warm key sun.
    L.setup_world(strength=0.7)
    L.sun("Key", 3.4, (50, 10, 40))
    L.sun("Fill", 0.8, (70, 0, 220), color="#ffc9a8")

    pdir = os.path.join(L.PREVIEW_DIR, "environments")
    overview = L.iso_camera("CamOverview", (CHUNK, 8, 0), 70, 30.5, elevation=52, azimuth=-20)
    L.render(os.path.join(pdir, "phase1_world_overview.png"), overview, res=(1920, 1080), samples=48)
    gameplay = L.iso_camera("CamGameplay", (8.5, 7.5, 0), 50, 14.5, elevation=57, azimuth=-12)
    L.render(os.path.join(pdir, "phase1_gameplay_volcanic.png"), gameplay, res=(1920, 1080), samples=48)
    transition = L.iso_camera("CamTransition", (CHUNK + 1.5, 8, 0.6), 50, 13, elevation=45, azimuth=-30)
    L.render(os.path.join(pdir, "phase1_transition_gate.png"), transition, res=(1920, 1080), samples=48)

    # Exports: each chunk as an instanced GLB (shared meshes) + its layout manifest.
    for ch, col, used in manifests:
        objs = list(col.objects)
        for o in objs:
            o.location.x -= ch["offset"][0]
        L.export_glb(objs, f"world-chunks/{ch['id']}")
        for o in objs:
            o.location.x += ch["offset"][0]
        L.write_manifest(f"world-chunks/{ch['id']}", chunk_manifest(ch, used))
    write_biome_manifests()
    L.save_blend("showcase/phase1_showcase")


def write_biome_manifests():
    L.write_manifest("biomes/volcanic_lands", {
        "id": "volcanic_lands",
        "name": "Terras Vulcânicas",
        "palette": {"ground": "#5b4c66", "accent": "#ff5a0a", "secondary": "#a38877", "sky": "#2a1a1e"},
        "ground": ["vol_ground_basalt_a", "vol_ground_basalt_b", "vol_ground_cracked", "vol_ground_ash", "vol_lava_tile"],
        "solid": ["vol_solid_column", "vol_rock_a", "vol_rock_b"],
        "destructible": ["crate_wood", "stone_block"],
        "props": ["vol_obsidian_cluster"],
        "hazards": ["hz_fire_vent_idle", "hz_fire_vent_warning", "hz_fire_vent_active", "hz_fire_vent_disabled"],
        "enemies": ["magmite (in game)", "lava_monster (planned)"],
        "boss": {"id": "golem_vulcanico", "status": "planned (Phase 6)", "arena": "vol_boss_arena_01 (planned)"},
        "landmark": "erupting caldera (planned)",
        "transitions": [{"to": "enchanted_forest", "via": "trans_vol_forest_01", "assets": ["trans_ground_mossy", "trans_dead_tree", "gate_arch_vol_forest"]}],
        "music": "volcano",
    })
    L.write_manifest("biomes/enchanted_forest", {
        "id": "enchanted_forest",
        "name": "Floresta Encantada",
        "palette": {"ground": "#6fae3e", "accent": "#d83a52", "secondary": "#7cc24a", "sky": "#132219"},
        "ground": ["for_ground_grass"],
        "props": ["for_tree_round", "for_bush", "for_mushroom_giant"],
        "destructible": ["crate_wood"],
        "status": "transition pieces done; full kit in art Phase 5",
        "transitions": [{"to": "volcanic_lands", "via": "trans_vol_forest_01"}],
        "music": "forest",
    })
    L.write_manifest("world/world_graph_example", {
        "note": "Art-side example of how chunks chain into a continuous world. Generation logic lives in the game, not here.",
        "regions": [
            {"biome": "volcanic_lands", "chunks": ["vol_exploration_01", "vol_exploration_01*mirrored", "vol_boss_arena_01 (planned)"]},
            {"biome": "transition:volcanic_lands>enchanted_forest", "chunks": ["trans_vol_forest_01"]},
            {"biome": "enchanted_forest", "chunks": ["for_exploration_01 (planned)"]},
        ],
        "rules": {
            "chunkSize": [CHUNK, CHUNK],
            "connectors": "edge cells listed in each chunk's 'connections'; neighbours must open the matching cells",
            "transitions": "a biome change always goes through a transition chunk whose west/east regions match each biome",
        },
    })


main()
