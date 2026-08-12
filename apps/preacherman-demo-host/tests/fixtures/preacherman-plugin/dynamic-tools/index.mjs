const dynamicEcho = {
  name: "dynamic_echo",
  description: "Echo a label from a dynamically registered tool.",
  inputSchema: {
    type: "object",
    properties: { label: { type: "string" } },
    required: ["label"],
    additionalProperties: false
  },
  async execute({ label }) {
    if (label === "timeout") return new Promise(() => {});
    return { label, source: "dynamic-tools" };
  }
};

export default {
  abi: "preacherman.plugin.v1",
  version: "1.0.0",
  async activate({ tools }) {
    globalThis.__preachermanDynamicToolsFacade = tools;
    tools.register(dynamicEcho);
    tools.register({
      name: "tool_control",
      description: "Register or unregister the fixture dynamic tool.",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string" } },
        required: ["action"],
        additionalProperties: false
      },
      async execute({ action }) {
        if (action === "unregister") return tools.unregister("dynamic_echo");
        if (action === "register") return tools.register(dynamicEcho);
        return { tools: tools.list().map((tool) => tool.name) };
      }
    });
    return {};
  }
};
