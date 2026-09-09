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

Verified delivery: 2026-09-09T21:38:00.6561550+08:00

- Public assets: 763841026 -> 394268838 bytes (369572188 removed).
- Desktop executable: 617295360 -> 332398592 bytes (284896768 removed).
- Runtime model SHA-256 hashes unchanged; both defaults animate and loop.
- 28 renderer tests and 38 host tests passed; both theme browser/native flows passed.
- No motion-library requests or new console errors; minimize/resume passed.
- Deployed SHA-256: 04FAB5091C0783E65ED49670B93AC86A4B9E329ACB3D3C919DD1715B2B2E6C6B.
- Matching sidecar unchanged: 2465A32CAF878D0D6109C0975E5254F98CC1FA27CC7202FE574F5A367F90902E.
- Normal Home shortcut restarted; temporary verification processes stopped.
