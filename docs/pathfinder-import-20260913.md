# Pathfinder integration

Source: `D:/开源项目/apex-legend-pathfinder.zip`. The original archive is unchanged.

Pathfinder occupies Gallery position 14 (`halo-5-visualizer`) and the 14th alternating Market row. Existing card media, text, shared dark stage lights, appearance behavior and model activation are reused. Activating Pathfinder applies it to the shared companion on Home and the other pages.

The original 145-bone rig and all body, head, equipment and lens geometry are preserved. Eleven coplanar chest-screen alternatives are removed in the prepared copy; the original smile display remains. The runtime has 45,055 triangles, all 11 supplied textures, including full-resolution 2K body color and normal maps, and one 6.4-second mechanical idle using six rotational joint tracks. Feet remain planted and no body scaling or human skeleton replacement is introduced. Fixed tracks are baked into nodes to avoid unnecessary animation work.

The FBX refers to specular files that are absent from the supplied archive. Those broken references are replaced with conservative metallic/roughness values; original albedo, normal and emission maps are retained. Solid armor does not incorrectly use chipped-paint alpha as transparency. The runtime GLB is self-contained and fits the existing asset-cache budget.

Market uses a 4096 × 4096 Cycles portrait rendered from the prepared Blender master with the established studio, original textures and a relaxed three-quarter pose. The matching lossless PNG and editable packed scene remain under `D:/preacherman/output/pathfinder-20260913`.

Asset hashes, original-map records, geometry counts, animation and image provenance are recorded in `apps/preacherman-demo-host/avatar-pathfinder-import.json`. Native delivery and verification are recorded in `desktop-build-manifest.json`.
