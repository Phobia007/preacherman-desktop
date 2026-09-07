import { defineConfig } from "vite";
const rendererSource = (file: string) => decodeURIComponent(new URL(`../../packages/preacherman-avatar-renderer/src/${file}`, import.meta.url).pathname).replace(/^\/(?=[A-Za-z]:\/)/, "");

export default defineConfig({
  resolve: {
    // Saved integration workspaces can share node_modules with the D: checkout.
    // Always compile this workspace's renderer, not the junction's stale package.
    alias: [
      { find: /^@preacherman\/avatar-renderer$/, replacement: rendererSource("index.ts") },
      { find: "@preacherman/avatar-renderer/styles.css", replacement: rendererSource("avatar-renderer.css") },
    ],
    dedupe: ["react", "react-dom", "three", "@react-three/fiber"],
  },
  build: {
    chunkSizeWarningLimit: 600,
    target: "es2022",
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});
