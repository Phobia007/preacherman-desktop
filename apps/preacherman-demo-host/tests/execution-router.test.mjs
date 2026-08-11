import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionRouter } from "../server/execution/executionRouter.mjs";

test("simple Plugin and MCP work never creates a HomeRail route", () => {
  const router = createExecutionRouter();
  assert.equal(router.classify({ kind: "plugin-tool", objective: "Run summary" }).kind, "local-plugin");
  assert.equal(router.classify({ kind: "mcp-tool", objective: "Read status" }).kind, "local-mcp");
  assert.equal(router.classify({ kind: "pitch", objective: "Create one concise demo pitch" }).kind, "local-pitch");
});

test("complex decomposition and verification selects the HomeRail DAG without exposing workflows as buttons", async () => {
  const router = createExecutionRouter({ homeRailStatus: async () => ({ state: "configuration-required" }) });
  const route = await router.route({ kind: "task", objective: "Research three markets in parallel and independently verify the evidence" });
  assert.equal(route.kind, "homerail-dag");
  assert.equal(route.reason, "complex-objective");
  assert.equal(route.provider.state, "configuration-required");
});
