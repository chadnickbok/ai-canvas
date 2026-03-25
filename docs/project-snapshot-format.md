# AI Canvas Project Snapshot Format

This document defines the portable snapshot format for AI Canvas Desktop.

A project snapshot is a self-contained bundle used for:

- export
- import
- backup
- restore
- crash recovery artifacts
- future sharing or transfer workflows

The snapshot format is **not** the same thing as the live local storage model.

Live local storage may use:

- SQLite
- a local asset store
- app-specific metadata directories

The snapshot format is the stable, portable, file-based representation of a project.

## 1. Goals

The snapshot format must be:

- self-contained
- portable across machines
- inspectable without the app
- deterministic to write
- easy to validate
- future-friendly for schema evolution
- independent of SQLite internals

It should support:

- one project
- one or more documents
- embedded metadata
- content-addressed assets
- optional thumbnails/previews
- safe partial recovery when some files are damaged

## 2. Non-Goals

The snapshot format is not intended to be:

- a byte-for-byte export of the live SQLite database
- a full event log
- an undo/redo journal
- a sync protocol
- a collaborative merge format

Snapshots are point-in-time captures of durable project state.

## 3. Format Overview

A project snapshot is a bundle with:

- one manifest
- one project metadata file
- one or more document JSON files
- zero or more asset files
- optional preview/thumbnail files

The canonical snapshot format should support two equivalent representations:

1. **directory form** for debugging and development
2. **archive form** for user-facing export/import

## 4. File Extension

Recommended user-facing extension:

- `.aicp`

Meaning:

- **AI Canvas Project**

Recommended MIME type:

- `application/x-ai-canvas-project`

## 5. Archive Container

The canonical archive form is:

- a ZIP archive

Reasons:

- widely supported
- easy to inspect
- preserves directory structure
- works well for mixed JSON and binary content

The archive must contain one top-level bundle root.

Example:

```text
my-project.aicp
  manifest.json
  project.json
  documents/
  assets/
  previews/
````

## 6. Canonical Directory Layout

```text
snapshot-root/
  manifest.json
  project.json
  documents/
    <document-id>.json
  assets/
    sha256/
      ab/
        abcdef123456....
      7f/
        7f9d3c....
  previews/
    project-thumbnail.png
    documents/
      <document-id>.png
```

### Rules

* `manifest.json` is required
* `project.json` is required
* `documents/` is required, even if it contains only one document
* `assets/` is required if any asset is referenced
* `previews/` is optional

## 7. Snapshot Identity Model

A snapshot contains exactly one project.

A project contains:

* project metadata
* one or more documents
* shared asset payloads referenced by those documents

This allows the format to support future multi-document projects without redesign.

In v1, most exported projects may contain exactly one document.

## 8. Manifest

`manifest.json` is the authoritative entrypoint for reading the snapshot.

It describes:

* format version
* project id
* document ids
* asset inventory
* checksums
* entrypoints
* optional preview files

Canonical shape:

```ts
type SnapshotManifest = {
  snapshot_format: "ai-canvas-project";
  snapshot_version: 1;

  project_id: string;
  created_at: string; // ISO-8601 UTC timestamp
  created_by: {
    app: "ai-canvas-desktop";
    app_version?: string;
  };

  entries: {
    project: "project.json";
    documents: Record<string, string>;
    assets: Record<string, SnapshotAssetEntry>;
    previews?: {
      project_thumbnail?: string;
      document_thumbnails?: Record<string, string>;
    };
  };

  checksums: {
    project_json_sha256: string;
    document_sha256: Record<string, string>;
    asset_sha256: Record<string, string>;
    preview_sha256?: Record<string, string>;
  };
};
```

### Rules

* `snapshot_format` is fixed to `"ai-canvas-project"`
* `snapshot_version` is the snapshot-format version, not the document schema version
* all paths are relative to the snapshot root
* all checksums are SHA-256 hex digests
* every referenced document and asset must appear in `checksums`

## 9. Project Metadata

`project.json` describes project-level metadata, not the full document contents.

Canonical shape:

```ts
type ProjectSnapshotMetadata = {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;

  default_document_id: string;

  document_ids: string[];

  tags?: string[];
  notes?: string;

  export_metadata?: {
    exported_from_machine?: string;
    exported_by_user?: string;
    app_version?: string;
  };
};
```

### Rules

* `id` must match `manifest.project_id`
* `default_document_id` must exist in `document_ids`
* `document_ids` must match the document entries listed in `manifest.json`

## 10. Document Files

Each document is stored as its own JSON file under `documents/`.

Path convention:

```text
documents/<document-id>.json
```

Each document file contains the canonical persisted document shape defined in:

* `docs/document-schema.md`

That means the snapshot stores normalized documents, not partial or transient UI state.

### Rules

* document filenames should use the document id directly
* the document file contents must already be normalized and materialized
* snapshot import should still re-normalize defensively on load

## 11. Asset Files

Assets are stored separately from documents.

Documents reference assets by asset id. The snapshot manifest maps those asset ids to actual payload files.

Canonical manifest entry:

```ts
type SnapshotAssetEntry = {
  asset_id: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string; // sha256 hex
  width?: number;
  height?: number;
  original_filename?: string;
};
```

### Path convention

Assets are stored content-addressed under:

```text
assets/sha256/<first-two-hex>/<full-sha256>
```

Example:

```text
assets/sha256/ab/ab4f2d5d9e0d1f...
```

### Rules

* `content_hash` must equal the SHA-256 of the asset file bytes
* `path` must point to the asset file
* the asset file path should match the content-addressed convention
* if multiple asset ids point to identical content, they may reference the same file path

## 12. Asset Model Inside Documents

Inside the document JSON, assets should still use the canonical document asset model.

However, for snapshot portability, the preferred snapshot write policy is:

* documents include asset metadata records
* binary content is stored as separate files in the snapshot bundle
* document asset records should use snapshot-import-friendly source metadata rather than large embedded payloads when possible

Recommended exported document asset source shape for snapshot portability:

```ts
type SnapshotDocumentAssetSource = {
  kind: "snapshot_asset";
  asset_id: string;
};
```

If the document schema does not yet support a dedicated snapshot asset source kind, the importer/exporter layer should map between:

* canonical in-app asset representation
* snapshot bundle asset references

### Recommendation

Keep the **document schema** and **snapshot format** conceptually separate:

* the document says which asset ids exist
* the snapshot manifest says where the bytes live

That keeps the snapshot portable without forcing the live document schema to become bundle-path-aware.

## 13. Preview Files

Preview files are optional convenience artifacts.

They are not authoritative.

Examples:

* project thumbnail
* per-document preview PNG

Preview files live under:

```text
previews/
previews/documents/
```

### Rules

* previews may be missing
* import must not fail just because previews are missing or corrupt
* previews should never be treated as source-of-truth render data

## 14. Canonical Export Rules

When writing a snapshot:

1. normalize the project
2. normalize all included documents
3. gather the full referenced asset set
4. write manifest
5. write project metadata
6. write document JSON files
7. write asset files
8. optionally write previews
9. compute and write checksums
10. archive if writing `.aicp`

### Export must not include

The snapshot must not include:

* SQLite files
* WAL files
* temporary editor state
* unsaved form drafts
* undo/redo stacks
* renderer caches
* OS-specific absolute paths

## 15. Canonical Import Rules

When reading a snapshot:

1. open archive or directory
2. read `manifest.json`
3. validate `snapshot_format` and `snapshot_version`
4. validate referenced paths exist where required
5. validate checksums when available
6. read `project.json`
7. read document files
8. read asset files
9. re-normalize imported documents
10. repair/dismiss broken references according to document normalization rules

### Import should prefer repair over hard failure

If part of a snapshot is damaged:

* preserve readable documents
* preserve readable assets
* drop broken references when necessary
* surface warnings to the user

The app should prefer partial recovery over full refusal whenever safe.

## 16. Validation Policy

A snapshot is valid when:

* `manifest.json` exists and parses
* `project.json` exists and parses
* every listed document exists and parses
* every listed asset path exists for referenced assets
* checksums match when validation is enabled
* project/document id relationships are coherent

### Recoverable issues

These should produce warnings, not necessarily hard failure:

* missing preview files
* stale preview checksums
* extra unreferenced files in `previews/`
* extra unreferenced files in `assets/`
* missing optional metadata fields

### Hard failure issues

These should fail snapshot import unless the user explicitly chooses partial recovery:

* missing `manifest.json`
* missing `project.json`
* unreadable or invalid default document
* fatal document parse failure for all documents
* invalid archive structure that prevents traversal

## 17. Checksums

Checksums are used for integrity validation only.

They are not part of document identity.

All checksums use:

* SHA-256
* lowercase hex encoding

If checksum validation fails:

* import should warn
* partial recovery may still proceed if the content is otherwise readable

## 18. Forward Compatibility

The snapshot format version is independent of the document schema version.

This allows:

* snapshot container evolution
* document schema evolution
* asset packaging evolution

A reader must reject snapshots with unsupported `snapshot_version` unless it explicitly supports migration.

A reader may support importing older snapshot versions by migration.

## 19. Minimal Valid Snapshot Example

Directory form:

```text
snapshot-root/
  manifest.json
  project.json
  documents/
    doc_home.json
```

Example `manifest.json`:

```json
{
  "snapshot_format": "ai-canvas-project",
  "snapshot_version": 1,
  "project_id": "project_001",
  "created_at": "2026-03-24T12:34:56Z",
  "created_by": {
    "app": "ai-canvas-desktop",
    "app_version": "0.1.0"
  },
  "entries": {
    "project": "project.json",
    "documents": {
      "doc_home": "documents/doc_home.json"
    },
    "assets": {}
  },
  "checksums": {
    "project_json_sha256": "1111111111111111111111111111111111111111111111111111111111111111",
    "document_sha256": {
      "doc_home": "2222222222222222222222222222222222222222222222222222222222222222"
    },
    "asset_sha256": {}
  }
}
```

Example `project.json`:

```json
{
  "id": "project_001",
  "name": "My Project",
  "default_document_id": "doc_home",
  "document_ids": ["doc_home"]
}
```

## 20. Recommended Writer Behavior

A writer should:

* emit canonical normalized document JSON
* include only referenced assets by default
* de-duplicate identical asset bytes by content hash
* emit previews only as optional extras
* keep the archive human-inspectable
* avoid format features that depend on local machine paths or SQLite internals

## 21. Recommended Reader Behavior

A reader should:

* accept both directory and archive form
* validate conservatively
* import defensively
* normalize documents after load
* preserve recoverable content
* surface warnings for missing previews, missing assets, and checksum mismatches

## 22. Non-Goals of This Document

This document does not define:

* live SQLite storage layout
* in-memory editor session shape
* undo/redo history
* sync protocol behavior
* command transport
* collaborative merge semantics

