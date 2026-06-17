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
- source_kind such as new or imported_snapshot
- source_metadata_json nullable

In v1:

- the sole current document state is stored directly in the `projects` table as `current_document_json`
- project-local asset catalog metadata is stored separately from `current_document_json`
- local history metadata is bounded and stays local to the project library
- deterministic derived state is treated as cacheable and rebuildable, not canonical

## Recommended automatic persistence stance

Automatic command persistence is the primary persistence model.

That means:

- each successful command batch, undo, or redo persists immediately to SQLite before the runtime emits the changed document
- there is no primary user-facing manual save action
- crash durability is defined relative to durable SQLite commits, not explicit save clicks

## History model

History is local and bounded in v1.

- current document is authoritative
- local history metadata supports undo/redo and reopen flows
- the launch product does not include event sourcing or server-grade revision history

## Asset model

Assets should be content-addressed on disk.

Recommended live desktop split:

- document fields reference stable project-local asset ids
- a first-class project asset catalog in SQLite stores asset metadata for `asset_store` assets
- the filesystem stores the binary payloads under the content-addressed asset store
- render-time resolution turns document asset ids into browser-usable URLs or data sources

`current_document_json` should not be treated as the persistence authority for `asset_store` asset metadata.

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

## Crash durability model

Crash safety matters more in desktop than it does in a backend-driven world.

Recommended crash-durability behavior:

- successful project changes persist to SQLite during command application
- command persistence is transactional: a command is either fully committed or absent after restart
- on restart, the app loads the last durable committed project revision
- the launch product does not maintain a separate checkpoint artifact system
- the launch product does not show alternate-state prompts on restart

## Non-goals for launch

The launch storage model does not need:

- cross-device sync
- cloud backups
- shared team libraries
- remote locking
- server-authored revisions
- collaborative conflict resolution
