# Preacherman Contracts

This package contains the machine-readable HTTP and event contracts for the
Preacherman application. Human-facing product rules remain in
`docs/backend-handoff`.

## Requirements

- Node.js 22.12 or newer
- npm with lockfile support

## Commands

```bash
npm ci
npm run contracts:check
```

Useful focused checks:

```bash
npm run contracts:lint
npm run contracts:bundle
npm run contracts:registry
npm run contracts:http-examples
npm run contracts:event-check
npm run contracts:provider
npm run contracts:compatibility
npm run contracts:secrets
npm run generate:typescript
npm run generated:typecheck
node scripts/check-api-coverage.mjs --report-missing
```

## Registries

- `registry/api-operations.csv` is the reviewable index for all 128 product APIs.
  It binds each API ID to its route, operation ID, interactions, permissions,
  execution behavior, errors, event entry point, and source document.
- `registry/error-codes.yaml` is the stable list of 31 application error codes.
  Frontend behavior must use these codes instead of parsing error messages.
- `registry/event-types.csv` is the stable list of 56 realtime event types and
  the payload schema each event will use.

`check-api-coverage.mjs --report-missing` reports operations that are absent
from OpenAPI and exits with status 0. API-001 through API-128 are specified, so
the product HTTP contract is complete at the current 128-operation boundary.

## Shared HTTP Components

Reusable security, header, pagination, revision, response, identity,
conversation, Task, Artifact, State Lab, Skill lifecycle, State Test, Market,
Installation, Ledger, Upload, Source, and Runtime schemas live in
`openapi/components`. The fixtures in `examples/errors` provide one sanitized,
schema-valid example for every stable error code. Success examples for all 128
specified APIs live in `examples/http` and are suitable for contract tests and
frontend mocks.

Generated files will live under `dist/` and `generated/`. Do not edit generated
files by hand.

## Event Contracts

`registry/event-types.csv` is the reviewable source index for 56 event types.
The payload rules and sanitized samples live in
`scripts/lib/event-definitions.mjs`. Generate and validate every JSON Schema and
fixture with:

```bash
npm run contracts:event-check
```

The gate verifies the common envelope, every event variant, all valid fixtures,
one rejected fixture per family, progress bounds, event type coverage, and the
single-terminal-event stream rule.

## Local Mocking

Start the registry-driven HTTP mock on `127.0.0.1:4010`:

```bash
npm run contracts:bundle
npm run mock:start
```

Start deterministic SSE scenarios on `127.0.0.1:4011`:

```bash
npm run contracts:event-check
npm run mock:sse
```

SSE scenarios use `/events?scenario=normal`, `duplicate`, `resume`,
`disconnect`, or `cursor-expired`. Use `after_sequence=<n>` to exercise replay.
The HTTP mock accepts `?error=VALIDATION_FAILED` and other errors declared by an
operation.

## Generated TypeScript

```bash
npm run generate:typescript
npm run generated:typecheck
```

The deterministic output in `generated/typescript` contains API IDs,
operations, stable errors, event metadata, the common envelope, and the payload
map for all 56 event variants. Frontend code imports generated contracts instead
of copying strings from Markdown.

## Provider And Compatibility Checks

Backend provider tests export sanitized HTTP or event fixtures using the format
in `examples/provider/README.md`, then run:

```bash
npm run contracts:provider
```

To compare against a baseline bundle:

```bash
BASELINE_OPENAPI=/path/to/baseline.yaml npm run contracts:compatibility
```

The compatibility gate rejects removed operations, removed success responses,
and newly required top-level request fields. GitHub Actions obtains the baseline
from the pull request base branch.

## Frontend Integration Boundary

The external UI must be delivered as a React + TypeScript Vite library package
and integrated through `SurfaceSkinAdapter`. It must preserve the existing
`SurfaceManifest -> projection -> registry -> renderer` architecture and route
runtime actions through the host `tauriClient.ts` facade. The normative package,
token, renderer, and runtime boundary is documented in
`../docs/backend-handoff/13-surface-skin-integration.md`.
