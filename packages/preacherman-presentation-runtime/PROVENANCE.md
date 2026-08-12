# Behavioral provenance

This package is an independent Preacherman implementation of the live interaction scheduling contract.

The runtime owns intent and stream correlation, parallel speech synthesis with sequence-ordered playback, cooperative cancellation, and suppression of late results after cancellation. These concepts are expressed through Preacherman's `generationId`, `audioStreamId`, and `interactionEpoch` contract.

No external source file or dependency is copied or vendored into this package.
