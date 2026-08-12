export default {
  abi: "preacherman.plugin.v1",
  version: "1.0.0",
  async activate({ tools }) {
    globalThis.__preachermanFailedDynamicToolsFacade = tools;
    tools.register({
      name: "orphan",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute() { return { orphan: true }; }
    });
    throw new Error("dynamic tool activation failed");
  }
};
