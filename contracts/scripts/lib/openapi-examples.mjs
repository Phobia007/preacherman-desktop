function rewriteLocalRefs(value) {
  if (Array.isArray(value)) {
    return value.map(rewriteLocalRefs);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        if (key === "$ref" && typeof child === "string" && child.startsWith("#/")) {
          return [key, `#/$defs/${child.slice(2)}`];
        }
        return [key, rewriteLocalRefs(child)];
      }),
    );
  }
  return value;
}

export function createComponentSchemaDocument(components, rootSchemaName) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: rewriteLocalRefs(components),
    $ref: `#/$defs/${rootSchemaName}`,
  };
}
