# 伴办 · macOS 本地构建交接说明

> 给在 Mac 上运行的 DSH / 本地 agent 看。  
> 当前项目版本：0.9.1；Android 已出包；iOS 工程已配置，但尚未在 macOS 上编译过，也还没有 `.ipa`。

## 1. 项目位置

假设解压后位于：

```text
~/Downloads/banban-mobile
```

先读：

- `README.md`
- `ios/BUILD.md`
- `ios/ExportOptions.plist`
- `.gitignore`

## 2. 目标

在 macOS 上用 Xcode 构建 iOS 版「伴办」，安装到用户的 iPhone；如果用户需要，再导出 `.ipa`。

验收标准：

- App 能安装并启动；
- 今日、日历、收件箱、设置页面正常；
- 设置 → 提醒 → 开启通知后能收到测试通知；
- 关闭 App 后，限时任务仍能按系统本地通知提醒；
- 导出备份可调起 iOS 分享面板。

## 3. 环境检查

```bash
xcodebuild -version
node -v
npm -v
```

要求：

- macOS 14+
- Xcode 16+
- Node.js 20 或 22
- 一台 iPhone

如果 Xcode 未安装，先让用户从 App Store 安装完整 Xcode，不要只装 Command Line Tools。

## 4. 构建准备

```bash
cd ~/Downloads/banban-mobile
npm ci
npm run build:native
npx cap sync ios
open ios/App/App.xcodeproj
```

说明：

- 这个项目用 SPM，不需要 CocoaPods。
- `ios/App/App/public/` 是 `cap sync` 生成的，仓库里没有提交，必须先同步。
- 如果 `npm ci` 报 esbuild 平台错误，改用 `npm install`。

## 5. 签名（必须用户本人操作）

进入 Xcode：

> App target → Signing & Capabilities

需要用户手动：

1. Xcode → Settings → Accounts 登录 Apple ID；
2. 选择 Personal Team 或付费 Team；
3. 确认 Bundle Identifier：
   - 默认 `com.banban.app`；
   - 如果被占用，改成唯一 ID；
   - 改完同步修改根目录 `capacitor.config.json` 的 `appId`，再执行 `npx cap sync ios`；
4. 勾选 Automatically manage signing。

**不要向用户索要 Apple ID 密码、双重验证码或身份证信息。**

## 6. 真机运行

1. iPhone 连接 Mac，用户点“信任此电脑”；
2. iPhone 设置 → 隐私与安全性 → 开发者模式 → 打开并重启；
3. Xcode 顶部选择 iPhone；
4. ⌘R；
5. 首次安装后，让用户在 iPhone 上信任开发者证书：
   > 设置 → 通用 → VPN 与设备管理 → 开发者 App → 信任
6. 打开 App，进入设置 → 提醒 → 开启通知 → 测试。

## 7. 导出 IPA

### 图形界面

1. 设备选择 **Any iOS Device (arm64)**；
2. Product → Archive；
3. Organizer → Distribute App；
4. 根据用户账号选择：
   - Development：自己的设备；
   - Ad Hoc：已注册 UDID 的设备；
   - App Store Connect：上架/TestFlight；
5. 导出 `.ipa`。

### 命令行

先让用户把 `ios/ExportOptions.plist` 里的 `teamID` 改成真实 Team ID。

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive \
  DEVELOPMENT_TEAM=用户的TeamID \
  -allowProvisioningUpdates \
  archive

xcodebuild \
  -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath build/ipa \
  -allowProvisioningUpdates
```

## 8. 免费 Apple ID

免费 Personal Team：

- 可以 Xcode 直接 Run 到自己手机；
- 签名约 7 天有效；
- 通常不能 Ad Hoc / App Store 分发；
- 如果 Xcode 不允许导出 `.ipa`，改用：

```bash
bash ios/build-unsigned-ipa.sh
```

生成 `build/Banban-unsigned.ipa`，再让用户用 Sideloadly / AltStore 以 Apple ID 签名安装。

## 9. 重要约束

- 不要提交或上传 `android/keystore/`、`keystore.properties`、`*.jks`。
- 不要修改 App 名称、Bundle ID、版本号，除非用户明确同意。
- 不要声称 `.ipa` 已生成，除非文件真实存在并校验过。
- 遇到编译错误，先读完整错误日志，再改代码；不要猜测成功。
- 每完成一步，把结果告诉用户；需要 Apple 登录、2FA、Xcode 选 Team、iPhone 信任弹窗时，停下来等用户。

## 10. 常用排查

| 问题 | 处理 |
| --- | --- |
| `requires a development team` | Signing 选 Team |
| `Failed to register bundle identifier` | 换唯一 Bundle ID |
| `No profiles found` | 自动签名 + 重新选 Team |
| 设备不出现 | 信任电脑、开发者模式、换线 |
| `Untrusted Developer` | 设置里信任开发者证书 |
| SPM 下载失败 | 检查网络，File → Packages → Reset Caches |
| Archive 灰色 | 选 Any iOS Device，签名通过 |
| 通知不弹 | 系统通知权限 + App 内开启 |
