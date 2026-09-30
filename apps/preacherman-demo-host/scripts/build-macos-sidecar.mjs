import { build } from "esbuild";
import { chmod, cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") throw new Error("Build the macOS sidecar on macOS.");
const architecture = { arm64: "aarch64", x64: "x86_64" }[process.arch];
if (!architecture) throw new Error(`Unsupported architecture: ${process.arch}`);
const packageRoot = resolve(import.meta.dirname, "..");
const buildDirectory = resolve(packageRoot, ".macos-service-build");
const outputBinary = resolve(packageRoot, "src-tauri", "binaries", `preacherman-service-${architecture}-apple-darwin`);
const bundledService = resolve(buildDirectory, "preacherman-service.cjs");
const seaConfig = resolve(buildDirectory, "sea-config.json");
const blob = resolve(buildDirectory, "preacherman-service.blob");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: packageRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

await mkdir(buildDirectory, { recursive: true });
await mkdir(resolve(outputBinary, ".."), { recursive: true });
await build({ bundle: true, entryPoints: [resolve(packageRoot, "server/windowsSidecar.mjs")], format: "cjs", outfile: bundledService, platform: "node", target: "node22" });
await writeFile(seaConfig, JSON.stringify({ main: bundledService, output: blob, disableExperimentalSEAWarning: true }));
run(process.execPath, ["--experimental-sea-config", seaConfig]);

// Official macOS Node installers can contain both architectures. Inject only
// into the native slice: the SEA blob is built by this running Node process.
const slices = spawnSync("lipo", ["-archs", process.execPath], { encoding: "utf8" });
if (slices.status !== 0) throw new Error("Cannot inspect the Node executable.");
if (slices.stdout.trim().split(/\s+/).length > 1) {
  run("lipo", [process.execPath, "-thin", process.arch === "arm64" ? "arm64" : "x86_64", "-output", outputBinary]);
} else {
  await cp(process.execPath, outputBinary);
}
await chmod(outputBinary, 0o755);
run("codesign", ["--remove-signature", outputBinary]);
run(process.execPath, [resolve(packageRoot, "node_modules/postject/dist/cli.js"), outputBinary, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--macho-segment-name", "NODE_SEA"]);
run("codesign", ["--force", "--sign", "-", outputBinary]);
run("codesign", ["--verify", "--strict", outputBinary]);
console.log(`macOS sidecar ready: ${outputBinary}`);
