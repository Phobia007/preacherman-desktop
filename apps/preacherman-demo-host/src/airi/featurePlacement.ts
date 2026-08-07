export type DemoSurfaceType = "home" | "workspace" | "lab" | "market" | "test" | "ledger" | "settings";
export type AiriFeatureStatus = "live" | "ready";

export interface AiriFeatureDefinition {
  readonly id: string;
  readonly label: { readonly en: string; readonly "zh-CN": string };
  readonly status: AiriFeatureStatus;
}

export interface AiriFeaturePlacement {
  readonly surface: DemoSurfaceType;
  readonly features: readonly AiriFeatureDefinition[];
}

const feature = (
  id: string,
  en: string,
  zhCN: string,
  status: AiriFeatureStatus,
): AiriFeatureDefinition => ({ id, label: { en, "zh-CN": zhCN }, status });

/**
 * AIRI capabilities are grouped under the existing Preacherman navigation.
 * "live" means the page already owns a working control; "ready" means the UI
 * entry is deliberately present while its provider/runtime wiring follows.
 */
export const airiFeaturePlacements: readonly AiriFeaturePlacement[] = [
  {
    surface: "home",
    features: [
      feature("companion.chat", "Companion chat", "伙伴对话", "ready"),
      feature("voice.quick-input", "Voice input", "语音输入", "live"),
      feature("presentation.stop", "Stop speech", "停止播报", "live"),
      feature("avatar.status", "Avatar state", "角色状态", "live"),
    ],
  },
  {
    surface: "workspace",
    features: [
      feature("task.create", "Create task", "创建任务", "live"),
      feature("task.confirm", "Confirm tool", "确认工具", "live"),
      feature("task.retry", "Retry tool", "重试工具", "live"),
      feature("task.steer", "Steer task", "调整任务", "ready"),
      feature("task.cancel", "Stop task", "停止任务", "live"),
    ],
  },
  {
    surface: "lab",
    features: [
      feature("voice.capture-mode", "Hearing mode", "聆听模式", "live"),
      feature("voice.asr", "Transcription", "语音识别", "live"),
      feature("voice.tts", "Speech output", "语音合成", "live"),
      feature("presentation.diagnostics", "Runtime state", "运行时状态", "ready"),
      feature("avatar.preview", "Avatar preview", "角色预览", "ready"),
    ],
  },
  {
    surface: "market",
    features: [
      feature("avatar.select", "Character model", "角色模型", "live"),
      feature("voice.select", "Voice pack", "声音包", "ready"),
      feature("motion.select", "Motion set", "动作集", "ready"),
      feature("persona.select", "Persona", "人格设定", "ready"),
    ],
  },
  {
    surface: "test",
    features: [
      feature("voice.mic-test", "Microphone", "麦克风", "ready"),
      feature("voice.asr-test", "ASR test", "识别测试", "ready"),
      feature("voice.tts-preview", "Voice preview", "声音试听", "ready"),
      feature("provider.smoke-test", "Provider health", "服务检查", "ready"),
      feature("task.acceptance", "Task flow", "任务流程", "ready"),
    ],
  },
  {
    surface: "ledger",
    features: [
      feature("conversation.history", "Conversations", "对话记录", "live"),
      feature("memory.recall", "Memory", "长期记忆", "ready"),
      feature("task.events", "Task events", "任务事件", "ready"),
      feature("task.artifacts", "Artifacts", "任务产物", "ready"),
    ],
  },
  {
    surface: "settings",
    features: [
      feature("provider.credentials", "AI providers", "AI 服务", "live"),
      feature("voice.providers", "Speech providers", "语音服务", "live"),
      feature("audio.devices", "Audio devices", "音频设备", "ready"),
      feature("voice.defaults", "Default voice", "默认声音", "ready"),
      feature("appearance.select", "Appearance", "外观", "live"),
      feature("locale.select", "Language", "语言", "live"),
    ],
  },
];

export function featurePlacementForSurface(surface: DemoSurfaceType): AiriFeaturePlacement {
  const placement = airiFeaturePlacements.find((candidate) => candidate.surface === surface);
  if (!placement) throw new Error(`Missing AIRI feature placement for ${surface}.`);
  return placement;
}

export function featuresForSurface(surface: DemoSurfaceType): readonly string[] {
  return featurePlacementForSurface(surface).features.map((candidate) => candidate.id);
}
