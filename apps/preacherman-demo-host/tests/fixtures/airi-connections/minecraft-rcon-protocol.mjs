export function createMinecraftRconProtocolFixture(events = []) {
  return {
    async probe(input) {
      events.push({ operation: "probe", ...input, signal: undefined });
      return { ok: input.command === "list", response: "There are 0 players online" };
    },
    async open(input) {
      events.push({ operation: "open", ...input, signal: undefined });
      return { connected: true, session: { id: "minecraft-rcon-1" } };
    },
    async close({ session, signal }) {
      events.push({ operation: "close", sessionId: session.id, aborted: signal.aborted });
      return { closed: true };
    },
  };
}
