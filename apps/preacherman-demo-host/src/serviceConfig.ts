const PORT_STORAGE_KEY = "preacherman.service-port";
const DEFAULT_PORT = 8787;

export function readServicePort(): number {
  const parsed = Number(window.localStorage.getItem(PORT_STORAGE_KEY));
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}

export function saveServicePort(port: number): void {
  window.localStorage.setItem(PORT_STORAGE_KEY, String(port));
}

export function localServiceUrl(path: string): string {
  return localServiceUrlForPort(readServicePort(), path);
}

export function localServiceUrlForPort(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

export function localServiceWebSocketUrl(path: string): string {
  return `ws://127.0.0.1:${readServicePort()}${path}`;
}
