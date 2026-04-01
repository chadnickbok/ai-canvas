import { describe, expect, it } from "vitest";

import {
  applyCommands,
  createEmptyDocument,
  inspectDesignSystem,
  inspectDocument,
  inspectNode,
  inspectRootTree,
  inspectScenes,
  inspectSubtree,
  type RendererDocument
} from "../src";

async function createFixtureDocument(): Promise<RendererDocument> {
  const document = createEmptyDocument({
    documentId: "doc_queries",
    name: "Query Fixture"
  });

  document.canvas.authoring.local_values["canvas.background_color"] = "#faf7f0";
  document.canvas.background_color = "#faf7f0";
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
      color_surface: {
        collection_id: "tokens",
        group_path: [],
        id: "color_surface",
        kind: "color",
        name: "Surface",
        scopes: ["node.paint.background_color"],
        values_by_mode: {
          base: {
            kind: "value",
            value: "#ffffff"
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

  const result = await applyCommands(
    document,
    {
      base_revision: 1,
      commands: [
        {
          type: "create_scene",
          scene: {
            height: 844,
            id: "scene_home",
            left: 40,
            name: "Home",
            top: 60,
            width: 390
          }
        },
        {
          type: "create_node",
          node: {
            id: "title_1",
            kind: "text",
            name: "Title",
            text: {
              content: "Hello"
            }
          },
          parent: {
            parent_id: "scene_home"
          }
        }
      ],
      document_id: document.document_id
    },
    {
      currentRevision: 1,
      measurementSurfaceAvailable: true,
      refreshComputedLayout: ({ document: refreshedDocument }) => refreshedDocument
    }
  );

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.document;
}

describe("queries", () => {
  it("inspects the normalized document summary and design system", async () => {
    const document = await createFixtureDocument();

    expect(inspectDocument(document)).toEqual({
      asset_count: 0,
      document_id: "doc_queries",
      name: "Query Fixture",
      node_count: 2,
      page_name: "Page 1",
      paint_style_count: 1,
      root_child_ids: ["scene_home"],
      root_id: "canvas_root",
      scene_count: 1,
      text_style_count: 0,
      variable_collection_count: 1,
      variable_count: 1
    });

    expect(inspectDesignSystem(document)).toMatchObject({
      canvas: {
        background_color: "#faf7f0"
      },
      styles: {
        paint: {
          card: {
            name: "Card"
          }
        }
      },
      variables: {
        collections: {
          tokens: {
            name: "Tokens"
          }
        }
      }
    });
  });

  it("inspects root trees, subtrees, nodes, and scenes", async () => {
    const document = await createFixtureDocument();

    expect(inspectRootTree(document)).toEqual([
      {
        child_ids: ["title_1"],
        children: [
          {
            child_ids: [],
            children: [],
            id: "title_1",
            is_locked: false,
            is_visible: true,
            kind: "text",
            name: "Title",
            parent_id: "scene_home",
            scene_id: "scene_home"
          }
        ],
        id: "scene_home",
        is_locked: false,
        is_visible: true,
        kind: "frame",
        name: "Home",
        parent_id: null,
        scene_id: "scene_home"
      }
    ]);

    expect(inspectSubtree(document, "scene_home")).toEqual({
      child_ids: ["title_1"],
      children: [
        {
          child_ids: [],
          children: [],
          id: "title_1",
          is_locked: false,
          is_visible: true,
          kind: "text",
          name: "Title",
          parent_id: "scene_home",
          scene_id: "scene_home"
        }
      ],
      id: "scene_home",
      is_locked: false,
      is_visible: true,
      kind: "frame",
      name: "Home",
      parent_id: null,
      scene_id: "scene_home"
    });

    expect(inspectNode(document, "title_1")).toMatchObject({
      id: "title_1",
      kind: "text",
      name: "Title"
    });

    expect(inspectScenes(document)).toEqual([
      {
        child_ids: ["title_1"],
        frame: expect.objectContaining({
          child_ids: ["title_1"],
          id: "scene_home",
          kind: "frame"
        }),
        scene: {
          child_count: 1,
          frame_node_id: "scene_home",
          id: "scene_home",
          name: "Home",
          scene_metadata: {
            tags: []
          }
        }
      }
    ]);
  });
});
