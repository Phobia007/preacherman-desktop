import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const galleryDirectory = fileURLToPath(new URL("./", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const appRoot = fileURLToPath(new URL("../../../", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./preview/", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../../public/", import.meta.url)),
  resolve: {
    alias: {
      "@preacherman/avatar-renderer": `${repositoryRoot}packages/preacherman-avatar-renderer/src/index.ts`,
      "@preacherman/presentation-runtime": `${repositoryRoot}packages/preacherman-presentation-runtime/src/index.ts`,
      "@preacherman/surface-skin": `${repositoryRoot}packages/preacherman-surface-skin/src/index.ts`,
    },
    dedupe: [
      "react",
      "react-dom",
      "three",
      "@react-three/drei",
      "@react-three/fiber",
    ],
  },
  server: {
    fs: {
      allow: [appRoot, galleryDirectory, repositoryRoot],
    },
    host: "127.0.0.1",
    port: 1424,
    strictPort: true,
  },
});

