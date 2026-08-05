"""Build faithful and optimized Cortana runtime GLBs from the retargeted blend.

Run with Blender 5.1+ in background mode:

    blender -b Cortana_Animation_Retargeted.blend \
      --python tools/blender/export_cortana_runtime.py -- \
      --output-dir output/cortana-animation \
      --runtime-glb apps/preacherman-demo-host/public/assets/avatars/cortana/cortana-runtime.glb

The source blend is never saved. Cleaned faithful and optimized copies are
written to ``--output-dir``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Matrix


SOURCE_ACTION_NAME = "CT_CATWALK_IDLE_RETARGETED"
RUNTIME_ACTION_NAME = "cortana.idle.catwalk.v1"
ARMATURE_OBJECT_NAME = "cortana"
ARMATURE_DATA_NAME = "cortanaskele_skeleton"
KEEP_MESH_NAMES = {
    "body_subd",
    "eyelashes:default",
    "eyes",
    "hair_subd",
}
EXPECTED_SOURCE_OBJECTS = {
    "SOURCE_MIXAMO_RIG",
    "Cortana_Body",
    "Cortana_Eyelashes",
    "Cortana_Eyes",
    "Cortana_Hair",
}
BONE_PATH = re.compile(r'pose\.bones\["([^"]+)"\]')
LOCATION_NOISE_LIMIT = 2.0e-5
SCALE_NOISE_LIMIT = 2.0e-5
ROTATION_SIMPLIFY_TOLERANCE = 1.0e-5
# The existing web viewport is authored around a 1.72 m Cortana. The source
# blend stores the same rig at roughly 34.117 source units per runtime metre.
# Baking this uniform conversion into mesh, armature, and location keys keeps
# the exported root transforms clean and the animation proportional.
RUNTIME_SCALE = 0.0293106574


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--runtime-glb", required=True, type=Path)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def action_channelbags(
    action: bpy.types.Action,
) -> Iterable[bpy.types.ActionChannelbag]:
    for layer in action.layers:
        for strip in layer.strips:
            yield from strip.channelbags


def action_fcurves(action: bpy.types.Action) -> list[bpy.types.FCurve]:
    return [
        fcurve
        for channelbag in action_channelbags(action)
        for fcurve in channelbag.fcurves
    ]


def action_counts(action: bpy.types.Action) -> dict[str, int]:
    fcurves = action_fcurves(action)
    return {
        "fcurves": len(fcurves),
        "keyframes": sum(
            len(fcurve.keyframe_points) for fcurve in fcurves
        ),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_summary(path: Path) -> dict[str, Any]:
    return {
        "path": str(path.resolve()),
        "size_bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def bone_name(data_path: str) -> str | None:
    match = BONE_PATH.search(data_path)
    return match.group(1) if match else None


def assert_source_contract() -> tuple[bpy.types.Object, bpy.types.Action]:
    scene = bpy.context.scene
    if scene.render.fps != 60 or scene.render.fps_base != 1.0:
        raise RuntimeError(
            f"Expected 60 FPS source, received "
            f"{scene.render.fps}/{scene.render.fps_base}."
        )
    if (scene.frame_start, scene.frame_end) != (1, 601):
        raise RuntimeError(
            "Expected source frame range 1-601, received "
            f"{scene.frame_start}-{scene.frame_end}."
        )

    armature = bpy.data.objects.get(ARMATURE_OBJECT_NAME)
    if not armature or armature.type != "ARMATURE":
        raise RuntimeError("Formal armature object 'cortana' is missing.")
    if armature.data.name != ARMATURE_DATA_NAME:
        raise RuntimeError(
            f"Expected armature data {ARMATURE_DATA_NAME!r}, "
            f"received {armature.data.name!r}."
        )
    if len(armature.data.bones) != 111:
        raise RuntimeError(
            f"Expected 111 formal bones, received {len(armature.data.bones)}."
        )

    action = bpy.data.actions.get(SOURCE_ACTION_NAME)
    if not action:
        raise RuntimeError(
            f"Target action {SOURCE_ACTION_NAME!r} is missing."
        )
    counts = action_counts(action)
    if counts != {"fcurves": 520, "keyframes": 312_520}:
        raise RuntimeError(
            "Unexpected target action density: "
            f"{counts['fcurves']} FCurves / {counts['keyframes']} keys."
        )

    missing_source_objects = sorted(
        EXPECTED_SOURCE_OBJECTS.difference(bpy.data.objects.keys())
    )
    if missing_source_objects:
        raise RuntimeError(
            "Expected Mixamo test objects are missing from the source: "
            + ", ".join(missing_source_objects)
        )
    missing_formal_meshes = sorted(
        KEEP_MESH_NAMES.difference(bpy.data.objects.keys())
    )
    if missing_formal_meshes:
        raise RuntimeError(
            "Expected formal meshes are missing: "
            + ", ".join(missing_formal_meshes)
        )
    return armature, action


def weighted_bone_names(mesh: bpy.types.Object) -> set[str]:
    group_names = {
        group.index: group.name
        for group in mesh.vertex_groups
    }
    used_indices = {
        membership.group
        for vertex in mesh.data.vertices
        for membership in vertex.groups
        if membership.weight > 0.0
    }
    return {
        group_names[index]
        for index in used_indices
        if index in group_names
    }


def normalize_runtime_scale(
    armature: bpy.types.Object,
    action: bpy.types.Action,
    formal_meshes: list[bpy.types.Object],
) -> None:
    transform = Matrix.Scale(RUNTIME_SCALE, 4)
    armature.data.transform(transform)
    for mesh in formal_meshes:
        mesh.data.transform(transform)

    for fcurve in action_fcurves(action):
        if not fcurve.data_path.endswith(".location"):
            continue
        for point in fcurve.keyframe_points:
            point.co[1] *= RUNTIME_SCALE
            point.handle_left[1] *= RUNTIME_SCALE
            point.handle_right[1] *= RUNTIME_SCALE


def normalize_runtime_materials(
    formal_meshes: list[bpy.types.Object],
) -> dict[str, list[str]]:
    target_materials: dict[str, bpy.types.Material] = {}
    assignments: dict[str, list[str]] = {}

    def target_name(mesh_name: str, source_name: str) -> str:
        if mesh_name == "eyelashes:default":
            return "rt_eyelashes"
        if mesh_name == "hair_subd":
            return "rt_hair"
        if mesh_name == "eyes":
            return "rt_eyes"
        lowered = source_name.lower()
        if "face" in lowered:
            return "rt_face"
        if "body" in lowered:
            return "rt_body"
        if "eyes" in lowered:
            return "rt_eyes"
        raise RuntimeError(
            f"Cannot classify material {source_name!r} on {mesh_name!r}."
        )

    def configure_material(
        material: bpy.types.Material,
        runtime_name: str,
    ) -> None:
        texture_names = {
            "rt_face": (
                "storm_cortana_default_head_diff.tif",
                "storm_cortana_default_head_normal.tif",
                False,
            ),
            "rt_body": (
                "storm_cortana_default_body_diff.tif",
                "storm_cortana_default_body_normal.tif",
                False,
            ),
            "rt_eyelashes": (
                "storm_cortana_default_hair_diff.tif",
                "storm_cortana_default_hair_normal.tif",
                True,
            ),
            "rt_eyes": (
                "storm_cortana_default_eye_diff.tif",
                "storm_cortana_default_eye_cornea_normal.tif",
                False,
            ),
            "rt_hair": (
                "storm_cortana_default_hair_diff.tif",
                "storm_cortana_default_hair_normal.tif",
                True,
            ),
        }
        diffuse_name, normal_name, transparent = texture_names[runtime_name]
        diffuse = bpy.data.images.get(diffuse_name)
        normal = bpy.data.images.get(normal_name)
        if not diffuse or not normal:
            raise RuntimeError(
                f"Missing runtime textures for {runtime_name}: "
                f"{diffuse_name!r}, {normal_name!r}."
            )

        if material.node_tree is None:
            raise RuntimeError(
                f"Runtime material {runtime_name!r} has no node tree."
            )
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        diffuse_node = nodes.new("ShaderNodeTexImage")
        normal_node = nodes.new("ShaderNodeTexImage")
        normal_map = nodes.new("ShaderNodeNormalMap")

        diffuse.colorspace_settings.name = "sRGB"
        normal.colorspace_settings.name = "Non-Color"
        diffuse_node.image = diffuse
        normal_node.image = normal
        shader.inputs["Metallic"].default_value = 0.0
        shader.inputs["Roughness"].default_value = 0.65

        links = material.node_tree.links
        links.new(diffuse_node.outputs["Color"], shader.inputs["Base Color"])
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        if transparent:
            links.new(diffuse_node.outputs["Alpha"], shader.inputs["Alpha"])
            material.surface_render_method = "BLENDED"
            material.use_backface_culling = False
        else:
            material.use_backface_culling = True

    for mesh in formal_meshes:
        assigned: list[str] = []
        for slot in mesh.material_slots:
            if not slot.material:
                raise RuntimeError(
                    f"Mesh {mesh.name!r} contains an empty material slot."
                )
            runtime_name = target_name(mesh.name, slot.material.name)
            material = target_materials.get(runtime_name)
            if material is None:
                material = slot.material.copy()
                material.name = runtime_name
                configure_material(material, runtime_name)
                target_materials[runtime_name] = material
            slot.material = material
            assigned.append(runtime_name)
        assignments[mesh.name] = assigned
    return assignments


def clean_scene(
    armature: bpy.types.Object,
    action: bpy.types.Action,
) -> dict[str, Any]:
    scene = bpy.context.scene
    kept_names = KEEP_MESH_NAMES | {ARMATURE_OBJECT_NAME}
    removed_objects = sorted(
        obj.name for obj in scene.objects if obj.name not in kept_names
    )
    for obj in list(scene.objects):
        if obj.name not in kept_names:
            bpy.data.objects.remove(obj, do_unlink=True)

    removed_modifiers: dict[str, list[str]] = {}
    formal_meshes = [
        bpy.data.objects[name]
        for name in sorted(KEEP_MESH_NAMES)
    ]
    for mesh in formal_meshes:
        mesh.hide_set(False)
        mesh.hide_viewport = False
        mesh.hide_render = False
        mesh.parent = armature
        mesh.parent_type = "OBJECT"

        invalid = [
            modifier
            for modifier in mesh.modifiers
            if modifier.type == "ARMATURE"
            and modifier.object is not armature
        ]
        if invalid:
            removed_modifiers[mesh.name] = [
                modifier.name for modifier in invalid
            ]
            for modifier in invalid:
                mesh.modifiers.remove(modifier)

        armature_modifiers = [
            modifier
            for modifier in mesh.modifiers
            if modifier.type == "ARMATURE"
        ]
        if not armature_modifiers:
            modifier = mesh.modifiers.new(
                name="Cortana Runtime Armature",
                type="ARMATURE",
            )
            modifier.object = armature
            armature_modifiers = [modifier]
        for modifier in armature_modifiers:
            modifier.object = armature
            modifier.show_viewport = True
            modifier.show_render = True

    material_assignments = normalize_runtime_materials(formal_meshes)
    normalize_runtime_scale(armature, action, formal_meshes)

    armature.hide_set(False)
    armature.hide_viewport = False
    armature.hide_render = False
    if not armature.animation_data:
        armature.animation_data_create()
    armature.animation_data.action = action

    removed_actions = sorted(
        other.name for other in bpy.data.actions if other != action
    )
    for other in list(bpy.data.actions):
        if other != action:
            bpy.data.actions.remove(other)
    action.name = RUNTIME_ACTION_NAME

    scene.render.fps = 60
    scene.render.fps_base = 1.0
    scene.frame_start = 1
    scene.frame_end = 601
    scene.frame_set(1)

    for collection in list(bpy.data.collections):
        if not collection.objects and not collection.children:
            bpy.data.collections.remove(collection)
    bpy.data.orphans_purge(do_recursive=True)

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for name in sorted(kept_names):
        bpy.data.objects[name].select_set(True)
    bpy.context.view_layer.objects.active = armature

    weighted_bones = set().union(
        *(weighted_bone_names(mesh) for mesh in formal_meshes)
    )
    skeleton_bones = set(armature.data.bones.keys())
    animated_bones = {
        name
        for fcurve in action_fcurves(action)
        if (name := bone_name(fcurve.data_path))
    }
    modifier_bindings = {
        mesh.name: [
            modifier.object.name if modifier.object else None
            for modifier in mesh.modifiers
            if modifier.type == "ARMATURE"
        ]
        for mesh in formal_meshes
    }

    if any(
        bindings != [ARMATURE_OBJECT_NAME]
        for bindings in modifier_bindings.values()
    ):
        raise RuntimeError(
            f"Formal mesh bindings are invalid: {modifier_bindings}"
        )
    if animated_bones.difference(skeleton_bones):
        raise RuntimeError(
            "Target action references missing bones: "
            + ", ".join(sorted(animated_bones.difference(skeleton_bones)))
        )
    if weighted_bones.difference(skeleton_bones):
        raise RuntimeError(
            "Formal meshes reference missing bones: "
            + ", ".join(sorted(weighted_bones.difference(skeleton_bones)))
        )

    return {
        "kept_objects": sorted(kept_names),
        "removed_objects": removed_objects,
        "removed_actions": removed_actions,
        "removed_invalid_armature_modifiers": removed_modifiers,
        "mesh_armature_bindings": modifier_bindings,
        "skeleton_bones": len(skeleton_bones),
        "weighted_bones": len(weighted_bones),
        "weighted_bones_missing": sorted(
            weighted_bones.difference(skeleton_bones)
        ),
        "animated_bones": len(animated_bones),
        "animated_bones_missing": sorted(
            animated_bones.difference(skeleton_bones)
        ),
        "runtime_scale": RUNTIME_SCALE,
        "runtime_material_assignments": material_assignments,
        "deformation_bones_only": False,
    }


def loop_delta_summary(
    action: bpy.types.Action,
    start: float,
    end: float,
) -> dict[str, float]:
    maxima: dict[str, float] = {}
    for fcurve in action_fcurves(action):
        property_name = fcurve.data_path.rsplit(".", 1)[-1]
        delta = abs(fcurve.evaluate(start) - fcurve.evaluate(end))
        maxima[property_name] = max(maxima.get(property_name, 0.0), delta)
    return maxima


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
        check_existing=False,
        export_format="GLB",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        use_selection=True,
        use_visible=False,
        use_renderable=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        # Applying modifiers here would bake the animated Armature modifier
        # into base vertices and then skin them a second time at runtime.
        export_apply=False,
        export_animations=True,
        export_frame_range=True,
        export_frame_step=1,
        export_force_sampling=True,
        export_anim_slide_to_zero=True,
        export_animation_mode="ACTIONS",
        export_def_bones=False,
        export_leaf_bone=False,
        export_optimize_animation_size=False,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_morph_animation=True,
        export_try_sparse_sk=True,
        export_try_omit_sparse_sk=False,
        export_extra_animations=False,
        will_save_settings=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed for {path}: {result}")


def point_line_distance(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    if start == end:
        return math.dist(point, start)
    x, y = point
    x1, y1 = start
    x2, y2 = end
    numerator = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
    denominator = math.hypot(y2 - y1, x2 - x1)
    return numerator / denominator


def simplify_points(
    points: list[tuple[float, float]],
    tolerance: float,
) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points
    start = points[0]
    end = points[-1]
    maximum = 0.0
    split_index = 0
    for index, point in enumerate(points[1:-1], start=1):
        distance = point_line_distance(point, start, end)
        if distance > maximum:
            maximum = distance
            split_index = index
    if maximum <= tolerance:
        return [start, end]
    left = simplify_points(points[: split_index + 1], tolerance)
    right = simplify_points(points[split_index:], tolerance)
    return left[:-1] + right


def rewrite_fcurve(
    fcurve: bpy.types.FCurve,
    points: list[tuple[float, float]],
) -> None:
    fcurve.keyframe_points.clear()
    for frame, value in points:
        keyframe = fcurve.keyframe_points.insert(
            frame,
            value,
            options={"FAST"},
        )
        keyframe.interpolation = "LINEAR"
    fcurve.update()


def optimize_action(action: bpy.types.Action) -> dict[str, Any]:
    before = action_counts(action)
    removed_scale: list[str] = []
    removed_location_noise: list[str] = []
    retained_non_pelvis_locations: list[str] = []
    rotation_keys_before = 0
    rotation_keys_after = 0

    for channelbag in list(action_channelbags(action)):
        for fcurve in list(channelbag.fcurves):
            property_name = fcurve.data_path.rsplit(".", 1)[-1]
            values = [
                point.co.y for point in fcurve.keyframe_points
            ]
            path_label = f"{fcurve.data_path}[{fcurve.array_index}]"
            if property_name == "scale":
                if (
                    max(values) - min(values) <= SCALE_NOISE_LIMIT
                    and max(abs(value - 1.0) for value in values)
                    <= SCALE_NOISE_LIMIT
                ):
                    channelbag.fcurves.remove(fcurve)
                    removed_scale.append(path_label)
                    continue

            if (
                property_name == "location"
                and bone_name(fcurve.data_path) != "b_pelvis"
            ):
                if max(abs(value) for value in values) <= LOCATION_NOISE_LIMIT:
                    channelbag.fcurves.remove(fcurve)
                    removed_location_noise.append(path_label)
                    continue
                retained_non_pelvis_locations.append(path_label)

            sampled = [
                (float(index + 1), fcurve.evaluate(float(source_frame)))
                for index, source_frame in enumerate(range(1, 602, 2))
            ]
            if property_name == "rotation_quaternion":
                rotation_keys_before += len(sampled)
                sampled = simplify_points(
                    sampled,
                    ROTATION_SIMPLIFY_TOLERANCE,
                )
                rotation_keys_after += len(sampled)
            rewrite_fcurve(fcurve, sampled)

    scene = bpy.context.scene
    scene.render.fps = 30
    scene.render.fps_base = 1.0
    scene.frame_start = 1
    scene.frame_end = 301
    scene.frame_set(1)
    after = action_counts(action)
    return {
        "before": before,
        "after": after,
        "removed_scale_fcurves": len(removed_scale),
        "removed_location_noise_fcurves": len(removed_location_noise),
        "retained_non_pelvis_location_fcurves": retained_non_pelvis_locations,
        "rotation_keys_before_conservative_cleanup": rotation_keys_before,
        "rotation_keys_after_conservative_cleanup": rotation_keys_after,
        "location_noise_limit": LOCATION_NOISE_LIMIT,
        "scale_noise_limit": SCALE_NOISE_LIMIT,
        "rotation_simplify_tolerance": ROTATION_SIMPLIFY_TOLERANCE,
    }


def save_blend(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.wm.save_as_mainfile(
        filepath=str(path.resolve()),
        check_existing=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"Failed to save export copy {path}: {result}")


def main() -> None:
    arguments = script_arguments()
    output_dir = arguments.output_dir.resolve()
    runtime_glb = arguments.runtime_glb.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    export_temp_dir = output_dir / ".blender-temp"
    export_temp_dir.mkdir(parents=True, exist_ok=True)
    tempfile.tempdir = str(export_temp_dir)
    source_blend = Path(bpy.data.filepath).resolve()

    armature, action = assert_source_contract()
    source_action_counts = action_counts(action)
    source_loop_delta = loop_delta_summary(action, 1.0, 601.0)
    cleanup = clean_scene(armature, action)

    faithful_blend = output_dir / "cortana-runtime-faithful.blend"
    faithful_glb = output_dir / "cortana-runtime-faithful.glb"
    optimized_blend = output_dir / "cortana-runtime-optimized.blend"
    optimized_glb = output_dir / "cortana-runtime-optimized.glb"

    faithful_action_counts = action_counts(action)
    faithful_loop_delta = loop_delta_summary(action, 1.0, 601.0)
    save_blend(faithful_blend)
    export_glb(faithful_glb)

    optimization = optimize_action(action)
    optimized_loop_delta = loop_delta_summary(action, 1.0, 301.0)
    save_blend(optimized_blend)
    export_glb(optimized_glb)

    runtime_glb.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(faithful_glb, runtime_glb)

    report = {
        "source": {
            "path": str(source_blend),
            "file": file_summary(source_blend),
            "blender_reported_version": bpy.app.version_string,
            "source_action": SOURCE_ACTION_NAME,
            "source_action_counts": source_action_counts,
            "fps": 60,
            "frame_range": [1, 601],
            "duration_seconds": 10.0,
            "loop_endpoint_max_absolute_delta": source_loop_delta,
        },
        "runtime": {
            "armature_object": ARMATURE_OBJECT_NAME,
            "armature_data": ARMATURE_DATA_NAME,
            "clip_name": RUNTIME_ACTION_NAME,
            "cleanup": cleanup,
            "faithful_action_counts": faithful_action_counts,
            "faithful_loop_endpoint_max_absolute_delta": faithful_loop_delta,
        },
        "faithful": {
            "fps": 60,
            "frame_range": [1, 601],
            "duration_seconds": 10.0,
            "blend": file_summary(faithful_blend),
            "glb": file_summary(faithful_glb),
            "runtime_glb": file_summary(runtime_glb),
        },
        "optimized": {
            "fps": 30,
            "frame_range": [1, 301],
            "duration_seconds": 10.0,
            "blend": file_summary(optimized_blend),
            "glb": file_summary(optimized_glb),
            "optimization": optimization,
            "loop_endpoint_max_absolute_delta": optimized_loop_delta,
        },
        "size_comparison": {
            "faithful_bytes": faithful_glb.stat().st_size,
            "optimized_bytes": optimized_glb.stat().st_size,
            "saved_bytes": faithful_glb.stat().st_size
            - optimized_glb.stat().st_size,
            "saved_percent": round(
                (
                    1.0
                    - optimized_glb.stat().st_size
                    / faithful_glb.stat().st_size
                )
                * 100.0,
                2,
            ),
        },
        "runtime_candidate": "faithful",
        "optimized_candidate_requires_visual_approval": True,
    }
    report_path = output_dir / "export-report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("CORTANA_EXPORT_REPORT_BEGIN")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("CORTANA_EXPORT_REPORT_END")


if __name__ == "__main__":
    main()
