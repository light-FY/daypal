"""Generate Android launcher, notification and splash assets for 伴办."""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
SRC = Image.open(os.path.join(ROOT, "www", "assets", "icons", "maskable-512.png")).convert("RGBA")
ICON = Image.open(os.path.join(ROOT, "www", "assets", "icons", "icon-512.png")).convert("RGBA")
CREAM = (247, 243, 233, 255)
BRAND = (23, 63, 53, 255)
FONT_PATH = r"C:\Windows\Fonts\simhei.ttf"

LAUNCHER_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND_SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def save(img, path, size):
    img.resize((size, size), Image.LANCZOS).save(path, "PNG", optimize=True)


def circle_icon(size):
    img = ICON.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


# Launcher / adaptive foreground
for density, size in LAUNCHER_SIZES.items():
    folder = os.path.join(RES, "mipmap-" + density)
    os.makedirs(folder, exist_ok=True)
    save(ICON, os.path.join(folder, "ic_launcher.png"), size)
    save(circle_icon(1024), os.path.join(folder, "ic_launcher_round.png"), size)
for density, size in FOREGROUND_SIZES.items():
    folder = os.path.join(RES, "mipmap-" + density)
    save(SRC, os.path.join(folder, "ic_launcher_foreground.png"), size)

# Background color used by adaptive icon
color_file = os.path.join(RES, "values", "ic_launcher_background.xml")
with open(color_file, "w", encoding="utf-8") as f:
    f.write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#173F35</color>\n'
        "</resources>\n"
    )

# Notification status icon (white check on transparent)
vector = '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M9,16.2 L4.8,12 L3.4,13.4 L9,19 L21,7 L19.6,5.6 Z"/></vector>'
with open(os.path.join(RES, "drawable", "ic_stat_banban.xml"), "w", encoding="utf-8") as f:
    f.write(vector)

# No custom splash image: Android launches on a plain cream background.

