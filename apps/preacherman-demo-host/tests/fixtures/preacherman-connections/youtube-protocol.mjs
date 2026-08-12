export function createYouTubeProtocolFixture(events = []) {
  return {
    async resolveLiveChat({ videoId, accessToken, signal }) {
      events.push({ operation: "resolveLiveChat", videoId, accessToken, aborted: signal.aborted });
      return { liveChatId: "youtube-live-chat-1" };
    },
    async startPolling({ liveChatId, accessToken, signal }) {
      events.push({ operation: "startPolling", liveChatId, accessToken, aborted: signal.aborted });
      return { running: true, session: { id: "youtube-poll-1" } };
    },
    async stopPolling({ session, signal }) {
      events.push({ operation: "stopPolling", sessionId: session.id, aborted: signal.aborted });
      return { stopped: true };
    },
  };
}
