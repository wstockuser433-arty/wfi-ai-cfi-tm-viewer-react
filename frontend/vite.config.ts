import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Required for our Web Worker (packetParser.worker.ts) — uses ESM workers
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
    host: true,          // expose on LAN for testing from other machines
    strictPort: true,
    // Optional: proxy API + WS so you don't need CORS in dev
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  esbuild: {
    // So we can log clean errors without stripping names in dev
    keepNames: true,
  },
});