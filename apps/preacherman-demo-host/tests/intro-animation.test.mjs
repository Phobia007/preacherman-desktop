import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(hostRoot, "src");
const introRoot = join(sourceRoot, "intro");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("animated intro preserves the supplied seven-stroke sequence and smooth loop", async () => {
  const componentPath = join(introRoot, "AnimatedPreachermanLogo.tsx");
  const timelinePath = join(introRoot, "logoAnimationTimeline.ts");
  assert.equal(await exists(componentPath), true, "animated logo component must exist");
  assert.equal(await exists(timelinePath), true, "logo animation timeline must exist");

  const component = await readFile(componentPath, "utf8");
  const timeline = await readFile(timelinePath, "utf8");

  for (const entry of [
    [7, "177.3", 45, -1],
    [6, "80.8", 35, 1],
    [5, "80.8", 55, 1],
    [4, "125.8", 40, -1],
    [3, "67.7", 30, 1],
    [2, "67.6", 70, 1],
    [1, "830", 0, -1],
  ]) {
    const [stroke, duration, gap, direction] = entry;
    assert.match(
      timeline,
      new RegExp(`stroke:\\s*${stroke},[\\s\\S]*?duration:\\s*${duration},[\\s\\S]*?gap:\\s*${gap},[\\s\\S]*?direction:\\s*${direction}`),
    );
  }

  assert.match(timeline, /turnTime:\s*0\.6/);
  assert.match(timeline, /turnProgress:\s*0\.44/);
  assert.match(timeline, /startVelocity:\s*0\.75/);
  assert.match(timeline, /turnVelocity:\s*0\.7/);
  assert.match(timeline, /endVelocity:\s*0\.85/);
  assert.match(timeline, /function quinticHermite/);
  assert.match(timeline, /function smoothLoopEase/);
  assert.match(timeline, /sampleCount\s*=\s*120/);
  assert.match(timeline, /LOGO_ANIMATION_TOTAL_MS\s*=\s*2525/);
  assert.match(component, /LOGO_STROKE_SEQUENCE/);
  assert.match(component, /path\.animate/);
  assert.match(component, /wordmark\.animate/);
});

test("animated intro localizes every supplied SVG path on a white splash", async () => {
  const componentPath = join(introRoot, "AnimatedPreachermanLogo.tsx");
  const cssPath = join(introRoot, "animated-preacherman-logo.css");
  const splashPath = join(introRoot, "IntroSplash.tsx");
  assert.equal(await exists(componentPath), true);
  assert.equal(await exists(cssPath), true);
  assert.equal(await exists(splashPath), true);

  const component = await readFile(componentPath, "utf8");
  const css = await readFile(cssPath, "utf8");
  const splash = await readFile(splashPath, "utf8");

  for (const guide of [
    "M388 152 C440 154 492 163 530 182",
    "M539 257 L550 296",
    "M528 216 L538 251",
    "M530 216 C521 246 510 278 497 313",
    "M482 258 L500 313",
    "M463 189 L482 254",
    "M464 190 C450 238 431 309 408 384",
  ]) {
    assert.match(component, new RegExp(guide.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(component, /const LOGO_PATHS\s*=\s*\[/);
  assert.match(component, /const WORDMARK_PATH\s*=/);
  assert.match(component, /viewBox="0 0 982 574"/);
  assert.doesNotMatch(component, /<rect|fill="#000"|iframe|https?:\/\//i);
  assert.match(component, /stroke="white"/);
  assert.match(component, /fill=\{ink\}/);
  assert.match(component, /prefers-reduced-motion:\s*reduce/);
  assert.match(component, /opacity\s*=\s*["']0["']/);
  assert.match(css, /width:\s*var\(--demo-animated-logo-size\)/);
  assert.match(css, /height:\s*var\(--demo-animated-logo-size\)/);
  assert.match(splash, /size=\{600\}/);
  assert.match(splash, /appearance\s*===\s*["']dark["']\s*\?\s*["']#f7f5f1["']\s*:\s*["']#111111["']/);
  assert.match(splash, /ink=\{introInk\}/);
  assert.match(splash, /replayOnClick=\{false\}/);
});

test("intro splash owns the 5.6 second handoff without persistent storage", async () => {
  const splashPath = join(introRoot, "IntroSplash.tsx");
  assert.equal(await exists(splashPath), true, "intro splash component must exist");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const intro = await readFile(join(sourceRoot, "introSequence.ts"), "utf8");
  const splash = await readFile(splashPath, "utf8");
  const main = await readFile(join(sourceRoot, "main.tsx"), "utf8");

  assert.match(intro, /whiteHoldMs:\s*800/);
  assert.match(intro, /logoDrawMs:\s*LOGO_ANIMATION_TOTAL_MS/);
  assert.match(intro, /logoVisibleMs:\s*1000/);
  assert.match(intro, /logoFadeOutMs:\s*600/);
  assert.match(intro, /mainFadeInMs:\s*700/);
  assert.match(intro, /STARTUP_INTRO_FAILSAFE_MS\s*=\s*STARTUP_INTRO_TOTAL_MS\s*\+\s*1000/);
  assert.match(intro, /claimStartupIntro/);
  assert.doesNotMatch(intro + app + splash, /localStorage|sessionStorage/);
  assert.doesNotMatch(main, /StrictMode/);
  assert.match(splash, /STARTUP_INTRO_TIMING\.whiteHoldMs/);
  assert.match(splash, /STARTUP_INTRO_TIMING\.logoVisibleMs/);
  assert.match(splash, /STARTUP_INTRO_TIMING\.logoFadeOutMs/);
  assert.match(splash, /window\.setTimeout\(\s*onComplete,\s*STARTUP_INTRO_FAILSAFE_MS/);
  assert.match(splash, /window\.clearTimeout\(failsafeTimer\)/);
  assert.match(app, /<IntroSplash[\s\S]*onComplete=\{handleIntroComplete\}/);
  assert.doesNotMatch(app, /STARTUP_INTRO_TOTAL_MS|setTimeout\([\s\S]*setShowStartupIntro/);
});
