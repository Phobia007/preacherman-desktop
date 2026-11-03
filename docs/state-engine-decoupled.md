# state&engineDecoupled backend integration

Revision 3, 2026-11-04. The user expanded the previous persona-only scope to
long-term memory, forgetting, emotional state, relationships, skill memory and
Info Map. This implementation changes the local backend only. Existing frontend
source, navigation, appearance, voice models and motion remain unchanged.

## Identity and execution boundary

`server/stateEngineDecoupled.mjs` belongs to the existing Demo Host Node sidecar.
It seeds each known character once from `characters.json` and that character's
saved rules. Cortana remains Cortana; no reference-project persona is imported.
Saved identity survives restarts and API/CLI engine changes. Only an explicit,
revision-checked rules update can edit rules. Learning and forgetting cannot
rewrite identity. Blank authored biographies stay blank.

Both character chat adapters receive the same persona snapshot and a bounded
recall context. Provider-private message history is still cleared by an engine
change. Persistent character state is not cleared. The global legacy
`preachermanMemoryPersonaRuntime` is not silently reassigned to a character.

The upstream repository is architectural reference material, not a runtime
dependency. Its archived Python service on port 18848 stays stopped. There is
no new service, model download, embedding model or extra inference request.

## Implemented behavior

| Capability | Behavior |
| --- | --- |
| Long-term memory | Accepted user turns, explicit memories and confirmed spoken reply segments persist per character. Important phrases and reinforced recall promote long-term records. English token and Chinese bigram retrieval supplies at most five excerpts / 2,200 characters to a turn. |
| Automatic forgetting | Default episodic half-life is 30 days; long-term half-life is 90 days. Records older than 180 days with weight below 0.08 are archived and excluded from recall. Fixed memories and persona are protected. Maintenance runs every minute and on accepted turns; recall applies expiry immediately. |
| Emotional evolution | A bounded, deterministic response-style state changes with simple positive/distress cues and decays toward calm with a six-hour half-life. This is a heuristic, not a learned emotion model or a personality rewrite. |
| Relationship | Accepted interactions increment conversation and active-day counts. Rapport has a daily growth limit, persists across engines, and supplies continuity context. Absence does not punish the user. Relationship level is derived from rapport. |
| Skill memory | Explicitly enabled registered plugin tools accumulate successes, failures, proficiency, last TaskRun and suggested review date. Only approved, character-bound terminal TaskRuns count. Retries keep character attribution and require approval. This is execution experience tracking, not model training or automatic new skill generation. |
| Info Map | Character, memory, skill, relationship and emotion nodes; connections; ordered events and cursor pagination. Task result events link to real TaskRun IDs. No fabricated ownership or rights proof (`ownershipProof: false`). |

Recall content is labelled as untrusted observations, separate from authored
instructions. It must not replace identity or be presented as verified fact.
Common credential patterns are redacted before persistence; this is not a
general-purpose sensitive-data classifier.

## Playback and task boundaries

Generated replies stay pending until the client confirms how many characters
were actually spoken. Interrupted, unheard continuation is excluded from recall
and Info Map; after acknowledgement it is removed from the pending text.
Unconfirmed pending replies expire after 24 hours. Turn IDs, acknowledgements
and skill result ingestion are idempotent within documented retention limits.

The unchanged voice controller currently submits the preceding reply's playback
acknowledgement with the next turn. Consequently the last reply of a session is
not automatically treated as heard. A separate `/state/playback` endpoint is
ready for the future controller update; no transcript is rendered in the UI.

Character skill execution uses the existing proposal -> approval -> plugin
TaskRun flow. `/api/agent/turn` accepts an optional `characterId`; when present,
the selected plugin tool must be enabled for that character. Existing frontend
requests without this field remain unbound and do not increase any character's
skill experience. CLI/DAG tasks are not inferred as character skill results.
Chat still cannot claim to execute a tool. A failed skill-state projection does
not change an already completed task into a failed task; the result-ingestion
endpoint can replay that real TaskRun without duplicating experience.

## API contract

All paths below start with `/api/characters/{characterId}/state`. Existing local
service Origin restrictions apply. Inputs are bounded, errors are in English,
and state responses use `Cache-Control: no-store`.

| Path / method | Request or response |
| --- | --- |
| `GET /` | Persona, policy, memory counts, emotion, relationship, skills and runtime status. |
| `PUT /persona` | `{revision, rules: string[]}`; stale revision returns 409. Identity fields cannot be replaced. |
| `PUT /policy` | Any of `enabled`, `halfLifeDays`, `forgetAfterDays`, `minimumWeight`. |
| `GET /memories` | `offset`, `limit` (1-100), `includeForgotten=true`; records and decay weights. |
| `POST /memories` | `{text, pinned?}`; explicit long-term memory. |
| `PUT /memories/{id}` | `{pinned: boolean}`; pinning also restores an archived record. |
| `DELETE /memories/{id}` | Remove the memory text; retain a content-free deletion event. |
| `GET /skills` | Character skill records and available registered plugin tools. |
| `PUT /skills` | `{skillId, enabled}`; qualified registered tool ID is required. |
| `POST /skill-results` | `{taskId}`; server reads and validates its own TaskRun. Client outcome flags are rejected. |
| `POST /playback` | `{sessionId, playback: {replyId, heardCharacters, interrupted}}`. |
| `GET /info-map` | `after` sequence and `limit` (1-100); nodes, edges, events and next cursor. |

Existing TaskRun/ledger endpoints remain the source for full task output; Info
Map stores references, not copies of arbitrary plugin results or credentials.

## Persistence and limits

File: `state-engine-decoupled.v1.json` under the existing service data directory.
Writes are serialized and replaced atomically; reads use an in-process cache.
Invalid storage is reported rather than silently overwritten. Back up this file
with the other existing service data when moving the desktop profile.

Scope is the local desktop profile plus character ID, **not separate signed-in
cloud accounts**. There is no cloud sync or multi-process writer coordination.
Do not point multiple sidecars at the same data file. Account isolation requires
a subsequent explicit migration, not a claim that this local store provides it.

Per character: 600 memories, 1,200 newest events, 600 recent turn receipts,
64 pending replies, 100 skills and 5,000 processed TaskRun IDs. File cap: 16 MiB.
At memory capacity, the weakest unpinned record is removed with a pruning event;
all-pinned capacity produces an error. Info Map includes the newest 100 memory
nodes; the paged memory endpoint provides the full retained set. Event sequence
numbers expose truncation. Skill deduplication capacity fails explicitly rather
than forgetting previously counted TaskRun IDs.

Automatic forgetting is reversible archival, not data erasure. Explicit deletion
removes a memory from this store; it does not erase an active provider session,
existing task artifacts or independent legacy global-memory records.

## Frontend windows to wire later (no changes in this delivery)

| Existing window / controller | Next wiring |
| --- | --- |
| Asset -> Info Map | Replace fixed level and empty area with rapport level, graph, event timeline, memory/task details and pagination. |
| Asset -> Settings -> Memory | Bind the selected character's memories and policy; expose pin, restore, delete and forgetting controls. Do not silently reuse the global memory namespace. |
| Asset -> Settings -> Instructions / Rules | Read/write that character's persistent rules and revision; handle edit conflicts. |
| Asset -> Skills | Replace static example entries with registered tools, enable state, proficiency, review date and real execution history. |
| Task / Gallery task proposal and approval | Carry the selected `characterId` into a proposal and retain the binding when confirming or retrying. Show the actual result reference. |
| Bottom-right voice controller | Post playback acknowledgement on completion, interruption and stop, including the final session reply. No new text UI is required. |

Home, Appearance/Voice, models and Execution Mode need no new visual layout for
this backend integration. Mood and rapport can be presented inside Info Map.

## Focused verification

`tests/state-engine-decoupled.test.mjs` exercises persistence, role isolation,
persona revisions, engine changes, accepted/cancelled turns, partial playback,
deduplication, decay, pinning, credential redaction, corrupt storage and a real
HTTP proposal/approval/plugin TaskRun with state projection. Existing voice and
plugin regressions cover the unchanged integration boundaries. Native release
verification and matching-pair hashes belong in `desktop-build-manifest.json`.
