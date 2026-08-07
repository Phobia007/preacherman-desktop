export type DemoSurfaceType = "home" | "workspace" | "lab" | "market" | "test" | "ledger" | "settings";

export interface AiriFeaturePlacement {
  readonly surface: DemoSurfaceType;
  readonly features: readonly string[];
}

/**
 * Keeps AIRI-derived controls in the Preacherman surface that owns their product meaning.
 * This is a placement contract, not a second navigation model.
 */
export const airiFeaturePlacements: readonly AiriFeaturePlacement[] = [
  { surface: "home", features: ["voice.quick-input", "presentation.stop", "avatar.status"] },
  { surface: "workspace", features: ["task.confirm", "task.cancel", "task.retry", "task.steer"] },
  { surface: "lab", features: ["voice.capture-mode", "voice.asr", "voice.tts", "presentation.diagnostics", "avatar.preview"] },
  { surface: "market", features: ["avatar.select", "voice.select", "persona.select"] },
  { surface: "test", features: ["task.acceptance", "provider.smoke-test"] },
  { surface: "ledger", features: ["conversation.history", "task.events", "task.artifacts"] },
  { surface: "settings", features: ["provider.credentials", "appearance.select", "locale.select", "voice.defaults"] },
];

export function featuresForSurface(surface: DemoSurfaceType): readonly string[] {
  return airiFeaturePlacements.find((placement) => placement.surface === surface)?.features ?? [];
}
