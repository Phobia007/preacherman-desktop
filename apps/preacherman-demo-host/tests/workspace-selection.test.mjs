import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorkspaceSelection, pickWindowsWorkspace } from "../server/local-agent/workspaceSelection.mjs";
import { createPreachermanServer } from "../server/preachermanServer.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "preacherman-workspace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "项目 with spaces");
  await mkdir(project);
  const file = path.join(root, "data", "workspaces.json");
  return { root, project, file };
}
test("picker uses fixed encoded script, no shell interpolation and bounded cancellation", async () => {
  let called;
  const chosen = await pickWindowsWorkspace({ platform: "win32", run: async (...args) => { called = args; return { stdout: JSON.stringify({ path: "C:\\项目" }) }; } });
  assert.equal(chosen, "C:\\项目");
  assert.equal(called[2].shell, false);
  assert.equal(called[2].windowsHide, true);
  assert.equal(called[2].timeout, 180000);
  assert.match(Buffer.from(called[1].at(-1), "base64").toString("utf16le"), /FolderBrowserDialog/);
  assert.equal(await pickWindowsWorkspace({ platform: "win32", run: async () => ({ stdout: "null" }) }), null);
});
test("selection grants nothing until confirmation; approval persists and reloads a stable workspace", async t => {
  const { project, file } = await fixture(t), registered = [];
  const manager = createWorkspaceSelection({ file, picker: async () => project, register: item => registered.push(item) });
  await manager.initialize();
  const selection = await manager.pick();
  assert.equal(registered.length, 0);
  await assert.rejects(readFile(file), { code: "ENOENT" });
  await assert.rejects(manager.approve({ token: selection.token, approved: false }), /confirm/);
  await assert.rejects(manager.approve({ token: "forged", approved: true }), /confirm/);
  const record = await manager.approve({ token: selection.token, approved: true });
  assert.equal(record.label, "项目 with spaces");
  assert.equal(registered.length, 1);
  await assert.rejects(manager.approve({ token: selection.token, approved: true }), /confirm/);
  const restored = [];
  await createWorkspaceSelection({ file, register: item => restored.push(item) }).initialize();
  assert.deepEqual(restored, [record]);
  const again = await manager.pick();
  assert.equal((await manager.approve({ token: again.token, approved: true })).id, record.id);
  assert.equal(JSON.parse(await readFile(file)).workspaces.length, 1);
});
test("cancel, missing folder, expired selection and broad drive never grant access", async t => {
  const { root, project, file } = await fixture(t);
  let choice = null, time = 0;
  const manager = createWorkspaceSelection({ file, picker: async () => choice, register: () => assert.fail("unexpected registration"), now: () => time });
  assert.equal(await manager.pick(), null);
  choice = path.parse(root).root;
  await assert.rejects(manager.pick(), /entire drive/);
  choice = path.join(root, "missing");
  await assert.rejects(manager.pick(), /no longer available/);
  choice = project;
  const selection = await manager.pick();
  time = 16 * 60 * 1000;
  await assert.rejects(manager.approve({ token: selection.token, approved: true }), /again/);
});
test("parallel chooser is rejected and corrupt saved data is not overwritten", async t => {
  const { file, root } = await fixture(t);
  let finish;
  const manager = createWorkspaceSelection({ file, picker: () => new Promise(resolve => { finish = resolve; }), register: () => {} });
  const waiting = manager.pick();
  await assert.rejects(manager.pick(), /already open/);
  finish(null); await waiting;
  const corrupt = path.join(root, "bad.json");
  await writeFile(corrupt, "broken");
  await assert.rejects(createWorkspaceSelection({ file: corrupt, register: () => {} }).initialize(), /not overwritten/);
  assert.equal(await readFile(corrupt, "utf8"), "broken");
});
test("HTTP folder approval registers workspace for connection and survives restart, without task execution", async t => {
  const { root, project } = await fixture(t);
  let picks = 0, starts = 0;
  const options = { env: { PREACHERMAN_DATA_DIR: path.join(root, "service") }, workspacePicker: async () => { picks++; return project; }, localAgentRegistry: {
    list: async () => [{ id: "codex-cli", label: "Codex CLI", installed: true, version: "fixture", auth: { state: "ready" }, capabilities: { workspaceWrite: true } }],
    capabilities: () => ({ workspaceWrite: true }), start: async () => { starts++; }, close: async () => {},
  } };
  let service = createPreachermanServer(options);
  try {
    let address = await service.listen(0);
    const call = async (route, body, origin = "http://127.0.0.1:1420") => {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, { method: body ? "POST" : "GET", headers: { Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await call("/api/execution/workspaces/pick", {}, "https://foreign.example")).status, 403);
    assert.equal(picks, 0);
    const selected = (await call("/api/execution/workspaces/pick", {})).data.selection;
    assert.equal((await call("/api/execution/workspaces/approve", { path: project, approved: true })).status, 409);
    const saved = await call("/api/execution/workspaces/approve", { token: selected.token, approved: true });
    assert.equal(saved.status, 200);
    const workspaceId = saved.data.workspace.id;
    assert.ok(saved.data.workspaces.some(item => item.id === workspaceId));
    assert.equal((await call("/api/settings/execution/local", { agentId: "codex-cli", workspaceId })).status, 200);
    assert.equal(starts, 0);
    await service.close(); service = createPreachermanServer(options); address = await service.listen(0);
    assert.ok((await call("/api/execution/workspaces")).data.workspaces.some(item => item.id === workspaceId));
    assert.equal((await call("/api/settings/execution")).data.local.workspaceId, workspaceId);
  } finally { await service.close(); }
});
