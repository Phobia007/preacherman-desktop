import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contractsRoot } from "./lib/registry.mjs";

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function asSse(event) {
  return [
    `id: ${event.stream_id}:${event.sequence}`,
    `event: ${event.event_type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join("\n");
}

async function scenarioEvents() {
  const names = ["operation-progress", "artifact-created", "operation-succeeded"];
  const events = [];
  for (const [index, name] of names.entries()) {
    const source = await loadJson(join(contractsRoot, "examples/events/operation", `${name}.json`));
    events.push({
      ...source,
      event_id: `evt_sse_${index + 1}`,
      stream_id: "operation:operation_01",
      sequence: index + 1,
      resource_id: "operation_01",
      operation_id: "operation_01",
    });
  }
  return events;
}

export function createSseFixtureServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://sse.local");
    if (url.pathname !== "/events") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "RESOURCE_NOT_FOUND", message: "Fixture route not found.", retryable: false, details: {} } }));
      return;
    }

    const scenario = url.searchParams.get("scenario") ?? "normal";
    if (scenario === "cursor-expired") {
      const fixture = await loadJson(join(contractsRoot, "examples/errors/event-cursor-expired.json"));
      response.writeHead(409, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(fixture));
      return;
    }

    const events = await scenarioEvents();
    const afterSequence = Number(url.searchParams.get("after_sequence") ?? 0);
    let selected = events.filter((event) => event.sequence > afterSequence);
    if (scenario === "duplicate" && selected.length > 0) {
      selected = [selected[0], structuredClone(selected[0]), ...selected.slice(1)];
    } else if (!new Set(["normal", "resume", "disconnect"]).has(scenario)) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "VALIDATION_FAILED", message: `Unknown SSE scenario ${scenario}.`, retryable: false, details: {} } }));
      return;
    }

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    response.write(": heartbeat 2026-07-15T10:21:31Z\n\n");
    for (const event of selected) {
      response.write(asSse(event));
      if (scenario === "disconnect") {
        break;
      }
    }
    response.end();
  });
}

async function main() {
  const port = Number(process.env.PORT ?? 4011);
  const server = createSseFixtureServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Preacherman SSE fixture server listening at http://127.0.0.1:${port}/events`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
