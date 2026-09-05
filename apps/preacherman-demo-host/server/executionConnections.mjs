import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const protocols = new Set(["openai", "anthropic"]);
export const executionPresets = [
  { id: "deepseek", label: "DeepSeek", protocol: "openai", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  { id: "openai", label: "OpenAI", protocol: "openai", baseUrl: "https://api.openai.com/v1", model: "" },
  { id: "anthropic", label: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "" },
  { id: "custom", label: "Custom gateway", protocol: "openai", baseUrl: "", model: "" },
];

export function connectionUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw fail("Enter a valid HTTPS Base URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || isIP(url.hostname) || !url.hostname.includes(".") || /\.(local|localhost|internal)$/i.test(url.hostname)) {
    throw fail("Use a public HTTPS hostname without credentials, query or fragment.");
  }
  return url.href.replace(/\/+$/, "");
}

// Resolve once, reject non-public IPv4 addresses, and pin that address to the TLS
// request. No redirects, ambient proxy credentials, or DNS rebinding.
export function publicIpv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !([0, 10, 127].includes(a) || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
}

export async function connectionRequest(url, { method = "GET", headers, body } = {}) {
  const parsed = new URL(url);
  let timer;
  let addresses;
  try {
    addresses = await Promise.race([
      lookup(parsed.hostname, { family: 4, all: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(fail("DNS lookup timed out.", 504)), 8000); timer.unref(); }),
    ]);
  } catch { throw fail("Gateway DNS lookup failed. Check its hostname.", 502); }
  finally { clearTimeout(timer); }
  if (!addresses.length || addresses.some(({ address }) => !publicIpv4(address))) throw fail("The gateway must resolve to a public address.");
  return new Promise((resolve, reject) => {
    const req = httpsRequest(parsed, {
      method, headers, agent: false,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [addresses[0]]) : callback(null, addresses[0].address, 4),
    }, response => {
      let size = 0;
      const chunks = [];
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) req.destroy(fail("Provider response exceeded the limit.", 502));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(fail(
          response.statusCode === 401 || response.statusCode === 403 ? "Provider rejected the API key or model access." :
          response.statusCode === 429 ? "Provider rate limit reached. Retry later." :
          `Provider returned HTTP ${response.statusCode}. Check the endpoint and model.`, 502));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(fail("Provider returned an invalid JSON response.", 502)); }
      });
    });
    const timer = setTimeout(() => req.destroy(fail("Provider request timed out. Retry later.", 504)), 30000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", () => reject(fail("Provider connection failed. Check the endpoint and retry.", 502)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function required(value, name, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\x00-\x1f]/.test(value)) throw fail(`Enter a valid ${name}.`);
  return value.trim();
}
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exposed = ({ apiKey, ...profile }) => ({ ...profile, keySaved: Boolean(apiKey) });

export function createExecutionConnections({ file, request = connectionRequest, legacyKey = async () => "" }) {
  let queue = Promise.resolve();
  const tested = new Map();
  const modelLists = new Map();
  const modelKey = profile => fingerprint({ baseUrl: profile.baseUrl, protocol: profile.protocol, apiKey: profile.apiKey });
  async function read() {
    try {
      const state = JSON.parse(await readFile(file, "utf8"));
      if (state.version !== 1 || !Array.isArray(state.connections)) throw Error("invalid");
      if (!state.local && state.active?.mode === "cli") state.local = state.active;
      return state;
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, connections: [], active: null };
      throw fail("Execution settings could not be read. Existing data was not overwritten.", 500);
    }
  }
  async function mutate(update) {
    const operation = queue.then(async () => {
      const state = await read();
      const next = await update(state);
      await mkdir(dirname(file), { recursive: true });
      const temp = file + "." + randomUUID() + ".tmp";
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, file);
      return next;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  async function resolveDraft(draft) {
    if (!draft || typeof draft !== "object") throw fail("Connection configuration is required.");
    const state = await read();
    const previous = state.connections.find(item => item.id === draft.id);
    if (draft.id && !previous && draft.id !== "legacy-deepseek") throw fail("Connection no longer exists.", 409);
    const protocol = draft.protocol;
    if (!protocols.has(protocol)) throw fail("Choose a supported API protocol.");
    const baseUrl = connectionUrl(required(draft.baseUrl, "Base URL", 2048));
    const inheritedKey = previous?.baseUrl === baseUrl && previous.protocol === protocol ? previous.apiKey :
      draft.id === "legacy-deepseek" && baseUrl === "https://api.deepseek.com" && protocol === "openai" ? await legacyKey() : "";
    const apiKey = required(draft.apiKey?.trim() || inheritedKey, "API key", 4096);
    if (/\s/.test(apiKey)) throw fail("API key must not contain whitespace.");
    const maxTokens = draft.maxTokens === "" || draft.maxTokens == null ? null : Number(draft.maxTokens);
    if (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 200000)) throw fail("Max tokens must be between 64 and 200000.");
    const reasoning = draft.reasoning || "";
    if (reasoning && (protocol !== "openai" || !["low", "medium", "high"].includes(reasoning))) throw fail("Unsupported reasoning option.");
    return { id: draft.id || "", name: required(draft.name, "connection name", 80), protocol, baseUrl, apiKey,
      model: typeof draft.model === "string" ? draft.model.trim().slice(0, 200) : "", maxTokens, reasoning };
  }
  const headers = profile => profile.protocol === "anthropic" ?
    { "content-type": "application/json", "x-api-key": profile.apiKey, "anthropic-version": "2023-06-01" } :
    { "content-type": "application/json", Authorization: "Bearer " + profile.apiKey };
  async function complete(profile, messages, toolProbe = false) {
    required(profile.model, "model ID");
    const anthropic = profile.protocol === "anthropic";
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    const body = { model: profile.model, messages, ...(anthropic ? { max_tokens: profile.maxTokens || 4096 } :
      profile.maxTokens ? { [profile.baseUrl.startsWith("https://api.openai.com/") ? "max_completion_tokens" : "max_tokens"]: profile.maxTokens } : {}) };
    if (!anthropic && profile.reasoning) body.reasoning_effort = profile.reasoning;
    if (toolProbe) {
      body.tools = anthropic ? [{ name: "connection_probe", description: "A harmless connection probe; no action is executed.", input_schema: schema }] :
        [{ type: "function", function: { name: "connection_probe", description: "A harmless probe; no action is executed.", parameters: schema } }];
      body.tool_choice = anthropic ? { type: "tool", name: "connection_probe" } : { type: "function", function: { name: "connection_probe" } };
    }
    const payload = await request(profile.baseUrl + (anthropic ? "/messages" : "/chat/completions"), { method: "POST", headers: headers(profile), body });
    const text = anthropic ? (payload.content || []).filter(item => item.type === "text").map(item => item.text).join("\n") : payload.choices?.[0]?.message?.content;
    const tools = anthropic ? payload.content?.some(item => item.type === "tool_use" && item.name === "connection_probe") :
      payload.choices?.[0]?.message?.tool_calls?.some(item => item.function?.name === "connection_probe");
    if (!toolProbe && (typeof text !== "string" || !text.trim())) throw fail("The model returned no text. Check its protocol and settings.", 502);
    return { text: typeof text === "string" ? text.slice(0, 100000) : "", tools: Boolean(tools) };
  }
  return {
    async status() {
      const state = await read();
      const connections = state.connections.map(exposed);
      if (!connections.some(item => item.id === "legacy-deepseek") && await legacyKey()) connections.unshift({
        id: "legacy-deepseek", name: "DeepSeek · existing key", protocol: "openai", baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash", maxTokens: null, reasoning: "", keySaved: true, tested: false,
      });
      return { connections, active: state.active, local: state.local || (state.active?.mode === "cli" ? state.active : null), presets: executionPresets };
    },
    async models(draft) {
      const profile = await resolveDraft(draft);
      const payload = await request(profile.baseUrl + "/models", { headers: headers(profile) });
      if (!Array.isArray(payload.data)) throw fail("Model discovery is unavailable. Enter the model ID manually.", 502);
      const models = payload.data.filter(item => typeof item.id === "string" && item.id.length <= 200).slice(0, 500).map(item => ({ id: item.id, label: typeof item.display_name === "string" ? item.display_name.slice(0, 200) : item.id }));
      if (modelLists.size > 50) modelLists.clear();
      modelLists.set(modelKey(profile), models);
      return { models };
    },
    async test(draft) {
      const profile = await resolveDraft(draft);
      tested.delete(fingerprint(profile));
      await complete(profile, [{ role: "user", content: "Reply with OK." }]);
      let tools = false;
      try { tools = (await complete(profile, [{ role: "user", content: "Call connection_probe with ok=true." }], true)).tools; } catch { /* Chat readiness is independent of optional tool support. */ }
      if (tested.size > 50) tested.clear();
      tested.set(fingerprint(profile), { at: Date.now(), tools });
      return { connected: true, response: true, tools, checkedAt: new Date().toISOString() };
    },
    async save(draft) {
      const profile = await resolveDraft(draft);
      const verification = tested.get(fingerprint(profile));
      if (!verification || Date.now() - verification.at > 600000) throw fail("Test this exact configuration before saving and using it.", 409);
      const next = await mutate(state => {
        const id = profile.id || "connection-" + randomUUID();
        const models = modelLists.get(modelKey(profile)) || [];
        const saved = { ...profile, id, tested: true, tools: verification.tools, models: models.some(model => model.id === profile.model)
          ? models : [{ id: profile.model, label: profile.model }, ...models] };
        return { ...state, connections: [...state.connections.filter(item => item.id !== id), saved], active: { mode: "api", connectionId: id, model: profile.model } };
      });
      return { active: next.active };
    },
    async activateLocal(agentId, workspaceId, label = agentId) {
      const local = { mode: "cli", agentId, label, workspaceId, model: "default" };
      await mutate(state => ({ ...state, local, active: local }));
    },
    async disconnectLocal() {
      await mutate(state => ({ ...state, local: null, active: state.active?.mode === "cli" ? null : state.active }));
    },
    async chat({ connectionId, model, messages }) {
      if (!Array.isArray(messages) || !messages.length || messages.length > 40 ||
        messages.some(item => !["user", "assistant"].includes(item?.role) || typeof item.content !== "string" || !item.content.trim() || item.content.length > 20000) ||
        messages.reduce((sum, item) => sum + item.content.length, 0) > 80000) throw fail("Conversation exceeds the supported message limit.");
      const state = await read();
      let profile = state.connections.find(item => item.id === connectionId);
      if (!profile && connectionId === "legacy-deepseek") profile = await resolveDraft({ id: connectionId, name: "DeepSeek", protocol: "openai", baseUrl: "https://api.deepseek.com", model });
      if (!profile) throw fail("Save this connection before sending a message.", 409);
      // Snapshot credentials and model before awaiting any network call.
      return complete({ ...profile, model: required(model || profile.model, "model ID") }, messages.map(({ role, content }) => ({ role, content })));
    },
  };
}
