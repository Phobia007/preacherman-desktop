export default {
  abi: "preacherman.plugin.v1",
  version: "1.0.0",
  async activate({ kits, bindings }) {
    kits.require("task", "^1.0.0");
    kits.register({
      name: "fixture-calendar",
      version: "1.0.0",
      description: "Calendar operations provided by the fixture plugin.",
      capabilities: ["list", "create"],
    });
    bindings.bind({
      kit: "fixture-calendar",
      operation: "list",
      versionRange: "^1.0.0",
      async handler(input, context) {
        if (input?.hang) return new Promise(() => {});
        return {
          calendars: [input?.owner ?? "fixture-owner"],
          callerPluginId: context.callerPluginId,
          providerPluginId: context.providerPluginId,
        };
      },
    });
    bindings.register({
      kit: "fixture-calendar",
      operation: "create",
      handler() {
        return { created: true };
      },
    });
    bindings.unbind({ kit: "fixture-calendar", operation: "create" });
    return {};
  },
};
