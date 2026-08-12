export function createPreachermanExecutionDiagnosticsAdapter({ capabilityCatalog }) {
  if (!capabilityCatalog || typeof capabilityCatalog.status !== "function" || typeof capabilityCatalog.workflows !== "function") {
    throw new TypeError("Preacherman Execution Diagnostics Adapter requires a Capability Catalog Adapter.");
  }
  return {
    status: () => capabilityCatalog.status(),
    workflows: () => capabilityCatalog.workflows(),
  };
}
