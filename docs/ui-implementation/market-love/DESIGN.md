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

The local Cartier long page and START DESIGNING configurator retain their composition, fonts, navigation, hero films, photography and five-step interaction. At the user's request, the entire site footer is removed: its three link columns, footer logo, divider, locale and copyright. No replacement footer is introduced. White page and world backings become transparent; interface text and monochrome marks become white over the persistent Preacherman model and base. Pale pixels inside photographs, videos and authored jewelry assets remain intact.

**Key Characteristics:**

- Complete donor experience, including its local search, wishlist and bag dialogs.
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

Preacherman's primary Clash Display and the Gallery secondary font remain outside this surface's typography contract. The small host loading/error status uses the existing primary host font.

## Layout

The host provides a transparent, borderless iframe beginning below its persistent controls (top inset: 116px). The imported document owns its own scrolling and layout. The sequence is header, hero film and introduction, style, material, diamonds, finish, then closure. Removing the footer also removes its Find Your LOVE link; the seven other local links to `love-configurator.html` remain available across the page and dialogs.

The donor header is sticky within the document. Its full navigation remains at desktop widths, with the existing menu treatment below 1024px; further content changes occur below 768px. Header content retains its 1440px maximum and descriptive copy its 520px maximum. The 3D configurator retains its own layout and responsive rules.

The iframe mounts only while Market is active and unmounts on departure. The persistent companion scene remains mounted behind it; this surface does not create a replacement host scene or preload a hidden configurator. Root navigation, desktop controls, Gallery and the normal Home startup flow remain in their existing roles.

## Elevation & Depth

Depth comes from the existing Preacherman scene, the donor's jewelry rendering and retained media. The import removes four screen-space shader backings and the solid white environment sphere, while retaining the jewelry, EXR lighting, animation uniforms and clocks. Floor shadow and gold-caustic planes use coverage alpha so their otherwise empty pixels remain transparent.

White sticky-header text has a small dark text shadow, and header icons and the logo have matching drop shadows for readability as pale original media scrolls beneath them. The donor dialog backdrop keeps its dark scrim and blur. Existing donor button and film-control shadows remain; this migration adds no card or panel system.

## Shapes

Preserve the donor's shapes: square primary buttons, underlined text actions and fields, thin navigation underlines, outline icons, and a circular film control. Existing interactive target sizing remains, including 44px minimum targets for primary actions and utility controls. The embed adaptation introduces no new corner-radius scale.

## Components

- **Long-page header:** retains Cartier navigation and external destinations, local search, wishlist and bag controls, sticky behavior and its logo. The mobile menu and film play/pause control retain their original interactions. The footer is absent from the document, including after a fresh vendor import.
- **START DESIGNING:** opens the packaged configurator document in the same iframe. The original style, material, diamonds, finish and closure steps, bracelet manipulation, transitions and summary remain intact. Primary-button hover replaces the donor's opaque white fill with Market hover and its semantic border, retaining the original timing, font and shape so white text remains readable.
- **Wishlist and return:** the local adapter saves the summary and configurator hash to `preacherman.market.love.saved`. Close returns to the long page; My Wishlist opens the saved summary and View my selection reopens its configuration. Storage failures retain the donor's honest failure message.
- **Readiness and recovery:** the host displays Opening Market, with a bounded 30-second deadline and an error/retry state. It accepts messages only from its current iframe and origin. The configurator becomes ready after its own readiness event and the shadow-root embed stylesheet load; it remains hidden while that stylesheet is pending. Retry is recovery UI, not an acceptable substitute for a working first entry.
- **Lifecycle:** host unmount clears its deadline and message listener. The embed adapter clears its timers and disconnects its appearance observer on page hide; removing the iframe disposes of the donor document and its rendering context.
- **Packaging:** the reproducible importer copies the complete local experience under `public/market-love`, records 143 asset hashes in `import-manifest.json`, and applies guarded backing and storage substitutions. The integration uses packaged paths, with no runtime HTTP asset service. Existing external Cartier navigation links do not serve the packaged UI.

Verification checkpoint, 2026-09-06: the coordinating implementation task reports passing source tests and the browser workflow through design, save to wishlist, return and reopen; the authored-file design detector returned `[]`. Independent review findings for white-header readability over pale media, opaque shader-floor alpha and black SVG strokes were resolved in the source. Documentation review also caught the primary-button white hover fill; its semantic hover override is present. This documenter did not rerun browsers or builds. Native production deployment and desktop-shortcut verification were pending when this record was written; consult the [desktop build manifest](../../../apps/preacherman-demo-host/desktop-build-manifest.json) for the subsequent deployment and verification status. Browser verification does not satisfy the required desktop delivery contract.

## Do's and Don'ts

- Do preserve the donor page except its explicitly removed footer, plus the configurator, local assets, fonts, motion and interactions.
- Do keep Market appearance properties semantic and synchronized with host preferences.
- Do preserve the persistent Preacherman model and base behind transparent backing areas.
- Do verify the changed flow in both appearances and complete the required native shortcut delivery before declaring the implementation delivered.
- Don't recolor pale pixels baked into photographs, videos or authored jewelry assets.
- Don't replace this import with a shortened landing page or a newly designed configurator.
- Don't apply this surface's fonts or palette to the root shell or Gallery.
- Don't introduce a runtime local HTTP dependency for packaged UI assets.

The adjacent `.impeccable/design.json` contains limited static samples of existing controls. It is an extension of this surface record and does not reproduce the live iframe or 3D application.
