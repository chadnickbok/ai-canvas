import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createEmptyDocument, normalizeDocument, type RendererDocument } from "@ai-canvas/document-core";
import type { ProjectSummary } from "@ai-canvas/ipc-contract";

import { createDocumentId, createProjectId } from "./ids.js";

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
  revision: number;
};

export type HistoryMutationSource = "mcp" | "ui";

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
      code: "not_found";
    }
  | {
      ok: false;
      code: "revision_conflict";
      revision: number;
    };

const INITIAL_PROJECT_REVISION = 1;
const EMPTY_PROJECT_HISTORY: ProjectHistory = {
  redo: [],
  undo: []
};

type TableInfoRow = {
  name: string;
};

export class ProjectStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec("PRAGMA foreign_keys = ON;");
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
        `
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
      createdAt: now
    });

    this.database.exec("BEGIN IMMEDIATE;");

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
          `
        )
        .run({
          created_at: now,
          current_document_json: JSON.stringify(document),
          document_id: documentId,
          id: projectId,
          last_opened_at: now,
          name,
          revision: INITIAL_PROJECT_REVISION,
          updated_at: now
        });

      this.saveHistoryRow(projectId, EMPTY_PROJECT_HISTORY, now);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    const row = this.getRow(projectId);

    if (!row) {
      throw new Error(`Project ${projectId} was created but could not be reloaded`);
    }

    return {
      document,
      project: this.toSummary(row),
      revision: row.revision
    };
  }

  getProject(projectId: string): StoredProject | null {
    const row = this.getRow(projectId);

    if (!row) {
      return null;
    }

    const document = normalizeDocument(JSON.parse(row.current_document_json), {
      fallbackDocumentId: row.document_id,
      fallbackName: row.name
    });

    return {
      document,
      project: this.toSummary(row),
      revision: row.revision
    };
  }

  saveProjectDocument(
    projectId: string,
    document: RendererDocument,
    expectedRevision: number,
    history?: ProjectHistory
  ): PersistProjectDocumentResult {
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");

    try {
      const updateResult = this.database
        .prepare(
          `
            UPDATE projects
            SET current_document_json = @current_document_json,
                revision = revision + 1,
                updated_at = @updated_at
            WHERE id = @project_id AND archived_at IS NULL AND revision = @expected_revision
          `
        )
        .run({
          current_document_json: JSON.stringify(document),
          expected_revision: expectedRevision,
          project_id: projectId,
          updated_at: now
        });

      if (updateResult.changes === 0) {
        this.database.exec("ROLLBACK;");
        const currentRow = this.getRow(projectId);

        if (!currentRow) {
          return {
            code: "not_found",
            ok: false
          };
        }

        return {
          code: "revision_conflict",
          ok: false,
          revision: currentRow.revision
        };
      }

      if (history) {
        this.saveHistoryRow(projectId, history, now);
      }
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }

    const updatedRow = this.getRow(projectId);

    if (!updatedRow) {
      return {
        code: "not_found",
        ok: false
      };
    }

    return {
      ok: true,
      project: this.toSummary(updatedRow),
      revision: updatedRow.revision
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
        `
      )
      .run({
        now,
        project_id: projectId
      });

    if (result.changes === 0) {
      return null;
    }

    const row = this.getRow(projectId);

    return row ? this.toSummary(row) : null;
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
        `
      )
      .get(projectId) as ProjectHistoryRow | undefined;

    if (!row) {
      return createEmptyProjectHistory();
    }

    return {
      redo: this.parseHistoryEntries(row.redo_json),
      undo: this.parseHistoryEntries(row.undo_json)
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
        `
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

    const tableInfo = this.database
      .prepare("PRAGMA table_info(projects)")
      .all() as TableInfoRow[];

    if (!tableInfo.some((column) => column.name === "revision")) {
      this.database.exec(
        `ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT ${INITIAL_PROJECT_REVISION};`
      );
    }
  }

  private toSummary(row: ProjectRow): ProjectSummary {
    return {
      createdAt: row.created_at,
      documentId: row.document_id,
      id: row.id,
      lastOpenedAt: row.last_opened_at,
      name: row.name,
      updatedAt: row.updated_at
    };
  }

  private parseHistoryEntries(serializedEntries: string): ProjectHistoryEntry[] {
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
        typeof entry !== "object" ||
        entry === null ||
        !("document" in entry) ||
        !("committed_at" in entry) ||
        !("source" in entry) ||
        !("source_revision" in entry)
      ) {
        return [];
      }

      const source = (entry as { source?: unknown }).source;

      if (source !== "ui" && source !== "mcp") {
        return [];
      }

      const committedAt = (entry as { committed_at?: unknown }).committed_at;
      const sourceRevision = (entry as { source_revision?: unknown }).source_revision;
      const rawDocument = (entry as { document?: unknown }).document;

      if (
        typeof committedAt !== "string" ||
        !Number.isInteger(sourceRevision) ||
        typeof rawDocument !== "object" ||
        rawDocument === null
      ) {
        return [];
      }

      const document = normalizeDocument(rawDocument, {
        fallbackDocumentId:
          typeof (rawDocument as { document_id?: unknown }).document_id === "string"
            ? (rawDocument as { document_id: string }).document_id
            : "doc_unknown",
        fallbackName:
          typeof (rawDocument as { name?: unknown }).name === "string"
            ? (rawDocument as { name: string }).name
            : "Untitled Project"
      });

      return [
        {
          committed_at: committedAt,
          document,
          source,
          source_revision: sourceRevision as number
        }
      ];
    });
  }

  private saveHistoryRow(projectId: string, history: ProjectHistory, updatedAt: string): void {
    this.database
      .prepare(
        `
          INSERT INTO project_history (project_id, undo_json, redo_json, updated_at)
          VALUES (@project_id, @undo_json, @redo_json, @updated_at)
          ON CONFLICT(project_id) DO UPDATE SET
            undo_json = excluded.undo_json,
            redo_json = excluded.redo_json,
            updated_at = excluded.updated_at
        `
      )
      .run({
        project_id: projectId,
        redo_json: JSON.stringify(history.redo),
        undo_json: JSON.stringify(history.undo),
        updated_at: updatedAt
      });
  }
}

function createEmptyProjectHistory(): ProjectHistory {
  return {
    redo: [...EMPTY_PROJECT_HISTORY.redo],
    undo: [...EMPTY_PROJECT_HISTORY.undo]
  };
}
