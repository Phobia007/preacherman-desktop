const COMPLEX_SIGNALS = [
  /\b(multi[- ]?(?:agent|step|phase|module)|parallel|in parallel|research and (?:compare|verify)|independent verification|across .+ and .+)\b/i,
  /(多智能体|多步骤|分阶段|并行|分别研究|独立验证|交叉验证|多个模块|多模块|复杂任务)/,
];

export function createExecutionRouter({ preachermanExecutionStatus } = {}) {
  function classify(proposal) {
    if (!proposal || typeof proposal !== "object") throw new TypeError("ExecutionRouter requires a proposal.");
    if (proposal.kind === "plugin-tool") return { kind: "local-plugin", adapter: "preacherman-plugin-runtime", reason: "explicit-plugin-tool" };
    if (proposal.kind === "mcp-tool") return { kind: "local-mcp", adapter: "preacherman-mcp-runtime", reason: "explicit-mcp-tool" };
    if (proposal.executionHint === "local-pitch") return { kind: "local-pitch", adapter: "pitchkit", reason: "explicit-local" };
    const objective = typeof proposal.objective === "string" ? proposal.objective : "";
    const complex = proposal.executionHint === "preacherman-execution-dag"
      || proposal.complexity === "complex"
      || COMPLEX_SIGNALS.some((pattern) => pattern.test(objective));
    return complex
      ? { kind: "preacherman-execution-dag", adapter: "preacherman-execution", reason: proposal.executionHint === "preacherman-execution-dag" ? "explicit-preacherman-execution" : "complex-objective" }
      : { kind: "local-pitch", adapter: "pitchkit", reason: "bounded-local-task" };
  }

  async function route(proposal) {
    const selected = classify(proposal);
    if (selected.kind !== "preacherman-execution-dag" || typeof preachermanExecutionStatus !== "function") return selected;
    return { ...selected, provider: await preachermanExecutionStatus() };
  }

  return { classify, route };
}
