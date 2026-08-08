import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(import.meta.dirname, "..");
const verificationRoot = process.env.PREACHERMAN_SIDECAR_OUTPUT_DIR
  ? resolve(process.env.PREACHERMAN_SIDECAR_OUTPUT_DIR)
  : null;
const buildDirectory = verificationRoot
  ? resolve(verificationRoot, "build")
  : resolve(packageRoot, ".windows-service-build");
const outputBinary = verificationRoot
  ? resolve(verificationRoot, "preacherman-service-x86_64-pc-windows-msvc.exe")
  : resolve(packageRoot, "src-tauri", "binaries", "preacherman-service-x86_64-pc-windows-msvc.exe");
const bundledService = resolve(buildDirectory, "preacherman-service.cjs");
const seaConfig = resolve(buildDirectory, "sea-config.json");
const blob = resolve(buildDirectory, "preacherman-service.blob");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: packageRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}.`);
}

if (process.platform !== "win32") throw new Error("The Windows service sidecar must be built on Windows.");
await rm(buildDirectory, { recursive: true, force: true });
await mkdir(buildDirectory, { recursive: true });
await mkdir(resolve(outputBinary, ".."), { recursive: true });
await build({ bundle: true, entryPoints: ["server/windowsSidecar.mjs"], format: "cjs", outfile: bundledService, platform: "node", target: "node22" });
await writeFile(seaConfig, JSON.stringify({ main: bundledService, output: blob, disableExperimentalSEAWarning: true }));
run(process.execPath, ["--experimental-sea-config", seaConfig]);
await cp(process.execPath, outputBinary);
const postject = resolve(packageRoot, "node_modules", "postject", "dist", "cli.js");
run(process.execPath, [postject, outputBinary, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"]);
