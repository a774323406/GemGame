from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent
LOGO_PATH = PROJECT_ROOT / "assets/res/texture/LOGO.png"
CANVAS_SIZE = (1080, 1440)

FONT_CANDIDATES = (
    Path.home() / "Library/Fonts/SourceHanSansSC-VF.ttf",
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),
)
CARTOON_FONT_CANDIDATES = (
    Path(
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/"
        "18189590ed3a5f46cef20ed4d1cec2611dca13ff.asset/AssetData/WawaSC-Regular.otf"
    ),
    Path(
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/"
        "b86e58f38fd21e9782e70a104676f1655e72ebab.asset/AssetData/Yuanti.ttc"
    ),
    *FONT_CANDIDATES,
)


def font(size: int, cartoon: bool = False) -> ImageFont.FreeTypeFont:
    candidates = CARTOON_FONT_CANDIDATES if cartoon else FONT_CANDIDATES
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    raise FileNotFoundError("No supported Simplified Chinese font was found")


def paste_logo(canvas: Image.Image, width: int, top: int) -> None:
    logo = Image.open(LOGO_PATH).convert("RGBA")
    height = round(logo.height * width / logo.width)
    logo = logo.resize((width, height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((canvas.width - width) // 2, top))


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: int,
    top: int,
    size: int,
    fill: str,
    stroke_fill: str,
    stroke_width: int,
    cartoon: bool = False,
    shadow_fill: str | None = None,
    shadow_offset: tuple[int, int] = (0, 0),
) -> None:
    selected_font = font(size, cartoon=cartoon)
    box = draw.textbbox((0, 0), text, font=selected_font, stroke_width=stroke_width)
    width = box[2] - box[0]
    position = (center_x - width // 2, top)
    if shadow_fill:
        draw.text(
            (position[0] + shadow_offset[0], position[1] + shadow_offset[1]),
            text,
            font=selected_font,
            fill=shadow_fill,
            stroke_fill=shadow_fill,
            stroke_width=stroke_width,
        )
    draw.text(
        position,
        text,
        font=selected_font,
        fill=fill,
        stroke_fill=stroke_fill,
        stroke_width=stroke_width,
    )


def render(
    source_name: str,
    output_name: str,
    logo_width: int,
    logo_top: int,
    panel_box: tuple[int, int, int, int],
    headline: str,
    headline_top: int,
    headline_size: int,
    headline_stroke: str,
    subtitle: str,
    subtitle_top: int,
    subtitle_size: int,
    cartoon_text: bool = False,
) -> None:
    source = Image.open(HERE / source_name).convert("RGB")
    canvas = ImageOps.fit(source, CANVAS_SIZE, method=Image.Resampling.LANCZOS).convert("RGBA")
    paste_logo(canvas, logo_width, logo_top)

    panel = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle(panel_box, radius=48, fill=(52, 20, 92, 204))
    canvas = Image.alpha_composite(canvas, panel)

    draw = ImageDraw.Draw(canvas)
    draw_centered_text(
        draw,
        headline,
        CANVAS_SIZE[0] // 2,
        headline_top,
        headline_size,
        "#fff7a8" if cartoon_text else "#ffffff",
        headline_stroke,
        10 if cartoon_text else 8,
        cartoon=cartoon_text,
        shadow_fill="#51168d" if cartoon_text else None,
        shadow_offset=(0, 8) if cartoon_text else (0, 0),
    )
    draw_centered_text(
        draw,
        subtitle,
        CANVAS_SIZE[0] // 2,
        subtitle_top,
        subtitle_size,
        "#ffffff" if cartoon_text else "#fff28a",
        "#ec5aa8" if cartoon_text else "#34145c",
        5 if cartoon_text else 3,
        cartoon=cartoon_text,
        shadow_fill="#51168d" if cartoon_text else None,
        shadow_offset=(0, 5) if cartoon_text else (0, 0),
    )
    canvas.convert("RGB").save(HERE / output_name, quality=95)


def main() -> None:
    render(
        source_name="acquisition-feed-cover-art.png",
        output_name="acquisition-feed-cover-final.png",
        logo_width=310,
        logo_top=18,
        panel_box=(70, 1210, 1010, 1385),
        headline="就差最后一颗！",
        headline_top=1218,
        headline_size=76,
        headline_stroke="#ff5c8c",
        subtitle="点一下，立即挑战",
        subtitle_top=1310,
        subtitle_size=40,
    )
    render(
        source_name="revisit-random-daily-cover-art.png",
        output_name="revisit-random-daily-cover-final.png",
        logo_width=300,
        logo_top=12,
        panel_box=(55, 1190, 1025, 1380),
        headline="今天会抽到哪一关？",
        headline_top=1198,
        headline_size=70,
        headline_stroke="#8d39d6",
        subtitle="每日随机挑战 · 通关得道具",
        subtitle_top=1290,
        subtitle_size=42,
        cartoon_text=True,
    )
    render(
        source_name="acquisition-corgi-cartoon-art.png",
        output_name="acquisition-corgi-cartoon-final.png",
        logo_width=320,
        logo_top=14,
        panel_box=(55, 1190, 1025, 1380),
        headline="帮柯基补上最后一颗！",
        headline_top=1198,
        headline_size=65,
        headline_stroke="#8d39d6",
        subtitle="点一下，马上开玩",
        subtitle_top=1292,
        subtitle_size=44,
        cartoon_text=True,
    )


if __name__ == "__main__":
    main()
