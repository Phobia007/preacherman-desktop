# Asset character media

Cards use transparent waist-up PNGs rendered directly from the existing Gallery models with the project renderer. Authored textures and model files are unchanged. White/studio/photo backgrounds are not part of the UI. Frames and the shared frosted surface remain.

## Detail mapping

| Model | Detail artwork |
| --- | --- |
| cortana | /asset-characters/cutouts/cortana.png |
| zima | /asset-characters/busts/zima.png |
| jubilee-midnight-mutant | /asset-characters/details/jubilee-midnight-mutant.webp |
| halo-mk-v-model | /asset-characters/cutouts/halo-mk-v-model.png |
| kitana-mk11-in-mk9-suit | /asset-characters/cutouts/kitana-mk11-in-mk9-suit.png |
| punk-magik | /asset-characters/details/punk-magik.webp |
| clove-t-pose | /asset-characters/details/clove-t-pose.png |
| nier-automata-2b | /asset-characters/details/nier-automata-2b.png |
| stellar-blade-lily-stargazer-coat | /asset-characters/busts/stellar-blade-lily-stargazer-coat.png |
| iron-man-mark-85 | /asset-characters/busts/iron-man-mark-85.png |
| the-twins-atomic-heart | /asset-characters/cutouts/the-twins-atomic-heart.png |
| spartan-armour-mkv-halo-reach | /asset-characters/cutouts/spartan-armour-mkv-halo-reach.png |
| halloween-the-game-michael-myers-samhain | /asset-characters/cutouts/halloween-the-game-michael-myers-samhain.png |
| apex-legend-pathfinder | /asset-characters/cutouts/apex-legend-pathfinder.png |

## Processing

Built-in imagegen (background-extraction) was used for the seven opaque supplied detail images. Original inputs remain in details/. Existing transparent Jubilee, Magik, Clove and 2B inputs are reused. Zima scene-only artwork is replaced with its Gallery model bust. Lily and Iron Man also use these native model busts.

Render and visual evidence: `D:/preacherman/output/playwright/asset-cutouts-20261006/`. No image API credentials or new dependencies.

## Edit prompts

### Kitana

Background-extraction: remove only Kitana's white background, floor and shadow; preserve face, fan, costume, pose, hair and lighting. Output true transparent PNG without text or a drawn checkerboard.

### the twins

Use case: background-extraction. Edit target: the supplied the twins artwork. Remove ONLY the surrounding background and floor to actual transparent alpha. Keep BOTH silver robots, all extended arms/hands, golden hair, costumes, metal textures and their exact mirrored dancing poses. Preserve original character identity, proportions, pose, design, colors, lighting and every authored detail. No repainting, restyling, additions, text, shadows outside the silhouette, solid background or drawn checkerboard. Output a tightly framed clean transparent PNG character cutout for a premium dark glass character gallery.

### Cortana

Use case: background-extraction. Edit target: the supplied Cortana artwork. Remove ONLY the surrounding background and floor to actual transparent alpha. Keep the exact blue holographic woman's face, hair, visible shoulders and scanline texture; crop away the large empty space on the left so she fills the image. Preserve original character identity, proportions, pose, design, colors, lighting and every authored detail. No repainting, restyling, additions, text, shadows outside the silhouette, solid background or drawn checkerboard. Output a tightly framed clean transparent PNG character cutout for a premium dark glass character gallery.

### Master Chief

Use case: background-extraction. Edit target: the supplied Master Chief artwork. Remove ONLY the surrounding background and floor to actual transparent alpha. Keep the exact green helmet and armored upper torso close-up, including shoulder armor, gold visor, scratches, original perspective and lighting. Do not invent a full body. Preserve original character identity, proportions, pose, design, colors, lighting and every authored detail. No repainting, restyling, additions, text, shadows outside the silhouette, solid background or drawn checkerboard. Output a tightly framed clean transparent PNG character cutout for a premium dark glass character gallery.

### Noble Six

Use case: background-extraction. Edit target: the supplied Noble Six artwork. Remove ONLY the surrounding background and floor to actual transparent alpha. Keep the exact gray Spartan armor, weapon on his back, visor, shoulder shapes, original camera angle and details. Preserve original character identity, proportions, pose, design, colors, lighting and every authored detail. No repainting, restyling, additions, text, shadows outside the silhouette, solid background or drawn checkerboard. Output a tightly framed clean transparent PNG character cutout for a premium dark glass character gallery.

### Michael Myers

Use case: background-extraction. Edit target: the supplied Michael Myers artwork. Remove ONLY the surrounding background and floor to actual transparent alpha. Keep the exact masked man, his face mask, dark jumpsuit, knife and blue rim light. Remove the house, road, rain, mist and all environment. Crop close around the entire visible man. Preserve original character identity, proportions, pose, design, colors, lighting and every authored detail. No repainting, restyling, additions, text, shadows outside the silhouette, solid background or drawn checkerboard. Output a tightly framed clean transparent PNG character cutout for a premium dark glass character gallery.

### Pathfinder

Use case: background-extraction. Edit target: the supplied Pathfinder artwork. Remove ONLY the surrounding background and floor to actual transparent alpha. Keep the exact waving blue robot, raised hand, yellow face screen, mechanical limbs, proportions and pose. Remove the beige paper, splashes and floor shadow. Preserve original character identity, proportions, pose, design, colors, lighting and every authored detail. No repainting, restyling, additions, text, shadows outside the silhouette, solid background or drawn checkerboard. Output a tightly framed clean transparent PNG character cutout for a premium dark glass character gallery.
