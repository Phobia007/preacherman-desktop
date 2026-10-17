import type { SuiteKey } from './idle-suite-controller.mjs';
export const playbackConfig: Readonly<{schemaVersion: 1; clips: Readonly<Record<SuiteKey,string>>; labels: Readonly<Record<SuiteKey,string>>; autoEventKeys: readonly Exclude<SuiteKey,'idle'>[]; randomGapPlaybackSeconds: number; transitionSeconds: number}>;
