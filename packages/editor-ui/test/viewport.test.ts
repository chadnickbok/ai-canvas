import { describe, expect, it } from "vitest";

import { createEmptyDocument, type RendererDocument } from "@ai-canvas/document-core";

import {
  createViewportForContentBounds,
  resolveTopLevelContentBounds
} from "../src/rendering/viewport.js";

function createEmptyAuthoring() {
  return {
    local_values: {},
    style_bindings: {},
    variable_bindings: {}
  };
}

function createBoundsFixtureDocument(): RendererDocument {
  const document = createEmptyDocument({
    documentId: "doc_viewport_fixture",
    name: "Viewport Fixture"
  });

  document.root.child_ids = ["scene_home", "rect_loose", "rect_hidden", "rect_measured"];
  document.scenes.scene_home = {
    child_count: 0,
    frame_node_id: "scene_home",
    id: "scene_home",
    name: "Home",
    scene_metadata: {
      tags: []
    }
  };
  document.nodes.scene_home = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "scene_home",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Home",
    parent_id: null,
    render_style: {
      height: 844,
      left: 40,
      top: 60,
      width: 390
    },
    scene_id: "scene_home"
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
      left: "640px",
      top: 140,
      width: 160
    },
    scene_id: null
  };
  document.nodes.rect_hidden = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    id: "rect_hidden",
    is_locked: false,
    is_visible: false,
    kind: "rectangle",
    name: "Hidden",
    parent_id: null,
    render_style: {
      height: 400,
      left: -400,
      top: -400,
      width: 400
    },
    scene_id: null
  };
  document.nodes.rect_measured = {
    authoring: createEmptyAuthoring(),
    child_ids: [],
    computed_layout: {
      height: 90,
      width: 60,
      x: -120,
      y: 200
    },
    id: "rect_measured",
    is_locked: false,
    is_visible: true,
    kind: "rectangle",
    name: "Measured",
    parent_id: null,
    render_style: {
      width: "50%"
    },
    scene_id: null
  };

  return document;
}

describe("viewport helpers", () => {
  it("unions visible top-level scene and loose-node bounds using computed-layout fallback when needed", () => {
    const document = createBoundsFixtureDocument();

    expect(resolveTopLevelContentBounds(document)).toEqual({
      height: 844,
      width: 920,
      x: -120,
      y: 60
    });
  });

  it("fits large content into the viewport with padding and without exceeding 100%", () => {
    const viewport = createViewportForContentBounds(
      {
        height: 2048,
        width: 2048,
        x: 0,
        y: 0
      },
      {
        height: 1024,
        width: 1024
      }
    );

    expect(viewport.zoom).toBeCloseTo(1024 / 2176, 6);
    expect(viewport.panX).toBeCloseTo(30.117647, 6);
    expect(viewport.panY).toBeCloseTo(30.117647, 6);
  });

  it("centers smaller content at 100% instead of zooming in past actual size", () => {
    const viewport = createViewportForContentBounds(
      {
        height: 844,
        width: 390,
        x: 80,
        y: 80
      },
      {
        height: 1024,
        width: 1024
      }
    );

    expect(viewport).toEqual({
      panX: 237,
      panY: 10,
      zoom: 1
    });
  });
});
