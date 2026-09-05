import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const definitions = [
  { id: "claude-code", label: "Claude Code", command: "claude", npm: "@anthropic-ai/claude-code" },
  { id: "gemini-cli", label: "Gemini CLI", command: "gemini", npm: "@google/gemini-cli" },
  { id: "opencode", label: "OpenCode", command: "opencode", npm: "opencode-ai" },
];
const exists = async file => { try { await access(file); return true; } catch { return false; } };

// Discovery is not an execution adapter. Only fixed version probes run; wrappers
// and credentials are never evaluated, and absent products are not invented.
export async function discoverLocalAgents({ env = process.env, platform = process.platform, probe = run } = {}) {
  const windows = platform === "win32";
  const home = env.USERPROFILE || env.HOME || "";
  const search = [...new Set([
    ...String(env.PATH || env.Path || "").split(windows ? ";" : ":"),
    ...(home ? [path.join(home, ".local", "bin"), path.join(home, ".bun", "bin")] : []),
    ...(env.APPDATA ? [path.join(env.APPDATA, "npm")] : []),
  ].filter(Boolean))];
  const result = [];
  for (const definition of definitions) {
    let executable = null, located = false, version = null;
    for (const directory of search) {
      for (const extension of windows ? [".exe", ".cmd", ".ps1"] : [""]) {
        const candidate = path.join(directory, definition.command + extension);
        if (!await exists(candidate)) continue;
        located = true;
        if (!windows || extension === ".exe") { executable = candidate; break; }
      }
      if (executable) break;
    }
    if (env.APPDATA) {
      try {
        const pkg = JSON.parse(await readFile(path.join(env.APPDATA, "npm", "node_modules", definition.npm, "package.json"), "utf8"));
        if (pkg.name === definition.npm) { located = true; version = typeof pkg.version === "string" ? pkg.version.slice(0, 80) : null; }
      } catch { /* Not installed in this npm prefix. */ }
    }
    if (!located) continue;
    let state = "detected";
    if (executable) {
      try {
        const safeEnv = Object.fromEntries(Object.entries(env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|TEMP|TMP)$/i.test(key)));
        const output = await probe(executable, ["--version"], { timeout: 8000, maxBuffer: 32768, windowsHide: true, shell: false, env: safeEnv });
        version = /\d+\.\d+\.\d+(?:[-+][\w.-]+)?/.exec(output.stdout)?.[0] || version;
      } catch { state = "error"; }
    }
    result.push({ id: definition.id, label: definition.label, kind: "discovered-local-cli", installed: true, version,
      detection: {state}, auth: {state: "unknown", reason: "execution-adapter-required"}, capabilities: {},
      execution: {supported:false, models:[], workspaceRequired:false, reasoningManagedByAgent:true} });
  }
  return result;
}
