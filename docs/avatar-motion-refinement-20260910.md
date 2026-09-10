# Avatar lighting and idle refinement — 2026-09-10

The eight imported characters now share Cortana's existing dark cinematic area lights, exposure and blue rim light. The bright studio environment map, ambient fill and frontal directional lights have been removed. Original materials, skin colors, topology, UVs, card assignments, text, video, navigation, activation and both appearance modes are retained. Cortana and Zima assets are unchanged.

## Selected motion library

Six stationary motion sources were selected from the retained 2,858-action classified library. Only one tailored clip per character is embedded in the application; the complete archive remains outside the packaged assets.

| Card | Character | Source motion | Adaptation |
| --- | --- | --- | --- |
| 3 | Jubilee | Female locomotion idle | Relaxed weight-bearing stance, coat clearance |
| 4 | Halo MK V | Male locomotion idle | Reduced hip motion and armor clearance |
| 5 | Magik Soul Surfer | Weight shift | Relaxed shift with both feet planted |
| 6 | Punk Magik | Standard idle | Restrained upright stance and shoulder armor clearance |
| 7 | Sanhua | Breathing idle | Small hip movement, relaxed wrists and skirt clearance |
| 8 | Black Cat | Female locomotion idle | Relaxed stance adjusted to proportions |
| 9 | Clove | Neutral idle | Asymmetric, casual stance fitted to the jacket |
| 10 | Black Widow | Breathing idle | Grounded stance with moderate breathing |

Seven authored rigs are retained. Sanhua's prepared rig is retained with new regional shoulder, arm, neck and hip weights. Vertex positions, topology and materials are unchanged. Vertices previously influenced by up to 53 bones now use at most four normalized influences, previewed using the same linear skinning as Three.js. Face and hair attachments remain separate. Sanhua's existing rest finger pose is retained so the approximate finger rig does not distort the gloves.

Retargeting preserves bone lengths and shoe pitch, solves planted feet using each target's leg lengths, adjusts arm clearance and blends the last 14 source frames into the first pose. Identical first/last values eliminate loop jumps. Fixed animation channels are baked into node transforms, leaving 22–53 animated channels per character instead of hundreds or thousands. This does not alter inverse bind matrices or require a runtime animation library.

Loading status follows the last model that actually rendered, including a transient A → B → A selection while the shared Canvas retains A. Stale completion/error callbacks are ignored. Updating host callbacks reuses the current animation adapter instead of decoding the same model again.

## Source and verification

Source: `D:/preacherman/asset-library/digital-humans/assets/classified-actions/v1/source/Cortana_Action_Library.zip`, idle batches 001 and 002. Exact source action names, exported hashes and numerical checks are in [avatar-motion-refinement-20260910.json](avatar-motion-refinement-20260910.json).

Editable corrected masters and preparation scripts are retained under `D:/preacherman/output/avatar-motion-lighting-20260910/ready` and its parent directory. Original archives, cleaned models and the previous prepared masters remain available for recovery.

Regression checks exercise every packaged GLB and its actual runtime profile for two loops, verify embedded textures, bounded size and clip count, and measure Sanhua's deformed mesh edges and normalized skin weights throughout playback. Browser and native verification cover every character in both appearances, shared Canvas, forward/back navigation, activation, normal Home startup, Task, Gallery, Market/Ledger, Settings and Account. Canonical desktop deployment status is recorded in `apps/preacherman-demo-host/desktop-build-manifest.json`.
