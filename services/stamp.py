# services/stamp.py
from PIL import Image
from PIL import ImageDraw
from PIL import ImageFont
from PIL import ImageFilter


def create_simple_stamp(
    number="4",
    output_path="stamp.png",
    bottom_text = "QUALITY ASSURANCE"
):

    SIZE = 350

    img = Image.new(
        "RGBA",
        (SIZE, SIZE),
        (255, 255, 255, 0)
    )

    draw = ImageDraw.Draw(img)

    # =================================
    # OUTER CIRCLE
    # =================================

    margin = 20

    draw.ellipse(
        (
            margin,
            margin,
            SIZE - margin,
            SIZE - margin
        ),
        outline="black",
        width=4
    )

    # =================================
    # FONTS
    # =================================

    top_font = ImageFont.truetype(
        "arialbd.ttf",
        38
    )

    bottom_font = ImageFont.truetype(
        "arial.ttf",
        30
    )

    center_font = ImageFont.truetype(
        "arialbd.ttf",
        70
    )

    # =================================
    # TOP TEXT
    # =================================

    top_text = "TQW"

    bbox = draw.textbbox(
        (0, 0),
        top_text,
        font=top_font
    )

    w = bbox[2] - bbox[0]

    draw.text(
        (
            (SIZE - w) / 2,
            45
        ),
        top_text,
        fill="black",
        font=top_font
    )

    # =================================
    # CENTER NUMBER
    # =================================

    bbox = draw.textbbox(
        (0, 0),
        str(number),
        font=center_font
    )

    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]

    draw.text(
        (
            (SIZE - w) / 2,
            (SIZE - h) / 2 - 5
        ),
        str(number),
        fill="black",
        font=center_font
    )

    # =================================
    # BOTTOM TEXT
    # =================================

    # bottom_text = "QUALITY ASSURANCE"
    # bottom_text = "OPERATOR"

    bbox = draw.textbbox(
        (0, 0),
        bottom_text,
        font=bottom_font
    )

    w = bbox[2] - bbox[0]

    draw.text(
        (
            (SIZE - w) / 2,
            SIZE - 100
        ),
        bottom_text,
        fill="black",
        font=bottom_font
    )

    # =================================
    # SLIGHT BLUR
    # =================================

    img = img.filter(
        ImageFilter.GaussianBlur(0.2)
    )

    img.save(output_path)

    return output_path


# TEST
create_simple_stamp("4")