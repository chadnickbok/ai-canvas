# AI Canvas Desktop

Status: Index / non-normative map.

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

The repository currently contains the current product and implementation documentation set that guides implementation. This README is a map, not a source-of-truth contract. See `docs/README.md` for the full index and the split between contract docs, guidance docs, and release policy.

## Features

Planned and in-progress core capabilities:

- multi-scene authoring in a single project
- document-level variables and styles
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

A project contains exactly one document in v1, local design-system data, local history metadata, and references to disk-backed assets and exported artifacts.

A document is the canvas/workspace inside a project.

### Document workspace

When the editor window is open, opening a project opens its sole **document workspace** in v1.

There is no document switcher or multi-canvas project workflow in v1.

The workspace is spatial, scene-first, and document-scoped. It owns:

- scenes
- variables
- styles
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

### Design system

The design system is project-local and document-scoped.

It includes:

- variables
- styles
- semantic bindings
- provenance and usage relationships
- document-level propagation through explicit bindings

### Resolved render state

Resolved render state is split into two persisted layers:

- `render_style`, the authoritative CSS-like render-input bag
- optional `computed_layout`, the last measured layout box produced by the browser-backed renderer when that cache is available

After normalization, the semantic-mapped subset of `render_style` is semantic-owned and recomputed from authoring state. Only non-mapped `render_style` properties remain raw-only. `computed_layout` is deterministic derived/cacheable state that can be refreshed after render and rebuilt when needed.

Editor overlays and inspector panels may also show live DOM measurement from the current renderer session. That live measurement is transient runtime state, separate from the persisted `computed_layout` snapshot.

The two are refreshed through separate contracts: structural normalization repairs canonical document shape for use, while commit/autosave may run a browser-backed computed-layout refresh pass before persistence.

### MCP bridge

AI Canvas Desktop includes a first-class local MCP bridge.

The MCP bridge is built on the same document schema, command system, and semantic query logic as the UI. It is not a separate model or adapter-only layer. MCP is enabled by default, runs only on localhost on a configurable port, and stays available when the editor window closes because the app remains resident in the tray.

At the product surface, MCP targets projects. In v1, each project contains exactly one document, so the active project also implies the active document.

In v1, a window-close request is intercepted before renderer teardown. If the project is dirty or an autosave is already in flight, the window stays open until a final autosave attempt succeeds or fails. A failed or timed-out final save keeps the window open and shows blocking error UI; only a successful save or an explicit discard may continue close into tray. Once the window actually closes, the renderer and its browser-backed measurement surface are torn down. MCP inspection remains available against the active project session, but mutation or browser-capture workflows require the editor window to be reopened.

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
- one document per project in v1
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
  Shared document schema, structural normalization/repair,
  read helpers, and the foundations future command and
  semantic layers build on

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

This workspace is an active pnpm monorepo.

### Requirements

- Node.js 24+
- pnpm 10+
- a recent macOS, Windows, or Linux environment capable of running Electron

### Install

```bash
pnpm install
```

### Start desktop app

```bash
pnpm dev
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

Lint a single workspace package:

```bash
pnpm --filter @ai-canvas/editor-ui lint
```

### Format

```bash
pnpm format
```

Check formatting without writing changes:

```bash
pnpm format:check
```

Enable the repository pre-commit hook (runs Prettier on staged files):

```bash
pnpm hooks:install
```

### Build

```bash
pnpm build
```

### Verify local MCP bridge

Run the desktop app and keep it open, then run:

```bash
pnpm --filter @ai-canvas/desktop mcp:demo-slice
```

Expected result:

- JSON output with `"status": "ok"`
- an `endpoint` like `http://127.0.0.1:9311/mcp`
- a `project_id` and `document_id`

If that command succeeds, the local MCP bridge is reachable.

### Verify Codex can connect to MCP

1. In AI Canvas Desktop, confirm MCP status is running and note the endpoint (include `/mcp`).
2. In Codex MCP/connectors settings, add a server using that exact endpoint.
3. Verify connection in one of these ways:

- run `pnpm --filter @ai-canvas/desktop mcp:demo-slice` and confirm `"status": "ok"`
- or, from a shell, confirm the listener exists:

```bash
lsof -nP -iTCP:9311 -sTCP:LISTEN
```

If nothing is listening on port `9311`, MCP is not running in the desktop app.

### MCP troubleshooting

- `Cannot find package '@tailwindcss/vite'`
  Install dependencies: `pnpm install`
- `No electron app entry file found: .../out/main/index.js`
  Build workspace packages first: `pnpm build:packages`, then start app again
- Codex cannot connect but app appears open
  Verify endpoint includes `/mcp` and the app reports MCP as running

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

- `app.db` stores project records, each project's sole `current_document_json` in v1, preferences, recent projects, and local history metadata
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

This README is a map, not a source-of-truth contract. See [docs/README.md](docs/README.md) for the full classification.

Contract docs:

- [docs/product-stance.md](docs/product-stance.md)
- [docs/document-schema.md](docs/document-schema.md)
- [docs/document-normalization.md](docs/document-normalization.md)
- [docs/command-semantics.md](docs/command-semantics.md)
- [docs/command-payloads.md](docs/command-payloads.md)
- [docs/rendering-behavior.md](docs/rendering-behavior.md)
- [docs/computed-layout-refresh.md](docs/computed-layout-refresh.md)
- [docs/project-snapshot-format.md](docs/project-snapshot-format.md)

Guidance docs:

- [docs/desktop-architecture.md](docs/desktop-architecture.md)
- [docs/editor-surface-architecture.md](docs/editor-surface-architecture.md)
- [docs/local-mcp.md](docs/local-mcp.md)
- [docs/storage-model.md](docs/storage-model.md)

Policy docs:

- [docs/testing-and-release.md](docs/testing-and-release.md)

## Contributing

This project is _not_ currently accepting Pull Requests from anyone who hasn't met Nick Chadwick in-person.

If you'd like to contribute to this project, come find me at a meetup in San Francisco sometime and buy me a beer!

## Roadmap

Near-term goals:

- strong local project workflow
- scene-first editing
- stable design-system editing
- explicit semantic styling workflows
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
