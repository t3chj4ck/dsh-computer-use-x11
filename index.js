/** X11 Computer Use provider: drives the local X11 session through the shared CUA runtime. */
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { installCua } from '@deepseek-ai/dsh-cua'
import { CuaConfigFields } from '@deepseek-ai/dsh-cua/config'
import { COMMON_GUIDANCE } from '@deepseek-ai/dsh-cua/guidance'

/** Loader plugin identity. */
const name = 'dsh-computer-use-x11'
/** Services required by the shared CUA executor and the native launcher. */
const inject = ['computerUse', 'tools', 'systemPrompt', 'subprocess', 'agents']

/** Operations implemented by the X11 helper, in the shared protocol vocabulary. */
const METHODS = [
  'activate', 'click', 'drag', 'findApps', 'getApp', 'getCapabilities', 'getState',
  'invoke', 'listActions', 'listApps', 'listWindows', 'mouseMove', 'paste',
  'performAction', 'pressKey', 'screenshot', 'scroll', 'selectText', 'sendKeyEvent',
  'setValue', 'show', 'typeText',
]

/** Provider capabilities fixed when the provider is installed. */
const CAPABILITIES = {
  platform: 'linux-x11',
  systemPointer: true,
  methods: METHODS,
  appLevelAccessibility: true,
  keyboard: ['app', 'window'],
  browser: false,
  coordinateSpace: 'screenshot-pixels',
}

/** Environment the helper needs to reach the user's X server, a11y bus, and tools. */
const PASSTHROUGH_ENV = [
  'DISPLAY', 'XAUTHORITY', 'HOME', 'PATH', 'LANG', 'LC_ALL', 'XDG_RUNTIME_DIR',
  'XDG_SESSION_ID', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS',
  'DSH_X11_TEXT_DELAY_MS', 'DSH_X11_AX_BUDGET_MS', 'DSH_X11_ENABLE_A11Y',
]

const PLATFORM_GUIDANCE = `Linux X11: accessibility tree operations work at app or window level, while simulated keyboard and mouse input target a window. Window ids are X11 window ids; element ids come from the latest getState snapshot and expire when that scope is read again. Many applications expose no AT-SPI tree (terminals, Electron and Chromium without renderer accessibility, Qt without QT_LINUX_ACCESSIBILITY_ALWAYS_ON); when the tree is empty, take a screenshot and click window-local pixels instead. Bounds are X11 window pixels, which equal screenshot pixels, so a click at screenshot coordinate (x, y) lands there. Selection is by running window class, not pid, because some applications report a namespace-local pid; listWindows of the wanted class is the reliable starting point. Typing requires the target window to hold keyboard focus, so the helper raises and activates it first.`

/** Native operation instructions; the shared Host adds guidance for declared capabilities. */
const GUIDANCE = `${PLATFORM_GUIDANCE}

${COMMON_GUIDANCE}`

/** Resolve the packaged helper next to this module. */
function defaultHelperPath() {
  return fileURLToPath(new URL('./bin/x11-helper', import.meta.url))
}

/** Bounded native configuration shared with the macOS provider, plus X11 defaults. */
const Config = Schema.object({
  ...CuaConfigFields,
  helperPath: Schema.string().default(defaultHelperPath()),
  requireSystemPointerApproval: CuaConfigFields.requireSystemPointerApproval.default(false),
  agentPreset: CuaConfigFields.agentPreset.default(false),
  maxElements: CuaConfigFields.maxElements.default(1500),
  maxDepth: CuaConfigFields.maxDepth.default(20),
  timeoutMs: CuaConfigFields.timeoutMs.default(20000),
  screenshotTimeoutMs: CuaConfigFields.screenshotTimeoutMs.default(10000),
})

/**
 * Open one Agent's connection to the helper over the helper's stdio JSONL protocol.
 * @param owner - Managed subprocess provider.
 * @param config - Resolved helper path, deadlines, and byte limits.
 * @returns Agent-owned streams plus process cleanup.
 */
function createChannel(owner, config) {
  const env = {}
  for (const key of PASSTHROUGH_ENV) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  const handle = owner.subprocess.spawn({
    argv: [config.helperPath],
    cwd: config.cwd,
    env,
    graceMs: config.graceMs,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' },
  })
  if (handle.stdin === undefined || handle.stdout === undefined) {
    handle.terminate()
    throw new Error('The X11 Computer Use helper did not expose its stdio protocol')
  }
  return {
    stdin: handle.stdin,
    stdout: handle.stdout,
    done: handle.done.then(() => undefined),
    close() { handle.terminate() },
    async waitForClose() {
      try { await handle.waitForExit() } catch { /* the process range is already gone */ }
    },
  }
}

/**
 * Mount the X11 provider: validate the session, then install the shared CUA tool.
 * @param ctx - Host context with computer-use, subprocess, agent and tool services.
 * @param config - Validated native configuration.
 */
export async function apply(ctx, config) {
  if (process.platform !== 'linux') {
    throw new Error('The X11 Computer Use provider requires a Linux Host')
  }
  if (!process.env.DISPLAY) {
    throw new Error('DISPLAY is not set; start DSH inside the X11 session you want to control')
  }
  const helperPath = resolve(config.helperPath)
  try {
    await access(helperPath, constants.X_OK)
  } catch {
    throw new Error(`Computer Use helper is missing or not executable: ${helperPath}`)
  }
  installCua(ctx, config, {
    helperPath,
    createChannel,
    guidance: GUIDANCE,
    capabilities: CAPABILITIES,
    permissionParameters: () => ({}),
  })
}

export { CAPABILITIES, Config, GUIDANCE, inject, name }
