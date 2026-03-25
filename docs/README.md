# Docs

This directory contains the current product and implementation docs for AI Canvas Desktop.

The current docs settle product vocabulary, including the v1 `project > document > scene` hierarchy, runtime boundaries, editor-surface composition, local storage semantics, the MCP stance for v1, the canonical document schema, normalization rules, computed-layout refresh behavior, rendering behavior, command semantics, command payload wire shapes, project snapshot portability, and testing/release expectations. That includes the v1 contract that every project contains exactly one document, that window close blocks on a final autosave attempt before renderer teardown, and that MCP remains available for inspection after the editor window closes while write-capable flows still require a live browser-backed measurement surface.

## Current docs

- [product-stance.md](product-stance.md)
  Defines the product boundary, launch bar, and core runtime assumptions.

- [desktop-architecture.md](desktop-architecture.md)
  Defines the Electron, renderer, preload, tray, storage, and worker boundaries.

- [editor-surface-architecture.md](editor-surface-architecture.md)
  Defines the three-layer edit-time workspace composition for renderer, interaction overlay, and editor UI.

- [storage-model.md](storage-model.md)
  Defines how projects, the sole v1 document, history, assets, and exports are stored locally.

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

- [command-payloads.md](command-payloads.md)
  Defines the command batch envelope, per-command payload shapes, and request/result wrappers.

- [project-snapshot-format.md](project-snapshot-format.md)
  Defines the portable export/import artifact and its compatibility rules.

- [testing-and-release.md](testing-and-release.md)
  Defines the validation strategy, release gates, and manual verification bar for the desktop app.
