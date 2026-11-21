"""Set 伴办's iOS display metadata and portrait-only iPhone settings."""
import plistlib
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "ios", "App", "App", "Info.plist")

with open(PATH, "rb") as f:
    p = plistlib.load(f)

p["CFBundleDisplayName"] = "伴办"
p["CFBundleDevelopmentRegion"] = "zh_CN"
p["CFBundleName"] = "伴办"
p["UISupportedInterfaceOrientations"] = ["UIInterfaceOrientationPortrait"]
p.pop("UISupportedInterfaceOrientations~ipad", None)
p["UIRequiredDeviceCapabilities"] = ["arm64"]
p["ITSAppUsesNonExemptEncryption"] = False
p["UIStatusBarStyle"] = "UIStatusBarStyleDarkContent"
p["UIViewControllerBasedStatusBarAppearance"] = False
p["UIUserInterfaceStyle"] = "Light"
p["UIRequiresFullScreen"] = True
p["LSApplicationCategoryType"] = "public.app-category.productivity"

with open(PATH, "wb") as f:
    plistlib.dump(p, f, sort_keys=False)
print("updated", PATH)
