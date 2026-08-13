# Preacherman Native Harness profile

This directory is the frozen configuration seam between Preacherman and
DeepSeek Harness. It runs Harness as an ACP JSON-RPC stdio child process and
adds the local Preacherman MCP Gateway to Harness's native tool registry. It
does not start or embed the Harness Web UI.

## Frozen inputs

[`harness-pin.json`](../config/deepseek-harness/preacherman-native/harness-pin.json)
pins the compatible Harness release and the upstream source contracts used to
author this patch. The profile's `package.json` also pins its two non-bundle
plugins to the same exact release. Upgrade the pin, hashes, patch, and contract
test together; a changed upstream config schema is an integration change, not
an automatic dependency update.

For the current Adapter, ship the complete
[`preacherman-native`](../config/deepseek-harness/preacherman-native) asset
directory with Preacherman; its ACP overlay is materialized per run. A future
profile-CLI deployment may copy the same directory to
`$DSH_HOME/profiles/preacherman-native` and install the profile's exact npm
dependencies with the controlled Harness distribution. Do not merge the patch
into the user's global Harness profile.

## Active ACP launch contract

The current `DeepSeekHarnessAdapter` uses the Harness ACP demo bin, not the
Harness profile CLI. Its concrete process shape is:

```text
node <harness>/packages/examples/acp-demo/lib/bin.js
  --config <controlled-run-dir>/preacherman-native.json
```

Before spawn, the host materializes `acp-overlay-template.json` as that JSON
file. The overlay includes the pinned Harness
`examples/acp-agent/cordis.yml`, replaces that leaf's `acp-agent` provider and
model fields, and inserts one `@deepseek-ai/dsh-mcp-client` row. The include
plugin and base config are absolute `file:` URLs resolved from the validated
Harness installation. This is the configuration path the ACP child actually
loads; creating a profile directory alone does not affect `dsh-acp-demo
--config`.

`launch-template.json` describes this exact bin/`--config` invocation. The host
starts it with an argv array and `shell: false`. The UI may select only the
provider, model, workspace, and permission values already admitted by the
Preacherman registries. It must never submit an executable, script path, raw
environment block, or credential.

`package.json` plus `cordis.patch.yml` remain the distributable named-profile
form of the same boundary for a future `dsh --profile preacherman-native`
launcher. They are not the current Adapter launch path and must not be used as
evidence that MCP is active in the current ACP child.

The template deliberately contains only a path to the MCP bootstrap credential:

- `PREACHERMAN_MCP_GATEWAY_URL` must be an HTTP loopback URL returned by the
  running Preacherman service.
- `PREACHERMAN_MCP_GATEWAY_SCRIPT` must resolve to the packaged
  `scripts/preacherman-mcp-gateway.mjs` file.
- `PREACHERMAN_MCP_BOOTSTRAP_FILE` must resolve to the private file created by
  Preacherman. The Harness child passes that path to the gateway child. Neither
  the template nor the Cordis patch contains the file's contents.
- Provider secrets are supplied only through the Adapter's server-side
  credential handling (currently its controlled `DEEPSEEK_API_KEY` child
  environment) or a future Harness managed store. They do not enter either
  template, TaskEvent, Ledger, or browser responses.

The MCP plugin uses `failOnStartupError: true`. A missing/unreadable credential
file, unavailable loopback service, invalid script path, or schema mismatch is
a startup/configuration failure. Do not silently run without the Preacherman
tools and do not fall back to another Agent.

## Validation and known startup gate

Run the focused contract test from `apps/preacherman-demo-host`:

```powershell
node --test tests/deepseek-harness-profile.test.mjs
```

The test validates the profile/patch shape, exact pin and source hashes,
launch-template schema, absence of inline secrets and Web UI flags, and the MCP
row against the pinned Harness `Config` schema. It also materializes and
composes the ACP overlay over the shipped `examples/acp-agent/cordis.yml`,
proving the actual `--config` path contains both the patched ACP app and MCP
row. Set `DEEPSEEK_HARNESS_ROOT` when the source checkout is not at the
development path recorded in the pin.

This asset test does not make a model request. A real ACP `session/new` and
`session/prompt` still require the selected provider/model to be configured in
Harness's credential/settings store. Until that external model configuration
exists, report `configuration-required`; schema/config validation is not proof
that the Native Agent can execute a turn.
