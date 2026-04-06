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

async function flushAnimationFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

const runtimeCapabilities: RuntimeCapabilities = {
  measurementSurfaceAvailable: true,
  mode: "read_write",
  runtimeState: "editor_open_clean"
};

const emptyHistoryState = {
  canRedo: false,
  canUndo: false,
  redoDepth: 0,
  undoDepth: 0
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

function createActiveProject(document: RendererDocument, revision = 1): ActiveProject {
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
    revision
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

function createMovedSceneDocument(): RendererDocument {
  const document = createDocumentWithScene();

  document.nodes.scene_home.render_style.left = 120;
  document.nodes.scene_home.render_style.top = 110;

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
      backgroundColor: "#e5e5e5",
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
  document.nodes.scene_home.render_style.gap = 24;
  document.nodes.scene_home.render_style.paddingTop = 32;
  document.nodes.scene_home.render_style.paddingRight = 24;
  document.nodes.scene_home.render_style.paddingBottom = 32;
  document.nodes.scene_home.render_style.paddingLeft = 24;
  document.nodes.scene_home.render_style.justifyContent = "space-between";
  document.nodes.scene_home.render_style.alignItems = "center";
  document.nodes.scene_home.render_style.overflow = "hidden";
  document.nodes.scene_home.render_style.borderRadius = 28;
  document.nodes.scene_home.render_style.opacity = 0.96;
  document.nodes.rect_loose.render_style.backgroundImage = "url(asset://asset_loose)";
  document.nodes.rect_loose.render_style.position = "absolute";
  document.nodes.rect_loose.render_style.borderRadius = 16;
  document.nodes.rect_loose.render_style.opacity = 0.72;
  document.assets.asset_scene = {
    id: "asset_scene",
    kind: "image",
    mime_type: "image/png",
    height: 900,
    source: {
      data_uri: "data:image/png;base64,AAAA",
      kind: "data_uri"
    },
    width: 1440
  };
  document.assets.asset_loose = {
    id: "asset_loose",
    kind: "image",
    mime_type: "image/png",
    height: 1200,
    source: {
      data_uri: "data:image/png;base64,AAAA",
      kind: "data_uri"
    },
    width: 1600
  };

  return document;
}

function createDocumentWithSelectionInspectorFixtures(): RendererDocument {
  const document = createDocumentWithInspectorFixtures();

  document.name = "Selection Fixture";
  document.canvas.authoring.local_values["canvas.background_color"] = "#f5f5f5";
  document.canvas.background_color = "#f5f5f5";
  document.variables.collections.tokens = {
    default_mode_id: "base",
    id: "tokens",
    modes: {
      base: {
        id: "base",
        name: "Base"
      }
    },
    name: "Tokens",
    variables: {
      color_text: {
        collection_id: "tokens",
        group_path: [],
        id: "color_text",
        kind: "color",
        name: "Text",
        scopes: ["node.text.color"],
        values_by_mode: {
          base: {
            kind: "value",
            value: "#111111"
          }
        }
      }
    }
  };
  document.styles.paint.card = {
    id: "card",
    name: "Card",
    slots: {
      "node.paint.background_color": {
        kind: "value",
        value: "#ffffff"
      }
    }
  };
  document.nodes.scene_home.authoring.style_bindings.paint = "card";
  document.nodes.scene_home.computed_layout = {
    height: 844,
    width: 390,
    x: 80,
    y: 80
  };
  document.nodes.text_title.authoring.local_values["node.typography.font_size"] = 32;
  document.nodes.text_title.authoring.variable_bindings["node.text.color"] = "color_text";
  document.nodes.text_title.render_style.flexGrow = 1;
  document.nodes.text_title.render_style.flexShrink = 0;
  document.nodes.text_title.render_style.flexBasis = 160;
  document.nodes.text_title.render_style.alignSelf = "stretch";
  document.nodes.text_title.render_style.lineHeight = 40;
  document.nodes.text_title.render_style.letterSpacing = 0.25;
  document.nodes.text_title.render_style.textAlign = "left";
  document.nodes.text_title.computed_layout = {
    height: 38,
    width: 220,
    x: 120,
    y: 300
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
    historyState?: typeof emptyHistoryState;
    onApplyCommands?: (input: ApplyCommandsInput) => Promise<ReturnType<typeof ok<CommandResult>>>;
    onRedo?: () => Promise<void> | void;
    onUndo?: () => Promise<void> | void;
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
        historyState={options.historyState ?? emptyHistoryState}
        mcpStatus={mcpStatus}
        onApplyCommands={options.onApplyCommands}
        onBackToLibrary={() => {}}
        onRedo={options.onRedo}
        onUndo={options.onUndo}
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
  const titleText = harness.container.querySelector('[data-node-id="text_title"]') as HTMLElement | null;
  const looseRectangle = harness.container.querySelector('[data-node-id="rect_loose"]') as HTMLElement | null;

  assignBoundingRect(rendererRoot, 0, 0, 1600, 1200);
  assignBoundingRect(sceneFrame, 80, 80, 390, 844);
  assignBoundingRect(heroRectangle, 104, 104, 320, 180);

  if (titleText) {
    assignBoundingRect(titleText, 120, 300, 220, 38);
  }

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

function getSelectionInspector(harness: RenderHarness): HTMLElement | null {
  return harness.container.querySelector(
    '[data-selection-inspector="true"]'
  ) as HTMLElement | null;
}

function getInspectorSection(harness: RenderHarness, sectionName: string): HTMLElement | null {
  return harness.container.querySelector(
    `[data-inspector-section="${sectionName}"]`
  ) as HTMLElement | null;
}

function getInspectorMetric(section: Element | null, metric: string): HTMLElement | null {
  return section?.querySelector(
    `[data-inspector-metric="${metric}"]`
  ) as HTMLElement | null;
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
      expect(rectangle.style.backgroundColor).toBe("rgb(212, 212, 212)");
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

  it("shows a document summary in the right inspector when nothing is selected", () => {
    const harness = renderIntoDom(
      createActiveProject(createDocumentWithSelectionInspectorFixtures())
    );

    try {
      const inspector = getSelectionInspector(harness) as HTMLElement;
      const pageSection = getInspectorSection(harness, "page") as HTMLElement;

      expect(inspector.getAttribute("data-inspector-state")).toBe("document");
      expect(inspector.textContent).toContain("Selection Fixture");
      expect(inspector.textContent).toContain("Nothing selected");
      expect(pageSection.textContent).toContain("Scenes");
      expect(pageSection.textContent).toContain("Items");
      expect(pageSection.textContent).toContain("Loose");
      expect(pageSection.textContent).toContain("#f5f5f5");
      expect(inspector.textContent).not.toContain("canvas.background_color");
      expect(inspector.textContent).not.toContain("Project ID");
      expect(inspector.textContent).not.toContain("Variable collections");
    } finally {
      harness.cleanup();
    }
  });

  it("shows layout and auto layout details for scene-root selection", async () => {
    const harness = renderIntoDom(
      createActiveProject(createDocumentWithSelectionInspectorFixtures())
    );

    try {
      assignInteractionGeometry(harness);

      act(() => {
        getLayerRow(harness, "scene_home")?.click();
      });

      await flushAnimationFrame();

      const inspector = getSelectionInspector(harness) as HTMLElement;
      const layoutSection = getInspectorSection(harness, "layout") as HTMLElement;
      const autoLayoutSection = getInspectorSection(harness, "auto-layout") as HTMLElement;

      expect(inspector.getAttribute("data-inspector-state")).toBe("scene");
      expect(inspector.textContent).toContain("Scene frame");
      expect(getInspectorMetric(layoutSection, "x")?.textContent).toContain("80");
      expect(getInspectorMetric(layoutSection, "y")?.textContent).toContain("80");
      expect(getInspectorMetric(layoutSection, "w")?.textContent).toContain("390");
      expect(getInspectorMetric(layoutSection, "h")?.textContent).toContain("844");
      expect(layoutSection.textContent).toContain("Top level");
      expect(autoLayoutSection.textContent).toContain("Horizontal");
      expect(autoLayoutSection.textContent).toContain("24");
      expect(autoLayoutSection.textContent).toContain("32 24");
      expect(autoLayoutSection.textContent).toContain("Space Between");
      expect(autoLayoutSection.textContent).toContain("On");
      expect(inspector.textContent).not.toContain("Scene ID");
      expect(inspector.textContent).not.toContain("Raw render style");
      expect(inspector.textContent).not.toContain("Semantics");
    } finally {
      harness.cleanup();
    }
  });

  it("shows flex item and text details for in-flow child selection", async () => {
    const harness = renderIntoDom(
      createActiveProject(createDocumentWithSelectionInspectorFixtures())
    );

    try {
      assignInteractionGeometry(harness);

      act(() => {
        getLayerRow(harness, "text_title")?.click();
      });

      await flushAnimationFrame();

      const inspector = getSelectionInspector(harness) as HTMLElement;
      const layoutSection = getInspectorSection(harness, "layout") as HTMLElement;
      const flexItemSection = getInspectorSection(harness, "flex-item") as HTMLElement;
      const textSection = getInspectorSection(harness, "text") as HTMLElement;

      expect(inspector.getAttribute("data-inspector-state")).toBe("node");
      expect(inspector.textContent).toContain("Inside Home");
      expect(layoutSection.textContent).toContain("In flow");
      expect(getInspectorMetric(layoutSection, "x")).toBeNull();
      expect(getInspectorMetric(layoutSection, "y")).toBeNull();
      expect(getInspectorMetric(layoutSection, "w")?.textContent).toContain("220");
      expect(getInspectorMetric(layoutSection, "h")?.textContent).toContain("38");
      expect(flexItemSection.textContent).toContain("Grow");
      expect(flexItemSection.textContent).toContain("1");
      expect(flexItemSection.textContent).toContain("Shrink");
      expect(flexItemSection.textContent).toContain("0");
      expect(flexItemSection.textContent).toContain("160");
      expect(textSection.textContent).toContain("Hello from MCP");
      expect(textSection.textContent).toContain("IBM Plex Sans");
      expect(textSection.textContent).toContain("Line height");
      expect(textSection.textContent).toContain("Letter spacing");
      expect(inspector.textContent).not.toContain("Hierarchy path");
      expect(inspector.textContent).not.toContain("node.text.color");
    } finally {
      harness.cleanup();
    }
  });

  it("shows x, y, width, and height for absolute selections without debug fields", async () => {
    const harness = renderIntoDom(
      createActiveProject(createDocumentWithSelectionInspectorFixtures())
    );

    try {
      assignInteractionGeometry(harness);

      act(() => {
        getLayerRow(harness, "rect_loose")?.click();
      });

      await flushAnimationFrame();

      const inspector = getSelectionInspector(harness) as HTMLElement;
      const layoutSection = getInspectorSection(harness, "layout") as HTMLElement;
      const appearanceSection = getInspectorSection(harness, "appearance") as HTMLElement;

      expect(inspector.getAttribute("data-inspector-state")).toBe("node");
      expect(inspector.textContent).toContain("Top level");
      expect(getInspectorMetric(layoutSection, "x")?.textContent).toContain("520");
      expect(getInspectorMetric(layoutSection, "y")?.textContent).toContain("160");
      expect(getInspectorMetric(layoutSection, "w")?.textContent).toContain("180");
      expect(getInspectorMetric(layoutSection, "h")?.textContent).toContain("120");
      expect(appearanceSection.textContent).toContain("Image fill");
      expect(appearanceSection.textContent).toContain("PNG");
      expect(appearanceSection.textContent).toContain("72%");
      expect(inspector.textContent).not.toContain("Asset ID");
      expect(inspector.textContent).not.toContain("Raw render style");
    } finally {
      harness.cleanup();
    }
  });

  it("submits update_node when the inspector fill color picker changes", async () => {
    const onApplyCommands = vi.fn(async (input: ApplyCommandsInput) =>
      ok({
        document_id: input.document_id,
        layout_refresh: {
          measured_node_count: 1,
          measured_root_ids: ["rect_hero"],
          status: "refreshed"
        },
        revision: 2
      })
    );
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()), {
      onApplyCommands
    });

    try {
      act(() => {
        getLayerRow(harness, "rect_hero")?.click();
      });

      const fillColorInput = harness.container.querySelector(
        'input[aria-label="Fill color"]'
      ) as HTMLInputElement | null;

      expect(fillColorInput).not.toBeNull();
      expect(fillColorInput?.value).toBe("#d4d4d4");

      await act(async () => {
        setInputValue(fillColorInput as HTMLInputElement, "#112233");
        fillColorInput?.dispatchEvent(
          new Event("change", {
            bubbles: true
          })
        );
        await Promise.resolve();
      });

      expect(onApplyCommands).toHaveBeenCalledWith({
        base_revision: 1,
        commands: [
          {
            node_id: "rect_hero",
            patch: {
              render_style: {
                backgroundColor: "#112233"
              }
            },
            type: "update_node"
          }
        ],
        document_id: "doc_workspace_scene"
      });
    } finally {
      harness.cleanup();
    }
  });

  it("disables the inspector fill color picker when runtime is read-only", () => {
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()), {
      runtimeCapabilities: {
        ...runtimeCapabilities,
        mode: "read_only"
      }
    });

    try {
      act(() => {
        getLayerRow(harness, "rect_hero")?.click();
      });

      const fillColorInput = harness.container.querySelector(
        'input[aria-label="Fill color"]'
      ) as HTMLInputElement | null;

      expect(fillColorInput).not.toBeNull();
      expect(fillColorInput?.disabled).toBe(true);
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
      const canvasRegion = harness.container.querySelector(
        '[data-workspace-canvas-region="true"]'
      ) as HTMLElement;
      const layersOverlay = harness.container.querySelector(
        '[data-layers-overlay="true"]'
      ) as HTMLElement;
      const layersOverlayPanel = harness.container.querySelector(
        '[data-layers-overlay-panel="true"]'
      ) as HTMLElement;
      const inspector = harness.container.querySelector(
        '[data-layers-inspector="true"]'
      ) as HTMLElement;
      const selectionInspector = getSelectionInspector(harness) as HTMLElement;
      const scrollRegion = harness.container.querySelector(
        '[data-layers-scroll-region="true"]'
      ) as HTMLElement;

      expect(workspaceShell.className).toContain("h-screen");
      expect(workspaceShell.className).toContain("overflow-hidden");
      expect(workspaceBody.className).toContain("flex");
      expect(workspaceBody.className).toContain("overflow-hidden");
      expect(canvasRegion.className).toContain("relative");
      expect(canvasRegion.className).toContain("flex-1");
      expect(layersOverlay.className).toContain("absolute");
      expect(layersOverlay.className).toContain("inset-0");
      expect(layersOverlayPanel.className).toContain("absolute");
      expect(layersOverlayPanel.className).toContain("left-0");
      expect(inspector.className).toContain("min-h-0");
      expect(inspector.className).toContain("overflow-hidden");
      expect(inspector.className).toContain("bg-white");
      expect(selectionInspector.className).toContain("shrink-0");
      expect(selectionInspector.className).toContain("overflow-hidden");
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
      const layersOverlay = harness.container.querySelector('[data-layers-overlay="true"]') as HTMLElement;
      const hideToggle = getHideLayersToggle(harness);

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).not.toBeNull();
      expect(hideToggle?.getAttribute("aria-label")).toBe("Hide layers panel");
      expect(hideToggle?.className).not.toContain("rounded-full");
      expect(viewportFrame).not.toBeNull();
      expect(layersOverlay.className).toContain("absolute");

      act(() => {
        hideToggle?.click();
      });

      expect(harness.container.querySelector('[data-layers-inspector="true"]')).toBeNull();
      expect(harness.container.querySelector('[data-layers-overlay-panel="true"]')).toBeNull();
      expect(getShowLayersToggle(harness)?.getAttribute("aria-label")).toBe("Show layers panel");
      expect(harness.container.querySelector('[data-viewport-frame="true"]')).toBe(viewportFrame);
      expect(getSelectionInspector(harness)).not.toBeNull();
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

  it("does not shift the canvas transform when hiding and re-showing the left hierarchy", () => {
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
            deltaY: 320
          })
        );
      });

      const transformBeforeToggle = rendererTransform.style.transform;

      act(() => {
        getHideLayersToggle(harness)?.click();
      });

      expect(rendererTransform.style.transform).toBe(transformBeforeToggle);

      act(() => {
        getShowLayersToggle(harness)?.click();
      });

      expect(rendererTransform.style.transform).toBe(transformBeforeToggle);
      expect(harness.container.querySelector('[data-viewport-frame="true"]')).toBe(viewportFrame);
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
          measured_node_count: 1,
          measured_root_ids: ["scene_home"],
          status: "refreshed"
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

  it("repositions the selected outline from document geometry after an external revision moves the node back", () => {
    const movedDocument = createMovedSceneDocument();
    const harness = renderIntoDom(createActiveProject(movedDocument, 2));

    try {
      const rendererRoot = harness.container.querySelector(
        '[data-renderer-root="true"]'
      ) as HTMLElement;
      const sceneFrame = harness.container.querySelector('[data-node-id="scene_home"]') as HTMLElement;

      assignBoundingRect(rendererRoot, 0, 0, 1600, 1200);
      assignBoundingRect(sceneFrame, 120, 110, 390, 844);

      act(() => {
        sceneFrame.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            button: 0
          })
        );
      });

      const movedOutline = harness.container.querySelector(
        '[data-interaction-outline="selected"][data-node-id="scene_home"]'
      ) as SVGRectElement;

      expect(movedOutline.getAttribute("x")).toBe("120");
      expect(movedOutline.getAttribute("y")).toBe("110");

      const undoneDocument = createDocumentWithScene();

      act(() => {
        harness.root.render(
          <DocumentWorkspaceScreen
            activeProject={createActiveProject(undoneDocument, 3)}
            historyState={emptyHistoryState}
            mcpStatus={mcpStatus}
            onBackToLibrary={() => {}}
            runtimeCapabilities={runtimeCapabilities}
          />
        );
      });

      const undoneOutline = harness.container.querySelector(
        '[data-interaction-outline="selected"][data-node-id="scene_home"]'
      ) as SVGRectElement;

      expect(undoneOutline.getAttribute("x")).toBe("80");
      expect(undoneOutline.getAttribute("y")).toBe("80");
    } finally {
      harness.cleanup();
    }
  });

  it("commits southeast resize drags for loose top-level nodes through update_node", async () => {
    const onApplyCommands = vi.fn(async (input: ApplyCommandsInput) =>
      ok({
        document_id: input.document_id,
        layout_refresh: {
          measured_node_count: 1,
          measured_root_ids: ["rect_loose"],
          status: "refreshed"
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
          measured_node_count: 1,
          measured_root_ids: ["scene_home"],
          status: "refreshed"
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

  it("enables undo and redo controls from shared history state and invokes callbacks", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()), {
      historyState: {
        canRedo: true,
        canUndo: true,
        redoDepth: 1,
        undoDepth: 2
      },
      onRedo,
      onUndo
    });

    try {
      const undoButton = harness.container.querySelector(
        '[data-history-action="undo"]'
      ) as HTMLButtonElement;
      const redoButton = harness.container.querySelector(
        '[data-history-action="redo"]'
      ) as HTMLButtonElement;

      expect(undoButton.disabled).toBe(false);
      expect(redoButton.disabled).toBe(false);

      act(() => {
        undoButton.click();
        redoButton.click();
      });

      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onRedo).toHaveBeenCalledTimes(1);
    } finally {
      harness.cleanup();
    }
  });

  it("handles undo and redo keyboard shortcuts outside editable inputs", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const harness = renderIntoDom(createActiveProject(createDocumentWithScene()), {
      historyState: {
        canRedo: true,
        canUndo: true,
        redoDepth: 1,
        undoDepth: 2
      },
      onRedo,
      onUndo
    });

    try {
      const zoomInput = harness.container.querySelector(
        'input[aria-label="Zoom percentage"]'
      ) as HTMLInputElement;

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            key: "z"
          })
        );
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            key: "y"
          })
        );
      });

      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onRedo).toHaveBeenCalledTimes(1);

      act(() => {
        zoomInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            key: "z"
          })
        );
        zoomInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            ctrlKey: true,
            key: "y"
          })
        );
      });

      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(onRedo).toHaveBeenCalledTimes(1);
    } finally {
      harness.cleanup();
    }
  });
});
