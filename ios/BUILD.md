# 伴办 · iOS 构建说明

> 版本 **0.9.1** · Bundle ID `com.banban.app` · 最低 iOS 15.0 · 仅 iPhone 竖屏

## 先说结论

这个目录里已经生成并配置好了完整的 **Capacitor iOS Xcode 工程**，但当前开发机是 Windows，**无法在本机编译 `.ipa`**：

- `.ipa` 需要 macOS + Xcode 编译；
- 安装到 iPhone 还需要 Apple 签名（付费开发者证书，或免费 Apple ID + Sideloadly/AltStore 签名）；
- 这是 Apple 工具链限制，不是项目代码问题。

代码、图标、启动页、本地通知桥接都已经准备好。只要有 Mac 或 macOS CI，就能出包。

---

## 方案 A：在 Mac 上直接构建（推荐）

### 环境

- macOS 14+
- Xcode 16+
- Node.js 20+
- 一台 iPhone（可选，用于真机调试）

### 步骤

```bash
cd banban-mobile
npm ci
npm run build:native
npx cap sync ios
open ios/App/App.xcodeproj
```

在 Xcode 中：

1. 选中左侧 `App` target → **Signing & Capabilities**。
2. 选择你的 Apple Developer Team。
3. 确认 Bundle Identifier 为 `com.banban.app`（如果被占用，改成自己的唯一 ID）。
4. 连接 iPhone，选择该设备，点 Run。
5. 第一次运行后，进入「设置 → 提醒」开启通知并测试。

### 导出 IPA

Xcode 菜单：

- Product → Archive
- Organizer → Distribute App
- 选择 **Development**（真机调试）或 **Ad Hoc**（指定设备）
- 导出得到 `.ipa`

也可以在 Mac 上用命令行归档：

```bash
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath build/ipa
```

`ios/ExportOptions.plist` 里的 `teamID` 需要改成你的 Team ID。

### 免费 Apple ID 的限制

- Xcode 的 Personal Team 可以装到自己手机，但签名 **7 天有效**，到期要重签。
- 不能上架 App Store，也不能用 Ad Hoc 分发给别人。
- 正式分发需要 Apple Developer Program（$99/年）。

---

## 方案 B：GitHub Actions 生成未签名 IPA

仓库里带了一份 workflow 模板 `docs/ios-unsigned-workflow.yml`。要启用：

1. 把它复制到 `.github/workflows/ios-unsigned.yml`；
2. 提交并推送（GitHub 需要 `workflow` scope，或在网页端直接新建文件）；
3. 在 Actions 里手动运行 **Build unsigned iOS IPA**；
4. 运行结束后下载 artifact `Banban-unsigned-ipa`；
5. 用 **Sideloadly / AltStore / TrollStore**（视 iOS 版本）使用你的 Apple ID 对 IPA 签名后安装。

> 这个 workflow 用 `CODE_SIGNING_ALLOWED=NO` 生成的是**未签名 IPA**，不能直接双击安装。  
> 如果你的仓库配置了 Apple 证书和 provisioning profile，也可以把签名参数打开，直接产出可安装 IPA。

本地 Mac 也可以跑同样的未签名脚本：

```bash
bash ios/build-unsigned-ipa.sh
```

产物：`build/Banban-unsigned.ipa`。之后用 Sideloadly 签名。

---

## iOS 功能说明

- 截止前 24h / 3h / 30min 本地通知
- 逾期重复提醒
- 长期阶段提醒
- 点击通知打开对应任务
- 导出备份调起 iOS 分享面板
- 无开屏动画：LaunchScreen 是纯米色背景，无图片
- 数据仍然只存本机（WKWebView localStorage）
- 通知权限由 iOS 系统弹窗询问

### 与 Android 的差异

- 没有“精确闹钟权限”设置项（iOS 不需要）。
- 没有通知渠道/自定义提示音设置；使用系统默认通知声音。
- 后台提醒由 iOS `UNUserNotificationCenter` 负责；系统会按自身策略调度。
- 低电量模式、专注模式可能影响通知展示。

---

## 已验证 / 未验证

已验证（静态与工程配置）：

- Xcode 工程结构、SPM 依赖、4 个 Capacitor 插件
- Info.plist 应用名「伴办」、Bundle ID、版本 0.9.1、仅 iPhone 竖屏
- 1024×1024 不透明 AppIcon
- LaunchScreen 无图片、纯米色
- iOS 通知桥接代码（与 Android 共用）
- 本地通知、分享、文件系统插件已写入 Package.swift

未验证（需要 macOS）：

- `xcodebuild` 编译
- 真机/模拟器运行
- iOS 通知权限弹窗与实际送达
- IPA 签名与安装

> 在拿到 Mac 或 macOS CI 之前，不能诚实地声称已经产出可安装的 `.ipa`。
