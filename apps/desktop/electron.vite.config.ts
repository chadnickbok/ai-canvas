import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";
import type { PluginOption } from "vite";

// electron-vite and @tailwindcss/vite currently surface distinct Vite plugin types.
const tailwindPlugin = tailwindcss() as unknown as PluginOption;

export default defineConfig({
  main: {},
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
    plugins: [react(), tailwindPlugin]
  }
});
