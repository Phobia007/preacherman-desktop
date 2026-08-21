import { WebSocket, WebSocketServer } from "ws";

const DEFAULT_ENDPOINT = "ws://127.0.0.1:18084/api/v3/streaming_speech2motion/ws";

export function createBinaryWebSocketProxy({
  endpoint = DEFAULT_ENDPOINT,
  serviceName = "Motion",
} = {}) {
  const server = new WebSocketServer({ noServer: true });

  server.on("connection", (client) => {
    const upstream = new WebSocket(endpoint, { maxPayload: 64 * 1024 * 1024 });
    const pending = [];

    const closeBoth = (code = 1000, reason = "Motion stream closed.") => {
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason);
      else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    };

    client.on("message", (data, isBinary) => {
      const message = { data: Buffer.from(data), isBinary };
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(message.data, { binary: message.isBinary });
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        pending.push(message);
      }
    });
    client.on("close", () => closeBoth(1000, "Client closed."));
    client.on("error", () => closeBoth(1011, "Client stream failed."));

    upstream.on("open", () => {
      for (const message of pending.splice(0)) {
        upstream.send(message.data, { binary: message.isBinary });
      }
    });
    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
    upstream.on("close", (code, reason) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(code === 1000 ? 1000 : 1011, reason.toString() || "Motion service closed.");
      }
    });
    upstream.on("error", () => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1011, `${serviceName} service is unavailable.`);
      }
    });
  });

  return {
    server,
    handleUpgrade(request, socket, head) {
      server.handleUpgrade(request, socket, head, (client) => {
        server.emit("connection", client, request);
      });
    },
    close() {
      for (const client of server.clients) client.close();
      server.close();
    },
  };
}

export const createSpeechMotionProxy = createBinaryWebSocketProxy;

export async function binaryServiceHealth(
  endpoint = "http://127.0.0.1:18084/health",
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    const body = await response.text();
    const status = body.trim().replace(/^"|"$/g, "");
    return {
      state: response.ok && status === "OK" ? "ready" : "unavailable",
      endpoint,
    };
  } catch {
    return { state: "unavailable", endpoint };
  } finally {
    clearTimeout(timeout);
  }
}

export const speechMotionHealth = binaryServiceHealth;
