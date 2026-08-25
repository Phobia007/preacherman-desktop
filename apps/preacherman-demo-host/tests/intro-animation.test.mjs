import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(hostRoot, "src");
const introRoot = join(sourceRoot, "intro");

test("startup welcome plays the existing signal lock inside a three-second sequence", async () => {
  const splash = await readFile(join(introRoot, "IntroSplash.tsx"), "utf8");
  const styles = await readFile(join(introRoot, "animated-preacherman-logo.css"), "utf8");
  const timing = await readFile(join(sourceRoot, "introSequence.ts"), "utf8");

  assert.match(timing, /signalLockMs:\s*2000/);
  assert.match(timing, /totalDurationMs:\s*3000/);
  assert.match(timing, /mainFadeInMs:\s*700/);
  assert.doesNotMatch(timing, /LOGO_ANIMATION_TOTAL_MS|whiteHoldMs|logoDrawMs|logoFadeOutMs/);
  assert.match(splash, /if \(!visualReady\) return;[\s\S]*setTimeout\(onComplete, STARTUP_INTRO_TIMING\.totalDurationMs\)/);
  assert.match(splash, /data-ready=\{visualReady\}/);
  assert.match(splash, /decoding="sync"/);
  assert.match(splash, /preacherman-mark-light\.png/);
  assert.match(splash, /preacherman-mark-dark\.png/);
  assert.doesNotMatch(splash, /AnimatedPreachermanLogo|LOGO_STROKE_SEQUENCE/);
  assert.match(styles, /@keyframes demo-signal-snow/);
  assert.match(styles, /@keyframes demo-signal-sync/);
  assert.match(styles, /@keyframes demo-signal-lock/);
  assert.match(styles, /\.demo-intro-splash\[data-ready="true"\][\s\S]*animation-play-state:\s*running/);
  assert.match(styles, /animation-play-state:\s*paused/);
  assert.doesNotMatch(splash + styles, /demo-intro-splash__wordmark|demo-signal-wordmark/);
});

test("welcome removes all account choices and advances directly to Home", async () => {
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const bootstrap = await readFile(join(sourceRoot, "StartupBootstrap.tsx"), "utf8");
  const splash = await readFile(join(introRoot, "IntroSplash.tsx"), "utf8");
  const styles = await readFile(join(introRoot, "animated-preacherman-logo.css"), "utf8");

  assert.doesNotMatch(splash, />\s*(?:Login|Register|Visitor)\s*</);
  assert.doesNotMatch(splash, /<button\b|<nav\b|preacherman:auth-requested|WelcomeChargeRing/);
  assert.doesNotMatch(styles, /demo-intro-splash__(?:actions|account-actions|nav-item|account-notice)/);
  assert.match(splash, /setTimeout\(onComplete, STARTUP_INTRO_TIMING\.totalDurationMs\)/);
  assert.match(app, /handleIntroComplete[\s\S]*openLocalSurface\("home"\)[\s\S]*setShowStartupIntro\(false\)/);
  assert.match(app, /\{appShell\}[\s\S]*showStartupIntro\s*\?\s*\(\s*<IntroSplash[\s\S]*onComplete=\{handleIntroComplete\}/);
  assert.match(app, /dispatch=\{adapter\.dispatch\}/);
  assert.match(bootstrap, /handleIntroComplete[\s\S]*openLocalSurface\("home"\)[\s\S]*setIntroComplete\(true\)/);
  assert.match(bootstrap, /introComplete && DeferredApp/);
});

test("welcome supports both appearances, reduced motion, and persistent desktop controls", async () => {
  const splash = await readFile(join(introRoot, "IntroSplash.tsx"), "utf8");
  const styles = await readFile(join(introRoot, "animated-preacherman-logo.css"), "utf8");
  const themeStyles = await readFile(join(sourceRoot, "styles.css"), "utf8");

  assert.match(splash, /data-appearance=\{appearance\}/);
  assert.match(splash, /appearance === "dark" \? preachermanMarkDark : preachermanMarkLight/);
  assert.match(splash, /<WindowControls\b/);
  assert.match(splash, /<WindowResizeHandles\b/);
  assert.match(splash, /demo\.window\.start-dragging/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /var\(--demo-theme-canvas\)/);
  assert.match(styles, /var\(--demo-theme-text\)/);
  assert.match(themeStyles, /\.demo-intro-splash\s*\{[\s\S]*--demo-theme-signal-static:/);
  assert.match(themeStyles, /\.demo-intro-splash\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-signal-static:/);
  assert.doesNotMatch(themeStyles, /--demo-theme-welcome-control-/);
});
