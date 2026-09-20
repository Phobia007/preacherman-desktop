# Desktop audio dock

The persistent bottom-right dock reuses the five rounded 3 px bars and motion proportions from `output/video-studio/preacherman-typography/src/VoicePrompt.tsx` (VoiceMark). It has no visible label or container. Clicking starts microphone analysis; clicking again stops and releases the stream. Silence holds a fixed shape. Sound controls the amplitude of five unequal bars, capped at 30 updates per second. Minimizing pauses visual sampling.

The adjacent three dots open input and output selectors with the default Clash Display font. Refresh devices requests permission to expose device names, then releases its temporary stream. Output selection uses AudioContext.setSinkId, and Test output plays a short quiet tone through that device. Device choices are stored locally in preacherman.audio-devices. No recording, transcript, upload or AI conversation is created.

All states use semantic appearance tokens. Controls remain legible over the cinematic scene in either appearance and follow the Account background when that page is active. The menu has keyboard focus, Escape/outside dismissal, explicit permission/device errors and input/output fallbacks.

Validation: TypeScript and 18 focused unit/theme/preferences regressions passed. Browser and native checks cover sound/silence, track release, denied permission, both appearances and all six navigation destinations. Real desktop microphone capture, explicit device selection, output routing and test tone passed. No new console errors. Two unrelated existing AppShell assertions remain recorded as baseline failures (unchanged App.tsx and useWindowActivity.ts).

The self-contained executable was rebuilt using the existing release cache and unchanged sidecar, deployed to the canonical Desktop Demo shortcut target, and cold-launched for native verification. The manifest records both executable hashes, the rollback pair, evidence and final resource sample. Evidence: D:/preacherman/output/playwright/audio-dock-20260920/.
