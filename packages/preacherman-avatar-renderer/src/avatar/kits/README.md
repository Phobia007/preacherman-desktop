# Character packs, 2026-10-08

Imported from the user's Pathfinder Screen Expressions and Kitana Preacherman
Character Pack archives. These controllers accompany their calibrated GLBs;
they must not be used with the older single-clip models.

- Pathfinder: 9 body clips, 12 existing atlas expressions, planted feet and
  randomized idle events; three speech variants follow live speaking state.
- Kitana: 19 body/head clips, 6 recorded facial expressions, planted feet,
  hand contact and layered head motion. The recorded facial layer owns the jaw
  and uses actual audio energy, so the generic jaw offset is bypassed.

The host's existing conversation state drives both controllers. Kitana listens
attentively and uses the recorded curious expression while thinking. No new AI
provider or interpretation of assistant text is introduced. The package APIs
remain available for explicit expression selection.

Source checksums, model manifests, provenance and license notices are preserved
under each public avatar's `character-pack` directory. All extracted runtime
files were verified against the supplied checksums before copying. Authoring
Blender files and raw motion captures are not packaged with the application.

Integration adaptations: declaration imports point to local contract types;
Kitana disposal closes decoded ImageBitmaps alongside exclusive GPU resources.
Model parsing uses the application's bounded source-byte cache. Authored rigs,
textures, recorded motion curves and expression-atlas pixels are unchanged.
