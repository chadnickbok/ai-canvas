import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";
import type { RendererDocument } from "@ai-canvas/document-core";

import {
  hashAssetBytes,
  resolveContentAddressedAssetRelativePath
} from "./assetStorage.js";
import { ProjectStore } from "./projectStore.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((entry) => rm(entry, { force: true, recursive: true })));
});

async function createTempStore(prefix: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupPaths.push(tempDir);

  return {
    dbPath: path.join(tempDir, "app.db"),
    store: new ProjectStore(path.join(tempDir, "app.db")),
    tempDir
  };
}

function cloneDocument(document: RendererDocument): RendererDocument {
  return structuredClone(document);
}

describe("ProjectStore asset persistence", () => {
  it("persists asset_store metadata outside current_document_json and hydrates it on reload", async () => {
    const { dbPath, store, tempDir } = await createTempStore("ai-canvas-store-assets-");
    const created = store.createProject("Asset Catalog Project");
    const bytes = Buffer.from("hero-image");
    const contentHash = hashAssetBytes(bytes);
    const storedAssetPath = path.join(
      tempDir,
      "assets",
      resolveContentAddressedAssetRelativePath(contentHash)
    );

    await mkdir(path.dirname(storedAssetPath), { recursive: true });
    await writeFile(storedAssetPath, bytes);

    const nextDocument = cloneDocument(created.document);
    nextDocument.assets.hero = {
      id: "hero",
      kind: "image",
      mime_type: "image/png",
      source: {
        kind: "asset_store",
        content_hash: contentHash
      }
    };

    const saved = store.saveProjectDocument(created.project.id, nextDocument, created.revision);

    expect(saved.ok).toBe(true);

    const database = new DatabaseSync(dbPath);
    const row = database
      .prepare("SELECT current_document_json FROM projects WHERE id = ?")
      .get(created.project.id) as { current_document_json: string } | undefined;
    database.close();

    expect(row).toBeDefined();
    expect(JSON.parse(row!.current_document_json).assets).toEqual({});

    store.close();

    const reopenedStore = new ProjectStore(dbPath);
    const reopened = reopenedStore.getProject(created.project.id);

    expect(reopened).not.toBeNull();
    expect(reopened?.document.assets.hero).toMatchObject({
      id: "hero",
      source: {
        kind: "asset_store",
        content_hash: contentHash
      }
    });
    expect(reopened?.resolved_assets.hero?.url).toBe(
      `ai-canvas-asset://project/${encodeURIComponent(created.project.id)}/${encodeURIComponent("hero")}?content_hash=${encodeURIComponent(contentHash)}`
    );
    expect(reopenedStore.resolveAssetFilePath(created.project.id, "hero")).toBe(storedAssetPath);

    reopenedStore.close();
  });

  it("migrates embedded assets into the disk-backed asset store and rewrites history snapshots", async () => {
    const { dbPath, store } = await createTempStore("ai-canvas-store-migrate-");
    const created = store.createProject("Legacy Embedded Project");
    const nextDocument = cloneDocument(created.document);

    nextDocument.assets.hero = {
      id: "hero",
      kind: "image",
      mime_type: "image/png",
      source: {
        kind: "base64",
        base64: Buffer.from("legacy-hero").toString("base64")
      }
    };

    const saved = store.saveProjectDocument(created.project.id, nextDocument, created.revision, {
      redo: [],
      undo: [
        {
          committed_at: "2026-04-06T00:00:00.000Z",
          document: cloneDocument(nextDocument),
          source: "ui",
          source_revision: created.revision
        }
      ]
    });

    expect(saved.ok).toBe(true);

    const report = store.migrateEmbeddedAssets();

    expect(report.migrated_asset_count).toBe(1);
    expect(report.unresolved_asset_count).toBe(0);
    expect(report.projects).toEqual([
      {
        migrated_asset_ids: ["hero"],
        project_id: created.project.id,
        reused_content_hashes: [hashAssetBytes(Buffer.from("legacy-hero"))],
        unresolved_asset_ids: []
      }
    ]);

    store.close();

    const reopenedStore = new ProjectStore(dbPath);
    const reopened = reopenedStore.getProject(created.project.id);

    expect(reopened?.document.assets.hero.source.kind).toBe("asset_store");

    const history = reopenedStore.getProjectHistory(created.project.id);
    expect(history.undo[0]?.document.assets.hero.source.kind).toBe("asset_store");
    expect(reopenedStore.resolveAssetFilePath(created.project.id, "hero")).not.toBeNull();

    reopenedStore.close();
  });
});
