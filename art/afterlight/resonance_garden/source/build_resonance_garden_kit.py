"""Build DateScape's original Afterlight Resonance Garden kit.

This Blender 2.83-compatible deterministic generator creates the editable
source scene, raw authoring GLB, base manifest, and an authored preview. The
pinned runtime compression and final checksum pass are orchestrated by
build_resonance_garden.ps1 in this directory.

All geometry and materials are original project-owned work. No paid or
third-party assets or textures are used.
"""

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector


KIT_NAME = "AfterlightResonanceGarden"
KIT_VERSION = 1
SOURCE_DIR = Path(__file__).resolve().parent
ART_DIR = SOURCE_DIR.parent
OUTPUT_DIR = ART_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BLEND_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.blend"
RAW_GLB_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.raw.glb"
MANIFEST_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.manifest.json"
PREVIEW_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.preview.png"

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
    scene.view_settings.exposure = 0.05
    scene.view_settings.gamma = 1.0
    if hasattr(scene, "eevee"):
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 3.0
        scene.eevee.gtao_factor = 1.30
        scene.eevee.use_soft_shadows = True
        scene.eevee.use_bloom = True
        scene.eevee.bloom_intensity = 0.026
        scene.eevee.bloom_radius = 4.0
        scene.eevee.bloom_threshold = 0.90
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
        "stone": make_material(
            "MAT_AFT_WetNightStone", (0.012, 0.042, 0.058), 0.27),
        "stone_dry": make_material(
            "MAT_AFT_BlueBlackStone", (0.024, 0.068, 0.080), 0.48),
        "pearl": make_material(
            "MAT_AFT_PearlLimewash", (0.69, 0.735, 0.70), 0.69),
        "bronze": make_material(
            "MAT_AFT_AgedBronze", (0.18, 0.090, 0.036), 0.32,
            metallic=0.84),
        "ceramic": make_material(
            "MAT_AFT_GlazedSeaCeramic", (0.030, 0.285, 0.275), 0.22),
        "glass": make_material(
            "MAT_AFT_SmokedSeaGlass", (0.052, 0.24, 0.27), 0.16,
            alpha=0.34),
        "water": make_material(
            "MAT_AFT_TidalWater", (0.012, 0.17, 0.205), 0.09,
            emission=(0.002, 0.018, 0.026), alpha=0.78),
        "glow": make_material(
            "MAT_AFT_LanternWarm", (1.0, 0.30, 0.052), 0.28,
            emission=(1.0, 0.18, 0.022)),
        "wood": make_material(
            "MAT_AFT_WarmMarketWood", (0.31, 0.145, 0.062), 0.47),
        "clay": make_material(
            "MAT_AFT_CanvasClay", (0.54, 0.18, 0.135), 0.76),
        "soil": make_material(
            "MAT_AFT_PlanterSoil", (0.040, 0.024, 0.015), 0.92),
        "leaf_dark": make_material(
            "MAT_AFT_GardenLeafDark", (0.022, 0.20, 0.145), 0.57),
        "leaf_mint": make_material(
            "MAT_AFT_GardenLeafMint", (0.070, 0.35, 0.265), 0.53),
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
        modifier = obj.modifiers.new(name="RG_Bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        if hasattr(modifier, "affect"):
            modifier.affect = "EDGES"
        apply_modifier(obj, modifier)
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
    normal = obj.modifiers.new(name="RG_WeightedNormals", type="WEIGHTED_NORMAL")
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
                 scale=(1.0, 1.0, 1.0), vertices=24, bevel=0.03,
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
                  segments=14, rings=7):
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


def add_ring_segment(name, inner_radius, outer_radius, depth, location,
                     material, start_degrees, end_degrees, scale=(1, 1, 1),
                     segments=24, bevel=0.025):
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


def add_bowl(name, radius, height, location, material, segments=24):
    """Create a hollow, gently flared acoustic bowl from a lathed profile."""
    profile = [
        (radius * 0.22, 0.00), (radius * 0.55, height * 0.12),
        (radius * 0.86, height * 0.56), (radius, height),
        (radius * 0.84, height), (radius * 0.72, height * 0.60),
        (radius * 0.46, height * 0.24), (radius * 0.20, height * 0.10),
    ]
    vertices = []
    for radial, z in profile:
        for index in range(segments):
            angle = math.tau * index / segments
            vertices.append((radial * math.cos(angle),
                             radial * math.sin(angle), z))
    faces = []
    rings = len(profile)
    for ring in range(rings - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((ring * segments + index,
                          ring * segments + nxt,
                          (ring + 1) * segments + nxt,
                          (ring + 1) * segments + index))
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    assign_material(obj, material)
    return finish_hard_surface(obj, bevel=0.018, segments=2)


def add_ramp(name, width, length, rise, location, material):
    x = width * 0.5
    y = length * 0.5
    vertices = [
        (-x, -y, 0.0), (x, -y, 0.0), (x, y, 0.0), (-x, y, 0.0),
        (-x, -y, 0.0), (x, -y, 0.0), (x, y, rise), (-x, y, rise),
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
    return finish_hard_surface(obj, bevel=0.025, segments=2)


def add_leaf(name, location, scale, rotation, material):
    outline = [
        (0.0, 0.0, -1.0), (-0.74, 0.0, -0.30), (-0.58, 0.0, 0.38),
        (0.0, 0.0, 1.0), (0.58, 0.0, 0.38), (0.74, 0.0, -0.30),
    ]
    vertices = outline + [(0.0, -0.22, 0.06), (0.0, 0.22, 0.06)]
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


def add_sail_panel(name, height, base_width, location, material, mirror=1.0):
    """Create a subtly twisted acoustic fin with a custom authored silhouette."""
    sections = 7
    vertices = []
    for side in (-1.0, 1.0):
        for index in range(sections):
            t = index / (sections - 1)
            width = base_width * (0.22 + 0.78 * math.sin(math.pi * t) ** 0.72)
            center_x = mirror * (0.10 * math.sin(t * math.pi) + 0.22 * t * t)
            center_y = 0.08 * math.sin(t * math.pi * 1.3)
            z = height * t
            vertices.append((center_x + mirror * width * side * 0.5,
                             center_y + side * 0.025, z))

    def vi(side, index):
        return side * sections + index

    faces = []
    for index in range(sections - 1):
        nxt = index + 1
        faces.append((vi(0, index), vi(0, nxt), vi(1, nxt), vi(1, index)))
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    assign_material(obj, material)
    solidify = obj.modifiers.new(name="RG_SailThickness", type="SOLIDIFY")
    solidify.thickness = 0.045
    apply_modifier(obj, solidify)
    return finish_hard_surface(obj, bevel=0.018, segments=2)


def join_components(components, final_name, layout_location, piece_id,
                    origin=(0.0, 0.0, 0.0), origin_kind="ground_anchor"):
    bpy.ops.object.select_all(action="DESELECT")
    for component in components:
        component.select_set(True)
    active = components[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    triangulate = active.modifiers.new(name="RG_ExportTriangulate", type="TRIANGULATE")
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


def plant_cluster(parts, prefix, center, x_values, materials, base_height=0.55):
    cx, cy, cz = center
    for index, x_offset in enumerate(x_values):
        height = base_height * (0.78 + 0.10 * (index % 4))
        material = materials["leaf_mint"] if index % 3 == 1 else materials["leaf_dark"]
        parts.append(add_leaf(
            "{}_leaf_{:02d}".format(prefix, index + 1),
            (cx + x_offset, cy + 0.06 * ((index % 3) - 1),
             cz + height * 0.48),
            (0.14, 0.085, height * 0.50),
            (0.08 * ((index % 2) - 0.5), 0.22 * math.sin(index),
             0.16 * ((index % 3) - 1)), material))


def build_terrace_water_edge(materials):
    parts = [
        add_box("terrace_base", (13.60, 10.80, 0.16), (0.0, 0.0, 0.08),
                materials["stone"], 0.18),
        add_box("terrace_upper", (12.90, 7.60, 0.10), (0.0, -0.70, 0.21),
                materials["stone_dry"], 0.16),
        add_box("terrace_water", (13.20, 1.92, 0.09), (0.0, 4.05, 0.18),
                materials["water"], 0.12),
        add_box("terrace_water_bed", (13.28, 2.02, 0.055), (0.0, 4.05, 0.105),
                materials["stone"], 0.10),
        add_box("terrace_edge_left", (3.25, 0.18, 0.17),
                (-4.95, 3.08, 0.305), materials["pearl"], 0.052),
        add_box("terrace_edge_center", (1.35, 0.16, 0.12),
                (-1.95, 3.08, 0.28), materials["bronze"], 0.038),
        add_box("terrace_edge_far", (1.10, 0.18, 0.17),
                (6.00, 3.08, 0.305), materials["pearl"], 0.052),
        add_ramp("terrace_entry_ramp", 3.20, 1.85, 0.10,
                 (0.0, -4.25, 0.16), materials["stone_dry"]),
        add_box("terrace_entry_bronze", (0.055, 1.62, 0.035),
                (-1.28, -4.20, 0.245), materials["bronze"], 0.012,
                rotation=(0.055, 0.0, 0.0)),
        add_box("terrace_entry_mint", (0.045, 1.62, 0.035),
                (1.28, -4.20, 0.245), materials["ceramic"], 0.012,
                rotation=(0.055, 0.0, 0.0)),
    ]
    bronze_path = [(-1.35, -3.30, 0.278), (-1.60, -2.10, 0.278),
                   (-1.05, -0.90, 0.278), (-1.35, 0.55, 0.278),
                   (-0.75, 1.85, 0.278), (-1.10, 2.80, 0.278)]
    mint_path = [(1.35, -3.30, 0.278), (1.58, -2.08, 0.278),
                 (1.02, -0.82, 0.278), (1.34, 0.62, 0.278),
                 (0.78, 1.88, 0.278), (1.08, 2.80, 0.278)]
    parts.extend([
        add_curve_tube("terrace_bronze_tide_line", bronze_path, 0.025,
                       materials["bronze"], bevel_resolution=1),
        add_curve_tube("terrace_mint_tide_line", mint_path, 0.022,
                       materials["ceramic"], bevel_resolution=1),
    ])
    for index, (cx, cy, radius) in enumerate(((-3.1, 4.12, 0.42),
                                               (0.6, 4.38, 0.30),
                                               (4.7, 3.82, 0.50))):
        ring = [(cx + radius * math.cos(math.tau * i / 24.0),
                 cy + radius * math.sin(math.tau * i / 24.0), 0.235)
                for i in range(24)]
        parts.append(add_curve_tube(
            "terrace_water_ripple_{:02d}".format(index + 1), ring, 0.014,
            materials["pearl"], cyclic=True, bevel_resolution=1))

    piece = join_components(
        parts, "RG_TerraceWaterEdge_A", (0.0, 0.0, 0.0),
        "terrace_water_edge_a")
    add_marker(piece, "COL_RG_LowerTerrace_A", (0.0, -1.15, 0.08),
               (6.80, 4.25, 0.08), "collision", "walkable_surface")
    add_marker(piece, "COL_RG_UpperTerrace_A", (0.0, -0.70, 0.21),
               (6.45, 3.80, 0.05), "collision", "walkable_surface")
    add_marker(piece, "NAV_RG_EntryRamp_A", (0.0, -4.25, 0.21),
               (1.60, 0.93, 0.12), "nav_surface", "accessible_ramp")
    add_marker(piece, "COL_RG_WaterEdge_Left_A", (-4.95, 3.08, 0.31),
               (1.63, 0.12, 0.16), "collision")
    add_marker(piece, "COL_RG_WaterEdge_Center_A", (-1.95, 3.08, 0.29),
               (0.68, 0.12, 0.13), "collision")
    add_marker(piece, "VOL_RG_WaterNoWalk_A", (0.0, 4.05, 0.50),
               (6.60, 0.96, 0.50), "water_exclusion")
    add_marker(piece, "SFX_RG_WaterEdge_A", (0.0, 4.10, 0.30),
               (0.30, 0.30, 0.30), "audio", "garden_water_edge",
               shape="axes")
    add_marker(piece, "VFX_RG_WaterSurface_A", (0.0, 4.05, 0.23),
               (6.55, 0.92, 0.10), "vfx_anchor", "tidal_water_surface")
    return piece


def build_resonance_loom(materials):
    parts = [
        add_cylinder("loom_plinth", 2.16, 0.16, (0.0, 0.0, 0.08),
                     materials["pearl"], scale=(1.0, 0.60, 1.0),
                     vertices=32, bevel=0.07),
        add_cylinder("loom_inner_pad", 1.92, 0.055, (0.0, 0.0, 0.185),
                     materials["stone_dry"], scale=(1.0, 0.60, 1.0),
                     vertices=32, bevel=0.045),
    ]
    for side in (-1.0, 1.0):
        frame_points = []
        for index in range(23):
            t = index / 22.0
            x = side * (1.70 - 1.22 * t + 0.20 * math.sin(math.pi * t))
            y = 0.12 * math.sin(math.pi * t)
            z = 0.22 + 3.28 * t
            frame_points.append((x, y, z))
        parts.append(add_curve_tube(
            "loom_frame_{}".format("left" if side < 0 else "right"),
            frame_points, 0.062, materials["bronze"], bevel_resolution=1))
        parts.append(add_sail_panel(
            "loom_sail_{}".format("left" if side < 0 else "right"),
            2.18, 0.58, (side * 0.96, 0.20, 0.38), materials["glass"],
            mirror=side))
        string_xs = (1.34, 1.10, 0.86, 0.64)
        for string_index, magnitude in enumerate(string_xs):
            x = side * magnitude
            top_z = 2.58 + 0.19 * string_index
            parts.append(add_curve_tube(
                "loom_string_{}_{:02d}".format(
                    "l" if side < 0 else "r", string_index + 1),
                [(x, -0.08, 0.37), (x, -0.08, top_z)], 0.012,
                materials["pearl"], bevel_resolution=1))
            bead_z = 1.02 + 0.34 * ((string_index + (0 if side < 0 else 2)) % 4)
            parts.append(add_uv_sphere(
                "loom_tone_bead_{}_{:02d}".format(
                    "l" if side < 0 else "r", string_index + 1),
                (x, -0.08, bead_z), (0.075, 0.045, 0.075),
                materials["clay"] if string_index == 1 else materials["ceramic"],
                segments=12, rings=6))

    parts.extend([
        add_curve_tube("loom_resonator_drop", [(0.0, 0.06, 3.46),
                                                (0.0, 0.06, 2.62)],
                       0.018, materials["bronze"], bevel_resolution=1),
        add_uv_sphere("loom_resonator", (0.0, 0.06, 2.17),
                      (0.34, 0.18, 0.48), materials["glass"],
                      segments=18, rings=9),
        add_curve_tube("loom_resonator_cradle",
                       [(-0.34, 0.04, 2.17), (-0.18, -0.03, 1.80),
                        (0.0, -0.05, 1.70), (0.18, -0.03, 1.80),
                        (0.34, 0.04, 2.17)],
                       0.026, materials["bronze"], bevel_resolution=1),
        add_bowl("loom_bowl_left", 0.43, 0.30, (-1.10, -0.74, 0.22),
                 materials["ceramic"], segments=20),
        add_bowl("loom_bowl_right", 0.43, 0.30, (1.10, -0.74, 0.22),
                 materials["ceramic"], segments=20),
        add_curve_tube("loom_striker_left",
                       [(-1.52, -0.68, 0.30), (-1.45, -0.68, 0.70),
                        (-1.25, -0.68, 0.82)], 0.028, materials["bronze"]),
        add_curve_tube("loom_striker_right",
                       [(1.52, -0.68, 0.30), (1.45, -0.68, 0.70),
                        (1.25, -0.68, 0.82)], 0.028, materials["bronze"]),
    ])
    piece = join_components(
        parts, "RG_ResonanceLoom_A", (0.0, 0.30, 0.26),
        "resonance_loom_a", origin_kind="terrace_surface_anchor")
    add_marker(piece, "COL_RG_LoomPlinth_A", (0.0, 0.0, 0.12),
               (2.17, 1.31, 0.12), "collision")
    add_marker(piece, "COL_RG_LoomFrame_Left_A", (-1.20, 0.05, 1.75),
               (0.55, 0.18, 1.75), "collision")
    add_marker(piece, "COL_RG_LoomFrame_Right_A", (1.20, 0.05, 1.75),
               (0.55, 0.18, 1.75), "collision")
    add_marker(piece, "INT_RG_LoomTune_Left_A", (-1.10, -1.18, 0.0),
               (0.24, 0.24, 0.24), "interaction", "tune_resonance_left",
               shape="axes", facing_yaw=0)
    add_marker(piece, "INT_RG_LoomTune_Right_A", (1.10, -1.18, 0.0),
               (0.24, 0.24, 0.24), "interaction", "tune_resonance_right",
               shape="axes", facing_yaw=0)
    add_marker(piece, "ACT_RG_LoomDuetCenter_A", (0.0, -0.88, 1.0),
               (1.85, 0.72, 1.0), "activity_volume", "cooperative_resonance_duet")
    add_marker(piece, "SOC_RG_LoomConversation_A", (0.0, -0.20, 1.0),
               (2.35, 1.55, 1.0), "social_volume", "two_person_conversation")
    add_marker(piece, "SFX_RG_LoomTone_A", (0.0, 0.05, 2.10),
               (0.28, 0.28, 0.28), "audio", "resonance_loom_tone",
               shape="axes")
    return piece


def build_sound_bowl_planter(materials):
    parts = [
        add_box("bowls_plinth", (2.92, 1.22, 0.25), (0.0, 0.0, 0.13),
                materials["pearl"], 0.085),
        add_box("bowls_glazed_band", (2.58, 0.06, 0.13),
                (0.0, -0.615, 0.15), materials["ceramic"], 0.025),
        add_box("bowls_soil", (2.54, 0.42, 0.08), (0.0, 0.28, 0.30),
                materials["soil"], 0.03),
    ]
    bowl_specs = [(-0.88, 0.45, 0.33), (0.0, 0.36, 0.28), (0.88, 0.50, 0.38)]
    for index, (x, radius, height) in enumerate(bowl_specs):
        parts.append(add_bowl(
            "bowls_tone_{:02d}".format(index + 1), radius, height,
            (x, -0.24, 0.25), materials["ceramic"], segments=20))
        parts.append(add_curve_tube(
            "bowls_striker_{:02d}".format(index + 1),
            [(x + radius + 0.08, -0.15, 0.30),
             (x + radius + 0.10, -0.12, 0.70),
             (x + radius - 0.04, -0.14, 0.80)],
            0.022, materials["bronze"], bevel_resolution=1))
    plant_cluster(parts, "bowls", (0.0, 0.27, 0.32),
                  (-1.10, -0.80, -0.48, -0.16, 0.18, 0.51, 0.82, 1.10),
                  materials, base_height=0.68)
    piece = join_components(
        parts, "RG_SoundBowlPlanter_A", (-4.40, -1.42, 0.26),
        "sound_bowl_planter_a", origin_kind="terrace_surface_anchor")
    add_marker(piece, "COL_RG_SoundBowlPlanter_A", (0.0, 0.0, 0.45),
               (1.47, 0.63, 0.45), "collision")
    for index, (x, _, _) in enumerate(bowl_specs):
        add_marker(piece, "INT_RG_SoundBowl_{:02d}_A".format(index + 1),
                   (x, -0.86, 0.0), (0.20, 0.20, 0.20), "interaction",
                   "play_planted_sound_bowl", shape="axes", facing_yaw=0)
    add_marker(piece, "SFX_RG_SoundBowlCluster_A", (0.0, -0.20, 0.80),
               (0.25, 0.25, 0.25), "audio", "sound_bowl_cluster",
               shape="axes")
    return piece


def build_duet_bench(materials):
    parts = [
        add_ring_segment("bench_plinth", 1.02, 1.92, 0.20,
                         (0.0, 0.0, 0.10), materials["pearl"], 198, 342,
                         scale=(1.0, 0.62, 1.0), segments=24, bevel=0.055),
        add_ring_segment("bench_seat", 1.14, 1.82, 0.16,
                         (0.0, 0.0, 0.48), materials["wood"], 202, 338,
                         scale=(1.0, 0.62, 1.0), segments=24, bevel=0.048),
        add_ring_segment("bench_back", 1.68, 1.88, 0.48,
                         (0.0, 0.0, 0.75), materials["pearl"], 202, 338,
                         scale=(1.0, 0.62, 1.0), segments=24, bevel=0.045),
        add_ring_segment("bench_back_inlay", 1.655, 1.70, 0.34,
                         (0.0, 0.0, 0.77), materials["bronze"], 210, 330,
                         scale=(1.0, 0.62, 1.0), segments=20, bevel=0.014),
        add_cylinder("bench_side_table", 0.30, 0.09, (0.0, -1.13, 0.56),
                     materials["ceramic"], vertices=24, bevel=0.045),
        add_tapered_box("bench_side_table_base", (0.20, 0.20),
                        (0.13, 0.13), 0.48, (0.0, -1.13, 0.28),
                        materials["bronze"], bevel=0.025),
    ]
    piece = join_components(
        parts, "RG_DuetBench_A", (4.18, 1.18, 0.26), "duet_bench_a",
        origin_kind="terrace_surface_anchor")
    add_marker(piece, "COL_RG_DuetBench_A", (0.0, -0.63, 0.58),
               (1.86, 0.62, 0.58), "collision")
    for index, angle_degrees in enumerate((238, 302)):
        angle = math.radians(angle_degrees)
        x = 1.46 * math.cos(angle)
        y = 1.46 * math.sin(angle) * 0.62
        add_marker(piece, "INT_RG_DuetBench_Sit_{:02d}_A".format(index + 1),
                   (x, y, 0.54), (0.22, 0.22, 0.22), "interaction",
                   "sit_garden_duet_bench", shape="axes", facing_yaw=0)
    add_marker(piece, "INT_RG_DuetBench_Accessible_A", (2.05, -0.38, 0.0),
               (0.23, 0.23, 0.23), "interaction", "join_duet_bench",
               shape="axes", facing_yaw=0)
    add_marker(piece, "NAV_RG_DuetBench_ClearEnd_A", (2.12, -0.38, 0.72),
               (0.64, 0.72, 0.72), "nav_keep_clear")
    add_marker(piece, "SOC_RG_DuetBenchPocket_A", (0.0, -0.42, 0.90),
               (2.25, 1.38, 0.90), "social_volume", "two_person_overlook")
    return piece


def build_listening_dais(materials):
    parts = [
        add_cylinder("dais_base", 1.88, 0.20, (0.0, 0.0, 0.10),
                     materials["stone_dry"], scale=(1.0, 0.70, 1.0),
                     vertices=30, bevel=0.075),
        add_cylinder("dais_top", 1.70, 0.07, (0.0, 0.0, 0.235),
                     materials["pearl"], scale=(1.0, 0.70, 1.0),
                     vertices=30, bevel=0.05),
        add_ramp("dais_ramp", 1.24, 1.34, 0.18, (0.0, -1.64, 0.02),
                 materials["pearl"]),
        add_ring_segment("dais_inlay", 1.37, 1.49, 0.032,
                         (0.0, 0.0, 0.285), materials["bronze"], 15, 165,
                         scale=(1.0, 0.70, 1.0), segments=22, bevel=0.012),
    ]
    rail_points = []
    for index in range(17):
        x = -1.52 + 3.04 * index / 16.0
        normalized = x / 1.52
        rail_points.append((x, 0.92, 0.70 + 0.38 * (1.0 - normalized * normalized)))
    parts.append(add_curve_tube(
        "dais_listening_rail", rail_points, 0.036, materials["bronze"],
        bevel_resolution=1))
    parts.extend([
        add_cylinder("dais_tone_disc_left", 0.20, 0.08,
                     (-1.47, 0.92, 0.74), materials["ceramic"],
                     vertices=20, bevel=0.03,
                     rotation=(math.pi * 0.5, 0.0, 0.0)),
        add_cylinder("dais_tone_disc_right", 0.20, 0.08,
                     (1.47, 0.92, 0.74), materials["ceramic"],
                     vertices=20, bevel=0.03,
                     rotation=(math.pi * 0.5, 0.0, 0.0)),
    ])
    piece = join_components(
        parts, "RG_ListeningDais_A", (-4.28, 1.82, 0.26),
        "listening_dais_a", origin_kind="terrace_surface_anchor")
    add_marker(piece, "COL_RG_ListeningDais_A", (0.0, 0.0, 0.18),
               (1.90, 1.34, 0.18), "collision")
    add_marker(piece, "NAV_RG_ListeningDaisRamp_A", (0.0, -1.64, 0.12),
               (0.62, 0.67, 0.14), "nav_surface", "accessible_ramp")
    add_marker(piece, "INT_RG_ListeningDaisJoin_A", (0.0, -0.45, 0.28),
               (0.24, 0.24, 0.24), "interaction", "join_listening_dais",
               shape="axes", facing_yaw=180)
    add_marker(piece, "INT_RG_ListeningDais_Left_A", (-0.72, 0.18, 0.28),
               (0.22, 0.22, 0.22), "interaction", "stand_listening_dais",
               shape="axes", facing_yaw=180)
    add_marker(piece, "INT_RG_ListeningDais_Right_A", (0.72, 0.18, 0.28),
               (0.22, 0.22, 0.22), "interaction", "stand_listening_dais",
               shape="axes", facing_yaw=180)
    add_marker(piece, "SOC_RG_ListeningDaisPocket_A", (0.0, -0.12, 0.88),
               (2.05, 1.62, 0.88), "social_volume", "small_group_listening")
    add_marker(piece, "SFX_RG_ListeningDais_A", (0.0, 0.45, 0.90),
               (0.26, 0.26, 0.26), "audio", "listening_dais_focus",
               shape="axes")
    return piece


def build_overlook_rail(materials):
    parts = []
    for index, x in enumerate((-2.26, 0.0, 2.26)):
        parts.extend([
            add_tapered_box("rail_post_{:02d}".format(index + 1),
                            (0.22, 0.24), (0.14, 0.16), 1.02,
                            (x, 0.0, 0.51), materials["bronze"], 0.028),
            add_cylinder("rail_foot_{:02d}".format(index + 1), 0.25, 0.10,
                         (x, 0.0, 0.05), materials["pearl"],
                         scale=(1.0, 0.78, 1.0), vertices=20, bevel=0.028),
        ])
    rail_points = []
    for index in range(25):
        x = -2.42 + 4.84 * index / 24.0
        rail_points.append((x, 0.0, 1.04 + 0.025 * math.cos(math.pi * x / 2.42)))
    parts.extend([
        add_curve_tube("rail_top_bronze", rail_points, 0.052,
                       materials["bronze"], bevel_resolution=1),
        add_box("rail_lean_ledge", (4.72, 0.24, 0.10), (0.0, -0.10, 0.98),
                materials["wood"], 0.04),
        add_box("rail_lower_left", (2.02, 0.08, 0.07),
                (-1.22, 0.0, 0.52), materials["bronze"], 0.018),
        add_box("rail_lower_right", (2.02, 0.08, 0.07),
                (1.22, 0.0, 0.52), materials["bronze"], 0.018),
    ])
    piece = join_components(
        parts, "RG_OverlookRail_A", (3.68, 3.14, 0.26),
        "overlook_rail_a", origin_kind="terrace_surface_anchor")
    add_marker(piece, "COL_RG_OverlookRail_A", (0.0, 0.0, 0.55),
               (2.45, 0.16, 0.55), "collision")
    add_marker(piece, "INT_RG_OverlookGaze_Left_A", (-1.10, -0.48, 0.0),
               (0.22, 0.22, 0.22), "interaction", "share_skyline_gaze",
               shape="axes", facing_yaw=180)
    add_marker(piece, "INT_RG_OverlookGaze_Right_A", (1.10, -0.48, 0.0),
               (0.22, 0.22, 0.22), "interaction", "share_skyline_gaze",
               shape="axes", facing_yaw=180)
    return piece


def build_garden_screen(materials):
    parts = [
        add_box("screen_trough", (3.10, 0.74, 0.46), (0.0, 0.0, 0.23),
                materials["pearl"], 0.085),
        add_box("screen_glazed_band", (2.76, 0.055, 0.23),
                (0.0, -0.372, 0.24), materials["ceramic"], 0.03),
        add_box("screen_soil", (2.68, 0.46, 0.075), (0.0, 0.0, 0.49),
                materials["soil"], 0.025),
    ]
    reed_xs = (-1.24, -0.62, 0.0, 0.64, 1.24)
    for index, x in enumerate(reed_xs):
        height = 1.25 + 0.18 * (index % 3)
        points = [(x, 0.10, 0.48),
                  (x + 0.05 * ((index % 2) * 2 - 1), 0.10, height * 0.72),
                  (x + 0.10 * ((index % 2) * 2 - 1), 0.10, height + 0.48)]
        parts.append(add_curve_tube(
            "screen_reed_{:02d}".format(index + 1), points, 0.030,
            materials["bronze"], bevel_resolution=1))
    plant_cluster(parts, "screen", (0.0, 0.0, 0.49),
                  (-1.32, -1.05, -0.78, -0.48, -0.17,
                   0.15, 0.46, 0.76, 1.04, 1.31), materials,
                  base_height=0.76)
    parts.extend([
        add_cylinder("screen_tone_disc_left", 0.16, 0.055,
                     (-0.62, 0.10, 1.64), materials["glass"],
                     vertices=18, bevel=0.022,
                     rotation=(math.pi * 0.5, 0.0, 0.0)),
        add_cylinder("screen_tone_disc_right", 0.13, 0.055,
                     (0.64, 0.10, 1.47), materials["clay"],
                     vertices=18, bevel=0.022,
                     rotation=(math.pi * 0.5, 0.0, 0.0)),
    ])
    piece = join_components(
        parts, "RG_GardenScreen_A", (4.65, -1.66, 0.26),
        "garden_screen_a", origin_kind="terrace_surface_anchor")
    add_marker(piece, "COL_RG_GardenScreen_A", (0.0, 0.0, 0.78),
               (1.56, 0.39, 0.78), "collision")
    add_marker(piece, "INT_RG_GardenScreen_Listen_A", (0.0, -0.72, 0.0),
               (0.22, 0.22, 0.22), "interaction", "listen_garden_screen",
               shape="axes", facing_yaw=0)
    return piece


def build_lantern_reeds(materials):
    parts = [
        add_cylinder("lantern_reeds_base", 0.63, 0.28, (0.0, 0.0, 0.14),
                     materials["ceramic"], scale=(1.0, 0.74, 1.0),
                     vertices=26, bevel=0.06),
        add_cylinder("lantern_reeds_rim", 0.68, 0.08, (0.0, 0.0, 0.32),
                     materials["pearl"], scale=(1.0, 0.74, 1.0),
                     vertices=26, bevel=0.035),
    ]
    reed_specs = [(-0.34, -0.05, 1.45), (0.02, 0.06, 2.05),
                  (0.35, -0.02, 2.62)]
    light_locations = []
    for index, (x, y, height) in enumerate(reed_specs):
        points = [(x * 0.55, y, 0.30), (x * 0.78, y, height * 0.62),
                  (x, y, height)]
        parts.append(add_curve_tube(
            "lantern_reed_{:02d}".format(index + 1), points, 0.034,
            materials["bronze"], bevel_resolution=1))
        lantern_z = height - 0.14
        light_locations.append((x, y, lantern_z))
        parts.extend([
            add_cylinder("lantern_seed_{:02d}".format(index + 1), 0.13, 0.24,
                         (x, y, lantern_z), materials["glow"],
                         vertices=16, bevel=0.025),
            add_cylinder("lantern_seed_cap_{:02d}".format(index + 1),
                         0.15, 0.04, (x, y, lantern_z + 0.14),
                         materials["bronze"], vertices=16, bevel=0.012),
        ])
    piece = join_components(
        parts, "RG_LanternReeds_A", (5.62, -4.36, 0.16),
        "lantern_reeds_a", origin_kind="lower_terrace_anchor")
    add_marker(piece, "COL_RG_LanternReeds_A", (0.0, 0.0, 0.70),
               (0.70, 0.52, 0.70), "collision")
    add_marker(piece, "INT_RG_LanternReeds_Inspect_A", (0.0, -0.72, 0.0),
               (0.21, 0.21, 0.21), "interaction", "inspect_lantern_reeds",
               shape="axes", facing_yaw=0)
    for index, location in enumerate(light_locations):
        add_marker(piece, "LGT_RG_LanternReed_{:02d}_A".format(index + 1),
                   location, (0.16, 0.16, 0.16), "light_anchor",
                   "warm_garden_lantern", shape="axes")
    return piece


def build_kit():
    reset_scene()
    configure_scene()
    materials = create_materials()
    build_terrace_water_edge(materials)
    build_resonance_loom(materials)
    build_sound_bowl_planter(materials)
    build_duet_bench(materials)
    build_listening_dais(materials)
    build_overlook_rail(materials)
    build_garden_screen(materials)
    build_lantern_reeds(materials)
    scene = bpy.context.scene
    scene["ds_kit"] = KIT_NAME
    scene["ds_version"] = KIT_VERSION
    scene["ds_units"] = "meters"
    scene["ds_grid_m"] = 0.5
    scene["ds_primary_path_m"] = 3.0
    scene["ds_accessible_route_m"] = 1.8
    scene["ds_social_pocket_count"] = 5
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


def export_raw_glb():
    ensure_gltf_exporter()
    requested = {
        "filepath": str(RAW_GLB_PATH),
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


def write_base_manifest():
    data, document = parse_glb(RAW_GLB_PATH)
    node_names = [node.get("name", "") for node in document.get("nodes", [])]
    material_names = [material.get("name", "")
                      for material in document.get("materials", [])]
    expected_pieces = [piece.name for piece in PIECES]
    expected_markers = [marker.name for marker in MARKERS]
    missing = [name for name in expected_pieces + expected_markers
               if name not in node_names]
    if missing:
        raise RuntimeError("Raw GLB is missing expected nodes: {}".format(missing))
    preview_nodes = [name for name in node_names if name.startswith("__PREVIEW_")]
    if preview_nodes:
        raise RuntimeError("Preview-only objects leaked into GLB: {}".format(preview_nodes))
    extras_nodes = [node.get("name", "") for node in document.get("nodes", [])
                    if node.get("extras")]
    modules = []
    for piece in PIECES:
        modules.append({
            "name": piece.name,
            "piece_id": piece.get("ds_piece_id", ""),
            "dimensions_m": rounded_vector(piece.dimensions),
            "layout_position_m": rounded_vector(piece.location),
            "triangle_count": len(piece.data.polygons),
            "origin": piece.get("ds_origin", ""),
            "front": piece.get("ds_front", ""),
        })
    markers = []
    for marker in MARKERS:
        markers.append({
            "name": marker.name,
            "parent": marker.parent.name if marker.parent else "",
            "role": marker.get("ds_role", ""),
            "action": marker.get("ds_action", ""),
            "local_position_m": rounded_vector(marker.location),
            "half_extents_or_display_scale_m": rounded_vector(marker.scale),
            "facing_yaw_deg": marker.get("ds_facing_yaw_deg", 0.0),
        })
    triangle_total = sum(len(piece.data.polygons) for piece in PIECES)
    if triangle_total > 70000:
        raise RuntimeError(
            "Garden kit exceeds 70k triangle budget: {}".format(triangle_total))
    report = {
        "asset": RAW_GLB_PATH.name,
        "runtime_asset": {
            "asset": "afterlight_resonance_garden_kit.runtime.draco.glb",
            "status": "pending pinned glTF Transform build step",
        },
        "kit": KIT_NAME,
        "version": KIT_VERSION,
        "generator": "Blender procedural source; original DateScape geometry",
        "source_license": "Original project-owned geometry; no third-party assets",
        "units": "meters",
        "coordinate_system": "glTF Y-up; authored Blender Z-up",
        "authored_front": "-Y",
        "modular_grid_m": 0.5,
        "primary_path_m": 3.0,
        "accessible_route_m": 1.8,
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
        "modules": modules,
        "markers": markers,
        "composition": {
            "intent": "Intimate moonlit water-edge garden for paired acoustic play and conversation",
            "social_pockets": [
                "cooperative Resonance Loom duet",
                "planted sound-bowl discovery",
                "two-person overlook bench",
                "accessible small-group listening dais",
                "shared skyline gaze rail",
            ],
            "water_edge": "+Y side with skyline sightline",
            "focal_point": "custom bronze, pearl, and sea-glass acoustic loom",
            "preview_social_proxies": 4,
        },
        "validation": {
            "raw_glb_header": "ok",
            "raw_expected_piece_nodes": "ok",
            "raw_expected_marker_nodes": "ok",
            "custom_extras_present": bool(extras_nodes),
            "preview_nodes_excluded": True,
            "all_module_meshes_triangulated": all(
                len(polygon.vertices) == 3
                for piece in PIECES for polygon in piece.data.polygons),
            "triangle_budget_under_70000": True,
            "runtime_draco_extension": "pending finalizer",
            "pinned_decoder_roundtrip": "pending finalizer",
        },
        "limitations": [
            "Smoked glass and tidal water use portable alpha blending.",
            "Collision, navigation, interaction, social, activity, audio, VFX, and light empties are metadata nodes; runtime code must interpret them.",
            "This hero kit has no texture maps, baked lightmaps, authored LODs, animation, or final spatial audio assets yet.",
            "The runtime Draco GLB requires decoder initialization before PlayCanvas loads it.",
            "Preview avatars and skyline are scale/composition proxies only and are excluded from export.",
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


def add_preview_avatar(index, location, yaw_degrees, scale_value,
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
    root.scale = (scale_value, scale_value, scale_value)
    return root


def render_preview(materials):
    preview_ground = make_material(
        "__PREVIEW_GroundMaterial", (0.005, 0.012, 0.022), 0.48)
    bpy.ops.mesh.primitive_plane_add(size=38.0, location=(0.0, 2.0, -0.03))
    ground = bpy.context.object
    ground.name = "__PREVIEW_Ground"
    assign_material(ground, preview_ground)

    preview_water = make_material(
        "__PREVIEW_DistantWater", (0.005, 0.055, 0.085), 0.18,
        emission=(0.0005, 0.004, 0.008))
    add_box("__PREVIEW_DistantWater", (22.0, 8.0, 0.06),
            (0.0, 9.2, 0.02), preview_water, 0.08)
    skyline_material = make_material(
        "__PREVIEW_SkylineMaterial", (0.012, 0.034, 0.055), 0.58)
    skyline_specs = [
        (-7.2, 1.55, 1.75), (-5.45, 1.05, 2.55),
        (-3.75, 1.45, 1.90), (-1.85, 1.25, 2.90),
        (0.0, 1.05, 2.15), (1.85, 1.45, 2.65),
        (3.85, 1.25, 1.95), (5.75, 1.70, 2.35),
        (7.55, 1.00, 1.65),
    ]
    for index, (x, width, height) in enumerate(skyline_specs):
        add_box("__PREVIEW_Skyline_{:02d}".format(index + 1),
                (width, 0.55, height), (x, 13.2, height * 0.5),
                skyline_material, 0.08)
        for light_index in range(2):
            light_x = x + (-0.20 if light_index == 0 else 0.20)
            light_z = 0.62 + 0.38 * ((index + light_index) % 3)
            if light_z < height - 0.25:
                add_box(
                    "__PREVIEW_DistrictLight_{:02d}_{:02d}".format(
                        index + 1, light_index + 1),
                    (0.12, 0.04, 0.075), (light_x, 12.90, light_z),
                    materials["glow"], 0.012)
    moon_material = make_material(
        "__PREVIEW_MoonMaterial", (0.66, 0.76, 0.78), 0.34,
        emission=(0.20, 0.30, 0.34))
    add_cylinder("__PREVIEW_Moon", 0.66, 0.06, (-4.9, 12.95, 4.05),
                 moon_material, vertices=36, bevel=0.025,
                 rotation=(math.pi * 0.5, 0.0, 0.0))
    moonline_points = [(-7.5, 13.55, 2.18), (-3.8, 13.52, 2.42),
                       (0.0, 13.54, 2.30), (3.8, 13.52, 2.50),
                       (7.5, 13.55, 2.24)]
    add_curve_tube("__PREVIEW_Moonline", moonline_points, 0.025,
                   materials["bronze"], bevel_resolution=1)

    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("__PREVIEW_World")
        bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.002, 0.008, 0.020, 1.0)
    background.inputs["Strength"].default_value = 0.17

    add_area_light("__PREVIEW_MoonKey", (-7.0, -7.0, 13.0), 1450, 9.0,
                   (0.60, 0.78, 1.0), (0.0, 0.7, 1.3))
    add_area_light("__PREVIEW_GardenFill", (8.0, -3.0, 7.0), 850, 6.0,
                   (0.18, 0.58, 0.56), (0.0, 0.2, 1.2))
    add_area_light("__PREVIEW_WarmRim", (0.0, 7.0, 7.5), 720, 6.0,
                   (1.0, 0.28, 0.10), (0.0, 0.4, 1.5))
    add_point_light("__PREVIEW_LoomWarm", (0.0, 0.3, 2.0), 75,
                    (1.0, 0.24, 0.07), 0.40)
    add_point_light("__PREVIEW_ReedsWarm", (5.62, -4.36, 1.7), 85,
                    (1.0, 0.23, 0.06), 0.40)

    body_materials = [
        make_material("__PREVIEW_ClothSlate", (0.09, 0.20, 0.28), 0.68),
        make_material("__PREVIEW_ClothClay", (0.47, 0.14, 0.11), 0.70),
        make_material("__PREVIEW_ClothMint", (0.055, 0.30, 0.23), 0.67),
        make_material("__PREVIEW_ClothOat", (0.53, 0.44, 0.33), 0.72),
    ]
    skin_materials = [
        make_material("__PREVIEW_SkinDeep", (0.24, 0.10, 0.052), 0.62),
        make_material("__PREVIEW_SkinMedium", (0.47, 0.235, 0.13), 0.62),
        make_material("__PREVIEW_SkinLight", (0.72, 0.48, 0.33), 0.62),
    ]
    trouser_material = make_material(
        "__PREVIEW_Trouser", (0.018, 0.040, 0.055), 0.72)
    avatar_specs = [
        (-1.10, -0.82, 0, 1.00), (1.10, -0.82, 0, 0.96),
        (-4.85, 1.15, 180, 1.04), (4.95, 0.28, 180, 0.94),
    ]
    for index, (x, y, yaw, scale_value) in enumerate(avatar_specs, 1):
        add_preview_avatar(
            index, (x, y, 0.28), yaw, scale_value,
            body_materials[(index - 1) % len(body_materials)],
            skin_materials[(index - 1) % len(skin_materials)],
            trouser_material)

    camera_data = bpy.data.cameras.new("__PREVIEW_Camera")
    camera = bpy.data.objects.new("__PREVIEW_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (14.8, -19.2, 9.7)
    camera_data.lens = 54
    point_at(camera, (0.0, 0.55, 0.98))
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main():
    materials = build_kit()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_raw_glb()
    report = write_base_manifest()
    render_preview(materials)
    print("AFTERLIGHT_RESONANCE_GARDEN_BUILD_OK")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
