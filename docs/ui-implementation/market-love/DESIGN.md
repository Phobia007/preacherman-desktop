---
name: Preacherman Market — Cartier LOVE
description: Surface-scoped record of the complete local LOVE experience on the persistent Preacherman scene.
colors:
  market-text: "#ffffff"
  market-muted: "rgb(255 255 255 / 68%)"
  market-border: "rgb(255 255 255 / 28%)"
  market-control: "rgb(0 0 0 / 72%)"
  market-hover: "rgb(255 255 255 / 18%)"
  market-loading: "#d7e6ef"
  market-error: "#ffb3b3"
  market-ink-shadow: "rgb(0 0 0 / 95%)"
  paper: "transparent"
typography:
  title:
    fontFamily: "Brilliant Cut, sans-serif"
    fontWeight: 400
  body:
    fontFamily: "Fancy Cut, serif"
    fontWeight: 400
  navigation:
    fontFamily: "Brilliant Cut, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "1.5px"
  search:
    fontFamily: "Brilliant Cut, sans-serif"
    fontSize: "14px"
components:
  navigation-link:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.market-text}"
    typography: "{typography.navigation}"
    padding: "12px 0"
  search-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.market-text}"
    typography: "{typography.search}"
    padding: "12px"
  recovery-button:
    backgroundColor: "{colors.market-control}"
    textColor: "{colors.market-text}"
    padding: "10px 20px"
  recovery-button-hover:
    backgroundColor: "{colors.market-hover}"
    textColor: "{colors.market-text}"
---

# Design System: Preacherman Market — Cartier LOVE

## Overview

**Creative North Star: "Complete Cartier LOVE on the Preacherman stage"**

Mode: **Experience**. This document applies only to the user-visible Market surface and its imported LOVE documents. It records the user's pinned migration, not a new Preacherman brand or a root design system.

The five Cartier image/text sections and START DESIGNING configurator retain their composition, fonts, photography and five-step interaction. The user-requested removals are the opening film, first introductory heading/copy/CTA, utility links, four utility icons and entire footer. The entry logo is now Task's Preacherman signature with the existing four-line profile and three destinations. The category row is retained and fixed below it. White page and world backings remain transparent; pale pixels inside photographs and authored jewelry assets remain intact.

**Key Characteristics:**

- Five donor image/text sections, original configurator and retained local search.
- Original Brilliant Cut and Fancy Cut typography, geometry and motion.
- Transparent document and 3D backings over the existing companion scene.
- Packaged local assets and a Market-only iframe lifecycle.

Source authority: `apps/preacherman-demo-host/src/surfaces/market/`, `public/market-love/` and `scripts/import-market-love.mjs` under the Demo Host. The user-visible **Market** navigation maps to the legacy internal `ledger` surface; `App.tsx` and `AppShell.tsx` are authoritative where older `PRODUCT.md` navigation differs.

## Colors

The neutral interface uses white ink with translucent controls and borders. The frontmatter extracts actual Market values; `src/styles.css` remains their runtime source of truth through `--demo-theme-market-*`.

Both light and dark appearances deliberately define the same Market ink values to honor the white-text brief over the shared scene. Primary text, icons and focus use Market text; secondary text and placeholders use Market muted. Borders, hover, control, loading and error treatments have separate semantic roles. The host preferences still set `html[data-appearance]`, and the shell exposes its appearance to the imported documents.

The embed adapter copies the Market properties into the iframe and observes shell appearance changes. Its stylesheet also enters the configurator's shadow root. Document, section, dialog and white utility backings are transparent; selected-option fills use the translucent hover treatment. Monochrome SVG fills and strokes follow white ink, and Cartier logo images receive a white filter.

**The Backing Boundary Rule.** Remove page and world backings; preserve colors baked into photos, videos, textures and jewelry materials.

## Typography

Native canvas compatibility: the child document synchronizes its actual `color-scheme` with the host before content paints. CSS transparency alone does not prevent Chromium/WebView from supplying an opaque canvas when those schemes differ. This is a compositing requirement, not a change to the user-pinned white ink or underlying scene.

Brilliant Cut supplies the donor interface, headings, navigation and controls. Fancy Cut supplies the serif introductory and descriptive copy. The import contains `BrilliantCutPro-Regular.woff2`, `BrilliantCutPro-Medium.woff2` and `FancyCutPro-Regular.woff2`; these remain local assets. The embed stylesheet does not replace font families, sizes or donor layout rules.

The donor's existing responsive hierarchy remains authoritative. For example, navigation uses the frontmatter's desktop role; the local mobile rules set the hero heading to 20px, section headings to 19px and descriptive copy to 15px. These are existing donor rules, not a new typography scale.

The host profile alone reuses Task's packaged Brother Signature wordmark (38px at the 1800px stage) and ABC Diatype profile font. The original four lines and Instagram/LinkedIn/mail destinations are preserved verbatim. Other content keeps Brilliant Cut and Fancy Cut; the small host loading/error status keeps the primary host font.

## Layout

The fixed host logo is centered at x=900, top=48px on the existing 1800px stage, matching Task. Its 44px hit target is followed by a 20px gap before the iframe/category row at y=112px. The imported document owns wheel scrolling with its scrollbar hidden; the category header remains sticky at frame y=0. The sequence is categories, style, material, diamonds, finish, closure. Each of the five sections retains its local START DESIGNING link. The configurator keeps its original 116px host inset and is otherwise unchanged.

The full eight-link category row and search remain at desktop widths. At document widths below 1024px the retained categories wrap, without a now-removed menu control; section responsive rules below 768px stay intact. The host continues scaling its fixed 1800px stage rather than introducing a new responsive layout. Descriptive copy keeps its 520px maximum. The 3D configurator retains its own layout and responsive rules.

The iframe mounts only while Market is active and unmounts on departure. The persistent companion scene remains mounted behind it; this surface does not create a replacement host scene or preload a hidden configurator. Root navigation, desktop controls, Gallery and the normal Home startup flow remain in their existing roles.

## Elevation & Depth

Depth comes from the existing Preacherman scene, the donor's jewelry rendering and retained media. The import removes four screen-space shader backings and the solid white environment sphere, while retaining the jewelry, EXR lighting, animation uniforms and clocks. Floor shadow and gold-caustic planes use coverage alpha so their otherwise empty pixels remain transparent.

White sticky-header text has a small dark text shadow, and header icons and the logo have matching drop shadows for readability as pale original media scrolls beneath them. The donor dialog backdrop keeps its dark scrim and blur. Existing donor button shadows remain; this migration adds no card or panel system.

## Shapes

Preserve the donor's shapes: square primary buttons, underlined text actions and fields, thin navigation underlines, outline icons. Existing interactive target sizing remains, including 44px minimum targets for primary actions and utility controls. The embed adaptation introduces no new corner-radius scale.

## Components

- **Long-page header:** retains the eight category destinations and search, with a fixed host Preacherman logo matching Task's position and font. Clicking opens the four existing profile lines and three links inside Task's actual spatial lens; Escape, the upper close label and a click outside the circular horizon close it. The underlying iframe is inert until the closing motion finishes; host navigation and native controls remain available. Utility/menu/wishlist/bag controls and their orphaned listeners/dialogs are removed. The footer, film and first introduction are absent even after a fresh vendor import.
- **Task spatial lens:** `scripts/extract-task-profile-lens.mjs` extracts the original Task shader, custom cubic curve and controls from its packaged bundle. The 850ms opening, 650ms closing, gravitational pull, squash, orbit, chromatic sampling and subtle breath retain the original math. Only three black alpha expressions change so the persistent companion remains visible through the horizon. Each opening samples the current Market image/text viewport into a local canvas; the ring refracts these actual photos and text, so its colors depend on the current scroll position. No fixed ring image, screen-capture permission or external capture service is involved. Text reveals at 200ms with 75ms line staggering and completes independently of the lens opening. The close label uses semantic ink shadow over pale refraction.
- **Lens lifecycle and budget:** one temporary WebGL pass at stage resolution/DPR 1, only while open or transitioning. Close/unmount cancels animation and disposes texture, geometry, material, renderer and context; interrupted transitions reuse the one controller. Asset preparation is abortable with a 5-second deadline. A hidden document pauses rendering; reduced motion settles directly and disables idle breath. The iframe stays mounted at the same scroll position and reappears when closing reaches zero. This imports only Task's postprocess, not its Gallery/card/ambient-object runtime.
- **START DESIGNING:** opens the packaged configurator document in the same iframe. The original style, material, diamonds, finish and closure steps, bracelet manipulation, transitions and summary remain intact. Primary-button hover replaces the donor's opaque white fill with Market hover and its semantic border, retaining the original timing, font and shape so white text remains readable.
- **Configurator storage and return:** the local adapter and its isolated `preacherman.market.love.saved` data are unchanged. Close returns to the long page. The removed header wishlist/bag buttons and dialogs no longer provide entry points; existing saved data is not deleted.
- **Readiness and recovery:** the host displays Opening Market, with a bounded 30-second deadline and an error/retry state. It accepts messages only from its current iframe and origin. The configurator becomes ready after its own readiness event and the shadow-root embed stylesheet load; it remains hidden while that stylesheet is pending. Retry is recovery UI, not an acceptable substitute for a working first entry.
- **Lifecycle:** host unmount clears its deadline and message listener. The embed adapter clears its timers and disconnects its appearance observer on page hide; removing the iframe disposes of the donor document and its rendering context.
- **Packaging:** the reproducible importer copies the complete local experience under `public/market-love`, records 143 asset hashes in `import-manifest.json`, and applies guarded backing and storage substitutions. The integration uses packaged paths, with no runtime HTTP asset service. Existing external Cartier navigation links do not serve the packaged UI.

Verification checkpoint, 2026-09-06: the coordinating implementation task reports passing source tests and the browser workflow through design, save to wishlist, return and reopen; the authored-file design detector returned `[]`. Independent review findings for white-header readability over pale media, opaque shader-floor alpha and black SVG strokes were resolved in the source. Documentation review also caught the primary-button white hover fill; its semantic hover override is present. This documenter did not rerun browsers or builds. Native production deployment and desktop-shortcut verification were pending when this record was written; consult the [desktop build manifest](../../../apps/preacherman-demo-host/desktop-build-manifest.json) for the subsequent deployment and verification status. Browser verification does not satisfy the required desktop delivery contract.

## Do's and Don'ts

- Do preserve the five donor sections and configurator, except explicit header/content removals. Keep Task's existing identity for the host profile only.
- Do keep Market appearance properties semantic and synchronized with host preferences.
- Do preserve the persistent Preacherman model and base behind transparent backing areas.
- Do verify the changed flow in both appearances and complete the required native shortcut delivery before declaring the implementation delivered.
- Don't recolor pale pixels baked into photographs, videos or authored jewelry assets.
- Don't replace this import with a shortened landing page or a newly designed configurator.
- Don't apply this surface's fonts or palette to the root shell or Gallery.
- Don't introduce a runtime local HTTP dependency for packaged UI assets.

The adjacent `.impeccable/design.json` contains limited static samples of existing controls. It is an extension of this surface record and does not reproduce the live iframe or 3D application.

### Search implementation addendum — 2026-10-01

This supplement records the implemented Search category within the established Market surface. It does not replace the earlier historical record or introduce a new visual system. Source authority is `MarketSearch.tsx`, `market-search.css`, `marketSearchData.ts`, `MarketSurface.tsx`, `marketEntrance.ts`, and the shared frost rules in `market-surface.css`.

- **Geometry and type:** Search inherits the host's fixed desktop stage and scaling. Its scrollable content starts below the header (160px). The centered field is a wide pill (maximum 880px, minimum height 84px, 1px semantic border); once a query resolves, it moves to 32px below the content area's top. The field uses Market Brilliant Cut (24px, regular), with a muted search icon and circular clear/submit controls (44px). Result names use uppercase Market Brilliant Cut (24px, weight 600); descriptions and underlined Details actions use Market Fancy Cut (18px). The existing narrow-width rules reduce field and copy sizing.
- **Continuous backdrop and entrance:** One full-stage frost layer supplies the semantic glass backing and blur (12px). A single clip-path reveals that continuous layer from opposite outer edges toward the center over the existing panel duration (760ms); the outgoing transition reverses it. There are no independently filtered left/right halves. Search content remains hidden during its category entrance and fades in afterward (380ms), when the category reaches its idle state.
- **Live model matching:** The catalog is read from the authored Discover cards after their ready handshake, retaining their model identifiers, names, images, and summaries. Search includes only identifiers present in the Gallery bindings. Typing updates results after a short delay (180ms), with composition input allowed to finish first. Matching normalizes case and spacing, searches name, identifier, and summary for every query word, and places exact name matches first. An empty query leaves the central field without result rows; an unmatched query displays the authored empty-state message.
- **Alternating results:** Results use two equal columns with a square image beside centered copy; every second row puts the image on the right. Both the image and Details action open the existing host-owned model Details flow. Query changes briefly fade existing results (140ms); replacement rows reveal with a small upward movement and stagger. Images fade in when loaded, with a semantic error message if unavailable. Closing Details restores focus to the invoking Search control.
- **Local history:** History records a nonempty submitted query or the current query when a result opens. Typing alone does not save entries. Up to 12 normalized, deduplicated queries are stored most-recent-first in `preacherman.market.searchHistory`. Focusing the field shows matching history beneath it; each entry can be reused or deleted individually. Arrow keys move among query entries, Escape returns to the field, and failed persistence displays an inline status.
- **Profile and appearance:** The existing Market profile selects the Search capture source while Search is active and the Details capture source while a model is open. Search is inert during category transitions, Details, and the profile/lens interaction. Text, muted content, borders, controls, hover, focus, glass, image placeholders, and errors use the existing `--demo-theme-market-*` roles, inheriting the application's light/dark appearance contract. Reduced motion removes Search transitions and animations and settles the shared entrance directly.

This is a source-derived design record, not a browser or native verification report. Delivery and verification status belong in the desktop build manifest.

### Search previews and category navigation addendum — 2026-10-01

This supplement records the current category navigation and Search preview strip within the established Market design. Source authority is `MarketSearchPromos.tsx`, `market-search-promos.css`, `MarketSearch.tsx`, `MarketSurface.tsx`, `marketEntrance.ts`, and `market-surface.css`.

- **Category order and feedback:** The row reads Discover, Browse, Sell, Inventory, then Search, with a thin semantic divider before Search. One underline tracks the requested destination as soon as a category click is accepted, moving and resizing over 380ms while the existing content exit/entrance sequence continues. The selected text updates at the same time; subsequent category clicks remain disabled during that sequence. Reduced motion makes the underline change immediate.
- **Three reserved preview slots:** Above the empty Search field, three equal cards use the requested Task Featured-inspired horizontal transport. The strip has 52px side insets, 64px gaps, rounded corners (14px), and a maximum height of 360px on the existing desktop stage. Each card pairs a cropped model image with its name and an arrow in a translucent caption. Narrow-width rules reduce the insets, gaps, and caption sizing. Current content is the first three entries in the Discover-derived catalog filtered by Gallery bindings. These existing model images are placeholders for future campaign assets; they do not establish popularity or ranking, and campaign assets have not been supplied.
- **Cycling and Search interaction:** A 4.8-second timer advances the strip horizontally by one card plus its gap, with each movement lasting 1.1 seconds. Recycling maintains the repeating order. Choosing a preview submits that model's name through the existing Search flow. Once a nonempty query resolves, the strip fades out and becomes inert; clearing the query restores it above the empty field.
- **Motion and appearance:** Cycling pauses on hover, keyboard focus, the explicit pause control, offscreen visibility, or a hidden document. It also stops while Search is inactive or unavailable for interaction. Reduced motion leaves a static strip and hides the unnecessary pause control. Card backings, captions, text, icons, borders, hover, focus, and image-error feedback inherit the existing semantic Market theme roles for light and dark appearance. Authored model images retain their original colors.

This source-derived record makes no browser, native verification, or deployment claim; those results belong in the desktop build manifest.

### Original Task Featured cards in Search — 2026-10-01

This addendum supersedes the earlier Search preview rendering, geometry, and transport description. The established Search flow and category navigation remain in scope as previously recorded: Discover, Browse, Sell, Inventory, then Search, with the requested destination's underline responding while the content transition continues.

- **Original curved rendering:** Search now reuses Task Featured's extracted vertex and fragment shaders, perspective-camera settings, 24-by-24 plane tessellation, and authored sheet, lighting, corner, and hover math. `extract-task-featured-card.mjs` records those inputs from the packaged Task bundle; `TaskFeaturedCards.ts` hosts them within Search. The strip spans the stage width above the empty field, with a maximum height of 460px. Its wide cards retain the Task frame proportions (16:9), gap (10px), and rounded corners (20px).
- **Pictures and names:** The first three Gallery-bound Discover models continue to reserve future campaign slots. Current model pictures fit within the wide card texture, with each image's own empty edge extended across the remaining width. Model names sit at the bottom left in Market Brilliant Cut and are rendered on the same curved sheet. These are placeholder images, with no popularity or ranking claim; future campaign assets have not been supplied.
- **Continuous transport:** Repeated cards travel right to left at a constant 48 stage pixels per second and wrap continuously. Hover retains the card's authored visual response while travel continues. Focusing a card or using the explicit pause control stops travel; leaving the visible area, hiding the document, or making Search inactive also stops it. Reduced motion leaves the cards stationary and removes entrance fades. Card hit targets follow their positions, and offscreen targets leave the tab order.
- **Search and appearance:** Selecting a card continues to submit its model name through Search. The preview strip disappears and becomes inert when a nonempty query resolves, returning when the query clears. Labels, focus, loading/error status, and pause-control states use existing semantic Market appearance roles; labels refresh when the light/dark preference changes. The authored model images retain their colors. Preview loading failure leaves the Search field available and presents an inline status.

Source authority: `MarketSearchPromos.tsx`, `TaskFeaturedCards.ts`, `market-search-promos.css`, and `scripts/extract-task-featured-card.mjs`. This is a source-derived record and makes no browser, native verification, or deployment claim.

### Search ribbon dragging adjustment — 2026-10-01

The visible pause control is removed. Horizontal pointer displacement now offsets the curved ribbon's automatic clock in scaled stage coordinates, while its right-to-left travel continues at 48 stage pixels per second during a pointer hold and after release. Pointer capture belongs to the strip, keeping dragging continuous across moving cards and handling release outside its bounds. A drag release does not activate Search; an ordinary card click or keyboard activation still submits that model's name. Only keyboard-visible card focus pauses automatic travel; hover and pointer interaction keep it running. Existing offscreen, hidden-document, inactive-Search, and reduced-motion stops remain. Reduced motion disables automatic travel while preserving direct dragging. The established card rendering, Search behavior, category navigation, and semantic appearance roles otherwise remain as previously recorded. This paragraph describes source behavior in `featuredDrag.ts`, `TaskFeaturedCards.ts`, and `MarketSearchPromos.tsx`; it makes no verification or deployment claim.

### Rapid category navigation adjustment — 2026-10-01

Discover, Browse, Sell, Inventory, and Search now remain selectable during category transitions. The selected text and underline immediately follow the latest requested destination. The latest click determines the final category; clicking the outgoing category reverses toward it. Changing a pending destination during exit does not restart that exit animation.

Category transitions use a separate motion path with at most 420ms per exit or entrance leg. An interrupted transition resumes from the frost layer's computed clip and the visible Discover columns' computed transforms, with duration scaled to the remaining distance (minimum 100ms). Host frost and iframe columns use their respective document timeline origins. The existing whole-Market entrance, model Details timings, continuous frost backing, and reduced-motion behavior remain unchanged. This supersedes the earlier description that category buttons were disabled throughout category transitions.

The implementation task reports 60 focused tests and the type check passing. Combined browser verification and native delivery remain pending. Verify rapid cross-category clicks and reversal to the outgoing category in both appearances, including entry after time spent on another route and reduced motion. Confirm the final content and underline match the latest choice, transitions do not visibly jump or stall, Search remains interactive afterward, and the console is clear; then complete the required cold-launch desktop delivery checks.
