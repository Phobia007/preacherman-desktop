# Execution Mode settings

This Settings extension inherits the existing Preacherman Clash Display directory
font, enlarged focus title, transparent pill-outline controls, hidden scrollbars
and frosted companion scene. It does not replace the visual identity or change
startup/navigation. Open Design 0.16.1 installed code informed the two-path
information architecture, not the artwork or stylesheet.

## Supported paths

- API / BYOK: DeepSeek preset, OpenAI Chat Completions, Anthropic Messages,
  and custom public HTTPS gateways using either supported protocol.
- Multiple independently named connections, optional output-token limit,
  optional OpenAI-compatible reasoning_effort override, model discovery and
  manual model IDs. Not every model implements reasoning_effort or tools.
- Test Connection performs a text probe and an optional harmless tool-call
  probe. It can incur provider usage. No returned tool is executed.
- Save & Use requires the exact configuration to have passed its text probe
  within ten minutes. Failure leaves the previous active connection unchanged.
- Local CLI: installed/login state for the existing Codex CLI adapter; model
  and reasoning remain CLI-owned. A host-approved workspace is mandatory.
  Selecting CLI does not execute anything. Task submission creates a proposal;
  explicit approval starts execution under the existing workspace-write policy.
- Local Agents now use persisted, keyboard-accessible selection controls.
  Selecting a ready registered adapter connects it using the host-approved
  workspace; deselecting disconnects it without cancelling existing tasks.
  Adapter metadata owns the displayed model/workspace controls. Workspace edits
  require Save & Use Agent and never rewrite running task snapshots.
- Real discovery scans PATH and common user install locations for Codex CLI,
  Claude Code, Gemini CLI and OpenCode. Native version probes are bounded and
  shell-free. Wrapper files are discovered but not executed. Codex also checks
  LOCALAPPDATA/OpenAI/CodexCLI and the npm native binary when PATH is stale.
  Missing products are not reported as installed. Discovered products without
  execution adapters are labelled accordingly and cannot be connected; their
  login state remains unverified. Codex login uses its public status command.
- Existing Preacherman Native/DeepSeek Harness paths and voice/vision providers
  are not replaced. API chat does not pretend to be the full Native tool loop.

## Data and requests

The local service owns execution-connections.v1.json under its existing data
directory. Keys are never returned by status APIs, persisted in browser storage,
or logged by the new connection transport. Storage is currently a local JSON
file, not encrypted; the UI says this explicitly. Blank keys reuse only the
same saved origin/path and protocol. Switching gateway requires a new key.
The old DeepSeek key is exposed only as a configured/not-configured state and
can be reused without changing legacy provider/voice configuration.

The HTTPS transport resolves public IPv4 addresses and pins an approved address
to the TLS request. It rejects private/link-local destinations, URL credentials,
queries/fragments, plaintext HTTP, and redirects. DNS and request timeouts and a
2 MiB response limit bound outbound work. Local/self-hosted HTTP model endpoints
are intentionally not supported by this first gateway implementation.

New APIs:

- GET /api/settings/execution
- POST /api/settings/execution/models
- POST /api/settings/execution/test
- POST /api/settings/execution/save
- POST /api/settings/execution/local
- POST /api/execution/chat
- POST /api/execution/local-turn

Existing service-origin validation protects the routes. CLI proposals reuse
the existing TaskRun approval/status/cancel endpoints and immutable execution
snapshot. No shell command is accepted from this settings form.

## Task behavior

The authored Gallery iframe requests only sanitized catalogs and sends bounded
messages through its parent. The parent validates message source and origin.
Task sends text to the selected model and stores user/assistant messages locally.
It snapshots an inherited default before first send so later Settings changes
do not silently change existing conversations. Requests already in flight keep
their captured credentials/model. Files remain filename-only local attachments;
their presence blocks model submission until removed, rather than pretending
to upload content. API context is limited to thirty recent text messages,
20,000 characters per message and 80,000 combined. Trimming is disclosed and
does not alter the full local transcript. An unavailable saved model is never
silently replaced. Local CLI configuration remains selectable after switching
the global default back to API.

CLI tasks show approval, rejection, refresh and active-task cancel controls.
Status refresh is explicit, not an indefinite background polling loop.
Leaving a screen does not cancel an already-created server-side task.

## Verification and release

Automated tests use isolated temporary state and injected provider responses;
they do not use real credentials, paid API calls or an actual CLI task.
Provider reachability and model authorization must still be tested by the user
with their own key. Use the standard desktop lightweight deployment contract:
rebuild changed sidecar and frontend, preserve the old executable/sidecar pair,
deploy the canonical shortcut target and cold-launch native verification.

Protocol references:
[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
and the locally inspected Open Design protocol adapters.
