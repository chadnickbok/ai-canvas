import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { defineConfig } from "electron-vite";
import type { RendererViteConfig } from "electron-vite";

const require = createRequire(import.meta.url);

const rendererPlugins: unknown[] = [react()];

try {
  const tailwindcss = require("@tailwindcss/vite").default as () => unknown;
  // electron-vite and @tailwindcss/vite currently surface distinct Vite plugin types.
  rendererPlugins.push(tailwindcss());
} catch {
  // Keep Tailwind plugin optional during environments where deps are not installed yet.
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
    plugins: rendererPlugins as NonNullable<RendererViteConfig["plugins"]>
  }
});
