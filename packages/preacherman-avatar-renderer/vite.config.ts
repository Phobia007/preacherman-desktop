import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
      cssFileName: "avatar-renderer",
    },
    rollupOptions: {
      external: [
        "@react-three/drei",
        "@react-three/fiber",
        "react",
        "react-dom",
        "react/jsx-runtime",
        "three",
      ],
    },
    sourcemap: true,
  },
});
