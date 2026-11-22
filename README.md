# computer-use-x11

Computer Use for **Linux X11** sessions in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It installs one model-facing `cua` tool that lists windows, reads the AT-SPI accessibility tree, captures window screenshots, and dispatches clicks, keys, text, scrolling and dragging.

This is a provider for the shared `@deepseek-ai/dsh-cua` runtime, the same runtime the official macOS provider uses. It supplies a native backend instead of a macOS one.

## How it works

```
model → cua tool → @deepseek-ai/dsh-cua → JSONL over stdio → bin/x11-helper
                                                              ├─ xprop / xwininfo   windows and geometry (EWMH)
                                                              ├─ AT-SPI2 (D-Bus)    accessibility tree
                                                              ├─ xdotool (XTest)   pointer and keyboard
                                                              └─ maim               window capture
```

The helper speaks the same newline-delimited JSON protocol as the macOS helper: one `{id, method, params}` request per line on stdin, one reply per line on stdout.

## Requirements

- Linux, an X11 session (`DISPLAY` set). Wayland is not supported.
- `python3` with `gi` importing `Atspi` (usually `python-gobject` + `at-spi2-core`).
- `xdotool`, `maim` (plus `xclip` for paste; ImageMagick `import` as capture fallback).

A missing tool does not stop the plugin from loading; the affected method returns a specific error code.

## Install

From the plugin market index: add the index URL in **Settings → Plugins → Marketplace**, then install `computer-use-x11`.

From a local checkout: **Plugins → Add plugin** and pick this directory (or install it as a bundle with the plugin manager).

Enabling the bundle mounts `@deepseek-ai/dsh-computer-use` and this provider in the profile. It is Host-only: there is no Client page.

## Usage

The model gets one tool, `cua`, dispatched by `method`:

```json
{"method": "getCapabilities"}
{"method": "listApps"}
{"method": "getApp", "params": {"selector": "google-chrome"}}
{"method": "listWindows", "params": {"appHandle": "x11:0:googlechrome"}}
{"method": "screenshot", "params": {"appHandle": "x11:0:googlechrome", "windowId": 39845890}}
{"method": "click", "params": {"appHandle": "x11:0:googlechrome", "windowId": 39845890, "x": 420, "y": 300}}
{"method": "typeText", "params": {"appHandle": "x11:0:googlechrome", "windowId": 39845890, "text": "hello"}}
```

Selecting an application asks for consent through the shared CUA application approval, unless the profile's approval policy already allows it.

## Limitations

- **X11 only.** No global input injection or window enumeration exists on Wayland. The bundle row disables itself on non-Linux hosts and when `DISPLAY` is unset, so installing it elsewhere does nothing instead of erroring.
- **Accessibility coverage is uneven.** Terminals (kitty), Chromium/Electron without renderer accessibility, and Qt without `QT_LINUX_ACCESSIBILITY_ALWAYS_ON` expose no tree. Fall back to a screenshot plus window-local pixel clicks.
- The helper asks at-spi2-core to expose UI trees (`org.a11y.Status.IsEnabled=true`); already-running applications may need a restart. Set `DSH_X11_ENABLE_A11Y=0` to disable.
- Applications are grouped by `WM_CLASS` instance, not pid: processes started inside a sandbox report a namespace-local pid, so pid alone can collide.
- Coordinates are window pixels, equal to screenshot pixels of the returned capture.
- Typing activates the target window first, because keystrokes follow keyboard focus.

## Configuration

The plugin row accepts the shared CUA bounds (`agentPreset`, `maxElements`, `maxDepth`, `timeoutMs`, …) plus:

| Key | Default | Meaning |
|---|---|---|
| `requireSystemPointerApproval` | `false` | Ask once per Session before an explicit system-pointer move. |
| `agentPreset` | `false` | Register `cua` for every Agent; set a preset id to scope it. |
| `helperPath` | packaged helper | Replace the backend executable. |

## 中文

给 DeepSeek Harness 的 **Linux X11** 电脑操作后端。装好后模型有一个 `cua` 工具：列窗口、读 AT-SPI 无障碍树、截窗口图、点击/按键/输入文本/滚动/拖拽。

依赖：X11 会话、`python3` + `gi`（Atspi）、`xdotool`、`maim`。Wayland 不支持。

限制：终端和未开渲染器无障碍的 Chromium/Electron 没有可访问树，只能靠截图 + 窗口像素坐标点；应用按窗口类分组而不是 pid。

## License

MIT
