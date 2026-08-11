const COMPLEX_SIGNALS = [
  /\b(multi[- ]?(?:agent|step|phase|module)|parallel|in parallel|research and (?:compare|verify)|independent verification|across .+ and .+)\b/i,
  /(多智能体|多步骤|分阶段|并行|分别研究|独立验证|交叉验证|多个模块|多模块|复杂任务)/,
];

export function createExecutionRouter({ homeRailStatus } = {}) {
  function classify(proposal) {
    if (!proposal || typeof proposal !== "object") throw new TypeError("ExecutionRouter requires a proposal.");
    if (proposal.kind === "plugin-tool") return { kind: "local-plugin", adapter: "airi-plugin-runtime", reason: "explicit-plugin-tool" };
    if (proposal.kind === "mcp-tool") return { kind: "local-mcp", adapter: "airi-mcp-runtime", reason: "explicit-mcp-tool" };
    if (proposal.executionHint === "local-pitch") return { kind: "local-pitch", adapter: "pitchkit", reason: "explicit-local" };
    const objective = typeof proposal.objective === "string" ? proposal.objective : "";
    const complex = proposal.executionHint === "homerail-dag"
      || proposal.complexity === "complex"
      || COMPLEX_SIGNALS.some((pattern) => pattern.test(objective));
    return complex
      ? { kind: "homerail-dag", adapter: "homerail", reason: proposal.executionHint === "homerail-dag" ? "explicit-homerail" : "complex-objective" }
      : { kind: "local-pitch", adapter: "pitchkit", reason: "bounded-local-task" };
  }

  async function route(proposal) {
    const selected = classify(proposal);
    if (selected.kind !== "homerail-dag" || typeof homeRailStatus !== "function") return selected;
    return { ...selected, provider: await homeRailStatus() };
  }

  return { classify, route };
}
