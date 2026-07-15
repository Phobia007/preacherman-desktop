# Provider Contract Fixtures

The backend provider test exports sanitized JSON fixtures into this directory
and runs:

```bash
npm run contracts:provider
```

HTTP response fixture:

```json
{
  "kind": "http",
  "api_id": "API-003",
  "status": 204,
  "body": null
}
```

Event fixture:

```json
{
  "kind": "event",
  "event": {
    "event_id": "evt_example",
    "stream_id": "task_run:task_run_01",
    "sequence": 1,
    "event_type": "operation.progress",
    "schema_version": 1,
    "resource_type": "task_run",
    "resource_id": "task_run_01",
    "payload": {},
    "occurred_at": "2026-07-15T10:21:32Z"
  }
}
```

Use synthetic IDs and content. Never export credentials, tokens, private source
text, prompts, or user data into provider fixtures.
