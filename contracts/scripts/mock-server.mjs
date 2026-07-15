import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { loadMockRouter } from "./lib/mock-router.mjs";

function jsonResponse(response, status, body, requestId) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(body));
}

async function consumeRequest(request) {
  for await (const _chunk of request) {
    // Drain the request so clients can reuse the connection.
  }
}

export async function createMockServer() {
  const router = await loadMockRouter();
  let requestSequence = 0;

  return createServer(async (request, response) => {
    requestSequence += 1;
    const requestId = `req_mock_${String(requestSequence).padStart(4, "0")}`;
    const url = new URL(request.url ?? "/", "http://mock.local");
    const route = router.match(request.method ?? "GET", url.pathname);
    await consumeRequest(request);

    if (!route) {
      const notFound = router.error("RESOURCE_NOT_FOUND");
      jsonResponse(response, 404, notFound.fixture, requestId);
      return;
    }

    const requestedError = url.searchParams.get("error");
    if (requestedError) {
      const error = router.error(requestedError);
      if (!error || !route.operation["x-error-codes"]?.includes(requestedError)) {
        jsonResponse(response, 400, {
          error: {
            code: "VALIDATION_FAILED",
            message: `Error scenario ${requestedError} is not declared for ${route.operation["x-api-id"]}.`,
            retryable: false,
            details: {},
          },
        }, requestId);
        return;
      }
      jsonResponse(response, error.status, error.fixture, requestId);
      return;
    }

    if (route.success.status === 204 || route.success.body === null) {
      response.writeHead(route.success.status, { "x-request-id": requestId });
      response.end();
      return;
    }

    jsonResponse(response, route.success.status, route.success.body, requestId);
  });
}

async function main() {
  const port = Number(process.env.PORT ?? 4010);
  const server = await createMockServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Preacherman HTTP mock listening at http://127.0.0.1:${port}/api/v1`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
