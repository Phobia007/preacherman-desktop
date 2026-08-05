# Preacherman A/B Coordination Protocol v1

Status: **draft**

This contract defines the provider-neutral coordination boundary between:

- **A Agent**: the user-facing conversational agent;
- **Orchestrator**: the deterministic owner of task state, policy, and routing;
- **B Agent**: the execution agent that plans and invokes allowed actions.

PrSP remains the source of persona, skill, runtime-mode, and provider-requirement
declarations. This protocol references a validated PrSP contract by logical
reference; it does not embed or replace PrSP.

## Contract messages

- `TaskEnvelope`: A submits a normalized, execution-ready user goal.
- `TaskEvent`: B and the orchestrator report ordered lifecycle events.
- `TaskResult`: B returns facts, artifacts, side effects, and unresolved work.
- `ControlCommand`: A or policy pauses, resumes, steers, cancels, approves, or
  supplies requested input.
- `CapabilityManifest`: an adapter declares its role and supported features.
- `CoordinationError`: a safe, stable, provider-neutral failure projection.

## State model

```text
submitted
  -> accepted
  -> running
  -> waiting_for_input | waiting_for_approval | paused
  -> running
  -> completed | failed | cancelled
```

The orchestrator owns this state machine. A and B may request transitions, but
neither may mutate task state directly.

## Design rules

1. Preserve the raw user wording beside the normalized objective.
2. Reject actions not present in `allowed_actions`.
3. Require explicit approval according to `approval_policy`.
4. Correlate every message by `task_id`; order events by `sequence`.
5. Treat terminal events as final and reject later events.
6. Keep provider request/response payloads outside the core contract.
7. Use logical references instead of local filesystem paths or credentials.
8. Version adapters independently, but require an explicitly supported protocol
   version.

## Non-goals for v1 draft

- provider SDK request or response shapes;
- voice/audio transport details;
- action-library definitions;
- persistence or queue implementation;
- automatic provider selection;
- executable authorization tokens;
- compatibility guarantees before the draft is explicitly frozen.

Run the focused gate from `contracts/`:

```bash
npm run contracts:ab
```
