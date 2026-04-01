import { describe, expect, it } from "vitest";

import { CANVAS_ROOT_ID, createEmptyDocument } from "../src";

describe("createEmptyDocument", () => {
  it("creates the canonical blank AI Canvas document", () => {
    expect(
      createEmptyDocument({
        createdAt: "2026-03-27T08:00:00.000Z",
        documentId: "doc_fixture",
        name: "Fixture Project"
      })
    ).toEqual({
      assets: {},
      canvas: {
        authoring: {
          local_values: {},
          variable_bindings: {}
        },
        extent_mode: "infinite"
      },
      document_id: "doc_fixture",
      name: "Fixture Project",
      nodes: {},
      page_name: "Page 1",
      render_canon: "browser-css",
      root: {
        child_ids: [],
        id: CANVAS_ROOT_ID
      },
      scenes: {},
      schema_version: 1,
      source: {
        created_at: "2026-03-27T08:00:00.000Z",
        kind: "ai-canvas"
      },
      styles: {
        paint: {},
        text: {}
      },
      variables: {
        collections: {}
      }
    });
  });
});
