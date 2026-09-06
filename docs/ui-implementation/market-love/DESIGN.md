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

- **Long-page header:** retains the eight category destinations and search, with a fixed host Preacherman logo matching Task's position and font. Clicking opens the four existing profile lines and three links; Escape, the upper close label and outside click close it. The underlying iframe is inert while open; host navigation and native controls remain available. A lightweight circular text reveal is used, not a second Gallery WebGL runtime. Utility/menu/wishlist/bag controls and their orphaned listeners/dialogs are removed. The footer, film and first introduction are absent even after a fresh vendor import.
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
