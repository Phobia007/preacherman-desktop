export type DemoSurfaceType = "home" | "workspace" | "lab" | "market" | "test" | "ledger" | "settings";
export type AiriFeatureStatus = "live" | "ready";
export type AiriFeatureSectionKind = "primary" | "workflow" | "extension" | "system";

export interface AiriFeatureDefinition {
  readonly id: string;
  readonly label: { readonly en: string; readonly "zh-CN": string };
  readonly status: AiriFeatureStatus;
  readonly target?: {
    readonly surface: DemoSurfaceType;
    readonly control?: string;
  };
}

export interface AiriFeaturePlacement {
  readonly surface: DemoSurfaceType;
  readonly features: readonly AiriFeatureDefinition[];
  readonly sections: readonly AiriFeatureSection[];
}

export interface AiriFeatureSection {
  readonly id: string;
  readonly title: { readonly en: string; readonly "zh-CN": string };
  readonly kind: AiriFeatureSectionKind;
  readonly featureIds: readonly string[];
}

const feature = (
  id: string,
  en: string,
  zhCN: string,
  status: AiriFeatureStatus = "ready",
  target?: AiriFeatureDefinition["target"],
): AiriFeatureDefinition => ({ id, label: { en, "zh-CN": zhCN }, status, target });

const section = (
  id: string,
  en: string,
  zhCN: string,
  kind: AiriFeatureSectionKind,
  featureIds: readonly string[],
): AiriFeatureSection => ({ id, title: { en, "zh-CN": zhCN }, kind, featureIds });

/**
 * The complete AIRI capability catalog is grouped under Preacherman's stable
 * navigation. "live" locates a working local control. "ready" deliberately
 * keeps the upstream capability visible while its runtime/provider is absent.
 */
export const airiFeaturePlacements: readonly AiriFeaturePlacement[] = [
  {
    surface: "home",
    features: [
      feature("companion.chat", "Companion chat", "伙伴对话", "live", { surface: "workspace", control: "companion.chat" }),
      feature("companion.realtime-voice", "Realtime voice chat", "实时语音对话", "live", { surface: "home", control: "voice.quick-input" }),
      feature("voice.quick-input", "Voice input", "语音输入", "live"),
      feature("presentation.stop", "Stop speech", "停止播报", "live"),
      feature("avatar.status", "Avatar state", "角色状态", "live"),
      feature("companion.reasoning", "Streaming reasoning", "流式思考过程"),
      feature("vision.camera", "Camera vision", "摄像头视觉"),
      feature("vision.screen", "Screen perception", "屏幕感知"),
      feature("artistry.image-generation", "Image generation", "图像生成"),
      feature("computer-use.desktop", "Desktop control", "桌面控制"),
      feature("computer-use.browser", "Browser control", "浏览器控制"),
      feature("scene.transparent-background", "Transparent stage", "透明舞台"),
      feature("shortcut.global", "Global shortcuts", "全局快捷键"),
      feature("stage.pocket", "Pocket companion", "移动端伙伴"),
    ],
    sections: [
      section("start", "Start here", "开始使用", "primary", ["companion.chat", "companion.realtime-voice"]),
      section("session", "Live session", "实时会话", "workflow", ["voice.quick-input", "presentation.stop", "avatar.status"]),
      section("intelligence", "Perception & creation", "感知与创作", "extension", ["companion.reasoning", "vision.camera", "vision.screen", "artistry.image-generation"]),
      section("device", "Device & stage", "设备与舞台", "system", ["computer-use.desktop", "computer-use.browser", "scene.transparent-background", "shortcut.global", "stage.pocket"]),
    ],
  },
  {
    surface: "workspace",
    features: [
      feature("task.create", "Create task", "创建任务", "live"),
      feature("task.confirm", "Confirm tool", "确认工具", "live"),
      feature("task.retry", "Retry tool", "重试工具", "live"),
      feature("task.steer", "Steer task", "调整任务"),
      feature("task.cancel", "Stop task", "停止任务", "live"),
      feature("agent.tool-approval", "Tool approval", "工具审批", "ready", { surface: "workspace", control: "task.confirm" }),
      feature("agent.mcp-tools", "MCP tools", "MCP 工具", "live"),
      feature("agent.plugin-tools", "Plugin tools", "插件工具"),
      feature("agent.kits-api", "Kits API", "Kits API"),
      feature("agent.bindings-api", "Bindings API", "Bindings API"),
      feature("computer-use.dom", "DOM-aware actions", "DOM 感知操作"),
      feature("computer-use.session", "Computer session", "电脑操作会话"),
      feature("computer-use.transcript", "Action transcript", "操作过程记录"),
      feature("game.minecraft", "Play Minecraft", "玩 Minecraft"),
      feature("game.factorio", "Play Factorio", "玩 Factorio"),
      feature("game.kerbal", "Play Kerbal Space Program", "玩坎巴拉太空计划"),
      feature("game.helldivers", "Co-play Helldivers 2", "协玩绝地潜兵 2"),
      feature("game.chess", "Chess gamelet", "国际象棋组件"),
    ],
    sections: [
      section("start", "Start a task", "开始任务", "primary", ["task.create", "task.confirm"]),
      section("control", "Run controls", "执行控制", "workflow", ["task.steer", "task.retry", "task.cancel"]),
      section("tools", "Agent tools", "智能体工具", "extension", ["agent.tool-approval", "agent.mcp-tools", "agent.plugin-tools", "agent.kits-api", "agent.bindings-api"]),
      section("computer", "Computer use", "电脑操作", "extension", ["computer-use.dom", "computer-use.session", "computer-use.transcript"]),
      section("games", "Game integrations", "游戏连接", "system", ["game.minecraft", "game.factorio", "game.kerbal", "game.helldivers", "game.chess"]),
    ],
  },
  {
    surface: "lab",
    features: [
      feature("voice.capture-mode", "Hearing mode", "聆听模式", "live"),
      feature("voice.asr", "Speech recognition", "语音识别", "live"),
      feature("voice.client-asr", "On-device ASR", "端侧语音识别"),
      feature("voice.vad", "Talking detection", "说话检测", "live", { surface: "lab", control: "voice.capture-mode" }),
      feature("voice.tts", "Speech synthesis", "语音合成", "live"),
      feature("voice.tts-preview", "Voice preview", "声音试听", "ready", { surface: "lab", control: "voice.tts" }),
      feature("voice.discord-input", "Discord audio input", "Discord 音频输入"),
      feature("presentation.diagnostics", "Runtime state", "运行时状态"),
      feature("avatar.preview", "Avatar preview", "角色预览", "ready", { surface: "market", control: "avatar.select" }),
      feature("avatar.vrm", "VRM body", "VRM 身体"),
      feature("avatar.live2d", "Live2D body", "Live2D 身体"),
      feature("avatar.lip-sync", "Lip sync", "口型同步"),
      feature("motion.auto-blink", "Auto blink", "自动眨眼"),
      feature("motion.auto-look", "Auto look-at", "自动注视"),
      feature("motion.idle-eyes", "Idle eye motion", "待机眼球运动"),
      feature("motion.expression", "Emotion expressions", "情绪表情"),
      feature("motion.runtime", "Motion runtime", "动作运行时", "ready", { surface: "market", control: "motion.select" }),
      feature("stage.offset", "Character offset", "角色位置偏移"),
      feature("stage.webxr", "WebXR stage", "WebXR 舞台"),
      feature("stage.godot", "Godot stage", "Godot 舞台"),
    ],
    sections: [
      section("voice", "Voice session", "语音会话", "primary", ["voice.capture-mode", "voice.asr", "voice.tts"]),
      section("speech-control", "Speech controls", "语音控制", "workflow", ["voice.vad", "voice.tts-preview", "voice.client-asr"]),
      section("body", "Avatar output", "角色输出", "extension", ["avatar.preview", "avatar.vrm", "avatar.live2d", "avatar.lip-sync", "motion.auto-blink", "motion.auto-look", "motion.idle-eyes", "motion.expression", "motion.runtime"]),
      section("runtime", "Advanced runtime", "高级运行时", "system", ["voice.discord-input", "presentation.diagnostics", "stage.offset", "stage.webxr", "stage.godot"]),
    ],
  },
  {
    surface: "market",
    features: [
      feature("avatar.select", "Character model", "角色模型", "live"),
      feature("avatar.vrm-import", "Import VRM", "导入 VRM"),
      feature("avatar.live2d-import", "Import Live2D", "导入 Live2D"),
      feature("avatar.asset-report", "Model structure report", "模型结构报告"),
      feature("voice.select", "Voice pack", "声音包"),
      feature("voice.generated-preview", "Generated voice", "生成式声音"),
      feature("motion.select", "Motion set", "动作集", "live"),
      feature("persona.select", "Persona", "人格设定"),
      feature("airi-card.create", "AIRI Card", "AIRI 角色卡"),
      feature("scene.background", "Scene background", "场景背景"),
      feature("scene.background-transparent", "Transparent background", "透明背景"),
      feature("plugin.library", "Plugin library", "插件库"),
      feature("plugin.widgets", "Plugin widgets", "插件组件"),
      feature("plugin.gamelets", "Gamelets", "游戏组件"),
    ],
    sections: [
      section("identity", "Build identity", "构建身份", "primary", ["avatar.select", "persona.select", "voice.select", "motion.select"]),
      section("imports", "Import & validate", "导入与校验", "workflow", ["avatar.vrm-import", "avatar.live2d-import", "avatar.asset-report"]),
      section("presentation", "Presentation assets", "呈现资产", "extension", ["voice.generated-preview", "airi-card.create", "scene.background", "scene.background-transparent"]),
      section("extensions", "Extensions", "扩展组件", "system", ["plugin.library", "plugin.widgets", "plugin.gamelets"]),
    ],
  },
  {
    surface: "test",
    features: [
      feature("voice.mic-test", "Microphone test", "麦克风测试", "ready", { surface: "lab", control: "voice.quick-input" }),
      feature("voice.asr-test", "ASR test", "识别测试", "ready", { surface: "lab", control: "voice.asr" }),
      feature("voice.tts-test", "TTS test", "合成测试", "ready", { surface: "lab", control: "voice.tts" }),
      feature("provider.smoke-test", "Provider health", "服务检查", "ready", { surface: "settings", control: "provider.credentials" }),
      feature("task.acceptance", "Task flow", "任务流程", "ready", { surface: "workspace", control: "task.create" }),
      feature("runtime.io-tracer", "IO Tracer", "IO 追踪器"),
      feature("runtime.reasoning-trace", "Reasoning trace", "思考过程追踪"),
      feature("runtime.plugin-inspector", "Plugin inspector", "插件检查器"),
      feature("runtime.mcp-test", "MCP connection test", "MCP 连接测试", "ready", { surface: "settings", control: "mcp.servers" }),
      feature("model.local-inference-test", "Local inference", "本地推理"),
      feature("model.webgpu-test", "WebGPU runtime", "WebGPU 运行时"),
      feature("computer-use.dom-inspector", "DOM inspector", "DOM 检查器"),
      feature("computer-use.overlay", "Desktop overlay", "桌面悬浮层"),
      feature("plugin.hot-reload", "Plugin hot reload", "插件热重载"),
      feature("stage.mobile-preview", "Mobile stage preview", "移动舞台预览"),
    ],
    sections: [
      section("smoke", "Quick checks", "快速检查", "primary", ["voice.mic-test", "voice.asr-test", "voice.tts-test", "provider.smoke-test", "task.acceptance"]),
      section("observability", "Observability", "运行观测", "workflow", ["runtime.io-tracer", "runtime.reasoning-trace", "runtime.plugin-inspector", "runtime.mcp-test"]),
      section("platform", "Platform diagnostics", "平台诊断", "system", ["model.local-inference-test", "model.webgpu-test", "computer-use.dom-inspector", "computer-use.overlay", "plugin.hot-reload", "stage.mobile-preview"]),
    ],
  },
  {
    surface: "ledger",
    features: [
      feature("conversation.history", "Conversations", "对话记录", "live"),
      feature("memory.recall", "Memory recall", "长期记忆", "ready", { surface: "ledger", control: "conversation.history" }),
      feature("memory.browser-database", "Browser database", "浏览器数据库"),
      feature("memory.alaya", "Memory Alaya", "Alaya 记忆层"),
      feature("memory.lorebook", "Lorebook", "角色知识库"),
      feature("memory.time-awareness", "Time awareness", "时间感知"),
      feature("task.events", "Task events", "任务事件", "live"),
      feature("task.artifacts", "Artifacts", "任务产物", "live"),
      feature("journal.generated-images", "Image journal", "生成图像日志"),
      feature("runtime.io-history", "Runtime IO history", "运行时 IO 历史", "live"),
      feature("plugin.activity", "Plugin activity", "插件活动", "live"),
    ],
    sections: [
      section("review", "Review activity", "查看活动", "primary", ["conversation.history", "task.events", "task.artifacts"]),
      section("memory", "Memory layers", "记忆层", "extension", ["memory.recall", "memory.browser-database", "memory.alaya", "memory.lorebook", "memory.time-awareness"]),
      section("runtime", "Runtime history", "运行历史", "workflow", ["journal.generated-images", "runtime.io-history", "plugin.activity"]),
    ],
  },
  {
    surface: "settings",
    features: [
      feature("provider.credentials", "AI providers", "AI 服务", "live"),
      feature("voice.providers", "Speech providers", "语音服务", "live"),
      feature("vision.providers", "Vision providers", "视觉服务"),
      feature("provider.catalog", "Provider catalog", "服务商目录"),
      feature("provider.openai-compatible", "OpenAI-compatible", "OpenAI 兼容服务"),
      feature("provider.ollama", "Ollama", "Ollama"),
      feature("provider.lm-studio", "LM Studio", "LM Studio"),
      feature("provider.cloudflare", "Cloudflare Workers AI", "Cloudflare Workers AI"),
      feature("provider.azure-foundry", "Azure AI Foundry", "Azure AI Foundry"),
      feature("provider.amazon-bedrock", "Amazon Bedrock", "Amazon Bedrock"),
      feature("voice.elevenlabs", "ElevenLabs TTS", "ElevenLabs 语音"),
      feature("voice.azure-speech", "Azure Speech", "Azure 语音"),
      feature("voice.openai-compatible", "OpenAI-compatible TTS", "OpenAI 兼容语音"),
      feature("voice.alibaba", "Alibaba Model Studio", "阿里云百炼语音"),
      feature("voice.kokoro", "Local Kokoro TTS", "本地 Kokoro 语音"),
      feature("voice.xiaomi-mimo", "Xiaomi MiMo", "小米 MiMo"),
      feature("voice.aliyun-nls", "Aliyun NLS ASR", "阿里云 NLS 识别"),
      feature("voice.stepfun", "StepFun TTS", "阶跃星辰语音"),
      feature("audio.devices", "Audio devices", "音频设备"),
      feature("voice.defaults", "Default voice", "默认声音"),
      feature("voice.vad-settings", "Voice activity", "语音活动检测", "ready", { surface: "lab", control: "voice.capture-mode" }),
      feature("mcp.servers", "MCP servers", "MCP 服务器", "live"),
      feature("plugin.manager", "Plugin manager", "插件管理"),
      feature("connection.discord", "Discord", "Discord 连接"),
      feature("connection.telegram", "Telegram", "Telegram 连接"),
      feature("connection.youtube", "YouTube live chat", "YouTube 直播聊天"),
      feature("connection.minecraft", "Minecraft", "Minecraft 连接"),
      feature("connection.factorio", "Factorio", "Factorio 连接"),
      feature("appearance.select", "Appearance", "外观", "live"),
      feature("locale.select", "Language", "语言", "live"),
    ],
    sections: [
      section("setup", "Core setup", "核心配置", "primary", ["provider.credentials", "voice.providers"]),
      section("ai", "AI providers", "AI 服务商", "extension", ["vision.providers", "provider.catalog", "provider.openai-compatible", "provider.ollama", "provider.lm-studio", "provider.cloudflare", "provider.azure-foundry", "provider.amazon-bedrock"]),
      section("speech", "Speech pipeline", "语音链路", "extension", ["voice.elevenlabs", "voice.azure-speech", "voice.openai-compatible", "voice.alibaba", "voice.kokoro", "voice.xiaomi-mimo", "voice.aliyun-nls", "voice.stepfun", "audio.devices", "voice.defaults", "voice.vad-settings"]),
      section("extensions", "Tools & extensions", "工具与扩展", "system", ["mcp.servers", "plugin.manager"]),
      section("connections", "External connections", "外部连接", "system", ["connection.discord", "connection.telegram", "connection.youtube", "connection.minecraft", "connection.factorio"]),
      section("preferences", "Preferences", "偏好设置", "workflow", ["appearance.select", "locale.select"]),
    ],
  },
];

export function featurePlacementForSurface(surface: DemoSurfaceType): AiriFeaturePlacement {
  const placement = airiFeaturePlacements.find((candidate) => candidate.surface === surface);
  if (!placement) throw new Error(`Missing AIRI feature placement for ${surface}.`);
  return placement;
}

export function findAiriFeature(featureId: string): AiriFeatureDefinition | undefined {
  return airiFeaturePlacements.flatMap((placement) => placement.features)
    .find((candidate) => candidate.id === featureId);
}

export function featuresForSurface(surface: DemoSurfaceType): readonly string[] {
  return featurePlacementForSurface(surface).features.map((candidate) => candidate.id);
}
