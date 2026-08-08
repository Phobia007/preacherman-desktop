export default {
  abi: "preacherman.plugin.v1",
  version: "1.2.3",
  async activate({ pluginId, hostBridge, kits, bindings }) {
    globalThis.__preachermanFixtureActivations = (globalThis.__preachermanFixtureActivations ?? 0) + 1;
    kits?.require?.("task", "^1.0.0");
    kits?.require?.("ledger", "^1.0.0");
    const ecosystemKits = new Set(kits?.discover?.().map((kit) => kit.name) ?? []);
    const usesEcosystemBindings = ecosystemKits.has("widget") && ecosystemKits.has("memory");
    if (usesEcosystemBindings) {
      kits.require("widget", "^1.0.0");
      kits.require("memory", "^1.0.0");
      await bindings.invoke({
        kit: "widget",
        operation: "register",
        versionRange: "^1.0.0",
        input: {
          manifest: {
            apiVersion: "v1",
            kind: "widget.airi.moeru.ai",
            id: "fixture-status",
            version: "1.0.0",
            title: "Fixture status",
            placement: "settings",
          },
          schema: { type: "text", text: "External plugin widget loaded" },
        },
      });
    }
    return {
      ...(usesEcosystemBindings ? {} : { widgets: [{
        manifest: {
          apiVersion: "v1",
          kind: "widget.airi.moeru.ai",
          id: "fixture-status",
          version: "1.0.0",
          title: "Fixture status",
          placement: "settings",
        },
        schema: { type: "text", text: "External plugin widget loaded" },
      }] }),
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
      }, {
        name: "binding_task",
        description: "Create and complete a TaskRun through the Task and Ledger bindings.",
        inputSchema: {
          type: "object",
          properties: { label: { type: "string" } },
          required: ["label"],
          additionalProperties: false
        },
        async execute({ label }) {
          const created = await bindings.invoke({
            kit: "task",
            operation: "create",
            versionRange: "^1.0.0",
            input: { objective: `Fixture binding task: ${label}`, parameters: { label }, toolName: "binding_task" }
          });
          await bindings.invoke({
            kit: "ledger",
            operation: "append",
            versionRange: "^1.0.0",
            input: { taskId: created.task.taskId, value: 0.5, stage: "fixture", message: "Fixture plugin is writing an artifact." }
          });
          const completed = await bindings.invoke({
            kit: "ledger",
            operation: "write-artifact",
            versionRange: "^1.0.0",
            input: {
              taskId: created.task.taskId,
              result: { label, source: "fixture-plugin-binding" },
              artifact: { name: "fixture-binding.json", mediaType: "application/json", content: { label } }
            }
          });
          return { bindingTaskId: completed.task.taskId, artifact: completed.task.artifact };
        }
      }, {
        name: "recent_conversations",
        description: "Read scoped recent conversation metadata through the host bridge.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        async execute() {
          if (usesEcosystemBindings) {
            const [access, entries] = await Promise.all([
              bindings.invoke({ kit: "memory", operation: "access-policy", versionRange: "^1.0.0", input: {} }),
              bindings.invoke({ kit: "memory", operation: "recent-conversations", versionRange: "^1.0.0", input: { limit: 2 } }),
            ]);
            return { access, entries };
          }
          return {
            access: hostBridge.memory.getAccessPolicy(),
            entries: await hostBridge.memory.readRecentConversations({ limit: 2 })
          };
        }
      }],
      async dispose() {
        globalThis.__preachermanFixtureDisposals = (globalThis.__preachermanFixtureDisposals ?? 0) + 1;
      }
    };
  }
};
