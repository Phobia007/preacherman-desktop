import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Extract only the existing Task postprocess, not its Vue/Gallery/card runtime.
const app = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(app, "public/gallery-v3/portfolio/_nuxt/D9b8F35K.js"), "utf8");
const shaders = source.match(/const p0=`([\s\S]*?)`,C3=`([\s\S]*?)`,P3=/);
const curve = source.match(/pU=(\[\[.*?\]\]),zu=/);
const controls = source.match(/WU=\.11,qU=1\.5,XU=\.09,\$U=\.3,YU=\.05,KU=-\.1,jU=\.25,ZU=\.3,JU=\.015,QU=\.004/);
if (!shaders || !curve || !controls || !source.includes('duration:e?.85:.65,ease:zu')) {
  throw new Error("Task profile implementation changed; review the port before regenerating.");
}
const clean = value => value.replace(/\/\/[^\n]*/g, "").replace(/\n\s*\n/g, "\n").trim();
const output = "// Generated from Task's D9b8F35K.js by scripts/extract-task-profile-lens.mjs.\n"
  + "// Shader math and source easing are retained; alpha compositing is adapted by the host.\n"
  + "export const taskProfileVertex = " + JSON.stringify(clean(shaders[1])) + ";\n"
  + "export const taskProfileFragment = " + JSON.stringify(clean(shaders[2])) + ";\n"
  + "export const taskProfileCurve = " + curve[1] + " as const;\n"
  + "export const taskProfileSettings = { open: 850, close: 650, lens: 1.5, reach: 0.09, orbit: 0.3, wave: 0.05, closeSquash: -0.1, squashOpen: 300, squashClose: 250, breath: 0.015, aberration: 0.004 } as const;\n";
await writeFile(resolve(app, "src/surfaces/market/task-profile-source.ts"), output);
console.log("Extracted Task profile shader, easing and settings.");
