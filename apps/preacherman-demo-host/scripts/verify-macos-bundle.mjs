import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") throw new Error("Run this verification on macOS.");
const app = resolve(process.argv[2] || join(import.meta.dirname, "../src-tauri/target/release/bundle/macos/Preacherman Desktop Demo.app"));
const signature = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
assert.equal(signature.status, 0, "The completed app bundle must have a valid signature.");

// Verify the signed, bundled copy, not the pre-signing binary in binaries/.
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const data = await mkdtemp(join(tmpdir(), "preacherman-bundle-check-"));
const child = spawn(join(app, "Contents/MacOS/preacherman-service"), [], {
  cwd: data,
  env: { ...process.env, PREACHERMAN_DATA_DIR: data, PREACHERMAN_SERVICE_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(child, "exit");
let log = "";
const record = chunk => { log = (log + chunk).slice(-32000); };
child.stdout.on("data", record);
child.stderr.on("data", record);
try {
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Signed service exited before becoming healthy:\n${log}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Origin: "tauri://localhost" }, signal: AbortSignal.timeout(500),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "tauri://localhost");
      assert.equal(body.ok, true);
      healthy = true;
      break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(healthy, `Signed service never became healthy:\n${log}`);
  console.log("PASS: signed app bundle, standalone service, native-origin CORS and health.");
} finally {
  child.kill("SIGTERM");
  const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(deadline);
  await rm(data, { recursive: true, force: true });
}
