#!/usr/bin/env python3
"""Normalize generated HairGame production sheets into aligned runtime assets.

The detachable hair is baked at the former 1.4 node scale.  Every hair sprite
therefore displays on the same 728x594 Cocos canvas at scale 1, with a common
pivot that lands on character pixel (375, 218) / scene position (0, 220).
Runtime textures may be stored at 80% resolution because both Sprites use
CUSTOM size mode; this lowers package size without changing layout or pivot.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from uuid import uuid4

import numpy as np
from PIL import Image, ImageOps


CHARACTER_SIZE = (750, 1250)
RUNTIME_CHARACTER_SIZE = (600, 1000)
CHARACTER_TOP_PADDING = 20
CHARACTER_BOTTOM_PADDING = 10
LEGACY_HAIR_SIZE = (520, 424)
HAIR_BAKED_SCALE = 1.4
HAIR_SIZE = (728, 594)
RUNTIME_HAIR_SIZE = (582, 475)
HAIR_PADDING = 14
HAIR_CENTER_ON_CHARACTER = (375, 218)
BACKGROUND_SIZE = (750, 1624)

# The generated sheets do not place every face on the same horizontal axis.
# These display-space translations move the character artwork (not the Cocos
# node) so every scalp/face center lands on the shared x=375 hair pivot.
# Values are (x offset, y offset) on the 750x1250 display canvas.
CHARACTER_ALIGNMENT: dict[int, tuple[int, int]] = {
    1: (44, -4),
    2: (43, -3),
    3: (28, -2),
    4: (12, 2),
    5: (66, -11),
    6: (5, 1),
    7: (5, 0),
    8: (4, 1),
    9: (0, -10),
    10: (12, 1),
}

# Per-level corrections are baked into the transparent bitmap.  The scene can
# therefore swap every pair while keeping one node position, scale and pivot.
# Values are (scale, x offset, y offset) in the 728x594 display coordinate space.
HAIR_ALIGNMENT: dict[int, tuple[float, int, int]] = {
    1: (0.75, 0, 0),
    2: (0.80, -25, 0),
    4: (0.78, 25, 0),
    5: (0.78, 0, 0),
}


class DisjointSet:
    def __init__(self) -> None:
        self.parent: list[int] = []

    def add(self) -> int:
        label = len(self.parent)
        self.parent.append(label)
        return label

    def find(self, value: int) -> int:
        parent = self.parent
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def find_runs(row: np.ndarray) -> list[tuple[int, int]]:
    padded = np.pad(row.astype(np.int8), (1, 1))
    changes = np.flatnonzero(np.diff(padded))
    return [(int(changes[i]), int(changes[i + 1] - 1)) for i in range(0, len(changes), 2)]


def remove_generated_green(image: Image.Image) -> Image.Image:
    """Turn an opaque ImageGen chroma sheet into RGBA.

    Production sheets are intentionally kept as their original green PNGs.
    Sampling the corners makes the rebuild reproducible even when ImageGen's
    nominal #00ff00 background varies slightly across the canvas.
    """

    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"))
    if int(alpha.min()) < 255:
        return rgba

    rgb = np.asarray(rgba)[:, :, :3].astype(np.float32)
    height, width = rgb.shape[:2]
    sample = max(8, min(height, width) // 32)
    corners = np.concatenate(
        (
            rgb[:sample, :sample].reshape(-1, 3),
            rgb[:sample, width - sample :].reshape(-1, 3),
            rgb[height - sample :, :sample].reshape(-1, 3),
            rgb[height - sample :, width - sample :].reshape(-1, 3),
        ),
        axis=0,
    )
    key = np.median(corners, axis=0)
    if key[1] < key[0] * 1.35 or key[1] < key[2] * 1.35:
        return rgba

    distance = np.linalg.norm(rgb - key, axis=2)
    matte = np.clip((distance - 12.0) / (90.0 - 12.0), 0.0, 1.0)
    data = np.asarray(rgba).copy()
    data[:, :, 3] = np.rint(matte * 255.0).astype(np.uint8)
    return Image.fromarray(data, "RGBA")


def split_sheet(sheet: Image.Image) -> tuple[Image.Image, Image.Image]:
    rgba = remove_generated_green(sheet)
    alpha = np.asarray(rgba.getchannel("A"))
    mask = alpha > 0
    height, width = mask.shape

    dsu = DisjointSet()
    rows: list[list[tuple[int, int, int]]] = []
    previous: list[tuple[int, int, int]] = []

    for y in range(height):
        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for start, end in find_runs(mask[y]):
            label = dsu.add()
            while previous_index < len(previous) and previous[previous_index][1] < start - 1:
                previous_index += 1
            overlap_index = previous_index
            while overlap_index < len(previous) and previous[overlap_index][0] <= end + 1:
                dsu.union(label, previous[overlap_index][2])
                overlap_index += 1
            current.append((start, end, label))
        rows.append(current)
        previous = current

    component_area: dict[int, int] = {}
    component_x_sum: dict[int, int] = {}
    for row in rows:
        for start, end, label in row:
            root = dsu.find(label)
            length = end - start + 1
            component_area[root] = component_area.get(root, 0) + length
            component_x_sum[root] = component_x_sum.get(root, 0) + ((start + end) * length) // 2

    midpoint = width * 0.53
    character_alpha = np.zeros_like(alpha)
    hair_alpha = np.zeros_like(alpha)
    for y, row in enumerate(rows):
        for start, end, label in row:
            root = dsu.find(label)
            area = component_area.get(root, 0)
            if area < 8:
                continue
            centroid_x = component_x_sum[root] / area
            target = character_alpha if centroid_x < midpoint else hair_alpha
            target[y, start : end + 1] = alpha[y, start : end + 1]

    data = np.asarray(rgba).copy()
    character_data = data.copy()
    character_data[:, :, 3] = character_alpha
    hair_data = data.copy()
    hair_data[:, :, 3] = hair_alpha
    return Image.fromarray(character_data, "RGBA"), Image.fromarray(hair_data, "RGBA")


def normalize_character(image: Image.Image) -> Image.Image:
    bounds = image.getbbox()
    if bounds is None:
        raise ValueError("Character layer is empty")
    cropped = image.crop(bounds)
    target_height = CHARACTER_SIZE[1] - CHARACTER_TOP_PADDING - CHARACTER_BOTTOM_PADDING
    scale = target_height / cropped.height
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), target_height),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", CHARACTER_SIZE, (0, 0, 0, 0))
    x = (CHARACTER_SIZE[0] - resized.width) // 2
    canvas.alpha_composite(resized, (x, CHARACTER_TOP_PADDING))
    return canvas


def align_character_for_level(level: int, image: Image.Image) -> Image.Image:
    """Bake face/scalp centering into the shared character canvas."""

    rgba = image.convert("RGBA")
    if rgba.size != CHARACTER_SIZE:
        rgba = rgba.resize(CHARACTER_SIZE, Image.Resampling.LANCZOS)
    offset_x, offset_y = CHARACTER_ALIGNMENT.get(level, (0, 0))
    if offset_x == 0 and offset_y == 0:
        return rgba

    canvas = Image.new("RGBA", CHARACTER_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(rgba, (offset_x, offset_y))
    return canvas


def normalize_hair(image: Image.Image) -> Image.Image:
    bounds = image.getbbox()
    if bounds is None:
        raise ValueError("Hair layer is empty")
    cropped = image.crop(bounds)
    target_width = HAIR_SIZE[0] - HAIR_PADDING * 2
    target_height = HAIR_SIZE[1] - HAIR_PADDING * 2
    scale = min(target_width / cropped.width, target_height / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", HAIR_SIZE, (0, 0, 0, 0))
    x = (HAIR_SIZE[0] - resized.width) // 2
    y = (HAIR_SIZE[1] - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def align_hair_for_level(level: int, image: Image.Image) -> Image.Image:
    """Bake a level's correction around the shared node pivot."""

    rgba = image.convert("RGBA")
    if rgba.size != HAIR_SIZE:
        rgba = rgba.resize(HAIR_SIZE, Image.Resampling.LANCZOS)
    scale, offset_x, offset_y = HAIR_ALIGNMENT.get(level, (1.0, 0, 0))
    if scale == 1.0 and offset_x == 0 and offset_y == 0:
        return rgba

    layer = rgba.resize(
        (max(1, round(HAIR_SIZE[0] * scale)), max(1, round(HAIR_SIZE[1] * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", HAIR_SIZE, (0, 0, 0, 0))
    x = (HAIR_SIZE[0] - layer.width) // 2 + offset_x
    y = (HAIR_SIZE[1] - layer.height) // 2 + offset_y
    canvas.alpha_composite(layer, (x, y))
    return canvas


def bake_legacy_hair(image: Image.Image) -> Image.Image:
    """Bake the old node scale into the bitmap without changing its alignment."""

    rgba = image.convert("RGBA")
    if rgba.size in (HAIR_SIZE, RUNTIME_HAIR_SIZE):
        return rgba
    if rgba.size != LEGACY_HAIR_SIZE:
        raise ValueError(f"Unexpected existing hair size: {rgba.size}")
    return rgba.resize(HAIR_SIZE, Image.Resampling.LANCZOS)


def downsample_runtime_assets(output: Path) -> None:
    """Store smaller textures while retaining the scene's custom display size."""

    for path in sorted(output.glob("character-*.png")):
        with Image.open(path) as source:
            rgba = source.convert("RGBA")
        if rgba.size == RUNTIME_CHARACTER_SIZE:
            continue
        if rgba.size != CHARACTER_SIZE:
            raise ValueError(f"Unexpected character size for {path}: {rgba.size}")
        rgba.resize(RUNTIME_CHARACTER_SIZE, Image.Resampling.LANCZOS).save(path, optimize=True)

    for path in sorted(output.glob("hair-*.png")):
        with Image.open(path) as source:
            rgba = source.convert("RGBA")
        if rgba.size == RUNTIME_HAIR_SIZE:
            continue
        if rgba.size != HAIR_SIZE:
            raise ValueError(f"Unexpected hair size for {path}: {rgba.size}")
        rgba.resize(RUNTIME_HAIR_SIZE, Image.Resampling.LANCZOS).save(path, optimize=True)


def render_alignment_preview(output: Path, destination: Path) -> None:
    """Render all ten assets at angle 0 using the exact shared Cocos pivot."""

    cell_size = (300, 532)
    contact = Image.new("RGB", (cell_size[0] * 5, cell_size[1] * 2), (245, 245, 245))
    hair_x = HAIR_CENTER_ON_CHARACTER[0] - HAIR_SIZE[0] // 2
    hair_y = HAIR_CENTER_ON_CHARACTER[1] - HAIR_SIZE[1] // 2
    top_extension = max(0, -hair_y)

    for index in range(1, 11):
        with Image.open(output / f"character-{index:02d}.png") as source_character:
            character = source_character.convert("RGBA").resize(CHARACTER_SIZE, Image.Resampling.LANCZOS)
        with Image.open(output / f"hair-{index:02d}.png") as source_hair:
            hair = source_hair.convert("RGBA").resize(HAIR_SIZE, Image.Resampling.LANCZOS)

        stage = Image.new(
            "RGBA",
            (CHARACTER_SIZE[0], CHARACTER_SIZE[1] + top_extension),
            (222, 244, 248, 255) if index <= 5 else (255, 232, 240, 255),
        )
        stage.alpha_composite(character, (0, top_extension))
        stage.alpha_composite(hair, (hair_x, hair_y + top_extension))
        cell = stage.convert("RGB").resize(cell_size, Image.Resampling.LANCZOS)
        contact.paste(cell, ((index - 1) % 5 * cell_size[0], (index - 1) // 5 * cell_size[1]))

    destination.parent.mkdir(parents=True, exist_ok=True)
    contact.save(destination, "JPEG", quality=88, optimize=True, progressive=True, subsampling=2)


def write_background(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        rgb = image.convert("RGB")
        fitted = ImageOps.fit(rgb, BACKGROUND_SIZE, method=Image.Resampling.LANCZOS)
        fitted.save(destination, "JPEG", quality=70, optimize=True, progressive=True, subsampling=2)


def write_cocos_meta(asset_path: Path) -> None:
    meta_path = Path(f"{asset_path}.meta")
    existing_uuid: str | None = None
    if meta_path.exists():
        try:
            existing_uuid = json.loads(meta_path.read_text(encoding="utf-8")).get("uuid")
        except (json.JSONDecodeError, OSError):
            existing_uuid = None

    asset_uuid = existing_uuid or str(uuid4())
    suffix = asset_path.suffix.lower()
    has_alpha = suffix == ".png"
    with Image.open(asset_path) as image:
        raw_width, raw_height = image.size

    # The transparent padding is intentional: every character and hair image
    # shares this canvas, so the same nodes can be reused for all ten levels.
    trim_x = 0
    trim_y = 0
    width = raw_width
    height = raw_height
    offset_x = 0
    offset_y = 0

    left = -width / 2
    right = width / 2
    bottom = -height / 2
    top = height / 2
    uv_left = trim_x
    uv_right = trim_x + width
    uv_top = trim_y
    uv_bottom = trim_y + height
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": asset_uuid,
        "files": [suffix, ".json"] if suffix in (".jpg", ".jpeg") else [".json", suffix],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": f"{asset_uuid}@6c48a",
                "displayName": asset_path.stem,
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "imageUuidOrDatabaseUri": asset_uuid,
                    "isUuid": True,
                    "visible": False,
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": f"{asset_uuid}@f9941",
                "displayName": asset_path.stem,
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    # HairGame relies on a shared transparent canvas for alignment.
                    # Auto trimming can leave stale rect/UV data after replacing the
                    # source image in an open Creator session, so keep the full frame.
                    "trimType": "none",
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": offset_x,
                    "offsetY": offset_y,
                    "trimX": trim_x,
                    "trimY": trim_y,
                    "width": width,
                    "height": height,
                    "rawWidth": raw_width,
                    "rawHeight": raw_height,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [left, bottom, 0, right, bottom, 0, left, top, 0, right, top, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [uv_left, uv_bottom, uv_right, uv_bottom, uv_left, uv_top, uv_right, uv_top],
                        "nuv": [
                            uv_left / raw_width,
                            uv_top / raw_height,
                            uv_right / raw_width,
                            uv_top / raw_height,
                            uv_left / raw_width,
                            uv_bottom / raw_height,
                            uv_right / raw_width,
                            uv_bottom / raw_height,
                        ],
                        "minPos": [left, bottom, 0],
                        "maxPos": [right, top, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{asset_uuid}@6c48a",
                    "atlasUuid": "",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "hasAlpha": has_alpha,
            "fixAlphaTransparencyArtifacts": False,
            "redirect": f"{asset_uuid}@6c48a",
        },
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--sheets", nargs=10, type=Path)
    parser.add_argument(
        "--replace",
        action="append",
        default=[],
        metavar="LEVEL=SHEET",
        help="Replace one level from a two-object green/transparent production sheet",
    )
    parser.add_argument(
        "--replace-hair",
        action="append",
        default=[],
        metavar="LEVEL=IMAGE",
        help="Replace only one detachable hair sprite from an isolated green/transparent image",
    )
    parser.add_argument("--backgrounds", nargs=2, type=Path)
    parser.add_argument(
        "--bake-existing-hair",
        action="store_true",
        help="Resize untouched legacy 520x424 hair canvases to the baked 728x594 size",
    )
    parser.add_argument(
        "--downsample-runtime",
        action="store_true",
        help="Store characters at 600x1000 and hair at 582x475; Cocos display sizes stay unchanged",
    )
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    def parse_level_path(value: str, option_name: str) -> tuple[int, Path]:
        level_text, separator, path_text = value.partition("=")
        if not separator:
            parser.error(f"Invalid {option_name} value: {value!r}; expected LEVEL=PATH")
        level = int(level_text)
        if not 1 <= level <= 10:
            parser.error(f"{option_name} level must be 1..10, got {level}")
        return level, Path(path_text)

    replacements: dict[int, Path] = {}
    hair_replacements: dict[int, Path] = {}
    if args.sheets:
        replacements.update({index: sheet for index, sheet in enumerate(args.sheets, start=1)})
    for value in args.replace:
        level, sheet_path = parse_level_path(value, "--replace")
        replacements[level] = sheet_path
    for value in args.replace_hair:
        level, hair_path = parse_level_path(value, "--replace-hair")
        hair_replacements[level] = hair_path

    if args.bake_existing_hair:
        for index in range(1, 11):
            if index in replacements or index in hair_replacements:
                continue
            hair_path = args.output / f"hair-{index:02d}.png"
            with Image.open(hair_path) as hair:
                bake_legacy_hair(hair).save(hair_path, optimize=True)

    for index, sheet_path in sorted(replacements.items()):
        with Image.open(sheet_path) as sheet:
            character, hair = split_sheet(sheet)
            align_character_for_level(index, normalize_character(character)).save(
                args.output / f"character-{index:02d}.png",
                optimize=True,
            )
            align_hair_for_level(index, normalize_hair(hair)).save(
                args.output / f"hair-{index:02d}.png",
                optimize=True,
            )

    for index, hair_path in sorted(hair_replacements.items()):
        with Image.open(hair_path) as hair:
            align_hair_for_level(index, normalize_hair(remove_generated_green(hair))).save(
                args.output / f"hair-{index:02d}.png",
                optimize=True,
            )

    if args.backgrounds:
        write_background(args.backgrounds[0], args.output / "background-blue.jpg")
        write_background(args.backgrounds[1], args.output / "background-pink.jpg")
    if args.downsample_runtime:
        downsample_runtime_assets(args.output)
    for asset_path in sorted(args.output.glob("character-*.png")):
        write_cocos_meta(asset_path)
    for asset_path in sorted(args.output.glob("hair-*.png")):
        write_cocos_meta(asset_path)
    for background_path in (
        args.output / "background-blue.jpg",
        args.output / "background-pink.jpg",
    ):
        if background_path.exists():
            write_cocos_meta(background_path)
    if args.preview:
        render_alignment_preview(args.output, args.preview)


if __name__ == "__main__":
    main()
