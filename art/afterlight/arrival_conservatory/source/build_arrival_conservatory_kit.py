"""Build DateScape's original Arrival Conservatory modular hero kit.

Run with Blender 2.83+:

    blender --background --python build_arrival_conservatory_kit.py

The script creates an editable .blend source, an application-ready GLB, a small
JSON manifest/validation report, and a rendered kit-sheet preview. Geometry and
materials in this file are original and generated without third-party assets.
"""

import json
import hashlib
import math
import shutil
import struct
import subprocess
from pathlib import Path

import bpy
from mathutils import Vector


KIT_NAME = "ArrivalConservatory"
KIT_VERSION = 1
SOURCE_DIR = Path(__file__).resolve().parent
ART_DIR = SOURCE_DIR.parent
OUTPUT_DIR = ART_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BLEND_PATH = OUTPUT_DIR / "arrival_conservatory_hero_kit.blend"
GLB_PATH = OUTPUT_DIR / "arrival_conservatory_hero_kit.glb"
RUNTIME_GLB_PATH = OUTPUT_DIR / "arrival_conservatory_hero_kit.draco.glb"
MANIFEST_PATH = OUTPUT_DIR / "arrival_conservatory_hero_kit.manifest.json"
PREVIEW_PATH = OUTPUT_DIR / "arrival_conservatory_hero_kit.preview.png"

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
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(PREVIEW_PATH)
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.15
    scene.view_settings.gamma = 1.0
    if hasattr(scene, "eevee"):
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 3.0
        scene.eevee.gtao_factor = 1.25
        scene.eevee.use_soft_shadows = True
        scene.eevee.use_bloom = True
        scene.eevee.bloom_intensity = 0.045
        scene.eevee.bloom_radius = 4.5
        scene.eevee.bloom_threshold = 0.8


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
            "MAT_ALC_PearlStucco", (0.72, 0.79, 0.75), 0.66),
        "bronze": make_material(
            "MAT_ALC_Bronze", (0.19, 0.105, 0.045), 0.27, metallic=0.88),
        "glass": make_material(
            "MAT_ALC_SeaGlass", (0.12, 0.48, 0.50), 0.15, alpha=0.30),
        "ceramic": make_material(
            "MAT_ALC_CoralCeramic", (0.54, 0.16, 0.16), 0.42),
        "stone": make_material(
            "MAT_ALC_NightStone", (0.025, 0.075, 0.095), 0.32),
        "water": make_material(
            "MAT_ALC_TidalWater", (0.018, 0.19, 0.22), 0.10,
            emission=(0.004, 0.035, 0.04), alpha=0.72),
        "glow": make_material(
            "MAT_ALC_LanternGlow", (1.0, 0.34, 0.095), 0.24,
            emission=(1.0, 0.20, 0.025)),
        "soil": make_material(
            "MAT_ALC_Soil", (0.045, 0.027, 0.018), 0.92),
        "leaf": make_material(
            "MAT_ALC_GardenLeaf", (0.035, 0.28, 0.22), 0.54),
    }


def assign_material(obj, material):
    obj.data.materials.append(material)


def apply_object_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def apply_modifier(obj, modifier):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def finish_hard_surface(obj, bevel=0.04, segments=3):
    apply_object_transform(obj)
    if bevel > 0:
        modifier = obj.modifiers.new(name="ALC_Bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        if hasattr(modifier, "affect"):
            modifier.affect = "EDGES"
        apply_modifier(obj, modifier)
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
    normal = obj.modifiers.new(name="ALC_WeightedNormals", type="WEIGHTED_NORMAL")
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


def add_cylinder(name, radius, depth, location, material, scale=(1.0, 1.0, 1.0),
                 vertices=32, bevel=0.035):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=bevel)


def add_uv_sphere(name, location, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24, ring_count=12, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
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


def add_arch_prism(name, inner_radius, outer_radius, spring_z, depth, material,
                   segments=36, bevel=0.02, y_offset=0.0):
    """Create a solid half-annulus in the X/Z plane, extruded along Y."""
    count = segments + 1
    vertices = []
    for y in (-depth * 0.5, depth * 0.5):
        for radius in (inner_radius, outer_radius):
            for index in range(count):
                angle = math.pi * index / segments
                vertices.append((
                    radius * math.cos(angle),
                    y,
                    spring_z + radius * math.sin(angle),
                ))

    def vi(side, ring, index):
        return (side * 2 + ring) * count + index

    faces = []
    for index in range(segments):
        next_index = index + 1
        faces.append((
            vi(0, 0, index), vi(0, 0, next_index),
            vi(0, 1, next_index), vi(0, 1, index)))
        faces.append((
            vi(1, 0, index), vi(1, 1, index),
            vi(1, 1, next_index), vi(1, 0, next_index)))
        faces.append((
            vi(0, 1, index), vi(0, 1, next_index),
            vi(1, 1, next_index), vi(1, 1, index)))
        faces.append((
            vi(0, 0, index), vi(1, 0, index),
            vi(1, 0, next_index), vi(0, 0, next_index)))

    faces.append((vi(0, 0, 0), vi(0, 1, 0), vi(1, 1, 0), vi(1, 0, 0)))
    faces.append((
        vi(0, 0, segments), vi(1, 0, segments),
        vi(1, 1, segments), vi(0, 1, segments)))

    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location.y = y_offset
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=bevel)


def add_ring_prism(name, inner_radius, outer_radius, depth, location, material,
                   segments=40, scale=(1.0, 1.0, 1.0), bevel=0.02):
    vertices = []
    for z in (-depth * 0.5, depth * 0.5):
        for radius in (inner_radius, outer_radius):
            for index in range(segments):
                angle = math.tau * index / segments
                vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))

    def vi(side, ring, index):
        return (side * 2 + ring) * segments + (index % segments)

    faces = []
    for index in range(segments):
        next_index = (index + 1) % segments
        faces.extend([
            (vi(0, 0, index), vi(0, 0, next_index),
             vi(0, 1, next_index), vi(0, 1, index)),
            (vi(1, 0, index), vi(1, 1, index),
             vi(1, 1, next_index), vi(1, 0, next_index)),
            (vi(0, 1, index), vi(0, 1, next_index),
             vi(1, 1, next_index), vi(1, 1, index)),
            (vi(0, 0, index), vi(1, 0, index),
             vi(1, 0, next_index), vi(0, 0, next_index)),
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


def join_components(components, final_name, layout_location, piece_id,
                    origin=(0.0, 0.0, 0.0)):
    bpy.ops.object.select_all(action="DESELECT")
    for component in components:
        component.select_set(True)
    active = components[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    triangulate = active.modifiers.new(name="ALC_ExportTriangulate", type="TRIANGULATE")
    apply_modifier(active, triangulate)
    active.name = final_name
    active.data.name = final_name + "_MESH"
    bpy.context.scene.cursor.location = origin
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR", center="MEDIAN")
    active.location = layout_location
    active["ds_kit"] = KIT_NAME
    active["ds_version"] = KIT_VERSION
    active["ds_piece_id"] = piece_id
    active["ds_origin"] = "ground_anchor"
    PIECES.append(active)
    return active


def add_marker(parent, name, location, scale, role, action="", shape="box"):
    marker = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(marker)
    marker.empty_display_type = "CUBE" if shape == "box" else "PLAIN_AXES"
    marker.empty_display_size = 1.0
    marker.parent = parent
    marker.location = location
    marker.scale = scale
    marker["ds_kit"] = KIT_NAME
    marker["ds_version"] = KIT_VERSION
    marker["ds_role"] = role
    marker["ds_shape"] = shape
    if action:
        marker["ds_action"] = action
    MARKERS.append(marker)
    return marker


def build_arch(materials):
    parts = [
        add_box("arch_left_pier", (0.46, 0.72, 2.45), (-1.72, 0, 1.225),
                materials["pearl"], 0.075),
        add_box("arch_right_pier", (0.46, 0.72, 2.45), (1.72, 0, 1.225),
                materials["pearl"], 0.075),
        add_box("arch_left_foot", (0.68, 0.88, 0.18), (-1.72, 0, 0.09),
                materials["pearl"], 0.055),
        add_box("arch_right_foot", (0.68, 0.88, 0.18), (1.72, 0, 0.09),
                materials["pearl"], 0.055),
        add_box("arch_left_cap", (0.61, 0.84, 0.18), (-1.72, 0, 2.38),
                materials["pearl"], 0.055),
        add_box("arch_right_cap", (0.61, 0.84, 0.18), (1.72, 0, 2.38),
                materials["pearl"], 0.055),
        add_arch_prism("arch_crown", 1.49, 1.95, 2.38, 0.72,
                       materials["pearl"], bevel=0.045),
        add_arch_prism("arch_bronze_inlay", 1.45, 1.49, 2.38, 0.75,
                       materials["bronze"], bevel=0.012),
    ]
    piece = join_components(
        parts, "ALC_Arch_Pearl_A", (-5.4, 3.15, 0), "arch_pearl_a")
    add_marker(piece, "COL_ALC_Arch_Left_A", (-1.72, 0, 1.24),
               (0.32, 0.42, 1.24), "collision")
    add_marker(piece, "COL_ALC_Arch_Right_A", (1.72, 0, 1.24),
               (0.32, 0.42, 1.24), "collision")
    return piece


def build_pier(materials):
    parts = [
        add_tapered_box("pier_body", (0.64, 0.64), (0.47, 0.47), 3.05,
                        (0, 0, 1.60), materials["pearl"], 0.065),
        add_box("pier_foot", (0.80, 0.80, 0.20), (0, 0, 0.10),
                materials["pearl"], 0.06),
        add_box("pier_cap", (0.72, 0.72, 0.18), (0, 0, 3.14),
                materials["pearl"], 0.055),
        add_box("pier_inlay", (0.075, 0.026, 2.18), (0, -0.323, 1.72),
                materials["bronze"], 0.012),
        add_uv_sphere("pier_glow_seed", (0, -0.35, 2.72), (0.09, 0.045, 0.09),
                      materials["glow"]),
    ]
    piece = join_components(
        parts, "ALC_Pier_Pearl_A", (-1.2, 3.15, 0), "pier_pearl_a")
    add_marker(piece, "COL_ALC_Pier_A", (0, 0, 1.60),
               (0.45, 0.45, 1.60), "collision")
    return piece


def build_rib(materials):
    parts = [
        add_arch_prism("rib_arc", 1.72, 1.82, 1.42, 0.14,
                       materials["bronze"], bevel=0.018),
        add_box("rib_left_post", (0.10, 0.14, 1.44), (-1.77, 0, 0.72),
                materials["bronze"], 0.018),
        add_box("rib_right_post", (0.10, 0.14, 1.44), (1.77, 0, 0.72),
                materials["bronze"], 0.018),
        add_box("rib_left_foot", (0.24, 0.26, 0.10), (-1.77, 0, 0.05),
                materials["bronze"], 0.025),
        add_box("rib_right_foot", (0.24, 0.26, 0.10), (1.77, 0, 0.05),
                materials["bronze"], 0.025),
    ]
    return join_components(
        parts, "ALC_Rib_Bronze_A", (2.65, 3.15, 0), "rib_bronze_a")


def build_beam(materials):
    parts = [
        add_box("beam_body", (3.40, 0.18, 0.16), (1.70, 0, 0.16),
                materials["bronze"], 0.035),
        add_box("beam_glow", (2.86, 0.028, 0.035), (1.70, -0.101, 0.16),
                materials["glow"], 0.012),
        add_box("beam_left_collar", (0.18, 0.27, 0.25), (0.12, 0, 0.16),
                materials["bronze"], 0.035),
        add_box("beam_right_collar", (0.18, 0.27, 0.25), (3.28, 0, 0.16),
                materials["bronze"], 0.035),
    ]
    return join_components(
        parts, "ALC_Beam_Bronze_A", (5.2, 3.15, 0), "beam_bronze_a")


def build_canopy(materials):
    parts = [
        add_arch_prism("canopy_glass_shell", 1.66, 1.70, 1.45, 2.40,
                       materials["glass"], segments=48, bevel=0.008),
        add_box("canopy_left_glass", (0.035, 2.40, 1.45), (-1.68, 0, 0.725),
                materials["glass"], 0.006),
        add_box("canopy_right_glass", (0.035, 2.40, 1.45), (1.68, 0, 0.725),
                materials["glass"], 0.006),
    ]
    for index, y_pos in enumerate((-1.18, 0.0, 1.18)):
        parts.append(add_arch_prism(
            "canopy_rib_{:02d}".format(index), 1.62, 1.70, 1.45, 0.065,
            materials["bronze"], segments=36, bevel=0.012, y_offset=y_pos))
    for x_pos in (-1.68, 1.68):
        for y_pos in (-1.18, 1.18):
            parts.append(add_box(
                "canopy_post", (0.10, 0.10, 1.48), (x_pos, y_pos, 0.74),
                materials["bronze"], 0.018))
    piece = join_components(
        parts, "ALC_Canopy_SeaGlass_A", (-5.25, -3.0, 0),
        "canopy_seaglass_a")
    add_marker(piece, "COL_ALC_Canopy_Left_A", (-1.68, 0, 0.74),
               (0.08, 1.20, 0.74), "collision")
    add_marker(piece, "COL_ALC_Canopy_Right_A", (1.68, 0, 0.74),
               (0.08, 1.20, 0.74), "collision")
    return piece


def build_planter(materials):
    parts = [
        add_cylinder("planter_body", 0.92, 0.58, (0, 0, 0.31),
                     materials["ceramic"], scale=(1.0, 0.64, 1.0), bevel=0.07),
        add_ring_prism("planter_rim", 0.73, 0.98, 0.12, (0, 0, 0.61),
                       materials["ceramic"], scale=(1.0, 0.64, 1.0), bevel=0.025),
        add_cylinder("planter_soil", 0.73, 0.045, (0, 0, 0.64),
                     materials["soil"], scale=(1.0, 0.64, 1.0), bevel=0.008),
        add_ring_prism("planter_bronze_band", 0.915, 0.945, 0.055, (0, 0, 0.22),
                       materials["bronze"], scale=(1.0, 0.64, 1.0), bevel=0.012),
    ]
    leaf_specs = [
        ((-0.35, 0.02, 1.10), (0.13, 0.055, 0.54), (0.0, -0.42, -0.12)),
        ((0.31, 0.02, 1.04), (0.12, 0.05, 0.48), (0.0, 0.46, 0.08)),
        ((-0.05, -0.16, 1.18), (0.14, 0.06, 0.61), (0.28, -0.06, 0.0)),
        ((0.09, 0.17, 1.08), (0.12, 0.05, 0.49), (-0.35, 0.18, 0.0)),
        ((0.0, 0.0, 1.28), (0.12, 0.05, 0.66), (0.12, 0.03, 0.0)),
    ]
    for index, (location, scale, rotation) in enumerate(leaf_specs):
        leaf = add_uv_sphere("planter_leaf_{:02d}".format(index), location, scale,
                             materials["leaf"])
        leaf.rotation_euler = rotation
        parts.append(leaf)
    piece = join_components(
        parts, "ALC_Planter_Coral_A", (-1.25, -3.0, 0), "planter_coral_a")
    add_marker(piece, "COL_ALC_Planter_A", (0, 0, 0.52),
               (1.0, 0.68, 0.52), "collision")
    return piece


def build_bench_lantern(materials):
    parts = [
        add_box("bench_seat", (1.92, 0.52, 0.14), (-0.14, 0, 0.53),
                materials["pearl"], 0.07),
        add_box("bench_back", (1.92, 0.13, 0.58), (-0.14, 0.20, 0.84),
                materials["pearl"], 0.065,
                rotation=(math.radians(-7), 0.0, 0.0)),
        add_box("bench_leg_left", (0.14, 0.42, 0.47), (-0.75, 0, 0.25),
                materials["bronze"], 0.035),
        add_box("bench_leg_right", (0.14, 0.42, 0.47), (0.45, 0, 0.25),
                materials["bronze"], 0.035),
        add_cylinder("lantern_post", 0.055, 1.48, (0.90, 0.06, 0.74),
                     materials["bronze"], vertices=24, bevel=0.018),
        add_cylinder("lantern_glow", 0.18, 0.38, (0.90, 0.06, 1.56),
                     materials["glow"], vertices=32, bevel=0.04),
        add_cylinder("lantern_cap", 0.25, 0.08, (0.90, 0.06, 1.79),
                     materials["bronze"], vertices=32, bevel=0.025),
        add_cylinder("lantern_base", 0.14, 0.08, (0.90, 0.06, 0.04),
                     materials["bronze"], vertices=32, bevel=0.025),
    ]
    piece = join_components(
        parts, "ALC_BenchLantern_A", (2.15, -3.0, 0), "bench_lantern_a")
    add_marker(piece, "INT_ALC_Bench_Sit_A", (-0.20, -0.14, 0.64),
               (0.12, 0.12, 0.12), "interaction", action="sit", shape="axes")
    add_marker(piece, "INT_ALC_Lantern_Inspect_A", (0.90, -0.28, 1.52),
               (0.14, 0.14, 0.14), "interaction", action="inspect", shape="axes")
    add_marker(piece, "COL_ALC_Bench_A", (-0.14, 0.03, 0.57),
               (1.0, 0.34, 0.58), "collision")
    return piece


def build_ground_water_trim(materials):
    parts = [
        add_box("trim_stone_walk", (4.0, 0.92, 0.14), (2.0, -0.24, 0.07),
                materials["stone"], 0.045),
        add_box("trim_water", (4.0, 0.48, 0.055), (2.0, 0.47, 0.075),
                materials["water"], 0.025),
        add_box("trim_bronze_edge", (4.0, 0.055, 0.09), (2.0, 0.18, 0.10),
                materials["bronze"], 0.018),
        add_box("trim_pearl_curb", (4.0, 0.16, 0.20), (2.0, 0.78, 0.10),
                materials["pearl"], 0.045),
        add_box("trim_glow_line", (3.64, 0.025, 0.025), (2.0, 0.175, 0.155),
                materials["glow"], 0.008),
    ]
    piece = join_components(
        parts, "ALC_GroundWaterTrim_A", (5.0, -3.0, 0),
        "ground_water_trim_a", origin=(0.0, 0.0, 0.0))
    add_marker(piece, "COL_ALC_GroundWalk_A", (2.0, -0.24, 0.10),
               (2.0, 0.46, 0.10), "collision")
    add_marker(piece, "SFX_ALC_Water_A", (2.0, 0.47, 0.12),
               (0.18, 0.18, 0.18), "audio", action="tidal_water", shape="axes")
    return piece


def build_kit():
    reset_scene()
    configure_scene()
    materials = create_materials()
    build_arch(materials)
    build_pier(materials)
    build_rib(materials)
    build_beam(materials)
    build_canopy(materials)
    build_planter(materials)
    build_bench_lantern(materials)
    build_ground_water_trim(materials)
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


def export_glb(filepath=GLB_PATH):
    ensure_gltf_exporter()
    requested = {
        "filepath": str(filepath),
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": True,
        "export_extras": True,
        "export_cameras": False,
        "export_lights": False,
        "export_animations": False,
        "export_materials": True,
    }
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {key: value for key, value in requested.items() if key in available}
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError("glTF export did not finish: {}".format(result))


def compress_runtime_glb():
    """Create PlayCanvas-compatible Draco output with a pinned converter.

    Blender 2.83's bundled Draco writer emits attribute buffers that newer
    PlayCanvas runtimes reject. glTF Transform preserves the stable node names
    and extras while producing a standards-compliant KHR_draco payload.
    """
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        raise RuntimeError("npx is required to build the runtime Draco GLB")

    args = [
        npx,
        "--yes",
        "@gltf-transform/cli@4.4.1",
        "draco",
        str(GLB_PATH),
        str(RUNTIME_GLB_PATH),
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


def write_manifest():
    data, document = parse_glb(GLB_PATH)
    runtime_data, runtime_document = parse_glb(RUNTIME_GLB_PATH)
    node_names = [node.get("name", "") for node in document.get("nodes", [])]
    material_names = [material.get("name", "") for material in document.get("materials", [])]
    expected_pieces = [piece.name for piece in PIECES]
    expected_markers = [marker.name for marker in MARKERS]
    missing_pieces = [name for name in expected_pieces if name not in node_names]
    missing_markers = [name for name in expected_markers if name not in node_names]
    if missing_pieces or missing_markers:
        raise RuntimeError(
            "GLB is missing expected nodes: {}".format(missing_pieces + missing_markers))

    extras_nodes = [
        node.get("name", "") for node in document.get("nodes", []) if node.get("extras")]
    report = {
        "asset": "arrival_conservatory_hero_kit.glb",
        "kit": KIT_NAME,
        "version": KIT_VERSION,
        "generator": "Blender procedural source; original DateScape geometry",
        "units": "meters",
        "coordinate_system": "glTF Y-up",
        "byte_size": len(data),
        "runtime_asset": RUNTIME_GLB_PATH.name,
        "runtime_byte_size": len(runtime_data),
        "runtime_sha256": hashlib.sha256(runtime_data).hexdigest().upper(),
        "runtime_compression": {
            "extension": "KHR_draco_mesh_compression",
            "method": "glTF Transform 4.4.1, Draco edgebreaker",
            "position_bits": 14,
            "normal_bits": 10,
            "texcoord_bits": 12,
        },
        "scene_count": len(document.get("scenes", [])),
        "node_count": len(document.get("nodes", [])),
        "mesh_count": len(document.get("meshes", [])),
        "material_count": len(document.get("materials", [])),
        "piece_nodes": expected_pieces,
        "marker_nodes": expected_markers,
        "nodes_with_extras": extras_nodes,
        "materials": material_names,
        "validation": {
            "glb_header": "ok",
            "expected_piece_nodes": "ok",
            "expected_marker_nodes": "ok",
            "custom_extras_present": bool(extras_nodes),
            "runtime_draco_required": "KHR_draco_mesh_compression" in runtime_document.get(
                "extensionsRequired", []),
        },
        "limitations": [
            "Sea glass uses portable alpha blending rather than physical transmission.",
            "Collision and interaction empties are metadata nodes; runtime code must interpret them.",
            "The kit has no authored LODs, baked lightmaps, texture maps, or animation.",
            "Modules are laid out as a kit sheet; runtime placement should address nodes by stable name.",
        ],
    }
    MANIFEST_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def point_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name, location, energy, size, color, target=(1.0, 0.0, 1.2)):
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.size = size
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, target)
    return light


def render_preview(materials):
    preview_material = make_material(
        "__PREVIEW_Ground", (0.008, 0.018, 0.028), 0.46)
    bpy.ops.mesh.primitive_plane_add(size=30.0, location=(1.5, 0.0, -0.025))
    ground = bpy.context.object
    ground.name = "__PREVIEW_Ground"
    assign_material(ground, preview_material)

    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.012, 0.025, 1.0)
    background.inputs["Strength"].default_value = 0.22

    add_area_light(
        "__PREVIEW_Key", (-6.5, -7.5, 10.5), 1050, 7.0,
        (0.72, 0.86, 1.0), target=(0.5, 0.0, 1.4))
    add_area_light(
        "__PREVIEW_Warm", (7.5, -2.5, 6.0), 900, 5.0,
        (1.0, 0.38, 0.16), target=(1.5, 0.0, 1.0))
    add_area_light(
        "__PREVIEW_Rim", (0.0, 8.0, 7.0), 800, 6.0,
        (0.12, 0.52, 0.66), target=(0.0, 0.0, 1.5))

    camera_data = bpy.data.cameras.new("__PREVIEW_Camera")
    camera = bpy.data.objects.new("__PREVIEW_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (13.8, -19.8, 11.2)
    camera_data.lens = 52
    point_at(camera, (1.2, 0.0, 1.28))
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main():
    materials = build_kit()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_glb()
    compress_runtime_glb()
    report = write_manifest()
    render_preview(materials)
    print("ARRIVAL_CONSERVATORY_BUILD_OK")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
