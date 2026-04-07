#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function printUsage() {
  console.error(
    "Usage: node ./scripts/migrate-embedded-assets.mjs --db /path/to/app.db [--assets-dir /path/to/assets]"
  );
}

function parseArgs(argv) {
  let assetsDir;
  let dbPath;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--db") {
      dbPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--assets-dir") {
      assetsDir = argv[index + 1];
      index += 1;
      continue;
    }
  }

  if (!dbPath) {
    printUsage();
    process.exitCode = 1;
    return null;
  }

  return {
    assetsDir: assetsDir ?? path.join(path.dirname(dbPath), "assets"),
    dbPath
  };
}

function resolveContentAddressedAssetRelativePath(contentHash) {
  const normalizedHash = contentHash.trim().toLowerCase();
  const bucket = normalizedHash.slice(0, 2) || "__";
  return path.join("sha256", bucket, normalizedHash);
}

function hashAssetBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeDataUri(dataUri) {
  const match = dataUri.match(/^data:([^,]*?),(.*)$/s);

  if (!match) {
    return null;
  }

  const metadata = match[1];
  const rawData = match[2];
  const isBase64 = /(?:^|;)base64(?:;|$)/i.test(metadata);

  try {
    return isBase64
      ? Buffer.from(rawData, "base64")
      : Buffer.from(decodeURIComponent(rawData), "utf8");
  } catch {
    return null;
  }
}

function decodeEmbeddedAssetBytes(asset) {
  if (!asset?.source || typeof asset.source !== "object") {
    return null;
  }

  if (asset.source.kind === "base64" && typeof asset.source.base64 === "string") {
    return Buffer.from(asset.source.base64, "base64");
  }

  if (asset.source.kind === "data_uri" && typeof asset.source.data_uri === "string") {
    return decodeDataUri(asset.source.data_uri);
  }

  return null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureAssetTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_assets (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      width REAL,
      height REAL,
      metadata_json TEXT,
      source_kind TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      original_filename TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, asset_id)
    );
  `);
}

function listProjectAssetRows(database, projectId) {
  return database
    .prepare(
      `
        SELECT project_id, asset_id, kind, mime_type, width, height, metadata_json, source_kind, content_hash,
               original_filename, size_bytes, created_at, updated_at
        FROM project_assets
        WHERE project_id = ?
      `
    )
    .all(projectId);
}

function rowToAsset(row) {
  return {
    id: row.asset_id,
    kind: row.kind,
    mime_type: row.mime_type,
    ...(row.width == null ? {} : { width: row.width }),
    ...(row.height == null ? {} : { height: row.height }),
    ...(row.metadata_json == null ? {} : { metadata: JSON.parse(row.metadata_json) }),
    source: {
      kind: "asset_store",
      content_hash: row.content_hash,
      ...(row.original_filename == null ? {} : { original_filename: row.original_filename })
    }
  };
}

function mergeDocumentAssets(document, catalogAssets) {
  return {
    ...document,
    assets: {
      ...(document.assets && typeof document.assets === "object" ? document.assets : {}),
      ...catalogAssets
    }
  };
}

function rewriteEmbeddedAssets(document, assetsDir) {
  const nextDocument = clone(document);
  const migratedAssetIds = [];
  const reusedContentHashes = new Set();
  const unresolvedAssetIds = [];

  for (const [assetId, asset] of Object.entries(nextDocument.assets ?? {})) {
    if (asset?.source?.kind !== "data_uri" && asset?.source?.kind !== "base64") {
      continue;
    }

    const bytes = decodeEmbeddedAssetBytes(asset);

    if (!bytes) {
      unresolvedAssetIds.push(assetId);
      continue;
    }

    const contentHash = hashAssetBytes(bytes);
    const assetPath = path.join(assetsDir, resolveContentAddressedAssetRelativePath(contentHash));

    if (existsSync(assetPath)) {
      reusedContentHashes.add(contentHash);
    } else {
      mkdirSync(path.dirname(assetPath), { recursive: true });
      writeFileSync(assetPath, bytes);
    }

    nextDocument.assets[assetId] = {
      ...asset,
      source: {
        kind: "asset_store",
        content_hash: contentHash
      }
    };
    migratedAssetIds.push(assetId);
  }

  return {
    document: nextDocument,
    migrated_asset_ids: migratedAssetIds,
    reused_content_hashes: [...reusedContentHashes],
    unresolved_asset_ids: unresolvedAssetIds
  };
}

function stripAssetStoreAssets(document) {
  const nextDocument = clone(document);
  nextDocument.assets = Object.fromEntries(
    Object.entries(nextDocument.assets ?? {}).filter(([, asset]) => asset?.source?.kind !== "asset_store")
  );
  return nextDocument;
}

function replaceProjectAssetRows(database, projectId, document, assetsDir, updatedAt) {
  database.prepare("DELETE FROM project_assets WHERE project_id = ?").run(projectId);

  for (const asset of Object.values(document.assets ?? {})) {
    if (asset?.source?.kind !== "asset_store") {
      continue;
    }

    const assetPath = path.join(
      assetsDir,
      resolveContentAddressedAssetRelativePath(asset.source.content_hash)
    );

    database
      .prepare(
        `
          INSERT INTO project_assets (
            project_id,
            asset_id,
            kind,
            mime_type,
            width,
            height,
            metadata_json,
            source_kind,
            content_hash,
            original_filename,
            size_bytes,
            created_at,
            updated_at
          )
          VALUES (
            @project_id,
            @asset_id,
            @kind,
            @mime_type,
            @width,
            @height,
            @metadata_json,
            'asset_store',
            @content_hash,
            @original_filename,
            @size_bytes,
            @updated_at,
            @updated_at
          )
        `
      )
      .run({
        asset_id: asset.id,
        content_hash: asset.source.content_hash,
        height: asset.height ?? null,
        kind: asset.kind,
        metadata_json: asset.metadata ? JSON.stringify(asset.metadata) : null,
        mime_type: asset.mime_type,
        original_filename: asset.source.original_filename ?? null,
        project_id: projectId,
        size_bytes: existsSync(assetPath) ? statSync(assetPath).size : null,
        updated_at: updatedAt,
        width: asset.width ?? null
      });
  }
}

function parseHistoryEntries(serializedEntries) {
  try {
    const parsed = JSON.parse(serializedEntries);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function migrateDatabase({ assetsDir, dbPath }) {
  const database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON;");
  ensureAssetTables(database);

  const projects = database
    .prepare(
      `
        SELECT id, name, document_id, current_document_json, revision
        FROM projects
        WHERE archived_at IS NULL
        ORDER BY created_at ASC
      `
    )
    .all();
  const report = {
    migrated_asset_count: 0,
    projects: [],
    unresolved_asset_count: 0
  };

  for (const row of projects) {
    const currentDocument = mergeDocumentAssets(
      JSON.parse(row.current_document_json),
      Object.fromEntries(listProjectAssetRows(database, row.id).map((assetRow) => [assetRow.asset_id, rowToAsset(assetRow)]))
    );
    const rewrittenCurrent = rewriteEmbeddedAssets(currentDocument, assetsDir);
    const historyRow = database
      .prepare(
        `
          SELECT undo_json, redo_json
          FROM project_history
          WHERE project_id = ?
        `
      )
      .get(row.id);
    const undoEntries = historyRow ? parseHistoryEntries(historyRow.undo_json) : [];
    const redoEntries = historyRow ? parseHistoryEntries(historyRow.redo_json) : [];
    const migratedAssetIds = new Set(rewrittenCurrent.migrated_asset_ids);
    const reusedContentHashes = new Set(rewrittenCurrent.reused_content_hashes);
    const unresolvedAssetIds = new Set(rewrittenCurrent.unresolved_asset_ids);

    const rewriteHistoryStack = (stack) =>
      stack.map((entry) => {
        if (!entry || typeof entry !== "object" || !entry.document || typeof entry.document !== "object") {
          return entry;
        }

        const rewritten = rewriteEmbeddedAssets(entry.document, assetsDir);

        for (const assetId of rewritten.migrated_asset_ids) {
          migratedAssetIds.add(assetId);
        }

        for (const contentHash of rewritten.reused_content_hashes) {
          reusedContentHashes.add(contentHash);
        }

        for (const assetId of rewritten.unresolved_asset_ids) {
          unresolvedAssetIds.add(assetId);
        }

        return {
          ...entry,
          document: rewritten.document
        };
      });

    const rewrittenUndo = rewriteHistoryStack(undoEntries);
    const rewrittenRedo = rewriteHistoryStack(redoEntries);

    if (migratedAssetIds.size === 0 && unresolvedAssetIds.size === 0) {
      continue;
    }

    const updatedAt = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE;");

    try {
      database
        .prepare(
          `
            UPDATE projects
            SET current_document_json = @current_document_json,
                revision = revision + 1,
                updated_at = @updated_at
            WHERE id = @project_id AND revision = @expected_revision
          `
        )
        .run({
          current_document_json: JSON.stringify(stripAssetStoreAssets(rewrittenCurrent.document)),
          expected_revision: row.revision,
          project_id: row.id,
          updated_at: updatedAt
        });

      replaceProjectAssetRows(database, row.id, rewrittenCurrent.document, assetsDir, updatedAt);

      if (historyRow) {
        database
          .prepare(
            `
              UPDATE project_history
              SET undo_json = @undo_json,
                  redo_json = @redo_json,
                  updated_at = @updated_at
              WHERE project_id = @project_id
            `
          )
          .run({
            project_id: row.id,
            redo_json: JSON.stringify(rewrittenRedo),
            undo_json: JSON.stringify(rewrittenUndo),
            updated_at: updatedAt
          });
      }

      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }

    report.migrated_asset_count += migratedAssetIds.size;
    report.unresolved_asset_count += unresolvedAssetIds.size;
    report.projects.push({
      migrated_asset_ids: [...migratedAssetIds].sort(),
      project_id: row.id,
      reused_content_hashes: [...reusedContentHashes].sort(),
      unresolved_asset_ids: [...unresolvedAssetIds].sort()
    });
  }

  database.close();
  return report;
}

const parsedArgs = parseArgs(process.argv.slice(2));

if (parsedArgs) {
  try {
    const report = migrateDatabase(parsedArgs);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
