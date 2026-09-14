# Assigned avatar rig repair — 2026-09-14

The six affected characters retain their assigned FBX actions. Pathfinder's Happy Idle, materials, lighting, camera, routes and Market portraits are unchanged.

Kitana had two weighted roots: pelvis moved while spine 1 stayed attached to the static armature. Spine 1 now follows pelvis while retaining the original inverse bind matrices. Lily's central trouser helper Ab-PT-AXX had the same independent-root problem and now follows Bip001-Pelvis.

Rotation retargeting uses each character's original segment lengths and rest pose. Palm roll and finger axes are calibrated anatomically; weighted twist/roll helpers and intermediate spine/neck joints follow the motion. Limb translation and scale tracks are prohibited. 2B's lower dress no longer carries wrist/leg influences; fitted torso and head layers use consistent weights. Twin's separate metal parts move rigidly with their own joints.

Donor motion remains sampled at its original 60 FPS. Catwalk's reversal eases its velocity to zero; return transitions close the pose seam. This fixes boundary discontinuities; doubling samples alone is not a guarantee of better movement. ActorCore retains all 28.133 seconds.

Exact source vertex, normal, UV, index, material, image and inverse bind data are preserved. Only two hierarchy links, local skin weights on 2B/Twin and animation channels change. Asset manifests fingerprint both the previous binary prefix and every actively referenced preserved accessor. Full-cycle Three.js skinning regressions cover Kitana's waist, Lily's trousers and 2B's skirt.

The Blender inspection and staged assets are in `D:/preacherman/output/avatar-rig-repair-20260914`. The measurements compare deformation over 15 phases; these are bounded regression checks, not a claim of physically simulated cloth or zero intersection in every pose.

## Reproduce

Tools are in `tools/avatar-rig-repair`. Set `PREACHERMAN_RIG_WORKDIR` to a working folder with `source`, `input`, `inspection`, `ready` and `exports` directories. Copy the six pre-repair GLBs into source as `{id}.glb`; place the supplied ActorCore archive's `Motion/stand-talk-378997.fbx` into input. The three Mixamo FBX paths are listed in extract.py.

Run Blender in background with `--python-exit-code 1 --python extract.py`, then retarget.py (optionally `-- {id}` to select a character). Use Python with NumPy/SciPy to run components.py and weights.py. The weight pass retains a motion-only snapshot for idempotence; regenerate that snapshot when rerunning retargeting. Run measure.py for the whole-cycle deformation comparison. Reimport final GLBs to Blender when inspecting the final painted weights. Original source and prior runtime GLBs remain recoverable.
