import { createPreachermanServer } from "./preachermanServer.mjs";

const service = createPreachermanServer();
service.listen().then((address) => {
  const port = typeof address === "object" && address ? address.port : 8787;
  console.log(`Preacherman local service listening on http://127.0.0.1:${port}`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function shutdown() {
  await service.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
