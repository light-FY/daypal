#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 构建 Web 桥接"
npm run build:native

echo "==> 同步 iOS 资源"
npx cap sync ios

echo "==> 编译未签名 iOS App"
cd "$ROOT/ios/App"
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

APP="$ROOT/ios/App/build/Build/Products/Release-iphoneos/App.app"
if [ ! -d "$APP" ]; then
  echo "找不到编译产物：$APP" >&2
  exit 1
fi

echo "==> 打包 Payload"
rm -rf "$ROOT/build/Payload" "$ROOT/build/Banban-unsigned.ipa"
mkdir -p "$ROOT/build/Payload"
cp -R "$APP" "$ROOT/build/Payload/"
cd "$ROOT/build"
zip -qry Banban-unsigned.ipa Payload

echo "完成：$ROOT/build/Banban-unsigned.ipa"
echo "这是一个未签名 IPA，请用 Sideloadly / AltStore 使用你的 Apple ID 签名后安装。"
