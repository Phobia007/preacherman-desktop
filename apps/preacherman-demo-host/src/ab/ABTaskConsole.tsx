import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Locale } from "../preferences";
import { ABOrchestrator } from "./ABOrchestrator";
import { MockActionAdapter, MockExecutorAgentAdapter, MockFrontAgentAdapter } from "./MockAdapters";
import type { ABTaskSnapshot } from "./contracts";
import "./ab-task-console.css";

const initialSnapshot: ABTaskSnapshot = {
  state: "idle",
  task: null,
  events: [],
  result: null,
  conversational_result: "",
  pending_approval: null,
  last_command: null,
  error: null,
};

const copy = {
  en: {
    eyebrow: "AB Protocol · Mock",
    title: "Agent coordination",
    description: "Test the contract, approval, and result path without a model API.",
    placeholder: "Describe a task for A Agent to hand to B Agent…",
    start: "Run mock task",
    cancel: "Cancel",
    approve: "Approve",
    reject: "Reject",
    approval: "Approval required",
    result: "A Agent response",
    noExternal: "Mock only · no external action",
    states: {
      idle: "Ready",
      accepted: "Accepted",
      running: "B Agent running",
      waiting_for_approval: "Waiting for approval",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    },
  },
  "zh-CN": {
    eyebrow: "AB 协议 · 模拟",
    title: "Agent 协作验证",
    description: "无需模型 API，先验证合同、审批与结果回传链路。",
    placeholder: "输入一个任务，让 A Agent 整理后交给 B Agent…",
    start: "运行模拟任务",
    cancel: "取消",
    approve: "批准",
    reject: "拒绝",
    approval: "需要你的批准",
    result: "A Agent 回复",
    noExternal: "仅模拟 · 不产生外部操作",
    states: {
      idle: "就绪",
      accepted: "已接收",
      running: "B Agent 执行中",
      waiting_for_approval: "等待批准",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消",
    },
  },
} as const;

function latestProgress(snapshot: ABTaskSnapshot): number {
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const event = snapshot.events[index];
    if (event.type === "progress" && typeof event.payload.progress === "number") {
      return event.payload.progress;
    }
  }
  return snapshot.state === "completed" ? 1 : 0;
}

function latestMessage(snapshot: ABTaskSnapshot): string {
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const message = snapshot.events[index].payload.message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function ABTaskConsole({ locale }: { readonly locale: Locale }) {
  const labels = copy[locale];
  const orchestrator = useMemo(() => new ABOrchestrator({
    frontAgent: new MockFrontAgentAdapter(),
    executorAgent: new MockExecutorAgentAdapter(new MockActionAdapter()),
    locale,
  }), [locale]);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [input, setInput] = useState("");

  useEffect(() => orchestrator.subscribe(setSnapshot), [orchestrator]);

  const active = ["accepted", "running", "waiting_for_approval"].includes(snapshot.state);
  const progress = latestProgress(snapshot);
  const message = latestMessage(snapshot);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || active) return;
    orchestrator.submit(input);
  };

  return (
    <section className="ab-task-console" data-state={snapshot.state}>
      <header className="ab-task-console__header">
        <div>
          <span className="ab-task-console__eyebrow">{labels.eyebrow}</span>
          <h2>{labels.title}</h2>
        </div>
        <span className="ab-task-console__state">{labels.states[snapshot.state]}</span>
      </header>

      <p className="ab-task-console__description">{labels.description}</p>

      <form className="ab-task-console__form" onSubmit={submit}>
        <textarea
          aria-label={labels.placeholder}
          disabled={active}
          onChange={(event) => setInput(event.target.value)}
          placeholder={labels.placeholder}
          rows={3}
          value={input}
        />
        <div className="ab-task-console__actions">
          <span>{labels.noExternal}</span>
          {active ? (
            <button className="ab-task-console__button ab-task-console__button--quiet" onClick={() => orchestrator.cancel()} type="button">
              {labels.cancel}
            </button>
          ) : (
            <button className="ab-task-console__button ab-task-console__button--primary" disabled={!input.trim()} type="submit">
              {labels.start}
            </button>
          )}
        </div>
      </form>

      {snapshot.state !== "idle" ? (
        <div aria-live="polite" className="ab-task-console__activity">
          <div className="ab-task-console__progress" aria-label={`${Math.round(progress * 100)}%`}>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="ab-task-console__handoff" aria-label="A to B coordination path">
            <span data-active={snapshot.events.some((event) => event.type === "accepted")}>A</span>
            <i />
            <span data-active={snapshot.events.some((event) => event.emitted_by.role === "orchestrator")}>O</span>
            <i />
            <span data-active={snapshot.events.some((event) => event.emitted_by.role === "executor_agent")}>B</span>
          </div>
          {message ? <p>{message}</p> : null}
        </div>
      ) : null}

      {snapshot.pending_approval ? (
        <section className="ab-task-console__approval">
          <span>{labels.approval}</span>
          <strong>{snapshot.pending_approval.action}</strong>
          <p>{snapshot.pending_approval.summary}</p>
          <div>
            <button className="ab-task-console__button ab-task-console__button--primary" onClick={() => orchestrator.approve()} type="button">
              {labels.approve}
            </button>
            <button className="ab-task-console__button ab-task-console__button--quiet" onClick={() => orchestrator.reject()} type="button">
              {labels.reject}
            </button>
          </div>
        </section>
      ) : null}

      {(snapshot.conversational_result || snapshot.error) ? (
        <section className="ab-task-console__result" data-error={Boolean(snapshot.error)}>
          <span>{labels.result}</span>
          <p>{snapshot.error || snapshot.conversational_result}</p>
        </section>
      ) : null}
    </section>
  );
}
