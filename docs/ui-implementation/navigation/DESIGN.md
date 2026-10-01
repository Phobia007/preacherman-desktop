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

## Colors

The drawer retains its dark surface in both appearances. Surface, edge, text, hover/current text, and focus follow the existing `--demo-theme-brand-menu-*` roles. Asset and Extension use `--demo-theme-market-details-glass`, the same translucent backing as Market, with preferences and `data-appearance` remaining authoritative.

On Account, the expanded drawer's hamburger uses the drawer's foreground and focus tokens, including in light mode. Its closed state retains Account's existing treatment. The Account person dock and native window controls keep their existing roles and behavior.

## Typography

The navigation role above records the existing packaged Clash Display treatment. New destination labels inherit it directly; Settings is represented by a drawn gear.

## Layout

The shell retains its scaled 1800-by-1000 desktop stage. The drawer is 288px wide, with centered menu rows and the established row gap. Its order is **Home, Task, Gallery, Market, Asset, Extension**.

Hamburger and Settings share the control dimensions above. Both sit 6px from the top with symmetric 16px outer insets: hamburger left, gear right. Settings is visible, interactive, and keyboard-focusable only while the drawer is open.

## Elevation & Depth

Each reserved destination covers the stage with one continuous backdrop blur (12px) and Market's semantic glass backing. The companion scene remains mounted behind it. These pages introduce no content panels or additional blur layers.

## Shapes

Both top controls use 40px drawn SVGs with an 80-by-80 viewBox and stroke width 4. They retain transparent square targets and semantic focus outlines; the drawer retains its existing border and corner treatment.

## Components

- **Main drawer:** retains the reversible 820ms slide, staggered label reveal, existing hover/focus animation, and reduced-motion rules. Hamburger, Escape, outside click, mouse departure, and focus departure retain their existing close behavior.
- **Settings gear:** opens the existing Settings destination and exposes its current-page state. Settings is no longer a text item among the six main destinations.
- **Asset and Extension:** independent routes at `/__surfaces/asset` and `/__surfaces/extension`, each containing an empty, accessibly named `main` landmark. No headings, placeholder copy, cards, or loading indicators are added.

## Do's and Don'ts

- Do preserve both appearances, desktop scaling, existing fonts, drawer motion, persistent scene, and Account access.
- Do keep Asset and Extension empty until their content is explicitly requested.
- Don't interpret the reserved surfaces as loading failures or add unrequested functionality.

Checkpoint, 2026-10-01: the implementation task reports 45 focused tests and the type check passing, with the design detector returning `[]`. Preview captures cover menu, Asset, Extension, and Account-menu states in both appearances. Verification and desktop delivery are still underway; these records do not establish native delivery. Complete interaction, focus, console, appearance, and canonical-shortcut checks before handoff, and record deployment status in the desktop build manifest.
