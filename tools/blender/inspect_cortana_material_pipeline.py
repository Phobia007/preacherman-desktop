"""Read-only inspection of Cortana material nodes, textures, and scene lighting."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


def script_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=Path, required=True)
    parser.add_argument("--print-json", action="store_true")
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(arguments)


def json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "to_list"):
        return value.to_list()
    try:
        return list(value)
    except TypeError:
        return str(value)


def socket_summary(socket: bpy.types.NodeSocket) -> dict[str, Any]:
    summary = {
        "name": socket.name,
        "identifier": socket.identifier,
        "type": socket.type,
        "linked": socket.is_linked,
    }
    if hasattr(socket, "default_value"):
        summary["default"] = json_value(socket.default_value)
    return summary


def node_summary(node: bpy.types.Node) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "name": node.name,
        "label": node.label,
        "type": node.type,
        "bl_idname": node.bl_idname,
        "location": list(node.location),
        "inputs": [socket_summary(socket) for socket in node.inputs],
        "outputs": [socket_summary(socket) for socket in node.outputs],
    }
    for attribute in (
        "operation",
        "blend_type",
        "data_type",
        "clamp_type",
        "use_clamp",
        "space",
        "uv_map",
        "interpolation",
        "projection",
        "extension",
    ):
        if hasattr(node, attribute):
            summary[attribute] = json_value(getattr(node, attribute))
    if node.type == "TEX_IMAGE" and node.image:
        image = node.image
        summary["image"] = {
            "name": image.name,
            "filepath": bpy.path.abspath(image.filepath),
            "source": image.source,
            "colorspace": image.colorspace_settings.name,
            "alpha_mode": image.alpha_mode,
            "size": list(image.size),
        }
    if node.type == "VALTORGB":
        ramp = node.color_ramp
        summary["color_ramp"] = {
            "color_mode": ramp.color_mode,
            "hue_interpolation": ramp.hue_interpolation,
            "interpolation": ramp.interpolation,
            "elements": [
                {"position": element.position, "color": list(element.color)}
                for element in ramp.elements
            ],
        }
    return summary


def material_summary(material: bpy.types.Material) -> dict[str, Any]:
    node_tree = material.node_tree
    return {
        "name": material.name,
        "diffuse_color": list(material.diffuse_color),
        "metallic": material.metallic,
        "roughness": material.roughness,
        "surface_render_method": getattr(material, "surface_render_method", None),
        "use_transparency_overlap": getattr(
            material,
            "use_transparency_overlap",
            None,
        ),
        "use_nodes": material.use_nodes,
        "nodes": (
            [node_summary(node) for node in node_tree.nodes]
            if node_tree
            else []
        ),
        "links": (
            [
                {
                    "from_node": link.from_node.name,
                    "from_socket": link.from_socket.name,
                    "from_identifier": link.from_socket.identifier,
                    "to_node": link.to_node.name,
                    "to_socket": link.to_socket.name,
                    "to_identifier": link.to_socket.identifier,
                }
                for link in node_tree.links
            ]
            if node_tree
            else []
        ),
    }


def light_summary(obj: bpy.types.Object) -> dict[str, Any]:
    light = obj.data
    direction = obj.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    return {
        "object": obj.name,
        "data": light.name,
        "type": light.type,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "direction": list(direction),
        "scale": list(obj.scale),
        "color": list(light.color),
        "energy": light.energy,
        "use_shadow": light.use_shadow,
        "shape": getattr(light, "shape", None),
        "size": getattr(light, "size", None),
        "spread": getattr(light, "spread", None),
    }


def main() -> None:
    arguments = script_arguments()
    scene = bpy.context.scene
    view = scene.view_settings
    display = scene.display_settings
    material_names = (
        "cortana_body",
        "cortana_face",
        "cortana_eyes",
        "cortana_hair",
    )
    summary = {
        "blender": bpy.app.version_string,
        "blend": bpy.data.filepath,
        "render": {
            "engine": scene.render.engine,
            "film_transparent": scene.render.film_transparent,
            "resolution": [
                scene.render.resolution_x,
                scene.render.resolution_y,
                scene.render.resolution_percentage,
            ],
        },
        "color_management": {
            "display_device": display.display_device,
            "view_transform": view.view_transform,
            "look": view.look,
            "exposure": view.exposure,
            "gamma": view.gamma,
            "use_curve_mapping": view.use_curve_mapping,
        },
        "world": {
            "name": scene.world.name if scene.world else None,
            "color": list(scene.world.color) if scene.world else None,
            "use_nodes": scene.world.use_nodes if scene.world else None,
        },
        "lights": [
            light_summary(obj)
            for obj in scene.objects
            if obj.type == "LIGHT"
        ],
        "materials": [
            material_summary(bpy.data.materials[name])
            for name in material_names
            if name in bpy.data.materials
        ],
    }
    serialized = json.dumps(summary, ensure_ascii=False, indent=2)
    arguments.json.parent.mkdir(parents=True, exist_ok=True)
    arguments.json.write_text(serialized + "\n", encoding="utf-8")
    print(f"CORTANA_MATERIAL_PIPELINE_JSON={arguments.json}")
    if arguments.print_json:
        print("CORTANA_MATERIAL_PIPELINE_BEGIN")
        print(serialized)
        print("CORTANA_MATERIAL_PIPELINE_END")


if __name__ == "__main__":
    main()
