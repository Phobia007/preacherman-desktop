import { cp, rm } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const hostRoot = resolve(import.meta.dirname, "..");
const source = resolve(hostRoot, "dist");
const target = resolve(hostRoot, "tauri-dist");
const externalRoots = [
  resolve(source, "assets/avatars"),
  resolve(source, "gallery-v3"),
  resolve(source, "settings-v3-local"),
  resolve(source, "task-lookback-v3"),
];

function isExternalAsset(path) {
  return externalRoots.some((root) => {
    const nested = relative(root, path);
    return nested === "" || (!nested.startsWith(`..${sep}`) && nested !== "..");
  });
}

await rm(target, { recursive: true, force: true });
await cp(source, target, {
  recursive: true,
  filter: (path) => !isExternalAsset(resolve(path)),
});
