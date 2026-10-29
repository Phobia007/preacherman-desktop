# AI Moe desktop import

The ten supplied characters use the existing Preacherman avatar pipeline. Runtime IDs use the `ai-moe-` prefix to keep character identity separate from execution-provider names.

| Name | Runtime ID | Default motion |
| --- | --- | --- |
| DeepSeek | ai-moe-deepseek | Soft breathing |
| Claude | ai-moe-claude | Feminine idle |
| GPT | ai-moe-gpt | Soft breathing |
| Gemini | ai-moe-gemini | Feminine idle |
| GLM | ai-moe-glm | Weight shift |
| Grok | ai-moe-grok | Soft breathing |
| Qwen | ai-moe-qwen | Weight shift |
| Kimi | ai-moe-kimi | Feminine idle |
| MiniMax | ai-moe-minimax | Weight shift |
| Doubao | ai-moe-doubao | Feminine idle |

## Import path

1. Verified rigged sources live in `output/ai-moe-rigged-20261029/ready`. Original Blender files remain unchanged.
2. Each packaged GLB retains its 209-joint skin, embedded textures and assigned looping idle. One scene-root transform normalizes display height to 1.8, grounds the feet and turns the character toward the existing camera. Source and runtime hashes, transforms and clip names are recorded in `avatar-import-ai-moe-20261029.json`.
3. Runtime files, `playback.json`, `character-info.json` and supplied attribution are packaged under `public/assets/avatars/<id>/` in the Demo Host.
4. `avatarCatalog.ts` registers IDs and default actions with the existing renderer. No separate model loader, animation controller or theme filter is introduced.
5. `src/surfaces/asset/characters.json` supplies the transparent selection card, Overview, Appearance and Info Map portrait. Asset's existing hold-to-activate control equips the companion on Home and persists the choice.
6. `galleryModelBindings.ts`, the packaged Gallery CMS catalog, aliases and rail-media map supply Gallery selection and the real model in its detail view. Gallery covers use silent four-second still holds; they do not claim to be character introduction footage.
7. The local service imports the same character catalog. Its incremental build dependency includes this JSON, preserving per-character execution, rules, skills and memory identity for new imports.

## Biography editing

Biographies and source designations intentionally remain empty. Edit the matching entry in `src/surfaces/asset/characters.json` (`designation`, `paragraphs`), the Gallery CMS entry (`description`, `detailMeta`) and `public/assets/avatars/<id>/character-info.json` (`sourceTitle`, `description.en`). Remove `biographyStatus: "pending"` when copy is approved. Visible copy should be English.

Adding a character does not select an AI provider, replace an existing voice assignment or create a cloned voice. Those remain explicit character settings. Original attribution is retained where supplied.

## Delivery

Focused checks cover all ten real skins and clips, framing through a motion cycle, registration, blank biographies, local cover assets and isolated character profiles. The existing light/dark and activation checks also apply. Desktop delivery, rollback and native verification follow `desktop-lightweight-update-contract.md`; the executable and service must be deployed together.
