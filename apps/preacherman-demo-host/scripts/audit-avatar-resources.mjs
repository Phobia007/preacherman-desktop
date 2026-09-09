import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../public/", import.meta.url));
async function walk(dir) { const result = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const file = join(dir, entry.name); if (entry.isDirectory()) result.push(...await walk(file)); else result.push({ path: relative(root, file).replaceAll("\\", "/"), bytes: (await stat(file)).size }); } return result; }
export async function auditAvatarResources() {
  const files = await walk(root), groups = {}, models = [];
  for (const file of files) { const group = file.path.startsWith("assets/") ? file.path.split("/").slice(0, 2).join("/") : file.path.split("/")[0]; groups[group] = (groups[group] || 0) + file.bytes; }
  for (const file of files.filter(file => /-runtime\.glb$/.test(file.path))) {
    const bytes = await readFile(join(root, file.path)); const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
    const primitives = (gltf.meshes || []).flatMap(mesh => mesh.primitives);
    const triangles = primitives.reduce((sum, primitive) => sum + ((primitive.mode ?? 4) === 4 ? gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3 : 0), 0);
    models.push({ ...file, triangles, primitives: primitives.length, textures: gltf.textures?.length || 0 });
  }
  const packs = files.filter(file => file.path.includes("/motion-library/packs/") && file.path.endsWith(".glb"));
  const media = files.filter(file => file.path.startsWith("assets/gallery/") && /\.(mp4|webm)$/.test(file.path));
  return { publicBytes: files.reduce((sum, file) => sum + file.bytes, 0), groups, models, motionLibrary: { count: packs.length, bytes: packs.reduce((sum, file) => sum + file.bytes, 0) }, media };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await auditAvatarResources(), null, 2));
