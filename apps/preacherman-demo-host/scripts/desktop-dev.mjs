import { spawn } from "node:child_process";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const servicePort = "8790";
const uiPort = "1430";
const uiOrigin = `http://127.0.0.1:${uiPort}`;
const sharedEnv = {
  ...process.env,
  PREACHERMAN_DATA_DIR: process.env.PREACHERMAN_DATA_DIR || resolve(packageRoot, "..", "..", ".runtime-tmp", "preacherman-data"),
  PREACHERMAN_PREVIEW_ORIGINS: uiOrigin,
  PREACHERMAN_SERVICE_PORT: servicePort,
  VITE_PREACHERMAN_SERVICE_PORT: servicePort,
};
const children = [
  spawn(
    process.execPath,
    ["--env-file-if-exists=.env.local", "server/index.mjs"],
    { cwd: packageRoot, env: sharedEnv, stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      uiPort,
      "--strictPort",
    ],
    { cwd: packageRoot, env: sharedEnv, stdio: "inherit" },
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
