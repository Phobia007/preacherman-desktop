export function createDiscordProtocolFixture(events = []) {
  return {
    async getCurrentUser({ authorization, signal }) {
      events.push({ operation: "getCurrentUser", authorization, aborted: signal.aborted });
      return { id: "discord-bot-1", username: "preacherman" };
    },
    async openGateway({ token, signal }) {
      events.push({ operation: "openGateway", token, aborted: signal.aborted });
      return { ready: true, session: { id: "discord-gateway-1" } };
    },
    async closeGateway({ session, signal }) {
      events.push({ operation: "closeGateway", sessionId: session.id, aborted: signal.aborted });
      return { closed: true };
    },
  };
}
