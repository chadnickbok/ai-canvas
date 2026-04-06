import { describe, expect, it } from "vitest";

import { createEmptyDocument, type RendererDocument } from "@ai-canvas/document-core";

import {
  isNodeDirectlyManipulable,
  parseFiniteCanvasLength,
  resolveFramePaddingInsets,
  resolveNodeCanvasRectWithSource
} from "../src/interaction/geometry.js";
import type { RendererMeasurementHandle } from "../src/rendering/types.js";

function createEmptyAuthoring() {
  return {
    local_values: {},
    style_bindings: {},
    variable_bindings: {}
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

function createMeasurementHandle(input: {
  documentRevision: number;
  nodeRects: Record<string, DOMRect>;
  rootRect: DOMRect;
}): RendererMeasurementHandle {
  const rootElement = document.createElement("div");
  const nodeElementsById = new Map<string, Element>();

  assignBoundingRect(
    rootElement,
    input.rootRect.left,
    input.rootRect.top,
    input.rootRect.width,
    input.rootRect.height
  );

  for (const [nodeId, rect] of Object.entries(input.nodeRects)) {
    const element = document.createElement("div");

    assignBoundingRect(element, rect.left, rect.top, rect.width, rect.height);
    nodeElementsById.set(nodeId, element);
  }

  return {
    getDocumentRevision: () => input.documentRevision,
    getNodeElement: (nodeId: string) => nodeElementsById.get(nodeId) ?? null,
    getRootElement: () => rootElement as HTMLDivElement,
    measureSubtrees: () => ({})
  };
}

function createGeometryFixtureDocument(): RendererDocument {
  const document = createEmptyDocument({
    documentId: "doc_geometry_fixture",
    name: "Geometry Fixture"
  });

  document.root.child_ids = ["scene_home", "rect_loose", "rect_non_pixel"];
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
    child_ids: ["rect_absolute", "rect_flow", "primitive_node"],
    id: "scene_home",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Home",
    parent_id: null,
    render_style: {
      display: "flex",
      flexDirection: "column",
      height: 844,
      left: 80,
      top: 80,
      width: 390
    },
    scene_id: "scene_home"
  };
  document.nodes.rect_absolute = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    computed_layout: {
      height: 44,
      width: 33,
      x: 11,
      y: 22
    },
    id: "rect_absolute",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Absolute Child",
    parent_id: "scene_home",
    render_style: {
      height: 4,
      left: 1,
      position: "absolute",
      top: 2,
      width: 3
    },
    scene_id: "scene_home"
  };
  document.nodes.rect_flow = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "rect_flow",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Flow Child",
    parent_id: "scene_home",
    render_style: {
      height: 180,
      width: 320
    },
    scene_id: "scene_home"
  };
  document.nodes.primitive_node = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "primitive_node",
    is_locked: false,
    is_visible: true,
    kind: "svg-visual-element",
    name: "Primitive",
    parent_id: "scene_home",
    render_style: {},
    scene_id: "scene_home",
    svg_primitive: {
      attributes: {
        r: 8
      },
      element_name: "circle",
      order: 0
    }
  };
  document.nodes.rect_loose = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "rect_loose",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Loose",
    parent_id: null,
    render_style: {
      height: 120,
      left: 520,
      top: 160,
      width: 180
    },
    scene_id: null
  };
  document.nodes.rect_non_pixel = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "rect_non_pixel",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Percent Width",
    parent_id: null,
    render_style: {
      height: 80,
      left: 20,
      top: 20,
      width: "50%"
    },
    scene_id: null
  };

  return document;
}

describe("geometry helpers", () => {
  it("parses only finite numeric canvas lengths", () => {
    expect(parseFiniteCanvasLength(12)).toBe(12);
    expect(parseFiniteCanvasLength("12")).toBe(12);
    expect(parseFiniteCanvasLength(" 12.5px ")).toBe(12.5);
    expect(parseFiniteCanvasLength("0px")).toBe(0);

    expect(parseFiniteCanvasLength(undefined)).toBeNull();
    expect(parseFiniteCanvasLength(Number.NaN)).toBeNull();
    expect(parseFiniteCanvasLength(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseFiniteCanvasLength("50%")).toBeNull();
    expect(parseFiniteCanvasLength("auto")).toBeNull();
  });

  it("prefers measured DOM rects, then computed_layout, then authored geometry", () => {
    const document = createGeometryFixtureDocument();
    const measurementHandle = createMeasurementHandle({
      documentRevision: 7,
      nodeRects: {
        rect_absolute: createDomRect(140, 80, 60, 70)
      },
      rootRect: createDomRect(100, 50, 800, 600)
    });

    expect(
      resolveNodeCanvasRectWithSource(document, "rect_absolute", measurementHandle, 2, 7)
    ).toEqual({
      rect: {
        bottom: 50,
        height: 35,
        right: 50,
        width: 30,
        x: 20,
        y: 15
      },
      source: "measured_dom"
    });

    expect(
      resolveNodeCanvasRectWithSource(document, "rect_absolute", measurementHandle, 2, 8)
    ).toEqual({
      rect: {
        bottom: 66,
        height: 44,
        right: 44,
        width: 33,
        x: 11,
        y: 22
      },
      source: "computed_layout"
    });

    expect(resolveNodeCanvasRectWithSource(document, "rect_loose", null, 1)).toEqual({
      rect: {
        bottom: 280,
        height: 120,
        right: 700,
        width: 180,
        x: 520,
        y: 160
      },
      source: "authored_render_style"
    });

    expect(resolveNodeCanvasRectWithSource(document, "rect_non_pixel", null, 1)).toBeNull();
  });

  it("resolves frame padding with individual values overriding block, inline, and shorthand inputs", () => {
    const document = createGeometryFixtureDocument();

    document.nodes.scene_home.render_style.padding = "8 12";
    document.nodes.scene_home.render_style.paddingBlock = "20 24";
    document.nodes.scene_home.render_style.paddingInline = "30 40";
    document.nodes.scene_home.render_style.paddingTop = "5px";

    expect(resolveFramePaddingInsets(document.nodes.scene_home)).toEqual({
      bottom: 24,
      left: 30,
      right: 40,
      top: 5
    });
    expect(resolveFramePaddingInsets(document.nodes.rect_loose)).toBeNull();
  });

  it("allows mutation only for directly manipulable nodes", () => {
    const document = createGeometryFixtureDocument();

    expect(isNodeDirectlyManipulable(document, document.nodes.scene_home, true)).toBe(true);
    expect(isNodeDirectlyManipulable(document, document.nodes.rect_loose, true)).toBe(true);
    expect(isNodeDirectlyManipulable(document, document.nodes.rect_absolute, true)).toBe(true);
    expect(isNodeDirectlyManipulable(document, document.nodes.rect_flow, true)).toBe(false);
    expect(isNodeDirectlyManipulable(document, document.nodes.primitive_node, true)).toBe(false);
    expect(isNodeDirectlyManipulable(document, document.nodes.rect_non_pixel, true)).toBe(false);
    expect(
      isNodeDirectlyManipulable(
        document,
        {
          ...document.nodes.rect_loose,
          is_locked: true
        },
        true
      )
    ).toBe(false);
    expect(isNodeDirectlyManipulable(document, document.nodes.rect_loose, false)).toBe(false);
  });
});
