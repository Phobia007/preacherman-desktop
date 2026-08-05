import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultLibraryRoot = "E:\\cortana\\library";
const defaultTargetDir = join(
  packageRoot,
  "public",
  "assets",
  "avatars",
  "cortana",
  "motion-library",
);

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
  return digest.digest("hex");
}

function assertLibrary(motionLibrary, packIndex) {
  if (motionLibrary?.motion_count !== 412 || motionLibrary?.motions?.length !== 412) {
    throw new Error("motions.json must declare exactly 412 motions.");
  }
  if (packIndex?.total_actions !== 412 || packIndex?.packs?.length !== 9) {
    throw new Error("packs/index.json must declare 9 packs and 412 actions.");
  }

  const motionIds = new Set();
  const actionNames = new Set();
  const packByFile = new Map(packIndex.packs.map((pack) => [pack.file, pack]));
  for (const motion of motionLibrary.motions) {
    if (!motion.id || !motion.action || !motion.pack_export) {
      throw new Error("Every motion requires id, action, and pack_export.");
    }
    if (motionIds.has(motion.id)) throw new Error(`Duplicate motion id: ${motion.id}`);
    if (actionNames.has(motion.action)) throw new Error(`Duplicate action name: ${motion.action}`);
    motionIds.add(motion.id);
    actionNames.add(motion.action);

    const pack = packByFile.get(motion.pack_export);
    if (!pack) throw new Error(`Motion ${motion.id} references an unknown pack: ${motion.pack_export}`);
    if (!pack.animations.includes(motion.action)) {
      throw new Error(`Pack ${pack.id} does not declare animation ${motion.action}.`);
    }
  }

  const indexedActions = packIndex.packs.flatMap((pack) => pack.animations);
  if (indexedActions.length !== 412 || new Set(indexedActions).size !== 412) {
    throw new Error("Pack index animations must contain 412 unique names.");
  }
}

async function commitStagedFiles(stageDir, targetDir, relativePaths) {
  for (const relativePath of relativePaths) {
    const target = join(targetDir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(stageDir, relativePath), target);
  }
  await rm(stageDir, { recursive: true, force: true });
}

async function copyLockedFile(source, target, expectedSize) {
  const sourceSize = (await stat(source)).size;
  if (expectedSize !== undefined && sourceSize !== expectedSize) {
    throw new Error(
      `Size mismatch for ${basename(source)}: expected ${expectedSize}, received ${sourceSize}.`,
    );
  }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  const targetHash = await sha256(target);
  return { sha256: targetHash, size_bytes: sourceSize };
}

export async function syncCortanaMotionLibrary({
  libraryRoot = defaultLibraryRoot,
  targetDir = defaultTargetDir,
} = {}) {
  const sourceRoot = resolve(libraryRoot);
  const resolvedTarget = resolve(targetDir);
  if (basename(resolvedTarget) !== "motion-library") {
    throw new Error("Motion library target directory must be named motion-library.");
  }

  const motionsPath = join(sourceRoot, "manifest", "motions.json");
  const indexPath = join(sourceRoot, "export", "packs", "index.json");
  const masterPath = join(sourceRoot, "model", "Cortana_Master.blend");
  for (const requiredPath of [motionsPath, indexPath, masterPath]) {
    if (!(await pathExists(requiredPath))) throw new Error(`Required motion library file is missing: ${requiredPath}`);
  }

  const motionLibrary = JSON.parse(await readFile(motionsPath, "utf8"));
  const packIndex = JSON.parse(await readFile(indexPath, "utf8"));
  assertLibrary(motionLibrary, packIndex);

  const nonce = `${Date.now()}-${process.pid}`;
  const stageDir = join(dirname(resolvedTarget), `.${basename(resolvedTarget)}.stage-${nonce}`);
  await mkdir(dirname(resolvedTarget), { recursive: true });
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  try {
    const files = [];
    const copiedMotions = await copyLockedFile(motionsPath, join(stageDir, "motions.json"));
    files.push({ role: "motion_manifest", path: "motions.json", ...copiedMotions });
    const copiedIndex = await copyLockedFile(indexPath, join(stageDir, "index.json"));
    files.push({ role: "pack_index", path: "index.json", ...copiedIndex });

    for (const pack of packIndex.packs) {
      const name = basename(pack.file);
      const copied = await copyLockedFile(
        join(sourceRoot, "export", "packs", name),
        join(stageDir, "packs", name),
        pack.bytes,
      );
      files.push({ role: "animation_pack", pack_id: pack.id, path: `packs/${name}`, ...copied });
    }

    const masterStat = await stat(masterPath);
    const sourceLock = {
      schema_version: "1.0",
      library: motionLibrary.library,
      motion_count: motionLibrary.motion_count,
      pack_count: packIndex.packs.length,
      source_master: {
        path: "model/Cortana_Master.blend",
        size_bytes: masterStat.size,
        sha256: await sha256(masterPath),
      },
      files: files.map(({ path, role, pack_id, sha256: hash, size_bytes }) => ({
        role,
        ...(pack_id ? { pack_id } : {}),
        path,
        sha256: hash,
        size_bytes,
      })),
    };
    await writeFile(
      join(stageDir, "source-lock.json"),
      `${JSON.stringify(sourceLock, null, 2)}\n`,
      "utf8",
    );
    await commitStagedFiles(
      stageDir,
      resolvedTarget,
      [...sourceLock.files.map((file) => file.path), "source-lock.json"],
    );
    return { targetDir: resolvedTarget, motionCount: 412, packCount: 9, files: sourceLock.files };
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument near ${key ?? "end of command"}.`);
    }
    values[key.slice(2)] = value;
    index += 1;
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await syncCortanaMotionLibrary({
    libraryRoot: args["library-root"] ?? defaultLibraryRoot,
    targetDir: args["target-dir"] ?? defaultTargetDir,
  });
  console.log(
    `Synchronized Cortana motion library: motions=${result.motionCount} packs=${result.packCount} target=${result.targetDir}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
