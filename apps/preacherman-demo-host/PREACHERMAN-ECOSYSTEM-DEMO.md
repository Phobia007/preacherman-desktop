# PREACHERMAN × Preacherman ecosystem demo

This document is the operator, plugin-author, and demo-presenter handoff for the
local-first PREACHERMAN compatibility layer in Preacherman. The compatibility layer is
host owned: replacing it with a future official PREACHERMAN SDK must not require a
rewrite of the Preacherman UI or local HTTP API.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```powershell
cd D:\preacherman\apps\preacherman-demo-host
npm install
npm run dev
```

Open `http://127.0.0.1:1420`. The UI listens only on `127.0.0.1:1420`; the
private service listens only on `127.0.0.1:8787`. `npm run dev` creates an
isolated development data directory under the repository `.runtime-tmp`
directory. A packaged desktop build uses the current user's private
`.preacherman-demo` directory.

Run all acceptance gates with:

```powershell
npm run check
```

## 16-stage delivery matrix

| Stage | Delivered runnable boundary | Honest external boundary |
| --- | --- | --- |
| 1. External plugin loader | Manifest validation, canonical trusted roots, install/enable/disable/reload/uninstall/recovery | Plugin code is trusted local Node.js, not a sandbox |
| 2. Kits API | Registry, versions, lifecycle, providers/consumers; nine product Kits | Future official PREACHERMAN SDK remains replaceable behind the host API |
| 3. Bindings API | Caller-aware Registry; Task/Ledger/Tools plus six ecosystem Kits and 58 ecosystem operations | Missing/version/ownership/execution failures stay explicit |
| 4. Tools Kit | Static and dynamic register/unregister/list/call, Schema validation, approval and timeout | Dangerous external tools require a one-time approval |
| 5. Task/Ledger | Durable TaskRun states, progress/cancel/retry/recovery, structured artifacts and tool metadata | Plugin arguments are not persisted; argument-bearing retries ask for re-entry |
| 6. Widget Kit | Host placement across six surfaces, declarative safe renderer and lifecycle/permission states | Plugin HTML, script, CSS and global page mutation are rejected |
| 7. Gamelet Kit | Offline tic-tac-toe with start/pause/resume/stop/destroy; TaskRun isolation | Additional games arrive through a registered plugin adapter |
| 8. Provider Kit | DeepSeek chat/models, DashScope ASR/TTS streams and Vision; local Settings | Keys, accounts and upstream networks remain external |
| 9. Voice/Avatar | ASR/TTS/VAD, interruption epochs, four Avatar states and voice→tool→speech test | Microphone and configured DashScope access are required for live audio |
| 10. Memory/Persona | Persona/session/long-term boundaries, scoped recent conversations, audit and redaction | Plugins receive only manifest-granted scopes |
| 11. External connections | Five independent adapters, persistent secret-safe configuration and protocol fixtures | Live Discord/Telegram/YouTube/RCON transports require their runtime and credentials |
| 12. Computer/Vision | Real local DOM observation, scoped reads, one-time write approval/logs, local image/screenshot input | Desktop/camera and remote Vision require a registered adapter |
| 13. Product surfaces | Home, Work, Lab, Gallery, Ledger, Settings and Test with one commercial hierarchy | Unavailable entries remain visibly blocked |
| 14. Observability | Plugin Inspector, persisted IO traces, lifecycle activity and safe diagnostics | Sensitive values are redacted before persistence |
| 15. Complete loop | Input→proposal→approval→tool→TaskRun→artifact→Ledger→cancel/retry/restart | External provider/MCP failures remain real failures |
| 16. Packaging | Production build, first-start state, isolated Windows sidecar and operator/plugin/demo docs | Public Windows distribution still needs code signing |

## Product surface map

| Surface | PREACHERMAN capability groups | Operational entry point |
| --- | --- | --- |
| Home | companion conversation, voice, Avatar state | Companion composer, push-to-talk, speech stop |
| Work | TaskRun approval, MCP/plugin tools, Widget, Gamelet, Computer/Vision | Agent task console and runtime panels |
| Lab | ASR, TTS, VAD, Avatar state, runtime experiments | Voice controls and Avatar stage |
| Gallery | character model, Widget/Gamelet/content discovery | Gallery model and declarative plugin surfaces |
| Ledger | tasks, tool calls, artifacts, Memory/Persona, audit | Ledger tabs and Memory/Persona panel |
| Settings | Provider, MCP, Plugin, external connections, permissions, preferences | Local-service settings panels |
| Test | end-to-end ecosystem diagnostics | One-click health → Kits → MCP → Plugin → TaskRun check |

Every surface retains the PREACHERMAN capability sidebar. A sidebar badge is a runtime
state, not a marketing claim:

- `live` / `ready`: a real UI control and local execution boundary are present.
- `configuration-required`: the adapter exists but required local credentials
  or options have not been supplied.
- `external-runtime-required`: Preacherman has the contract and status UI, but
  a separate program, plugin, device runtime, or third-party service is absent.
- failed tests remain failed and expose a safe error; they never become a
  synthetic success.

## Complete demo script

1. Start `npm run dev` and open **Home**.
2. Type `Run the PREACHERMAN plugin status summary`, or deliver the same sentence as a
   final voice transcript.
3. Review the Agent A proposal and choose **Confirm**.
4. Observe the real TaskRun move through queued/running/completed states.
5. The built-in plugin tool `preacherman-runtime::task_summary` executes through
   the Tools/Task/Ledger binding boundary and produces structured JSON.
6. Open **Ledger** from the completed task. Inspect the tool identity, parameter
   summary, events, result, and `task_summary-result.json` artifact.
7. From **Work**, start the server-authoritative tic-tac-toe Gamelet and exercise
   its lifecycle without cancelling the TaskRun.
8. From **Test**, run the ecosystem diagnostic. Each failed external dependency
   remains visibly failed while later independent checks continue.
9. Stop speech during a running task. Speech playback stops; the TaskRun remains
   active and recoverable.
10. Restart the local service and reload the Ledger. Persisted terminal TaskRuns
    remain terminal; an interrupted active TaskRun is marked honestly retryable.

## Trusted local plugin development

External plugins are trusted local Node.js code. They are not sandboxed and run
with the local service account's filesystem and network permissions. Install
only code that has been reviewed. The Plugin Manager repeats this warning and
requires one-time approval for external tool calls by default.

The default writable trusted root is `<PREACHERMAN_DATA_DIR>/plugins`. Additional
canonical roots must be explicitly listed in `PREACHERMAN_PLUGIN_ROOTS` using
the platform path delimiter. Canonical path checks reject traversal and
symlink/junction escape. A development checkout additionally trusts only its
test-fixture plugin directory, never the whole repository.

A plugin directory contains `plugin.preacherman.json` and one `.mjs` entrypoint:

```json
{
  "apiVersion": "v1",
  "kind": "manifest.plugin.preacherman.local",
  "name": "example-plugin",
  "entrypoints": { "node": "index.mjs" },
  "permissions": ["task:write"],
  "tools": [{ "name": "summarize", "requiresApproval": true }]
}
```

```js
export default {
  abi: "preacherman.plugin.v1",
  version: "1.0.0",
  async activate(context) {
    context.kits.require("task", "^1.0.0");
    context.kits.require("ledger", "^1.0.0");
    return {
      tools: [{
        name: "summarize",
        description: "Return a structured local summary.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
          additionalProperties: false
        },
        async execute({ text }) {
          return { summary: text.slice(0, 120) };
        }
      }],
      async dispose() {}
    };
  }
};
```

The host validates the manifest, trusted canonical root, entrypoint containment
and size, ABI, declared Kits, tool schemas, timeouts, approval context,
lifecycle cleanup, and Binding caller identity. Plugins never receive the raw
Preacherman TaskStore or provider credentials. Widget, Gamelet, Provider,
Connection, Computer/Vision and Memory operations cross host-owned Bindings.

## External dependencies and honest states

| Capability | What is local | What is still external |
| --- | --- | --- |
| DeepSeek chat | credential storage, model test/invoke boundary | DeepSeek key, account and network |
| DashScope ASR/TTS | Provider Runtime streaming sessions and private configuration | DashScope key, Beijing workspace and network |
| MCP | built-in server, stdio manager and settings UI | each configured external MCP command |
| Plugins | trusted-root loader, lifecycle, Kits/Bindings, approval | reviewed plugin code placed in an allowed root |
| Discord / Telegram / YouTube | persistent secret-safe settings, protocol adapters and status UI | credentials and a matching live transport |
| Minecraft / Factorio | persistent RCON settings, protocol adapters and status UI | a running game bridge and live RCON transport |
| Computer/Vision | real local DOM observation, scoped local image/screenshot validation and approval logs | desktop/camera/remote Vision adapter where required |
| Optional providers | catalog and plugin registration boundary | provider-specific credentials/adapters |

Unconfigured external capabilities are intentionally not described as online.

## Windows sidecar and installer

Formal packaging keeps the existing Tauri contract:

```powershell
npm run build:windows
```

For verification without overwriting the repository's existing
`.windows-service-build` or `src-tauri/binaries` directories, select an isolated
output directory:

```powershell
$env:PREACHERMAN_SIDECAR_OUTPUT_DIR = 'D:\preacherman\.runtime-tmp\sidecar-verification'
npm run build:windows-service
```

The packaged Tauri application launches the bundled local service sidecar, so
an installed user does not need a development terminal or a separate Node.js
installation. The current installer is unsigned and can trigger Windows
SmartScreen; public distribution requires code signing.

## Release evidence checklist

- `npm run check` passes.
- A temporary-output Windows sidecar builds and its executable passes a syntax
  and startup health check.
- Home, Work, Lab, Gallery, Ledger, Settings, and Test are checked in light and
  dark appearance in a real Chromium browser.
- The browser console contains zero product errors.
- The complete approved tool → TaskRun → artifact → Ledger flow succeeds.
- Missing credentials/adapters remain `configuration-required` or
  `external-runtime-required`.
- User-owned `Cargo.lock`, `.windows-service-build`, and `src-tauri/binaries`
  changes are not committed.
