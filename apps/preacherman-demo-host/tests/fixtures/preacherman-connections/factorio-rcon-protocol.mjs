export function createFactorioRconProtocolFixture(events = []) {
  return {
    async probe(input) {
      events.push({ operation: "probe", ...input, signal: undefined });
      return { ok: input.command === "/players online", response: "Online players (0)" };
    },
    async open(input) {
      events.push({ operation: "open", ...input, signal: undefined });
      return { connected: true, session: { id: "factorio-rcon-1" } };
    },
    async close({ session, signal }) {
      events.push({ operation: "close", sessionId: session.id, aborted: signal.aborted });
      return { closed: true };
    },
  };
}
