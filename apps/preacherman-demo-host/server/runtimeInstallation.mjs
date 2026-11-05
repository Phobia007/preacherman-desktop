import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Written by the local installer, never accepted from a browser request.
// The existing workstation layout remains a fallback, so upgrading does not
// move a user's voices, models, containers or character memories.
export function resolveRuntimeInstallation({ env = process.env, home = homedir(), platform = process.platform,
  exists = existsSync, read = file => readFileSync(file, "utf8") } = {}) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const configFile = env.PREACHERMAN_RUNTIME_CONFIG || paths.join(env.PREACHERMAN_DATA_DIR || paths.join(home, ".preacherman-demo"), "runtime-installation.json");
  let configuredRoot = env.PREACHERMAN_RUNTIME_ROOT;
  if (!configuredRoot && exists(configFile)) {
    try {
      const saved = JSON.parse(read(configFile).replace(/^\uFEFF/, ""));
      if (saved.schemaVersion === 1 && typeof saved.root === "string" && paths.isAbsolute(saved.root)) configuredRoot = saved.root;
    } catch { /* An incomplete installer record must not prevent Home from opening. */ }
  }
  if (configuredRoot && !paths.isAbsolute(configuredRoot)) throw new Error("PREACHERMAN_RUNTIME_ROOT must be an absolute local path.");
  const root = configuredRoot || paths.join(env.LOCALAPPDATA || paths.join(home, ".local", "share"), "Preacherman", "runtime");
  const component = (name, legacy) => !configuredRoot && platform === "win32" && exists(legacy) ? legacy : paths.join(root, name);
  const dockerCandidate = paths.join(env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources", "bin", "docker.exe");
  return {
    root, configFile,
    breezeRoot: component("breeze", "D:\\AI\\Breeze-TTS-2"),
    speechRoot: component("speech", "D:\\AI\\PreachermanSpeech"),
    speechMotionCompose: paths.join(component("speech2motion", "D:\\Codex\\speech2motion"), "compose.yaml"),
    audioFaceCompose: paths.join(component("audio2face", "D:\\Codex\\audio2face"), "compose.yaml"),
    docker: env.PREACHERMAN_DOCKER_EXECUTABLE || (platform === "win32" && exists(dockerCandidate) ? dockerCandidate : "docker"),
  };
}
