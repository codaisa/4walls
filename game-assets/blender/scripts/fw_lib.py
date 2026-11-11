"""
4Walls art pipeline — shared Blender helpers (Blender 5.x, runs headless).

Conventions (see docs/BLENDER_PIPELINE.md):
  * 1 grid tile = 1 Blender unit; Z up in Blender (exported as Y up).
  * Characters face -Y; origin at the center of the feet; ~1.2 units tall.
  * Tiles/blocks: origin at the tile center, resting on Z = 0.
  * Material names are stable identifiers the game relies on (e.g. "Helmet", "Suit").
"""

import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))  # game-assets/
REPO = os.path.dirname(ROOT)
TEX_DOWNLOADED = os.path.join(ROOT, "textures", "downloaded")
TEX_PROCESSED = os.path.join(ROOT, "textures", "processed")
GLB_DIR = os.path.join(ROOT, "glb")
PREVIEW_DIR = os.path.join(ROOT, "previews")
MANIFEST_DIR = os.path.join(ROOT, "manifests")
BLEND_DIR = os.path.join(ROOT, "blender")
WEB_ASSETS = os.path.join(REPO, "apps", "web", "public", "assets")


# ───────────────────────────── scene ─────────────────────────────


def reset_scene(fps=24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = fps
    return bpy.context.scene


def collection(name, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    parent = parent or bpy.context.scene.collection
    if col.name not in [c.name for c in parent.children]:
        parent.children.link(col)
    return col


def move_to(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifiers(obj):
    activate(obj)
    for m in list(obj.modifiers):
        if m.type == "ARMATURE":
            continue
        bpy.ops.object.modifier_apply(modifier=m.name)


def apply_transform(obj, loc=False, rot=True, scale=True):
    activate(obj)
    bpy.ops.object.transform_apply(location=loc, rotation=rot, scale=scale)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    return o


def set_origin(obj, point):
    """Moves the object origin to a world-space point without moving the geometry."""
    cursor = bpy.context.scene.cursor
    prev = cursor.location.copy()
    cursor.location = point
    activate(obj)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    cursor.location = prev


def shade_smooth(obj, angle=None):
    for p in obj.data.polygons:
        p.use_smooth = True
    if angle is not None:
        # Keep hard edges crisp (blocks, crates) while curved parts stay smooth.
        try:
            activate(obj)
            bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
        except Exception:
            pass


def subdivide(obj, levels=1):
    m = obj.modifiers.new("Subsurf", "SUBSURF")
    m.levels = m.render_levels = levels
    apply_modifiers(obj)


def bevel(obj, width=0.03, segments=3):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    apply_modifiers(obj)


def tri_count(obj):
    if obj.type != "MESH":
        return 0
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# ───────────────────────────── geometry primitives ─────────────────────────────


def _named(name):
    o = bpy.context.active_object
    o.name = name
    if o.data:
        o.data.name = name
    return o


def uv_sphere(name, r, loc=(0, 0, 0), scale=(1, 1, 1), seg=32, rings=16, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc, rotation=rot)
    o = _named(name)
    o.scale = scale
    apply_transform(o)
    shade_smooth(o)
    if mat:
        assign(o, mat)
    return o


def ico(name, r, loc=(0, 0, 0), subdiv=2, scale=(1, 1, 1), mat=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = _named(name)
    o.scale = scale
    apply_transform(o)
    if mat:
        assign(o, mat)
    return o


def cyl(name, r1, r2, depth, loc=(0, 0, 0), verts=24, rot=(0, 0, 0), mat=None, bevel_w=0.0, smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = _named(name)
    if bevel_w:
        bevel(o, bevel_w, 3)
    if smooth:
        shade_smooth(o, 35)
    if mat:
        assign(o, mat)
    return o


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel_w=0.0, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = _named(name)
    o.scale = size
    apply_transform(o)
    if bevel_w:
        bevel(o, bevel_w, segments)
    shade_smooth(o, 35)
    if mat:
        assign(o, mat)
    return o


def torus(name, major, minor, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), mat=None, seg=40, mseg=12):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot, major_segments=seg, minor_segments=mseg)
    o = _named(name)
    o.scale = scale
    apply_transform(o)
    shade_smooth(o)
    if mat:
        assign(o, mat)
    return o


def tube(name, points, radius, mat=None, resolution=10, taper_end=1.0):
    """Bevelled bezier curve converted to a mesh (fuses, brows, smiles, scarf tails)."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.resolution_u = resolution
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for i, (bp, p) in enumerate(zip(spline.bezier_points, points)):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        t = i / max(1, len(points) - 1)
        bp.radius = 1.0 + (taper_end - 1.0) * t
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    activate(o)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    o.name = name
    shade_smooth(o)
    if mat:
        assign(o, mat)
    return o


def mesh_from(name, verts, faces, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if mat:
        assign(o, mat)
    return o


def delete_verts(obj, predicate):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if predicate(v.co)], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def solidify(obj, thickness):
    m = obj.modifiers.new("Solid", "SOLIDIFY")
    m.thickness = thickness
    m.offset = 1.0
    apply_modifiers(obj)


def displace_noise(obj, strength=0.05, size=0.3, seed=0):
    """Organic wobble for rocks and stones (procedural, deterministic)."""
    tex = bpy.data.textures.new(f"noise_{obj.name}", "VORONOI" if seed % 2 else "CLOUDS")
    tex.noise_scale = size
    m = obj.modifiers.new("Displace", "DISPLACE")
    m.texture = tex
    m.strength = strength
    m.texture_coords = "LOCAL"
    obj.location.x += seed * 0.0  # keep deterministic; noise varies by texture type
    apply_modifiers(obj)


def uv_cube_project(obj, size=1.0):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=size)
    bpy.ops.object.mode_set(mode="OBJECT")


def place_on_sphere(obj, center, radius, yaw_deg, pitch_deg, lift=0.0):
    """Puts obj on a sphere surface (front = -Y), oriented along the normal (obj front = -Y)."""
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    n = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    obj.location = Vector(center) + n * (radius + lift)
    obj.rotation_euler = n.to_track_quat("-Y", "Z").to_euler()
    return n


# ───────────────────────────── materials ─────────────────────────────


def srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def _bsdf(mat):
    mat.use_nodes = True
    return mat.node_tree.nodes.get("Principled BSDF")


def flat_mat(name, hexcolor, rough=0.5, metal=0.0, emission=None, strength=0.0, coat=0.0, alpha=1.0):
    """Clean stylized material: one color, controlled gloss. The game may recolor by name."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = _bsdf(mat)
    col = srgb(hexcolor)
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    if emission:
        b.inputs["Emission Color"].default_value = (*srgb(emission), 1)
        b.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try:
            mat.surface_render_method = "BLENDED"
        except Exception:
            pass
    mat.diffuse_color = (*col, alpha)
    return mat


def _image(path, colorspace="sRGB"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def tex_mat(name, color_path, normal_path=None, rough_path=None, normal_strength=0.5, rough=None, emission_path=None, emission_hex=None, emission_strength=0.0, uv_scale=1.0):
    """Exportable textured PBR (Image → BSDF links only, so glTF keeps every map)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = _bsdf(mat)
    nt = mat.node_tree
    mapping = None
    if uv_scale != 1.0:
        uvn = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, 1)
        nt.links.new(uvn.outputs["UV"], mapping.inputs["Vector"])

    def tex(path, cs):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = _image(path, cs)
        if mapping:
            nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
        return n

    nt.links.new(tex(color_path, "sRGB").outputs["Color"], b.inputs["Base Color"])
    if normal_path:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex(normal_path, "Non-Color").outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    if rough_path:
        nt.links.new(tex(rough_path, "Non-Color").outputs["Color"], b.inputs["Roughness"])
    elif rough is not None:
        b.inputs["Roughness"].default_value = rough
    if emission_path:
        nt.links.new(tex(emission_path, "sRGB").outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emission_strength
    elif emission_hex:
        b.inputs["Emission Color"].default_value = (*srgb(emission_hex), 1)
        b.inputs["Emission Strength"].default_value = emission_strength
    return mat


# ───────────────────────────── texture processing (realistic → stylized) ─────────────────────────────


def stylize_texture(src, dst, tint_hex, detail=0.55, contrast=1.4, size=512, levels=6, warm=0.0):
    """
    Adapts a photographic CC0 texture to the cartoon direction:
    luminance → contrast-boosted detail → posterized → multiplied over a flat art-directed tint.
    The original file is never modified; the result is written to textures/processed/.
    """
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        return dst
    img = bpy.data.images.load(src)
    img.scale(size, size)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    lum = px[..., 0] * 0.299 + px[..., 1] * 0.587 + px[..., 2] * 0.114
    lum = (lum - lum.mean()) * contrast
    lum = np.clip(lum, -0.5, 0.5)
    lum = np.round(lum * levels) / levels  # soft posterization = painted feel
    tint = np.array(srgb_display(tint_hex), dtype=np.float32)
    shade = 1.0 + lum * detail
    out = np.empty_like(px)
    out[..., :3] = np.clip(tint[None, None, :] * shade[..., None], 0, 1)
    if warm:
        out[..., 0] = np.clip(out[..., 0] + warm * (lum + 0.5) * 0.1, 0, 1)
    out[..., 3] = 1
    res = bpy.data.images.new(os.path.basename(dst), size, size)
    res.pixels[:] = out.ravel()
    res.filepath_raw = dst
    res.file_format = "JPEG"
    res.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(res)
    return dst


def resize_map(src, dst, size=512, gain=1.0, bias=0.0):
    """Down-sizes a data map (normal/roughness/emission) and optionally remaps its values."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        return dst
    img = bpy.data.images.load(src)
    img.colorspace_settings.name = "Non-Color"
    img.scale(size, size)
    if gain != 1.0 or bias:
        px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
        px[..., :3] = np.clip(px[..., :3] * gain + bias, 0, 1)
        img.pixels[:] = px.ravel()
    img.filepath_raw = dst
    img.file_format = "JPEG"
    img.save()
    bpy.data.images.remove(img)
    return dst


def emission_mask(src, dst, tint_hex, threshold=0.55, size=512, power=1.6):
    """Keeps only the hottest parts of an emission map (e.g. lava cracks) and tints them."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        return dst
    img = bpy.data.images.load(src)
    img.scale(size, size)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    lum = px[..., 0] * 0.4 + px[..., 1] * 0.4 + px[..., 2] * 0.2
    k = np.clip((lum - threshold) / max(1e-3, 1 - threshold), 0, 1) ** power
    tint = np.array(srgb_display(tint_hex), dtype=np.float32)
    out = np.zeros_like(px)
    out[..., :3] = k[..., None] * tint[None, None, :]
    out[..., 3] = 1
    res = bpy.data.images.new(os.path.basename(dst), size, size)
    res.pixels[:] = out.ravel()
    res.filepath_raw = dst
    res.file_format = "JPEG"
    res.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(res)
    return dst


def voronoi_cracks(dst, tint_hex, size=512, cells=5, width=0.035, seed=7):
    """Tileable glowing crack pattern (Voronoi cell borders): crisp, readable, cartoon-friendly."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        return dst
    rng = np.random.default_rng(seed)
    pts = rng.random((cells * cells, 2))
    # 3×3 copies so the pattern wraps seamlessly across neighbouring tiles.
    tiled = np.concatenate([pts + np.array([dx, dy]) for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    ys, xs = np.mgrid[0:size, 0:size] / size
    grid = np.stack([xs.ravel(), ys.ravel()], axis=1)
    d = np.sqrt(((grid[:, None, :] - tiled[None, :, :]) ** 2).sum(-1))
    d.sort(axis=1)
    edge = d[:, 1] - d[:, 0]
    k = np.clip(1 - edge / width, 0, 1) ** 1.5
    k = k.reshape(size, size)
    tint = np.array(srgb_display(tint_hex), dtype=np.float32)
    out = np.zeros((size, size, 4), dtype=np.float32)
    out[..., :3] = k[..., None] * tint[None, None, :]
    out[..., 3] = 1
    res = bpy.data.images.new(os.path.basename(dst), size, size)
    res.pixels[:] = out.ravel()
    res.filepath_raw = dst
    res.file_format = "JPEG"
    res.save()
    bpy.data.images.remove(res)
    return dst


def srgb_display(hexstr):
    h = hexstr.lstrip("#")
    return [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]


def downloaded(*parts):
    return os.path.join(TEX_DOWNLOADED, *parts)


def processed(name):
    return os.path.join(TEX_PROCESSED, name)


# ───────────────────────────── export & metadata ─────────────────────────────


def export_glb(objs, rel_path, animations=False, copy_to_web=True):
    """Exports the given objects (and nothing else) to game-assets/glb/<rel_path>.glb."""
    path = os.path.join(GLB_DIR, rel_path + ".glb")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=animations,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    tris = sum(tri_count(o) for o in objs)
    print(f"[4walls] glb {rel_path}  {os.path.getsize(path) // 1024} KB  {tris} tris")
    return {"path": f"glb/{rel_path}.glb", "web": f"/assets/{rel_path}.glb", "tris": tris, "kb": os.path.getsize(path) // 1024}


def write_manifest(rel_path, data):
    path = os.path.join(MANIFEST_DIR, rel_path + ".json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[4walls] manifest {rel_path}.json")


def save_blend(rel_path):
    path = os.path.join(BLEND_DIR, rel_path + ".blend")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print(f"[4walls] blend {rel_path}.blend")


# ───────────────────────────── lighting & previews ─────────────────────────────


def setup_world(hdri=True, strength=0.9, bg_hex="#2a2026"):
    scene = bpy.context.scene
    world = bpy.data.worlds.get("4W_World") or bpy.data.worlds.new("4W_World")
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    path = downloaded("polyhaven", "belfast_sunset_puresky", "belfast_sunset_puresky_1k.hdr")
    if hdri and os.path.exists(path):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(path, check_existing=True)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (*srgb(bg_hex), 1)
    bg.inputs["Strength"].default_value = strength
    scene.world = world
    return world


def sun(name="Key", energy=3.5, rot=(50, 8, 35), color="#fff1dc"):
    s = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
    s.data.energy = energy
    s.data.color = srgb(color)
    s.data.angle = math.radians(6)
    s.rotation_euler = Euler([math.radians(a) for a in rot])
    bpy.context.scene.collection.objects.link(s)
    return s


def camera(name, loc, look_at, lens=50, ortho=None):
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    d = Vector(look_at) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
        cam.data.lens = lens
    cam.data.clip_end = 400
    return cam


def iso_camera(name, target, distance, ortho_scale, elevation=55, azimuth=-35):
    """The game's elevated, slightly rotated gameplay view (orthographic for clean sheets)."""
    el = math.radians(elevation)
    az = math.radians(azimuth)
    t = Vector(target)
    loc = t + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    return camera(name, loc, t, ortho=ortho_scale)


def render(path, cam, res=(1600, 900), samples=32, transparent=False):
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if eng in engines:
            scene.render.engine = eng
            break
    try:
        scene.eevee.taa_render_samples = samples
        scene.eevee.use_shadows = True
    except Exception:
        pass
    # Khronos PBR Neutral: the glTF-viewer reference, keeps saturated emissive colors (fire, lava)
    # close to what Three.js shows in game. Falls back to Standard on older builds.
    for transform in ("Khronos PBR Neutral", "Standard"):
        try:
            scene.view_settings.view_transform = transform
            scene.view_settings.look = "None"
            break
        except Exception:
            continue
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[4walls] preview {os.path.relpath(path, ROOT)}")
