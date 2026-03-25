# Desktop Architecture

This document defines the runtime architecture of the standalone Electron app.

## Goals

The app should be:

- local-first
- deterministic
- testable
- TypeScript end-to-end
- safe across Electron process boundaries
- headless/tray-capable for MCP
- easy to evolve without turning the renderer into a Node-heavy blob

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
- optional worker or utility-process orchestration

The main process should not contain editor business logic directly.

For v1, the app supports one editor window. Closing the window hides the app to the tray and does not exit the process.

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
- editor routes
- scene list
- canvas/editor chrome
- inspector
- design-system panels
- command dispatch and optimistic UI state where appropriate
- autosave and recovery status presentation
- DOM-backed rendering and post-render layout measurement used to refresh `computed_layout`

The renderer should not know about SQLite, project storage paths, OS directories, or raw MCP listener details.

### 4. Document core

`packages/document-core` is the product core.

It owns:

- the authored document schema
- schema validation
- command grammar
- command application
- binding resolution
- semantic query surface
- restyle planners and executors
- semantic resolution and `render_style` materialization
- `computed_layout` refresh contracts for browser-measured layout snapshots
- import/export normalization
- persistence mapping between DB records and domain objects

This package should be usable by:

- renderer UI
- main-process services
- local MCP bridge
- tests
- future background workers

### 5. Storage services

A storage service layer should sit in the Node-capable side of the app and own:

- SQLite access
- asset-store access
- project load and persistence
- autosave
- project session bootstrapping
- project snapshot import/export
- history checkpoints
- recovery artifacts
- migrations

The storage layer should return domain objects, not raw SQL rows.

### 6. Optional utility workers

Longer-running or heavy work should move out of the main process over time.

Examples:

- large imports
- exports
- preview rendering
- snapshot generation
- fixture replay tools
- index rebuilding

These can start in-process and later move to worker threads or Electron utility processes.

## Runtime session model

The runtime should assume:

- one editor window in v1
- one active project at a time
- the active project is the most recently opened project
- MCP tools may default to the active project when no explicit project id is provided
- command batches for a given project are serialized through one command-application path
- the tray-resident process can keep the active project session available even when no editor window is visible

SQLite is the persistence authority for structured project state. The live project session is the authoritative in-memory representation while the app is running.

The browser renderer is the layout engine. Persisted `render_style` stores layout and style intent; persisted `computed_layout` stores the most recent measured layout snapshot and is refreshed after layout-affecting changes before commit.

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
- `applyCommands(projectId, commands)`
- `inspectDesignSystem(projectId)`
- `restyleProject(projectId, request)`
- `importProjectSnapshot(path)`
- `exportProjectSnapshot(projectId, destination)`
- `setMcpEnabled(enabled)`

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
- no auto-updater
- no plugin system
- limited import/export formats
- in-process storage and command handling

But the package boundaries should still be clean enough that those features can be added later without ripping apart the app.
