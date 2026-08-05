from pathlib import Path
from math import sqrt

from PIL import Image, ImageDraw, ImageOps

from render_mockup import centered_text


HERE = Path(__file__).resolve().parent
LAYERS = HERE / "layers"
CANVAS_SIZE = (750, 1624)

# Preview placement in the 750x1624 design canvas.
HAIR_ASSET_WIDTH = 520
HAIR_DISPLAY_WIDTH = HAIR_ASSET_WIDTH
HAIR_TOP_LEFT = (115, 335)
HAIR_ANCHOR = (0.55, 0.58)  # Cocos anchor, measured from bottom-left.
HAIR_SOURCE_NAME = "male-rotating-hair-v3-full.png"
HAIR_OUTPUT_NAME = "male-rotating-hair-v3.png"
PREVIEW_OUTPUT_NAME = "male-layer-composite-preview-v3.png"


def crop_alpha(image: Image.Image, padding: int = 12) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        raise ValueError("Rotating hair image has no opaque pixels")
    left = max(0, box[0] - padding)
    top = max(0, box[1] - padding)
    right = min(image.width, box[2] + padding)
    bottom = min(image.height, box[3] + padding)
    return image.crop((left, top, right, bottom))


def add_hair_cap_backing(hair: Image.Image) -> Image.Image:
    """Fill the solved wig cap so the base mesh cannot show through the bangs."""
    width, height = hair.size
    scale = 4
    center_x = width / 2
    radius_x = width * 0.49
    base_y = height * 0.79
    radius_y = height * 0.72

    mask_large = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask_large)
    arc = []
    for x in range(round(center_x - radius_x), round(center_x + radius_x) + 1):
        normalized = (x - center_x) / radius_x
        y = base_y - radius_y * sqrt(max(0.0, 1.0 - normalized * normalized))
        arc.append((round(x * scale), round(y * scale)))
    polygon = arc + [
        (round((center_x + radius_x) * scale), round(base_y * scale)),
        (round((center_x - radius_x) * scale), round(base_y * scale)),
    ]
    draw.polygon(polygon, fill=255)
    mask = mask_large.resize((width, height), Image.Resampling.LANCZOS)

    backing = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = backing.load()
    top_color = (246, 248, 252)
    bottom_color = (203, 212, 226)
    for y in range(height):
        ratio = min(1.0, y / max(1.0, base_y))
        color = tuple(round(top + (bottom - top) * ratio) for top, bottom in zip(top_color, bottom_color))
        for x in range(width):
            pixels[x, y] = (*color, 255)
    backing.putalpha(mask)
    return Image.alpha_composite(backing, hair)


def main() -> None:
    base_source = Image.open(LAYERS / "male-base-layer-source.png").convert("RGB")
    base = ImageOps.fit(base_source, CANVAS_SIZE, method=Image.Resampling.LANCZOS)
    base.save(LAYERS / "male-base-layer.png", quality=95)

    ui_overlay = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(ui_overlay)
    centered_text(
        draw,
        "99%的人都对不准",
        CANVAS_SIZE[0] // 2,
        170,
        58,
        "#ffffff",
        "#2d8fd7",
        8,
        shadow_offset=7,
        shadow_fill="#145b99",
    )

    panel_draw = ImageDraw.Draw(ui_overlay)
    panel_draw.rounded_rectangle((75, 1290, 675, 1415), radius=48, fill=(18, 82, 138, 100))
    panel_draw.rounded_rectangle((75, 1282, 675, 1407), radius=48, fill=(48, 151, 216, 230))

    draw = ImageDraw.Draw(ui_overlay)
    centered_text(
        draw,
        "点击发片，调整方向",
        CANVAS_SIZE[0] // 2,
        1314,
        40,
        "#ffffff",
        "#145b99",
        4,
    )
    ui_overlay.save(LAYERS / "male-ui-overlay.png")
    base_with_ui = Image.alpha_composite(base.convert("RGBA"), ui_overlay)
    base_with_ui.convert("RGB").save(LAYERS / "male-base-layer-with-ui.png", quality=95)

    hair_source = Image.open(LAYERS / HAIR_SOURCE_NAME).convert("RGBA")
    hair = crop_alpha(hair_source)
    asset_height = round(hair.height * HAIR_ASSET_WIDTH / hair.width)
    hair = hair.resize((HAIR_ASSET_WIDTH, asset_height), Image.Resampling.LANCZOS)
    hair = add_hair_cap_backing(hair)
    hair.save(LAYERS / HAIR_OUTPUT_NAME)

    preview = base.convert("RGBA")
    display_height = round(hair.height * HAIR_DISPLAY_WIDTH / hair.width)
    display_hair = hair.resize((HAIR_DISPLAY_WIDTH, display_height), Image.Resampling.LANCZOS)
    preview.alpha_composite(display_hair, HAIR_TOP_LEFT)
    preview = Image.alpha_composite(preview, ui_overlay)
    preview.convert("RGB").save(LAYERS / PREVIEW_OUTPUT_NAME, quality=95)

    pivot_x = HAIR_TOP_LEFT[0] + HAIR_DISPLAY_WIDTH * HAIR_ANCHOR[0]
    pivot_y_from_top = HAIR_TOP_LEFT[1] + display_height * (1 - HAIR_ANCHOR[1])
    print(f"Base: {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}")
    print(f"Hair source: {hair.width}x{hair.height}")
    print(f"Preview hair size: {HAIR_DISPLAY_WIDTH}x{display_height}")
    print(f"Preview pivot from top-left: ({pivot_x:.1f}, {pivot_y_from_top:.1f})")


if __name__ == "__main__":
    main()
