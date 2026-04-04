import { describe, expect, it } from "vitest";

import {
  createEmptyDocument,
  finalizeCommittedDocument,
  type RendererDocument
} from "../src";

function createDocumentWithScene(documentId = "doc_finalize"): RendererDocument {
  const document = createEmptyDocument({
    documentId,
    name: "Finalize Tests"
  });

  document.root.child_ids = ["scene_home"];
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
    authoring: {
      local_values: {},
      style_bindings: {},
      variable_bindings: {}
    },
    child_ids: ["rect_hero"],
    id: "scene_home",
    is_locked: false,
    is_visible: true,
    kind: "frame",
    name: "Home",
    parent_id: null,
    render_style: {
      height: 844,
      left: 80,
      top: 60,
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
      backgroundColor: "#e5e5e5",
      height: 180,
      left: 104,
      top: 120,
      width: 320
    },
    scene_id: "scene_home"
  };

  return document;
}

describe("finalizeCommittedDocument", () => {
  it("normalizes the snapshot and refreshes layout for the full document", async () => {
    const document = createDocumentWithScene();

    const finalizedDocument = await finalizeCommittedDocument(document, {
      currentRevision: 2,
      measurementSurfaceAvailable: true,
      refreshComputedLayout: async ({
        changed_asset_ids,
        changed_node_ids,
        changed_scene_ids,
        changed_style_ids,
        changed_variable_ids,
        document: refreshedDocument
      }) => {
        expect(changed_asset_ids).toEqual([]);
        expect(changed_node_ids).toEqual(["rect_hero", "scene_home"]);
        expect(changed_scene_ids).toEqual(["scene_home"]);
        expect(changed_style_ids).toEqual(["paint", "text"]);
        expect(changed_variable_ids).toEqual(["collections"]);

        const updatedDocument = structuredClone(refreshedDocument);
        updatedDocument.nodes.scene_home.computed_layout = {
          height: 844,
          width: 390,
          x: 80,
          y: 60
        };
        updatedDocument.nodes.rect_hero.computed_layout = {
          height: 180,
          width: 320,
          x: 104,
          y: 120
        };

        return updatedDocument;
      }
    });

    expect(finalizedDocument.scenes.scene_home.child_count).toBe(1);
    expect(finalizedDocument.nodes.scene_home.computed_layout).toEqual({
      height: 844,
      width: 390,
      x: 80,
      y: 60
    });
    expect(finalizedDocument.nodes.rect_hero.computed_layout).toEqual({
      height: 180,
      width: 320,
      x: 104,
      y: 120
    });
  });

  it("throws a measurement-surface error when commit finalization cannot write", async () => {
    const document = createDocumentWithScene();

    await expect(
      finalizeCommittedDocument(document, {
        currentRevision: 7,
        measurementSurfaceAvailable: false
      })
    ).rejects.toMatchObject({
      code: "measurement_surface_unavailable",
      revision: 7
    });
  });
});
