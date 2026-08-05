import { spawn } from "node:child_process";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const children = [
  spawn(
    process.execPath,
    ["--env-file-if-exists=.env.local", "server/index.mjs"],
    { cwd: packageRoot, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "1420",
      "--strictPort",
    ],
    { cwd: packageRoot, stdio: "inherit" },
  ),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) shutdown(signal ? 1 : (code ?? 0));
  });
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
