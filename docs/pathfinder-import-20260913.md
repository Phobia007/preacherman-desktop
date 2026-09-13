# Pathfinder integration

Source: `D:/开源项目/apex-legend-pathfinder.zip`. The original archive is unchanged.

Pathfinder occupies Gallery position 14 (`halo-5-visualizer`) and the 14th alternating Market row. Existing card media, text, shared dark stage lights, appearance behavior and model activation are reused. Activating Pathfinder applies it to the shared companion on Home and the other pages.

The original 145-bone rig and all body, head, equipment and lens geometry are preserved. Eleven coplanar chest-screen alternatives are removed in the prepared copy; the original smile display remains. The runtime has 45,055 triangles, all 11 supplied textures, including full-resolution 2K body color and normal maps, and one 2.916667-second Happy Idle loop from the user-supplied `D:/开源项目/Happy_Idle.fbx`. Its rotations are adapted to the original mechanical rig; pelvis and foot motion use the target limb lengths. No body scaling or skeleton replacement is introduced. Original mesh, skin, material and texture binary buffers remain unchanged; only the default animation is replaced.

The FBX refers to specular files that are absent from the supplied archive. Those broken references are replaced with conservative metallic/roughness values; original albedo, normal and emission maps are retained. Solid armor does not incorrectly use chipped-paint alpha as transparency. The runtime GLB is self-contained and fits the existing asset-cache budget.

Market uses a 4096 × 4096 Cycles portrait rendered from the prepared Blender master with the established studio, original textures and a relaxed three-quarter pose. The matching lossless PNG and editable packed scene remain under `D:/preacherman/output/pathfinder-20260913`.

Asset hashes, original-map records, geometry counts, animation and image provenance are recorded in `apps/preacherman-demo-host/avatar-pathfinder-import.json`. Native delivery and verification are recorded in `desktop-build-manifest.json`.

The supplied robot had no animation clips and initially used an authored greeting. On 2026-09-14, the user replaced this with Happy Idle. The editable scene, original runtime backup and retarget measurements are in `D:/preacherman/output/pathfinder-happy-20260914`. The existing 4K Market image retains its relaxed full-body presentation pose.
