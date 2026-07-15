import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { contractsRoot } from "./registry.mjs";

const httpMethods = new Set(["get", "post", "put", "patch", "delete"]);

function resolvePointer(document, ref) {
  if (!ref?.startsWith("#/")) {
    return null;
  }
  return ref.slice(2).split("/").reduce((value, segment) => value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}

function dereference(document, value) {
  return value?.$ref ? resolvePointer(document, value.$ref) : value;
}

function compilePath(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\\{[^}]+\\\}/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
}

function successResponse(document, operation) {
  const statuses = Object.keys(operation.responses ?? {})
    .filter((status) => /^2\d\d$/.test(status))
    .sort((left, right) => Number(left) - Number(right));
  const status = Number(statuses[0] ?? 200);
  const response = dereference(document, operation.responses?.[String(status)]) ?? {};
  const media = response.content?.["application/json"];
  const exampleEntry = media?.examples?.success ?? Object.values(media?.examples ?? {})[0];
  const example = dereference(document, exampleEntry);
  return { status, body: example?.value ?? media?.example ?? null };
}

export async function loadMockRouter() {
  const bundlePath = join(contractsRoot, "dist/openapi.bundle.yaml");
  const document = YAML.parse(await readFile(bundlePath, "utf8"));
  const routes = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method)) {
        continue;
      }
      routes.push({
        method: method.toUpperCase(),
        path,
        matcher: compilePath(path),
        operation,
        success: successResponse(document, operation),
      });
    }
  }

  const errorFixtures = new Map();
  const errorRegistry = YAML.parse(await readFile(join(contractsRoot, "registry/error-codes.yaml"), "utf8"));
  for (const file of await readdir(join(contractsRoot, "examples/errors"))) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const fixture = JSON.parse(await readFile(join(contractsRoot, "examples/errors", file), "utf8"));
    if (fixture.error?.code) {
      errorFixtures.set(fixture.error.code, fixture);
    }
  }

  return {
    match(method, pathname) {
      const normalizedPath = pathname.startsWith("/api/v1/") ? pathname.slice(7) : pathname;
      const withLeadingSlash = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
      return routes.find((route) => route.method === method.toUpperCase() && route.matcher.test(withLeadingSlash));
    },
    error(code) {
      const fixture = errorFixtures.get(code);
      if (!fixture) {
        return null;
      }
      return { fixture, status: Number(errorRegistry[code]?.http_status?.[0] ?? 400) };
    },
    routeCount: routes.length,
  };
}
