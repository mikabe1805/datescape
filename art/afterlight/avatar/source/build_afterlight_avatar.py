"""Build DateScape's original Afterlight hero-avatar art test.

Run with Blender 2.83 or newer:

    blender --background --python build_afterlight_avatar.py

The reproducible source generator creates an editable Blend file, an authored GLB, a
Draco-compressed runtime GLB, a validation manifest, and a portrait preview.
All geometry, rigging, animation, and materials are original DateScape work.
"""

import hashlib
import json
import math
import shutil
import struct
import subprocess
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ASSET_NAME = "AfterlightHeroAvatar"
ASSET_VERSION = 1
SOURCE_DIR = Path(__file__).resolve().parent
ART_DIR = SOURCE_DIR.parent
OUTPUT_DIR = ART_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BLEND_PATH = OUTPUT_DIR / "afterlight_hero_avatar.blend"
GLB_PATH = OUTPUT_DIR / "afterlight_hero_avatar.glb"
RUNTIME_PATH = OUTPUT_DIR / "afterlight_hero_avatar.runtime.draco.glb"
MANIFEST_PATH = OUTPUT_DIR / "afterlight_hero_avatar.manifest.json"
PREVIEW_PATH = OUTPUT_DIR / "afterlight_hero_avatar.preview.png"
LISTEN_PREVIEW_PATH = OUTPUT_DIR / "afterlight_hero_avatar.listen-seat.preview.png"

FPS = 30
MESH_OBJECTS = []
PARTS = {}

BONE_SPECS = [
    ("AV_Root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.12), None, False),
    ("AV_Pelvis", (0.0, 0.0, 0.91), (0.0, 0.0, 1.07), "AV_Root", False),
    ("AV_Spine_01", (0.0, 0.0, 1.04), (0.0, 0.0, 1.27), "AV_Pelvis", True),
    ("AV_Spine_02", (0.0, 0.0, 1.27), (0.0, 0.0, 1.49), "AV_Spine_01", True),
    ("AV_Neck", (0.0, 0.0, 1.48), (0.0, 0.0, 1.60), "AV_Spine_02", True),
    ("AV_Head", (0.0, 0.0, 1.58), (0.0, 0.0, 1.83), "AV_Neck", True),
    ("AV_Clavicle_L", (0.02, 0.0, 1.44), (0.20, 0.0, 1.45), "AV_Spine_02", False),
    ("AV_UpperArm_L", (0.20, 0.0, 1.45), (0.32, 0.0, 1.20), "AV_Clavicle_L", True),
    ("AV_LowerArm_L", (0.32, 0.0, 1.20), (0.36, 0.0, 0.95), "AV_UpperArm_L", True),
    ("AV_Hand_L", (0.36, 0.0, 0.95), (0.37, -0.01, 0.84), "AV_LowerArm_L", True),
    ("AV_Clavicle_R", (-0.02, 0.0, 1.44), (-0.20, 0.0, 1.45), "AV_Spine_02", False),
    ("AV_UpperArm_R", (-0.20, 0.0, 1.45), (-0.32, 0.0, 1.20), "AV_Clavicle_R", True),
    ("AV_LowerArm_R", (-0.32, 0.0, 1.20), (-0.36, 0.0, 0.95), "AV_UpperArm_R", True),
    ("AV_Hand_R", (-0.36, 0.0, 0.95), (-0.37, -0.01, 0.84), "AV_LowerArm_R", True),
    ("AV_UpperLeg_L", (0.105, 0.0, 0.94), (0.105, 0.0, 0.55), "AV_Pelvis", False),
    ("AV_LowerLeg_L", (0.105, 0.0, 0.55), (0.105, 0.0, 0.15), "AV_UpperLeg_L", True),
    ("AV_Foot_L", (0.105, 0.0, 0.14), (0.105, -0.18, 0.075), "AV_LowerLeg_L", True),
    ("AV_UpperLeg_R", (-0.105, 0.0, 0.94), (-0.105, 0.0, 0.55), "AV_Pelvis", False),
    ("AV_LowerLeg_R", (-0.105, 0.0, 0.55), (-0.105, 0.0, 0.15), "AV_UpperLeg_R", True),
    ("AV_Foot_R", (-0.105, 0.0, 0.14), (-0.105, -0.18, 0.075), "AV_LowerLeg_R", True),
]

FINAL_MESH_NAMES = {
    "skin": "AV_Mesh_Skin",
    "hair": "AV_Mesh_Hair",
    "coat": "AV_Mesh_Coat",
    "inner": "AV_Mesh_InnerLayer",
    "trouser": "AV_Mesh_Trouser",
    "boot": "AV_Mesh_Boot",
    "scarf": "AV_Mesh_Scarf",
    "hardware": "AV_Mesh_Hardware",
    "face": "AV_Mesh_Face",
}

EXPECTED_ANIMATIONS = {
    "AV_Idle_Breathe": 2.0,
    "AV_Walk_Loop": 0.8,
    "AV_Listen_Seat": 3.2,
}


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.armatures,
        bpy.data.actions,
        bpy.data.cameras,
        bpy.data.lights,
    ):
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
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1500
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.35
    scene.view_settings.gamma = 1.0
    scene.render.fps = FPS
    if hasattr(scene, "eevee"):
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 2.5
        scene.eevee.gtao_factor = 1.45
        scene.eevee.use_soft_shadows = True
        scene.eevee.use_bloom = True
        scene.eevee.bloom_intensity = 0.025
        scene.eevee.bloom_radius = 3.5
        scene.eevee.bloom_threshold = 1.0


def socket_value(node, socket_name, value):
    socket = node.inputs.get(socket_name)
    if socket is not None:
        socket.default_value = value


def make_material(name, color, roughness, metallic=0.0, emission=None):
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.use_backface_culling = True
    material.diffuse_color = (*color, 1.0)
    principled = material.node_tree.nodes.get("Principled BSDF")
    socket_value(principled, "Base Color", (*color, 1.0))
    socket_value(principled, "Roughness", roughness)
    socket_value(principled, "Metallic", metallic)
    if emission is not None:
        socket_value(principled, "Emission", (*emission, 1.0))
    return material


def create_materials():
    return {
        "skin": make_material("MAT_AV_Skin_WarmUmber", (0.43, 0.205, 0.12), 0.58),
        "hair": make_material("MAT_AV_Hair_BlueBlack", (0.012, 0.030, 0.045), 0.42),
        "coat": make_material("MAT_AV_Coat_Pearl", (0.57, 0.62, 0.60), 0.78),
        "inner": make_material("MAT_AV_Inner_SeaGlass", (0.025, 0.27, 0.27), 0.48),
        "trouser": make_material("MAT_AV_Trouser_DeepTide", (0.018, 0.055, 0.075), 0.72),
        "boot": make_material("MAT_AV_Boot_Charcoal", (0.014, 0.019, 0.024), 0.34),
        "scarf": make_material("MAT_AV_Scarf_Coral", (0.68, 0.175, 0.095), 0.73),
        "hardware": make_material("MAT_AV_Hardware_AgedBronze", (0.24, 0.105, 0.035), 0.30, metallic=0.82),
        "face": make_material("MAT_AV_Face_DeepInk", (0.010, 0.018, 0.021), 0.45),
    }


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_transform(obj):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def apply_modifier(obj, modifier):
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def clean_degenerate_geometry(obj):
    """Remove zero-area bevel remnants before normals reach glTF."""
    mesh = obj.data
    editable = bmesh.new()
    editable.from_mesh(mesh)
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=0.0000001)
    degenerate_faces = [face for face in editable.faces if face.calc_area() < 0.000000000001]
    if degenerate_faces:
        bmesh.ops.delete(editable, geom=degenerate_faces, context="FACES")
    loose_vertices = [vertex for vertex in editable.verts if not vertex.link_faces]
    if loose_vertices:
        bmesh.ops.delete(editable, geom=loose_vertices, context="VERTS")
    bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
    editable.to_mesh(mesh)
    editable.free()
    mesh.update(calc_edges=True)


def finish_mesh(obj, smooth=True, bevel=0.0):
    apply_transform(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new(name="AV_SoftBevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        apply_modifier(obj, modifier)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.data.validate(verbose=False)
    return obj


def register_part(obj, category, material, bone=None):
    obj.data.materials.append(material)
    if bone:
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj["datescape_asset"] = ASSET_NAME
    obj["material_role"] = category
    PARTS.setdefault(category, []).append(obj)
    return obj


def make_sphere(name, location, scale, category, material, bone, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    finish_mesh(obj, smooth=True)
    return register_part(obj, category, material, bone)


def make_box(name, location, scale, category, material, bone, rotation=(0.0, 0.0, 0.0), bevel=0.015):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    finish_mesh(obj, smooth=False, bevel=bevel)
    return register_part(obj, category, material, bone)


def make_cylinder_between(name, start, end, radius, category, material, bone, vertices=12):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    finish_mesh(obj, smooth=True)
    return register_part(obj, category, material, bone)


def make_capsule(name, start, end, radius, category, material, bone, end_scale=1.0):
    make_cylinder_between(name + "_Core", start, end, radius, category, material, bone)
    make_sphere(name + "_Top", start, (radius, radius, radius), category, material, bone, 12, 6)
    make_sphere(
        name + "_Bottom",
        end,
        (radius * end_scale, radius * end_scale, radius * end_scale),
        category,
        material,
        bone,
        12,
        6,
    )


def make_loft(name, rings, category, material, bone_weights, segments=16):
    vertices = []
    faces = []
    for z, radius_x, radius_y, center_x, center_y in rings:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            vertices.append(
                (
                    center_x + math.cos(angle) * radius_x,
                    center_y + math.sin(angle) * radius_y,
                    z,
                )
            )
    for ring_index in range(len(rings) - 1):
        row = ring_index * segments
        next_row = (ring_index + 1) * segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.append((row + index, row + following, next_row + following, next_row + index))
    bottom_center = len(vertices)
    vertices.append((rings[0][3], rings[0][4], rings[0][0]))
    top_center = len(vertices)
    vertices.append((rings[-1][3], rings[-1][4], rings[-1][0]))
    for index in range(segments):
        following = (index + 1) % segments
        faces.append((bottom_center, following, index))
        top_row = (len(rings) - 1) * segments
        faces.append((top_center, top_row + index, top_row + following))

    mesh = bpy.data.meshes.new(name + "_Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)

    z_min = rings[0][0]
    z_max = rings[-1][0]
    span = max(0.0001, z_max - z_min)
    for bone_name, influence_fn in bone_weights:
        group = obj.vertex_groups.new(name=bone_name)
        for vertex in mesh.vertices:
            normalized_z = max(0.0, min(1.0, (vertex.co.z - z_min) / span))
            weight = influence_fn(normalized_z)
            if weight > 0.0001:
                group.add([vertex.index], weight, "REPLACE")

    obj["datescape_asset"] = ASSET_NAME
    obj["material_role"] = category
    PARTS.setdefault(category, []).append(obj)
    return obj


def create_armature():
    armature_data = bpy.data.armatures.new("AV_HumanoidRig_Data")
    armature = bpy.data.objects.new("AV_HumanoidRig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    armature_data.display_type = "STICK"
    armature["datescape_asset"] = ASSET_NAME
    armature["rig_standard"] = "DateScape AV humanoid v1"
    armature["authored_front"] = "-Y"
    armature["unit_scale_m"] = 1.0

    select_only(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for name, head, tail, parent_name, connected in BONE_SPECS:
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = True
        if parent_name:
            bone.parent = created[parent_name]
            bone.use_connect = connected
        created[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def build_avatar_geometry(materials):
    # Head, facial planes, ears, neck, and hands.
    make_sphere("AV_Head_Skin", (0.0, -0.012, 1.715), (0.132, 0.116, 0.155), "skin", materials["skin"], "AV_Head", 20, 10)
    make_sphere("AV_Ear_L", (0.132, -0.004, 1.715), (0.025, 0.018, 0.042), "skin", materials["skin"], "AV_Head", 12, 6)
    make_sphere("AV_Ear_R", (-0.132, -0.004, 1.715), (0.025, 0.018, 0.042), "skin", materials["skin"], "AV_Head", 12, 6)
    make_cylinder_between("AV_Neck_Skin", (0.0, 0.0, 1.48), (0.0, 0.0, 1.60), 0.064, "skin", materials["skin"], "AV_Neck", 14)
    for side, x in (("L", 0.365), ("R", -0.365)):
        make_sphere("AV_Hand_" + side, (x, -0.006, 0.895), (0.050, 0.043, 0.069), "skin", materials["skin"], "AV_Hand_" + side, 14, 7)

    # Clean bob with an asymmetric forelock; the face remains readable.
    make_sphere("AV_Hair_Back", (0.0, 0.046, 1.735), (0.153, 0.123, 0.172), "hair", materials["hair"], "AV_Head", 20, 10)
    make_sphere("AV_Hair_Crown", (0.0, -0.006, 1.805), (0.145, 0.115, 0.088), "hair", materials["hair"], "AV_Head", 18, 8)
    make_sphere("AV_Hair_Forelock", (0.055, -0.109, 1.795), (0.075, 0.021, 0.078), "hair", materials["hair"], "AV_Head", 14, 7)
    for side, x in (("L", 0.123), ("R", -0.123)):
        make_sphere("AV_Hair_Side_" + side, (x, 0.018, 1.692), (0.038, 0.066, 0.125), "hair", materials["hair"], "AV_Head", 14, 7)

    # Minimal face language that survives game-distance rendering.
    for side, x in (("L", 0.045), ("R", -0.045)):
        make_sphere("AV_Eye_" + side, (x, -0.119, 1.735), (0.014, 0.008, 0.017), "face", materials["face"], "AV_Head", 12, 6)
        make_box("AV_Brow_" + side, (x, -0.121, 1.773), (0.031, 0.006, 0.006), "hair", materials["hair"], "AV_Head", rotation=(0.0, 0.0, -0.10 if side == "L" else 0.10), bevel=0.004)
    make_sphere("AV_Nose", (0.0, -0.129, 1.704), (0.018, 0.018, 0.029), "skin", materials["skin"], "AV_Head", 12, 6)
    make_box("AV_Mouth", (0.0, -0.125, 1.663), (0.030, 0.006, 0.005), "face", materials["face"], "AV_Head", bevel=0.004)

    # Layered torso: deep-sea inner shell under a softly tailored pearl coat.
    make_loft(
        "AV_Inner_Torso",
        [
            (1.02, 0.175, 0.095, 0.0, -0.002),
            (1.22, 0.205, 0.108, 0.0, 0.0),
            (1.42, 0.225, 0.118, 0.0, 0.0),
            (1.47, 0.19, 0.10, 0.0, 0.0),
        ],
        "inner",
        materials["inner"],
        [
            ("AV_Spine_01", lambda t: max(0.0, 1.0 - t)),
            ("AV_Spine_02", lambda t: t),
        ],
    )
    make_loft(
        "AV_Coat_Torso",
        [
            (1.015, 0.205, 0.112, 0.0, 0.025),
            (1.20, 0.235, 0.128, 0.0, 0.030),
            (1.40, 0.268, 0.142, 0.0, 0.035),
            (1.48, 0.235, 0.128, 0.0, 0.028),
        ],
        "coat",
        materials["coat"],
        [
            ("AV_Spine_01", lambda t: max(0.0, 1.0 - t)),
            ("AV_Spine_02", lambda t: t),
        ],
    )
    # A raised front panel makes the under-layer legible over the closed base volume.
    make_box("AV_Inner_FrontPanel", (0.0, -0.128, 1.265), (0.105, 0.014, 0.185), "inner", materials["inner"], "AV_Spine_02", bevel=0.018)
    for side, x in (("L", 0.105), ("R", -0.105)):
        make_cylinder_between("AV_Lapel_" + side, (x * 1.18, -0.145, 1.43), (x * 0.42, -0.151, 1.22), 0.032, "scarf", materials["scarf"], "AV_Spine_02", 10)
        make_loft(
            "AV_CoatTail_" + side,
            [
                (0.76, 0.13, 0.075, x, 0.045),
                (0.91, 0.115, 0.09, x, 0.035),
                (1.08, 0.105, 0.095, x, 0.03),
            ],
            "coat",
            materials["coat"],
            [("AV_Pelvis", lambda t: 1.0)],
            segments=12,
        )
    make_box("AV_Belt", (0.0, -0.002, 1.035), (0.213, 0.122, 0.026), "hardware", materials["hardware"], "AV_Pelvis", bevel=0.012)
    make_box("AV_BeltBuckle", (0.0, -0.132, 1.035), (0.040, 0.012, 0.032), "hardware", materials["hardware"], "AV_Pelvis", bevel=0.008)
    for z in (1.18, 1.29, 1.40):
        make_sphere("AV_CoatFastener_{:.0f}".format(z * 100), (0.122, -0.139, z), (0.014, 0.009, 0.014), "hardware", materials["hardware"], "AV_Spine_02", 10, 5)

    # A-pose sleeves, articulated hands, relaxed trousers, and substantial boots.
    for side, sign in (("L", 1.0), ("R", -1.0)):
        make_capsule(
            "AV_CoatSleeveUpper_" + side,
            (0.22 * sign, 0.0, 1.43),
            (0.32 * sign, 0.0, 1.20),
            0.072,
            "coat",
            materials["coat"],
            "AV_UpperArm_" + side,
            end_scale=0.90,
        )
        make_capsule(
            "AV_CoatSleeveLower_" + side,
            (0.32 * sign, 0.0, 1.20),
            (0.36 * sign, 0.0, 0.95),
            0.061,
            "coat",
            materials["coat"],
            "AV_LowerArm_" + side,
            end_scale=0.78,
        )
        make_box("AV_Cuff_" + side, (0.358 * sign, -0.001, 0.962), (0.049, 0.055, 0.026), "scarf", materials["scarf"], "AV_LowerArm_" + side, rotation=(0.0, math.radians(9.0) * sign, 0.0), bevel=0.010)
        make_capsule(
            "AV_TrouserUpper_" + side,
            (0.105 * sign, 0.005, 0.91),
            (0.105 * sign, 0.005, 0.56),
            0.094,
            "trouser",
            materials["trouser"],
            "AV_UpperLeg_" + side,
            end_scale=0.82,
        )
        make_capsule(
            "AV_TrouserLower_" + side,
            (0.105 * sign, 0.003, 0.55),
            (0.105 * sign, 0.0, 0.22),
            0.074,
            "trouser",
            materials["trouser"],
            "AV_LowerLeg_" + side,
            end_scale=0.78,
        )
        make_sphere("AV_BootAnkle_" + side, (0.105 * sign, -0.005, 0.19), (0.080, 0.080, 0.13), "boot", materials["boot"], "AV_Foot_" + side, 14, 7)
        make_sphere("AV_BootFoot_" + side, (0.105 * sign, -0.105, 0.085), (0.087, 0.16, 0.070), "boot", materials["boot"], "AV_Foot_" + side, 16, 8)


def join_category(category, final_name, armature):
    objects = PARTS[category]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    active.name = final_name
    active.data.name = final_name + "_Geometry"
    active["material_role"] = category
    triangulate = active.modifiers.new(name="AV_Triangulate", type="TRIANGULATE")
    apply_modifier(active, triangulate)
    clean_degenerate_geometry(active)
    armature_modifier = active.modifiers.new(name="AV_HumanoidDeform", type="ARMATURE")
    armature_modifier.object = armature
    active["shared_rig"] = armature.name
    MESH_OBJECTS.append(active)
    return active


def reset_pose(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def key_pose_bone(pose_bone, frame, location=False, rotation=True, scale=False):
    if location:
        pose_bone.keyframe_insert(data_path="location", frame=frame, group=pose_bone.name)
    if rotation:
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=pose_bone.name)
    if scale:
        pose_bone.keyframe_insert(data_path="scale", frame=frame, group=pose_bone.name)


def key_full_pose(armature, frame):
    """Make an action semantically self-contained for deterministic glTF baking."""
    for pose_bone in armature.pose.bones:
        key_pose_bone(pose_bone, frame, location=True, rotation=True, scale=True)


def set_action_interpolation(action, mode):
    for curve in action.fcurves:
        for keyframe in curve.keyframe_points:
            keyframe.interpolation = mode


def create_idle_action(armature):
    action = bpy.data.actions.new("AV_Idle_Breathe")
    action.use_fake_user = True
    action["loop"] = True
    action["intent"] = "quiet social-space breathing idle"
    armature.animation_data.action = action
    samples = [
        (1, 0.000, 1.000, 0.000),
        (16, 0.006, 1.012, 0.012),
        (31, 0.000, 1.000, 0.000),
        (46, -0.003, 0.996, -0.010),
        (61, 0.000, 1.000, 0.000),
    ]
    for frame, pelvis_z, chest_scale, head_pitch in samples:
        reset_pose(armature)
        pelvis = armature.pose.bones["AV_Pelvis"]
        pelvis.location.z = pelvis_z
        spine = armature.pose.bones["AV_Spine_02"]
        spine.scale = (chest_scale, 1.0 + (chest_scale - 1.0) * 0.3, chest_scale)
        head = armature.pose.bones["AV_Head"]
        head.rotation_euler.x = head_pitch
        left_clavicle = armature.pose.bones["AV_Clavicle_L"]
        right_clavicle = armature.pose.bones["AV_Clavicle_R"]
        left_clavicle.rotation_euler.z = (chest_scale - 1.0) * 0.9
        right_clavicle.rotation_euler.z = -(chest_scale - 1.0) * 0.9
        key_full_pose(armature, frame)
    set_action_interpolation(action, "BEZIER")
    return action


def create_walk_action(armature):
    action = bpy.data.actions.new("AV_Walk_Loop")
    action.use_fake_user = True
    action["loop"] = True
    action["root_motion"] = False
    action["intent"] = "relaxed in-place promenade walk"
    armature.animation_data.action = action
    samples = [
        (1, 0.42, 0.00, 0.54, -0.34, 0.000, -0.035),
        (7, 0.00, 0.18, 0.18, 0.00, 0.024, 0.000),
        (13, -0.42, 0.54, 0.00, 0.34, 0.000, 0.035),
        (19, 0.00, 0.18, 0.18, 0.00, 0.024, 0.000),
        (25, 0.42, 0.00, 0.54, -0.34, 0.000, -0.035),
    ]
    for frame, leg_l, knee_l, knee_r, arm_l, pelvis_z, pelvis_twist in samples:
        reset_pose(armature)
        pelvis = armature.pose.bones["AV_Pelvis"]
        pelvis.location.z = pelvis_z
        pelvis.rotation_euler.z = pelvis_twist
        spine = armature.pose.bones["AV_Spine_02"]
        spine.rotation_euler.z = -pelvis_twist * 0.62
        upper_leg_l = armature.pose.bones["AV_UpperLeg_L"]
        upper_leg_r = armature.pose.bones["AV_UpperLeg_R"]
        lower_leg_l = armature.pose.bones["AV_LowerLeg_L"]
        lower_leg_r = armature.pose.bones["AV_LowerLeg_R"]
        foot_l = armature.pose.bones["AV_Foot_L"]
        foot_r = armature.pose.bones["AV_Foot_R"]
        upper_arm_l = armature.pose.bones["AV_UpperArm_L"]
        upper_arm_r = armature.pose.bones["AV_UpperArm_R"]
        lower_arm_l = armature.pose.bones["AV_LowerArm_L"]
        lower_arm_r = armature.pose.bones["AV_LowerArm_R"]
        upper_leg_l.rotation_euler.x = leg_l
        upper_leg_r.rotation_euler.x = -leg_l
        lower_leg_l.rotation_euler.x = knee_l
        lower_leg_r.rotation_euler.x = knee_r
        foot_l.rotation_euler.x = -leg_l * 0.26 - knee_l * 0.18
        foot_r.rotation_euler.x = leg_l * 0.26 - knee_r * 0.18
        upper_arm_l.rotation_euler.x = arm_l
        upper_arm_r.rotation_euler.x = -arm_l
        lower_arm_l.rotation_euler.x = max(0.0, -arm_l) * 0.18
        lower_arm_r.rotation_euler.x = max(0.0, arm_l) * 0.18
        key_full_pose(armature, frame)
    set_action_interpolation(action, "BEZIER")
    return action


def create_listen_seat_action(armature):
    action = bpy.data.actions.new("AV_Listen_Seat")
    action.use_fake_user = True
    action["loop"] = True
    action["root_motion"] = False
    action["intent"] = "low-bench seated listening with quiet breathing and attention shifts"
    action["seat_height_m"] = 0.50
    armature.animation_data.action = action
    samples = [
        (1, -0.380, 1.000, 0.000, 0.000, 0.000),
        (24, -0.374, 1.008, 0.035, -0.018, 0.022),
        (48, -0.380, 1.000, -0.012, 0.008, 0.000),
        (72, -0.376, 1.006, -0.035, -0.012, -0.016),
        (96, -0.380, 1.000, 0.000, 0.000, 0.000),
    ]
    for frame, seat_drop, chest_scale, head_yaw, head_nod, right_foot_motion in samples:
        reset_pose(armature)
        pelvis = armature.pose.bones["AV_Pelvis"]
        # Pelvis local Y follows the vertical rest bone; local Z moves fore/aft.
        pelvis.location = (0.0, seat_drop, -0.018)
        pelvis.rotation_euler.x = -0.022

        spine_01 = armature.pose.bones["AV_Spine_01"]
        spine_02 = armature.pose.bones["AV_Spine_02"]
        neck = armature.pose.bones["AV_Neck"]
        head = armature.pose.bones["AV_Head"]
        spine_01.rotation_euler.x = -0.032
        spine_02.rotation_euler.x = 0.020 + head_nod * 0.18
        spine_02.scale = (chest_scale, 1.0 + (chest_scale - 1.0) * 0.25, chest_scale)
        neck.rotation_euler.y = head_yaw * 0.35
        head.rotation_euler.x = head_nod
        head.rotation_euler.y = head_yaw

        for side, splay, upper_arm, lower_arm, hand_angle in (
            ("L", -0.12, -0.43, -0.56, 0.14),
            ("R", 0.12, -0.47, -0.52, 0.17),
        ):
            upper_leg = armature.pose.bones["AV_UpperLeg_" + side]
            lower_leg = armature.pose.bones["AV_LowerLeg_" + side]
            foot = armature.pose.bones["AV_Foot_" + side]
            upper_arm_bone = armature.pose.bones["AV_UpperArm_" + side]
            lower_arm_bone = armature.pose.bones["AV_LowerArm_" + side]
            hand = armature.pose.bones["AV_Hand_" + side]
            upper_leg.rotation_euler = (-1.45, splay, 0.0)
            lower_leg.rotation_euler = (1.45, 0.0, 0.0)
            foot.rotation_euler.x = right_foot_motion if side == "R" else -right_foot_motion * 0.25
            upper_arm_bone.rotation_euler.x = upper_arm + head_nod * 0.06
            lower_arm_bone.rotation_euler.x = lower_arm
            hand.rotation_euler.x = hand_angle + head_nod * 0.10
        key_full_pose(armature, frame)
    set_action_interpolation(action, "BEZIER")
    return action


def create_animations(armature):
    armature.animation_data_create()
    idle = create_idle_action(armature)
    walk = create_walk_action(armature)
    listen = create_listen_seat_action(armature)
    armature.animation_data.action = None
    for action in (idle, walk, listen):
        track = armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.name = action.name
        # Blender 2.83's exporter discovers strips even on muted tracks. Keeping
        # the tracks evaluation-muted prevents one action leaking into another.
        track.mute = True
        strip.influence = 1.0
        strip.blend_type = "REPLACE"
    armature.animation_data.action = idle
    reset_pose(armature)
    bpy.context.scene.frame_set(16)
    return idle, walk, listen


def build_avatar():
    reset_scene()
    configure_scene()
    materials = create_materials()
    armature = create_armature()
    build_avatar_geometry(materials)
    for category, final_name in FINAL_MESH_NAMES.items():
        join_category(category, final_name, armature)
    create_animations(armature)
    return armature, materials


def ensure_gltf_exporter():
    if "io_scene_gltf2" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")


def export_glb(armature):
    ensure_gltf_exporter()
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for obj in MESH_OBJECTS:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    requested = {
        "filepath": str(GLB_PATH),
        "export_format": "GLB",
        "export_yup": True,
        "export_apply": False,
        "export_selected": True,
        "use_selection": True,
        "export_extras": True,
        "export_cameras": False,
        "export_lights": False,
        "export_animations": True,
        "export_frame_range": False,
        "export_force_sampling": True,
        "export_nla_strips": True,
        "export_def_bones": True,
        "export_skins": True,
        "export_all_influences": False,
        "export_materials": True,
        "export_tangents": False,
        "export_texcoords": False,
        "export_normals": True,
    }
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {key: value for key, value in requested.items() if key in available}
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError("glTF export did not finish: {}".format(result))


def compress_runtime_glb():
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        raise RuntimeError("npx is required to build the runtime Draco GLB")
    args = [
        npx,
        "--yes",
        "@gltf-transform/cli@4.4.1",
        "draco",
        str(GLB_PATH),
        str(RUNTIME_PATH),
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
        raise RuntimeError("glTF Transform Draco compression failed")


def parse_glb_payload(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise RuntimeError("GLB is unexpectedly small: {}".format(path))
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise RuntimeError("Invalid GLB header: {}".format(path))
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise RuntimeError("First GLB chunk is not JSON")
    document = json.loads(data[20 : 20 + json_length].decode("utf-8"))
    binary = b""
    offset = 20 + json_length
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        chunk_start = offset + 8
        chunk_end = chunk_start + chunk_length
        if chunk_end > len(data):
            raise RuntimeError("GLB chunk exceeds declared file length")
        if chunk_type == b"BIN\x00":
            binary = data[chunk_start:chunk_end]
        offset = chunk_end
    return document, binary


def parse_glb(path):
    return parse_glb_payload(path)[0]


def read_accessor_values(document, binary, accessor_index):
    component_formats = {
        5120: ("b", 1),
        5121: ("B", 1),
        5122: ("h", 2),
        5123: ("H", 2),
        5125: ("I", 4),
        5126: ("f", 4),
    }
    component_counts = {
        "SCALAR": 1,
        "VEC2": 2,
        "VEC3": 3,
        "VEC4": 4,
        "MAT2": 4,
        "MAT3": 9,
        "MAT4": 16,
    }
    accessor = document["accessors"][accessor_index]
    if "sparse" in accessor:
        raise RuntimeError("Sparse animation accessors are not supported by this validator")
    view = document["bufferViews"][accessor["bufferView"]]
    format_code, component_size = component_formats[accessor["componentType"]]
    component_count = component_counts[accessor["type"]]
    packed_size = component_size * component_count
    stride = view.get("byteStride", packed_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    unpack_format = "<" + format_code * component_count
    values = []
    for index in range(accessor["count"]):
        values.append(struct.unpack_from(unpack_format, binary, start + index * stride))
    return values


def canonical_animation_content(document, binary):
    node_names = [node.get("name", "node_{}".format(index)) for index, node in enumerate(document.get("nodes", []))]
    result = {}
    for animation in document.get("animations", []):
        clip = {}
        for channel in animation.get("channels", []):
            target = channel["target"]
            node_name = node_names[target["node"]]
            path = target["path"]
            sampler = animation["samplers"][channel["sampler"]]
            values = read_accessor_values(document, binary, sampler["output"])
            width = len(values[0])
            clip[node_name + "." + path] = {
                "count": len(values),
                "first": [round(float(value), 7) for value in values[0]],
                "last": [round(float(value), 7) for value in values[-1]],
                "minimum": [round(min(float(value[index]) for value in values), 7) for index in range(width)],
                "maximum": [round(max(float(value[index]) for value in values), 7) for index in range(width)],
            }
        result[animation.get("name", "")] = clip
    return result


def compare_animation_content(authored, runtime, tolerance=0.00001):
    if set(authored) != set(runtime):
        raise RuntimeError("Runtime animation set differs from authored animation set")
    for animation_name, authored_channels in authored.items():
        runtime_channels = runtime[animation_name]
        if set(authored_channels) != set(runtime_channels):
            raise RuntimeError("Runtime channels differ for {}".format(animation_name))
        for channel_name, authored_sample in authored_channels.items():
            runtime_sample = runtime_channels[channel_name]
            if authored_sample["count"] != runtime_sample["count"]:
                raise RuntimeError("Runtime sample count differs for {} {}".format(animation_name, channel_name))
            for field in ("first", "last", "minimum", "maximum"):
                if len(authored_sample[field]) != len(runtime_sample[field]):
                    raise RuntimeError("Runtime animation component width differs")
                for authored_value, runtime_value in zip(authored_sample[field], runtime_sample[field]):
                    if abs(authored_value - runtime_value) > tolerance:
                        raise RuntimeError("Runtime animation content differs for {} {}".format(animation_name, channel_name))


def quaternion_delta_degrees(quaternion, reference):
    dot = abs(sum(value * reference_value for value, reference_value in zip(quaternion, reference)))
    dot = max(-1.0, min(1.0, dot))
    return round(math.degrees(2.0 * math.acos(dot)), 3)


def validate_animation_semantics(content, document):
    node_by_name = {node.get("name", ""): node for node in document.get("nodes", [])}
    upper_leg_rest = node_by_name["AV_UpperLeg_L"].get("rotation", [0.0, 0.0, 0.0, 1.0])
    lower_leg_rest = node_by_name["AV_LowerLeg_L"].get("rotation", [0.0, 0.0, 0.0, 1.0])
    summary = {}
    for animation_name in EXPECTED_ANIMATIONS:
        channels = content[animation_name]
        summary[animation_name] = {
            "root_translation": channels["AV_Root.translation"]["first"],
            "pelvis_translation": channels["AV_Pelvis.translation"]["first"],
            "upper_leg_l_rotation": channels["AV_UpperLeg_L.rotation"]["first"],
            "upper_leg_l_rest_rotation": [round(float(value), 7) for value in upper_leg_rest],
            "upper_leg_l_delta_degrees_from_rest": quaternion_delta_degrees(channels["AV_UpperLeg_L.rotation"]["first"], upper_leg_rest),
            "lower_leg_l_rotation": channels["AV_LowerLeg_L.rotation"]["first"],
            "lower_leg_l_rest_rotation": [round(float(value), 7) for value in lower_leg_rest],
            "lower_leg_l_delta_degrees_from_rest": quaternion_delta_degrees(channels["AV_LowerLeg_L.rotation"]["first"], lower_leg_rest),
        }

    idle = summary["AV_Idle_Breathe"]
    walk = summary["AV_Walk_Loop"]
    listen = summary["AV_Listen_Seat"]
    if any(abs(value) > 0.0001 for value in idle["root_translation"]):
        raise RuntimeError("Idle contains root motion")
    if idle["upper_leg_l_delta_degrees_from_rest"] > 0.5 or idle["lower_leg_l_delta_degrees_from_rest"] > 0.5:
        raise RuntimeError("Idle is contaminated by a non-standing leg pose")
    if not 10.0 < walk["upper_leg_l_delta_degrees_from_rest"] < 50.0:
        raise RuntimeError("Walk does not begin with a plausible standing stride")
    if listen["upper_leg_l_delta_degrees_from_rest"] < 65.0 or listen["lower_leg_l_delta_degrees_from_rest"] < 65.0:
        raise RuntimeError("Listen clip does not begin in a seated leg pose")
    if idle["pelvis_translation"][1] - listen["pelvis_translation"][1] < 0.30:
        raise RuntimeError("Listen clip pelvis is not lowered to the seat")
    return summary


def animation_summary(document):
    accessors = document.get("accessors", [])
    summary = []
    for animation in document.get("animations", []):
        duration = 0.0
        for sampler in animation.get("samplers", []):
            accessor = accessors[sampler["input"]]
            if accessor.get("max"):
                duration = max(duration, float(accessor["max"][0]))
        summary.append(
            {
                "name": animation.get("name", ""),
                "duration_seconds": round(duration, 4),
                "channel_count": len(animation.get("channels", [])),
            }
        )
    return sorted(summary, key=lambda item: item["name"])


def triangle_count(document):
    accessors = document.get("accessors", [])
    total = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            mode = primitive.get("mode", 4)
            if mode != 4:
                raise RuntimeError("Non-triangle primitive found")
            if "indices" in primitive:
                total += accessors[primitive["indices"]]["count"] // 3
            else:
                total += accessors[primitive["attributes"]["POSITION"]]["count"] // 3
    return total


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def validate_and_write_manifest():
    authored, authored_binary = parse_glb_payload(GLB_PATH)
    runtime, runtime_binary = parse_glb_payload(RUNTIME_PATH)
    authored_nodes = {node.get("name", "") for node in authored.get("nodes", [])}
    expected_bones = {spec[0] for spec in BONE_SPECS}
    if not expected_bones.issubset(authored_nodes):
        raise RuntimeError("Authored GLB is missing expected bones")
    if len(authored.get("skins", [])) != 1:
        raise RuntimeError("Expected exactly one shared skin")
    joint_count = len(authored["skins"][0].get("joints", []))
    if joint_count != len(BONE_SPECS):
        raise RuntimeError("Expected {} joints, found {}".format(len(BONE_SPECS), joint_count))
    authored_animations = animation_summary(authored)
    runtime_animations = animation_summary(runtime)
    if authored_animations != runtime_animations:
        raise RuntimeError("Runtime compression changed animation clips")
    actual_animation_names = {item["name"] for item in authored_animations}
    if actual_animation_names != set(EXPECTED_ANIMATIONS):
        raise RuntimeError("Unexpected animation names: {}".format(actual_animation_names))
    for item in authored_animations:
        expected_duration = EXPECTED_ANIMATIONS[item["name"]]
        if abs(item["duration_seconds"] - expected_duration) > 0.04:
            raise RuntimeError("Unexpected duration for {}".format(item["name"]))
    authored_animation_content = canonical_animation_content(authored, authored_binary)
    runtime_animation_content = canonical_animation_content(runtime, runtime_binary)
    compare_animation_content(authored_animation_content, runtime_animation_content)
    animation_pose_evidence = validate_animation_semantics(authored_animation_content, authored)
    triangles = triangle_count(authored)
    if triangles > 35000:
        raise RuntimeError("Avatar exceeds the 35k triangle budget")
    compressed_primitives = sum(
        1
        for mesh in runtime.get("meshes", [])
        for primitive in mesh.get("primitives", [])
        if "KHR_draco_mesh_compression" in primitive.get("extensions", {})
    )
    primitive_count = sum(len(mesh.get("primitives", [])) for mesh in runtime.get("meshes", []))
    if compressed_primitives != primitive_count:
        raise RuntimeError("Not every runtime primitive is Draco compressed")
    material_names = [material.get("name", "") for material in authored.get("materials", [])]
    skinned_nodes = [node.get("name", "") for node in authored.get("nodes", []) if "skin" in node]
    report = {
        "asset": ASSET_NAME,
        "version": ASSET_VERSION,
        "generator": "Blender procedural source; original DateScape geometry, rig, and animation",
        "source_license": "Original project-owned work; no paid or third-party assets",
        "files": {
            "editable_source": {
                "file": BLEND_PATH.name,
                "byte_size": BLEND_PATH.stat().st_size,
                "sha256": sha256(BLEND_PATH),
            },
            "authored_glb": {
                "file": GLB_PATH.name,
                "byte_size": GLB_PATH.stat().st_size,
                "sha256": sha256(GLB_PATH),
            },
            "runtime_glb": {
                "file": RUNTIME_PATH.name,
                "byte_size": RUNTIME_PATH.stat().st_size,
                "sha256": sha256(RUNTIME_PATH),
                "compression": "KHR_draco_mesh_compression",
                "method": "glTF Transform 4.4.1, Draco edgebreaker",
                "compressed_primitive_count": compressed_primitives,
            },
            "preview": {
                "file": PREVIEW_PATH.name,
                "byte_size": PREVIEW_PATH.stat().st_size,
                "sha256": sha256(PREVIEW_PATH),
            },
            "listen_seat_preview": {
                "file": LISTEN_PREVIEW_PATH.name,
                "byte_size": LISTEN_PREVIEW_PATH.stat().st_size,
                "sha256": sha256(LISTEN_PREVIEW_PATH),
            },
        },
        "coordinate_contract": {
            "units": "meters",
            "scale": "1 Blender unit = 1 meter; avatar is approximately 1.90 m including hair",
            "authored_coordinate_system": "Blender Z-up",
            "authored_front": "-Y",
            "exported_coordinate_system": "glTF Y-up",
            "exported_front": "+Z",
            "origin": "AV_Root at world origin; feet rest on ground plane",
            "animation_motion": "in-place; AV_Root has no locomotion translation",
        },
        "design": {
            "direction": "soft-fashion stylization for luminous coastal modernism",
            "presentation": "inclusive-neutral base with a readable human silhouette",
            "outfit_layers": ["pearl long coat", "sea-glass inner shell", "coral lapels and cuffs", "deep-tide trousers", "charcoal promenade boots", "aged-bronze fittings"],
            "hair": "asymmetric blue-black bob",
        },
        "geometry": {
            "triangle_count": triangles,
            "budget": "35,000 triangles maximum",
            "mesh_count": len(authored.get("meshes", [])),
            "skinned_mesh_nodes": sorted(skinned_nodes),
            "material_count": len(material_names),
            "materials": material_names,
            "texture_count": len(authored.get("textures", [])),
        },
        "rig": {
            "armature": "AV_HumanoidRig",
            "skin_count": len(authored.get("skins", [])),
            "joint_count": joint_count,
            "bones": [spec[0] for spec in BONE_SPECS],
            "shared_by_all_meshes": len(skinned_nodes) == len(FINAL_MESH_NAMES),
        },
        "animations": authored_animations,
        "animation_pose_evidence_at_time_zero": animation_pose_evidence,
        "validation": {
            "authored_glb_header": "ok",
            "runtime_glb_header": "ok",
            "expected_stable_nodes": "ok",
            "single_shared_skin": "ok",
            "animation_names_and_durations": "ok",
            "runtime_animations_match_authored": True,
            "runtime_animation_channel_content_matches_authored": True,
            "clip_specific_pose_semantics": "ok",
            "runtime_draco_primitives": "ok",
            "triangle_budget": "ok",
        },
        "limitations": [
            "This is a direction-setting hero-avatar test, not the final customization system; it includes one base body, face, hairstyle, and outfit.",
            "Layered mesh sections use deliberately simple web-conscious skinning with overlap at elbows, knees, cuffs, and coat tails; production should add continuous joint topology and deformation tests for a larger motion set.",
            "The face has readable game-distance features but no facial rig, eye aim, visemes, or blend shapes yet.",
            "All three clips are original hand-authored test loops, not motion capture; they need a production animation polish pass, with walk foot-lock and seat-contact review in engine.",
            "There are no texture maps, LODs, baked lighting, cloth simulation, or physics proxies yet; the look is carried by nine portable flat PBR material slots.",
            "The runtime GLB requires Draco decoder initialization; the authored GLB is retained for editing and broad importer compatibility.",
        ],
    }
    MANIFEST_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def aim_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_preview_environment(materials, armature):
    # Preview-only geometry is intentionally added after export.
    floor_material = make_material("PREVIEW_WetStone", (0.008, 0.025, 0.038), 0.24, metallic=0.06)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.48, depth=0.035, location=(0.0, 0.0, -0.025))
    floor = bpy.context.active_object
    floor.name = "PREVIEW_TidalPlinth"
    floor.data.materials.append(floor_material)
    finish_mesh(floor, smooth=True, bevel=0.025)

    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.012, 0.022, 1.0)
    background.inputs["Strength"].default_value = 0.32

    bpy.ops.object.camera_add(location=(3.25, -5.55, 2.33))
    camera = bpy.context.active_object
    camera.name = "PREVIEW_Camera"
    camera.data.lens = 72
    camera.data.sensor_width = 36
    aim_at(camera, (0.0, 0.0, 0.93))
    bpy.context.scene.camera = camera

    light_specs = [
        ("PREVIEW_Key", "AREA", (2.2, -3.2, 3.4), (1.0, 0.40, 0.19), 780.0, 3.0, (0.0, 0.0, 1.05)),
        ("PREVIEW_Fill", "AREA", (-3.0, -1.6, 2.5), (0.10, 0.42, 0.58), 520.0, 3.8, (0.0, 0.0, 1.0)),
        ("PREVIEW_Rim", "AREA", (-1.0, 2.8, 3.0), (0.12, 0.55, 0.46), 690.0, 2.6, (0.0, 0.0, 1.25)),
        ("PREVIEW_Face", "POINT", (0.4, -2.0, 1.9), (1.0, 0.63, 0.38), 90.0, 0.8, None),
    ]
    for name, light_type, location, color, energy, size, target in light_specs:
        light_data = bpy.data.lights.new(name + "_Data", type=light_type)
        light_data.color = color
        light_data.energy = energy
        if light_type == "AREA":
            light_data.size = size
        else:
            light_data.shadow_soft_size = size
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        bpy.context.collection.objects.link(light)
        if target is not None:
            aim_at(light, target)

    # A restrained emissive portal echoes the Afterlight world without obscuring the avatar.
    glow_material = make_material("PREVIEW_PortalGlow", (0.96, 0.18, 0.045), 0.34, emission=(0.85, 0.07, 0.012))
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=10, location=(0.0, 0.80, 1.08), major_radius=0.90, minor_radius=0.018, rotation=(math.radians(90.0), 0.0, 0.0))
    portal = bpy.context.active_object
    portal.name = "PREVIEW_AfterlightHalo"
    portal.data.materials.append(glow_material)

    # Render one exact action without NLA stacking so the preview doubles as a pose check.
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    armature.animation_data.action = bpy.data.actions["AV_Walk_Loop"]
    bpy.context.scene.frame_set(7)


def render_preview(materials, armature):
    add_preview_environment(materials, armature)
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    if not PREVIEW_PATH.exists() or PREVIEW_PATH.stat().st_size < 10000:
        raise RuntimeError("Preview render was not created")

    bench_material = make_material("PREVIEW_ListeningBench", (0.022, 0.075, 0.082), 0.36, metallic=0.06)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.085, 0.445))
    bench = bpy.context.active_object
    bench.name = "PREVIEW_ListeningBench"
    bench.scale = (0.62, 0.25, 0.075)
    bench.data.materials.append(bench_material)
    finish_mesh(bench, smooth=False, bevel=0.045)
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    armature.animation_data.action = bpy.data.actions["AV_Listen_Seat"]
    bpy.context.scene.frame_set(24)
    camera = bpy.context.scene.camera
    camera.location = (3.05, -5.25, 2.15)
    aim_at(camera, (0.0, -0.05, 0.82))
    bpy.context.scene.render.filepath = str(LISTEN_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    if not LISTEN_PREVIEW_PATH.exists() or LISTEN_PREVIEW_PATH.stat().st_size < 10000:
        raise RuntimeError("Listen-seat preview render was not created")


def main():
    armature, materials = build_avatar()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_glb(armature)
    compress_runtime_glb()
    render_preview(materials, armature)
    report = validate_and_write_manifest()
    print("AFTERLIGHT_AVATAR_BUILD_OK")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
