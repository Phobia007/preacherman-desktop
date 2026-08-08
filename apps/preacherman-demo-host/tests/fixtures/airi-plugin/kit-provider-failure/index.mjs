export default {
  abi: "preacherman.plugin.v1",
  version: "1.0.0",
  async activate({ kits, bindings }) {
    globalThis.__preachermanFailedKitFacade = kits;
    globalThis.__preachermanFailedBindingFacade = bindings;
    kits.provide({
      name: "fixture-orphan",
      version: "1.0.0",
      description: "This Kit must be removed when activation fails.",
      capabilities: ["read"],
    });
    bindings.bind({
      kit: "fixture-orphan",
      operation: "read",
      handler() { return { orphan: true }; },
    });
    throw new Error("fixture activation failed after Kit and Binding registration");
  },
};
