import { describe, expect, it } from "vitest";

import {
  applyCommands,
  createEmptyDocument,
  inspectDesignSystem,
  inspectDocument,
  inspectDocumentSummary,
  inspectNode,
  inspectNodeForInspector,
  inspectRootTree,
  resolveComputedLayoutRootIds,
  inspectSceneForInspector,
  inspectScenes,
  inspectSelection,
  inspectSubtree,
  type FrameNode,
  type RendererDocument,
  type TextNode
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
      },
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

  result.document.assets.hero_image = {
    id: "hero_image",
    kind: "image",
    mime_type: "image/png",
    source: {
      data_uri: "data:image/png;base64,AAAA",
      kind: "data_uri"
    },
    width: 320,
    height: 180
  };
  const sceneNode = result.document.nodes.scene_home as FrameNode;
  const titleNode = result.document.nodes.title_1 as TextNode;

  sceneNode.authoring.style_bindings.paint = "card";
  sceneNode.render_style.backgroundColor = "#ffffff";
  sceneNode.render_style.backgroundImage = "url(asset://hero_image)";
  titleNode.authoring.local_values["node.typography.font_size"] = 32;
  titleNode.authoring.variable_bindings["node.text.color"] = "color_text";
  titleNode.render_style.fontSize = 32;
  titleNode.render_style.color = "#111111";
  titleNode.computed_layout = {
    height: 38,
    width: 96,
    x: 72,
    y: 108
  };

  return result.document;
}

describe("queries", () => {
  it("inspects the normalized document summary and design system", async () => {
    const document = await createFixtureDocument();

    expect(inspectDocument(document)).toEqual({
      asset_count: 1,
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
      variable_count: 2
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
            computed_layout: {
              height: 38,
              width: 96,
              x: 72,
              y: 108
            },
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
          computed_layout: {
            height: 38,
            width: 96,
            x: 72,
            y: 108
          },
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

  it("resolves conservative computed-layout refresh roots", async () => {
    const document = await createFixtureDocument();

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
      name: "Loose Rectangle",
      parent_id: null,
      render_style: {
        height: 120,
        left: 480,
        top: 120,
        width: 180
      },
      scene_id: null
    };

    expect(resolveComputedLayoutRootIds(document, ["title_1", "rect_loose", "missing_node"])).toEqual([
      "scene_home",
      "rect_loose"
    ]);
  });

  it("builds semantic-first inspector data for documents, scenes, and nodes", async () => {
    const document = await createFixtureDocument();

    expect(inspectDocumentSummary(document)).toMatchObject({
      asset_count: 1,
      canvas_background_color: "#faf7f0",
      loose_top_level_node_count: 0,
      scene_count: 1
    });
    expect(inspectDocumentSummary(document).canvas_semantic_slots).toEqual([
      expect.objectContaining({
        render_field: "background_color",
        render_value: "#faf7f0",
        resolved: expect.objectContaining({
          source_kind: "local",
          value: "#faf7f0"
        }),
        slot: "canvas.background_color"
      })
    ]);

    expect(inspectNodeForInspector(document, "title_1")).toMatchObject({
      ancestor_path: [
        {
          id: "scene_home",
          kind: "frame",
          name: "Home"
        }
      ],
      child_count: 0,
      computed_layout: {
        height: 38,
        width: 96,
        x: 72,
        y: 108
      },
      id: "title_1",
      scene_name: "Home",
      semantic_slots: expect.arrayContaining([
        expect.objectContaining({
          local_value: 32,
          render_key: "fontSize",
          render_value: 32,
          resolved: expect.objectContaining({
            source_kind: "local",
            value: 32
          }),
          slot: "node.typography.font_size"
        }),
        expect.objectContaining({
          render_key: "color",
          render_value: "#111111",
          resolved: expect.objectContaining({
            source_kind: "variable",
            value: "#111111",
            variable_id: "color_text"
          }),
          slot: "node.text.color",
          variable_id: "color_text"
        })
      ]),
      text_content: "Hello"
    });

    expect(inspectSceneForInspector(document, "scene_home")).toMatchObject({
      child_count: 1,
      frame_node: expect.objectContaining({
        background_asset: expect.objectContaining({
          asset_id: "hero_image",
          source_kind: "data_uri"
        }),
        is_scene_root: true,
        style_bindings: {
          paint: "card"
        }
      }),
      id: "scene_home",
      name: "Home"
    });

    expect(inspectSelection(document, null)).toMatchObject({
      kind: "document"
    });
    expect(inspectSelection(document, "scene_home")).toMatchObject({
      kind: "scene",
      scene: expect.objectContaining({
        id: "scene_home",
        name: "Home"
      })
    });
    expect(inspectSelection(document, "title_1")).toMatchObject({
      kind: "node",
      node: expect.objectContaining({
        id: "title_1",
        kind: "text"
      })
    });
  });
});
