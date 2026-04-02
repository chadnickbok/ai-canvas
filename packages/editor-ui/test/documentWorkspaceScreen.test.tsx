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

function createDomRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

function assignBoundingRect(element: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => createDomRect(left, top, width, height)
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

  descriptor?.set?.call(input, value);
}

function parseTransform(transform: string): { panX: number; panY: number; zoom: number } {
  const match = transform.match(
    /^translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)$/
  );

  if (!match) {
    throw new Error(`Unexpected transform: ${transform}`);
  }

  return {
    panX: Number.parseFloat(match[1]),
    panY: Number.parseFloat(match[2]),
    zoom: Number.parseFloat(match[3])
  };
}

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

function createDocumentWithScene(
  options: {
    documentId?: string;
    name?: string;
  } = {}
): RendererDocument {
  const document = createEmptyDocument({
    documentId: options.documentId ?? "doc_workspace_scene",
    name: options.name ?? "Workspace Fixture"
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
      const backdrop = harness.container.querySelector(
        '[data-workspace-backdrop="true"]'
      ) as SVGSVGElement;
      const background = harness.container.querySelector(
        '[data-grid-background="true"]'
      ) as SVGRectElement;
      const viewportHint = harness.container.querySelector('[data-viewport-hint="true"]') as HTMLElement;

      expect(harness.container.textContent).toContain("Blank Workspace");
      expect(harness.container.textContent).toContain("No scene yet.");
      expect(harness.container.textContent).toContain("Use MCP to add a scene");
      expect(backdrop).not.toBeNull();
      expect(backdrop.tagName.toLowerCase()).toBe("svg");
      expect(background.getAttribute("fill")).toBe("#ffffff");
      expect(viewportHint.getAttribute("data-viewport-hint-visible")).toBe("true");
      expect(harness.container.querySelector('[data-viewport-frame="true"]')).not.toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it("renders committed scene content through the shared workspace surface", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;
      const workspaceSurface = harness.container.querySelector(
        '[data-editor-workspace-surface="true"]'
      ) as HTMLElement;
      const sceneFrame = harness.container.querySelector('[data-node-id="scene_home"]') as HTMLElement;
      const rectangle = harness.container.querySelector('[data-node-id="rect_hero"]') as HTMLElement;

      expect(harness.container.textContent).toContain("Hello from MCP");
      expect(harness.container.textContent).toContain("1 scene");
      expect(workspaceSurface).not.toBeNull();
      expect(viewportFrame).not.toBeNull();
      expect(sceneFrame.style.left).toBe("80px");
      expect(sceneFrame.style.top).toBe("80px");
      expect(rectangle.style.backgroundColor).toBe("rgb(245, 192, 74)");
    } finally {
      harness.cleanup();
    }
  });

  it("fits initial content into the viewport and lets the user pan, zoom, and refit", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;
      const rendererTransform = harness.container.querySelector(
        '[data-viewport-transform="renderer"]'
      ) as HTMLElement;
      const fitButton = [...harness.container.querySelectorAll("button")].find(
        (button) => button.textContent === "Fit"
      ) as HTMLButtonElement;
      const zoomInput = harness.container.querySelector(
        'input[aria-label="Zoom percentage"]'
      ) as HTMLInputElement;

      assignBoundingRect(viewportFrame, 0, 0, 1024, 1024);

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(rendererTransform.style.transform).toBe("translate(237px, 10px) scale(1)");

      act(() => {
        viewportFrame.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: 120
          })
        );
      });

      expect(rendererTransform.style.transform).toBe("translate(237px, -110px) scale(1)");

      act(() => {
        setInputValue(zoomInput, "50%");
        zoomInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

      act(() => {
        zoomInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Enter"
          })
        );
      });

      expect(rendererTransform.style.transform).toBe("translate(374.5px, 201px) scale(0.5)");

      act(() => {
        fitButton.click();
      });

      expect(rendererTransform.style.transform).toBe("translate(237px, 10px) scale(1)");
    } finally {
      harness.cleanup();
    }
  });

  it("keeps major grid lines visible below 25% zoom while hiding minor lines", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;
      const zoomInput = harness.container.querySelector(
        'input[aria-label="Zoom percentage"]'
      ) as HTMLInputElement;

      assignBoundingRect(viewportFrame, 0, 0, 1024, 1024);

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      act(() => {
        setInputValue(zoomInput, "24%");
        zoomInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

      act(() => {
        zoomInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            key: "Enter"
          })
        );
      });

      const majorLines = harness.container.querySelectorAll('[data-grid-line-kind="major"]');
      const minorLines = harness.container.querySelectorAll('[data-grid-line-kind="minor"]');

      expect(majorLines.length).toBeGreaterThan(0);
      expect(minorLines.length).toBe(0);
    } finally {
      harness.cleanup();
    }
  });

  it("zooms faster around the pointer when a modified wheel gesture is used", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;
      const rendererTransform = harness.container.querySelector(
        '[data-viewport-transform="renderer"]'
      ) as HTMLElement;

      assignBoundingRect(viewportFrame, 0, 0, 1024, 1024);

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      act(() => {
        viewportFrame.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: 512,
            clientY: 512,
            ctrlKey: true,
            deltaY: 120
          })
        );
      });

      const transform = parseTransform(rendererTransform.style.transform);

      expect(transform.zoom).toBeCloseTo(0.6376281516217733, 6);
      expect(transform.panX).toBeCloseTo(336.65225830401233, 2);
      expect(transform.panY).toBeCloseTo(191.9106678858698, 2);
    } finally {
      harness.cleanup();
    }
  });

  it("fades the viewport hint after the first canvas interaction and restores it for a new document", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;

      assignBoundingRect(viewportFrame, 0, 0, 1024, 1024);

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      const viewportHintBefore = harness.container.querySelector(
        '[data-viewport-hint="true"]'
      ) as HTMLElement;

      expect(viewportHintBefore.getAttribute("data-viewport-hint-visible")).toBe("true");
      expect(viewportHintBefore.getAttribute("aria-hidden")).toBe("false");

      act(() => {
        viewportFrame.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: 80
          })
        );
      });

      const viewportHintAfter = harness.container.querySelector(
        '[data-viewport-hint="true"]'
      ) as HTMLElement;

      expect(viewportHintAfter.getAttribute("data-viewport-hint-visible")).toBe("false");
      expect(viewportHintAfter.getAttribute("aria-hidden")).toBe("true");

      act(() => {
        harness.root.render(
          <DocumentWorkspaceScreen
            activeProject={createActiveProject(
              createDocumentWithScene({
                documentId: "doc_workspace_scene_reopened",
                name: "Workspace Fixture Reopened"
              })
            )}
            mcpStatus={mcpStatus}
            onBackToLibrary={() => {}}
            runtimeCapabilities={runtimeCapabilities}
          />
        );
      });

      const viewportHintReopened = harness.container.querySelector(
        '[data-viewport-hint="true"]'
      ) as HTMLElement;

      expect(harness.container.textContent).toContain("Workspace Fixture Reopened");
      expect(viewportHintReopened.getAttribute("data-viewport-hint-visible")).toBe("true");
      expect(viewportHintReopened.getAttribute("aria-hidden")).toBe("false");
    } finally {
      harness.cleanup();
    }
  });
});
