import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const componentPath = join(packageRoot, "src", "airi", "AiriMemoryPersonaPanel.tsx");
const stylesPath = join(packageRoot, "src", "airi", "airi-memory-persona-panel.css");

async function loadPanel(t) {
  const temporaryDirectory = await mkdtemp(join(packageRoot, ".tmp-airi-memory-panel-"));
  const outputPath = join(temporaryDirectory, "panel.mjs");
  const source = (await readFile(componentPath, "utf8")).replace(/^import "\.\/airi-memory-persona-panel\.css";\r?\n/m, "");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  await writeFile(outputPath, output, "utf8");
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  return import(`${pathToFileURL(outputPath).href}?${Date.now()}`);
}

const persona = { id: "persona-airi", name: "Airi", description: "Local guide", selected: true };
const memory = {
  id: "memory-1",
  owner: "preacherman-runtime",
  personaId: persona.id,
  namespace: "work",
  text: "Ship the demo",
  tags: [],
  redacted: false,
  temporal: {
    recordedAt: "2026-08-08T12:00:00.000Z",
    occurredAt: "2026-08-08T11:00:00.000Z",
    timezone: "Asia/Shanghai",
    expiresAt: null,
    ageMs: 3_600_000,
    isExpired: false,
  },
};

test("request helpers call the four real Memory/Persona service routes", async (t) => {
  const { loadAiriPersonas, recallAiriMemories, rememberAiriMemory, selectAiriPersona } = await loadPanel(t);
  const calls = [];
  const request = async (path, init) => {
    calls.push([path, init]);
    if (path === "/api/personas") return { personas: [persona], selected: persona };
    if (path.endsWith("/select")) return { selected: persona };
    if (path === "/api/memory/remember") return { memory };
    return { memories: [memory] };
  };

  assert.equal((await loadAiriPersonas(request)).selected.id, persona.id);
  assert.equal((await selectAiriPersona(request, persona.id)).id, persona.id);
  assert.equal((await rememberAiriMemory(request, { personaId: persona.id, namespace: "work", text: "Ship the demo" })).id, memory.id);
  assert.equal((await recallAiriMemories(request, { personaId: persona.id, namespace: "work", query: "demo", limit: 20 }))[0].id, memory.id);

  assert.deepEqual(calls.map(([path]) => path), [
    "/api/personas",
    `/api/personas/${persona.id}/select`,
    "/api/memory/remember",
    "/api/memory/recall",
  ]);
  assert.equal(calls[0][1], undefined);
  for (const [, init] of calls.slice(1)) {
    assert.equal(init.method, "POST");
    assert.equal(init.headers["content-type"], "application/json");
  }
  assert.deepEqual(JSON.parse(calls[1][1].body), {});
  assert.deepEqual(JSON.parse(calls[2][1].body), { personaId: persona.id, namespace: "work", text: "Ship the demo" });
  assert.deepEqual(JSON.parse(calls[3][1].body), { personaId: persona.id, namespace: "work", query: "demo", limit: 20 });
});

test("malformed service results never become apparent success", async (t) => {
  const { loadAiriPersonas, recallAiriMemories, rememberAiriMemory, selectAiriPersona } = await loadPanel(t);
  await assert.rejects(loadAiriPersonas(async () => ({ selected: null })), /persona list/i);
  await assert.rejects(selectAiriPersona(async () => ({ selected: null }), persona.id), /invalid response/i);
  await assert.rejects(rememberAiriMemory(async () => ({ memory: { id: "incomplete" } }), {
    personaId: persona.id, namespace: "work", text: "demo",
  }), /memory time metadata|invalid memory/i);
  await assert.rejects(recallAiriMemories(async () => ({ memories: null }), {
    personaId: persona.id, namespace: "work", query: "", limit: 20,
  }), /memory list/i);
});

test("panel markup is bilingual, accessible, and does not collect restricted fields", async (t) => {
  const { AiriMemoryPersonaPanel } = await loadPanel(t);
  const request = async () => ({ personas: [], selected: null });
  const english = renderToStaticMarkup(createElement(AiriMemoryPersonaPanel, { locale: "en", serviceRequest: request }));
  const chinese = renderToStaticMarkup(createElement(AiriMemoryPersonaPanel, { locale: "zh-CN", serviceRequest: request }));

  assert.match(english, /Memory &amp; persona/);
  assert.match(chinese, /记忆与人格/);
  assert.match(english, /aria-labelledby="airi-memory-title"/);
  assert.match(english, /for="airi-memory-namespace"/);
  assert.match(english, /for="airi-memory-content"/);
  assert.match(english, /for="airi-memory-query"/);
  assert.match(english, /role="note"/);
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /\/api\/personas\/\$\{encodeURIComponent\(personaId\)\}\/select/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.ok(source.indexOf("await selectAiriPersona") < source.indexOf("setSelectedPersona(selected)"));
  assert.doesNotMatch(english, /type="password"/);
  assert.doesNotMatch(english, /type="file"/);
  assert.doesNotMatch(english, /<audio/i);
  assert.doesNotMatch(english, /name="(?:credential|audio|token|password|apiKey)"/i);
});

test("time labels are localized without discarding exact temporal metadata", async (t) => {
  const { formatMemoryAge } = await loadPanel(t);
  assert.equal(formatMemoryAge(30_000, "en"), "just now");
  assert.equal(formatMemoryAge(120_000, "en"), "2m ago");
  assert.equal(formatMemoryAge(7_200_000, "zh-CN"), "2 小时前");
  assert.equal(formatMemoryAge(172_800_000, "zh-CN"), "2 天前");
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /dateTime=\{memory\.temporal\.occurredAt\}/);
  assert.match(source, /memory\.temporal\.timezone/);
  assert.match(source, /memory\.temporal\.ageMs/);
  assert.match(source, /memory\.temporal\.isExpired/);
});

test("standalone styles honor both themes through semantic variables only", async () => {
  const styles = await readFile(stylesPath, "utf8");
  for (const token of [
    "surface", "surface-elevated", "text", "muted", "border", "border-strong",
    "focus", "loading", "error", "control-hover-bg", "activate-fill", "activate-fill-text",
  ]) {
    assert.match(styles, new RegExp(`var\\(--demo-theme-${token}\\)`));
  }
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /:disabled/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(styles, /\brgba?\(/i);
});
