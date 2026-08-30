"""Render first, middle, and last frames of an animated GLB for review."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def scene_bounds() -> tuple[Vector, Vector]:
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    if not corners:
        raise RuntimeError("The imported avatar has no mesh bounds")
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    return minimum, maximum


def main() -> None:
    arguments = script_arguments()
    source = arguments.input.resolve()
    output_dir = arguments.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF import failed: {result}")

    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1 or not bpy.data.actions:
        raise RuntimeError("Expected one animated armature")
    armature = armatures[0]
    if armature.animation_data is None:
        armature.animation_data_create()
    action = sorted(bpy.data.actions, key=lambda item: item.name)[0]
    armature.animation_data.action = action
    start = int(action.frame_range[0])
    end = int(action.frame_range[1])
    frames = sorted({start, int((start + end) / 2), end})

    minimum, maximum = scene_bounds()
    center = (minimum + maximum) * 0.5
    size = maximum - minimum
    height = max(size.z, 0.1)
    width = max(size.x, size.y, 0.1)
    distance = max(height, width) * 1.7

    camera_data = bpy.data.cameras.new("Preview Camera")
    camera = bpy.data.objects.new("Preview Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = center + Vector((0.0, -distance, height * 0.05))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.lens = 52.0
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Preview World")
    scene.world.color = (0.015, 0.02, 0.03)

    rendered = []
    for index, frame in enumerate(frames):
        scene.frame_set(frame)
        path = output_dir / f"frame-{index + 1}-{frame}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(str(path))
    print(json.dumps({"action": action.name, "frames": frames, "renders": rendered}))


if __name__ == "__main__":
    main()
