# X11 computer use

给 agent 一个 `cua` 工具，直接操作**本机 X11 桌面**：列窗口、读无障碍树、截窗口图、点鼠标、按键、输入文本。相当于把官方 macOS 的 Computer Use 换了一个 Linux 原生后端。

## 它怎么工作

- **共用层**：`@deepseek-ai/dsh-cua` 提供工具、应用授权、坐标换算、截图准入。这个包只补三样东西：本地助手可执行文件、`installCua` 的 backend、以及给模型的平台说明。
- **本地助手**：`bin/x11-helper`（Python 3）。协议是 stdin/stdout 上的逐行 JSON，与 macOS 助手同一套方法名。
  - 窗口与几何：`xprop` / `xwininfo`（EWMH）
  - 无障碍树：AT-SPI2（`pyatspi`，通过 D-Bus）
  - 鼠标键盘：XTest（调用 `xdotool`）
  - 截图：`maim`，失败时退回 ImageMagick `import`

## 依赖

- Linux + X11（`DISPLAY` 存在；Wayland 会话不支持）
- `python3`，且能用 `gi` 导入 `Atspi`（通常来自 `python-gobject` 与 `at-spi2-core`）
- `xdotool`、`maim`（可选 `import`、`xclip` 用于粘贴）

缺一项不会让插件加载失败，但对应能力在调用时返回明确的错误码。

## 用法

模型侧只有一个工具 `cua`，按 `method` 分发：

```json
{"method": "getCapabilities"}
{"method": "listApps"}
{"method": "getApp", "params": {"selector": "google-chrome"}}
{"method": "listWindows", "params": {"appHandle": "x11:0:googlechrome"}}
{"method": "getState", "params": {"appHandle": "...", "windowId": 39845890, "maxElements": 400}}
{"method": "screenshot", "params": {"appHandle": "...", "windowId": 39845890}}
{"method": "click", "params": {"appHandle": "...", "windowId": 39845890, "x": 420, "y": 300}}
{"method": "typeText", "params": {"appHandle": "...", "windowId": 39845890, "text": "hello"}}
```

第一次选中某个应用时，界面会弹一次授权卡（属于 DSH 的应用授权，不是系统权限）。

## 已知限制

- **只支持 X11**。Wayland 下没有全局输入注入和窗口枚举，这层后端不适用。
- **无障碍树覆盖不齐**：终端类（kitty）、未开渲染器无障碍的 Chromium/Electron、没设 `QT_LINUX_ACCESSIBILITY_ALWAYS_ON` 的 Qt 应用，`getState` 可能只返回窗口标题行。此时用截图 + 窗口像素坐标点击。
- 助手会尝试把 AT-SPI 的 `org.a11y.Status.IsEnabled` 置为 true；已经启动的应用未必立刻生效，重启应用后才暴露完整树。需要关闭该行为时设置环境变量 `DSH_X11_ENABLE_A11Y=0`。
- **应用以窗口类（WM_CLASS instance）分组**，不是 pid：在沙箱里启动的进程会报告命名空间内的 pid，多个应用可能撞车。
- 坐标为**窗口内像素**，等于截图像素；`screenshot` 之后坐标才可靠。
- 文本输入要求目标窗口有键盘焦点，助手会先 raise + activate。

## 配置

插件行支持 `cua` 的通用配置项（`agentPreset`、`maxElements`、`maxDepth`、`timeoutMs` 等），另外：

- `requireSystemPointerApproval`：默认 `false`。设为 `true` 后，每个会话首次请求移动系统指针会先问一次。
- `helperPath`：默认指向包内 `bin/x11-helper`；需要换后端时可覆盖。
