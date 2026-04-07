import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, nativeImage, protocol } from "electron";

import {
  collectSubtreeIds,
  resolveComputedLayoutRootIds,
  type RendererDocument
} from "@ai-canvas/document-core";
import { appChannelNames } from "@ai-canvas/ipc-contract";
import { LocalMcpBridge } from "@ai-canvas/mcp-bridge";

import appIconIcoPath from "../../build/icons/strapping-app-icon.ico?asset";
import appIconPngPath from "../../build/icons/strapping-app-icon.png?asset";
import { desktopBranding } from "../branding.js";
import { createProjectService } from "./createProjectService.js";
import { registerAssetProtocol } from "./registerAssetProtocol.js";
import {
  LayoutMeasurementBridgeError,
  RendererLayoutMeasurementBridge
} from "./rendererLayoutMeasurementBridge.js";
import { resolveRendererLoadTarget } from "./resolveRendererLoadTarget.js";
import { registerIpc } from "./registerIpc.js";
import { DESKTOP_ASSET_PROTOCOL } from "./runtime/assetStorage.js";
import { createProjectRuntime, ProjectStore } from "./runtime/index.js";

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true
    },
    scheme: DESKTOP_ASSET_PROTOCOL
  }
]);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rendererDist = path.join(moduleDir, "../renderer");
const rendererIndexPath = path.join(rendererDist, "index.html");
const preloadPath = path.join(moduleDir, "../preload/index.cjs");
const mcpHost = "127.0.0.1";
const mcpPort = 9311;

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

async function createMainWindow(
  runtime: ReturnType<typeof createProjectRuntime>,
  layoutMeasurementBridge: RendererLayoutMeasurementBridge
) {
  if (mainWindow) {
    mainWindow.focus();
    return mainWindow;
  }

  const browserWindow = new BrowserWindow({
    backgroundColor: "#0c0f11",
    height: 920,
    icon: process.platform === "win32" ? appIconIcoPath : appIconPngPath,
    minHeight: 700,
    minWidth: 1080,
    show: false,
    title: desktopBranding.shellTitle,
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
    layoutMeasurementBridge.rejectAll("The renderer measurement surface is not available.");
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
  app.setName(desktopBranding.appName);
  await app.whenReady();

  if (process.platform === "darwin") {
    const dockIcon = nativeImage.createFromPath(appIconPngPath);

    if (app.dock && !dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  const store = new ProjectStore(path.join(app.getPath("userData"), "app.db"));
  registerAssetProtocol(store);
  const runtime = createProjectRuntime(store);
  const layoutMeasurementBridge = new RendererLayoutMeasurementBridge();
  const mcpBridge = new LocalMcpBridge({
    host: mcpHost,
    port: mcpPort,
    projectService: createProjectService(runtime)
  });

  runtime.setComputedLayoutRefresher(async (input) => {
    const browserWindow = mainWindow;

    if (!browserWindow || browserWindow.isDestroyed()) {
      throw new LayoutMeasurementBridgeError(
        "measurement_surface_unavailable",
        "The renderer measurement surface is not available."
      );
    }

    const rootIds = resolveComputedLayoutRootIds(input.document, input.changed_node_ids);

    if (rootIds.length === 0) {
      return {
        document: input.document,
        layoutRefresh: {
          status: "not_required" as const
        }
      };
    }

    const measuredLayouts = await layoutMeasurementBridge.measureDocumentLayout(browserWindow, {
      document: input.document,
      rootIds
    });
    const refreshedDocument = structuredClone(input.document);
    const measuredNodeCount = applyMeasuredLayoutsToDocument(
      refreshedDocument,
      input.document,
      rootIds,
      measuredLayouts
    );

    return {
      document: refreshedDocument,
      layoutRefresh: {
        measured_node_count: measuredNodeCount,
        measured_root_ids: rootIds,
        status: "refreshed" as const
      }
    };
  });

  runtime.attachMcpStatusProvider(mcpBridge);
  const unsubscribeFromRuntimeEvents = registerIpc(runtime, {
    submitLayoutMeasurementResult: (result) =>
      layoutMeasurementBridge.submitLayoutMeasurementResult(result),
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

  await createMainWindow(runtime, layoutMeasurementBridge);

  if (mcpStartError) {
    dialog.showErrorBox(
      "MCP bridge unavailable",
      mcpBridge.getStatus().errorMessage ?? formatMcpStartError(mcpStartError)
    );
  }

  app.on("activate", async () => {
    await createMainWindow(runtime, layoutMeasurementBridge);
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
    return `The local MCP bridge requires ${mcpHost}:${mcpPort}, but that port is already in use. Close the conflicting process and relaunch ${desktopBranding.appName}.`;
  }

  return error instanceof Error ? error.message : "The local MCP bridge failed to start.";
}

function isPortInUseError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

function applyMeasuredLayoutsToDocument(
  targetDocument: RendererDocument,
  sourceDocument: RendererDocument,
  rootIds: string[],
  measuredLayouts: Record<string, { height: number; width: number; x: number; y: number }>
): number {
  let measuredNodeCount = 0;

  for (const rootId of rootIds) {
    for (const nodeId of collectSubtreeIds(sourceDocument, rootId)) {
      const targetNode = targetDocument.nodes[nodeId];

      if (!targetNode) {
        continue;
      }

      const measuredLayout = measuredLayouts[nodeId];

      if (!measuredLayout) {
        delete targetNode.computed_layout;
        continue;
      }

      targetNode.computed_layout = measuredLayout;
      measuredNodeCount += 1;
    }
  }

  return measuredNodeCount;
}

void bootstrap();
