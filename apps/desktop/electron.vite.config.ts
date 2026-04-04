import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { defineConfig } from "electron-vite";
import type { PluginOption } from "vite";

const require = createRequire(import.meta.url);

let tailwindPlugin: PluginOption | null = null;

try {
  const tailwindcss = require("@tailwindcss/vite").default as () => unknown;
  // electron-vite and @tailwindcss/vite currently surface distinct Vite plugin types.
  tailwindPlugin = tailwindcss() as PluginOption;
} catch {
  // Keep Tailwind plugin optional during environments where deps are not installed yet.
  tailwindPlugin = null;
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: [
          "@ai-canvas/document-core",
          "@ai-canvas/ipc-contract",
          "@ai-canvas/mcp-bridge"
        ]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: "cjs"
        }
      }
    }
  },
  renderer: {
    plugins: [react(), ...(tailwindPlugin ? [tailwindPlugin] : [])]
  }
});
