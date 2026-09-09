# Default avatar animations only

The user retired the previously imported 412-action library on 2026-09-09.
This supersedes the retention requirement in the earlier performance plan.

- Remove all nine packaged motion GLBs, the two indexes and source lock.
- Remove their loader, retargeting/cache code, picker, and sync command.
- Cortana keeps idle.catwalk / cortana.idle.catwalk.v1.
- Zima keeps idle.zima / zima.idle.v1.
- Both runtime GLBs, textures and videos remain byte-for-byte unchanged.
- Preserve shared Canvas, bounded model cache, activation persistence,
  Gallery transitions, voice interaction and native minimize/resume behavior.
- Original source assets outside this repository are untouched.

Verification uses both actual shipped skeletons: load the embedded clip, confirm
bone transforms change, advance beyond two loops, and reject retired actions.
The packaged asset audit must report zero imported packs. Browser and native
flows check both appearances and make no motion-library requests.

Deployment measurements and native evidence are recorded after verification.
