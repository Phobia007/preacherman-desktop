import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createTaskViewToggle} from "../public/gallery-v3/portfolio/task-view-toggle.js";

const root = fileURLToPath(new URL("../public/gallery-v3/portfolio/", import.meta.url));
const runtime = path.join(root, "_nuxt/D9b8F35K.js");
let source = fs.readFileSync(runtime, "utf8");
const declaration = 'const xB=createTaskViewToggle({element:tn,ref:Wt,watch:Fi,useNavigation:JB})';
if (!source.includes(declaration)) {
  const start = source.indexOf('const yB={class:"label relative pointer-events-auto');
  const end = source.indexOf(',bB=["inert"]', start);
  if (start < 0 || end < start) throw new Error("Task view switcher source changed");
  source = 'import {createTaskViewToggle} from "../task-view-toggle.js";\n' + source.slice(0, start) + declaration + source.slice(end);
  fs.writeFileSync(runtime, source);
}

// Match the Vue component on the first cold frame, including direct All/detail entry.
const element = (tag, props, children = []) => {
  const attributes = Object.entries(props).filter(([key]) => key !== "onClick")
    .map(([key, value]) => `${key}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(" ");
  return `<${tag} ${attributes}>${children.join("")}</${tag}>`;
};
function visit(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { visit(file); continue; }
    if (entry.name !== "index.html") continue;
    let html = fs.readFileSync(file, "utf8");
    const mode = path.dirname(file) === path.join(root, "full") ? "full" : "featured";
    const component = createTaskViewToggle({element, ref: value => ({value}), watch() {}, useNavigation: () => ({to() {}})});
    const switcher = /<nav\b[^>]*(?:data-od-id="project-view-switcher"|class="label relative pointer-events-auto)[^>]*>[\s\S]*?<\/nav>|<button\b[^>]*class="task-view-toggle"[^>]*>[\s\S]*?<\/button>/;
    if (!switcher.test(html)) throw new Error(`Task view switcher markup missing: ${file}`);
    html = html.replace(switcher, component.setup({mode})());
    const css = '<link rel="stylesheet" href="/gallery-v3/portfolio/task-view-toggle.css">';
    if (!html.includes(css)) html = html.replace('</head>', css + '</head>');
    fs.writeFileSync(file, html);
  }
}
visit(root);
