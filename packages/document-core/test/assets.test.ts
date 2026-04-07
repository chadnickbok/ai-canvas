import { describe, expect, it } from "vitest";

import {
  collectEmbeddedAssets,
  createEmptyDocument,
  replaceAssetSources,
  type RendererDocument
} from "../src";

function createDocumentWithAssets(): RendererDocument {
  const document = createEmptyDocument({
    documentId: "doc_assets",
    name: "Asset Helpers"
  });

  document.assets.hero = {
    id: "hero",
    kind: "image",
    mime_type: "image/png",
    source: {
      kind: "data_uri",
      data_uri: "data:image/png;base64,AAAA"
    }
  };
  document.assets.logo = {
    id: "logo",
    kind: "image",
    mime_type: "image/png",
    source: {
      kind: "base64",
      base64: "BBBB"
    }
  };
  document.assets.stored = {
    id: "stored",
    kind: "image",
    mime_type: "image/png",
    source: {
      kind: "asset_store",
      content_hash: "hash123"
    }
  };

  return document;
}

describe("asset helpers", () => {
  it("collects embedded assets without including asset_store records", () => {
    const document = createDocumentWithAssets();

    expect(collectEmbeddedAssets(document).map((asset) => asset.id)).toEqual(["hero", "logo"]);
  });

  it("replaces selected asset sources without mutating the original document", () => {
    const document = createDocumentWithAssets();
    const nextDocument = replaceAssetSources(document, {
      hero: {
        kind: "asset_store",
        content_hash: "hash_hero"
      }
    });

    expect(document.assets.hero.source).toEqual({
      kind: "data_uri",
      data_uri: "data:image/png;base64,AAAA"
    });
    expect(nextDocument.assets.hero.source).toEqual({
      kind: "asset_store",
      content_hash: "hash_hero"
    });
    expect(nextDocument.assets.logo.source).toEqual({
      kind: "base64",
      base64: "BBBB"
    });
  });
});
