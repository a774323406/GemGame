from __future__ import annotations

import json
import math
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/res/shootingGlassBottles"
BACKGROUND_SOURCE = Path(
    "/Users/skyhand/.codex/generated_images/019fc63a-6b02-70e1-b173-ca754f4eeb6d/"
    "exec-0d0d50a7-96e3-4a1a-81be-4a0fb37b529c.png"
)
BOTTLE_SOURCE = Path("/private/tmp/shooting-bottle.png")
BROKEN_BOTTLE_SOURCE = Path("/private/tmp/shooting-broken-bottle.png")
GUN_SOURCE = Path("/private/tmp/shooting-gun.png")
HUD_TITLE_SOURCE = Path("/private/tmp/hud-title.png")
CUTE_MODAL_SOURCE = Path("/private/tmp/cute-modal.png")
AD_BUTTON_SOURCE = Path("/private/tmp/ad-button.png")


def fit_transparent(source: Path, target: Path, size: tuple[int, int], padding: int) -> None:
    image = Image.open(source).convert("RGBA")
    alpha_box = image.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"No visible pixels in {source}")
    left, top, right, bottom = alpha_box
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    cropped = image.crop((left, top, right, bottom))
    cropped.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - cropped.width) // 2
    y = (size[1] - cropped.height) // 2
    canvas.alpha_composite(cropped, (x, y))
    canvas.save(target, optimize=True)


def rounded_panel(
    size: tuple[int, int],
    radius: int,
    fill_top: tuple[int, int, int, int],
    fill_bottom: tuple[int, int, int, int],
    border: tuple[int, int, int, int],
) -> Image.Image:
    width, height = size
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    gradient = Image.new("RGBA", size)
    pixels = gradient.load()
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(fill_top[i] * (1 - t) + fill_bottom[i] * t) for i in range(4))
        for x in range(width):
            pixels[x, y] = color
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((3, 3, width - 4, height - 4), radius=radius, fill=255)
    image.paste(gradient, (0, 0), mask)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((3, 3, width - 4, height - 4), radius=radius, outline=border, width=6)
    draw.rounded_rectangle(
        (10, 9, width - 11, max(15, height // 2)),
        radius=max(4, radius - 8),
        outline=(255, 255, 255, 75),
        width=3,
    )
    return image


def create_rope() -> Image.Image:
    image = Image.new("RGBA", (14, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((2, 0, 11, 511), radius=4, fill=(78, 45, 22, 255))
    draw.line((5, 0, 5, 511), fill=(226, 164, 79, 255), width=3)
    for y in range(-8, 520, 14):
        draw.line((2, y, 11, y + 8), fill=(255, 205, 118, 190), width=2)
    return image


def create_crosshair() -> Image.Image:
    scale = 4
    size = 128
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    center = size * scale // 2
    cyan = (241, 255, 255, 255)
    shadow = (0, 64, 75, 210)
    for width, color, radius in [(22, shadow, 38), (10, cyan, 38)]:
        box = (
            center - radius * scale,
            center - radius * scale,
            center + radius * scale,
            center + radius * scale,
        )
        draw.ellipse(box, outline=color, width=width)
    for x1, y1, x2, y2 in [
        (center, 0, center, center - 28 * scale),
        (center, center + 28 * scale, center, size * scale),
        (0, center, center - 28 * scale, center),
        (center + 28 * scale, center, size * scale, center),
    ]:
        draw.line((x1, y1, x2, y2), fill=shadow, width=22)
        draw.line((x1, y1, x2, y2), fill=cyan, width=10)
    draw.ellipse((center - 4 * scale, center - 4 * scale, center + 4 * scale, center + 4 * scale), fill=(255, 92, 81, 255))
    return image.resize((size, size), Image.Resampling.LANCZOS)


def create_bullet() -> Image.Image:
    image = Image.new("RGBA", (32, 82), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((5, 1, 26, 30), fill=(255, 239, 111, 255), outline=(91, 52, 12, 255), width=3)
    draw.rounded_rectangle((5, 15, 26, 76), radius=5, fill=(238, 170, 38, 255), outline=(91, 52, 12, 255), width=3)
    draw.rectangle((9, 20, 13, 68), fill=(255, 226, 110, 210))
    draw.line((5, 67, 26, 67), fill=(130, 74, 18, 255), width=3)
    return image


def create_hook() -> Image.Image:
    image = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((4, 4, 75, 75), fill=(92, 51, 22, 255), outline=(255, 218, 125, 255), width=5)
    draw.ellipse((11, 11, 68, 68), fill=(211, 139, 65, 255), outline=(112, 61, 26, 255), width=4)
    draw.ellipse((18, 16, 59, 57), fill=(233, 168, 83, 255))
    draw.arc((19, 17, 58, 56), 205, 326, fill=(255, 228, 157, 230), width=5)
    return image


def create_shard() -> Image.Image:
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon([(10, 54), (29, 6), (55, 45)], fill=(255, 94, 176, 225), outline=(255, 226, 246, 255))
    draw.polygon([(21, 43), (29, 13), (38, 40)], fill=(255, 203, 232, 185))
    return image.filter(ImageFilter.GaussianBlur(0.25))


def create_muzzle() -> Image.Image:
    scale = 3
    size = 128
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    points = []
    cx = cy = size * scale / 2
    for index in range(24):
        angle = -math.pi / 2 + math.pi * 2 * index / 24
        radius = (58 if index % 2 == 0 else 22) * scale
        points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    draw.polygon(points, fill=(255, 211, 33, 250))
    draw.ellipse((cx - 22 * scale, cy - 22 * scale, cx + 22 * scale, cy + 22 * scale), fill=(255, 250, 190, 255))
    return image.resize((size, size), Image.Resampling.LANCZOS)


def write_meta(path: Path, forced_uuid: str | None = None) -> None:
    image = Image.open(path)
    width, height = image.size
    has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
    root_uuid = forced_uuid or str(uuid.uuid5(uuid.NAMESPACE_URL, f"gemgame/shootingGlassBottles/{path.name}"))
    display_name = path.stem
    ext = path.suffix
    meta = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": root_uuid,
        "files": [".json", ext],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": f"{root_uuid}@6c48a",
                "displayName": display_name,
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "imageUuidOrDatabaseUri": root_uuid,
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
                "uuid": f"{root_uuid}@f9941",
                "displayName": display_name,
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimType": "auto",
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": width,
                    "height": height,
                    "rawWidth": width,
                    "rawHeight": height,
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
                        "rawPosition": [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, -width / 2, height / 2, 0, width / 2, height / 2, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, height, width, height, 0, 0, width, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-width / 2, -height / 2, 0],
                        "maxPos": [width / 2, height / 2, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{root_uuid}@6c48a",
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
            "redirect": f"{root_uuid}@6c48a",
        },
    }
    path.with_name(path.name + ".meta").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    background = Image.open(BACKGROUND_SOURCE).convert("RGB")
    background = background.resize((750, 1334), Image.Resampling.LANCZOS)
    background.save(OUT / "background.jpg", quality=72, optimize=True, progressive=True, subsampling=2)

    fit_transparent(BOTTLE_SOURCE, OUT / "bottle.png", (96, 312), 18)
    fit_transparent(BROKEN_BOTTLE_SOURCE, OUT / "brokenBottle.png", (96, 188), 12)
    fit_transparent(GUN_SOURCE, OUT / "gun.png", (240, 674), 22)
    fit_transparent(HUD_TITLE_SOURCE, OUT / "cartoonHeader.png", (710, 250), 8)
    fit_transparent(CUTE_MODAL_SOURCE, OUT / "cuteModal.png", (650, 500), 8)
    fit_transparent(AD_BUTTON_SOURCE, OUT / "adButton.png", (360, 160), 8)
    create_rope().save(OUT / "rope.png", optimize=True)
    create_crosshair().save(OUT / "crosshair.png", optimize=True)
    create_bullet().save(OUT / "bullet.png", optimize=True)
    create_hook().save(OUT / "hook.png", optimize=True)
    create_shard().save(OUT / "shard.png", optimize=True)
    create_muzzle().save(OUT / "muzzle.png", optimize=True)
    rounded_panel((600, 140), 30, (255, 252, 211, 250), (244, 208, 118, 250), (100, 58, 22, 255)).save(OUT / "panel.png", optimize=True)
    Image.new("RGBA", (8, 8), (0, 24, 40, 180)).save(OUT / "dim.png", optimize=True)

    # These two files are produced separately from ImageGen references. Keeping
    # the deterministic UUIDs here makes re-running this asset helper safe.
    preserved_uuids = {
        "rewardSquare.png": "bfd4538b-4561-42c5-a088-86ef042dbaeb",
        "successButton.png": "0dff928c-f9de-5357-ace4-2b810fc35af8",
        "woodTitle.png": "4da1d5f0-714b-4a3e-8bf2-d3667160f7dc",
    }
    for path in sorted(OUT.iterdir()):
        if path.suffix.lower() in {".png", ".jpg"}:
            write_meta(path, preserved_uuids.get(path.name))


if __name__ == "__main__":
    main()
