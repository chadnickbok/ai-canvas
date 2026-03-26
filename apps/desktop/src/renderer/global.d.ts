import type { DesktopApi } from "@ai-canvas/ipc-contract";

declare global {
  interface Window {
    aiCanvasApi: DesktopApi;
  }
}

export {};
