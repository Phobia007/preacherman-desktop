import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { binaryServiceHealth } from "./speechMotionProxy.mjs";
import { resolveRuntimeInstallation } from "./runtimeInstallation.mjs";

function occupied(port) {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500); socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false)); socket.once("timeout", () => finish(false));
  });
}
export function createSpeechMotionService({ endpoint, managed = !endpoint, health = () => binaryServiceHealth(endpoint),
  compose = resolveRuntimeInstallation().speechMotionCompose, docker = resolveRuntimeInstallation().docker, port = 18084, serviceName = "Speech2Motion",
  run = (args, signal) => new Promise((resolve, reject) => execFile(docker, args,
    { windowsHide: true, timeout: 45000, maxBuffer: 256 * 1024, signal }, error => error ? reject(error) : resolve())),
  exists = () => access(compose), portOccupied = () => occupied(port), pause = delay,
} = {}) {
  const lifetime = new AbortController();
  let pending = null, phase = "idle", message = "";
  const status = async () => ({ ...await health(), starting: Boolean(pending), phase, message, managed });
  return {
    status,
    start() {
      if (pending) return pending;
      if (lifetime.signal.aborted) return Promise.resolve({ state: "unavailable", starting: false, managed });
      pending = (async () => {
        try {
          message = "";
          if ((await health()).state === "ready") { phase = "ready"; return; }
          if (!managed) { message = `Reconnect the configured ${serviceName} service.`; return; }
          await exists();
          // Never replace an unrelated listener or launch the old Python deployment.
          if (await portOccupied()) throw new Error(`The ${serviceName} port is busy. Check the existing service.`);
          phase = "starting";
          try { await run(["info", "--format", "{{.ServerVersion}}"], lifetime.signal); }
          catch {
            lifetime.signal.throwIfAborted();
            await run(["desktop", "start", "--detach"], lifetime.signal);
            let ready = false;
            for (let attempt = 0; attempt < 20; attempt++) {
              try { await run(["info", "--format", "{{.ServerVersion}}"], lifetime.signal); ready = true; break; }
              catch { await pause(1500, undefined, { signal: lifetime.signal }); }
            }
            if (!ready) throw new Error("Docker is not ready. Start Docker Desktop and reconnect.");
          }
          await run(["compose", "-f", compose, "up", "-d", "--no-build", "--pull", "never"], lifetime.signal);
          for (let attempt = 0; attempt < 30; attempt++) {
            if ((await health()).state === "ready") { phase = "ready"; return; }
            await pause(1000, undefined, { signal: lifetime.signal });
          }
          throw new Error(`${serviceName} is still warming up. Reconnect in a moment.`);
        } catch (error) {
          phase = "unavailable";
          message = error.code === "ENOENT" ? `The local ${serviceName} installation could not be found.` :
            error.code || error.killed ? `Could not start ${serviceName}. Check Docker Desktop and reconnect.` : error.message;
        }
      })().finally(() => { pending = null; });
      return pending.then(status);
    },
    close() { lifetime.abort(); }, // Docker is shared and survives the desktop window.
  };
}
