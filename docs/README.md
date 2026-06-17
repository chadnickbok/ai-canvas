# Docs

Status: Index / non-normative map.

This directory contains the current product and implementation docs for AI Canvas Desktop.

This file is a map to the docs set, not a source-of-truth contract. If behavior matters, the contract docs win over this index.

For MCP operators, the best entrypoint is the bridge's live `docs://...` resources at runtime rather than this repository index.

## Contract docs

- [product-stance.md](product-stance.md)
  Defines the product boundary and v1 runtime behavior contract.

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

## Guidance docs

- [gaps.md](gaps.md)
  Audits the current runtime, automatic persistence, snapshot, recovery, and open/load/edit/save implementation gaps against the contract docs.

- [desktop-architecture.md](desktop-architecture.md)
  Describes the recommended Electron, renderer, preload, storage, and package-boundary shape.

- [editor-surface-architecture.md](editor-surface-architecture.md)
  Describes the intended three-layer edit-time workspace composition for renderer, interaction overlay, and editor UI.

- [local-mcp.md](local-mcp.md)
  Describes the recommended local MCP surface and runtime integration shape.
  Runtime operator docs are exposed by the bridge itself through `docs://overview`, `docs://examples/quickstart`, `docs://tools`, and `docs://troubleshooting`.

- [storage-model.md](storage-model.md)
  Describes the recommended v1 local persistence implementation shape.

## Policy docs

- [testing-and-release.md](testing-and-release.md)
  Defines the validation strategy, release gates, and manual verification bar for the desktop app.

- [release-strategy.md](release-strategy.md)
  Defines the current release pipeline, versioning, artifacts, publication flow, and updater model for the desktop app.
