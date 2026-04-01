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

export type StoredProject = {
  document: RendererDocument;
  project: ProjectSummary;
  revision: number;
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
    expectedRevision: number
  ): PersistProjectDocumentResult {
    const now = new Date().toISOString();
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
}
