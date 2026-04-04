import { createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEmptyDocument,
  type RendererDocument
} from "@ai-canvas/document-core";

import {
  DocumentRenderer,
  EditorWorkspaceSurface,
  resolveMeasurementRootIds,
  type RendererMeasurementHandle,
  type ResolvedAssetsById
} from "../src/index.js";

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

function createEmptyAuthoring() {
  return {
    local_values: {},
    style_bindings: {},
    variable_bindings: {}
  };
}

function createFixtureDocument(): RendererDocument {
  const document = createEmptyDocument({
    documentId: "doc_renderer_fixture",
    name: "Renderer Fixture"
  });

  document.canvas.background_color = "#f5f5f5";
  document.root.child_ids = ["scene_home", "rect_loose", "primitive_loose"];
  document.assets.asset_hero = {
    id: "asset_hero",
    kind: "image",
    mime_type: "image/png",
    source: {
      data_uri: "data:image/png;base64,AAAA",
      kind: "data_uri"
    }
  };
  document.scenes.scene_home = {
    child_count: 3,
    frame_node_id: "scene_home",
    id: "scene_home",
    name: "Home",
    scene_metadata: {
      tags: []
    }
  };
  document.nodes.scene_home = {
    authoring: createEmptyAuthoring(),
    child_ids: ["card_1", "title_1", "icon_svg"],
    id: "scene_home",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Home",
    parent_id: null,
    render_style: {
      backgroundColor: "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      height: 844,
      left: 40,
      overflow: "hidden",
      paddingLeft: 24,
      paddingTop: 24,
      top: 60,
      width: 390
    },
    scene_id: "scene_home"
  };
  document.nodes.card_1 = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "card_1",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Card",
    parent_id: "scene_home",
    render_style: {
      backgroundImage: "url(asset://asset_hero)",
      borderRadius: 20,
      height: 120,
      opacity: 0.9,
      width: "50%"
    },
    scene_id: "scene_home"
  };
  document.nodes.title_1 = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "title_1",
    is_locked: false,
    is_visible: true,
    kind: "text",
    name: "Title",
    parent_id: "scene_home",
    render_style: {
      color: "#111111",
      fontFamily: "IBM Plex Sans",
      fontSize: 32,
      fontWeight: 600,
      lineHeight: "40px",
      maxWidth: 320,
      whiteSpace: "pre-wrap"
    },
    scene_id: "scene_home",
    text: {
      content: "Hello world"
    }
  };
  document.nodes.icon_svg = {
    authoring: createEmptyAuthoring(),
    child_ids: ["circle_1", "path_1"],
    id: "icon_svg",
    is_locked: false,
    is_visible: true,
    kind: "svg",
    name: "Icon",
    parent_id: "scene_home",
    render_style: {
      height: 24,
      width: 24
    },
    scene_id: "scene_home",
    svg: {
      definitions: [
        {
          kind: "linearGradient",
          markup: '<linearGradient id="hero-gradient"></linearGradient><script>alert(1)</script>'
        }
      ],
      raw_root_attributes: {
        "data-safe": "yes",
        onload: "alert(1)"
      },
      view_box: "0 0 24 24"
    }
  };
  document.nodes.circle_1 = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "circle_1",
    is_locked: false,
    is_visible: true,
    kind: "svg-visual-element",
    name: "Circle",
    parent_id: "icon_svg",
    render_style: {},
    scene_id: "scene_home",
    svg_primitive: {
      attributes: {
        cx: 12,
        cy: 12,
        fill: "#e5e5e5",
        r: 10
      },
      element_name: "circle",
      order: 2
    }
  };
  document.nodes.path_1 = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "path_1",
    is_locked: false,
    is_visible: true,
    kind: "svg-visual-element",
    name: "Path",
    parent_id: "icon_svg",
    render_style: {},
    scene_id: "scene_home",
    svg_primitive: {
      attributes: {
        d: "M4 12 L10 18 L20 6",
        fill: "none",
        stroke: "#111111",
        "stroke-width": 2
      },
      element_name: "path",
      order: 1
    }
  };
  document.nodes.rect_loose = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "rect_loose",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Loose Card",
    parent_id: null,
    render_style: {
      backgroundColor: "#e5e5e5",
      backgroundImage: "url(asset://missing_asset)",
      height: 120,
      left: 480,
      top: 120,
      width: 180
    },
    scene_id: null
  };
  document.nodes.primitive_loose = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "primitive_loose",
    is_locked: false,
    is_visible: true,
    kind: "svg-visual-element",
    name: "Detached Primitive",
    parent_id: null,
    render_style: {
      height: 32,
      left: 720,
      top: 180,
      width: 32
    },
    scene_id: null,
    svg_primitive: {
      attributes: {
        fill: "#111111",
        r: 16
      },
      element_name: "circle",
      order: 0
    }
  };

  return document;
}

function renderIntoDom(node: ReactNode): RenderHarness {
  const container = document.createElement("div");
  container.style.height = "1200px";
  container.style.width = "1600px";
  document.body.append(container);

  const root = createRoot(container);

  act(() => {
    root.render(node);
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

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DocumentRenderer", () => {
  it("renders scenes and loose top-level nodes in root order and resolves asset-backed backgrounds", () => {
    const document = createFixtureDocument();
    const resolvedAssetsById: ResolvedAssetsById = {
      asset_hero: {
        url: "https://cdn.example.test/hero.png"
      }
    };
    const harness = renderIntoDom(
      <DocumentRenderer
        document={document}
        documentRevision={1}
        resolvedAssetsById={resolvedAssetsById}
      />
    );

    try {
      const rendererRoot = harness.container.querySelector('[data-renderer-root="true"]');
      const rootChildIds = [...(rendererRoot?.children ?? [])].map((child) =>
        child.getAttribute("data-node-id")
      );
      const sceneFrame = harness.container.querySelector('[data-node-id="scene_home"]') as HTMLElement;
      const card = harness.container.querySelector('[data-node-id="card_1"]') as HTMLElement;
      const title = harness.container.querySelector('[data-node-id="title_1"]');
      const looseRectangle = harness.container.querySelector(
        '[data-node-id="rect_loose"]'
      ) as HTMLElement;
      const iconSvg = harness.container.querySelector('[data-node-id="icon_svg"]');
      const svgChildIds = [...(iconSvg?.children ?? [])]
        .filter((child) => child.tagName.toLowerCase() !== "defs")
        .map((child) => child.getAttribute("data-node-id"));

      expect(rootChildIds).toEqual(["scene_home", "rect_loose", "primitive_loose"]);
      expect(sceneFrame.style.position).toBe("absolute");
      expect(sceneFrame.style.left).toBe("40px");
      expect(card.style.backgroundImage).toContain("https://cdn.example.test/hero.png");
      expect(card.style.width).toBe("50%");
      expect(title?.textContent).toBe("Hello world");
      expect(looseRectangle.style.backgroundImage).toBe("none");
      expect(svgChildIds).toEqual(["path_1", "circle_1"]);
    } finally {
      harness.cleanup();
    }
  });

  it("sanitizes svg payloads and renders a degraded fallback for detached primitives", () => {
    const document = createFixtureDocument();
    const harness = renderIntoDom(
      <DocumentRenderer document={document} documentRevision={1} resolvedAssetsById={{}} />
    );

    try {
      const iconSvg = harness.container.querySelector('[data-node-id="icon_svg"]') as SVGElement;
      const defs = iconSvg.querySelector("defs");
      const detachedPrimitiveFallback = harness.container.querySelector(
        '[data-node-id="primitive_loose"][data-render-fallback="svg-primitive"]'
      ) as HTMLElement;

      expect(iconSvg.getAttribute("onload")).toBeNull();
      expect(iconSvg.getAttribute("data-safe")).toBe("yes");
      expect(defs?.innerHTML).not.toContain("<script");
      expect(detachedPrimitiveFallback.textContent).toContain("svg");
      expect(detachedPrimitiveFallback.style.position).toBe("absolute");
    } finally {
      harness.cleanup();
    }
  });

  it("treats numeric text line heights as pixel values", () => {
    const document = createFixtureDocument();
    document.nodes.title_1.render_style.lineHeight = 32;

    const harness = renderIntoDom(
      <DocumentRenderer document={document} documentRevision={1} resolvedAssetsById={{}} />
    );

    try {
      const title = harness.container.querySelector('[data-node-id="title_1"]') as HTMLElement;

      expect(title.style.lineHeight).toBe("32px");
    } finally {
      harness.cleanup();
    }
  });
});

describe("measurement helpers", () => {
  it("resolves containing scene roots and loose top-level roots", () => {
    const document = createFixtureDocument();

    expect(
      resolveMeasurementRootIds(document, ["title_1", "rect_loose", "circle_1", "primitive_loose"])
    ).toEqual(["scene_home", "rect_loose", "primitive_loose"]);
  });

  it("measures rendered subtrees in canvas space under zoom without mutating authored inputs", () => {
    const document = createFixtureDocument();
    const rendererRef = createRef<RendererMeasurementHandle>();
    const harness = renderIntoDom(
      <EditorWorkspaceSurface
        document={document}
        ref={rendererRef}
        resolvedAssetsById={{}}
        viewport={{
          panX: 100,
          panY: 50,
          zoom: 2
        }}
      />
    );

    try {
      const rendererRoot = rendererRef.current?.getRootElement();
      const sceneFrame = rendererRef.current?.getNodeElement("scene_home");
      const card = rendererRef.current?.getNodeElement("card_1");
      const title = rendererRef.current?.getNodeElement("title_1");
      const iconSvg = rendererRef.current?.getNodeElement("icon_svg");
      const path = rendererRef.current?.getNodeElement("path_1");
      const circle = rendererRef.current?.getNodeElement("circle_1");

      expect(rendererRoot).not.toBeNull();
      expect(sceneFrame).not.toBeNull();
      expect(card).not.toBeNull();
      expect(title).not.toBeNull();
      expect(iconSvg).not.toBeNull();
      expect(path).not.toBeNull();
      expect(circle).not.toBeNull();

      assignBoundingRect(rendererRoot!, 110, 70, 1600, 1200);
      assignBoundingRect(sceneFrame!, 190, 190, 780, 1688);
      assignBoundingRect(card!, 238, 238, 390, 240);
      assignBoundingRect(title!, 238, 274, 320, 48);
      assignBoundingRect(iconSvg!, 238, 354, 48, 48);
      assignBoundingRect(path!, 238, 354, 48, 48);
      assignBoundingRect(circle!, 238, 354, 48, 48);

      const measuredLayouts = rendererRef.current?.measureSubtrees({
        rootIds: ["scene_home"]
      });

      expect(measuredLayouts).toEqual({
        card_1: {
          height: 120,
          width: 195,
          x: 64,
          y: 84
        },
        circle_1: {
          height: 24,
          width: 24,
          x: 64,
          y: 142
        },
        icon_svg: {
          height: 24,
          width: 24,
          x: 64,
          y: 142
        },
        path_1: {
          height: 24,
          width: 24,
          x: 64,
          y: 142
        },
        scene_home: {
          height: 844,
          width: 390,
          x: 40,
          y: 60
        },
        title_1: {
          height: 24,
          width: 160,
          x: 64,
          y: 102
        }
      });
      expect(document.nodes.card_1.render_style.width).toBe("50%");
      expect(document.nodes.title_1.render_style.maxWidth).toBe(320);
    } finally {
      harness.cleanup();
    }
  });
});
