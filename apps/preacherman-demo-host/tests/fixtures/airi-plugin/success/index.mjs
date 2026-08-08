export default {
  abi: "preacherman.plugin.v1",
  version: "1.2.3",
  async activate({ pluginId, hostBridge, kits, bindings }) {
    globalThis.__preachermanFixtureActivations = (globalThis.__preachermanFixtureActivations ?? 0) + 1;
    kits?.require?.("task", "^1.0.0");
    kits?.require?.("ledger", "^1.0.0");
    return {
      tools: [{
        name: "echo",
        description: "Return the supplied label through the external plugin bridge.",
        inputSchema: {
          type: "object",
          properties: {
            label: { type: "string" },
            count: { type: "number" },
            enabled: { type: "boolean" },
            tags: { type: "array", items: { type: "string" } },
            metadata: {
              type: "object",
              properties: { code: { type: "string" } },
              required: ["code"],
              additionalProperties: false
            }
          },
          required: ["label"],
          additionalProperties: false
        },
        async execute(args) {
          if (args.label === "timeout") return new Promise(() => {});
          return {
            pluginId,
            label: args.label ?? "fixture",
            ...(hostBridge?.name ? { hostBridge: hostBridge.name } : {}),
            ...(kits ? { hasKits: true } : {}),
            ...(bindings ? { hasBindings: true } : {})
          };
        }
      }],
      async dispose() {
        globalThis.__preachermanFixtureDisposals = (globalThis.__preachermanFixtureDisposals ?? 0) + 1;
      }
    };
  }
};
