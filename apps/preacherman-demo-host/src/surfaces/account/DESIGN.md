---
name: Preacherman Account
description: The implemented local EvoMap login composition within the Preacherman desktop shell.
colors:
  canvas-light: "#f7f7f6"
  surface-light: "#ffffff"
  text-light: "#202121"
  muted-light: "#666a6c"
  border-light: "#d9dddd"
  border-hover-light: "#8b9598"
  hover-light: "#f0f2f2"
  focus-light: "#167b98"
  error-light: "#a53636"
  action-hover-light: "#41484a"
  glass-light: "#aebbc0"
  frost-light: "#f0f4f4"
  frost-soft-light: "#c5d1d5"
  fade-mid-light: "rgb(43 53 59 / 8%)"
  fade-end-light: "rgb(13 22 29 / 88%)"
  brand-text-light: "#edf3f5"
  profile-text-light: "#172229"
  brand-shadow-light: "rgb(0 0 0 / 90%)"
  brand-hover-light: "#ffffff"
  dialog-backdrop-light: "rgb(15 24 29 / 42%)"
  canvas-dark: "#000000"
  surface-dark: "#0f0f0f"
  text-dark: "#ededed"
  muted-dark: "#959a9c"
  border-dark: "#292c2e"
  border-hover-dark: "#596267"
  hover-dark: "#171a1c"
  focus-dark: "#71d6ed"
  error-dark: "#f3aaa4"
  action-hover-dark: "#c8d4d8"
  glass-dark: "#11171c"
  frost-dark: "#424d53"
  frost-soft-dark: "#26333b"
  fade-mid-dark: "rgb(0 0 0 / 22%)"
  fade-end-dark: "#000000"
  brand-text-dark: "#dce5e8"
  profile-text-dark: "#dce5e8"
  brand-shadow-dark: "rgb(0 0 0 / 90%)"
  brand-hover-dark: "#ffffff"
  dialog-backdrop-dark: "rgb(0 0 0 / 64%)"
typography:
  headline:
    fontFamily: '"Account Harmony", Arial, sans-serif'
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-.02em"
  body:
    fontFamily: 'Arial, "Account Harmony", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: 'Arial, "Account Harmony", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  signature:
    fontFamily: '"Market Task Signature", cursive'
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1
  profile:
    fontFamily: '"Market Task Profile", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "8px"
  dialog: "12px"
spacing:
  provider-gap: "12px"
  field-inset: "16px"
  heading-gap: "24px"
  dialog-inset: "28px"
components:
  button-continue-light:
    backgroundColor: "{colors.text-light}"
    textColor: "{colors.canvas-light}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    width: "100%"
  button-continue-dark:
    backgroundColor: "{colors.text-dark}"
    textColor: "{colors.canvas-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    width: "100%"
  button-provider-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 48px"
    width: "100%"
  button-provider-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 48px"
    width: "100%"
  input-email-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "52px"
    width: "100%"
  input-email-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "52px"
    width: "100%"
  signature:
    backgroundColor: "transparent"
    typography: "{typography.signature}"
    padding: "4px 24px"
  dialog-light:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.dialog}"
    padding: "28px"
    width: "min(420px, calc(100vw - 72px))"
---

# Design System: Preacherman Account

## Overview

**Creative North Star: "Local EvoMap login composition"**

This document describes only the implemented Account surface. Its visual authority is the user-pinned local EvoMap login composition: equal portrait and form panels, the original HarmonyOS/Arial form, a neutral frosted scene, and existing Preacherman brand assets. It does not establish a replacement design system for other routes.

The left panel shares the currently active companion model with the application. The right panel presents a quiet, centered login form. The signature opens the existing Task profile lens against the live scene, keeping the portrait and optical distortion part of the same composition. GitHub sign-in opens the system browser, returns through the Preacherman desktop protocol, and uses Supabase PKCE. The existing Google and email controls retain honest unavailable feedback. The signed-in account summary uses the same form typography and theme tokens.

**Key Characteristics:**

- Equal portrait and form panels on the existing scaled desktop stage.
- Original HarmonyOS/Arial form typography with the packaged handwritten signature.
- Semantic light and dark chrome around unchanged authored companion content.
- Staggered horizontal entrance and the reused Task profile lens.

Ground truth: [AccountSurface.tsx](AccountSurface.tsx), [account.css](account.css), [AccountScene.tsx](AccountScene.tsx), shared [theme roles](../../styles.css), [TaskProfileLens](../market/TaskProfileLens.ts), and [AppShell](../../app-shell/AppShell.tsx). Durable product constraints come from [PRODUCT.md](../../../../../PRODUCT.md). This scan records the reviewed September 15, 2026 implementation. The supplied finish review passed with no material findings; Arial detector warnings were accepted for source fidelity. Visual evidence is in `D:/preacherman/output/account-evomap-20260915/preview-{dark,light,dark-lens,light-lens,mobile}.png`. Runtime verification and release status remain the task's separate delivery evidence.

## Colors

The palette is neutral: a paper or black form canvas, a softly lit cool gray portrait ground, and a dark lower fade. Frontmatter records the exact light/dark values of the existing Account color roles; each key maps to `--demo-theme-account-<role>`, with the mode suffix identifying its appearance. Runtime CSS remains the implementation source of truth.

### Primary

Text ink also fills the enabled Continue action, with canvas providing its reversed label. Action-hover supplies its hover state. Focus adds a clear outline without becoming a decorative page accent; error is reserved for validation and unavailable-effect feedback.

### Neutral

Canvas, surface, muted, border, border-hover, and hover distinguish form layers and controls. Glass, frost, and frost-soft describe the portrait's painted canvas. Fade-mid and fade-end ground its lower edge. Brand-text and brand-hover protect the signature against the model; profile-text serves the opened profile. Brand-shadow and dialog-backdrop support these overlays.

Google keeps its authored multicolor icon. GitHub and native window-control imagery use the existing icon filter: black in light appearance and white in dark appearance. The white PM raster mark is an authored brand asset and stays white in both modes.

**The Appearance Rule.** Use the existing --demo-theme-account-* roles from styles.css, selected by preacherman.preferences and AppShell data-appearance. Preserve both modes for controls, feedback, focus, icons, and the frosted scene.

## Typography

The heading uses bundled HarmonyOS Sans SC, registered as "Account Harmony," with Arial and sans-serif fallbacks. Form body and controls use Arial first, followed by Account Harmony. The heading is compact and centered; supporting copy and controls retain the donor's practical sans-serif character.

The signature uses "Market Task Signature," sourced from the packaged BrotherSignature OTF. Profile copy uses "Market Task Profile," sourced from the packaged ABC Diatype Plus variable font. Both are existing shared assets.

Frontmatter captures the repeated roles. Supporting details are divider copy (12px/16px), validation copy (13px/20px), dialog title (24px/32px), dialog body (15px/24px), and the profile's first line (23px). The signature retains its original font when the profile opens.

**The Donor Type Rule.** Preserve the local donor's HarmonyOS/Arial form pairing and the existing signature font. The accepted Arial detector warnings are a deliberate source-fidelity choice.

## Layout

The existing shell measures (1800 by 1000 layout pixels) and scales uniformly by `min(window.innerWidth / 1800, window.innerHeight / 1000)`. Account occupies the whole stage. Portrait and form panels each take half its width and full height; the right panel has one semantic border on its left edge.

The centered form spans available width up to (418px), within panel padding of (80px 40px 64px). Provider buttons stack with a (12px) gap. The heading has a (24px) bottom margin, subtitle a (10px) top margin, divider (16px) vertical margins, and Continue a (16px) top margin. The right panel can scroll vertically if needed.

The shared scene translates into the left half and is clipped to that panel. The PM mark is centered horizontally at the vertical midpoint, offset upward with `translate(-50%, -64%)`. The signature sits beneath it at `top: calc(50% + 96px)`. The opened profile is centered within `min(80%, 360px)`.

The supplied narrow-window screenshot shows the same two-panel desktop stage reduced in size with surrounding viewport space. Account has no breakpoint that stacks panels or removes the portrait. Preserve that behavior until responsive product behavior is explicitly changed.

The left visual and shared scene enter first over (820ms). The right panel enters over (760ms) after a (420ms) delay. Both use `cubic-bezier(.22, 1, .36, 1)`. The signature becomes available after its entrance readiness gate (1280ms), immediately for an initial reduced-motion preference. Reduced motion removes the entrance and profile fade animations.

## Elevation & Depth

The form uses flat tonal surfaces and thin borders. Depth is concentrated in the companion content: the painted frosted canvas uses two soft radial lights and subtle deterministic grain, while a transparent-to-dark vertical gradient grounds the model. The frost is a painted scene material.

The PM mark has a restrained drop shadow (`0 2px 5px`) and the resting signature a text shadow (`0 1px 4px`), both using brand-shadow. The opened signature removes its shadow and uses profile-text. The feedback dialog has a semantic dim backdrop with (6px) backdrop blur.

**The Live Scene Rule.** The lens distorts the continuously animated shared companion, frost, lower gradient, and PM mark. Keep the form outside the capture. The shared renderer keeps running throughout opening, open, and closing; copy its completed frame without rendering a second companion.

## Shapes

Provider buttons, email, and Continue share gently rounded control corners. The dialog uses the larger dialog radius. Portrait and form panels remain edge-to-edge rectangles with a straight center division.

The lens is the existing shader-driven circular distortion with its original reach, aberration, orbit, wave, squash, and breathing behavior. Its silhouette and refracted pixels come from that implementation.

## Components

### Provider buttons

Full-width outlined controls with centered labels, minimum height (52px), and an icon positioned (20px) from the left. Google uses an (18px) icon and GitHub (20px). Hover changes surface and border roles. Focus uses a (2px) outline with a (3px) offset. Both providers open the same local sign-in status dialog.

### Email and Continue

The field has an accessible label, native email validation, and fixed height (52px). A nonempty invalid address shows the error border and "Enter a valid email address." after blur. Continue has minimum height (48px) and stays disabled at (0.45) opacity until the browser considers the address valid. Enabled submission prevents navigation and opens the status dialog.

### Sign-in feedback dialog

The native dialog announces "Sign-in is coming soon" and explicitly says the email has not been sent or saved. It uses the same semantic surface, border, text, muted text, and Continue control as the form. Its width is `min(420px, calc(100vw - 72px))` with (28px) padding. The focused "Got it" action closes it through a native dialog form; native Escape dismissal remains available.

### Companion, mark, and signature

The portrait uses the shared active avatar. The white startup PM mark is (184px square). The signature is a real button with minimum target height (48px), `aria-expanded`, and `aria-controls`. Clicking toggles the profile; Escape closes it and returns focus to the signature.

The lens starts from a synchronous capture of the shared model canvas, then samples each completed shared render. Cache current-theme frost, the lower fade, and the loaded PM mark and composite the live model into those layers. It excludes the form and other desktop UI. Existing TaskProfileLens opens over (850ms) and closes over (650ms) using its imported curve. Profile text fades in over (650ms). The shared companion renderer remains active throughout opening, open, and closing. Closing hands off to the live scene immediately, without an opacity restart or context destruction. The lens suspends animation while the document is hidden and honors reduced motion.

Appearance or panel-size changes dispose and reset the captured effect. Returning to the profile reconnects live frame updates. A capture or renderer failure leaves "The visual effect is unavailable." status. Closing disconnects frame copies and retains one idle lens for reuse. Unmounting, appearance changes and size changes dispose the renderer, texture, geometry, and material. Reduced motion still refreshes live pixels without the lens's ambient motion.

### Inherited navigation and native controls

The shell navigation trigger and minimize, maximize, and close controls remain available above Account. Account gives them its text, hover, focus, and icon-filter roles. Existing navigation and the normal Home startup route remain authoritative.

## Do's and Don'ts

### Do:

- **Do** preserve the equal split and the existing 1800 by 1000 desktop scaling behavior.
- **Do** keep the 184px white PM mark and the original 38px signature beneath it.
- **Do** retain the left-first 820ms entrance and the right 760ms entrance delayed by 420ms.
- **Do** use the active shared companion and the existing TaskProfileLens implementation.
- **Do** preserve visible focus, reduced motion, native dialog dismissal, and both appearance modes.
- **Do** keep provider and email actions local until authentication is separately implemented.

### Don't:

- **Don't** replace the pinned HarmonyOS/Arial typography because of a generic font warning.
- **Don't** substitute a decorative CSS ring, unrelated image, or second companion renderer for the lens.
- **Don't** turn this first-page surface into an authentication backend, credential store, or provider redirect.
- **Don't** promote this route's split layout or typography into rules for unrelated surfaces.
- **Don't** reflow the shell into a new mobile layout as an undocumented side effect.
