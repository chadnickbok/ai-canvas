import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { createEmptyDocument, type RendererDocument } from "@ai-canvas/document-core";
import type { ActiveProject, McpStatus, RuntimeCapabilities } from "@ai-canvas/ipc-contract";

import { DocumentWorkspaceScreen } from "../src/index.js";

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

const runtimeCapabilities: RuntimeCapabilities = {
  measurementSurfaceAvailable: true,
  mode: "read_write",
  runtimeState: "editor_open_clean"
};

const mcpStatus: McpStatus = {
  connectedSessions: 0,
  enabled: true,
  endpoint: "http://127.0.0.1:9311/mcp",
  errorCode: null,
  errorMessage: null,
  host: "127.0.0.1",
  port: 9311,
  state: "running"
};

function createActiveProject(document: RendererDocument): ActiveProject {
  return {
    document,
    project: {
      createdAt: "2026-03-31T00:00:00.000Z",
      documentId: document.document_id,
      id: "project_workspace",
      lastOpenedAt: "2026-03-31T00:00:00.000Z",
      name: document.name,
      updatedAt: "2026-03-31T00:00:00.000Z"
    },
    revision: 1
  };
}

function createDocumentWithScene(): RendererDocument {
  const document = createEmptyDocument({
    documentId: "doc_workspace_scene",
    name: "Workspace Fixture"
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
      backgroundColor: "#f5c04a",
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

function renderIntoDom(activeProject: ActiveProject): RenderHarness {
  const container = document.createElement("div");
  container.style.height = "1200px";
  container.style.width = "1600px";
  document.body.append(container);

  const root = createRoot(container);

  act(() => {
    root.render(
      <DocumentWorkspaceScreen
        activeProject={activeProject}
        mcpStatus={mcpStatus}
        onBackToLibrary={() => {}}
        runtimeCapabilities={runtimeCapabilities}
      />
    );
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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DocumentWorkspaceScreen", () => {
  it("shows the empty-state callout for a blank document", () => {
    const harness = renderIntoDom(
      createActiveProject(
        createEmptyDocument({
          documentId: "doc_workspace_empty",
          name: "Blank Workspace"
        })
      )
    );

    try {
      expect(harness.container.textContent).toContain("Blank Workspace");
      expect(harness.container.textContent).toContain("No scene yet.");
      expect(harness.container.textContent).toContain("Use MCP to add a scene");
    } finally {
      harness.cleanup();
    }
  });

  it("renders committed scene content through the shared workspace surface", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const workspaceSurface = harness.container.querySelector(
        '[data-editor-workspace-surface="true"]'
      ) as HTMLElement;
      const sceneFrame = harness.container.querySelector('[data-node-id="scene_home"]') as HTMLElement;
      const rectangle = harness.container.querySelector('[data-node-id="rect_hero"]') as HTMLElement;

      expect(harness.container.textContent).toContain("Hello from MCP");
      expect(harness.container.textContent).toContain("1 scene");
      expect(workspaceSurface.parentElement?.className).toContain("absolute");
      expect(workspaceSurface.parentElement?.className).toContain("inset-0");
      expect(sceneFrame.style.left).toBe("80px");
      expect(sceneFrame.style.top).toBe("80px");
      expect(rectangle.style.backgroundColor).toBe("rgb(245, 192, 74)");
    } finally {
      harness.cleanup();
    }
  });
});
