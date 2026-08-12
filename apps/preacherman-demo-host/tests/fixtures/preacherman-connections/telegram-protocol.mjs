export function createTelegramProtocolFixture(events = []) {
  return {
    async getMe({ botToken, signal }) {
      events.push({ operation: "getMe", botToken, aborted: signal.aborted });
      return { ok: true, result: { id: 1001, username: "preacherman_bot" } };
    },
    async startUpdates({ botToken, signal }) {
      events.push({ operation: "startUpdates", botToken, aborted: signal.aborted });
      return { running: true, session: { id: "telegram-updates-1" } };
    },
    async stopUpdates({ session, signal }) {
      events.push({ operation: "stopUpdates", sessionId: session.id, aborted: signal.aborted });
      return { stopped: true };
    },
  };
}
