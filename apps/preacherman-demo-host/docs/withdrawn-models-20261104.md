# Withdrawn model package cleanup

Remove the 13 GLB files already excluded from Asset, Gallery and Market. Their
runtime registry entries and default-action definitions are retired together.
The 27 currently selectable characters and all their authored resources remain.

`withdrawn-models-20261104.json` records the recovery commit, paths, sizes and
SHA-256 hashes for the 260,112,372 removed bytes. The preferences migration keeps
the historical IDs so old selections still become an empty companion slot in
both appearance modes rather than attempting to load a missing model.

Backend motion metadata and service binaries are unchanged. No source imports,
original model archives, active textures, speech resources or user data are removed.
