# Three supplied default motions

- Michael Myers / Samhain (Toonami): `Zombie_Idle.fbx`, four-second zombie idle.
- Zima: `Button_Pushing.fbx`, original 3.23-second press followed by an eased return and pause; 4.63 seconds total.
- 2B (Emmit Fenn): `Catwalk_Idle_To_Twist_R.fbx`, original rightward twist, short hold, natural reverse return and pause; 5.53 seconds total.

The supplied 60 FPS Mixamo motions are sampled at 30 FPS and retargeted onto the existing target skeletons. Original bone lengths, materials, textures, meshes, UVs and skin weights are retained. The GLB binary containing the original geometry, images and inverse bind matrices remains byte-identical; only animation data is appended and the active clip is replaced. Inverse bind matrices determine the rest pose so constants from the previous idle cannot distort the new motion. Foot targets follow source movement, with leg IK and hip-height correction using target limb lengths. Final clip endpoints coincide.

Each model retains its existing default action ID and receives one new embedded clip. Shared lighting, Gallery cards, Market portraits, page layout and all other avatars are unchanged. Editable Blender masters, source snapshots, motion extraction, retargeting scripts and review evidence remain under `D:/preacherman/output/supplied-motions-20260914`. Exact source hashes, bone mappings and numerical measurements are in `apps/preacherman-demo-host/avatar-supplied-motions-20260914.json`.
