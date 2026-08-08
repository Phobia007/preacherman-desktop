import { useState } from "react";
import type { Locale } from "../preferences";
import "./airi-ecosystem-diagnostics.css";

type DiagnosticStatus = "idle" | "running" | "pass" | "fail";

interface DiagnosticStep {
  readonly id: "health" | "kits" | "mcp" | "plugin-tools" | "task-summary";
  readonly status: DiagnosticStatus;
  readonly detail: string;
}

export interface AiriEcosystemDiagnosticsResult {
  readonly steps: readonly DiagnosticStep[];
  readonly taskRunId: string;
  readonly artifactId: string;
}

export type AiriDiagnosticStepListener = (index: number, status: DiagnosticStatus, detail: string) => void;

interface JsonObject {
  readonly [key: string]: unknown;
}

export type AiriDiagnosticServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface AiriEcosystemDiagnosticsProps {
  readonly locale: Locale;
  readonly serviceRequest: AiriDiagnosticServiceRequest;
}

const STEP_IDS: readonly DiagnosticStep["id"][] = [
  "health",
  "kits",
  "mcp",
  "plugin-tools",
  "task-summary",
];

const copy = {
  en: {
    eyebrow: "AIRI integration",
    title: "Ecosystem diagnostics",
    description: "Run the local service, Kits, MCP, plugin host, and TaskRun artifact path in order.",
    run: "Run diagnostics",
    rerun: "Run again",
    running: "Checking ecosystem…",
    passed: "Closed-loop diagnostics passed",
    failed: "Diagnostics finished with failures",
    taskRun: "TaskRun ID",
    artifact: "Artifact ID",
    statuses: { idle: "Waiting", running: "Running", pass: "Passed", fail: "Failed" },
    steps: {
      health: "Local service health",
      kits: "AIRI Kits & Bindings",
      mcp: "MCP tools",
      "plugin-tools": "Plugin tools",
      "task-summary": "Task summary → TaskRun → artifact",
    },
    ready: "Ready to check",
  },
  "zh-CN": {
    eyebrow: "AIRI 集成",
    title: "生态一键诊断",
    description: "依次真实检查本地服务、Kits、MCP、插件宿主，以及 TaskRun 产物闭环。",
    run: "开始诊断",
    rerun: "重新诊断",
    running: "正在检查生态…",
    passed: "生态闭环诊断通过",
    failed: "诊断完成，但存在失败项",
    taskRun: "TaskRun ID",
    artifact: "产物 ID",
    statuses: { idle: "等待", running: "执行中", pass: "通过", fail: "失败" },
    steps: {
      health: "本地服务健康状态",
      kits: "AIRI Kits 与 Bindings",
      mcp: "MCP 工具",
      "plugin-tools": "插件工具",
      "task-summary": "任务摘要 → TaskRun → 产物",
    },
    ready: "等待检查",
  },
} as const;

function initialSteps(): DiagnosticStep[] {
  return STEP_IDS.map((id) => ({ id, status: "idle", detail: "" }));
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is missing.`);
  return value;
}

async function requestJson(serviceRequest: AiriDiagnosticServiceRequest, path: string, init?: RequestInit): Promise<JsonObject> {
  return asObject(await serviceRequest<unknown>(path, init), path);
}

export async function runAiriEcosystemDiagnostics(
  serviceRequest: AiriDiagnosticServiceRequest,
  onStep: AiriDiagnosticStepListener = () => undefined,
): Promise<AiriEcosystemDiagnosticsResult> {
  let steps = initialSteps();
  let taskRunId = "";
  let artifactId = "";
  const emit = (index: number, status: DiagnosticStatus, detail = "") => {
    steps = steps.map((step, candidate) => candidate === index ? { ...step, status, detail } : step);
    onStep(index, status, detail);
  };
  const checks: readonly (() => Promise<string>)[] = [
    async () => {
      const health = await requestJson(serviceRequest, "/api/health");
      if (health.ok !== true) throw new Error("Local service did not report ok=true.");
      return "HTTP 200 · ok=true";
    },
    async () => {
      const response = await requestJson(serviceRequest, "/api/airi/kits");
      const kits = asArray(response.kits, "kits");
      const bindings = asArray(response.bindings, "bindings");
      return `${kits.length} Kits · ${bindings.length} Bindings`;
    },
    async () => {
      const response = await requestJson(serviceRequest, "/api/mcp/tools");
      const tools = asArray(response.tools, "MCP tools");
      return `${tools.length} MCP tools`;
    },
    async () => {
      const response = await requestJson(serviceRequest, "/api/plugins/tools");
      const tools = asArray(response.tools, "plugin tools");
      const names = tools.map((tool) => asObject(tool, "plugin tool").name);
      if (!names.includes("preacherman-runtime::task_summary")) {
        throw new Error("Built-in preacherman-runtime::task_summary is unavailable.");
      }
      return `${tools.length} plugin tools · task_summary ready`;
    },
    async () => {
      const response = await requestJson(serviceRequest, "/api/plugins/tools/call", {
        method: "POST",
        body: JSON.stringify({ name: "preacherman-runtime::task_summary", arguments: {} }),
      });
      const result = asObject(response.result, "plugin result");
      if (result.isError === true) throw new Error("task_summary returned isError=true.");
      const task = asObject(result.task, "TaskRun");
      const artifact = asObject(task.artifact, "artifact");
      if (typeof task.taskId !== "string" || !task.taskId) throw new Error("TaskRun ID is missing.");
      if (typeof artifact.path !== "string" || !artifact.path) throw new Error("Artifact ID is missing.");
      taskRunId = task.taskId;
      artifactId = artifact.path;
      return `${String(task.status)} · ${String(artifact.name ?? artifact.path)}`;
    },
  ];

  for (let index = 0; index < checks.length; index += 1) {
    emit(index, "running");
    try {
      emit(index, "pass", await checks[index]());
    } catch (reason) {
      emit(index, "fail", reason instanceof Error ? reason.message : String(reason));
    }
  }
  return { steps, taskRunId, artifactId };
}

export function AiriEcosystemDiagnostics({ locale, serviceRequest }: AiriEcosystemDiagnosticsProps) {
  const text = copy[locale];
  const [steps, setSteps] = useState<DiagnosticStep[]>(initialSteps);
  const [busy, setBusy] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [taskRunId, setTaskRunId] = useState("");
  const [artifactId, setArtifactId] = useState("");

  const updateStep = (index: number, status: DiagnosticStatus, detail = "") => {
    setSteps((current) => current.map((step, candidate) => candidate === index
      ? { ...step, status, detail }
      : step));
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setHasRun(true);
    setTaskRunId("");
    setArtifactId("");
    setSteps(initialSteps());

    try {
      const result = await runAiriEcosystemDiagnostics(serviceRequest, updateStep);
      setTaskRunId(result.taskRunId);
      setArtifactId(result.artifactId);
    } finally {
      setBusy(false);
    }
  };

  const failed = steps.some((step) => step.status === "fail");
  const passed = hasRun && !busy && steps.every((step) => step.status === "pass");

  return <section className="demo-airi-diagnostics" data-airi-control="runtime.ecosystem-diagnostics" aria-labelledby="airi-diagnostics-title">
    <header className="demo-airi-diagnostics__header">
      <div>
        <span className="demo-airi-diagnostics__eyebrow">{text.eyebrow}</span>
        <h2 id="airi-diagnostics-title">{text.title}</h2>
        <p>{text.description}</p>
      </div>
      <button disabled={busy} onClick={() => void run()} type="button">
        {busy ? text.running : hasRun ? text.rerun : text.run}
      </button>
    </header>

    <ol className="demo-airi-diagnostics__steps" aria-live="polite" aria-busy={busy}>
      {steps.map((step) => <li key={step.id} data-status={step.status}>
        <span className="demo-airi-diagnostics__marker" aria-hidden="true" />
        <div>
          <strong>{text.steps[step.id]}</strong>
          <small>{step.detail || (step.status === "idle" ? text.ready : text.statuses[step.status])}</small>
        </div>
        <span className="demo-airi-diagnostics__status">{text.statuses[step.status]}</span>
      </li>)}
    </ol>

    {taskRunId || artifactId ? <dl className="demo-airi-diagnostics__result">
      {taskRunId ? <div><dt>{text.taskRun}</dt><dd>{taskRunId}</dd></div> : null}
      {artifactId ? <div><dt>{text.artifact}</dt><dd>{artifactId}</dd></div> : null}
    </dl> : null}

    {hasRun && !busy ? <p className="demo-airi-diagnostics__summary" data-status={passed ? "pass" : "fail"} role={failed ? "alert" : "status"}>
      {passed ? text.passed : text.failed}
    </p> : null}
  </section>;
}
