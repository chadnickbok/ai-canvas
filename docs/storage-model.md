# Storage Model

Status: Implementation guidance.

This document describes the recommended local persistence model for AI Canvas Desktop in v1.

Related contracts:

- `docs/product-stance.md` for product/runtime behavior
- `docs/document-schema.md` for persisted document shape
- `docs/project-snapshot-format.md` for import/export artifact shape

## Goals

The recommended storage model should be:

- local-first
- robust
- transactional
- easy to back up
- clear about what lives in SQLite vs on disk
- resilient to crashes
- good enough for large mockup documents without becoming over-engineered

## Storage split

### SQLite stores structured local state

SQLite is the source of truth for:

- project records
- current document JSON
- local history metadata
- preferences
- recent projects
- asset metadata

### Disk stores large or binary payloads

The filesystem stores:

- image assets
- imported source bundles or project snapshots
- exported project snapshots
- exported images/PDFs
- preview renders
- crash-recovery artifacts
- logs

## Recommended app-data layout

```text
<AppData>/AI Canvas Desktop/
  app.db
  assets/
    sha256/
      ab/
      cd/
  exports/
  imports/
  logs/
  recovery/
```

## Project model

A local project is the product-facing unit.

A document is the canvas/workspace inside a project. Each project stores exactly one document in v1.

Recommended project record fields:

- id
- name
- created_at
- updated_at
- schema_version
- current_document_json
- last_opened_at
- archived_at nullable
- source_kind such as new, imported_snapshot, recovered
- source_metadata_json nullable

In v1:

- the sole current document state is stored directly in the `projects` table as `current_document_json`
- local history metadata is bounded and stays local to the project library
- deterministic derived state is treated as cacheable and rebuildable, not canonical

## Recommended autosave stance

Autosave is the primary persistence model.

That means:

- user edits persist automatically to SQLite
- there is no primary user-facing manual save action
- recovery behavior is defined relative to durable SQLite commits and recovery checkpoints, not explicit save clicks

## History model

History is local and bounded in v1.

- current document is authoritative
- local history metadata supports undo/redo and reopen flows
- the launch product does not include event sourcing or server-grade revision history

## Asset model

Assets should be content-addressed on disk.

Recommended asset metadata fields:

- id
- sha256
- mime_type
- file_ext
- size_bytes
- width nullable
- height nullable
- storage_path
- source_url nullable
- created_at

The document should reference assets by stable asset ids in document fields, not raw OS paths.

## Recommended import/export stance

The desktop app should distinguish between:

- the internal local project-library model
- portable project snapshots used for export/import

Recommended behavior:

- the app manages a local project library in SQLite
- users can export a portable project snapshot containing exactly one project and one document in v1
- users can import a portable project snapshot containing exactly one project and one document in v1
- importing creates a new local project plus asset entries, with imported ids remapped to fresh local ids rather than reused from the snapshot
- importing rejects multi-document or multi-project bundles in v1
- exported snapshots exclude local history
- exported snapshots should avoid leaking app-internal database structure

## Recommended recovery model

Crash safety matters more in desktop than it does in a backend-driven world.

Recommended recovery behavior:

- autosave current project changes to SQLite
- keep recent recovery checkpoints in `recovery/`
- on crash restart, offer recovery when a recovery artifact is newer than the last durable committed project state

## Non-goals for launch

The launch storage model does not need:

- cross-device sync
- cloud backups
- shared team libraries
- remote locking
- server-authored revisions
- collaborative conflict resolution
