import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: path.resolve("src/client"),
  publicDir: path.resolve("src/client/public"),
  envDir: path.resolve("."),
  resolve: {
    alias: {
      "@contracts": path.resolve("src/contracts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve("dist/client"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
