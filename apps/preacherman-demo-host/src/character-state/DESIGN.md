---
name: Preacherman Character State
description: A scoped extension of the existing Asset and Settings design world.
colors:
  canvas-light: "#edf0f2"
  canvas-dark: "#010409"
  text-light: "#202326"
  text-dark: "#ffffff"
  muted-light: "#50565c"
  market-muted-dark: "rgb(255 255 255 / 68%)"
  settings-muted-dark: "rgb(255 255 255 / 48%)"
  market-border-light: "rgb(32 35 38 / 25%)"
  market-border-dark: "rgb(255 255 255 / 28%)"
  settings-border-light: "rgb(32 35 38 / 24%)"
  settings-border-dark: "rgb(255 255 255 / 20%)"
  field-light: "rgb(255 255 255 / 42%)"
  field-dark: "rgb(255 255 255 / 7%)"
  market-focus-light: "#343b43"
  settings-focus-light: "#414a55"
  focus-dark: "#ffffff"
  hover-light: "rgb(31 29 26 / 6%)"
  hover-dark: "rgb(255 255 255 / 9%)"
  loading-light: "#32617b"
  loading-dark: "#9ddcf0"
  error-light: "#973a39"
  error-dark: "#ffaaaa"
typography:
  focused-setting:
    fontFamily: '"Clash Display", sans-serif'
    fontSize: "32px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "0.018em"
  panel-title:
    fontFamily: '"Clash Display", sans-serif'
    fontSize: "36px"
    fontWeight: 300
    lineHeight: 1.2
  panel-body:
    fontFamily: '"Clash Display", sans-serif'
    fontSize: "18px"
    lineHeight: 1.55
rounded:
  field: "18px"
  pill: "999px"
spacing:
  panel-inline: "36px"
  panel-block: "32px"
  field-gap: "20px"
components:
  panel-action:
    backgroundColor: "transparent"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  memory-field:
    rounded: "{rounded.field}"
    padding: "18px 22px"
    width: "100%"
---

# Design System: Preacherman Character State

## Overview

**Creative North Star: "The existing Preacherman character workspace"**

This document extends the implemented Asset and Settings surfaces. It does not replace the root design world. The pinned direction is English-first Clash Display, quiet thin borders and pills, a large focused setting title on the left, and clear editing controls on the right. Info Map places the portrait and rapport on the left and the graph or history on the right.

**Key Characteristics:**

- The existing companion, shell, navigation, and desktop controls remain visually continuous.
- Thin frames, restrained surfaces, and clear type carry the hierarchy.
- Focus blurs the other setting choices and model while preserving readable form content.
- Light and dark appearances use the same semantic roles.

Source authority: [theme roles](../styles.css), [preferences](../preferences.ts), [Asset layout](../surfaces/asset/asset-profile-panels.css), [focused settings](../surfaces/asset/asset-settings.css), [shared Settings menu](../settings/settings-menu.css), and the components beside this document. The current implementation and user-pinned direction take precedence over stale root PRODUCT.md descriptions. The frontend evidence is under `output/playwright/character-state/`; release and native verification remain separate delivery evidence.

## Colors

Frontmatter records the reused palette from styles.css. Runtime styling must reference `--demo-theme-*` properties, selected by `preacherman.preferences`, `html[data-appearance]`, and AppShell's `data-appearance`.

Primary text provides the visual emphasis. Market text, muted, border, and focus roles serve Skills and Info Map; Settings equivalents serve memory and rules editing. The shared control-hover role supplies pill hover/selection. Loading and error roles shown here are the Settings feedback roles reused by these panels. Graph labels use the Home canvas behind their text so connecting lines do not cross labels.

**The Appearance Rule.** Preserve deliberate backgrounds, text, borders, icons, hover, focus, loading, and error states in both modes. Authored portraits and models retain their content colors. Native window controls remain legible above every surface.

## Typography

Clash Display remains the primary face through `--demo-font-primary`. Keep English as the primary UI language. Panel descriptions remain comfortably readable, with the Skills description bounded to (65ch). Supporting labels are (16px); graph-node labels are (14px). Character forms use (19px) body text and (17px) action labels.

The focused setting uses the frontmatter type role and the inherited scale animation to reach twice its authored size. Preserve this large title rather than shrinking the entire setting composition. Instructions / Rules alone wraps within a pre-scale maximum width of (17%) so its painted width stays inside the left column. This is the source correction for the finish-review overlap; older Rules captures may precede it.

## Layout

Retain the shell's authored (1800 by 1000) stage and scaling behavior. Within Asset, settings choices start at (8%) and occupy (34%); the clear form starts at (46%) and occupies (54%). The title, form, model slot, and persistent chrome remain separate layers.

Info Map uses a left identity column of (30%) with the remaining width for the panel. Skills uses (35%) for the identity and tool list. Both retain generous inter-column space and lower navigation clearance. At the existing (1100px) CSS breakpoint, columns and padding tighten; at (768px), profile panels stack and memory policy fields become one column. These local breakpoints do not redefine the shell's desktop scaling contract.

## Elevation & Depth

Panels are flat and transparent with thin borders; this extension adds no card shadows. Depth comes from the existing authored companion and focused-setting frost. Other setting choices blur by (12px); the Asset model slot blurs by (38px). The Asset frost mixes the Home canvas at (58%) with transparency. The selected title and form stay sharp.

Focus enlargement and frost transition over (420ms); model opacity uses (520ms). Preserve the inherited reduced-motion behavior and do not animate graph nodes continuously. Motion and representative CSS snippets live in the adjacent sidecar.

## Shapes

Profile containers and skill-list rows keep straight rectangular frames with (1px) borders. Actions and graph nodes use pills; editable textareas use the softer field radius from frontmatter. Keep history and memory entries separated by single rules rather than enclosing each entry in another card.

## Components

**Settings forms.** Memory and Instructions / Rules reuse the focused Settings composition. Fields use semantic surface, border, text, placeholder, and caret colors. Textareas resize vertically within (110–400px). Focus is a (1px) outline offset by (4px). Keep save, refresh, revision, loading, and error feedback visible beside the edited character's identity.

**Skills.** The left list selects a registered backend tool; the right panel shows its description, enable switch, experience, and optional last execution. Selection and hover use the shared subtle fill and focus border. Preserve the intentionally blank demonstration rectangle. Do not fill it with a fabricated preview or substitute example accomplishments.

**Info Map.** Portrait, rapport level, and conversation continuity form the left identity column. The right panel contains Map/History tabs, refresh, a radial relationship graph, and a readable selected-node detail. Nodes are real buttons with pressed state; tabs support arrow, Home, and End keys. History exposes real event and task references with bounded loading and errors.

**Conversation identity.** The activated character owns subsequent voice and text conversations. Browsing another Asset character is a preview and must not silently reassign activation. Show the currently inspected character's own backend state in Asset; never use a selected preview as the conversation owner. [activeCharacter.ts](activeCharacter.ts) reads the shell's active-character identity.

**Data feedback.** Relationship, emotion, memory counts, skill experience, and history derive from the character backend. Empty and unavailable states remain honest; no fabricated counts, memories, progress, or executions. Loading indicators, disabled controls, and errors use semantic roles and accessible status/alert behavior.

## Do's and Don'ts

- **Do** extend the existing Asset and Settings language with Clash Display, thin frames, and restrained pills.
- **Do** keep the focused title left, the form right, and background choices and model blurred.
- **Do** preserve the Rules-only wrap and check its painted bounds after the scale transform.
- **Do** verify changed surfaces and native controls in both appearances, including console errors and keyboard focus.
- **Don't** promote this scoped split composition into a redesign of unrelated routes.
- **Don't** replace semantic theme roles with hard-coded page chrome.
- **Don't** reassign conversation ownership when the user browses a character preview.
- **Don't** invent backend state or populate the intentionally blank skill demonstration.
