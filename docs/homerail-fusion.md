# Preacherman × HomeRail fusion

## Product boundary

Preacherman remains the only user-facing authority for goals, proposals, tasks, approvals, Ledger entries, and result presentation. AIRI remains the avatar, voice, and extension layer. HomeRail is a headless executor for complex multi-agent work.

A Preacherman TaskRun is one stable user intent. Each whole-DAG execution is one Attempt on that TaskRun, and its HomeRail Run ID is stored only as an external execution link. A retry creates another Attempt under the same TaskRun. HomeRail retains raw technical evidence; Preacherman projects only understandable milestones, approval records, and artifacts into its Ledger.

The browser calls only the Preacherman local service. HomeRail mutation and approval tokens never enter browser configuration, task data, Ledger data, or client-side requests.

## Fixed workflow

The first controlled workflow is the official `orchestrator-workers@1.2.0` pattern instantiated as:

- workflow ID: `preacherman-complex-task-v1`
- revision: `3`
- compiler: `6`
- canonical SHA-256: `bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee`
- shape: planner → bounded fan-out (maximum 8 items, 4 parallel workers) → independent verifier → terminal result
- required success artifacts: `plan.json` and `verification.json`; failed verification may also publish `verification-failure.json`

The adapter sends the workflow ID, revision, and canonical hash on every create-and-run request. A workflow drift therefore fails closed instead of silently executing a different graph.

The checked-in authoritative workflow is `apps/preacherman-demo-host/config/homerail/preacherman-complex-task-v1.workflow.yaml`. Validate and sync it with HomeRail's official CLI; do not edit the HomeRail database by hand.

## Ownership and code map

| Responsibility | Authority | Implementation |
|---|---|---|
| Task and Attempt state | Preacherman | `server/taskService.mjs`, `server/taskStore.mjs` |
| Simple Plugin/MCP execution | Preacherman | existing local Plugin and MCP runtimes |
| Complex-task routing | Preacherman | `server/execution/executionRouter.mjs` |
| HomeRail transport | Adapter boundary | `server/homerail/homeRailClient.mjs` |
| Run linking and idempotency | Adapter boundary | `server/homerail/homeRailLinkStore.mjs` |
| Run status and technical evidence | HomeRail | HomeRail Manager and Run store |
| Milestone projection and recovery | Preacherman | event projector and reconciler under `server/homerail/` |
| Workflow capability catalog | Adapter boundary | `server/homerail/homeRailCapabilityCatalogAdapter.mjs` |
| Settings/Test diagnostics | Adapter boundary | `server/homerail/homeRailDiagnosticsAdapter.mjs` |
| User-safe Ledger evidence | Preacherman | `server/homerail/homeRailLedgerProjector.mjs` |
| Approval decision | Preacherman | command API and approval adapter |
| Raw artifacts | HomeRail | HomeRail artifact store |
| Artifact index and controlled proxy | Preacherman | artifact adapter and TaskService |

All new server business-state writes go through TaskService. Compatibility routes remain available, but they delegate to the canonical service.

## Configuration

Copy `.env.local.example` to `.env.local` and set only the values required by the local installation:

```env
PREACHERMAN_HOMERAIL_ENABLED=true
PREACHERMAN_HOMERAIL_BASE_URL=http://127.0.0.1:19191
PREACHERMAN_HOMERAIL_DAG_TOKEN=
PREACHERMAN_HOMERAIL_APPROVAL_TOKEN=
PREACHERMAN_HOMERAIL_DEFAULT_WORKFLOW_ID=preacherman-complex-task-v1
PREACHERMAN_HOMERAIL_WORKFLOW_REVISION=3
PREACHERMAN_HOMERAIL_CANONICAL_HASH=bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee
PREACHERMAN_HOMERAIL_PROFILE=my-runtime-profile
PREACHERMAN_HOMERAIL_CONSOLE_URL=http://127.0.0.1:19193
```

Do not commit real tokens. Configure HomeRail model credentials in HomeRail's encrypted database through its CLI or Settings UI; do not copy Preacherman Provider keys into source files.

The configuration script performs a live Responses API probe immediately after HomeRail encrypts the credential. It does not activate the Preacherman profile or write `.env.local` unless that probe succeeds. A rejected newly-created setting is removed on a best-effort basis so an invalid credential cannot become a green configuration state.

For a company model gateway, use a custom provider ID instead of `deepseek`, and pass the gateway's Responses base URL and exact model ID. This prevents a gateway credential from ever being sent to the built-in DeepSeek domain:

```powershell
npm run configure:homerail -- -Provider company-gateway -ResponsesBaseUrl https://gateway.example/v1 -ModelName company-coding-model -AgentType codex_appserver
```

The gateway must implement the OpenAI Responses API used by Codex App Server. A Chat Completions-only endpoint is not sufficient for the strong execution layer.

On Windows, the shortest guarded setup path is the package script below. It prompts for the provider key as a `SecureString`, sends it only to HomeRail CLI stdin, creates a private profile that references the encrypted setting ID, syncs that profile, and updates only the fixed HomeRail values in `.env.local`:

```powershell
cd D:\preacherman\apps\preacherman-demo-host
npm run configure:homerail -- -Provider deepseek -ModelName deepseek-v4-flash
```

Other catalog aliases such as `aliyun`, `glm`, `kimi_cn`, `minimax_cn`, or `xiaomi` can be supplied with the matching `-EndpointId` and `-ModelName`. Use `-AgentType claude-sdk`, `codex_appserver`, or `kimi_code` only when the selected HomeRail endpoint supports that production harness. The script never prints or writes the provider key to `.env.local` or the profile YAML.

If no cloud API key is available, a local LM Studio server can provide the Responses API to Docker actors. Enable **Serve on Local Network**, load a tool-capable model, and verify `http://127.0.0.1:1234/v1/models` before running:

```powershell
npm run configure:homerail -- `
  -Provider lmstudio `
  -ModelName <the exact LM Studio model identifier> `
  -ResponsesBaseUrl http://host.docker.internal:1234/v1 `
  -LocalNoAuth
```

`-LocalNoAuth` is deliberately restricted to loopback or `host.docker.internal`; it cannot silently configure an unauthenticated remote server. When LM Studio authentication is enabled, omit `-LocalNoAuth` and enter its local server token at the secure prompt.

Copy `config/homerail/preacherman-complex-task-v1.profile.yaml.template` to a private path, replace its `model_alias`, select the compatible production harness, then sync it:

```powershell
node homerail_cli/dist/cli.js profile sync D:\private\preacherman-complex.profile.yaml `
  --workflow preacherman-complex-task-v1
```

HomeRail readiness requires:

1. the Manager to be reachable;
2. at least one connected execution Node;
3. the pinned workflow revision to be present;
4. the workflow revision and canonical hash to match the explicit Preacherman pins;
5. `PREACHERMAN_HOMERAIL_PROFILE` to explicitly name a profile attached to that workflow.

The adapter never selects the first available Profile and never follows a newer workflow head automatically. Update the checked-in workflow, both pins, its contract tests, and this document together when intentionally releasing a new revision.

Zero connected Workers while idle is normal: HomeRail dispatches short-lived Worker containers for a Run. The status gate checks connected Nodes, not idle Worker count.

## Startup

Start HomeRail first from its repository:

```powershell
node homerail_cli/dist/cli.js start --ui
node homerail_cli/dist/cli.js --json doctor --docker
node homerail_cli/dist/cli.js profile list --workflow preacherman-complex-task-v1
```

Then start Preacherman:

```powershell
cd D:\preacherman\apps\preacherman-demo-host
npm run dev
```

In Preacherman, use Settings → Connections to inspect the execution service. The advanced-console link opens the standalone HomeRail console; it is intentionally not embedded into the main navigation.

Settings reports connected Nodes and active Workers separately. A Node is the durable scheduling prerequisite; zero Workers while idle is expected because HomeRail creates short-lived Worker containers for a Run. “Test connection & refresh” rechecks the Manager, the sanitized Workflow Catalog, pinned revision/hash, Node capacity, and runtime profile without starting user work. The browser catalog response contains only workflow identity, description, revision/hash, compiler version, and pin status; source paths and YAML are never returned.

## User flow

1. Enter a goal on Home.
2. Review the generated proposal on Work.
3. Confirm once. The router keeps simple Plugin/MCP tasks local and sends complex multi-step work to HomeRail.
4. Use Work for steer, continue input, approve/reject, cancel, or retry.
5. Use Ledger for task history, Attempt history, and artifacts.
6. Use Test → Runtime trace only for technical Task → Attempt → Run diagnostics.

Test → Acceptance owns the single **Run fusion acceptance** action. It uses the same public Preacherman APIs as the product flow, creates a reviewable complex-task Proposal, confirms it twice to prove idempotency, waits for the real HomeRail Run, and validates the required `plan.json` and `verification.json` descriptors. The action remains disabled while the provider is not honestly ready; it never substitutes a simulated Run. Test → Runtime trace shows the pinned workflow revision/hash, Attempts, external Run IDs, pending approval, and the user-safe HomeRail event projection.

There is no HomeRail, Runs, DAG, Agent, or Worker primary navigation item. Actions have one owner: Home owns goal creation, Work owns Task mutation, Ledger owns artifacts, Settings owns execution configuration, and Test owns diagnostics.

## Recovery and failure semantics

- Duplicate confirmation reuses the idempotency link and never creates a second Run.
- HomeRail node retries remain inside the current Attempt; a whole-DAG retry creates a new Attempt under the same parent TaskRun.
- Cancellation is recorded as pending until HomeRail confirms it. An unreachable Manager is never displayed as cancelled.
- On Preacherman startup, the reconciler scans non-terminal HomeRail Attempts and repairs state from HomeRail history.
- A per-Run HomeRail SSE stream is used only as a low-latency wake-up signal. Every signal causes Preacherman to refetch bounded status and event history; raw SSE payloads never enter TaskStore or Ledger. Stream loss falls back to the periodic reconciler automatically.
- Reconciliation failures use per-Run exponential backoff, capped at six consecutive levels and 30 seconds. A successful status/history pass clears the backoff immediately; one unavailable Run never delays another Run.
- Duplicate or out-of-order history events are rejected by stable content fingerprint. Cursor length remains diagnostic only, so an event inserted earlier in history is still discovered without duplicating existing Ledger milestones.
- A required artifact that is missing, failed, oversized, hash-invalid, or media-type-invalid prevents the TaskRun from being reported as succeeded.
- Ready HomeRail artifacts are fetched once into a private Preacherman cache, checked against declared media type, byte size, and SHA-256, and only then exposed through the Preacherman Range endpoint. The browser never downloads unverified upstream bytes directly.
- When Manager, Node, workflow, or profile readiness is missing, the UI displays `configuration-required` or `unreachable`; it never fabricates an Attempt, milestone, artifact, or successful Run.

## Troubleshooting

### Configuration required

Check Settings → Connections, then run:

```powershell
node homerail_cli/dist/cli.js --json runtime status
node homerail_cli/dist/cli.js --json profile list --workflow preacherman-complex-task-v1
node homerail_cli/dist/cli.js --json llm-settings list
node homerail_cli/dist/cli.js --json doctor --docker
```

If the Node is online but no profile exists, configure an actual HomeRail model setting and sync a profile for the fixed workflow. The offline deterministic profile is only valid for workflows whose prompts contain deterministic `HANDOFF` directives; it must not be attached to `orchestrator-workers` to create a false green result.

### Manager unreachable

Confirm `PREACHERMAN_HOMERAIL_BASE_URL`, restart HomeRail, and use Refresh status. Existing active Attempts remain recoverable; do not delete the Preacherman data directory.

### Run remains active after restart

Verify the same `PREACHERMAN_DATA_DIR` is in use, the external Run still exists, and the Manager event-history endpoint is reachable. Restart the Preacherman service to trigger reconciliation, then inspect Test → Runtime trace.

### Artifact unavailable

Inspect the HomeRail Run through the advanced console. Preacherman validates identity, size, media type, Range responses, and SHA-256 before exposing content.

## Rollback

Set `PREACHERMAN_HOMERAIL_ENABLED=false` and restart the Preacherman local service. This disables complex HomeRail routing without removing TaskStore v2 data, HomeRail links, existing Ledger history, or local Plugin/MCP execution. Do not delete HomeRail Runs or Preacherman data as part of a normal rollback.

## Verification

From `apps/preacherman-demo-host`:

```powershell
npm run configure:homerail -- -Provider deepseek -ModelName deepseek-v4-flash # one-time, interactive
npm test
npm run typecheck
npm run build
npm run verify:homerail
git diff --check
```

The focused suite covers TaskStore migration, TaskService authority, routing, client redaction and timeouts, idempotent linking, event projection, command and approval validation, cancellation honesty, recovery, artifact validation/private caching/proxying, action ownership, and HTTP integration. `npm run verify:homerail` performs the real Proposal → duplicate-safe confirmation → Task → Attempt → Run → artifact-digest acceptance flow. Browser acceptance must cover Home, Work, Ledger, Settings, and Test in both light and dark appearances with zero console errors.

## Local acceptance evidence (2026-08-12)

- HomeRail Manager and one Docker-capable Node were reachable.
- `homerail-worker:latest` was present.
- HomeRail's official `public-two-node-template` completed as real Run `12b8b4ec88349fd4822b777d` with 2 dispatches and 2 handoffs, proving Manager → Node → Docker Worker execution.
- The fixed Preacherman workflow remained honestly gated because this machine had zero HomeRail LLM settings and zero attached runtime profiles. No fake fixed-workflow success was recorded.

The fusion can be considered fully production-ready only after an actual model-backed profile is configured and one proposal-confirmed `preacherman-complex-task-v1` Run completes through Preacherman with its projected milestones and artifacts.
