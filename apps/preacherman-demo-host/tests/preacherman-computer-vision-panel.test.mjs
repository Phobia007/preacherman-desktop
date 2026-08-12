import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const componentFile = join(packageRoot, "src", "preacherman", "PreachermanComputerVisionPanel.tsx");
const stylesFile = join(packageRoot, "src", "preacherman", "preacherman-computer-vision-panel.css");

test("Computer/Vision panel reads status and only posts explicit tests, local image analysis, reads, or approval decisions", async () => {
  const component = await readFile(componentFile, "utf8");

  assert.match(component, /serviceRequest<unknown>\("\/api\/computer-vision"\)/);
  assert.match(component, /`\/api\/computer-vision\/\$\{encodeURIComponent\(capability\)\}\/test`/);
  assert.match(component, /method: "POST"/);
  assert.match(component, /body: "\{\}"/);
  assert.match(component, /"\/api\/computer-vision\/vision-analysis\/invoke"/);
  assert.match(component, /const input = \{ image: \{ localPath \}/);
  assert.match(component, /`\/api\/computer-vision\/computer-use\/\$\{operation\}`/);
  assert.match(component, /`\/api\/computer-vision\/computer-use\/approvals\/\$\{encodeURIComponent\(approvalId\)\}`/);
  assert.doesNotMatch(component, /\/actions|mediaDevices|getDisplayMedia|getUserMedia|FileReader|navigator\./);
});

test("local image analysis validates the response and never reads or echoes browser file content", async () => {
  const component = await readFile(componentFile, "utf8");

  assert.match(component, /export async function invokePreachermanLocalVisionAnalysis/);
  assert.match(component, /result\.capability !== "vision-analysis"/);
  assert.match(component, /\["succeeded", "failed", "configuration-required", "external-runtime-required"\]/);
  assert.match(component, /typeof output\.summary !== "string"/);
  assert.match(component, /Array\.isArray\(output\.detections\)/);
  assert.match(component, /typeof detection\.label !== "string"/);
  assert.match(component, /detection\.confidence < 0 \|\| detection\.confidence > 1/);
  assert.match(component, /status === "external-runtime-required" && error !== undefined/);
  assert.match(component, /status === "failed" \|\| status === "configuration-required"/);
  assert.match(component, /if \(error !== undefined\) throw new Error\("Vision analysis success response is invalid\."\)/);
  assert.match(component, /visionCapability\?\.adapter && visionCapability\.phase === "ready"/);
  assert.match(component, /disabled=\{!canAnalyzeLocalImage\}/);
  assert.match(component, /type="text"/);
  assert.doesNotMatch(component, /type="file"|readAsDataURL|createObjectURL/);
  assert.doesNotMatch(component, /result\.localPath|analysisResult\.localPath/);
});

test("local image workflow exposes bilingual labels, ARIA state, and honest result phases", async () => {
  const component = await readFile(componentFile, "utf8");

  for (const phrase of [
    "Analyze a trusted local image", "分析可信本地图片", "Local image path", "本地图片路径",
    "Analysis prompt", "分析提示词", "Configuration required", "需要配置",
    "External runtime required", "需要外部运行时", "Analysis succeeded", "分析成功",
    "Analysis failed", "分析失败",
  ]) {
    assert.match(component, new RegExp(phrase));
  }
  assert.match(component, /aria-describedby=\{`\$\{titleId\}-local-vision-hint`\}/);
  assert.match(component, /aria-busy=\{visionInvocation\.phase === "running"\}/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /data-state=\{visionInvocation\.phase\}/);
});

test("Computer Use area keeps reads scoped and every write approval individually actionable", async () => {
  const component = await readFile(componentFile, "utf8");

  assert.match(component, /"observe" \| "inspect-dom"/);
  assert.match(component, /computerUse\.targets\.map/);
  assert.match(component, /computerUse\.adapter \|\| computerUse\.phase !== "ready"/);
  assert.match(component, /approvals\.map\(\(approval\)/);
  assert.match(component, /decideApproval\(approval\.id, "approve"\)/);
  assert.match(component, /decideApproval\(approval\.id, "deny"\)/);
  assert.match(component, /operations\.slice\(-8\)\.reverse\(\)/);
  assert.match(component, /Every click, key, scroll, or text action needs a separate host approval/);
  assert.match(component, /每一次点击、按键、滚动或文本输入都必须由宿主单独批准/);
  assert.match(component, /仅批准本次/);
});

test("panel renders all four real backend phases, adapter, last test, and safe errors", async () => {
  const component = await readFile(componentFile, "utf8");

  for (const capability of ["screenshot", "camera-window", "cursor-monitor", "vision-analysis"]) {
    assert.match(component, new RegExp(`"${capability}"`));
  }
  assert.match(component, /capability\.phase/);
  assert.match(component, /capability\.adapter\?\.pluginId/);
  assert.match(component, /capability\.lastTest/);
  assert.match(component, /capability\.lastError\?\.message/);
  assert.match(component, /external-runtime-required/);
  assert.match(component, /No external adapter registered/);
  assert.match(component, /尚未注册外部适配器/);
  assert.match(component, /Computer & vision/);
  assert.match(component, /计算机与视觉/);
});

test("test control is disabled without a ready adapter and exposes accessible live state", async () => {
  const component = await readFile(componentFile, "utf8");

  assert.match(component, /const canTest = capability\.adapter !== null && capability\.phase === "ready" && testingId === null/);
  assert.match(component, /disabled=\{!canTest\}/);
  assert.match(component, /if \(!capability\.adapter \|\| capability\.phase !== "ready" \|\| testingId\) return/);
  assert.match(component, /aria-labelledby=\{titleId\}/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-busy=\{loading \|\| testingId !== null\}/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /aria-label=\{`\$\{text\.test\}: \$\{capability\.name \|\| text\.fallbackNames\[id\]\}`\}/);
});

test("standalone panel styles inherit the semantic light and dark theme contract", async () => {
  const styles = await readFile(stylesFile, "utf8");

  for (const token of [
    "text", "muted", "border", "border-strong", "surface", "surface-elevated",
    "focus", "loading", "error", "control", "control-hover-bg",
  ]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /button:disabled/);
  assert.match(styles, /data-phase="ready"/);
  assert.match(styles, /data-phase="error"/);
  assert.match(styles, /@media \(max-width:/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
