"""Generate original cool-gray line icons; no third-party artwork is used.

Run from the repository root: uv run --with pillow python client/scripts/generate-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "src/assets/tabs"
SCALE = 4


def render(name, color):
    image = Image.new("RGBA", (96 * SCALE, 96 * SCALE))
    draw = ImageDraw.Draw(image)

    def line(points, width=4):
        draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=color,
                  width=width * SCALE, joint="curve")

    def rectangle(box, radius=5):
        draw.rounded_rectangle(tuple(value * SCALE for value in box),
                               radius=radius * SCALE, outline=color, width=4 * SCALE)

    def ellipse(box):
        draw.ellipse(tuple(value * SCALE for value in box), outline=color, width=4 * SCALE)

    if name == "home":
        line([(18, 44), (48, 18), (78, 44)])
        line([(25, 41), (25, 76), (71, 76), (71, 41)])
        line([(41, 76), (41, 56), (55, 56), (55, 76)])
    elif name in {"items", "other"}:
        rectangle((22, 28, 74, 76), 4)
        line([(22, 41), (74, 41)])
        line([(48, 28), (48, 76)])
        line([(22, 28), (35, 18), (61, 18), (74, 28)])
    elif name == "me":
        ellipse((34, 17, 62, 45))
        draw.arc((23 * SCALE, 47 * SCALE, 73 * SCALE, 99 * SCALE), 180, 360,
                 fill=color, width=4 * SCALE)
    elif name == "formula":
        rectangle((26, 23, 70, 78), 5)
        line([(26, 33), (70, 33)])
        line([(26, 65), (70, 65)])
        ellipse((40, 42, 56, 58))
    elif name == "diapers":
        line([(22, 24), (74, 24), (74, 46), (61, 76), (35, 76), (22, 46), (22, 24)])
        line([(22, 39), (36, 39), (42, 48)])
        line([(74, 39), (60, 39), (54, 48)])
        draw.arc((15 * SCALE, 48 * SCALE, 45 * SCALE, 90 * SCALE), 270, 360, fill=color, width=4 * SCALE)
        draw.arc((51 * SCALE, 48 * SCALE, 81 * SCALE, 90 * SCALE), 180, 270, fill=color, width=4 * SCALE)
    elif name == "bottle":
        rectangle((31, 36, 65, 79), 7)
        rectangle((34, 28, 62, 38), 3)
        line([(41, 28), (41, 18), (44, 13), (52, 13), (55, 18), (55, 28)])
        line([(52, 50), (64, 50)]); line([(52, 61), (64, 61)])
    elif name == "cleaning":
        rectangle((19, 34, 77, 72), 5)
        line([(35, 34), (32, 21), (62, 21), (58, 34)])
        line([(36, 48), (60, 48)])
    elif name == "care":
        rectangle((31, 34, 65, 79), 5)
        line([(42, 34), (42, 21), (57, 21)])
        line([(37, 21), (64, 21), (64, 27)])
        line([(41, 56), (55, 56)]); line([(48, 49), (48, 63)])
    elif name == "clothing":
        line([(34, 22), (20, 28), (13, 44), (28, 50), (30, 41), (30, 77), (66, 77),
              (66, 41), (68, 50), (83, 44), (76, 28), (62, 22)])
        draw.arc((34 * SCALE, 11 * SCALE, 62 * SCALE, 35 * SCALE), 0, 180,
                 fill=color, width=4 * SCALE)
    elif name == "travel":
        line([(20, 28), (28, 28), (41, 63), (72, 63), (80, 38), (31, 38)])
        line([(49, 17), (49, 38), (79, 38)])
        draw.arc((48 * SCALE, 16 * SCALE, 80 * SCALE, 60 * SCALE), 270, 360,
                 fill=color, width=4 * SCALE)
        ellipse((36, 70, 46, 80)); ellipse((65, 70, 75, 80))
    return image.resize((96, 96), Image.Resampling.LANCZOS)


ROOT.mkdir(parents=True, exist_ok=True)
for name in ["home", "items", "me"]:
    render(name, "#858b94").save(ROOT / f"{name}.png")
    render(name, "#303844").save(ROOT / f"{name}-selected.png")
for name in ["formula", "diapers", "bottle", "cleaning", "care", "clothing", "travel", "other"]:
    render(name, "#667b91").save(ROOT / f"{name}.png")
