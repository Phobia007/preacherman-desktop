import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EXPECTED_MODEL = Object.freeze({
  sha256: "07A4AAC5DD51DDC71309B8AC47CA812470AC098FECF172EC7E23AEC91928E878",
  sizeBytes: 7_252_696,
});

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultTargetDir = join(packageRoot, "public", "local-avatar");

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function sha256(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex").toUpperCase();
}

function assertLockFile(lock) {
  if (!lock || typeof lock !== "object") {
    throw new Error("Viewer asset-lock.json must contain an object.");
  }
  if (!Array.isArray(lock.viewerShaderInputs) || lock.viewerShaderInputs.length !== 6) {
    throw new Error("Viewer asset-lock.json must contain exactly six shader inputs.");
  }
  const names = lock.viewerShaderInputs.map((entry) => basename(entry.targetPath ?? ""));
  if (names.some((name) => !name) || new Set(names).size !== 6) {
    throw new Error("Viewer shader input names must be six unique files.");
  }
}

function assertModelLock(lock, expectedModel) {
  for (const entry of [lock.source, lock.target]) {
    if (String(entry?.sha256).toUpperCase() !== expectedModel.sha256) {
      throw new Error(
        `Model lock SHA-256 mismatch: expected ${expectedModel.sha256}, received ${entry?.sha256}.`,
      );
    }
    if (entry?.sizeBytes !== expectedModel.sizeBytes) {
      throw new Error(
        `Model lock size mismatch: expected ${expectedModel.sizeBytes}, received ${entry?.sizeBytes}.`,
      );
    }
  }
}

async function copyAndVerify({
  source,
  target,
  expectedHash,
  expectedSize,
}) {
  if (!(await pathExists(source))) {
    throw new Error(`Locked avatar source is missing: ${source}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  const actualSize = (await stat(target)).size;
  if (actualSize !== expectedSize) {
    throw new Error(
      `Size mismatch for ${basename(target)}: expected ${expectedSize}, received ${actualSize}.`,
    );
  }
  const actualHash = await sha256(target);
  if (actualHash !== String(expectedHash).toUpperCase()) {
    throw new Error(
      `SHA-256 mismatch for ${basename(target)}: expected ${expectedHash}, received ${actualHash}.`,
    );
  }
  return {
    path: target,
    sha256: actualHash,
    sizeBytes: actualSize,
  };
}

async function replaceDirectoryAtomically(stageDir, targetDir, nonce) {
  const backupDir = join(
    dirname(targetDir),
    `.${basename(targetDir)}.backup-${nonce}`,
  );
  const hadTarget = await pathExists(targetDir);
  if (!hadTarget) {
    await rename(stageDir, targetDir);
    return;
  }

  await rename(targetDir, backupDir);
  try {
    await rename(stageDir, targetDir);
  } catch (error) {
    await rename(backupDir, targetDir);
    throw error;
  }
  await rm(backupDir, { recursive: true, force: true });
}

export async function syncLocalAvatar({
  runtimeDir,
  viewerDir,
  targetDir = defaultTargetDir,
  expectedModel = EXPECTED_MODEL,
}) {
  if (!runtimeDir) {
    throw new Error(
      "Avatar runtime directory is required via --runtime-dir or PREACHERMAN_RUNTIME_V0_DIR.",
    );
  }
  const resolvedRuntime = resolve(runtimeDir);
  const resolvedViewer = resolve(
    viewerDir
      ?? join(dirname(resolvedRuntime), "_preacherman_avatar_viewer_v0"),
  );
  const resolvedTarget = resolve(targetDir);
  const lockPath = join(resolvedViewer, "asset-lock.json");
  if (!(await pathExists(lockPath))) {
    throw new Error(`Viewer asset-lock.json is missing: ${lockPath}`);
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assertLockFile(lock);
  assertModelLock(lock, expectedModel);

  const nonce = `${Date.now()}-${process.pid}`;
  const stageDir = join(
    dirname(resolvedTarget),
    `.${basename(resolvedTarget)}.stage-${nonce}`,
  );
  await mkdir(dirname(resolvedTarget), { recursive: true });
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  const files = [];
  try {
    const modelName = basename(lock.target.path);
    const model = await copyAndVerify({
      source: join(resolvedRuntime, "model", basename(lock.source.path)),
      target: join(stageDir, modelName),
      expectedHash: expectedModel.sha256,
      expectedSize: expectedModel.sizeBytes,
    });
    files.push({
      role: "runtime GLB",
      path: modelName,
      sha256: model.sha256,
      sizeBytes: model.sizeBytes,
    });

    for (const input of lock.viewerShaderInputs) {
      const name = basename(input.targetPath);
      const copied = await copyAndVerify({
        source: join(resolvedRuntime, "textures", basename(input.sourcePath)),
        target: join(stageDir, "shader", name),
        expectedHash: input.sha256,
        expectedSize: input.sizeBytes,
      });
      files.push({
        role: input.role,
        path: `shader/${name}`,
        sha256: copied.sha256,
        sizeBytes: copied.sizeBytes,
      });
    }

    const localLock = {
      schemaVersion: "1.0.0",
      viewerBuildId: lock.buildId,
      files,
    };
    await writeFile(
      join(stageDir, "asset-lock.json"),
      `${JSON.stringify(localLock, null, 2)}\n`,
      "utf8",
    );
    await replaceDirectoryAtomically(stageDir, resolvedTarget, nonce);
    return { targetDir: resolvedTarget, files };
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const runtimeDir = args["runtime-dir"] ?? process.env.PREACHERMAN_RUNTIME_V0_DIR;
  const viewerDir = args["viewer-dir"] ?? process.env.PREACHERMAN_VIEWER_V0_DIR;
  const result = await syncLocalAvatar({
    runtimeDir,
    viewerDir,
    targetDir: args["target-dir"] ?? defaultTargetDir,
  });
  console.log(
    `Synchronized ${result.files.length} locked avatar assets to ${result.targetDir}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
