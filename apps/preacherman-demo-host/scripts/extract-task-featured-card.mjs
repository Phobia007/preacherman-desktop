import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// The same Task card component: preserve its shaders, tessellation, camera and sheet settings.
const app = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(app, "public/gallery-v3/portfolio/_nuxt/D9b8F35K.js"), "utf8");
const shader = name => {
  const match = source.match(new RegExp("\\b" + name + "=`([\\s\\S]*?)`"));
  if (!match) throw new Error(`Task shader ${name} changed; review the extraction.`);
  return match[1].replace(/\/\/[^\n]*/g, "").replace(/\n\s*\n/g, "\n").trim();
};
const compose = (name, chunks) => shader(name).replace("#include <chunks>", chunks.map(shader).join("\n"));
const value = name => {
  const match = source.match(new RegExp("\\b" + name + "=(-?[\\d.]+)(?=[,;])"));
  if (!match) throw new Error(`Task setting ${name} changed.`);
  return Number(match[1]);
};
const camera = source.match(/class I3\{constructor\(\)\{this.camera=new Un\(([^,]+),1,\.1,2e3\),this.camera.position.z=([^,]+)/);
if (!camera || !source.includes("Wf=new fi(1,1,24,24)")) throw new Error("Task card camera/geometry changed.");
const settings = { fov: Number(camera[1]), cameraZ: Number(camera[2]), segments: 24, depth: value("wU"), span: value("EU"), door: value("CU"), spread: value("AU"), velocityDepth: value("SU"), velocityNorm: value("DU"), dent: value("hF"), hoverMs: 500, gap: 10, radius: 20 };
const output = "// Generated from Task's card component by scripts/extract-task-featured-card.mjs.\n"
  + "// Preserve the authored sheet/lighting/corner math; Market supplies only content and a constant-speed clock.\n"
  + "export const taskCardVertex = " + JSON.stringify(compose("q3", ["Wl", "Nl", "Bu"])) + ";\n"
  + "export const taskCardFragment = " + JSON.stringify(compose("X3", ["Nl", "Bu", "L3", "Zm", "ua", "Mo"])) + ";\n"
  + "export const taskCardSettings = " + JSON.stringify(settings) + " as const;\n";
await writeFile(resolve(app, "src/surfaces/market/task-featured-card-source.ts"), output);
console.log("Extracted the original Task Featured card shaders, camera and settings.");
