# AI Canvas Desktop

AI Canvas Desktop is a local-first, scene-first mockup editor built as a standalone Electron app.

It is designed for fast visual authoring, design-system-driven editing, and local AI-assisted workflows. Projects live on your machine. Structured project state is persisted in SQLite, while assets and exported snapshots live on disk. The editor UI and the MCP bridge operate on the same document model, command system, and semantic query surface.

## Why this project exists

AI Canvas Desktop is built around a few strong ideas:

- **local-first by default** - projects, metadata, and assets stay on your machine
- **scene-first authoring** - scenes are the primary top-level content unit
- **one shared document core** - the UI and MCP use the same schema, commands, and semantic logic
- **design-system-aware editing** - variables, styles, bindings, and provenance are first-class
- **desktop-native runtime** - no mandatory backend, no required cloud service, no account setup

The goal is to make a powerful mockup and flow-design tool that feels strong both for direct human editing and for local AI-assisted authoring.

## Current status

> Experimental and actively under development.

The repository currently contains the documentation set and the product decisions that guide implementation. The document schema, normalization rules, computed-layout refresh behavior, rendering behavior, and command semantics are specified; command payload wire shapes and the project snapshot format are still being finalized.

## Features

Planned and in-progress core capabilities:

- multi-scene authoring in a single project
- document-level variables and styles
- design brief editing
- semantic bindings and resolved provenance
- deterministic, cacheable resolved render state
- local SQLite-backed project persistence
- disk-backed asset and snapshot storage
- shared command/query core
- local MCP bridge for AI-assisted inspection and mutation over localhost
- project snapshot import/export
- fixture-based validation for rendering and import/export behavior

## Core concepts

### Project

A **project** is the top-level unit of storage, editing, and MCP targeting.

A project contains one document workspace, local design-system data, local history metadata, and references to disk-backed assets and exported artifacts.

### Document workspace

A project opens into one **document workspace**.

The workspace is spatial, scene-first, and document-scoped. It owns:

- scenes
- variables
- styles
- design brief
- assets
- semantic authoring fields
- authored document state
- resolved render state

### Scene

A **scene** is the primary top-level content unit.

Scenes are used for:

- mockup flows
- grouped screens
- structured design work
- semantic restyle targeting

### Design system

The design system is project-local and document-scoped.

It includes:

- variables
- styles
- semantic bindings
- provenance and usage relationships
- document-level restyle workflows

### Resolved render state

Resolved render state is split into two persisted layers:

- `render_style`, the authoritative CSS-like render-input bag
- `computed_layout`, the last measured layout box produced by the browser-backed renderer

`render_style` is the source of layout intent. `computed_layout` is deterministic derived/cacheable state that can be refreshed after render and rebuilt when needed.

The two are refreshed through separate contracts: normalization materializes canonical render inputs for use, while commit/autosave runs a browser-backed computed-layout refresh pass before persistence.

### MCP bridge

AI Canvas Desktop includes a first-class local MCP bridge.

The MCP bridge is built on the same document schema, command system, and semantic query logic as the UI. It is not a separate model or adapter-only layer. MCP is enabled by default, runs only on localhost on a configurable port, and can stay available when the editor window closes because the app remains resident in the tray.

## Tech stack

- **Electron** for the desktop shell
- **React** for the editor UI
- **TypeScript** across the stack
- **SQLite** for project metadata and document persistence
- **disk-backed asset storage** for binary assets and exported snapshots

## Product stance

AI Canvas Desktop is:

- local-first
- single-user for v1
- single-window for v1
- offline-capable for core editing
- project-library-driven
- scene-first
- design-system-aware
- autosaved by default
- MCP-capable through an optional localhost bridge

The active project is the most recently opened project and the default MCP target when a request does not explicitly identify a project.

## Target repository layout

```text
apps/desktop
  Electron app entrypoint:
  main process, preload bridge, renderer bootstrap, tray lifecycle

packages/document-core
  Shared document schema, commands, semantic binding,
  semantic queries, normalization, persistence adapters,
  and import/export logic

packages/editor-ui
  React editor surface and UI components

packages/ipc-contract
  Typed IPC contracts between main, preload, and renderer

packages/mcp-bridge
  Local MCP integration built on document-core

docs
  Product, architecture, storage, and MCP documentation

fixtures
  Renderer and import/export fixtures
```

## Getting started

The workspace has not been scaffolded yet. The commands below describe the intended development workflow once the initial Electron/TypeScript workspace exists.

### Planned requirements

- Node.js 20+
- pnpm 9+
- a recent macOS, Windows, or Linux environment capable of running Electron

### Planned install command

```bash
pnpm install
```

### Planned desktop app command

```bash
pnpm dev
```

### Planned test command

```bash
pnpm test
```

### Planned build command

```bash
pnpm build
```

## Local storage

AI Canvas Desktop stores local data in an application data directory on your machine.

Typical structure:

```text
<AppData>/AI Canvas Desktop/
  app.db
  assets/
  exports/
  imports/
  logs/
  recovery/
```

- `app.db` stores project records, current document JSON, preferences, recent projects, and local history metadata
- `assets/` stores binary assets
- `exports/` stores exported project snapshots
- `imports/` optionally stages imported project snapshots or other source bundles
- `recovery/` stores recovery artifacts for crash or autosave flows

## Development priorities

Current implementation priorities are:

1. stable Electron shell and tray lifecycle
2. shared document core
3. local project create/open/autosave flows
4. editor UI
5. design-system workflows
6. project snapshot import/export
7. local MCP workflows
8. packaging and release hardening

## Documentation

Current docs:

- [docs/README.md](docs/README.md)
- [docs/product-stance.md](docs/product-stance.md)
- [docs/desktop-architecture.md](docs/desktop-architecture.md)
- [docs/storage-model.md](docs/storage-model.md)
- [docs/local-mcp.md](docs/local-mcp.md)
- [docs/document-schema.md](docs/document-schema.md)
- [docs/document-normalization.md](docs/document-normalization.md)
- [docs/computed-layout-refresh.md](docs/computed-layout-refresh.md)
- [docs/rendering-behavior.md](docs/rendering-behavior.md)
- [docs/command-semantics.md](docs/command-semantics.md)

Planned docs:

- `docs/command-payloads.md`
- `docs/project-snapshot-format.md`
- `docs/testing-and-release.md`

## Contributing

This project is *not* currently accepting Pull Requests from anyone who hasn't met Nick Chadwick in-person.

If you'd like to contribute to this project, come find me at a meetup in San Francisco sometime and buy me a beer!

## Roadmap

Near-term goals:

- strong local project workflow
- scene-first editing
- stable design-system editing
- semantic restyle flows
- local MCP authoring support
- reliable packaging for the first target platform

Longer-term areas of interest:

- richer import/export
- stronger recovery/versioning
- broader platform support
- better AI-assisted design workflows

## License

Released under the terms of the GNU Affero General Public License v3.0
See LICENSE.md
