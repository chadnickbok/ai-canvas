import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument, type RendererDocument } from "@ai-canvas/document-core";
import {
  ok,
  type ActiveProject,
  type ApplyCommandsInput,
  type CommandResult,
  type McpStatus,
  type RuntimeCapabilities
} from "@ai-canvas/ipc-contract";

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

let scrollIntoViewMock: ReturnType<typeof vi.fn>;

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

function dispatchPointerEvent(
  element: Element,
  type: string,
  init: {
    button?: number;
    buttons?: number;
    clientX?: number;
    clientY?: number;
    pointerId?: number;
  } = {}
) {
  element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: init.button ?? 0,
      buttons: init.buttons ?? 1,
      cancelable: true,
      clientX: init.clientX ?? 0,
      clientY: init.clientY ?? 0,
      isPrimary: true,
      pointerId: init.pointerId ?? 1
    })
  );
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

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
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

function createDocumentWithLooseNode(): RendererDocument {
  const document = createDocumentWithScene({
    documentId: "doc_workspace_loose",
    name: "Workspace Loose Fixture"
  });

  document.root.child_ids.push("rect_loose");
  document.nodes.rect_loose = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: [],
    id: "rect_loose",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Loose Card",
    parent_id: null,
    render_style: {
      backgroundColor: "#dbeafe",
      height: 120,
      left: 520,
      top: 160,
      width: 180
    },
    scene_id: null
  };

  return document;
}

function createDocumentWithInspectorFixtures(): RendererDocument {
  const document = createDocumentWithLooseNode();

  document.nodes.scene_home.render_style.backgroundImage = "url(asset://asset_scene)";
  document.nodes.scene_home.render_style.display = "flex";
  document.nodes.scene_home.render_style.flexDirection = "row";
  document.nodes.rect_loose.render_style.backgroundImage = "url(asset://asset_loose)";
  document.assets.asset_scene = {
    id: "asset_scene",
    kind: "image",
    mime_type: "image/png",
    source: {
      data_uri: "data:image/png;base64,AAAA",
      kind: "data_uri"
    }
  };
  document.assets.asset_loose = {
    id: "asset_loose",
    kind: "image",
    mime_type: "image/png",
    source: {
      data_uri: "data:image/png;base64,AAAA",
      kind: "data_uri"
    }
  };

  return document;
}

function createDocumentWithDeepHierarchy(): RendererDocument {
  const document = createDocumentWithScene({
    documentId: "doc_workspace_deep",
    name: "Workspace Deep Fixture"
  });

  document.scenes.scene_home.child_count = 1;
  document.nodes.scene_home.child_ids = ["frame_level_1"];
  document.nodes.scene_home.render_style.display = "flex";
  document.nodes.scene_home.render_style.flexDirection = "column";
  document.nodes.frame_level_1 = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: ["frame_level_2"],
    id: "frame_level_1",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Level 1",
    parent_id: "scene_home",
    render_style: {
      display: "flex",
      flexDirection: "column"
    },
    scene_id: "scene_home"
  };
  document.nodes.frame_level_2 = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: ["frame_level_3"],
    id: "frame_level_2",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Level 2",
    parent_id: "frame_level_1",
    render_style: {
      display: "flex",
      flexDirection: "column"
    },
    scene_id: "scene_home"
  };
  document.nodes.frame_level_3 = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: ["frame_level_4"],
    id: "frame_level_3",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Level 3",
    parent_id: "frame_level_2",
    render_style: {
      display: "flex",
      flexDirection: "column"
    },
    scene_id: "scene_home"
  };
  document.nodes.frame_level_4 = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: ["text_leaf"],
    id: "frame_level_4",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Level 4",
    parent_id: "frame_level_3",
    render_style: {
      display: "flex",
      flexDirection: "column"
    },
    scene_id: "scene_home"
  };
  document.nodes.text_leaf = {
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: [],
    id: "text_leaf",
    is_locked: false,
    is_visible: true,
    kind: "text",
    name: "Deep Label",
    parent_id: "frame_level_4",
    render_style: {
      color: "#111111",
      fontFamily: "IBM Plex Sans",
      fontSize: 16
    },
    scene_id: "scene_home",
    text: {
      content: "Deep Label"
    }
  };

  return document;
}

function renderIntoDom(
  activeProject: ActiveProject,
  options: {
    onApplyCommands?: (input: ApplyCommandsInput) => Promise<ReturnType<typeof ok<CommandResult>>>;
    runtimeCapabilities?: RuntimeCapabilities;
  } = {}
): RenderHarness {
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
        onApplyCommands={options.onApplyCommands}
        onBackToLibrary={() => {}}
        runtimeCapabilities={options.runtimeCapabilities ?? runtimeCapabilities}
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

function assignInteractionGeometry(harness: RenderHarness) {
  const rendererRoot = harness.container.querySelector('[data-renderer-root="true"]') as HTMLElement;
  const sceneFrame = harness.container.querySelector('[data-node-id="scene_home"]') as HTMLElement;
  const heroRectangle = harness.container.querySelector('[data-node-id="rect_hero"]') as HTMLElement;
  const looseRectangle = harness.container.querySelector('[data-node-id="rect_loose"]') as HTMLElement | null;

  assignBoundingRect(rendererRoot, 0, 0, 1600, 1200);
  assignBoundingRect(sceneFrame, 80, 80, 390, 844);
  assignBoundingRect(heroRectangle, 104, 104, 320, 180);

  if (looseRectangle) {
    assignBoundingRect(looseRectangle, 520, 160, 180, 120);
  }
}

function getLayerRow(harness: RenderHarness, nodeId: string): HTMLButtonElement | null {
  return harness.container.querySelector(
    `[data-layer-row="true"][data-layer-node-id="${nodeId}"]`
  ) as HTMLButtonElement | null;
}

function getLayerDisclosure(harness: RenderHarness, nodeId: string): HTMLButtonElement | null {
  return harness.container.querySelector(
    `[data-layer-disclosure="true"][data-layer-node-id="${nodeId}"]`
  ) as HTMLButtonElement | null;
}

function getHideLayersToggle(harness: RenderHarness): HTMLButtonElement | null {
  return harness.container.querySelector(
    '[data-layers-hide-toggle="true"]'
  ) as HTMLButtonElement | null;
}

function getShowLayersToggle(harness: RenderHarness): HTMLButtonElement | null {
  return harness.container.querySelector(
    '[data-layers-show-toggle="true"]'
  ) as HTMLButtonElement | null;
}

beforeEach(() => {
  scrollIntoViewMock = vi.fn();

  class TestPointerEvent extends MouseEvent {
    declare readonly isPrimary: boolean;
    declare readonly pointerId: number;
    declare readonly pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      Object.defineProperty(this, "isPrimary", {
        value: init.isPrimary ?? true
      });
      Object.defineProperty(this, "pointerId", {
        value: init.pointerId ?? 1
      });
      Object.defineProperty(this, "pointerType", {
        value: init.pointerType ?? "mouse"
      });
    }
  }

  const pointerCaptureIds = new WeakMap<Element, Set<number>>();

  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value(pointerId: number) {
      const capturedIds = pointerCaptureIds.get(this) ?? new Set<number>();

      capturedIds.add(pointerId);
      pointerCaptureIds.set(this, capturedIds);
    }
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value(pointerId: number) {
      pointerCaptureIds.get(this)?.delete(pointerId);
    }
  });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value(pointerId: number) {
      return pointerCaptureIds.get(this)?.has(pointerId) ?? false;
    }
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoViewMock
  });
});

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
      expect(countMatches(harness.container.textContent ?? "", /1 scene/g)).toBe(1);
      expect(workspaceSurface).not.toBeNull();
      expect(viewportFrame).not.toBeNull();
      expect(sceneFrame.style.left).toBe("80px");
      expect(sceneFrame.style.top).toBe("80px");
      expect(rectangle.style.backgroundColor).toBe("rgb(245, 192, 74)");
    } finally {
      harness.cleanup();
    }
  });

  it("renders the layers inspector in canvas order with type-specific icons", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithInspectorFixtures()));

    try {
      const layerRows = [...harness.container.querySelectorAll('[data-layer-row="true"]')];
      const sceneRow = getLayerRow(harness, "scene_home");
      const heroRow = getLayerRow(harness, "rect_hero");
      const titleRow = getLayerRow(harness, "text_title");
      const looseRow = getLayerRow(harness, "rect_loose");

      expect(layerRows.map((row) => row.getAttribute("data-layer-node-id"))).toEqual([
        "scene_home",
        "rect_hero",
        "text_title",
        "rect_loose"
      ]);

      expect(sceneRow?.querySelector('[data-layer-icon-type="frame"]')).not.toBeNull();
      expect(sceneRow?.querySelector('[data-layer-icon-direction="row"]')).not.toBeNull();
      expect(heroRow?.querySelector('[data-layer-icon-type="rectangle"]')).not.toBeNull();
      expect(titleRow?.querySelector('[data-layer-icon-type="text"]')).not.toBeNull();
      expect(looseRow?.querySelector('[data-layer-icon-type="image"]')).not.toBeNull();
      expect(sceneRow?.textContent).toBe("Home");
      expect(heroRow?.textContent).toBe("Hero");
      expect(titleRow?.textContent).toBe("Title");
      expect(looseRow?.textContent).toBe("Loose Card");
    } finally {
      harness.cleanup();
    }
  });

  it("keeps the workspace shell viewport-locked and the hierarchy self-scrolling", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const workspaceShell = harness.container.querySelector(
        '[data-workspace-shell="true"]'
      ) as HTMLElement;
      const workspaceBody = harness.container.querySelector(
        '[data-workspace-body="true"]'
      ) as HTMLElement;
      const overlay = harness.container.querySelector(
        '[data-layers-overlay="true"]'
      ) as HTMLElement;
      const overlayPanel = harness.container.querySelector(
        '[data-layers-overlay-panel="true"]'
      ) as HTMLElement;
      const inspector = harness.container.querySelector(
        '[data-layers-inspector="true"]'
      ) as HTMLElement;
      const scrollRegion = harness.container.querySelector(
        '[data-layers-scroll-region="true"]'
      ) as HTMLElement;

      expect(workspaceShell.className).toContain("h-screen");
      expect(workspaceShell.className).toContain("overflow-hidden");
      expect(workspaceBody.className).toContain("overflow-hidden");
      expect(overlay.className).toContain("absolute");
      expect(overlay.className).toContain("inset-0");
      expect(overlayPanel.className).toContain("absolute");
      expect(overlayPanel.className).toContain("left-0");
      expect(inspector.className).toContain("min-h-0");
      expect(inspector.className).toContain("overflow-hidden");
      expect(inspector.className).toContain("bg-white");
      expect(scrollRegion.className).toContain("overflow-auto");
      expect(scrollRegion.className).toContain("bg-white");
    } finally {
      harness.cleanup();
    }
  });

  it("hides the layers pane and shows a floating reveal control", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]');
      const overlay = harness.container.querySelector('[data-layers-overlay="true"]') as HTMLElement;
      const hideToggle = getHideLayersToggle(harness);

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).not.toBeNull();
      expect(hideToggle?.getAttribute("aria-label")).toBe("Hide layers panel");
      expect(hideToggle?.className).not.toContain("rounded-full");
      expect(viewportFrame).not.toBeNull();
      expect(overlay.className).toContain("absolute");

      act(() => {
        hideToggle?.click();
      });

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).toBeNull();
      expect(harness.container.querySelector('[data-layers-overlay-panel="true"]')).toBeNull();
      expect(getShowLayersToggle(harness)?.getAttribute("aria-label")).toBe("Show layers panel");
      expect(harness.container.querySelector('[data-viewport-frame="true"]')).toBe(viewportFrame);
    } finally {
      harness.cleanup();
    }
  });

  it("restores the layers pane from the floating reveal control", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      act(() => {
        getHideLayersToggle(harness)?.click();
      });

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).toBeNull();

      const showToggle = getShowLayersToggle(harness);

      expect(showToggle?.className).not.toContain("rounded-full");

      act(() => {
        showToggle?.click();
      });

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).not.toBeNull();
      expect(getHideLayersToggle(harness)).not.toBeNull();
      expect(getShowLayersToggle(harness)).toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it("reopens the layers pane when the workspace identity changes", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      act(() => {
        getHideLayersToggle(harness)?.click();
      });

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).toBeNull();

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

      expect(harness.container.textContent).toContain("Workspace Fixture Reopened");
      expect(harness.container.querySelector('[data-layers-inspector="true"]')).not.toBeNull();
      expect(getHideLayersToggle(harness)).not.toBeNull();
      expect(getShowLayersToggle(harness)).toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it("supports horizontal scrolling for deep layer indentation", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithDeepHierarchy()));

    try {
      act(() => {
        getLayerDisclosure(harness, "frame_level_1")?.click();
      });

      act(() => {
        getLayerDisclosure(harness, "frame_level_2")?.click();
      });

      act(() => {
        getLayerDisclosure(harness, "frame_level_3")?.click();
      });

      act(() => {
        getLayerDisclosure(harness, "frame_level_4")?.click();
      });

      const scrollRegion = harness.container.querySelector(
        '[data-layers-scroll-region="true"]'
      ) as HTMLElement;
      const treeContent = harness.container.querySelector(
        '[data-layers-tree-content="true"]'
      ) as HTMLElement;

      expect(scrollRegion).not.toBeNull();
      expect(treeContent.getAttribute("data-tree-max-depth")).toBe("5");
      expect(treeContent.style.minWidth).toBe("310px");
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
      expect(transform.panX).toBeCloseTo(336.6522583040123, 2);
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

  it("syncs canvas selection into the layers inspector and re-expands collapsed ancestors", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      assignInteractionGeometry(harness);
      const sceneDisclosure = getLayerDisclosure(harness, "scene_home");

      act(() => {
        sceneDisclosure?.click();
      });

      expect(getLayerRow(harness, "rect_hero")).toBeNull();

      const rectangle = harness.container.querySelector('[data-node-id="rect_hero"]') as HTMLElement;

      act(() => {
        dispatchPointerEvent(rectangle, "pointerdown", {
          clientX: 140,
          clientY: 140,
          pointerId: 11
        });
      });

      expect(getLayerDisclosure(harness, "scene_home")?.getAttribute("data-expanded")).toBe("true");
      expect(getLayerRow(harness, "rect_hero")?.getAttribute("data-layer-selected")).toBe("true");
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    } finally {
      harness.cleanup();
    }
  });

  it("scrolls the hierarchy row into view for offscreen canvas selections", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithDeepHierarchy()));

    try {
      act(() => {
        getLayerDisclosure(harness, "frame_level_1")?.click();
      });

      act(() => {
        getLayerDisclosure(harness, "frame_level_2")?.click();
      });

      act(() => {
        getLayerDisclosure(harness, "frame_level_3")?.click();
      });

      act(() => {
        getLayerDisclosure(harness, "frame_level_4")?.click();
      });

      const scrollRegion = harness.container.querySelector(
        '[data-layers-scroll-region="true"]'
      ) as HTMLElement;
      const deepRow = getLayerRow(harness, "text_leaf") as HTMLButtonElement;
      const deepCanvasNode = harness.container.querySelector('[data-node-id="text_leaf"]') as HTMLElement;

      assignBoundingRect(scrollRegion, 0, 0, 320, 96);
      assignBoundingRect(deepRow, 0, 220, 280, 24);

      act(() => {
        dispatchPointerEvent(deepCanvasNode, "pointerdown", {
          clientX: 40,
          clientY: 40,
          pointerId: 12
        });
      });

      expect(getLayerRow(harness, "text_leaf")?.getAttribute("data-layer-selected")).toBe("true");
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest"
      });
    } finally {
      harness.cleanup();
    }
  });

  it("does not scroll the hierarchy row when a canvas selection is already visible", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      const scrollRegion = harness.container.querySelector(
        '[data-layers-scroll-region="true"]'
      ) as HTMLElement;
      const heroRow = getLayerRow(harness, "rect_hero") as HTMLButtonElement;
      const heroCanvasNode = harness.container.querySelector('[data-node-id="rect_hero"]') as HTMLElement;

      assignBoundingRect(scrollRegion, 0, 0, 320, 160);
      assignBoundingRect(heroRow, 0, 40, 280, 24);

      act(() => {
        dispatchPointerEvent(heroCanvasNode, "pointerdown", {
          clientX: 140,
          clientY: 140,
          pointerId: 13
        });
      });

      expect(getLayerRow(harness, "rect_hero")?.getAttribute("data-layer-selected")).toBe("true");
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    } finally {
      harness.cleanup();
    }
  });

  it("does not auto-scroll the hierarchy for hierarchy-driven selection", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      act(() => {
        getLayerRow(harness, "scene_home")?.click();
      });

      expect(getLayerRow(harness, "scene_home")?.getAttribute("data-layer-selected")).toBe("true");
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    } finally {
      harness.cleanup();
    }
  });

  it("selects layers from the pane and reveals offscreen content", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()));

    try {
      assignInteractionGeometry(harness);

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
            deltaY: 900
          })
        );
      });

      expect(rendererTransform.style.transform).toBe("translate(237px, -890px) scale(1)");

      act(() => {
        getLayerRow(harness, "scene_home")?.click();
      });

      expect(rendererTransform.style.transform).toBe("translate(237px, -16px) scale(1)");
      expect(getLayerRow(harness, "scene_home")?.getAttribute("data-layer-selected")).toBe("true");
      expect(
        harness.container.querySelector('[data-interaction-outline="selected"][data-node-id="scene_home"]')
      ).not.toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it("shows a hover outline and single-node selection affordances", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithLooseNode()));

    try {
      assignInteractionGeometry(harness);

      const rectangle = harness.container.querySelector('[data-node-id="rect_loose"]') as HTMLElement;

      act(() => {
        dispatchPointerEvent(rectangle, "pointermove", {
          clientX: 540,
          clientY: 180
        });
      });

      const hoverOutline = harness.container.querySelector(
        '[data-interaction-outline="hover"][data-node-id="rect_loose"]'
      );

      expect(hoverOutline).not.toBeNull();

      act(() => {
        rectangle.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            button: 0
          })
        );
      });

      const selectionOutline = harness.container.querySelector(
        '[data-interaction-outline="selected"][data-node-id="rect_loose"]'
      );
      const resizeHandle = harness.container.querySelector(
        '[data-interaction-handle="se"][data-node-id="rect_loose"]'
      );

      expect(selectionOutline).not.toBeNull();
      expect(resizeHandle).not.toBeNull();
    } finally {
      harness.cleanup();
    }
  });

  it("selects a scene frame and commits move drags through update_scene", async () => {
    const onApplyCommands = vi.fn(async (input: ApplyCommandsInput) =>
      ok({
        document_id: input.document_id,
        layout_refresh: {
          reason: "computed_layout_refresh_not_implemented",
          status: "skipped"
        },
        revision: 2
      })
    );
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()), {
      onApplyCommands
    });

    try {
      assignInteractionGeometry(harness);

      const sceneFrame = harness.container.querySelector('[data-node-id="scene_home"]') as HTMLElement;
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;

      act(() => {
        dispatchPointerEvent(sceneFrame, "pointerdown", {
          clientX: 200,
          clientY: 200,
          pointerId: 5
        });
      });

      act(() => {
        dispatchPointerEvent(viewportFrame, "pointermove", {
          clientX: 240,
          clientY: 230,
          pointerId: 5
        });
      });

      const previewGhost = harness.container.querySelector(
        '[data-interaction-preview="true"][data-node-id="scene_home"]'
      );

      expect(previewGhost).not.toBeNull();

      await act(async () => {
        dispatchPointerEvent(viewportFrame, "pointerup", {
          clientX: 240,
          clientY: 230,
          pointerId: 5
        });
        await Promise.resolve();
      });

      const selectionOutline = harness.container.querySelector(
        '[data-interaction-outline="selected"][data-node-id="scene_home"]'
      ) as SVGRectElement;

      expect(
        harness.container.querySelector('[data-interaction-preview="true"][data-node-id="scene_home"]')
      ).toBeNull();
      expect(selectionOutline.getAttribute("x")).toBe("120");
      expect(selectionOutline.getAttribute("y")).toBe("110");

      expect(onApplyCommands).toHaveBeenCalledWith({
        base_revision: 1,
        commands: [
          {
            patch: {
              left: 120,
              top: 110
            },
            scene_id: "scene_home",
            type: "update_scene"
          }
        ],
        document_id: "doc_workspace_scene"
      });
    } finally {
      harness.cleanup();
    }
  });

  it("commits southeast resize drags for loose top-level nodes through update_node", async () => {
    const onApplyCommands = vi.fn(async (input: ApplyCommandsInput) =>
      ok({
        document_id: input.document_id,
        layout_refresh: {
          reason: "computed_layout_refresh_not_implemented",
          status: "skipped"
        },
        revision: 2
      })
    );
    const harness = renderIntoDom(createActiveProject(createDocumentWithLooseNode()), {
      onApplyCommands
    });

    try {
      assignInteractionGeometry(harness);

      const rectangle = harness.container.querySelector('[data-node-id="rect_loose"]') as HTMLElement;
      const viewportFrame = harness.container.querySelector('[data-viewport-frame="true"]') as HTMLElement;

      act(() => {
        dispatchPointerEvent(rectangle, "pointerdown", {
          clientX: 560,
          clientY: 200,
          pointerId: 6
        });
      });

      act(() => {
        dispatchPointerEvent(viewportFrame, "pointerup", {
          clientX: 560,
          clientY: 200,
          pointerId: 6
        });
      });

      const southeastHandle = harness.container.querySelector(
        '[data-interaction-handle="se"][data-node-id="rect_loose"]'
      ) as HTMLElement;

      act(() => {
        dispatchPointerEvent(southeastHandle, "pointerdown", {
          clientX: 700,
          clientY: 280,
          pointerId: 7
        });
      });

      act(() => {
        dispatchPointerEvent(viewportFrame, "pointermove", {
          clientX: 735,
          clientY: 305,
          pointerId: 7
        });
      });

      expect(
        harness.container.querySelector('[data-interaction-preview="true"][data-node-id="rect_loose"]')
      ).not.toBeNull();

      await act(async () => {
        dispatchPointerEvent(viewportFrame, "pointerup", {
          clientX: 735,
          clientY: 305,
          pointerId: 7
        });
        await Promise.resolve();
      });

      const selectionOutline = harness.container.querySelector(
        '[data-interaction-outline="selected"][data-node-id="rect_loose"]'
      ) as SVGRectElement;

      expect(
        harness.container.querySelector('[data-interaction-preview="true"][data-node-id="rect_loose"]')
      ).toBeNull();
      expect(selectionOutline.getAttribute("width")).toBe("215");
      expect(selectionOutline.getAttribute("height")).toBe("145");

      expect(onApplyCommands).toHaveBeenCalledWith({
        base_revision: 1,
        commands: [
          {
            node_id: "rect_loose",
            patch: {
              height: 145,
              width: 215
            },
            type: "update_node"
          }
        ],
        document_id: "doc_workspace_loose"
      });
    } finally {
      harness.cleanup();
    }
  });

  it("keeps in-flow scene children selectable but without drag handles or mutation", () => {
    const onApplyCommands = vi.fn(async (input: ApplyCommandsInput) =>
      ok({
        document_id: input.document_id,
        layout_refresh: {
          reason: "computed_layout_refresh_not_implemented",
          status: "skipped"
        },
        revision: 2
      })
    );
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()), {
      onApplyCommands
    });

    try {
      assignInteractionGeometry(harness);

      const rectangle = harness.container.querySelector('[data-node-id="rect_hero"]') as HTMLElement;

      act(() => {
        dispatchPointerEvent(rectangle, "pointerdown", {
          clientX: 140,
          clientY: 140,
          pointerId: 9
        });
      });

      expect(
        harness.container.querySelector('[data-interaction-outline="selected"][data-node-id="rect_hero"]')
      ).not.toBeNull();
      expect(
        harness.container.querySelector('[data-interaction-handle][data-node-id="rect_hero"]')
      ).toBeNull();

      act(() => {
        dispatchPointerEvent(rectangle, "pointermove", {
          clientX: 180,
          clientY: 180,
          pointerId: 9
        });
        dispatchPointerEvent(rectangle, "pointerup", {
          clientX: 180,
          clientY: 180,
          pointerId: 9
        });
      });

      expect(onApplyCommands).not.toHaveBeenCalled();
    } finally {
      harness.cleanup();
    }
  });
});
