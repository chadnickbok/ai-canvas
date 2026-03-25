# Docs

This directory contains the current product and implementation docs for AI Canvas Desktop.

The current docs settle product vocabulary, runtime boundaries, local storage semantics, the MCP stance for v1, the canonical document schema, normalization rules, computed-layout refresh behavior, rendering behavior, and command semantics. Command payload wire shapes and the project snapshot format are still pending follow-up docs.

## Current docs

- [product-stance.md](product-stance.md)
  Defines the product boundary, launch bar, and core runtime assumptions.

- [desktop-architecture.md](desktop-architecture.md)
  Defines the Electron, renderer, preload, tray, storage, and worker boundaries.

- [storage-model.md](storage-model.md)
  Defines how projects, documents, history, assets, and exports are stored locally.

- [local-mcp.md](local-mcp.md)
  Defines the local MCP strategy for the desktop app.

- [document-schema.md](document-schema.md)
  Defines the canonical persisted `RendererDocument` schema used by the app.

- [document-normalization.md](document-normalization.md)
  Defines repair, semantic resolution, and render-style materialization for normalized documents.

- [computed-layout-refresh.md](computed-layout-refresh.md)
  Defines browser-backed layout measurement and `computed_layout` refresh before persistence.

- [rendering-behavior.md](rendering-behavior.md)
  Defines how the browser-backed renderer consumes normalized documents.

- [command-semantics.md](command-semantics.md)
  Defines the authoritative mutation semantics shared by the UI and MCP.

## Planned docs

- `command-payloads.md`
  Will define exact command payload wire shapes and request wrappers.

- `project-snapshot-format.md`
  Will define the portable export/import artifact and its compatibility rules.

- `testing-and-release.md`
  Will define the validation gates and release bar for the desktop app.
