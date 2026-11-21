"""Generate the opaque 1024x1024 iOS app icon from the shared 伴办 icon."""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "www", "assets", "icons", "maskable-512.png")
OUT = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png")

img = Image.open(SRC).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
# iOS app icons must not contain transparency.
bg = Image.new("RGB", (1024, 1024), (23, 63, 53))
bg.paste(img, (0, 0), img)
bg.save(OUT, "PNG", optimize=True)
print("wrote", OUT, bg.size)
