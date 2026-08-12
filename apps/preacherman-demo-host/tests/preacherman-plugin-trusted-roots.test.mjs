import assert from "node:assert/strict";
import { cp, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPreachermanPluginRuntime } from "../server/preachermanPluginRuntime.mjs";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "preacherman-plugin", "success");
const taskStore = { async list() { return []; } };
const widgets = { async register() {}, async removePlugin() {} };

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-plugin-trust-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const allowedRoot = join(directory, "allowed");
  const allowedSource = join(allowedRoot, "fixture");
  const outsideSource = join(directory, "outside");
  await cp(fixture, allowedSource, { recursive: true });
  await cp(fixture, outsideSource, { recursive: true });
  return { directory, allowedRoot, allowedSource, outsideSource };
}

function createRuntime(directory, trustedRoots) {
  return createPreachermanPluginRuntime({
    file: join(directory, "preacherman-plugins.v1.json"),
    taskStore,
    widgets,
    ...(trustedRoots === undefined ? {} : { trustedRoots }),
  });
}

test("plugin snapshots disclose compatible explicit-directory trust when no allowlist is configured", async (t) => {
  const { directory, allowedSource } = await setup(t);
  const runtime = createRuntime(directory);
  t.after(() => runtime.close());

  assert.deepEqual((await runtime.listPlugins())[0].trust, { mode: "builtin" });
  const installed = await runtime.install(allowedSource);
  assert.deepEqual(installed.trust, { mode: "explicit-directory" });
});

test("trustedRoots allows canonical descendants and rejects path traversal outside the root", async (t) => {
  const { directory, allowedRoot, allowedSource, outsideSource } = await setup(t);
  const runtime = createRuntime(directory, [allowedRoot]);
  t.after(() => runtime.close());

  await assert.rejects(
    runtime.install(join(allowedRoot, "..", "outside")),
    /outside the configured trusted roots/,
  );

  const installed = await runtime.install(allowedSource);
  assert.deepEqual(installed.trust, {
    mode: "root-allowlist",
    root: await realpath(allowedRoot),
  });
  assert.equal(installed.sourceDirectory, await realpath(allowedSource));
  assert.notEqual(await realpath(outsideSource), installed.sourceDirectory);
});

test("trustedRoots rejects a symlink or junction that escapes an allowed root", async (t) => {
  const { directory, allowedRoot, outsideSource } = await setup(t);
  const linkedSource = join(allowedRoot, "linked-outside");
  try {
    await symlink(outsideSource, linkedSource, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      t.skip("This host does not permit creating a directory link.");
      return;
    }
    throw error;
  }
  const runtime = createRuntime(directory, [allowedRoot]);
  t.after(() => runtime.close());

  await assert.rejects(runtime.install(linkedSource), /outside the configured trusted roots/);
});

test("trusted root matching is case-insensitive on Windows", { skip: process.platform !== "win32" }, async (t) => {
  const { directory, allowedRoot, allowedSource } = await setup(t);
  const differentlyCasedRoot = allowedRoot.replace(/[A-Za-z]/g, (letter) => (
    letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()
  ));
  const runtime = createRuntime(directory, [differentlyCasedRoot]);
  t.after(() => runtime.close());

  assert.equal((await runtime.install(allowedSource)).phase, "ready");
});

test("trustedRoots rejects malformed configuration", () => {
  assert.throws(
    () => createRuntime("unused", [""]),
    /trustedRoots must be an array of non-empty directory paths/,
  );
  assert.throws(
    () => createRuntime("unused", "not-an-array"),
    /trustedRoots must be an array of non-empty directory paths/,
  );
});
