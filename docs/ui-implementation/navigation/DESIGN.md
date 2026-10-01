---
name: Preacherman navigation and reserved surfaces
description: Existing desktop drawer, Settings access, and deliberately empty Asset and Extension destinations.
typography:
  navigation:
    fontFamily: "Clash Display, sans-serif"
    fontSize: "32px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "0.018em"
spacing:
  menu-row-gap: "68px"
components:
  navigation-control:
    width: "48px"
    height: "48px"
---

# Design System: Preacherman navigation

## Overview

This record covers the existing main drawer and the user-requested Asset and Extension destinations. Preserve the established navigation typography and motion. Asset and Extension are intentionally empty pages over the persistent companion scene; their emptiness is the requested design state.

Source authority is the Demo Host's `src/app-shell/AppShell.tsx`, `src/styles.css`, `src/App.tsx`, `src/demo/screenRoute.ts`, `src/demoHostBridge.ts`, and `src/surfaces/FrostedSurface.tsx`.

Surface transition coordination is recorded in `src/app-shell/useSurfaceNavigation.ts`, `src/app-shell/surfaceNavigation.ts`, and `src/app-shell/surfaceMotion.ts`, with Gallery and Market supplying their existing motion tracks.

## Colors

The drawer retains its dark surface in both appearances. Surface, edge, text, hover/current text, and focus follow the existing `--demo-theme-brand-menu-*` roles. Asset and Extension use `--demo-theme-market-details-glass`, the same translucent backing as Market, with preferences and `data-appearance` remaining authoritative.

On Account, the expanded drawer's hamburger uses the drawer's foreground and focus tokens, including in light mode. Its closed state retains Account's existing treatment. The Account person dock and native window controls keep their existing roles and behavior.

## Typography

The navigation role above records the existing packaged Clash Display treatment. New destination labels inherit it directly; Settings is represented by a drawn gear.

## Layout

The shell retains its scaled 1800-by-1000 desktop stage. The drawer is 288px wide, with centered menu rows and the established row gap. Its order is **Home, Task, Gallery, Market, Asset, Extension**.

Hamburger and Settings share the control dimensions above. Both sit 6px from the top with symmetric 16px outer insets: hamburger left, gear right. Settings follows the drawer's opening and closing motion and is interactive and keyboard-focusable only while the drawer is open.

## Elevation & Depth

Each reserved destination covers the stage with one continuous backdrop blur (12px) and Market's semantic glass backing. The companion scene remains mounted behind it. These pages introduce no content panels or additional blur layers.

## Shapes

Both top controls use 40px drawn SVGs with an 80-by-80 viewBox and stroke width 4. They retain transparent square targets and semantic focus outlines; the drawer retains its existing border and corner treatment.

## Components

- **Main drawer:** retains the reversible 820ms slide, staggered label reveal, existing hover/focus animation, and reduced-motion rules. Hamburger, Escape, outside click, mouse departure, and focus departure retain their existing close behavior.
- **Settings gear:** opens the existing Settings destination and exposes the requested destination's current-page state. Its container follows the drawer's exact 820ms transform and easing. The glyph's fade and downward reveal begin at 390ms, preceding Home's 460ms reveal. Glyph geometry, typography, spacing, and final placement remain unchanged. Settings is no longer a text item among the six main destinations.
- **Asset and Extension:** independent routes at `/__surfaces/asset` and `/__surfaces/extension`, each containing an empty, accessibly named `main` landmark. Each destination has a distinct keyed 260ms fade, so changing between them plays its own entry. No headings, placeholder copy, cards, or loading indicators are added.
- **Surface changes:** keep the outgoing page mounted until its entrance motion finishes playing backward, then commit the latest requested destination. Requests replace the pending destination without queuing pages or restarting an ongoing exit. Selecting the outgoing page again reverses its existing tracks toward the visible state. Navigation selection follows the latest request immediately.
- **Reversed motion:** Task, Settings, and Account reuse their existing entrance timelines and stagger order in reverse. Gallery's orbit travels backward along its entry trajectory. Market reverses the continuous split-frost reveal and visible Discover columns from their current computed pose, including an interrupted entrance or category change. The persistent scene remains behind the transition.
- **Interaction during transitions:** outgoing content is inert during exit and return, including Gallery's separately mounted Details portal. The drawer remains available for further navigation requests. Reduced motion commits surface changes immediately and removes the gear and reserved-surface transitions.

## Do's and Don'ts

- Do preserve both appearances, desktop scaling, existing fonts, drawer motion, persistent scene, and Account access.
- Do keep Asset and Extension empty until their content is explicitly requested.
- Don't interpret the reserved surfaces as loading failures or add unrequested functionality.

Prior verified delivery:

Verified 2026-10-01: type check and 45 focused tests passed; design detector returned `[]` and finish review found no remaining brief/UI defects. Browser checks covered both appearances at desktop, 1024px, and 390px widths. Native canonical-shortcut checks passed for Home, Task, Gallery, Market/Search, Asset, Extension, Settings and Account in both appearances, including menu symmetry, keyboard access, browser history, continuous frost, persistent scene, Appearance settings, and native window controls. Empty reserved pages do not mount the auxiliary DOM observation bridge; they have no developed page controls to expose. The deployed executable and sidecar hashes, rollback pair, resource cleanup and normal Home restart are recorded in `apps/preacherman-demo-host/desktop-build-manifest.json`. Evidence: `D:/preacherman/output/playwright/navigation-asset-extension-20261001/`.

Pending checkpoint — navigation motion refinement, 2026-10-01: the implementation task reports 48 passing source checks. Browser and native verification remain in progress, and deployment of this refinement is not yet verified. Check rapid destination changes, reversal to the outgoing page, gear/drawer timing, inert outgoing controls, distinct Asset/Extension entry, and reduced motion in both appearances. Complete console and canonical-shortcut checks before recording a new verified delivery. The prior checkpoint above describes the earlier release.
