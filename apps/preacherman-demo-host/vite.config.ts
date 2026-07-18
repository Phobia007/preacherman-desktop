import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
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
