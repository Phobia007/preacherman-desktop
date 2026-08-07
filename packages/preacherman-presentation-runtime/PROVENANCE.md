# Behavioral provenance

This package is an independent Preacherman implementation informed by the scheduling semantics in `@proj-airi/pipelines-audio` from AIRI `v0.11.3`:

- Repository: <https://github.com/moeru-ai/airi>
- Local reference commit: `dbf812488829a61cc2e95909e021b215704d066c`
- Referenced paths: `packages/pipelines-audio/src/speech-pipeline.ts`, `packages/pipelines-audio/src/timeline.ts`, `packages/pipelines-audio/src/managers/playback-manager.ts`, and their focused tests
- Upstream package license: MIT
- Upstream copyright: Copyright (c) 2024-PRESENT Neko Ayaka
- Upstream license text: <https://github.com/moeru-ai/airi/blob/v0.11.3/LICENSE>

The behaviors adapted are intent/stream correlation, parallel TTS with sequence-ordered playback, cooperative cancellation, and suppression of late results after cancellation. Preacherman renames those concepts around its own `generationId`, `audioStreamId`, and `interactionEpoch` live-interaction contract.

No AIRI source file or dependency is copied or vendored into this package. The MIT source information above is retained as transparent attribution for the behavioral reference, not as a claim that this package contains copied AIRI code.
