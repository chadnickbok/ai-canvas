# Desktop Architecture

Status: Implementation guidance.

This document describes the recommended runtime architecture of the standalone Electron app.

Related contracts:

- `docs/product-stance.md` for product and runtime behavior
- `docs/document-schema.md` for persisted model shape
- `docs/command-semantics.md` and `docs/command-payloads.md` for mutation contracts
- `docs/computed-layout-refresh.md` for layout-refresh behavior

## Goals

The app should be:

- local-first
- deterministic
- testable
- TypeScript end-to-end
- safe across Electron process boundaries
- tray-capable for MCP without requiring a hidden renderer in v1
- keeps the renderer lean rather than Node-heavy

## Major runtime pieces

### 1. Electron main process

The main process owns:

- app lifecycle
- window lifecycle
- tray or menu-bar lifecycle
- native menus
- file dialogs for import/export
- OS integrations
- storage bootstrapping
- MCP bootstrap and shutdown
- IPC registration

The main process should not contain editor business logic directly.

For v1, the app supports one editor window. After a successful close-to-tray transition, or an explicit discard of unsaved changes, the window closes, the renderer is torn down, the app remains resident in the tray, and the process does not exit. V1 does not keep a hidden `BrowserWindow`, offscreen renderer, or separate headless browser measurement service alive after the editor window closes.

### 2. Preload bridge

The preload layer exposes a narrow, typed API to the renderer.

It should be the only renderer-visible bridge to privileged capabilities like:

- opening projects
- listing recent projects
- importing assets
- importing project snapshots
- exporting project snapshots
- enabling or disabling local MCP
- reading app preferences
- reading MCP status and configured port

The preload surface should be validated with shared schemas from `packages/ipc-contract`.

### 3. Renderer process

The renderer owns the React editor UI.

It should contain:

- project library views
- editor routes for the active project's sole document workspace in v1
- scene list
- canvas/editor chrome
- inspector
- design-system panels
- command dispatch and optimistic UI state where appropriate
- autosave and recovery status presentation
- DOM-backed rendering and post-render layout measurement used to refresh `computed_layout`

In v1, this renderer is also the only browser measurement surface used for write-capable command commit and browser-capture workflows.

The renderer should not know about SQLite, project storage paths, OS directories, or raw MCP listener details.

### 3.1 Editor surface composition

When a document workspace is open, the renderer process should host three visual layers in this back-to-front order:

- renderer layer
- interaction layer
- UI layer

`docs/editor-surface-architecture.md` defines this contract in detail.

At a high level:

- the renderer layer is the pure document render and browser measurement surface
- the interaction layer is the transparent document-anchored overlay for transient editing affordances
- the UI layer is editor chrome such as hierarchy, inspector, tools, menus, and panels

### 4. Document core

`packages/document-core` is the product core.

It owns:

- the authored document schema
- schema validation
- command grammar
- command application
- binding resolution
- semantic query surface
- semantic resolution and `render_style` materialization
- `computed_layout` refresh contracts for browser-measured layout snapshots
- import/export normalization
- persistence mapping between DB records and domain objects

This package should be usable by:

- renderer UI
- main-process services
- local MCP bridge
- tests

### 5. Storage services

A storage service layer should sit in the Node-capable side of the app and own:

- SQLite access
- asset-store access
- project load and persistence
- autosave
- project session bootstrapping
- project snapshot import/export
- recovery artifacts

The storage layer should return domain objects, not raw SQL rows.

## Runtime session model

This section describes the recommended v1 implementation shape. The normative runtime behavior contract lives in `docs/product-stance.md`.

Recommended runtime assumptions:

- one editor window in v1
- one active project at a time
- each active project contains exactly one document in v1
- the active project is the most recently opened project
- command batches for a given project are serialized through one command-application path
- the tray-resident process can keep the active project session available even when no editor window is visible
- when no editor window is visible, the active project session remains inspectable but write-capable flows are unavailable

Because v1 has one document per project, project selection and document selection are the same routing choice at the product level.

SQLite is the persistence authority for structured project state. The live project session is the authoritative in-memory representation while the app is running.

The browser renderer is the only browser-backed measurement surface in v1. The save, autosave, and close-to-tray lifecycle should be implemented through the runtime contract in `docs/product-stance.md`, not redefined here.

Recommended operation behavior:

- `openProject(projectId)` should not switch the active project session or visible workspace until load and normalization succeed
- `applyCommands(projectId, commands)` should update the live project session through the canonical command path, with durable persistence following the runtime's autosave or final-save path
- `importProjectSnapshot(path)` should persist the imported project before exposing it for editing
- `exportProjectSnapshot(projectId, destination)` should write from durable project state and leave the live session unchanged on failure

## Recommended package boundaries

### `apps/desktop`

Owns:

- Electron entrypoints
- menus
- windows
- tray lifecycle
- preload
- OS integrations
- app startup wiring
- MCP runtime wiring

### `packages/document-core`

Owns:

- schema
- commands
- queries
- binding
- normalization
- import/export logic
- persistence adapters
- derived-state computation

### `packages/editor-ui`

Owns:

- React editor UI
- presentational components
- editor state wiring
- command intents

### `packages/ipc-contract`

Owns:

- IPC method names
- request/response types
- zod validation
- error envelope shapes

### `packages/mcp-bridge`

Owns:

- local MCP server/bootstrap
- tool definitions
- document-core adapters
- session targeting rules

## Application API shape

The renderer should talk to a high-level application API, not a bag of raw IPC channels.

Examples of good API calls:

- `listProjects()`
- `createProject(input)`
- `openProject(projectId)`
- `getActiveProject()`
- `getRuntimeCapabilities()`
- `applyCommands(projectId, commands)`
- `inspectDesignSystem(projectId)`
- `importProjectSnapshot(path)`
- `exportProjectSnapshot(projectId, destination)`
- `setMcpEnabled(enabled)`

`getRuntimeCapabilities()` should expose whether a browser measurement surface is currently available for write-capable flows.

Write-capable calls such as `applyCommands(projectId, commands)` should fail with `measurement_surface_unavailable` when no renderer-backed measurement surface exists, according to the runtime contract in `docs/product-stance.md`.

That API can be implemented over IPC, but the renderer should experience it as a typed client.

## Security posture

This app is local-first, but Electron still needs discipline.

Rules:

- context isolation on
- node integration off in the renderer
- preload only for privileged access
- no arbitrary shell execution from renderer commands
- no direct filesystem writes from React code
- no unvalidated IPC payloads
- local MCP must bind only to localhost
- local MCP must be explicit and user-visible when enabled
- v1 accepts the risk that local-machine access to the MCP listener is sufficient to inspect or mutate projects when MCP is enabled

## Initial simplifications

The first working desktop version should prefer simplicity over purity.

Allowed early compromises:

- one main window
- tray-resident lifecycle instead of a separate background daemon
- no multi-window support
- no hidden/offscreen measurement surface while the window is closed
- no auto-updater
- no plugin system
- limited import/export formats
- in-process storage and command handling

But the package boundaries should still be clean enough that those features can be added later without ripping apart the app.
