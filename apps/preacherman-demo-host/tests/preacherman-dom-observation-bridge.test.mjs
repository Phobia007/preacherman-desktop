import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const helperPath = join(packageRoot, "src", "preacherman", "domObservation.ts");
const bridgePath = join(packageRoot, "src", "preacherman", "PreachermanDomObservationBridge.tsx");

let helperModulePromise;

function loadHelperModule() {
  helperModulePromise ??= build({
    bundle: true,
    entryPoints: [helperPath],
    format: "esm",
    platform: "node",
    target: "node22",
    outdir: "out",
    write: false,
  }).then((result) => {
    const javascript = result.outputFiles.find((file) => file.path.endsWith(".js"));
    assert.ok(javascript);
    return import(`data:text/javascript;base64,${Buffer.from(javascript.text).toString("base64")}`);
  });
  return helperModulePromise;
}

class FakeElement {
  constructor(tag, attributes = {}, options = {}) {
    this.localName = tag;
    this.attributes = attributes;
    this.children = [];
    this.parentElement = null;
    this.isConnected = options.connected ?? true;
    this.rects = options.visible === false ? [] : [{}];
    this.disabled = options.disabled ?? false;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }

  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getClientRects() { return this.rects; }

  querySelectorAll() {
    const result = [];
    const visit = (element) => {
      for (const child of element.children) {
        result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}

function fakeDocument(body) {
  return {
    body,
    defaultView: {
      getComputedStyle(element) {
        return element.styles ?? { display: "block", visibility: "visible", contentVisibility: "visible", opacity: "1" };
      },
    },
  };
}

test("DOM observation captures bounded structural metadata and posts the versioned contract", async () => {
  const { capturePreachermanDomSnapshot, postPreachermanDomSnapshot } = await loadHelperModule();
  const body = new FakeElement("body");
  const main = new FakeElement("main", { role: "main", "aria-label": "Workspace" });
  const button = new FakeElement("button", {
    role: "button",
    "aria-label": "Run tool",
    "data-preacherman-control": "plugin.run plugin.run",
    disabled: "",
  }, { disabled: true });
  body.append(main.append(button));

  const snapshot = capturePreachermanDomSnapshot(fakeDocument(body), "workspace", () => new Date("2026-08-08T00:00:00.000Z"));
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.surface, "workspace");
  assert.equal(snapshot.capturedAt, "2026-08-08T00:00:00.000Z");
  assert.deepEqual(snapshot.nodes, [
    { tag: "main", role: "main", ariaLabel: "Workspace", disabled: false, visible: true, path: "body > main" },
    { tag: "button", role: "button", ariaLabel: "Run tool", preachermanControl: ["plugin.run"], disabled: true, visible: true, path: "preacherman:plugin.run" },
  ]);

  const calls = [];
  await postPreachermanDomSnapshot(async (path, init) => calls.push({ path, init }), snapshot);
  assert.equal(calls[0].path, "/api/computer-vision/dom-snapshot");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), snapshot);
});

test("DOM observation never includes form, conversation, private, content, or credential data", async () => {
  const { capturePreachermanDomSnapshot } = await loadHelperModule();
  const body = new FakeElement("body");
  const safe = new FakeElement("nav", { "aria-label": "Primary navigation" });
  const input = new FakeElement("input", { value: "user secret", placeholder: "email", "aria-label": "Email" });
  const userLabeledButton = new FakeElement("button", { "aria-label": "Delete user words outside chat" });
  const chat = new FakeElement("section", { class: "conversation-thread", "aria-label": "Conversation from Alice" });
  const message = new FakeElement("button", { "aria-label": "Delete message: private user words" });
  const privateRegion = new FakeElement("section", { "data-preacherman-private": "true" });
  const token = new FakeElement("button", { "aria-label": "Bearer abcdefgh", "data-preacherman-control": "secret.copy" });
  const editable = new FakeElement("div", { contenteditable: "true", "aria-label": "Draft from user" });
  body.append(safe, input, userLabeledButton, chat.append(message), privateRegion.append(token), editable);

  const serialized = JSON.stringify(capturePreachermanDomSnapshot(fakeDocument(body), "home"));
  assert.match(serialized, /Primary navigation/);
  for (const forbidden of ["user secret", "email", "user words outside chat", "Conversation from Alice", "private user words", "Bearer", "secret.copy", "Draft from user", "value", "placeholder", "contenteditable", "class"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});

test("DOM observation is capped at 200 nodes and reports truncation", async () => {
  const { PREACHERMAN_DOM_NODE_LIMIT, capturePreachermanDomSnapshot } = await loadHelperModule();
  const body = new FakeElement("body");
  body.append(...Array.from({ length: 240 }, (_, index) => new FakeElement("button", { "data-preacherman-control": `tool.${index}` })));
  const snapshot = capturePreachermanDomSnapshot(fakeDocument(body), "workspace");
  assert.equal(PREACHERMAN_DOM_NODE_LIMIT, 200);
  assert.equal(snapshot.nodes.length, 200);
  assert.equal(snapshot.truncated, true);
});

test("bridge is non-visual, mutation-throttled, silent on failure, and declares its host mounting contract", async () => {
  const [source, helper] = await Promise.all([readFile(bridgePath, "utf8"), readFile(helperPath, "utf8")]);
  assert.match(source, /currentSurface: string/);
  assert.match(source, /serviceRequest: PreachermanDomObservationServiceRequest/);
  assert.match(source, /new MutationObserver\(schedule\)/);
  assert.match(source, /MUTATION_THROTTLE_MS = 1_000/);
  assert.match(source, /FAILURE_COOLDOWN_MS = 15_000/);
  assert.match(source, /postPreachermanDomSnapshot\(serviceRequest, capturePreachermanDomSnapshot\(document, currentSurface\)\)/);
  assert.match(source, /catch \{[\s\S]*nextAttemptAt = Date\.now\(\) \+ FAILURE_COOLDOWN_MS/);
  assert.doesNotMatch(source, /console\.(?:error|warn|log)/);
  assert.match(source, /return null/);
  assert.match(source, /render once inside AppShell/);
  assert.doesNotMatch(helper, /\.(?:textContent|innerText|innerHTML|value|placeholder|title|id)\b/);
});
