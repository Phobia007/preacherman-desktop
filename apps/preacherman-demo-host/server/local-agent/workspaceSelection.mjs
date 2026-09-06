import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
// Fixed script only: neither paths nor user input are interpolated into PowerShell.
const pickerScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a project folder for Preacherman'
$dialog.ShowNewFolderButton = $false
try {
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write((ConvertTo-Json -Compress -InputObject @{ path = $dialog.SelectedPath }))
  } else { [Console]::Write('null') }
} finally { $dialog.Dispose() }
`;

export async function pickWindowsWorkspace({ signal, run = promisify(execFile), platform = process.platform } = {}) {
  if (platform !== "win32") throw fail("Folder selection is available in the Windows desktop app.", 409);
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    const result = await run(executable, ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(pickerScript, "utf16le").toString("base64")],
      { windowsHide: true, shell: false, timeout: 180000, maxBuffer: 32768, encoding: "utf8", signal });
    return JSON.parse(result.stdout.trim() || "null")?.path || null;
  } catch (error) {
    if (signal?.aborted) throw fail("Folder selection cancelled.", 409);
    throw fail("Folder selection did not finish. Choose folder to try again.", 409);
  }
}

export function createWorkspaceSelection({ file, register, picker = pickWindowsWorkspace, now = Date.now }) {
  let records = [], pending = null, picking = false, saving = false;
  const key = value => process.platform === "win32" ? value.toLowerCase() : value;
  async function validate(value) {
    if (typeof value !== "string" || !path.isAbsolute(value)) throw fail("Choose an existing project folder.");
    let resolved;
    try { resolved = await realpath(value); if (!(await stat(resolved)).isDirectory()) throw Error(); }
    catch { throw fail("This folder is no longer available. Choose another project folder."); }
    if (key(resolved) === key(path.parse(resolved).root) || key(resolved) === key(homedir())) throw fail("Choose a project folder, not an entire drive or your home directory.");
    return resolved;
  }
  return {
    async initialize() {
      try {
        const stored = JSON.parse(await readFile(file, "utf8"));
        if (stored.version !== 1 || !Array.isArray(stored.workspaces) || stored.workspaces.some(item => typeof item.id !== "string" || typeof item.label !== "string" || !path.isAbsolute(item.path))) throw Error("invalid");
        records = stored.workspaces;
        for (const record of records) register(record);
      } catch (error) { if (error.code !== "ENOENT") throw fail("Saved workspaces could not be read. Existing data was not overwritten.", 500); }
    },
    async pick({ signal } = {}) {
      if (picking) throw fail("A folder chooser is already open.", 409);
      picking = true;
      try {
        const chosen = await picker({ signal });
        if (!chosen || signal?.aborted) return null;
        const resolved = await validate(chosen);
        pending = { token: randomUUID(), path: resolved, label: path.basename(resolved), expires: now() + 15 * 60 * 1000 };
        return { token: pending.token, path: pending.path, label: pending.label };
      } finally { picking = false; }
    },
    async approve({ token, approved } = {}) {
      if (saving) throw fail("A workspace is already being saved.", 409);
      if (approved !== true || !pending || token !== pending.token || pending.expires < now()) throw fail("Choose the folder again and confirm workspace access.", 409);
      saving = true;
      try {
        const selected = pending;
        const resolved = await validate(selected.path);
        if (key(resolved) !== key(selected.path)) throw fail("The selected folder changed. Choose it again.", 409);
        const existing = records.find(item => key(item.path) === key(resolved));
        const record = existing || { id: "workspace-" + createHash("sha256").update(key(resolved)).digest("hex").slice(0, 20), label: selected.label, path: resolved };
        const next = existing ? records : [...records, record];
        await mkdir(path.dirname(file), { recursive: true });
        const temporary = file + "." + randomUUID() + ".tmp";
        await writeFile(temporary, JSON.stringify({ version: 1, workspaces: next }, null, 2), { mode: 0o600 });
        await rename(temporary, file);
        records = next;
        register(record);
        if (pending === selected) pending = null;
        return record;
      } finally { saving = false; }
    },
  };
}
