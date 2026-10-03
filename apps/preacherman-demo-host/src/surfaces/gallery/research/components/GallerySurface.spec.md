# GallerySurface specification

## Overview

- Target: `apps/preacherman-demo-host/src/surfaces/task/TaskExperienceSurface.tsx`
- Interaction model: source iframe is wheel, pointer, touch, hover, and click driven; wrapper reveal is time driven.

## DOM structure

- Full-size Gallery section.
- Reveal mask containing the source iframe.
- Horizontal reveal line above the mask.
- Non-blocking semantic loading/status label while the iframe boots.

## Required styling

- Fill the parent content viewport with no new page chrome.
- Background remains transparent so the persistent Cortana stage is visible.
- Iframe fills the Gallery region, has no border, and stays interactive after reveal.
- Wrapper colors, borders, focus indicators, and loading state use semantic `--demo-theme-*` variables.

## States and behaviors

- Initial: iframe is mounted but hidden at the vertical center.
- Line sweep: line scales from left to right across the full region.
- Pulse: visible band opens partially, pauses/contracts slightly, then snaps into a smooth full-height expansion.
- Ready: mask is fully open and the line fades out; iframe receives pointer and wheel input.
- Reduced motion: reveal completes directly.
- Reload/remount: animation restarts once per Gallery mount.

## Source modifications

- Hide `[data-od-id="brand-home"]` only.
- Do not add the original backdrop or floor grid meshes to the WebGL scene.
- Clear the original WebGL canvas with alpha zero.
- Keep Profile, Featured, Full, all source copy, all original cards, and all original media.

## Responsive behavior

- Desktop, tablet, and mobile preserve the original source responsive parameters because the iframe always matches its container.

