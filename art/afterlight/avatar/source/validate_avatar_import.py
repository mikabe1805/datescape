"""Independent Blender import smoke test for the authored avatar GLB.

Usage:
    blender --background --python validate_avatar_import.py -- path/to/avatar.glb
"""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


EXPECTED_BONES = {
    "AV_Root", "AV_Pelvis", "AV_Spine_01", "AV_Spine_02", "AV_Neck", "AV_Head",
    "AV_Clavicle_L", "AV_UpperArm_L", "AV_LowerArm_L", "AV_Hand_L",
    "AV_Clavicle_R", "AV_UpperArm_R", "AV_LowerArm_R", "AV_Hand_R",
    "AV_UpperLeg_L", "AV_LowerLeg_L", "AV_Foot_L",
    "AV_UpperLeg_R", "AV_LowerLeg_R", "AV_Foot_R",
}
EXPECTED_ACTIONS = {"AV_Idle_Breathe", "AV_Walk_Loop", "AV_Listen_Seat"}
ART_DIR = Path(__file__).resolve().parent.parent
VISUAL_OUTPUT_DIR = ART_DIR / "output" / "validation"


def aim_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_validation_material(name, color, roughness=0.45, emission=None):
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.diffuse_color = (*color, 1.0)
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    if emission is not None and principled.inputs.get("Emission") is not None:
        principled.inputs["Emission"].default_value = (*emission, 1.0)
    return material


def build_visual_validation_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.25
    if hasattr(scene, "eevee"):
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 2.0
        scene.eevee.gtao_factor = 1.35
        scene.eevee.use_soft_shadows = True
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.012, 0.022, 1.0)
    background.inputs["Strength"].default_value = 0.32

    floor_material = make_validation_material("VALIDATION_WetStone", (0.008, 0.035, 0.048), 0.28)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1.35, depth=0.035, location=(0.0, 0.0, -0.025))
    floor = bpy.context.active_object
    floor.name = "VALIDATION_Floor"
    floor.data.materials.append(floor_material)

    bench_material = make_validation_material("VALIDATION_Bench", (0.025, 0.11, 0.11), 0.38)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.085, 0.445))
    bench = bpy.context.active_object
    bench.name = "VALIDATION_Bench"
    bench.scale = (0.62, 0.25, 0.075)
    bench.data.materials.append(bench_material)

    bpy.ops.object.camera_add(location=(3.05, -5.25, 2.20))
    camera = bpy.context.active_object
    camera.name = "VALIDATION_Camera"
    camera.data.lens = 70
    aim_at(camera, (0.0, -0.02, 0.90))
    scene.camera = camera

    for name, light_type, location, color, energy, size in (
        ("VALIDATION_Key", "AREA", (2.1, -3.0, 3.2), (1.0, 0.42, 0.20), 680.0, 3.0),
        ("VALIDATION_Fill", "AREA", (-2.8, -1.5, 2.5), (0.10, 0.42, 0.58), 430.0, 3.5),
        ("VALIDATION_Rim", "AREA", (-1.0, 2.4, 2.8), (0.10, 0.55, 0.45), 560.0, 2.7),
    ):
        light_data = bpy.data.lights.new(name + "_Data", type=light_type)
        light_data.color = color
        light_data.energy = energy
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        bpy.context.collection.objects.link(light)
        aim_at(light, (0.0, 0.0, 0.9))
    return camera, bench


def render_imported_action_checks(armature, matched_actions):
    VISUAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    camera, bench = build_visual_validation_scene()
    outputs = {}
    for expected in ("AV_Idle_Breathe", "AV_Walk_Loop", "AV_Listen_Seat"):
        action = matched_actions[expected]
        armature.animation_data.action = action
        for pose_bone in armature.pose.bones:
            pose_bone.rotation_mode = "QUATERNION"
            pose_bone.location = (0.0, 0.0, 0.0)
            pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            pose_bone.scale = (1.0, 1.0, 1.0)
        frame = int(round(action.frame_range[0]))
        bpy.context.scene.frame_set(frame + 1)
        bpy.context.scene.frame_set(frame)
        bench.hide_render = expected != "AV_Listen_Seat"
        camera.location = (3.05, -5.25, 2.15 if expected == "AV_Listen_Seat" else 2.30)
        aim_at(camera, (0.0, -0.03, 0.80 if expected == "AV_Listen_Seat" else 0.94))
        output_path = VISUAL_OUTPUT_DIR / (expected + ".imported.png")
        bpy.context.scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)
        if not output_path.exists() or output_path.stat().st_size < 10000:
            raise RuntimeError("Imported action visual check was not rendered: {}".format(expected))
        outputs[expected] = str(output_path)
    return outputs


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 1:
        raise RuntimeError("Pass exactly one GLB path after --")
    path = Path(args[0]).resolve()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    if "io_scene_gltf2" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError("Import did not finish")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1 or len(meshes) != 9:
        raise RuntimeError("Expected one armature and nine mesh objects")
    armature = armatures[0]
    bones = {bone.name for bone in armature.data.bones}
    if bones != EXPECTED_BONES:
        raise RuntimeError("Imported bone set does not match the AV contract")
    actions = {action.name for action in bpy.data.actions}
    matched_actions = {
        expected: next(
            (action for action in bpy.data.actions if action.name == expected or action.name.startswith(expected + "_")),
            None,
        )
        for expected in EXPECTED_ACTIONS
    }
    missing = {name for name, action in matched_actions.items() if action is None}
    if missing:
        raise RuntimeError("Imported actions are missing: {}".format(missing))
    varying_curves = {
        expected: sum(
            1
            for curve in action.fcurves
            if curve.keyframe_points
            and max(point.co.y for point in curve.keyframe_points)
            - min(point.co.y for point in curve.keyframe_points)
            > 0.00001
        )
        for expected, action in matched_actions.items()
    }
    if any(count == 0 for count in varying_curves.values()):
        raise RuntimeError("An imported animation contains no changing curves")

    for track in armature.animation_data.nla_tracks:
        track.mute = True
    pose_samples = {}
    for expected, action in matched_actions.items():
        armature.animation_data.action = action
        for pose_bone in armature.pose.bones:
            # glTF imports bone rotations as quaternion curves; sampling in Euler
            # mode silently ignores those channels and can hide a mislabeled pose.
            pose_bone.rotation_mode = "QUATERNION"
            pose_bone.location = (0.0, 0.0, 0.0)
            pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            pose_bone.scale = (1.0, 1.0, 1.0)
        start_frame = int(round(action.frame_range[0]))
        bpy.context.scene.frame_set(start_frame + 1)
        bpy.context.scene.frame_set(start_frame)
        bpy.context.view_layer.update()
        pelvis = armature.pose.bones["AV_Pelvis"]
        thigh = armature.pose.bones["AV_UpperLeg_L"]
        hand = armature.pose.bones["AV_Hand_L"]
        thigh_vector = thigh.tail - thigh.head
        stance = "seated" if abs(thigh_vector.y) > abs(thigh_vector.z) else "standing"
        pose_samples[expected] = {
            "source_action": action.name,
            "frame": start_frame,
            "stance": stance,
            "pelvis_head": [round(value, 4) for value in pelvis.head],
            "upper_leg_head": [round(value, 4) for value in thigh.head],
            "upper_leg_tail": [round(value, 4) for value in thigh.tail],
            "upper_leg_vector": [round(value, 4) for value in thigh_vector],
            "left_hand_tail": [round(value, 4) for value in hand.tail],
        }
    expected_stances = {
        "AV_Idle_Breathe": "standing",
        "AV_Walk_Loop": "standing",
        "AV_Listen_Seat": "seated",
    }
    incorrect_stances = {
        name: sample["stance"]
        for name, sample in pose_samples.items()
        if sample["stance"] != expected_stances[name]
    }
    visual_pose_renders = render_imported_action_checks(armature, matched_actions)
    report = {
        "file": str(path),
        "byte_size": path.stat().st_size,
        "armature": armature.name,
        "bone_count": len(bones),
        "mesh_count": len(meshes),
        "actions": sorted(actions),
        "varying_curve_count": varying_curves,
        "pose_samples_at_clip_start": pose_samples,
        "visual_pose_renders": visual_pose_renders,
        "status": "ok",
    }
    print("AVATAR_IMPORT_DIAGNOSTIC")
    print(json.dumps(report, indent=2))
    if incorrect_stances:
        raise RuntimeError("Imported clip stance mismatch: {}".format(incorrect_stances))
    print("AFTERLIGHT_AVATAR_IMPORT_OK")


if __name__ == "__main__":
    main()
