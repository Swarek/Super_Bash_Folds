"""Render auditable open-asset fighter actions to grounded transparent frames.

This script runs inside Blender. It deliberately keeps the runtime renderer
agnostic: real source actions are rendered once, then the atlas builder maps
them to the game's 50 animation roles with an explicit coverage grade.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


def arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("inspect", "render"))
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--fighter", required=True)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--resolution", type=int, default=192)
    parser.add_argument("--max-frames", type=int, default=24)
    return parser.parse_args(raw)


def absolute(project_root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else project_root / path


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def import_source(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
    elif suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True)
    else:
        raise ValueError(f"Unsupported 3D format: {path}")


def import_animation_source(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True)
    else:
        raise ValueError(f"Unsupported animation format: {path}")


def load_fighter(
    project_root: Path,
    definition: dict[str, Any],
) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    model_path = absolute(project_root, definition["model"])
    if not model_path.is_file():
        raise FileNotFoundError(model_path)

    if model_path.suffix.lower() != ".blend":
        clear_scene()
    import_source(model_path)

    # A .blend may have been saved while its rig was in Edit Mode. Blender
    # still evaluates action properties in that state, but the pose matrices
    # and skinned mesh remain frozen in the rest pose. Always return the source
    # scene to Object Mode before selecting and animating its render rig.
    active_object = bpy.context.view_layer.objects.active
    if active_object is not None and active_object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    armature_name = definition.get("armature")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    armature = next((obj for obj in armatures if obj.name == armature_name), None)
    if armature is None and armatures:
        armature = max(armatures, key=lambda obj: len(obj.data.bones))
    if armature is None:
        raise RuntimeError(f"No armature found in {model_path}")

    model_objects = {
        obj.name: obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
    }
    visible_names = set(definition.get("visibleObjects", model_objects.keys()))
    hidden_names = set(definition.get("hiddenObjects", []))
    meshes: list[bpy.types.Object] = []
    for name, obj in model_objects.items():
        visible = name in visible_names and name not in hidden_names
        obj.hide_render = not visible
        obj.hide_viewport = not visible
        if visible:
            meshes.append(obj)

    if not meshes:
        raise RuntimeError(f"No visible mesh for {definition.get('displayName')}")

    model_object_names = set(model_objects)
    for source in definition.get("animationSources", []):
        import_animation_source(absolute(project_root, source))

    # Imported animation libraries often contain a mannequin. Keep their
    # actions, but never render their meshes or armatures.
    for obj in bpy.context.scene.objects:
        if obj.name not in model_object_names and obj != armature:
            if obj.type in {"MESH", "ARMATURE"}:
                obj.hide_render = True
                obj.hide_viewport = True

    if armature.animation_data is None:
        armature.animation_data_create()
    return armature, meshes


def action_named(name: str) -> bpy.types.Action:
    exact = bpy.data.actions.get(name)
    if exact is not None:
        return exact
    candidates = [action for action in bpy.data.actions if action.name.split(".")[0] == name]
    if len(candidates) == 1:
        return candidates[0]
    raise KeyError(f"Action not found or ambiguous: {name}")


def set_action(armature: bpy.types.Object, action: bpy.types.Action) -> None:
    animation_data = armature.animation_data or armature.animation_data_create()
    # Some source .blend files expose every clip as a simultaneously enabled
    # NLA strip. Those strips override/mix the action selected below (the Yeti
    # pack otherwise renders the same pose for every frame), so isolate the
    # named source action for deterministic atlas rendering.
    for track in animation_data.nla_tracks:
        track.mute = True
    animation_data.action = action
    # Blender 4.4+ imports glTF clips as layered actions. Assigning only the
    # action leaves its slot unbound when the clip came from a library rig,
    # which animates accessories inconsistently while the skinned body stays
    # in its rest pose. Bind the imported object slot explicitly to this rig.
    if action.slots:
        object_slot = next(
            (slot for slot in action.slots if slot.target_id_type == "OBJECT"),
            action.slots[0],
        )
        animation_data.action_slot = object_slot


def sample_frames(action: bpy.types.Action, maximum: int) -> list[float]:
    start, end = (float(value) for value in action.frame_range)
    if end <= start + 0.001:
        return [start, start]
    source_count = max(2, math.floor(end - start) + 1)
    count = min(maximum, source_count)
    if count <= 2:
        return [start, end]
    return [start + (end - start) * index / (count - 1) for index in range(count)]


def evaluated_bounds(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in meshes:
        if obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        # Object.bound_box remains the undeformed source box for skinned glTF
        # meshes. Reading the evaluated vertices is essential here: otherwise
        # root motion and attacks leave the camera while the stale box stays put.
        evaluated_mesh = evaluated.to_mesh()
        try:
            for vertex in evaluated_mesh.vertices:
                point = evaluated.matrix_world @ vertex.co
                minimum.x = min(minimum.x, point.x)
                minimum.y = min(minimum.y, point.y)
                minimum.z = min(minimum.z, point.z)
                maximum.x = max(maximum.x, point.x)
                maximum.y = max(maximum.y, point.y)
                maximum.z = max(maximum.z, point.z)
                found = True
        finally:
            evaluated.to_mesh_clear()
    if not found:
        raise RuntimeError("Could not measure the visible model")
    return minimum, maximum


def framing_extents(
    armature: bpy.types.Object,
    meshes: list[bpy.types.Object],
    actions: list[bpy.types.Action],
) -> Vector:
    maximum_extent = Vector((0, 0, 0))
    scene = bpy.context.scene
    for action in actions:
        set_action(armature, action)
        frames = sample_frames(action, 7)
        for frame in frames:
            whole = math.floor(frame)
            scene.frame_set(whole, subframe=frame - whole)
            low, high = evaluated_bounds(meshes)
            for axis in range(3):
                maximum_extent[axis] = max(maximum_extent[axis], high[axis] - low[axis])
    return maximum_extent


def configure_scene(
    resolution: int,
    extents: Vector,
    camera_axis: str,
    padding: float,
    direction_override: list[float] | None = None,
) -> tuple[bpy.types.Object, Vector, float]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.fps = 30
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"

    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    width = max(0.01, extents.x)
    depth = max(0.01, extents.y)
    height = max(0.01, extents.z)
    axes = {
        "+X": Vector((1, 0, 0)),
        "-X": Vector((-1, 0, 0)),
        "+Y": Vector((0, 1, 0)),
        "-Y": Vector((0, -1, 0)),
        "+X+Y": Vector((1, 1, 0)),
        "+X-Y": Vector((1, -1, 0)),
        "-X+Y": Vector((-1, 1, 0)),
        "-X-Y": Vector((-1, -1, 0)),
    }
    if direction_override is not None:
        if len(direction_override) != 3:
            raise ValueError("cameraDirection must contain three coordinates")
        direction = Vector(tuple(float(value) for value in direction_override))
    else:
        direction = axes.get(camera_axis)
        if direction is None:
            raise ValueError(f"Invalid cameraAxis: {camera_axis}")
    if direction.length < 0.001 or abs(direction.z) > 0.001:
        raise ValueError("cameraDirection must be a non-zero horizontal vector")
    direction.normalize()
    camera_right = Vector((-direction.y, direction.x, 0))
    horizontal_extent = abs(camera_right.x) * width + abs(camera_right.y) * depth
    distance = max(width, depth, height) * 6 + 2

    camera_data = bpy.data.cameras.new("OpenFighterCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(height, horizontal_extent) * padding
    camera = bpy.data.objects.new("OpenFighterCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    scene.camera = camera

    world = scene.world or bpy.data.worlds.new("OpenFighterWorld")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background") if world.node_tree else None
    if background is not None:
        background.inputs["Color"].default_value = (0.08, 0.09, 0.12, 1)
        background.inputs["Strength"].default_value = 0.45

    def light(name: str, rotation: tuple[float, float, float], energy: float) -> None:
        data = bpy.data.lights.new(name=name, type="SUN")
        data.energy = energy
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.rotation_euler = rotation

    light("Key", (math.radians(34), 0, math.radians(-28)), 2.4)
    light("Fill", (math.radians(62), 0, math.radians(145)), 0.8)
    light("Rim", (math.radians(18), 0, math.radians(210)), 1.1)
    return camera, direction, distance


def center_camera(
    camera: bpy.types.Object,
    direction: Vector,
    distance: float,
    minimum: Vector,
    maximum: Vector,
) -> None:
    target = Vector((
        (minimum.x + maximum.x) * 0.5,
        (minimum.y + maximum.y) * 0.5,
        (minimum.z + maximum.z) * 0.5,
    ))
    camera.location = target + direction * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_portrait(
    definition: dict[str, Any],
    armature: bpy.types.Object,
    meshes: list[bpy.types.Object],
    fighter_root: Path,
    resolution: int,
) -> dict[str, Any]:
    idle_action = definition["slots"]["idle"]["action"]
    action = action_named(definition.get("portraitAction", idle_action))
    start, end = (float(value) for value in action.frame_range)
    fraction = min(1.0, max(0.0, float(definition.get("portraitFrameFraction", 0.0))))
    frame = start + (end - start) * fraction
    set_action(armature, action)
    whole = math.floor(frame)
    scene = bpy.context.scene
    scene.frame_set(whole, subframe=frame - whole)
    minimum, maximum = evaluated_bounds(meshes)
    camera_axis = definition.get("portraitCameraAxis", definition.get("cameraAxis", "-X"))
    camera, direction, distance = configure_scene(
        resolution,
        maximum - minimum,
        camera_axis,
        float(definition.get("portraitPadding", 1.08)),
        definition.get("portraitCameraDirection"),
    )
    center_camera(camera, direction, distance, minimum, maximum)
    path = fighter_root / "portrait.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {
        "path": path.name,
        "action": action.name,
        "sourceFrame": frame,
        "cameraAxis": camera_axis,
    }


def action_key(name: str) -> str:
    return "".join(character.lower() if character.isalnum() else "-" for character in name).strip("-")


def resolve_definition(manifest: dict[str, Any], raw: dict[str, Any]) -> dict[str, Any]:
    definition = dict(raw)
    profile_name = definition.get("slotProfile")
    if profile_name is None:
        if "slots" not in definition:
            raise KeyError("The definition must provide slots or slotProfile")
        return definition
    profile = manifest.get("slotProfiles", {}).get(profile_name)
    if profile is None:
        raise KeyError(f"Unknown slot profile: {profile_name}")
    aliases = definition.get("actionAliases", {})
    direct = set(definition.get("directSlots", []))
    authored = set(definition.get("authorRequiredSlots", []))
    overrides = definition.get("slotOverrides", {})
    slots: dict[str, dict[str, str]] = {}
    for slot, semantic_action in profile.items():
        override = overrides.get(slot, {})
        semantic_action = override.get("action", semantic_action)
        source_action = aliases.get(semantic_action, semantic_action)
        coverage = override.get(
            "coverage",
            "direct" if slot in direct else "author_required" if slot in authored else "adapted",
        )
        slots[slot] = {"action": source_action, "coverage": coverage}
    definition["slots"] = slots
    return definition


def inspect(definition: dict[str, Any], armature: bpy.types.Object, meshes: list[bpy.types.Object]) -> None:
    print("OPEN_FIGHTER_INSPECT=" + json.dumps({
        "fighter": definition.get("displayName"),
        "armature": armature.name,
        "bones": [bone.name for bone in armature.data.bones],
        "meshes": [mesh.name for mesh in meshes],
        "meshBindings": [
            {
                "mesh": mesh.name,
                "parent": mesh.parent.name if mesh.parent else None,
                "armatureModifiers": [
                    modifier.object.name
                    for modifier in mesh.modifiers
                    if modifier.type == "ARMATURE" and modifier.object is not None
                ],
            }
            for mesh in meshes
        ],
        "sceneArmatures": [
            {"name": obj.name, "boneCount": len(obj.data.bones)}
            for obj in bpy.context.scene.objects
            if obj.type == "ARMATURE"
        ],
        "actions": [
            {
                "name": action.name,
                "frameRange": list(action.frame_range),
                "slots": [
                    {
                        "identifier": slot.identifier,
                        "targetIdType": slot.target_id_type,
                    }
                    for slot in action.slots
                ],
            }
            for action in sorted(bpy.data.actions, key=lambda item: item.name)
        ],
    }))


def render(
    fighter_id: str,
    definition: dict[str, Any],
    armature: bpy.types.Object,
    meshes: list[bpy.types.Object],
    output_root: Path,
    resolution: int,
    maximum_frames: int,
) -> None:
    slot_entries = definition["slots"]
    action_names = list(dict.fromkeys(entry["action"] for entry in slot_entries.values()))
    actions = [action_named(name) for name in action_names]
    extents = framing_extents(armature, meshes, actions)
    camera, camera_direction, camera_distance = configure_scene(
        resolution,
        extents,
        definition.get("cameraAxis", "-X"),
        float(definition.get("framingPadding", 1.22)),
        definition.get("cameraDirection"),
    )

    fighter_root = output_root / fighter_id
    fighter_root.mkdir(parents=True, exist_ok=True)
    action_index: dict[str, Any] = {}
    scene = bpy.context.scene
    for action in actions:
        key = action_key(action.name)
        action_dir = fighter_root / "actions" / key
        action_dir.mkdir(parents=True, exist_ok=True)
        for old_frame in action_dir.glob("frame-*.png"):
            old_frame.unlink()
        frames = sample_frames(action, maximum_frames)
        set_action(armature, action)
        for index, frame in enumerate(frames):
            whole = math.floor(frame)
            scene.frame_set(whole, subframe=frame - whole)
            minimum, maximum = evaluated_bounds(meshes)
            center_camera(
                camera,
                camera_direction,
                camera_distance,
                minimum,
                maximum,
            )
            scene.render.filepath = str(action_dir / f"frame-{index:04d}.png")
            bpy.ops.render.render(write_still=True)
        action_index[action.name] = {
            "key": key,
            "sourceFrameRange": list(action.frame_range),
            "renderedSourceFrames": frames,
            "frameCount": len(frames),
            "fps": min(30, max(8, round(len(frames) / max(0.15, (frames[-1] - frames[0]) / 30)))),
        }
        print(json.dumps({"event": "rendered", "fighter": fighter_id, "action": action.name, "frames": len(frames)}))

    portrait = render_portrait(definition, armature, meshes, fighter_root, resolution)

    index = {
        "fighter": fighter_id,
        "sourceFacing": definition.get("sourceFacing", "right"),
        "cameraAxis": definition.get("cameraAxis", "-X"),
        "cameraDirection": definition.get("cameraDirection"),
        "cellSize": resolution,
        "columns": 8,
        "actions": action_index,
        "slots": slot_entries,
        "portrait": portrait,
    }
    (fighter_root / "render-index.json").write_text(
        json.dumps(index, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    args = arguments()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    raw_definition = manifest["fighters"].get(args.fighter)
    if raw_definition is None:
        raise KeyError(f"Fighter missing from manifest: {args.fighter}")
    definition = resolve_definition(manifest, raw_definition)
    armature, meshes = load_fighter(args.project_root, definition)
    if args.command == "inspect":
        inspect(definition, armature, meshes)
    else:
        render(
            args.fighter,
            definition,
            armature,
            meshes,
            args.output_root,
            args.resolution,
            args.max_frames,
        )


if __name__ == "__main__":
    main()
