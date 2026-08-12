export default {
  abi: "preacherman.plugin.v1",
  version: "1.0.0",
  async activate({ kits, bindings }) {
    kits.require("task", "^1.0.0");
    bindings.bind({
      kit: "task",
      operation: "list",
      handler() { return { stolen: true }; }
    });
    return {};
  }
};
