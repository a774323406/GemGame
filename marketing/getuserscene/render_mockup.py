from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
CANVAS_SIZE = (750, 1624)

FONT_CANDIDATES = (
    Path(
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/"
        "18189590ed3a5f46cef20ed4d1cec2611dca13ff.asset/AssetData/WawaSC-Regular.otf"
    ),
    Path(
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/"
        "b86e58f38fd21e9782e70a104676f1655e72ebab.asset/AssetData/Yuanti.ttc"
    ),
    Path.home() / "Library/Fonts/SourceHanSansSC-VF.ttf",
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
)


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    raise FileNotFoundError("No supported Simplified Chinese font was found")


def centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: int,
    top: int,
    size: int,
    fill: str,
    stroke_fill: str,
    stroke_width: int,
    shadow_offset: int = 0,
    shadow_fill: str = "#a92970",
) -> None:
    selected_font = font(size)
    box = draw.textbbox((0, 0), text, font=selected_font, stroke_width=stroke_width)
    left = center_x - (box[2] - box[0]) // 2
    if shadow_offset:
        draw.text(
            (left, top + shadow_offset),
            text,
            font=selected_font,
            fill=shadow_fill,
            stroke_fill=shadow_fill,
            stroke_width=stroke_width,
        )
    draw.text(
        (left, top),
        text,
        font=selected_font,
        fill=fill,
        stroke_fill=stroke_fill,
        stroke_width=stroke_width,
    )


def render(
    art_name: str,
    output_name: str,
    accent: str,
    dark_accent: str,
    panel_fill: tuple[int, int, int, int],
    panel_shadow: tuple[int, int, int, int],
) -> None:
    source = Image.open(HERE / art_name).convert("RGB")
    canvas = ImageOps.fit(source, CANVAS_SIZE, method=Image.Resampling.LANCZOS).convert("RGBA")

    draw = ImageDraw.Draw(canvas)
    centered_text(
        draw,
        "99%的人都对不准",
        CANVAS_SIZE[0] // 2,
        70,
        58,
        "#ffffff",
        accent,
        8,
        shadow_offset=7,
        shadow_fill=dark_accent,
    )

    panel = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle((75, 1430, 675, 1555), radius=48, fill=panel_shadow)
    panel_draw.rounded_rectangle((75, 1422, 675, 1547), radius=48, fill=panel_fill)
    canvas = Image.alpha_composite(canvas, panel)

    draw = ImageDraw.Draw(canvas)
    centered_text(
        draw,
        "点击发片，调整方向",
        CANVAS_SIZE[0] // 2,
        1454,
        40,
        "#ffffff",
        dark_accent,
        4,
    )
    canvas.convert("RGB").save(HERE / output_name, quality=95)


def main() -> None:
    render(
        "female-hair-puzzle-playing-art.png",
        "female-hair-puzzle-playing-final.png",
        accent="#e14f9a",
        dark_accent="#a92970",
        panel_fill=(232, 91, 164, 225),
        panel_shadow=(169, 41, 112, 80),
    )
    render(
        "male-hair-puzzle-playing-art.png",
        "male-hair-puzzle-playing-final.png",
        accent="#2d8fd7",
        dark_accent="#145b99",
        panel_fill=(48, 151, 216, 230),
        panel_shadow=(18, 82, 138, 100),
    )


if __name__ == "__main__":
    main()
