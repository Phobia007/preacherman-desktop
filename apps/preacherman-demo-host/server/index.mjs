import { createPreachermanServer } from "./preachermanServer.mjs";

const service = createPreachermanServer();
const address = await service.listen();
const port = typeof address === "object" && address ? address.port : 8787;

console.log(`Preacherman local service listening on http://127.0.0.1:${port}`);

async function shutdown() {
  await service.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
