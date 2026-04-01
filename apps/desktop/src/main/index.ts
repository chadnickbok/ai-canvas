import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog } from "electron";

import { appChannelNames } from "@ai-canvas/ipc-contract";
import { LocalMcpBridge } from "@ai-canvas/mcp-bridge";

import { resolveRendererLoadTarget } from "./resolveRendererLoadTarget.js";
import { registerIpc } from "./registerIpc.js";
import { createProjectRuntime, ProjectStore } from "./runtime/index.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rendererDist = path.join(moduleDir, "../renderer");
const rendererIndexPath = path.join(rendererDist, "index.html");
const preloadPath = path.join(moduleDir, "../preload/index.cjs");
const mcpHost = "127.0.0.1";
const mcpPort = 9311;

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

async function createMainWindow(runtime: ReturnType<typeof createProjectRuntime>) {
  if (mainWindow) {
    mainWindow.focus();
    return mainWindow;
  }

  const browserWindow = new BrowserWindow({
    backgroundColor: "#0c0f11",
    height: 920,
    minHeight: 700,
    minWidth: 1080,
    show: false,
    title: "AI Canvas Desktop",
    width: 1440,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true
    }
  });

  browserWindow.once("ready-to-show", () => {
    browserWindow.show();
  });

  browserWindow.webContents.on("did-finish-load", () => {
    runtime.setMeasurementSurfaceAvailable(true);
  });

  browserWindow.on("closed", () => {
    runtime.setMeasurementSurfaceAvailable(false);
    mainWindow = null;
  });

  const rendererLoadTarget = resolveRendererLoadTarget(process.env, rendererIndexPath);

  if (rendererLoadTarget.kind === "url") {
    await browserWindow.loadURL(rendererLoadTarget.value);
  } else {
    await browserWindow.loadFile(rendererLoadTarget.value);
  }

  mainWindow = browserWindow;

  return browserWindow;
}

async function bootstrap() {
  app.setName("AI Canvas Desktop");
  await app.whenReady();

  const store = new ProjectStore(path.join(app.getPath("userData"), "app.db"));
  const runtime = createProjectRuntime(store);
  const mcpBridge = new LocalMcpBridge({
    host: mcpHost,
    port: mcpPort,
    projectService: {
      applyCommands: async (input) =>
        runtime.applyProjectCommands({
          base_revision: input.base_revision,
          commands: input.commands,
          projectId: input.project_id
        }),
      createProject: async (name) => runtime.createProject(name),
      inspectDesignSystem: async (projectId) => runtime.inspectDesignSystem(projectId),
      inspectNode: async (projectId, nodeId) => runtime.inspectNode({ nodeId, projectId }),
      inspectProject: async (projectId) => runtime.inspectProject(projectId),
      inspectScenes: async (projectId) => runtime.inspectScenes(projectId),
      inspectTree: async (input) => runtime.inspectTree(input),
      listProjects: async () => runtime.listProjects(),
      openProject: async (projectId) => {
        const result = runtime.openProject(projectId);

        if (!result.ok) {
          return result;
        }

        return {
          data: {
            project: result.data.project,
            revision: result.data.revision
          },
          ok: true as const
        };
      }
    }
  });

  runtime.attachMcpStatusProvider(mcpBridge);
  const unsubscribeFromRuntimeEvents = registerIpc(runtime, {
    sendRuntimeEvent: (event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(appChannelNames.runtimeEvent, event);
        }
      }
    }
  });
  const unsubscribeFromMcpStatus = mcpBridge.subscribeToStatusChanges((status) => {
    runtime.publishMcpStatus(status);
  });
  let mcpStartError: unknown = null;

  try {
    await mcpBridge.start();
  } catch (error) {
    mcpStartError = error;
  }

  await createMainWindow(runtime);

  if (mcpStartError) {
    dialog.showErrorBox(
      "MCP bridge unavailable",
      mcpBridge.getStatus().errorMessage ?? formatMcpStartError(mcpStartError)
    );
  }

  app.on("activate", async () => {
    await createMainWindow(runtime);
  });

  app.on("before-quit", () => {
    isQuitting = true;
    unsubscribeFromMcpStatus();
    unsubscribeFromRuntimeEvents();
    runtime.close();
    void mcpBridge.stop();
  });

  app.on("window-all-closed", () => {
    if (!isQuitting) {
      return;
    }
  });
}

function formatMcpStartError(error: unknown): string {
  if (isPortInUseError(error)) {
    return `The local MCP bridge requires ${mcpHost}:${mcpPort}, but that port is already in use. Close the conflicting process and relaunch AI Canvas Desktop.`;
  }

  return error instanceof Error ? error.message : "The local MCP bridge failed to start.";
}

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

void bootstrap();
