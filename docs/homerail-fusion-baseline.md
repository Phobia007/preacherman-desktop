# Preacherman × HomeRail fusion baseline

Captured on 2026-08-11 (Asia/Shanghai) before the fusion implementation.

## Product boundary

- Preacherman remains the only user-facing task, approval, Ledger, Plugin, and MCP authority.
- HomeRail is a headless complex-task execution provider. Its Run is stored as a Preacherman TaskRun attempt; it does not become a second product task.
- AIRI remains the avatar, voice, and extension layer.
- The existing seven primary surfaces remain Home, Work, Gallery, Lab, Ledger, Settings, and Test. The integration must not add a HomeRail/Runs/DAG/Agents primary surface.

## Preacherman baseline

- Branch: `codex/airi-demo-integration`
- Baseline HEAD: `959d0e0` (`docs(demo): verify AIRI ecosystem delivery`)
- Existing dirty user work was recorded before implementation and must not be overwritten. In particular, `apps/preacherman-demo-host/src-tauri/Cargo.lock`, generated Windows service output, and bundled sidecar binaries are outside the fusion change set.
- `npm test`: 245/245 passing.
- `npm run build`: passing. Vite reports only the existing large-chunk advisory.
- Dedicated preview: UI `http://127.0.0.1:1421`, local service `http://127.0.0.1:8788`.
- Browser smoke: Home and Test loaded with all seven primary destinations and persistent window controls. After adding the dedicated preview origin to the local-service and DOM-observation allowlists, the Home browser console reported 0 errors (the existing Three.js `Clock` deprecation warning remains).

## HomeRail baseline

- Repository: `D:\homerail`
- Branch: `main`
- Baseline HEAD: `eb2009e`
- Source working tree: clean before workflow synchronization.
- Manager: `http://127.0.0.1:19191`
- Runtime phase: `M10-pre`
- Connected nodes: 1 (`local-docker-node`, capabilities `docker-cli` and `workspace-artifacts`).
- Connected workers: 0.
- Configured LLM settings: 0.
- Active/waiting runs: 0/0.

The official `orchestrator-workers@1.2.0` pattern was instantiated and synchronized as the fixed integration workflow:

- Workflow ID: `preacherman-complex-task-v1`
- Name: `Preacherman Complex Task`
- Revision: 1
- Compiler: 6
- Canonical SHA-256: `98acde13360a4f0d1c11a9024f238c1fbd2256517d6900d3e1871c70462c90de`
- Limits: 8 work items, 4 parallel workers.
- Shape: planner → bounded data fan-out → independent verifier → success/failure terminal.
- Source marker: `preacherman://integration/orchestrator-workers@1.2.0`

The workflow is valid and revision-pinned, but it is not yet executable because the resident HomeRail instance has neither an LLM setting nor a runtime profile. An idle HomeRail runtime normally has zero connected Workers because Docker Workers are dispatched per Run; the durable scheduling prerequisite is a connected Node. The integration must surface the missing profile as `configuration-required`; it must never claim a run succeeded or fabricate events/artifacts.

After the baseline was captured, the checked-in fixed workflow added required plan and verification artifacts and was synchronized as revision 2. Current revision/hash evidence is maintained in `docs/homerail-fusion.md`; the values above intentionally remain the pre-implementation baseline.

## Phase-0 gate

Phase 1 may build the canonical Preacherman task/attempt model and the HomeRail client against the pinned workflow. A real happy-path acceptance run remains gated on configuring an actual HomeRail provider/profile/worker through Settings → Connections.
