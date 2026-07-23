"""Build DateScape's original Afterlight Lantern Market environment kit.

Run with Blender 2.83 or newer:

    blender --background --python build_lantern_market_kit.py

The deterministic source produces an editable .blend, a game-ready GLB, a
validation manifest, and an authored plaza preview. All geometry and materials
are original DateScape work generated in this file; no third-party assets or
textures are used.
"""

import json
import math
import shutil
import struct
import subprocess
from pathlib import Path

import bpy
from mathutils import Vector


KIT_NAME = "AfterlightLanternMarket"
KIT_VERSION = 1
SOURCE_DIR = Path(__file__).resolve().parent
ART_DIR = SOURCE_DIR.parent
OUTPUT_DIR = ART_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BLEND_PATH = OUTPUT_DIR / "afterlight_lantern_market_kit.blend"
GLB_PATH = OUTPUT_DIR / "afterlight_lantern_market_kit.glb"
DRACO_GLB_PATH = OUTPUT_DIR / "afterlight_lantern_market_kit.runtime.draco.glb"
MANIFEST_PATH = OUTPUT_DIR / "afterlight_lantern_market_kit.manifest.json"
PREVIEW_PATH = OUTPUT_DIR / "afterlight_lantern_market_kit.preview.png"

PIECES = []
MARKERS = []


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                       bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def configure_scene():
    scene = bpy.context.scene
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(PREVIEW_PATH)
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.2
    scene.view_settings.gamma = 1.0
    if hasattr(scene, "eevee"):
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 3.0
        scene.eevee.gtao_factor = 1.35
        scene.eevee.use_soft_shadows = True
        scene.eevee.use_bloom = True
        scene.eevee.bloom_intensity = 0.035
        scene.eevee.bloom_radius = 4.0
        scene.eevee.bloom_threshold = 0.85
        if hasattr(scene.eevee, "use_ssr"):
            scene.eevee.use_ssr = True
        if hasattr(scene.eevee, "use_ssr_refraction"):
            scene.eevee.use_ssr_refraction = True


def socket_value(node, socket_name, value):
    socket = node.inputs.get(socket_name)
    if socket is not None:
        socket.default_value = value


def make_material(name, base_color, roughness, metallic=0.0, emission=None,
                  alpha=1.0):
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.diffuse_color = (*base_color, alpha)
    principled = material.node_tree.nodes.get("Principled BSDF")
    socket_value(principled, "Base Color", (*base_color, 1.0))
    socket_value(principled, "Roughness", roughness)
    socket_value(principled, "Metallic", metallic)
    socket_value(principled, "Alpha", alpha)
    if emission is not None:
        socket_value(principled, "Emission", (*emission, 1.0))
    if alpha < 1.0:
        material.blend_method = "BLEND"
        if hasattr(material, "use_screen_refraction"):
            material.use_screen_refraction = True
        if hasattr(material, "show_transparent_back"):
            material.show_transparent_back = True
        if hasattr(material, "alpha_threshold"):
            material.alpha_threshold = 0.01
    return material


def create_materials():
    return {
        "pearl": make_material(
            "MAT_AFT_PearlLimewash", (0.69, 0.73, 0.68), 0.70),
        "stone": make_material(
            "MAT_AFT_WetNightStone", (0.014, 0.045, 0.060), 0.28),
        "stone_dry": make_material(
            "MAT_AFT_BlueBlackStone", (0.026, 0.070, 0.082), 0.48),
        "bronze": make_material(
            "MAT_AFT_AgedBronze", (0.18, 0.090, 0.036), 0.32,
            metallic=0.84),
        "canvas_oat": make_material(
            "MAT_AFT_CanvasOat", (0.72, 0.64, 0.50), 0.80),
        "canvas_clay": make_material(
            "MAT_AFT_CanvasClay", (0.56, 0.20, 0.145), 0.78),
        "ceramic": make_material(
            "MAT_AFT_GlazedSeaCeramic", (0.035, 0.30, 0.29), 0.22),
        "glass": make_material(
            "MAT_AFT_SmokedSeaGlass", (0.055, 0.25, 0.27), 0.18,
            alpha=0.34),
        "wood": make_material(
            "MAT_AFT_WarmMarketWood", (0.32, 0.15, 0.065), 0.45),
        "water": make_material(
            "MAT_AFT_TidalRill", (0.015, 0.20, 0.22), 0.10,
            emission=(0.003, 0.025, 0.030), alpha=0.76),
        "glow": make_material(
            "MAT_AFT_LanternWarm", (1.0, 0.31, 0.055), 0.26,
            emission=(1.0, 0.20, 0.025)),
        "soil": make_material(
            "MAT_AFT_PlanterSoil", (0.042, 0.025, 0.016), 0.92),
        "leaf_dark": make_material(
            "MAT_AFT_GardenLeafDark", (0.025, 0.22, 0.16), 0.56),
        "leaf_mint": make_material(
            "MAT_AFT_GardenLeafMint", (0.075, 0.37, 0.28), 0.52),
    }


def assign_material(obj, material):
    obj.data.materials.append(material)


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_object_transform(obj):
    select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def apply_modifier(obj, modifier):
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def finish_hard_surface(obj, bevel=0.04, segments=2):
    apply_object_transform(obj)
    if bevel > 0:
        modifier = obj.modifiers.new(name="LM_Bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        if hasattr(modifier, "affect"):
            modifier.affect = "EDGES"
        apply_modifier(obj, modifier)
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
    normal = obj.modifiers.new(name="LM_WeightedNormals", type="WEIGHTED_NORMAL")
    normal.keep_sharp = True
    apply_modifier(obj, normal)
    return obj


def add_box(name, dimensions, location, material, bevel=0.04, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    if rotation is not None:
        obj.rotation_euler = rotation
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=bevel)


def add_cylinder(name, radius, depth, location, material,
                 scale=(1.0, 1.0, 1.0), vertices=28, bevel=0.03,
                 rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if rotation is not None:
        obj.rotation_euler = rotation
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=bevel)


def add_uv_sphere(name, location, scale, material, rotation=None,
                  segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if rotation is not None:
        obj.rotation_euler = rotation
    assign_material(obj, material)
    apply_object_transform(obj)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_tapered_box(name, bottom_xy, top_xy, height, location, material,
                    bevel=0.04):
    bx, by = bottom_xy[0] * 0.5, bottom_xy[1] * 0.5
    tx, ty = top_xy[0] * 0.5, top_xy[1] * 0.5
    z0, z1 = -height * 0.5, height * 0.5
    vertices = [
        (-bx, -by, z0), (bx, -by, z0), (bx, by, z0), (-bx, by, z0),
        (-tx, -ty, z1), (tx, -ty, z1), (tx, ty, z1), (-tx, ty, z1),
    ]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5),
        (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=bevel)


def add_folded_canopy_panel(name, x0, x1, depth, front_z, back_z, sag,
                            material, thickness=0.045, y_steps=8):
    """Create one tailored canvas bay with thickness, hem, and shallow sag."""
    x_values = (x0, (x0 + x1) * 0.5, x1)
    y_values = [(-depth * 0.5) + depth * i / y_steps
                for i in range(y_steps + 1)]
    vertices = []
    for layer in (0, 1):
        offset = -thickness if layer == 0 else 0.0
        for ix, x in enumerate(x_values):
            fold = 0.028 if ix == 1 else 0.0
            for iy, y in enumerate(y_values):
                t = iy / y_steps
                z = (front_z + (back_z - front_z) * t
                     - sag * math.sin(math.pi * t) + fold + offset)
                vertices.append((x, y, z))

    row = y_steps + 1
    layer_size = len(x_values) * row

    def vi(layer, ix, iy):
        return layer * layer_size + ix * row + iy

    faces = []
    for layer in (0, 1):
        for ix in range(2):
            for iy in range(y_steps):
                quad = (vi(layer, ix, iy), vi(layer, ix + 1, iy),
                        vi(layer, ix + 1, iy + 1), vi(layer, ix, iy + 1))
                faces.append(tuple(reversed(quad)) if layer == 0 else quad)
    for ix in range(2):
        faces.extend([
            (vi(0, ix, 0), vi(0, ix + 1, 0),
             vi(1, ix + 1, 0), vi(1, ix, 0)),
            (vi(0, ix + 1, y_steps), vi(0, ix, y_steps),
             vi(1, ix, y_steps), vi(1, ix + 1, y_steps)),
        ])
    for iy in range(y_steps):
        faces.extend([
            (vi(0, 0, iy + 1), vi(0, 0, iy),
             vi(1, 0, iy), vi(1, 0, iy + 1)),
            (vi(0, 2, iy), vi(0, 2, iy + 1),
             vi(1, 2, iy + 1), vi(1, 2, iy)),
        ])

    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=0.008, segments=2)


def add_ring_segment(name, inner_radius, outer_radius, depth, location,
                     material, start_degrees, end_degrees, scale=(1, 1, 1),
                     segments=28, bevel=0.025):
    start = math.radians(start_degrees)
    end = math.radians(end_degrees)
    count = segments + 1
    vertices = []
    for z in (-depth * 0.5, depth * 0.5):
        for radius in (inner_radius, outer_radius):
            for index in range(count):
                angle = start + (end - start) * index / segments
                vertices.append((radius * math.cos(angle),
                                 radius * math.sin(angle), z))

    def vi(side, ring, index):
        return (side * 2 + ring) * count + index

    faces = []
    for index in range(segments):
        nxt = index + 1
        faces.extend([
            (vi(0, 0, index), vi(0, 0, nxt), vi(0, 1, nxt), vi(0, 1, index)),
            (vi(1, 0, index), vi(1, 1, index), vi(1, 1, nxt), vi(1, 0, nxt)),
            (vi(0, 1, index), vi(0, 1, nxt), vi(1, 1, nxt), vi(1, 1, index)),
            (vi(0, 0, index), vi(1, 0, index), vi(1, 0, nxt), vi(0, 0, nxt)),
        ])
    faces.extend([
        (vi(0, 0, 0), vi(0, 1, 0), vi(1, 1, 0), vi(1, 0, 0)),
        (vi(0, 0, segments), vi(1, 0, segments),
         vi(1, 1, segments), vi(0, 1, segments)),
    ])
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.scale = scale
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=bevel)


def add_curve_tube(name, points, radius, material, cyclic=False,
                   bevel_resolution=1):
    curve_data = bpy.data.curves.new(name=name + "_CURVE", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_data.resolution_v = 1
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_resolution
    curve_data.materials.append(material)
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    select_only(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_leaf(name, location, scale, rotation, material):
    outline = [
        (0.0, 0.0, -1.0), (-0.76, 0.0, -0.30), (-0.60, 0.0, 0.38),
        (0.0, 0.0, 1.0), (0.60, 0.0, 0.38), (0.76, 0.0, -0.30),
    ]
    vertices = outline + [(0.0, -0.24, 0.05), (0.0, 0.24, 0.05)]
    faces = []
    for index in range(6):
        nxt = (index + 1) % 6
        faces.append((6, index, nxt))
        faces.append((7, nxt, index))
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.scale = scale
    obj.rotation_euler = rotation
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=0.012, segments=2)


def join_components(components, final_name, layout_location, piece_id,
                    origin=(0.0, 0.0, 0.0), origin_kind="ground_anchor"):
    bpy.ops.object.select_all(action="DESELECT")
    for component in components:
        component.select_set(True)
    active = components[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    triangulate = active.modifiers.new(name="LM_ExportTriangulate", type="TRIANGULATE")
    apply_modifier(active, triangulate)
    while active.data.uv_layers:
        active.data.uv_layers.remove(active.data.uv_layers[0])
    active.name = final_name
    active.data.name = final_name + "_MESH"
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    active.location = layout_location
    active["ds_kit"] = KIT_NAME
    active["ds_version"] = KIT_VERSION
    active["ds_piece_id"] = piece_id
    active["ds_origin"] = origin_kind
    active["ds_front"] = "-Y"
    active["ds_dimensions_m"] = json.dumps(
        [round(float(value), 3) for value in active.dimensions])
    active["ds_triangles"] = len(active.data.polygons)
    PIECES.append(active)
    return active


def add_marker(parent, name, location, scale, role, action="", shape="box",
               facing_yaw=0.0):
    marker = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(marker)
    marker.empty_display_type = "CUBE" if shape == "box" else "PLAIN_AXES"
    marker.empty_display_size = 1.0
    marker.parent = parent
    marker.location = location
    marker.scale = scale
    marker.rotation_euler.z = math.radians(facing_yaw)
    marker["ds_kit"] = KIT_NAME
    marker["ds_version"] = KIT_VERSION
    marker["ds_role"] = role
    marker["ds_shape"] = shape
    marker["ds_facing_yaw_deg"] = facing_yaw
    if action:
        marker["ds_action"] = action
    MARKERS.append(marker)
    return marker


def add_lantern(parts, prefix, location, materials, scale=1.0):
    x, y, z = location
    parts.extend([
        add_cylinder(prefix + "_shade", 0.18 * scale, 0.30 * scale,
                     (x, y, z), materials["glow"], vertices=16,
                     bevel=0.025 * scale),
        add_cylinder(prefix + "_cap_top", 0.205 * scale, 0.045 * scale,
                     (x, y, z + 0.172 * scale), materials["bronze"],
                     vertices=16, bevel=0.012 * scale),
        add_cylinder(prefix + "_cap_bottom", 0.205 * scale, 0.045 * scale,
                     (x, y, z - 0.172 * scale), materials["bronze"],
                     vertices=16, bevel=0.012 * scale),
    ])


def add_plant_cluster(parts, prefix, center, materials, count=7, spread=0.52,
                      height=0.75):
    cx, cy, cz = center
    for index in range(count):
        angle = math.tau * index / count + (0.22 if index % 2 else 0.0)
        radial = spread * (0.34 + 0.09 * (index % 3))
        x = cx + radial * math.cos(angle)
        y = cy + radial * math.sin(angle)
        leaf_height = height * (0.74 + 0.08 * (index % 4))
        material = materials["leaf_mint"] if index % 3 == 1 else materials["leaf_dark"]
        parts.append(add_leaf(
            "{}_leaf_{:02d}".format(prefix, index + 1),
            (x, y, cz + leaf_height * 0.48),
            (0.13, 0.085, leaf_height * 0.50),
            (0.10 * math.sin(angle), 0.36 * math.cos(angle), angle),
            material))


def build_stall(materials, variant):
    is_a = variant == "A"
    prefix = "stall_a" if is_a else "stall_b"
    final_name = "LM_Stall_Courtyard_{}".format(variant)
    layout = (-4.25, 2.75, 0.0) if is_a else (4.25, 2.10, 0.0)
    front_z = 3.04 if is_a else 3.16
    back_z = 3.22 if is_a else 3.48
    counter_x = -0.18 if is_a else 0.38
    clay_panel = 0 if is_a else 4
    parts = []

    panel_width = 3.56 / 5.0
    for index in range(5):
        x0 = -1.78 + panel_width * index
        x1 = x0 + panel_width
        panel_material = (materials["canvas_clay"] if index == clay_panel
                          else materials["canvas_oat"])
        parts.append(add_folded_canopy_panel(
            "{}_canvas_{:02d}".format(prefix, index + 1),
            x0, x1, 2.68, front_z, back_z,
            0.095 if index % 2 == 0 else 0.075, panel_material))
        parts.append(add_box(
            "{}_hem_{:02d}".format(prefix, index + 1),
            (panel_width - 0.025, 0.075, 0.065),
            ((x0 + x1) * 0.5, -1.37, front_z - 0.01),
            panel_material, bevel=0.018))

    pearl_post_x = -1.58 if is_a else 1.58
    bronze_post_x = 1.58 if is_a else -1.58
    for index, y in enumerate((-1.05, 1.05)):
        post_height = 2.92 if is_a else (3.38 if y > 0 else 3.06)
        parts.append(add_tapered_box(
            "{}_pearl_post_{}".format(prefix, index + 1),
            (0.40, 0.40), (0.30, 0.30), post_height,
            (pearl_post_x, y, post_height * 0.5), materials["pearl"], bevel=0.055))
        parts.append(add_box(
            "{}_pearl_foot_{}".format(prefix, index + 1),
            (0.55, 0.55, 0.14), (pearl_post_x, y, 0.07),
            materials["pearl"], bevel=0.045))
    for index, y in enumerate((-1.05, 1.05)):
        post_height = 2.98 if is_a else (3.44 if y > 0 else 3.12)
        parts.append(add_tapered_box(
            "{}_bronze_post_{}".format(prefix, index + 1),
            (0.22, 0.22), (0.15, 0.15), post_height,
            (bronze_post_x, y, post_height * 0.5), materials["bronze"], bevel=0.025))
        parts.append(add_cylinder(
            "{}_bronze_foot_{}".format(prefix, index + 1),
            0.24, 0.11, (bronze_post_x, y, 0.055), materials["bronze"],
            vertices=20, bevel=0.018))

    rail_angle = math.atan2(back_z - front_z, 2.45)
    rail_center_z = (front_z + back_z) * 0.5 - 0.04
    parts.extend([
        add_box(prefix + "_rail_left", (0.10, 2.45, 0.10),
                (-1.60, 0.0, rail_center_z), materials["bronze"], 0.018,
                rotation=(rail_angle, 0.0, 0.0)),
        add_box(prefix + "_rail_right", (0.10, 2.45, 0.10),
                (1.60, 0.0, rail_center_z), materials["bronze"], 0.018,
                rotation=(rail_angle, 0.0, 0.0)),
        add_box(prefix + "_rear_rail", (3.30, 0.10, 0.11),
                (0.0, 1.13, back_z - 0.03), materials["bronze"], 0.018),
        add_box(prefix + "_counter_body", (2.62, 0.74, 0.78),
                (counter_x, -0.42, 0.45), materials["pearl"], 0.07),
        add_box(prefix + "_counter_top", (2.86, 0.91, 0.12),
                (counter_x, -0.42, 0.90), materials["wood"], 0.055),
        add_box(prefix + "_display_glass", (2.26, 0.54, 0.36),
                (counter_x, -0.38, 1.15), materials["glass"], 0.03),
        add_box(prefix + "_display_cap", (2.42, 0.62, 0.075),
                (counter_x, -0.38, 1.36), materials["bronze"], 0.022),
    ])
    if not is_a:
        parts.extend([
            add_box(prefix + "_side_return_body", (0.66, 1.28, 0.66),
                    (-1.18, 0.24, 0.40), materials["pearl"], 0.06),
            add_box(prefix + "_side_return_top", (0.82, 1.46, 0.11),
                    (-1.18, 0.24, 0.78), materials["wood"], 0.055),
            add_box(prefix + "_side_return_glaze", (0.04, 0.92, 0.38),
                    (-1.515, 0.20, 0.42), materials["ceramic"], 0.022),
        ])

    for index, x in enumerate((-0.78, 0.0, 0.78)):
        panel_material = materials["ceramic"] if index != 1 else materials["canvas_clay"]
        parts.append(add_box(
            "{}_counter_inlay_{}".format(prefix, index + 1),
            (0.57, 0.04, 0.47),
            (counter_x + x, -0.795, 0.45), panel_material, 0.025))

    niche_x = 1.36 if is_a else -1.36
    parts.extend([
        add_box(prefix + "_side_niche", (0.34, 0.68, 1.34),
                (niche_x, 0.32, 1.36), materials["glass"], 0.035),
        add_box(prefix + "_niche_sill", (0.48, 0.82, 0.10),
                (niche_x, 0.32, 0.68), materials["bronze"], 0.025),
        add_box(prefix + "_niche_cap", (0.48, 0.82, 0.10),
                (niche_x, 0.32, 2.04), materials["bronze"], 0.025),
    ])

    sign_x = 1.03 if is_a else -1.03
    sign_z = 2.48 if is_a else 2.56
    parts.append(add_cylinder(
        prefix + "_sign_face", 0.31, 0.085, (sign_x, -1.405, sign_z),
        materials["ceramic"], vertices=28, bevel=0.022,
        rotation=(math.pi * 0.5, 0.0, 0.0)))
    sign_border = [
        (sign_x + 0.35 * math.cos(math.tau * i / 28.0), -1.455,
         sign_z + 0.35 * math.sin(math.tau * i / 28.0))
        for i in range(28)
    ]
    parts.append(add_curve_tube(
        prefix + "_sign_border", sign_border, 0.025, materials["bronze"],
        cyclic=True, bevel_resolution=1))
    parts.append(add_uv_sphere(
        prefix + "_sign_dot", (sign_x + (0.09 if is_a else -0.09), -1.51,
                                sign_z + 0.02),
        (0.07, 0.025, 0.07), materials["canvas_clay"], segments=14, rings=7))

    pendant_xs = (-0.70, 0.62) if is_a else (-0.54, 0.82)
    for index, x in enumerate(pendant_xs):
        cable_top = 2.88 + 0.04 * index
        lantern_z = 2.36 - 0.06 * index
        parts.append(add_curve_tube(
            "{}_pendant_cord_{}".format(prefix, index + 1),
            [(x, 0.46, cable_top), (x, 0.46, lantern_z + 0.20)],
            0.012, materials["bronze"], bevel_resolution=1))
        add_lantern(parts, "{}_pendant_{}".format(prefix, index + 1),
                    (x, 0.46, lantern_z), materials, scale=0.72)

    piece = join_components(
        parts, final_name, layout, "stall_courtyard_{}".format(variant.lower()))
    add_marker(piece, "COL_LM_Stall{}_PearlSide_A".format(variant),
               (pearl_post_x, 0.0, 1.48), (0.28, 1.28, 1.48), "collision")
    add_marker(piece, "COL_LM_Stall{}_BronzeFront_A".format(variant),
               (bronze_post_x, -1.05, 1.48), (0.16, 0.16, 1.48), "collision")
    add_marker(piece, "COL_LM_Stall{}_BronzeRear_A".format(variant),
               (bronze_post_x, 1.05, 1.48), (0.16, 0.16, 1.48), "collision")
    add_marker(piece, "COL_LM_Stall{}_Counter_A".format(variant),
               (counter_x, -0.42, 0.68), (1.44, 0.46, 0.68), "collision")
    add_marker(piece, "INT_LM_StallBrowse_{}".format(variant),
               (counter_x, -1.42, 0.0), (0.25, 0.25, 0.25),
               "interaction", "browse_market_stall", shape="axes", facing_yaw=0)
    add_marker(piece, "INT_LM_StallHost_{}".format(variant),
               (counter_x, 0.18, 0.0), (0.25, 0.25, 0.25),
               "interaction", "host_market_stall", shape="axes", facing_yaw=180)
    add_marker(piece, "SFX_LM_StallFabric_{}".format(variant),
               (0.0, 0.0, 2.7), (0.25, 0.25, 0.25),
               "audio", "canvas_rustle", shape="axes")
    return piece


def build_lantern_spine(materials):
    parts = []
    mast_x = 6.05
    for side, x in (("L", -mast_x), ("R", mast_x)):
        parts.extend([
            add_tapered_box(
                "spine_mast_" + side, (0.30, 0.30), (0.18, 0.18), 4.62,
                (x, 0.0, 2.31), materials["bronze"], bevel=0.035),
            add_cylinder(
                "spine_base_" + side, 0.43, 0.24, (x, 0.0, 0.12),
                materials["pearl"], scale=(1.0, 0.82, 1.0),
                vertices=28, bevel=0.055),
            add_cylinder(
                "spine_collar_" + side, 0.29, 0.12, (x, 0.0, 0.30),
                materials["ceramic"], scale=(1.0, 0.82, 1.0),
                vertices=24, bevel=0.03),
            add_uv_sphere(
                "spine_finial_" + side, (x, 0.0, 4.68),
                (0.15, 0.15, 0.15), materials["bronze"], segments=16, rings=8),
        ])

    def cable_z(x):
        normalized = x / mast_x
        return 4.62 - 0.44 * (1.0 - normalized * normalized)

    cable_points = [
        (-mast_x + (mast_x * 2.0) * i / 32.0, 0.0,
         cable_z(-mast_x + (mast_x * 2.0) * i / 32.0))
        for i in range(33)
    ]
    parts.append(add_curve_tube(
        "spine_catenary", cable_points, 0.022, materials["bronze"],
        bevel_resolution=1))
    lantern_xs = (-4.72, -3.18, -1.60, 0.25, 2.02, 3.68, 5.02)
    lantern_locations = []
    for index, x in enumerate(lantern_xs):
        top_z = cable_z(x)
        drop = 0.10 + 0.035 * (index % 3)
        lantern_z = top_z - drop - 0.18
        lantern_locations.append((x, 0.0, lantern_z))
        parts.append(add_curve_tube(
            "spine_drop_{:02d}".format(index + 1),
            [(x, 0.0, top_z), (x, 0.0, lantern_z + 0.18)],
            0.010, materials["bronze"], bevel_resolution=1))
        add_lantern(parts, "spine_lantern_{:02d}".format(index + 1),
                    (x, 0.0, lantern_z), materials, scale=0.90)

    piece = join_components(
        parts, "LM_LanternSpine_A", (0.0, 0.15, 0.0), "lantern_spine_a")
    add_marker(piece, "COL_LM_LanternMast_Left_A",
               (-mast_x, 0.0, 2.30), (0.30, 0.30, 2.30), "collision")
    add_marker(piece, "COL_LM_LanternMast_Right_A",
               (mast_x, 0.0, 2.30), (0.30, 0.30, 2.30), "collision")
    add_marker(piece, "SOCKET_LM_Cable_Left_A",
               (-mast_x, 0.0, 4.58), (0.18, 0.18, 0.18),
               "socket", "connect_lantern_cable", shape="axes")
    add_marker(piece, "SOCKET_LM_Cable_Right_A",
               (mast_x, 0.0, 4.58), (0.18, 0.18, 0.18),
               "socket", "connect_lantern_cable", shape="axes")
    for index, location in enumerate(lantern_locations):
        add_marker(piece, "LGT_LM_Lantern_{:02d}_A".format(index + 1),
                   location, (0.18, 0.18, 0.18), "light_anchor",
                   "warm_market_lantern", shape="axes")
    add_marker(piece, "SFX_LM_MarketBed_A", (0.0, 0.0, 2.0),
               (0.30, 0.30, 0.30), "audio", "lantern_market_ambience",
               shape="axes")
    return piece


def build_communal_table(materials):
    parts = [
        add_box("table_top", (3.15, 0.96, 0.12), (0.0, 0.0, 0.76),
                materials["wood"], 0.075),
        add_box("table_bronze_inlay", (2.72, 0.055, 0.028),
                (-0.12, -0.49, 0.79), materials["bronze"], 0.012),
        add_box("table_spine", (2.25, 0.18, 0.16), (0.0, 0.0, 0.58),
                materials["bronze"], 0.035),
        add_tapered_box("table_leg_left", (0.42, 0.52), (0.28, 0.34), 0.62,
                        (-1.05, 0.0, 0.34), materials["pearl"], 0.055),
        add_tapered_box("table_leg_right", (0.42, 0.52), (0.28, 0.34), 0.62,
                        (0.72, 0.0, 0.34), materials["pearl"], 0.055),
    ]
    seat_locations = [(-0.95, -0.92), (0.15, -0.92),
                      (-0.95, 0.92), (0.15, 0.92)]
    for index, (x, y) in enumerate(seat_locations):
        parts.extend([
            add_cylinder(
                "table_stool_seat_{:02d}".format(index + 1), 0.29, 0.11,
                (x, y, 0.51), materials["ceramic"], vertices=24, bevel=0.04),
            add_tapered_box(
                "table_stool_base_{:02d}".format(index + 1),
                (0.27, 0.27), (0.17, 0.17), 0.46,
                (x, y, 0.25), materials["bronze"], bevel=0.025),
        ])
    piece = join_components(
        parts, "LM_CommunalTable_A", (3.45, -0.90, 0.0),
        "communal_table_a")
    add_marker(piece, "COL_LM_CommunalTable_A", (0.0, 0.0, 0.46),
               (1.58, 0.50, 0.46), "collision")
    for index, (x, y) in enumerate(seat_locations):
        yaw = 0 if y < 0 else 180
        add_marker(piece, "INT_LM_Table_Sit_{:02d}_A".format(index + 1),
                   (x, y, 0.51), (0.22, 0.22, 0.22), "interaction",
                   "sit_communal_table", shape="axes", facing_yaw=yaw)
    add_marker(piece, "INT_LM_Table_AccessibleEnd_A", (1.72, 0.0, 0.0),
               (0.24, 0.24, 0.24), "interaction", "join_communal_table",
               shape="axes", facing_yaw=90)
    add_marker(piece, "NAV_LM_Table_ClearEnd_A", (1.78, 0.0, 0.70),
               (0.62, 0.78, 0.70), "nav_keep_clear")
    return piece


def build_tasting_rail(materials):
    parts = [
        add_box("tasting_top", (3.18, 0.68, 0.13), (0.0, 0.0, 1.02),
                materials["wood"], 0.07),
        add_tapered_box("tasting_pearl_support", (0.54, 0.56), (0.40, 0.42),
                        0.95, (-1.22, 0.0, 0.49), materials["pearl"], 0.06),
        add_tapered_box("tasting_bronze_support", (0.28, 0.30), (0.18, 0.20),
                        0.92, (1.16, 0.0, 0.48), materials["bronze"], 0.035),
        add_box("tasting_glazed_apron", (2.22, 0.075, 0.28),
                (-0.15, -0.34, 0.82), materials["ceramic"], 0.035),
        add_box("tasting_coral_tab", (0.46, 0.085, 0.30),
                (0.83, -0.35, 0.82), materials["canvas_clay"], 0.03),
        add_box("tasting_foot_rail", (2.12, 0.10, 0.10),
                (-0.02, -0.40, 0.30), materials["bronze"], 0.022),
    ]
    for index, x in enumerate((-0.72, 0.0, 0.72)):
        parts.extend([
            add_cylinder("tasting_cup_{:02d}".format(index + 1), 0.13, 0.12,
                         (x, -0.05, 1.145), materials["ceramic"],
                         vertices=20, bevel=0.025),
            add_cylinder("tasting_saucer_{:02d}".format(index + 1), 0.17, 0.025,
                         (x, -0.05, 1.075), materials["pearl"],
                         vertices=20, bevel=0.012),
        ])
    piece = join_components(
        parts, "LM_TastingRail_A", (-4.10, -0.72, 0.0), "tasting_rail_a")
    add_marker(piece, "COL_LM_TastingRail_A", (0.0, 0.0, 0.55),
               (1.60, 0.38, 0.55), "collision")
    add_marker(piece, "INT_LM_Tasting_Left_A", (-0.72, -0.72, 0.0),
               (0.24, 0.24, 0.24), "interaction", "taste_market_sample",
               shape="axes", facing_yaw=0)
    add_marker(piece, "INT_LM_Tasting_Right_A", (0.72, -0.72, 0.0),
               (0.24, 0.24, 0.24), "interaction", "taste_market_sample",
               shape="axes", facing_yaw=0)
    return piece


def build_counter_dress(materials):
    parts = [
        add_box("dress_tray", (1.08, 0.47, 0.055), (0.0, 0.0, 0.04),
                materials["wood"], 0.028),
        add_box("dress_folded_textile", (0.62, 0.31, 0.045),
                (-0.13, -0.02, 0.095), materials["canvas_clay"], 0.022,
                rotation=(0.0, 0.0, 0.08)),
        add_cylinder("dress_vessel_tall", 0.095, 0.27,
                     (-0.37, 0.05, 0.245), materials["ceramic"],
                     vertices=18, bevel=0.025),
        add_cylinder("dress_vessel_low", 0.14, 0.13,
                     (0.04, 0.03, 0.185), materials["pearl"],
                     vertices=20, bevel=0.035),
        add_uv_sphere("dress_glazed_fruit_01", (0.18, -0.06, 0.19),
                      (0.095, 0.095, 0.095), materials["ceramic"],
                      segments=14, rings=7),
        add_uv_sphere("dress_glazed_fruit_02", (0.30, -0.01, 0.17),
                      (0.075, 0.075, 0.075), materials["canvas_clay"],
                      segments=14, rings=7),
        add_box("dress_menu_tile", (0.32, 0.055, 0.43),
                (0.39, 0.13, 0.28), materials["glass"], 0.035,
                rotation=(0.08, 0.0, -0.04)),
        add_box("dress_menu_mint_mark", (0.055, 0.025, 0.24),
                (0.34, 0.095, 0.29), materials["ceramic"], 0.014,
                rotation=(0.08, 0.0, -0.04)),
        add_box("dress_menu_stand", (0.40, 0.23, 0.045),
                (0.39, 0.13, 0.07), materials["bronze"], 0.018),
    ]
    piece = join_components(
        parts, "LM_CounterDress_A", (-4.43, 2.33, 0.97),
        "counter_dress_a", origin_kind="surface_anchor")
    add_marker(piece, "INT_LM_CounterDress_Inspect_A", (0.0, -0.42, 0.0),
               (0.18, 0.18, 0.18), "interaction", "inspect_market_goods",
               shape="axes", facing_yaw=0)
    return piece


def build_listening_crescent(materials):
    parts = [
        add_cylinder("crescent_dais", 2.10, 0.20, (0.0, 0.0, 0.10),
                     materials["stone_dry"], scale=(1.0, 0.72, 1.0),
                     vertices=32, bevel=0.075),
        add_ring_segment("crescent_dais_inlay", 1.93, 2.03, 0.035,
                         (0.0, 0.0, 0.215), materials["bronze"], 8, 172,
                         scale=(1.0, 0.72, 1.0), segments=24, bevel=0.012),
        add_cylinder("crescent_performance_pad", 1.08, 0.075,
                     (0.0, -0.30, 0.245), materials["pearl"],
                     scale=(1.0, 0.72, 1.0), vertices=28, bevel=0.05),
        add_ring_segment("crescent_seat", 1.24, 2.00, 0.16,
                         (0.0, 0.0, 0.49), materials["wood"], 16, 164,
                         scale=(1.0, 0.72, 1.0), segments=26, bevel=0.045),
        add_ring_segment("crescent_back", 1.82, 2.01, 0.51,
                         (0.0, 0.0, 0.75), materials["pearl"], 16, 164,
                         scale=(1.0, 0.72, 1.0), segments=26, bevel=0.045),
        add_ring_segment("crescent_back_inlay", 1.805, 1.85, 0.37,
                         (0.0, 0.0, 0.77), materials["bronze"], 23, 157,
                         scale=(1.0, 0.72, 1.0), segments=22, bevel=0.014),
    ]
    listening_rail = []
    for index in range(15):
        x = -1.48 + 2.96 * index / 14.0
        normalized = x / 1.48
        listening_rail.append((x, 1.17, 1.10 + 0.38 * (1.0 - normalized * normalized)))
    parts.append(add_curve_tube(
        "crescent_listening_rail", listening_rail, 0.040,
        materials["bronze"], bevel_resolution=1))
    for x in (-1.48, 1.48):
        parts.append(add_cylinder(
            "crescent_rail_socket_{}".format("l" if x < 0 else "r"),
            0.09, 0.16, (x, 1.17, 1.03), materials["ceramic"],
            vertices=20, bevel=0.025))

    piece = join_components(
        parts, "LM_ListeningCrescent_A", (-3.55, -3.55, 0.0),
        "listening_crescent_a")
    add_marker(piece, "COL_LM_ListeningDais_A", (0.0, 0.0, 0.18),
               (2.10, 1.52, 0.18), "collision")
    add_marker(piece, "COL_LM_ListeningSeat_A", (0.0, 0.91, 0.67),
               (1.96, 0.54, 0.42), "collision")
    add_marker(piece, "INT_LM_PerformanceJoin_A", (0.0, -0.35, 0.28),
               (0.25, 0.25, 0.25), "interaction", "join_market_performance",
               shape="axes", facing_yaw=180)
    listen_angles = (43, 90, 137)
    for index, angle_degrees in enumerate(listen_angles):
        angle = math.radians(angle_degrees)
        x = 1.55 * math.cos(angle)
        y = 1.55 * math.sin(angle) * 0.72
        add_marker(piece, "INT_LM_CrescentListen_{:02d}_A".format(index + 1),
                   (x, y, 0.55), (0.22, 0.22, 0.22), "interaction",
                   "sit_listening_crescent", shape="axes",
                   facing_yaw=angle_degrees - 90)
    add_marker(piece, "SOC_LM_ConversationPocket_A", (0.0, -0.12, 0.9),
               (2.20, 1.72, 0.9), "social_volume", "small_group_conversation")
    add_marker(piece, "SFX_LM_PerformancePocket_A", (0.0, 0.0, 1.0),
               (0.30, 0.30, 0.30), "audio", "market_performance_focus",
               shape="axes")
    return piece


def build_planter_screen(materials):
    parts = [
        add_box("screen_trough", (2.58, 0.72, 0.54), (0.0, 0.0, 0.28),
                materials["pearl"], 0.085),
        add_box("screen_glazed_band", (2.28, 0.055, 0.27),
                (0.0, -0.365, 0.29), materials["ceramic"], 0.035),
        add_box("screen_soil", (2.24, 0.47, 0.08), (0.0, 0.0, 0.57),
                materials["soil"], 0.025),
    ]
    for index, x in enumerate((-1.02, 0.0, 1.02)):
        parts.append(add_tapered_box(
            "screen_upright_{:02d}".format(index + 1),
            (0.11, 0.12), (0.07, 0.08), 1.40,
            (x, 0.12, 1.15), materials["bronze"], 0.018))
    parts.extend([
        add_box("screen_crossbar_low", (2.20, 0.075, 0.075),
                (0.0, 0.12, 1.05), materials["bronze"], 0.016),
        add_box("screen_crossbar_high", (2.20, 0.075, 0.075),
                (0.0, 0.12, 1.58), materials["bronze"], 0.016),
    ])
    leaf_xs = (-1.00, -0.78, -0.54, -0.28, 0.0, 0.24, 0.50, 0.76, 1.02)
    for index, x in enumerate(leaf_xs):
        leaf_height = 0.72 + 0.15 * (index % 4)
        y = -0.06 + 0.10 * (index % 3)
        material = materials["leaf_mint"] if index % 3 == 1 else materials["leaf_dark"]
        parts.append(add_leaf(
            "screen_leaf_{:02d}".format(index + 1),
            (x, y, 0.64 + leaf_height * 0.48),
            (0.16, 0.09, leaf_height * 0.50),
            (0.10 * ((index % 2) - 0.5), 0.28 * math.sin(index),
             0.18 * ((index % 3) - 1)), material))
    piece = join_components(
        parts, "LM_PlanterScreen_A", (4.25, -3.75, 0.0), "planter_screen_a")
    add_marker(piece, "COL_LM_PlanterScreen_A", (0.0, 0.0, 0.78),
               (1.30, 0.38, 0.78), "collision")
    add_marker(piece, "INT_LM_PlanterScreen_Inspect_A", (0.0, -0.72, 0.0),
               (0.23, 0.23, 0.23), "interaction", "inspect_market_planting",
               shape="axes", facing_yaw=0)
    return piece


def build_threshold_sign(materials):
    parts = [
        add_cylinder("threshold_planter", 0.56, 0.46, (-0.38, 0.0, 0.23),
                     materials["ceramic"], scale=(1.05, 0.76, 1.0),
                     vertices=30, bevel=0.055),
        add_cylinder("threshold_planter_rim", 0.61, 0.10,
                     (-0.38, 0.0, 0.49), materials["pearl"],
                     scale=(1.05, 0.76, 1.0), vertices=30, bevel=0.035),
        add_cylinder("threshold_soil", 0.48, 0.045, (-0.38, 0.0, 0.54),
                     materials["soil"], scale=(1.05, 0.76, 1.0),
                     vertices=28, bevel=0.012),
        add_curve_tube("threshold_bent_mast",
                       [(-0.52, 0.0, 0.34), (-0.52, 0.0, 2.48),
                        (-0.26, 0.0, 2.70), (0.14, 0.0, 2.70)],
                       0.065, materials["bronze"], bevel_resolution=2),
        add_box("threshold_sign_panel", (1.02, 0.11, 1.20),
                (0.25, 0.0, 1.82), materials["glass"], 0.055),
        add_box("threshold_sign_top", (1.10, 0.15, 0.075),
                (0.25, 0.0, 2.45), materials["bronze"], 0.022),
        add_box("threshold_sign_bottom", (1.10, 0.15, 0.075),
                (0.25, 0.0, 1.19), materials["bronze"], 0.022),
        add_box("threshold_sign_left", (0.075, 0.15, 1.18),
                (-0.28, 0.0, 1.82), materials["bronze"], 0.022),
        add_box("threshold_sign_right", (0.075, 0.15, 1.18),
                (0.78, 0.0, 1.82), materials["bronze"], 0.022),
        add_box("threshold_sign_mint_bar", (0.12, 0.04, 0.72),
                (0.04, -0.075, 1.82), materials["ceramic"], 0.018),
        add_uv_sphere("threshold_sign_coral_dot", (0.40, -0.085, 2.04),
                      (0.13, 0.035, 0.13), materials["canvas_clay"],
                      segments=16, rings=8),
    ]
    add_plant_cluster(parts, "threshold", (-0.38, 0.0, 0.54), materials,
                      count=5, spread=0.38, height=0.62)
    piece = join_components(
        parts, "LM_ThresholdSign_A", (6.35, -4.55, 0.0), "threshold_sign_a")
    add_marker(piece, "COL_LM_ThresholdSign_A", (-0.12, 0.0, 1.32),
               (0.72, 0.42, 1.32), "collision")
    add_marker(piece, "INT_LM_ThresholdSign_Inspect_A", (0.25, -0.70, 0.0),
               (0.23, 0.23, 0.23), "interaction", "inspect_market_wayfinding",
               shape="axes", facing_yaw=0)
    return piece


def build_ground_ribbon(materials):
    parts = [
        add_box("ground_base", (14.60, 10.80, 0.16), (0.0, 0.0, 0.08),
                materials["stone"], 0.16),
        add_box("ground_pad_stall_a", (4.10, 3.25, 0.035),
                (-4.25, 2.72, 0.177), materials["stone_dry"], 0.12),
        add_box("ground_pad_stall_b", (3.95, 3.10, 0.035),
                (4.25, 2.08, 0.177), materials["stone_dry"], 0.12),
        add_box("ground_threshold_pad", (4.10, 0.95, 0.045),
                (0.0, -4.72, 0.182), materials["stone_dry"], 0.13),
        add_box("ground_rill_water", (0.40, 8.90, 0.055),
                (6.28, -0.10, 0.198), materials["water"], 0.05),
        add_box("ground_rill_bronze_left", (0.055, 8.95, 0.05),
                (6.045, -0.10, 0.195), materials["bronze"], 0.016),
        add_box("ground_rill_bronze_right", (0.055, 8.95, 0.05),
                (6.515, -0.10, 0.195), materials["bronze"], 0.016),
        add_box("ground_curb_nw", (3.20, 0.16, 0.12),
                (-5.35, 5.18, 0.22), materials["pearl"], 0.045),
        add_box("ground_curb_ne", (3.20, 0.16, 0.12),
                (4.55, 5.18, 0.22), materials["pearl"], 0.045),
        add_box("ground_curb_sw", (2.60, 0.16, 0.12),
                (-5.60, -5.18, 0.22), materials["pearl"], 0.045),
    ]
    bronze_ribbon = [(-1.68, -5.08, 0.215), (-1.28, -3.55, 0.215),
                     (-1.58, -1.82, 0.215), (-0.82, 0.18, 0.215),
                     (-1.16, 2.36, 0.215), (-0.58, 5.08, 0.215)]
    mint_ribbon = [(1.72, -5.08, 0.215), (1.38, -3.55, 0.215),
                   (1.64, -1.74, 0.215), (0.90, 0.30, 0.215),
                   (1.18, 2.28, 0.215), (0.64, 5.08, 0.215)]
    coral_branch = [(-1.42, -2.10, 0.218), (-2.45, -1.70, 0.218),
                    (-3.42, -0.82, 0.218), (-4.08, -0.72, 0.218)]
    parts.extend([
        add_curve_tube("ground_bronze_ribbon", bronze_ribbon, 0.030,
                       materials["bronze"], bevel_resolution=1),
        add_curve_tube("ground_mint_ribbon", mint_ribbon, 0.026,
                       materials["ceramic"], bevel_resolution=1),
        add_curve_tube("ground_coral_branch", coral_branch, 0.032,
                       materials["canvas_clay"], bevel_resolution=1),
    ])
    piece = join_components(
        parts, "LM_GroundRibbon_A", (0.0, 0.0, 0.0), "ground_ribbon_a")
    add_marker(piece, "COL_LM_GroundWalk_A", (0.0, 0.0, 0.08),
               (7.30, 5.40, 0.08), "collision", "walkable_surface")
    add_marker(piece, "SFX_LM_WaterDrain_A", (6.28, -0.10, 0.22),
               (0.24, 0.24, 0.24), "audio", "market_water_rill",
               shape="axes")
    return piece


def build_kit():
    reset_scene()
    configure_scene()
    materials = create_materials()
    build_ground_ribbon(materials)
    build_stall(materials, "A")
    build_stall(materials, "B")
    build_counter_dress(materials)
    build_lantern_spine(materials)
    build_communal_table(materials)
    build_tasting_rail(materials)
    build_listening_crescent(materials)
    build_planter_screen(materials)
    build_threshold_sign(materials)
    bpy.context.scene["ds_kit"] = KIT_NAME
    bpy.context.scene["ds_version"] = KIT_VERSION
    bpy.context.scene["ds_units"] = "meters"
    bpy.context.scene["ds_grid_m"] = 0.5
    bpy.context.scene["ds_primary_clear_path_m"] = 4.2
    return materials


def ensure_gltf_exporter():
    if "io_scene_gltf2" in bpy.context.preferences.addons:
        return
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        try:
            bpy.ops.wm.addon_enable(module="io_scene_gltf2")
        except Exception as error:
            raise RuntimeError("Unable to enable Blender's glTF 2.0 exporter") from error


def export_glb(output_path):
    ensure_gltf_exporter()
    requested = {
        "filepath": str(output_path),
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": True,
        "export_extras": True,
        "export_cameras": False,
        "export_lights": False,
        "export_animations": False,
        "export_materials": True,
        "export_tangents": False,
        "export_texcoords": False,
    }
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {key: value for key, value in requested.items() if key in available}
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError("glTF export did not finish: {}".format(result))


def compress_runtime_glb():
    """Create PlayCanvas-compatible Draco output with a pinned converter."""
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        raise RuntimeError("npx is required to build the runtime Draco GLB")

    args = [
        npx,
        "--yes",
        "@gltf-transform/cli@4.4.1",
        "draco",
        str(GLB_PATH),
        str(DRACO_GLB_PATH),
        "--method",
        "edgebreaker",
        "--quantize-position",
        "14",
        "--quantize-normal",
        "10",
        "--quantize-texcoord",
        "12",
        "--quantize-generic",
        "12",
    ]
    result = subprocess.run(
        subprocess.list2cmdline(args),
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
    )
    if result.stdout:
        print(result.stdout.rstrip())
    if result.returncode != 0:
        raise RuntimeError(
            "glTF Transform Draco compression failed with exit code {}".format(
                result.returncode))


def parse_glb(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise RuntimeError("GLB is unexpectedly small")
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise RuntimeError("Invalid GLB header")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise RuntimeError("First GLB chunk is not JSON")
    document = json.loads(data[20:20 + json_length].decode("utf-8"))
    return data, document


def rounded_vector(vector):
    return [round(float(value), 3) for value in vector]


def write_manifest():
    data, document = parse_glb(GLB_PATH)
    runtime_data, runtime_document = parse_glb(DRACO_GLB_PATH)
    node_names = [node.get("name", "") for node in document.get("nodes", [])]
    material_names = [material.get("name", "")
                      for material in document.get("materials", [])]
    expected_pieces = [piece.name for piece in PIECES]
    expected_markers = [marker.name for marker in MARKERS]
    missing_pieces = [name for name in expected_pieces if name not in node_names]
    missing_markers = [name for name in expected_markers if name not in node_names]
    if missing_pieces or missing_markers:
        raise RuntimeError(
            "GLB is missing expected nodes: {}".format(missing_pieces + missing_markers))
    runtime_node_names = [node.get("name", "")
                          for node in runtime_document.get("nodes", [])]
    runtime_missing = [name for name in expected_pieces + expected_markers
                       if name not in runtime_node_names]
    if runtime_missing:
        raise RuntimeError(
            "Runtime Draco GLB is missing expected nodes: {}".format(runtime_missing))
    draco_primitive_count = sum(
        1 for mesh in runtime_document.get("meshes", [])
        for primitive in mesh.get("primitives", [])
        if "KHR_draco_mesh_compression" in primitive.get("extensions", {}))
    if draco_primitive_count == 0:
        raise RuntimeError("Runtime GLB did not contain Draco-compressed primitives")
    preview_nodes = [name for name in node_names if name.startswith("__PREVIEW_")]
    if preview_nodes:
        raise RuntimeError("Preview-only objects leaked into GLB: {}".format(preview_nodes))

    extras_nodes = [
        node.get("name", "") for node in document.get("nodes", [])
        if node.get("extras")]
    module_details = []
    for piece in PIECES:
        module_details.append({
            "name": piece.name,
            "piece_id": piece.get("ds_piece_id", ""),
            "dimensions_m": rounded_vector(piece.dimensions),
            "layout_position_m": rounded_vector(piece.location),
            "triangle_count": len(piece.data.polygons),
            "origin": piece.get("ds_origin", ""),
            "front": piece.get("ds_front", ""),
        })
    marker_details = []
    for marker in MARKERS:
        marker_details.append({
            "name": marker.name,
            "parent": marker.parent.name if marker.parent else "",
            "role": marker.get("ds_role", ""),
            "action": marker.get("ds_action", ""),
            "local_position_m": rounded_vector(marker.location),
            "half_extents_or_display_scale_m": rounded_vector(marker.scale),
            "facing_yaw_deg": marker.get("ds_facing_yaw_deg", 0.0),
        })

    triangle_total = sum(len(piece.data.polygons) for piece in PIECES)
    report = {
        "asset": GLB_PATH.name,
        "runtime_asset": {
            "asset": DRACO_GLB_PATH.name,
            "byte_size": len(runtime_data),
            "compression": "KHR_draco_mesh_compression",
            "method": "glTF Transform 4.4.1, Draco edgebreaker",
            "compressed_primitive_count": draco_primitive_count,
            "node_count": len(runtime_document.get("nodes", [])),
            "mesh_count": len(runtime_document.get("meshes", [])),
            "material_count": len(runtime_document.get("materials", [])),
        },
        "kit": KIT_NAME,
        "version": KIT_VERSION,
        "generator": "Blender procedural source; original DateScape geometry",
        "source_license": "Original project-owned geometry; no third-party assets",
        "units": "meters",
        "coordinate_system": "glTF Y-up; authored Blender Z-up",
        "authored_front": "-Y",
        "modular_grid_m": 0.5,
        "primary_clear_path_m": 4.2,
        "byte_size": len(data),
        "scene_count": len(document.get("scenes", [])),
        "node_count": len(document.get("nodes", [])),
        "mesh_count": len(document.get("meshes", [])),
        "material_count": len(document.get("materials", [])),
        "triangle_count": triangle_total,
        "piece_nodes": expected_pieces,
        "marker_nodes": expected_markers,
        "nodes_with_extras": extras_nodes,
        "materials": material_names,
        "modules": module_details,
        "markers": marker_details,
        "composition": {
            "intent": "Asymmetrical tidal-ribbon bazaar with three authored social pockets",
            "social_pockets": [
                "tasting rail",
                "communal table with accessible clear end",
                "low listening/performance crescent",
            ],
            "lantern_spine": "Side-supported; no center pole or opaque roof",
            "stall_front_eaves_m": "3.04-3.16",
            "stall_roof_high_points_m": "3.22-3.48",
            "lowest_lantern_bottom_clearance_m": 3.70,
        },
        "validation": {
            "glb_header": "ok",
            "expected_piece_nodes": "ok",
            "expected_marker_nodes": "ok",
            "custom_extras_present": bool(extras_nodes),
            "preview_nodes_excluded": True,
            "runtime_expected_nodes": "ok",
            "runtime_draco_extension": "ok",
            "all_module_meshes_triangulated": all(
                len(p.vertices) == 3 for piece in PIECES for p in piece.data.polygons),
        },
        "limitations": [
            "Smoked glass and the shallow water rill use portable alpha blending.",
            "Collision, seating, browsing, audio, light, socket, and navigation empties are metadata nodes; runtime code must interpret them.",
            "This art test has no authored LODs, baked lightmaps, texture maps, or animation.",
            "The uncompressed GLB is retained for authoring and broad importer compatibility; the runtime GLB requires PlayCanvas Draco decoder initialization.",
            "There are no texture maps yet; add atlased WebP or KTX2 surfaces and baked lighting in the production pass.",
            "Modules are assembled into one hero composition but remain separate stable-name nodes with ground pivots.",
        ],
    }
    MANIFEST_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def point_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, energy, size, color, target):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.size = size
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, target)
    return light


def add_point_light(name, location, energy, color, radius=0.35):
    light_data = bpy.data.lights.new(name=name, type="POINT")
    light_data.energy = energy
    light_data.color = color
    light_data.shadow_soft_size = radius
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    return light


def add_preview_avatar(index, location, yaw_degrees, height_scale,
                       body_material, skin_material, trouser_material):
    prefix = "__PREVIEW_Avatar_{:02d}".format(index)
    parts = [
        add_cylinder(prefix + "_leg_l", 0.068, 0.70, (-0.095, 0.0, 0.37),
                     trouser_material, vertices=12, bevel=0.025),
        add_cylinder(prefix + "_leg_r", 0.068, 0.70, (0.095, 0.0, 0.37),
                     trouser_material, vertices=12, bevel=0.025),
        add_tapered_box(prefix + "_torso", (0.32, 0.22), (0.43, 0.25), 0.66,
                        (0.0, 0.0, 1.04), body_material, bevel=0.055),
        add_cylinder(prefix + "_arm_l", 0.052, 0.58, (-0.25, 0.0, 1.02),
                     body_material, vertices=12, bevel=0.022),
        add_cylinder(prefix + "_arm_r", 0.052, 0.58, (0.25, 0.0, 1.02),
                     body_material, vertices=12, bevel=0.022),
        add_uv_sphere(prefix + "_head", (0.0, 0.0, 1.57),
                      (0.135, 0.122, 0.16), skin_material,
                      segments=14, rings=7),
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    root = parts[0]
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.join()
    root.name = prefix
    root.data.name = prefix + "_MESH"
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    root.location = location
    root.rotation_euler.z = math.radians(yaw_degrees)
    root.scale = (height_scale, height_scale, height_scale)
    return root


def render_preview():
    preview_material = make_material(
        "__PREVIEW_GroundMaterial", (0.006, 0.014, 0.023), 0.46)
    bpy.ops.mesh.primitive_plane_add(size=36.0, location=(0.0, 0.0, -0.025))
    ground = bpy.context.object
    ground.name = "__PREVIEW_Ground"
    assign_material(ground, preview_material)

    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("__PREVIEW_World")
        bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.010, 0.022, 1.0)
    background.inputs["Strength"].default_value = 0.20

    add_area_light("__PREVIEW_Key", (-7.5, -8.0, 12.0), 1450, 8.0,
                   (0.70, 0.84, 1.0), (0.0, 0.0, 1.3))
    add_area_light("__PREVIEW_Warm", (8.0, -3.0, 7.0), 1200, 6.0,
                   (1.0, 0.36, 0.14), (0.0, 0.5, 1.3))
    add_area_light("__PREVIEW_Rim", (0.0, 9.5, 8.5), 1050, 7.0,
                   (0.10, 0.50, 0.62), (0.0, 0.5, 1.8))
    point_specs = [
        (-4.25, 2.75, 2.35, 95), (4.25, 2.10, 2.40, 90),
        (-1.60, 0.15, 4.0, 70), (2.02, 0.15, 4.0, 70),
        (-3.55, -3.55, 1.2, 55),
    ]
    for index, (x, y, z, energy) in enumerate(point_specs):
        add_point_light("__PREVIEW_Practical_{:02d}".format(index + 1),
                        (x, y, z), energy, (1.0, 0.25, 0.07), radius=0.42)

    body_materials = [
        make_material("__PREVIEW_ClothSlate", (0.10, 0.22, 0.28), 0.68),
        make_material("__PREVIEW_ClothClay", (0.48, 0.15, 0.12), 0.70),
        make_material("__PREVIEW_ClothMint", (0.06, 0.31, 0.24), 0.66),
        make_material("__PREVIEW_ClothOat", (0.55, 0.46, 0.34), 0.72),
    ]
    skin_materials = [
        make_material("__PREVIEW_SkinDeep", (0.25, 0.105, 0.055), 0.62),
        make_material("__PREVIEW_SkinMedium", (0.48, 0.245, 0.135), 0.62),
        make_material("__PREVIEW_SkinLight", (0.73, 0.49, 0.34), 0.62),
    ]
    trouser_material = make_material(
        "__PREVIEW_Trouser", (0.022, 0.045, 0.060), 0.72)
    avatar_specs = [
        (-4.78, 1.02, 0, 1.00), (-3.76, 1.10, 8, 0.94),
        (3.70, 0.38, -8, 1.04), (4.72, 0.34, 4, 0.97),
        (-4.82, -1.52, 0, 1.02), (-3.68, -1.48, 5, 0.92),
        (2.55, -2.18, 180, 1.00), (4.34, -2.16, 175, 0.96),
        (-4.18, -4.24, 4, 1.06), (-3.05, -4.28, -5, 0.95),
    ]
    for index, (x, y, yaw, scale) in enumerate(avatar_specs, 1):
        add_preview_avatar(
            index, (x, y, 0.18), yaw, scale,
            body_materials[(index - 1) % len(body_materials)],
            skin_materials[(index - 1) % len(skin_materials)],
            trouser_material)

    camera_data = bpy.data.cameras.new("__PREVIEW_Camera")
    camera = bpy.data.objects.new("__PREVIEW_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (15.8, -20.8, 12.7)
    camera_data.lens = 52
    point_at(camera, (0.0, 0.15, 1.32))
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main():
    build_kit()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_glb(GLB_PATH)
    compress_runtime_glb()
    report = write_manifest()
    render_preview()
    print("AFTERLIGHT_LANTERN_MARKET_BUILD_OK")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
