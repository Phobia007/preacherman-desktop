# ActorCore standing conversation defaults

Kitana, Lily and Atomic Heart Twin each use the complete 28.133-second `Motion/stand-talk-378997.fbx` from the supplied `Actorcore-Blender-0913-340614.zip`. Their existing Gallery card identities and shared activation behavior remain unchanged.

ActorCore CC Base skeleton rotations are retargeted onto each existing character rig, including fingers where present. Source motion is sampled at 30 FPS; foot goals and leg IK use target limb lengths. A 100 ms endpoint alignment preserves the already matching loop. No limb scale or translation tracks are introduced. Original GLB binary buffers for meshes, UVs, skin weights, inverse binds and textures are preserved byte for byte; the embedded default animation is replaced. Atomic Heart Twin additionally uses appended skin accessors with a shared torso weight field for its overlapping body and fitted garment layers, preventing chest-side clipping during the folded-hand gesture. Geometry, UVs, inverse binds and textures remain unchanged.

The editable Blender scenes, extraction, retargeting, source backups and visual evidence are in `D:/preacherman/output/actorcore-talk-20260914`. `avatar-actorcore-talk-20260914.json` records source hashes, bone mapping, geometry preservation and foot error measurements. Existing lighting, materials, Market portraits and other characters are preserved.
