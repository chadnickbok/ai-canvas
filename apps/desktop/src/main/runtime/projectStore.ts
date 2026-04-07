import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  collectEmbeddedAssets,
  createEmptyDocument,
  isAssetStoreSource,
  normalizeDocument,
  replaceAssetSources,
  type AssetRecord,
  type OpaqueValue,
  type RendererDocument,
} from '@ai-canvas/document-core';
import type { ProjectSummary, ResolvedAssetsById } from '@ai-canvas/ipc-contract';

import { AssetStorage, hashAssetBytes } from './assetStorage.js';
import { createDocumentId, createProjectId } from './ids.js';

type ProjectRow = {
  id: string;
  name: string;
  document_id: string;
  current_document_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};

type ProjectHistoryRow = {
  project_id: string;
  redo_json: string;
  undo_json: string;
};

export type StoredProject = {
  document: RendererDocument;
  project: ProjectSummary;
  resolved_assets: ResolvedAssetsById;
  revision: number;
};

export type HistoryMutationSource = 'mcp' | 'ui';

export type ProjectHistoryEntry = {
  committed_at: string;
  document: RendererDocument;
  source: HistoryMutationSource;
  source_revision: number;
};

export type ProjectHistory = {
  redo: ProjectHistoryEntry[];
  undo: ProjectHistoryEntry[];
};

export type PersistProjectDocumentResult =
  | {
      ok: true;
      project: ProjectSummary;
      revision: number;
    }
  | {
      ok: false;
      code: 'not_found';
    }
  | {
      ok: false;
      code: 'revision_conflict';
      revision: number;
    };

const INITIAL_PROJECT_REVISION = 1;
const EMPTY_PROJECT_HISTORY: ProjectHistory = {
  redo: [],
  undo: [],
};

type TableInfoRow = {
  name: string;
};

type ProjectAssetRow = {
  asset_id: string;
  content_hash: string;
  created_at: string;
  height: number | null;
  kind: AssetRecord['kind'];
  metadata_json: string | null;
  mime_type: string;
  original_filename: string | null;
  project_id: string;
  size_bytes: number | null;
  source_kind: 'asset_store';
  updated_at: string;
  width: number | null;
};

export type EmbeddedAssetMigrationProjectReport = {
  migrated_asset_ids: string[];
  project_id: string;
  reused_content_hashes: string[];
  unresolved_asset_ids: string[];
};

export type EmbeddedAssetMigrationReport = {
  migrated_asset_count: number;
  projects: EmbeddedAssetMigrationProjectReport[];
  unresolved_asset_count: number;
};

export class ProjectStore {
  private readonly assetStorage: AssetStorage;
  private readonly database: DatabaseSync;

  constructor(
    databasePath: string,
    assetsDirectoryPath = path.join(path.dirname(databasePath), 'assets'),
  ) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.assetStorage = new AssetStorage(assetsDirectoryPath);
    this.database.exec('PRAGMA journal_mode = WAL;');
    this.database.exec('PRAGMA foreign_keys = ON;');
    this.initialize();
  }

  listProjects(): ProjectSummary[] {
    const rows = this.database
      .prepare(
        `
          SELECT id, name, document_id, current_document_json, revision, created_at, updated_at, last_opened_at
          FROM projects
          WHERE archived_at IS NULL
          ORDER BY COALESCE(last_opened_at, updated_at) DESC, updated_at DESC
        `,
      )
      .all() as ProjectRow[];

    return rows.map((row) => this.toSummary(row));
  }

  createProject(name: string): StoredProject {
    const now = new Date().toISOString();
    const projectId = createProjectId();
    const documentId = createDocumentId();
    const document = createEmptyDocument({
      documentId,
      name,
      createdAt: now,
    });

    this.database.exec('BEGIN IMMEDIATE;');

    try {
      this.database
        .prepare(
          `
            INSERT INTO projects (
              id,
              name,
              document_id,
              schema_version,
              current_document_json,
              revision,
              created_at,
              updated_at,
              last_opened_at,
              archived_at,
              source_kind,
              source_metadata_json
            )
            VALUES (
              @id,
              @name,
              @document_id,
              1,
              @current_document_json,
              @revision,
              @created_at,
              @updated_at,
              @last_opened_at,
              NULL,
              'new',
              NULL
            )
          `,
        )
        .run({
          created_at: now,
          current_document_json: JSON.stringify(document),
          document_id: documentId,
          id: projectId,
          last_opened_at: now,
          name,
          revision: INITIAL_PROJECT_REVISION,
          updated_at: now,
        });

      this.saveHistoryRow(projectId, EMPTY_PROJECT_HISTORY, now);
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }

    const row = this.getRow(projectId);

    if (!row) {
      throw new Error(
        `Project ${projectId} was created but could not be reloaded`,
      );
    }

    return {
      document,
      project: this.toSummary(row),
      resolved_assets: this.assetStorage.resolveDocumentAssets(projectId, document.assets),
      revision: row.revision,
    };
  }

  getProject(projectId: string): StoredProject | null {
    const row = this.getRow(projectId);

    if (!row) {
      return null;
    }

    const rawDocument = JSON.parse(row.current_document_json) as RendererDocument;
    const document = normalizeDocument(this.hydratePersistedDocument(projectId, rawDocument), {
      fallbackDocumentId: row.document_id,
      fallbackName: row.name,
    });

    return {
      document,
      project: this.toSummary(row),
      resolved_assets: this.assetStorage.resolveDocumentAssets(projectId, document.assets),
      revision: row.revision,
    };
  }

  saveProjectDocument(
    projectId: string,
    document: RendererDocument,
    expectedRevision: number,
    history?: ProjectHistory,
  ): PersistProjectDocumentResult {
    const now = new Date().toISOString();
    const catalogAssets = Object.values(document.assets).filter((asset) => isAssetStoreSource(asset.source));
    const serializedDocument = JSON.stringify(this.serializeCurrentDocument(document));
    this.database.exec('BEGIN IMMEDIATE;');

    try {
      const updateResult = this.database
        .prepare(
          `
            UPDATE projects
            SET current_document_json = @current_document_json,
                revision = revision + 1,
                updated_at = @updated_at
            WHERE id = @project_id AND archived_at IS NULL AND revision = @expected_revision
          `,
        )
        .run({
          current_document_json: serializedDocument,
          expected_revision: expectedRevision,
          project_id: projectId,
          updated_at: now,
        });

      if (updateResult.changes === 0) {
        this.database.exec('ROLLBACK;');
        const currentRow = this.getRow(projectId);

        if (!currentRow) {
          return {
            code: 'not_found',
            ok: false,
          };
        }

        return {
          code: 'revision_conflict',
          ok: false,
          revision: currentRow.revision,
        };
      }

      this.replacePersistedAssetRows(projectId, catalogAssets, now);

      if (history) {
        this.saveHistoryRow(projectId, history, now);
      }
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }

    const updatedRow = this.getRow(projectId);

    if (!updatedRow) {
      return {
        code: 'not_found',
        ok: false,
      };
    }

    return {
      ok: true,
      project: this.toSummary(updatedRow),
      revision: updatedRow.revision,
    };
  }

  markOpened(projectId: string): ProjectSummary | null {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `
          UPDATE projects
          SET last_opened_at = @now, updated_at = @now
          WHERE id = @project_id AND archived_at IS NULL
        `,
      )
      .run({
        now,
        project_id: projectId,
      });

    if (result.changes === 0) {
      return null;
    }

    const row = this.getRow(projectId);

    return row ? this.toSummary(row) : null;
  }

  resolveAssetFilePath(projectId: string, assetId: string): string | null {
    const row = this.database
      .prepare(
        `
          SELECT project_id, asset_id, kind, mime_type, width, height, metadata_json, source_kind, content_hash,
                 original_filename, size_bytes, created_at, updated_at
          FROM project_assets
          WHERE project_id = ? AND asset_id = ?
        `
      )
      .get(projectId, assetId) as ProjectAssetRow | undefined;

    if (!row) {
      const project = this.getProject(projectId);
      const asset = project?.document.assets[assetId];

      if (!asset || !isAssetStoreSource(asset.source)) {
        return null;
      }

      return this.assetStorage.findStoredAssetFilePath(asset.source.content_hash);
    }

    return this.assetStorage.findStoredAssetFilePath(row.content_hash);
  }

  resolveDocumentAssets(projectId: string, document: RendererDocument): ResolvedAssetsById {
    return this.assetStorage.resolveDocumentAssets(projectId, document.assets);
  }

  storeAssetBytes(bytes: Uint8Array): {
    contentHash: string;
    path: string;
    sizeBytes: number;
  } {
    const contentHash = hashAssetBytes(bytes);
    const stored = this.assetStorage.ensureStoredBytes(contentHash, bytes);

    return {
      contentHash,
      path: stored.path,
      sizeBytes: stored.sizeBytes
    };
  }

  migrateEmbeddedAssets(): EmbeddedAssetMigrationReport {
    const projectRows = this.database
      .prepare(
        `
          SELECT id, name, document_id, current_document_json, revision, created_at, updated_at, last_opened_at
          FROM projects
          WHERE archived_at IS NULL
          ORDER BY created_at ASC
        `
      )
      .all() as ProjectRow[];
    const projects: EmbeddedAssetMigrationProjectReport[] = [];
    let migratedAssetCount = 0;
    let unresolvedAssetCount = 0;

    for (const row of projectRows) {
      const storedProject = this.getProject(row.id);

      if (!storedProject) {
        continue;
      }

      const nextCurrentDocument = this.rewriteEmbeddedAssets(storedProject.document);
      const nextHistory = this.rewriteEmbeddedAssetHistory(this.getProjectHistory(row.id));
      const migratedAssetIds = new Set<string>(nextCurrentDocument.migrated_asset_ids);
      const reusedContentHashes = new Set<string>(nextCurrentDocument.reused_content_hashes);
      const unresolvedAssetIds = new Set<string>(nextCurrentDocument.unresolved_asset_ids);

      for (const entry of nextHistory.entries) {
        for (const assetId of entry.migrated_asset_ids) {
          migratedAssetIds.add(assetId);
        }

        for (const contentHash of entry.reused_content_hashes) {
          reusedContentHashes.add(contentHash);
        }

        for (const assetId of entry.unresolved_asset_ids) {
          unresolvedAssetIds.add(assetId);
        }
      }

      if (migratedAssetIds.size === 0 && unresolvedAssetIds.size === 0) {
        continue;
      }

      const saved = this.saveProjectDocument(
        row.id,
        nextCurrentDocument.document,
        row.revision,
        nextHistory.history
      );

      if (!saved.ok) {
        throw new Error(`Failed to persist embedded-asset migration for project ${row.id}`);
      }

      migratedAssetCount += migratedAssetIds.size;
      unresolvedAssetCount += unresolvedAssetIds.size;
      projects.push({
        migrated_asset_ids: [...migratedAssetIds].sort(),
        project_id: row.id,
        reused_content_hashes: [...reusedContentHashes].sort(),
        unresolved_asset_ids: [...unresolvedAssetIds].sort()
      });
    }

    return {
      migrated_asset_count: migratedAssetCount,
      projects,
      unresolved_asset_count: unresolvedAssetCount
    };
  }

  close(): void {
    this.database.close();
  }

  getProjectHistory(projectId: string): ProjectHistory {
    const row = this.database
      .prepare(
        `
          SELECT project_id, undo_json, redo_json
          FROM project_history
          WHERE project_id = ?
        `,
      )
      .get(projectId) as ProjectHistoryRow | undefined;

    if (!row) {
      return createEmptyProjectHistory();
    }

    return {
      redo: this.parseHistoryEntries(row.redo_json),
      undo: this.parseHistoryEntries(row.undo_json),
    };
  }

  private getRow(projectId: string): ProjectRow | undefined {
    return this.database
      .prepare(
        `
          SELECT id, name, document_id, current_document_json, created_at, updated_at, last_opened_at
               , revision
          FROM projects
          WHERE id = ? AND archived_at IS NULL
        `,
      )
      .get(projectId) as ProjectRow | undefined;
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        document_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        current_document_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT,
        archived_at TEXT,
        source_kind TEXT NOT NULL,
        source_metadata_json TEXT
      );
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS project_history (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        undo_json TEXT NOT NULL,
        redo_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.database.exec(`
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

    const tableInfo = this.database
      .prepare('PRAGMA table_info(projects)')
      .all() as TableInfoRow[];

    if (!tableInfo.some((column) => column.name === 'revision')) {
      this.database.exec(
        `ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT ${INITIAL_PROJECT_REVISION};`,
      );
    }
  }

  private hydratePersistedDocument(
    projectId: string,
    rawDocument: RendererDocument
  ): RendererDocument {
    const rawAssets =
      rawDocument.assets && typeof rawDocument.assets === "object" ? rawDocument.assets : {};
    const mergedAssets = {
      ...rawAssets,
      ...this.getPersistedAssetRecordMap(projectId)
    };

    return {
      ...rawDocument,
      assets: mergedAssets
    };
  }

  private getPersistedAssetRecordMap(projectId: string): Record<string, AssetRecord> {
    return Object.fromEntries(
      this.listPersistedAssetRows(projectId).map((row) => [row.asset_id, this.rowToAssetRecord(row)])
    );
  }

  private listPersistedAssetRows(projectId: string): ProjectAssetRow[] {
    return this.database
      .prepare(
        `
          SELECT project_id, asset_id, kind, mime_type, width, height, metadata_json, source_kind, content_hash,
                 original_filename, size_bytes, created_at, updated_at
          FROM project_assets
          WHERE project_id = ?
          ORDER BY asset_id ASC
        `
      )
      .all(projectId) as ProjectAssetRow[];
  }

  private rowToAssetRecord(row: ProjectAssetRow): AssetRecord {
    return {
      id: row.asset_id,
      kind: row.kind,
      mime_type: row.mime_type,
      ...(row.width === null ? {} : { width: row.width }),
      ...(row.height === null ? {} : { height: row.height }),
      ...(row.metadata_json === null ? {} : { metadata: this.parseMetadataJson(row.metadata_json) }),
      source: {
        kind: "asset_store",
        content_hash: row.content_hash,
        ...(row.original_filename === null ? {} : { original_filename: row.original_filename })
      }
    };
  }

  private parseMetadataJson(serializedMetadata: string): Record<string, OpaqueValue> {
    try {
      const parsed = JSON.parse(serializedMetadata);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, OpaqueValue>) : {};
    } catch {
      return {};
    }
  }

  private serializeCurrentDocument(document: RendererDocument): RendererDocument {
    const serializedDocument = structuredClone(document);
    serializedDocument.assets = Object.fromEntries(
      Object.entries(serializedDocument.assets).filter(([, asset]) => !isAssetStoreSource(asset.source))
    );
    return serializedDocument;
  }

  private replacePersistedAssetRows(
    projectId: string,
    assets: AssetRecord[],
    updatedAt: string
  ): void {
    this.database.prepare("DELETE FROM project_assets WHERE project_id = ?").run(projectId);

    for (const asset of assets) {
      if (!isAssetStoreSource(asset.source)) {
        continue;
      }

      const assetFilePath = this.assetStorage.findStoredAssetFilePath(asset.source.content_hash);

      this.database
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
          size_bytes: assetFilePath ? statSync(assetFilePath).size : null,
          updated_at: updatedAt,
          width: asset.width ?? null
        });
    }
  }

  private rewriteEmbeddedAssets(document: RendererDocument): {
    document: RendererDocument;
    migrated_asset_ids: string[];
    reused_content_hashes: string[];
    unresolved_asset_ids: string[];
  } {
    const replacements: Record<string, AssetRecord["source"] | undefined> = {};
    const migratedAssetIds: string[] = [];
    const reusedContentHashes = new Set<string>();
    const unresolvedAssetIds: string[] = [];

    for (const asset of collectEmbeddedAssets(document)) {
      const decoded = this.assetStorage.decodeEmbeddedAsset(asset);

      if (!decoded) {
        unresolvedAssetIds.push(asset.id);
        continue;
      }

      if (this.assetStorage.findStoredAssetFilePath(decoded.contentHash)) {
        reusedContentHashes.add(decoded.contentHash);
      }

      this.assetStorage.ensureStoredBytes(decoded.contentHash, decoded.bytes);
      replacements[asset.id] = {
        kind: "asset_store",
        content_hash: decoded.contentHash
      };
      migratedAssetIds.push(asset.id);
    }

    return {
      document: replaceAssetSources(document, replacements),
      migrated_asset_ids: migratedAssetIds,
      reused_content_hashes: [...reusedContentHashes],
      unresolved_asset_ids: unresolvedAssetIds
    };
  }

  private rewriteEmbeddedAssetHistory(history: ProjectHistory): {
    entries: Array<{
      migrated_asset_ids: string[];
      reused_content_hashes: string[];
      unresolved_asset_ids: string[];
    }>;
    history: ProjectHistory;
  } {
    const entries: Array<{
      migrated_asset_ids: string[];
      reused_content_hashes: string[];
      unresolved_asset_ids: string[];
    }> = [];
    const rewriteStack = (stack: ProjectHistoryEntry[]) =>
      stack.map((entry) => {
        const rewritten = this.rewriteEmbeddedAssets(entry.document);
        entries.push({
          migrated_asset_ids: rewritten.migrated_asset_ids,
          reused_content_hashes: rewritten.reused_content_hashes,
          unresolved_asset_ids: rewritten.unresolved_asset_ids
        });
        return {
          ...entry,
          document: rewritten.document
        };
      });

    return {
      entries,
      history: {
        redo: rewriteStack(history.redo),
        undo: rewriteStack(history.undo)
      }
    };
  }

  private toSummary(row: ProjectRow): ProjectSummary {
    return {
      createdAt: row.created_at,
      documentId: row.document_id,
      id: row.id,
      lastOpenedAt: row.last_opened_at,
      name: row.name,
      updatedAt: row.updated_at,
    };
  }

  private parseHistoryEntries(
    serializedEntries: string,
  ): ProjectHistoryEntry[] {
    let parsedEntries: unknown;

    try {
      parsedEntries = JSON.parse(serializedEntries);
    } catch {
      return [];
    }

    if (!Array.isArray(parsedEntries)) {
      return [];
    }

    return parsedEntries.flatMap((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('document' in entry) ||
        !('committed_at' in entry) ||
        !('source' in entry) ||
        !('source_revision' in entry)
      ) {
        return [];
      }

      const source = (entry as { source?: unknown }).source;

      if (source !== 'ui' && source !== 'mcp') {
        return [];
      }

      const committedAt = (entry as { committed_at?: unknown }).committed_at;
      const sourceRevision = (entry as { source_revision?: unknown })
        .source_revision;
      const rawDocument = (entry as { document?: unknown }).document;

      if (
        typeof committedAt !== 'string' ||
        !Number.isInteger(sourceRevision) ||
        typeof rawDocument !== 'object' ||
        rawDocument === null
      ) {
        return [];
      }

      const document = normalizeDocument(rawDocument, {
        fallbackDocumentId:
          typeof (rawDocument as { document_id?: unknown }).document_id ===
          'string'
            ? (rawDocument as { document_id: string }).document_id
            : 'doc_unknown',
        fallbackName:
          typeof (rawDocument as { name?: unknown }).name === 'string'
            ? (rawDocument as { name: string }).name
            : 'Untitled Project',
      });

      return [
        {
          committed_at: committedAt,
          document,
          source,
          source_revision: sourceRevision as number,
        },
      ];
    });
  }

  private saveHistoryRow(
    projectId: string,
    history: ProjectHistory,
    updatedAt: string,
  ): void {
    this.database
      .prepare(
        `
          INSERT INTO project_history (project_id, undo_json, redo_json, updated_at)
          VALUES (@project_id, @undo_json, @redo_json, @updated_at)
          ON CONFLICT(project_id) DO UPDATE SET
            undo_json = excluded.undo_json,
            redo_json = excluded.redo_json,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        project_id: projectId,
        redo_json: JSON.stringify(history.redo),
        undo_json: JSON.stringify(history.undo),
        updated_at: updatedAt,
      });
  }
}

function createEmptyProjectHistory(): ProjectHistory {
  return {
    redo: [...EMPTY_PROJECT_HISTORY.redo],
    undo: [...EMPTY_PROJECT_HISTORY.undo],
  };
}
