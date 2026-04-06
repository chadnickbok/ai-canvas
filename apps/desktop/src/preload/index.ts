import { contextBridge, ipcRenderer } from "electron";

import type {
  DesktopApi,
  LayoutMeasurementRequest,
  RuntimeEvent
} from "@ai-canvas/ipc-contract";

const appChannelNames = {
  applyCommands: "app:applyCommands",
  createProject: "app:createProject",
  getActiveProject: "app:getActiveProject",
  getAppMetadata: "app:getAppMetadata",
  getHistoryState: "app:getHistoryState",
  getMcpStatus: "app:getMcpStatus",
  getRuntimeCapabilities: "app:getRuntimeCapabilities",
  layoutMeasurementRequest: "app:layoutMeasurementRequest",
  listProjects: "app:listProjects",
  openExternalUrl: "app:openExternalUrl",
  openProject: "app:openProject",
  redo: "app:redo",
  submitLayoutMeasurementResult: "app:submitLayoutMeasurementResult",
  undo: "app:undo",
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
  async getAppMetadata() {
    return ipcRenderer.invoke(appChannelNames.getAppMetadata);
  },
  async getHistoryState() {
    return ipcRenderer.invoke(appChannelNames.getHistoryState, {});
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
  async redo() {
    return ipcRenderer.invoke(appChannelNames.redo, {});
  },
  async submitLayoutMeasurementResult(input) {
    return ipcRenderer.invoke(appChannelNames.submitLayoutMeasurementResult, input);
  },
  subscribeToLayoutMeasurementRequests(listener) {
    const wrappedListener = (
      _event: Electron.IpcRendererEvent,
      request: LayoutMeasurementRequest
    ) => {
      listener(request);
    };

    ipcRenderer.on(appChannelNames.layoutMeasurementRequest, wrappedListener);

    return () => {
      ipcRenderer.off(appChannelNames.layoutMeasurementRequest, wrappedListener);
    };
  },
  subscribeToRuntimeEvents(listener) {
    const wrappedListener = (_event: Electron.IpcRendererEvent, runtimeEvent: RuntimeEvent) => {
      listener(runtimeEvent);
    };

    ipcRenderer.on(appChannelNames.runtimeEvent, wrappedListener);

    return () => {
      ipcRenderer.off(appChannelNames.runtimeEvent, wrappedListener);
    };
  },
  async undo() {
    return ipcRenderer.invoke(appChannelNames.undo, {});
  }
};

contextBridge.exposeInMainWorld("aiCanvasApi", api);
