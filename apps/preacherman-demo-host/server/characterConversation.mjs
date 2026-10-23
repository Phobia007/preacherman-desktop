import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import characters from "../src/surfaces/asset/characters.json" with { type: "json" };

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function createCharacterConversation({ file, connections, codex, listAgents }) {
  let queue = Promise.resolve();
  const sessions = new Map();
  const busy = new Set();
  function identity(id) {
    const character = characters.find(item => item.id === id);
    if (!character) throw fail("Unknown character.", 404);
    return character;
  }
  async function read() {
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return {}; throw error; }
  }
  async function update(operation) {
    const next = queue.then(async () => {
      const state = await read(); const result = await operation(state);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(state, null, 2)); await rename(file + ".tmp", file);
      return result;
    });
    queue = next.catch(() => {}); return next;
  }
  async function profile(id) {
    const character = identity(id);
    const existing = (await read())[id];
    if (existing) return existing;
    return update(async state => {
      if (!state[id]) state[id] = {
        id, name: character.name, execution: (await connections.status()).active,
        rules: [], enabledSkillIds: [], memorySpaceId: "character:" + id,
      };
      return structuredClone(state[id]);
    });
  }
  async function settings(id) {
    const saved = await profile(id); const shared = await connections.status();
    return { ...shared, active: saved.execution, local: saved.execution?.mode === "cli" ? saved.execution : null, characterId: id };
  }
  async function select(id, execution) {
    await profile(id);
    await update(state => { state[id].execution = execution; });
    // Changing execution never carries a previous provider's private conversation forward.
    for (const key of sessions.keys()) if (key.startsWith(id + ":")) sessions.delete(key);
    return settings(id);
  }
  return {
    profile, settings,
    async local(id, agentId) {
      identity(id);
      if (agentId === null) return select(id, null);
      const agent = (await listAgents()).find(item => item.id === agentId);
      if (agent?.id !== "codex-cli" || !agent.installed || agent.auth?.state !== "ready") throw fail("A signed-in Codex CLI is required.", 409);
      return select(id, { mode: "cli", agentId, model: "default", label: agent.label });
    },
    async save(id, draft) {
      identity(id);
      const { active } = await connections.save(draft, { activate: false });
      return select(id, active);
    },
    async chat(id, { text, sessionId }, signal) {
      const character = identity(id);
      if (typeof text !== "string" || !text.trim() || text.length > 4000) throw fail("A spoken message is required.");
      if (typeof sessionId !== "string" || !/^[\w-]{16,80}$/.test(sessionId)) throw fail("A valid voice session is required.");
      const saved = await profile(id); const execution = saved.execution;
      if (!execution) throw fail("Choose an execution mode in this character's Settings first.", 409);
      const key = id + ":" + sessionId;
      if (busy.has(key)) throw fail("Wait for this character's reply.", 409);
      const now = Date.now();
      for (const [key, value] of sessions) if (now - value.at > 30 * 60000) sessions.delete(key);
      if (sessions.size >= 64) sessions.delete(sessions.keys().next().value);
      const stamp = JSON.stringify(execution);
      const previous = sessions.get(key);
      const messages = [...(previous?.execution === stamp ? previous.messages : []), { role: "user", content: text.trim() }];
      while (messages.length > 1 && messages.reduce((size, message) => size + message.content.length, 0) > 60000) messages.splice(0, 2);
      const personaInstructions = `You are ${character.name}, the user's virtual companion in Preacherman. ` +
        `Character background: ${character.designation}. ${character.paragraphs.join(" ")} ` +
        "Speak naturally in first person, in the user's language. This is a voice-only conversation. " +
        "Keep replies to one to three short spoken sentences unless more detail is requested. No Markdown or stage directions. " +
        "You can converse and help plan; you cannot execute tools or claim to have performed actions. " +
        "Be honest that you are a virtual character if asked. " + saved.rules.join("\n");
      busy.add(key);
      try {
        signal?.throwIfAborted();
        const result = execution.mode === "cli"
          ? await codex.chat({ messages, model: execution.model, personaInstructions, signal })
          : await connections.chat({ connectionId: execution.connectionId, model: execution.model, messages, personaInstructions, signal });
        signal?.throwIfAborted();
        if (JSON.stringify((await profile(id)).execution) !== stamp) throw fail("Execution mode changed. Start a new conversation.", 409);
        if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 6000) throw fail("The reply cannot be spoken. Please ask for a shorter answer.", 502);
        sessions.set(key, { execution: stamp, at: Date.now(), messages: [...messages, { role: "assistant", content: result.text }].slice(-20) });
        return { text: result.text, characterId: id, source: result.source || "api" };
      } finally { busy.delete(key); }
    },
  };
}
