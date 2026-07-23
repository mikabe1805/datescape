# Afterlight hero-avatar art test

Original DateScape soft-fashion avatar direction for the Afterlight vertical slice. No paid or third-party assets are used.

## Runtime contract

- Scale: 1 Blender unit = 1 meter; approximately 1.90 m tall including hair.
- Source orientation: Blender Z-up, facing -Y.
- Export orientation: glTF Y-up, facing +Z.
- Origin: `AV_Root` at world origin with the feet on the ground plane.
- Motion: in-place; locomotion code owns world movement.
- Rig: one 20-bone `AV_HumanoidRig` shared by all nine skinned material meshes.
- Clips: `AV_Idle_Breathe`, `AV_Walk_Loop`, and 3.2-second low-bench social loop `AV_Listen_Seat`; all are authored in place. The seated loop targets a 0.50 m seat top with feet planted and hands resting naturally on the thighs.

The authored GLB is the broad-compatibility source. The runtime GLB uses Draco and requires decoder initialization. Exact geometry, rig, animation, file-size, checksum, and limitation data is in the generated manifest.

## Rebuild

Run `source/build_afterlight_avatar.py` with Blender 2.83 or newer. The script recreates the editable Blend file, both GLBs, manifest, and preview from reproducible original geometry and animation instructions.
