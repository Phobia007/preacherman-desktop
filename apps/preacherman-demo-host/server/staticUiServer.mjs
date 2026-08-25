import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { stat } from "node:fs/promises";

const DEFAULT_UI_PORT = 8788;
const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".basis", "application/octet-stream"],
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".ktx2", "image/ktx2"],
  [".mp4", "video/mp4"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function corsOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return "*";
  try {
    const parsed = new URL(origin);
    if (
      ["http:", "https:", "tauri:"].includes(parsed.protocol)
      && ["127.0.0.1", "localhost", "tauri.localhost"].includes(parsed.hostname)
    ) return origin;
  } catch {
    // Invalid origins do not receive access to local UI bytes.
  }
  return "null";
}

function rangeFor(request, size) {
  const value = request.headers.range;
  const match = typeof value === "string" ? /^bytes=(\d*)-(\d*)$/.exec(value) : null;
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) return false;
  return { start, end };
}

export function createStaticUiServer(options = {}) {
  const env = options.env ?? process.env;
  const root = resolve(
    options.root
      ?? env.PREACHERMAN_UI_ROOT
      ?? resolve(dirname(process.execPath), "preacherman-ui"),
  );
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/ui/")) {
      response.writeHead(404).end();
      return;
    }
    const origin = corsOrigin(request);
    if (origin === "null") {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
        "Access-Control-Allow-Origin": origin,
      }).end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname.slice(4)).replace(/^[/\\]+/, "");
    } catch {
      response.writeHead(400).end();
      return;
    }
    let file = resolve(root, pathname || "index.html");
    const relativePath = relative(root, file);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.includes(`..${sep}`)) {
      response.writeHead(404).end();
      return;
    }

    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = resolve(file, "index.html");
        info = await stat(file);
      }
      if (!info.isFile()) throw new Error("Not a file");
      const range = rangeFor(request, info.size);
      if (range === false) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? info.size - 1;
      const headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": extname(file) === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
        "Content-Length": String(Math.max(0, end - start + 1)),
        "Content-Type": MIME_TYPES.get(extname(file).toLowerCase()) ?? "application/octet-stream",
        "Cross-Origin-Resource-Policy": "cross-origin",
        Vary: "Origin",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
      };
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === "HEAD") response.end();
      else createReadStream(file, { start, end }).pipe(response);
    } catch {
      response.writeHead(404, { "Access-Control-Allow-Origin": origin }).end();
    }
  });

  return {
    listen(port = Number(env.PREACHERMAN_UI_PORT) || DEFAULT_UI_PORT) {
      return new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolveListen(server.address());
        });
      });
    },
    close() {
      return new Promise((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
      });
    },
  };
}
