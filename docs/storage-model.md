# Storage Model

This document defines the local persistence model for AI Canvas Desktop.

## Goals

The storage model should be:

- local-first
- robust
- transactional
- easy to back up
- easy to migrate
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
- migration state
- asset metadata
- import/export job metadata if needed

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

A document is the canvas/workspace inside a project. Future versions may allow multiple documents per project, but v1 stores exactly one document per project.

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

For v1, the simplest good model is:

- the sole current document state stored directly in the `projects` table as `current_document_json`
- optional history or checkpoints in separate tables
- deterministic derived state treated as cacheable and rebuildable, not canonical

That is much simpler than making event sourcing mandatory.

## Autosave stance

Autosave is the primary persistence model.

That means:

- user edits persist automatically to SQLite
- there is no primary user-facing manual save action
- recovery behavior is defined relative to durable SQLite commits and recovery checkpoints, not explicit save clicks

## History model

Recommended v1 history approach:

- current document is authoritative
- command history is local and bounded
- optional checkpoints support recovery and future version history
- full event sourcing is not required for launch

Suggested tables:

`projects`

Stores current, authoritative project records.

`project_checkpoints`

Stores point-in-time document JSON snapshots for:

- recovery
- manual restore
- future version-history UX

`project_events` (optional early, useful later)

Stores appended command events for:

- debugging
- lightweight audit trail
- future richer history tooling

The launch product does not need server-grade revision machinery.

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

## Import/export stance

The desktop app should distinguish between:

- the internal local project-library model
- portable project snapshots used for export/import

Recommended product behavior:

- the app manages a local project library in SQLite
- users can export a portable project snapshot containing exactly one project and one document in v1
- users can import a portable project snapshot containing exactly one project and one document in v1
- importing creates a new local project plus asset entries, with imported ids remapped to fresh local ids rather than reused from the snapshot
- importing rejects multi-document or multi-project bundles in v1
- exported snapshots exclude local history
- exported snapshots should avoid leaking app-internal database structure

## Recovery model

Crash safety matters more in desktop than it does in a backend-driven world.

Recommended recovery behavior:

- autosave current project changes to SQLite
- keep recent recovery checkpoints on disk or in `project_checkpoints`
- on crash restart, offer recovery when a recovery checkpoint is newer than the last durable committed project state

## Migrations

Every persisted document must carry a schema version.

Database migrations and document migrations are different concerns:

- database migrations evolve SQLite schema
- document migrations evolve renderer document structure

Both need explicit, tested migration paths.

## Non-goals for launch

The launch storage model does not need:

- cross-device sync
- cloud backups
- shared team libraries
- remote locking
- server-authored revisions
- collaborative conflict resolution
