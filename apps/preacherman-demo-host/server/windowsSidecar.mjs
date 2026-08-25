import { createPreachermanServer } from "./preachermanServer.mjs";
import { createStaticUiServer } from "./staticUiServer.mjs";

const service = createPreachermanServer();
const uiService = createStaticUiServer();
Promise.all([uiService.listen(), service.listen()]).then(([uiAddress, serviceAddress]) => {
  const uiPort = typeof uiAddress === "object" && uiAddress ? uiAddress.port : 8788;
  const servicePort = typeof serviceAddress === "object" && serviceAddress ? serviceAddress.port : 8787;
  console.log(`Preacherman UI assets listening on http://127.0.0.1:${uiPort}`);
  console.log(`Preacherman local service listening on http://127.0.0.1:${servicePort}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function shutdown() {
  await Promise.all([uiService.close(), service.close()]);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
