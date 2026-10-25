import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import characters from "../src/surfaces/asset/characters.json" with { type: "json" };

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function createCharacterConversation({ file, connections, codex, listAgents, breeze, windowsSpeech }) {
  let queue = Promise.resolve();
  const sessions = new Map();
  const busy = new Set();
  const previewDirectory = join(dirname(file), "voice-previews");
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
  const voiceSettings = async (id, signal) => {
    const saved = await profile(id);
    let localVoices = [], breezeStatus = "offline";
    if (breeze) {
      try { localVoices = await breeze.voices(signal); breezeStatus = "connected"; }
      catch { signal?.throwIfAborted(); }
    }
    return {
      characterId: id,
      service: saved.voiceService || { provider: "", model: "", region: "", workspaceId: "" },
      connectionStatus: saved.voiceService?.provider === "breeze" ? breezeStatus : "not-connected",
      breezeStatus,
      selectedVoiceId: saved.selectedVoiceId || null,
      voices: [...(saved.voices || []).map(({ preview, ...voice }) => ({ ...voice, hasPreview: Boolean(preview) })), ...localVoices],
    };
  };
  const voiceField = (value, label, max = 160) => {
    if (typeof value !== "string" || value.length > max || /[\x00-\x1f]/.test(value)) throw fail(`Enter a valid ${label}.`);
    return value.trim();
  };
  return {
    profile, settings, voiceSettings,
    async connectBreeze(id, signal) {
      await profile(id); await breeze.connect(signal);
      return voiceSettings(id, signal);
    },
    async synthesize(id, input, signal) {
      const saved = await profile(id);
      if (saved.voiceService?.provider === "breeze") {
        const key = saved.selectedVoiceId;
        const imported = saved.voices?.find(v => v.id === key && v.provider === "breeze");
        const voiceId = key?.startsWith("breeze:") ? key.slice(7) : imported?.voiceId;
        if (!voiceId) throw fail("Choose a Breeze voice in Appearance → Voice and hold Apply first.", 409);
        return breeze.synthesize({ text: input.text, voiceId }, signal);
      }
      return windowsSpeech.synthesize(input, signal);
    },
    async saveVoiceService(id, input) {
      await profile(id);
      const service = {
        provider: voiceField(input.provider, "provider", 80), model: voiceField(input.model, "model"),
        region: voiceField(input.region, "region", 80), workspaceId: voiceField(input.workspaceId, "workspace ID"),
      };
      // Other providers remain drafts; Breeze is the installed local output service.
      await update(state => { state[id].voiceService = service; });
      return voiceSettings(id);
    },
    async addVoice(id, input) {
      await profile(id);
      const name = voiceField(input.name, "voice name", 60);
      const voiceId = voiceField(input.voiceId || "", "provider voice ID", 256);
      if (!name) throw fail("Give this voice a name.");
      const preview = input.preview;
      if (typeof preview !== "string" || preview.length > 4 * 1024 * 1024 || !/^data:audio\/(wav|x-wav|mpeg|mp3|ogg|mp4|x-m4a);base64,[A-Za-z0-9+/]+=*$/.test(preview)) throw fail("Choose a WAV, MP3, OGG or M4A preview under 3 MB.");
      const audio = Buffer.from(preview.split(",")[1], "base64");
      const signature = audio.subarray(0, 12).toString("latin1");
      if (audio.length < 32 || !(signature.startsWith("RIFF") && signature.endsWith("WAVE") || signature.startsWith("ID3") || signature.startsWith("OggS") || signature.slice(4, 8) === "ftyp" || audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)) throw fail("The preview is not a supported audio file.");
      await update(async state => {
        const voices = state[id].voices ||= [];
        if (voices.length >= 12) throw fail("This character can hold up to 12 voice previews. Remove one before adding another.");
        const optionId = `voice-${randomUUID()}`;
        await mkdir(previewDirectory, { recursive: true });
        await writeFile(join(previewDirectory, optionId), audio, { mode: 0o600 });
        voices.push({ id: optionId, name, voiceId, preview: { mime: preview.slice(5, preview.indexOf(";")) },
          provider: state[id].voiceService?.provider || "", model: state[id].voiceService?.model || "" });
      });
      return voiceSettings(id);
    },
    async previewVoice(id, voiceId, signal) {
      await profile(id);
      if (typeof voiceId === "string" && voiceId.startsWith("breeze:")) {
        const result = await breeze.synthesize({ text: "Hello, it's nice to meet you. This is my voice. I'm ready to chat whenever you are.", voiceId: voiceId.slice(7) }, signal);
        return { audio: `data:audio/wav;base64,${result.audio}` };
      }
      const voice = (await profile(id)).voices?.find(item => item.id === voiceId);
      if (!voice) throw fail("Voice preview not found.", 404);
      const audio = await readFile(join(previewDirectory, voice.id)).catch(() => { throw fail("This preview is missing. Remove it and add the audio file again.", 404); });
      return { audio: `data:${voice.preview.mime};base64,${audio.toString("base64")}` };
    },
    async applyVoice(id, voiceId) {
      await profile(id);
      const localVoice = typeof voiceId === "string" && voiceId.startsWith("breeze:")
        ? (await breeze.voices()).find(v => v.id === voiceId) : null;
      await update(state => {
        if (!localVoice && !state[id].voices?.some(item => item.id === voiceId)) throw fail("Choose an available voice first.");
        state[id].selectedVoiceId = voiceId;
        const voice = localVoice || state[id].voices.find(item => item.id === voiceId);
        if (voice.provider === "breeze") state[id].voiceService = { provider: "breeze", model: "Breeze-TTS-2", region: "local", workspaceId: "" };
        else if (state[id].voiceService?.provider === "breeze") state[id].voiceService = { provider: voice.provider || "", model: voice.model || "", region: "", workspaceId: "" };
      });
      return voiceSettings(id);
    },
    async removeVoice(id, voiceId) {
      await profile(id);
      if (typeof voiceId === "string" && voiceId.startsWith("breeze:")) throw fail("Shared Breeze voices are managed in the Breeze voice library.");
      let removed;
      await update(state => {
        removed = state[id].voices?.find(item => item.id === voiceId);
        state[id].voices = (state[id].voices || []).filter(item => item.id !== voiceId);
        if (state[id].selectedVoiceId === voiceId) state[id].selectedVoiceId = null;
      });
      if (removed) await unlink(join(previewDirectory, removed.id)).catch(error => { if (error.code !== "ENOENT") throw error; });
      return voiceSettings(id);
    },
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
