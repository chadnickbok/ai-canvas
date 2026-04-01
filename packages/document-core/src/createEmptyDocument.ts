import {
  CANVAS_ROOT_ID,
  DEFAULT_RENDER_CANON,
  DEFAULT_SCHEMA_VERSION
} from "./constants.js";
import type { RendererDocument } from "./types.js";

export type CreateEmptyDocumentInput = {
  documentId: string;
  name: string;
  createdAt?: string;
};

export function createEmptyDocument(input: CreateEmptyDocumentInput): RendererDocument {
  return {
    schema_version: DEFAULT_SCHEMA_VERSION,
    render_canon: DEFAULT_RENDER_CANON,
    document_id: input.documentId,
    name: input.name,
    page_name: "Page 1",
    source: {
      kind: "ai-canvas",
      created_at: input.createdAt
    },
    canvas: {
      extent_mode: "infinite",
      authoring: {
        local_values: {},
        variable_bindings: {}
      }
    },
    root: {
      id: CANVAS_ROOT_ID,
      child_ids: []
    },
    scenes: {},
    nodes: {},
    assets: {},
    variables: {
      collections: {}
    },
    styles: {
      paint: {},
      text: {}
    }
  };
}
