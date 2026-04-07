// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument, type RendererDocument } from "@ai-canvas/document-core";
import { ok, type ActiveProject, type DesktopApi, type RuntimeEvent } from "@ai-canvas/ipc-contract";

import { App } from "./App.js";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

type RenderHarness = {
  cleanup: () => void;
  container: HTMLDivElement;
  root: Root;
};

const runtimeCapabilities = {
  measurementSurfaceAvailable: true,
  mode: "read_write" as const,
  runtimeState: "editor_open_clean"
};

const historyState = {
  canRedo: false,
  canUndo: false,
  redoDepth: 0,
  undoDepth: 0
};

const mcpStatus = {
  connectedSessions: 0,
  enabled: true,
  endpoint: "http://127.0.0.1:9311/mcp",
  errorCode: null,
  errorMessage: null,
  host: "127.0.0.1",
  port: 9311,
  state: "running" as const
};

function createActiveProject(options: {
  document?: RendererDocument;
  name: string;
  projectId: string;
  revision?: number;
}): ActiveProject {
  const document =
    options.document ??
    createEmptyDocument({
      documentId: `${options.projectId}_document`,
      name: options.name
    });

  return {
    document,
    project: {
      createdAt: "2026-03-31T00:00:00.000Z",
      documentId: document.document_id,
      id: options.projectId,
      lastOpenedAt: "2026-03-31T00:00:00.000Z",
      name: options.name,
      updatedAt: "2026-03-31T00:00:00.000Z"
    },
    resolved_assets: {},
    revision: options.revision ?? 1
  };
}

function createDocumentWithScene(documentId: string, name: string): RendererDocument {
  const document = createEmptyDocument({
    documentId,
    name
  });

  document.root.child_ids = ["scene_home"];
  document.scenes.scene_home = {
    child_count: 2,
    frame_node_id: "scene_home",
    id: "scene_home",
    name: "Home",
    scene_metadata: {
      tags: []
    }
  };
  document.nodes.scene_home = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: ["rect_hero", "text_title"],
    id: "scene_home",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Home",
    parent_id: null,
    render_style: {
      backgroundColor: "#ffffff",
      height: 844,
      left: 80,
      top: 80,
      width: 390
    },
    scene_id: "scene_home"
  };
  document.nodes.rect_hero = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: [],
    id: "rect_hero",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Hero",
    parent_id: "scene_home",
    render_style: {
      backgroundColor: "#d4d4d4",
      borderRadius: 24,
      height: 180,
      width: 320
    },
    scene_id: "scene_home"
  };
  document.nodes.text_title = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: [],
    id: "text_title",
    is_locked: false,
    is_visible: true,
    kind: "text",
    name: "Title",
    parent_id: "scene_home",
    render_style: {
      color: "#111111",
      fontFamily: "IBM Plex Sans",
      fontSize: 32,
      fontWeight: 600
    },
    scene_id: "scene_home",
    text: {
      content: "Hello from MCP"
    }
  };

  return document;
}

function createDesktopApiMock(overrides: Partial<DesktopApi> = {}) {
  let runtimeListener: ((event: RuntimeEvent) => void) | null = null;

  const api: DesktopApi = {
    applyCommands: overrides.applyCommands ?? vi.fn(async () => ok({} as never)),
    createProject:
      overrides.createProject ??
      vi.fn(async (input) =>
        ok({
          createdAt: "2026-03-31T00:00:00.000Z",
          documentId: `${input.name}_document`,
          id: "project_created",
          lastOpenedAt: "2026-03-31T00:00:00.000Z",
          name: input.name,
          updatedAt: "2026-03-31T00:00:00.000Z"
        })
      ),
    getActiveProject:
      overrides.getActiveProject ?? vi.fn(async () => ok<ActiveProject | null>(null)),
    getHistoryState: overrides.getHistoryState ?? vi.fn(async () => ok(historyState)),
    getMcpStatus: overrides.getMcpStatus ?? vi.fn(async () => ok(mcpStatus)),
    getRuntimeCapabilities:
      overrides.getRuntimeCapabilities ?? vi.fn(async () => ok(runtimeCapabilities)),
    listProjects: overrides.listProjects ?? vi.fn(async () => ok([])),
    openExternalUrl: overrides.openExternalUrl ?? vi.fn(async () => ok({})),
    openProject:
      overrides.openProject ??
      vi.fn(async () =>
        ok(
          createActiveProject({
            name: "Opened Project",
            projectId: "project_opened"
          })
        )
      ),
    redo: overrides.redo ?? vi.fn(async () => ok({} as never)),
    submitLayoutMeasurementResult:
      overrides.submitLayoutMeasurementResult ?? vi.fn(async () => ok({})),
    subscribeToLayoutMeasurementRequests:
      overrides.subscribeToLayoutMeasurementRequests ??
      vi.fn(() => {
        return () => undefined;
      }),
    subscribeToRuntimeEvents:
      overrides.subscribeToRuntimeEvents ??
      vi.fn((listener) => {
        runtimeListener = listener;
        return () => {
          if (runtimeListener === listener) {
            runtimeListener = null;
          }
        };
      }),
    undo: overrides.undo ?? vi.fn(async () => ok({} as never))
  };

  return {
    api,
    emitRuntimeEvent: (event: RuntimeEvent) => {
      runtimeListener?.(event);
    }
  };
}

function renderApp(api: DesktopApi): RenderHarness {
  const container = document.createElement("div");
  document.body.append(container);

  const root = createRoot(container);

  act(() => {
    window.aiCanvasApi = api;
    root.render(<App />);
  });

  return {
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
    container,
    root
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
  });
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.includes(text)
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button "${text}" was not found`);
  }

  return button;
}

beforeEach(() => {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0)
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => window.clearTimeout(id)
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  Reflect.deleteProperty(window as Window & { aiCanvasApi?: DesktopApi }, "aiCanvasApi");
});

describe("App", () => {
  it("boots into the project library when no active project session exists", async () => {
    const desktopApi = createDesktopApiMock();
    const harness = renderApp(desktopApi.api);

    try {
      await flushAsyncWork();

      expect(harness.container.textContent).toContain("AI Canvas Desktop");
      expect(harness.container.textContent).toContain("strapping.ai");
      expect(harness.container.textContent).toContain("My Projects");
      expect(harness.container.textContent).not.toContain("No scene yet.");
    } finally {
      harness.cleanup();
    }
  });

  it("boots into the workspace when an active project session exists", async () => {
    const activeProject = createActiveProject({
      name: "Workspace Project",
      projectId: "project_workspace"
    });
    const desktopApi = createDesktopApiMock({
      getActiveProject: vi.fn(async () => ok(activeProject))
    });
    const harness = renderApp(desktopApi.api);

    try {
      await flushAsyncWork();

      expect(harness.container.textContent).toContain("Workspace Project");
      expect(harness.container.textContent).toContain("No scene yet.");
      expect(harness.container.textContent).not.toContain("AI Canvas Desktop");
      expect(harness.container.textContent).not.toContain("strapping.ai");
    } finally {
      harness.cleanup();
    }
  });

  it("creates a project, loads the active session, and navigates into the workspace", async () => {
    const activeProject = createActiveProject({
      name: "Project 1",
      projectId: "project_slice"
    });
    const getActiveProject = vi
      .fn<DesktopApi["getActiveProject"]>()
      .mockResolvedValueOnce(ok<ActiveProject | null>(null))
      .mockResolvedValueOnce(ok(activeProject));
    const createProject = vi
      .fn<DesktopApi["createProject"]>()
      .mockResolvedValue(
        ok({
          createdAt: "2026-03-31T00:00:00.000Z",
          documentId: activeProject.document.document_id,
          id: activeProject.project.id,
          lastOpenedAt: "2026-03-31T00:00:00.000Z",
          name: activeProject.project.name,
          updatedAt: "2026-03-31T00:00:00.000Z"
        })
      );
    const desktopApi = createDesktopApiMock({
      createProject,
      getActiveProject
    });
    const harness = renderApp(desktopApi.api);

    try {
      await flushAsyncWork();

      act(() => {
        getButtonByText(harness.container, "New Project").click();
      });
      await flushAsyncWork();

      const input = harness.container.querySelector("#create-project-name") as HTMLInputElement;

      act(() => {
        getButtonByText(harness.container, "Create Project").click();
      });
      await flushAsyncWork();
      await flushAsyncWork();

      expect(input.value).toBe("Project 1");
      expect(createProject).toHaveBeenCalledWith({ name: "Project 1" });
      expect(getActiveProject).toHaveBeenCalledTimes(2);
      expect(harness.container.textContent).toContain("Project 1");
      expect(harness.container.textContent).toContain("No scene yet.");
    } finally {
      harness.cleanup();
    }
  });

  it("opens a project from the library and navigates into the workspace", async () => {
    const activeProject = createActiveProject({
      name: "Opened Project",
      projectId: "project_opened"
    });
    const openProject = vi.fn<DesktopApi["openProject"]>().mockResolvedValue(ok(activeProject));
    const desktopApi = createDesktopApiMock({
      listProjects: vi.fn(async () => ok([activeProject.project])),
      openProject
    });
    const harness = renderApp(desktopApi.api);

    try {
      await flushAsyncWork();

      act(() => {
        getButtonByText(harness.container, "Opened Project").click();
      });
      await flushAsyncWork();

      expect(openProject).toHaveBeenCalledWith({ projectId: activeProject.project.id });
      expect(harness.container.textContent).toContain("Opened Project");
      expect(harness.container.textContent).toContain("No scene yet.");
    } finally {
      harness.cleanup();
    }
  });

  it("applies document_changed events to the visible workspace without a reload", async () => {
    const activeProject = createActiveProject({
      name: "Live Workspace",
      projectId: "project_live"
    });
    const updatedDocument = createDocumentWithScene(activeProject.document.document_id, activeProject.project.name);
    const desktopApi = createDesktopApiMock({
      getActiveProject: vi.fn(async () => ok(activeProject))
    });
    const harness = renderApp(desktopApi.api);

    try {
      await flushAsyncWork();

      act(() => {
        desktopApi.emitRuntimeEvent({
          document: updatedDocument,
          project: activeProject.project,
          resolved_assets: {},
          revision: 2,
          runtimeCapabilities,
          type: "document_changed"
        });
      });
      await flushAsyncWork();

      expect(harness.container.textContent).toContain("Hello from MCP");
      expect(harness.container.textContent).toContain("Revision 2");
      expect(harness.container.querySelector('[data-node-id="scene_home"]')).not.toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it("applies history_state_changed events to the visible workspace controls", async () => {
    const activeProject = createActiveProject({
      name: "History Workspace",
      projectId: "project_history"
    });
    const desktopApi = createDesktopApiMock({
      getActiveProject: vi.fn(async () => ok(activeProject))
    });
    const harness = renderApp(desktopApi.api);

    try {
      await flushAsyncWork();

      const undoButtonBefore = harness.container.querySelector(
        '[data-history-action="undo"]'
      ) as HTMLButtonElement;

      expect(undoButtonBefore.disabled).toBe(true);

      act(() => {
        desktopApi.emitRuntimeEvent({
          historyState: {
            canRedo: false,
            canUndo: true,
            redoDepth: 0,
            undoDepth: 1
          },
          type: "history_state_changed"
        });
      });
      await flushAsyncWork();

      const undoButtonAfter = harness.container.querySelector(
        '[data-history-action="undo"]'
      ) as HTMLButtonElement;

      expect(undoButtonAfter.disabled).toBe(false);
    } finally {
      harness.cleanup();
    }
  });
});
