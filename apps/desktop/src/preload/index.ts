import { contextBridge, ipcRenderer } from "electron";

import type { DesktopApi, RuntimeEvent } from "@ai-canvas/ipc-contract";

const appChannelNames = {
  applyCommands: "app:applyCommands",
  createProject: "app:createProject",
  getActiveProject: "app:getActiveProject",
  getMcpStatus: "app:getMcpStatus",
  getRuntimeCapabilities: "app:getRuntimeCapabilities",
  listProjects: "app:listProjects",
  openExternalUrl: "app:openExternalUrl",
  openProject: "app:openProject",
  runtimeEvent: "app:runtimeEvent"
} as const;

const api: DesktopApi = {
  async applyCommands(input) {
    return ipcRenderer.invoke(appChannelNames.applyCommands, input);
  },
  async createProject(input) {
    return ipcRenderer.invoke(appChannelNames.createProject, input);
  },
  async getActiveProject() {
    return ipcRenderer.invoke(appChannelNames.getActiveProject);
  },
  async getMcpStatus() {
    return ipcRenderer.invoke(appChannelNames.getMcpStatus);
  },
  async getRuntimeCapabilities() {
    return ipcRenderer.invoke(appChannelNames.getRuntimeCapabilities, {});
  },
  async listProjects() {
    return ipcRenderer.invoke(appChannelNames.listProjects);
  },
  async openExternalUrl(input) {
    return ipcRenderer.invoke(appChannelNames.openExternalUrl, input);
  },
  async openProject(input) {
    return ipcRenderer.invoke(appChannelNames.openProject, input);
  },
  subscribeToRuntimeEvents(listener) {
    const wrappedListener = (_event: Electron.IpcRendererEvent, runtimeEvent: RuntimeEvent) => {
      listener(runtimeEvent);
    };

    ipcRenderer.on(appChannelNames.runtimeEvent, wrappedListener);

    return () => {
      ipcRenderer.off(appChannelNames.runtimeEvent, wrappedListener);
    };
  }
};

contextBridge.exposeInMainWorld("aiCanvasApi", api);
