import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import demoBrief from "../resources/pitch-kit/demo-brief.json" with { type: "json" };

const REQUIRED_HEADINGS = [
  "# PitchKit",
  "## 目标与受众",
  "## 问题与价值主张",
  "## 10 页演示大纲",
  "## 演讲备注",
  "## 假设与下一步",
];

export function createPitchProposal({ id, objective, locale }) {
  const chinese = locale === "zh-CN";
  return {
    proposalId: id,
    revision: 1,
    objective,
    executor: chinese ? "PitchKit 执行助手" : "PitchKit production assistant",
    inputs: ["内置的 Preacherman 演示 Brief v1"],
    outputs: ["pitch-kit.md"],
    allowedTools: ["read_pitch_brief", "write_pitch_kit", "validate_pitch_kit", "finish_task"],
    successCriteria: [chinese ? "生成完整、可审阅的 PitchKit Markdown" : "Generate a complete reviewable PitchKit Markdown"],
    editableFields: ["objective"],
  };
}

export async function readPitchBrief() {
  return structuredClone(demoBrief);
}

function dataDirectory(env) {
  return resolve(env.PREACHERMAN_DATA_DIR || join(homedir(), ".preacherman-demo"));
}

export async function writePitchKit({ env, runId, markdown }) {
  const directory = join(dataDirectory(env), "artifacts", runId);
  const target = join(directory, "pitch-kit.md");
  await mkdir(directory, { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, markdown, "utf8");
  await rename(temporary, target);
  return target;
}

export function validatePitchKit(markdown) {
  const missing = REQUIRED_HEADINGS.filter((heading) => !markdown.includes(heading));
  if (missing.length) throw new Error(`PITCH_KIT_INVALID: missing sections ${missing.join(", ")}`);
  return true;
}

export function repairPitchKit(objective, brief) {
  const title = objective || brief.product.name;
  return `# PitchKit\n\n## 目标与受众\n\n- 目标：${title}\n- 受众：${brief.audience}\n\n## 问题与价值主张\n\n${brief.problem}\n\n${brief.valueProposition}\n\n## 10 页演示大纲\n\n${Array.from({ length: 10 }, (_, index) => `${index + 1}. ${brief.slides[index] || `第 ${index + 1} 页关键信息`}`).join("\n")}\n\n## 演讲备注\n\n用一个清晰的故事串联问题、价值、证据和下一步。\n\n## 假设与下一步\n\n- 假设：${brief.assumptions.join("；")}\n- 下一步：确认受众、补充真实数据、审阅演讲稿。\n`;
}

export async function generatePitchKit({ env, objective, brief, fetchImpl = fetch }) {
  if (!env.DEEPSEEK_API_KEY) return repairPitchKit(objective, brief);
  const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      temperature: 0.35,
      max_tokens: 2400,
      messages: [
        { role: "system", content: "你是受限 PitchKit 生成器。只返回 Markdown，不执行外部操作。必须包含：# PitchKit、## 目标与受众、## 问题与价值主张、## 10 页演示大纲、## 演讲备注、## 假设与下一步。" },
        { role: "user", content: JSON.stringify({ objective, brief }) },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "DeepSeek PitchKit generation failed.");
  return payload?.choices?.[0]?.message?.content || repairPitchKit(objective, brief);
}
