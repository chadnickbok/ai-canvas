# Product Stance

Status: Normative contract.

This document defines the product boundary for AI Canvas Desktop.

## Current product stance

AI Canvas Desktop is a standalone Electron app for local scene-first mockup authoring.

The canonical product story is:

- a **project** is the top-level unit of creation, editing, persistence, and MCP targeting
- a **document** is a canvas/workspace inside a project
- when the editor window is open, opening a project enters its sole **document workspace** in v1
- each project contains exactly one document in v1
- **scenes** are the primary top-level content unit inside a document
- project state is split between structured data in SQLite and large/binary artifacts on disk
- export creates a portable **project snapshot** that contains exactly one project and one document in v1, and import creates a new local project
- the document owns variables, styles, assets, semantic authoring fields, and authored document state
- resolved render state is deterministic derived/cacheable state, not the canonical authored state

The editor, local persistence layer, and optional local MCP bridge all read and write the same document model.

## Runtime stance

The desktop app is:

- single-user for v1
- single-window for v1
- one document per project for v1
- automatic commit-on-command rather than manual-save-first
- library-backed rather than raw-file-backed for v1

The active project is the most recently opened project.

When the editor window is open, opening the active project opens its sole document workspace. V1 does not include document switching within a project.

Closing the editor window does not quit the app. The v1 project-session, automatic persistence, measurement-surface, and MCP-capability behavior is defined by the runtime lifecycle contract below.

### Runtime lifecycle contract

The current runtime exposes these `runtimeState` values:

- `no_project_open`
- `editor_open_clean`

`editor_open_clean` means an active project session exists and there is no queued unsaved command state. The name is retained as the current API value; renderer/window availability is reported separately through `measurementSurfaceAvailable` and `mode`.

| Runtime state       | Active project session | Unsaved command state | Measurement surface             | Capability mode                                                  | Write behavior                                                          | User-visible state                      |
| ------------------- | ---------------------- | --------------------- | ------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `no_project_open`   | no                     | none                  | may be available or unavailable | `read_only`                                                      | no mutation target exists                                               | project library, if a window is visible |
| `editor_open_clean` | yes                    | none                  | available or unavailable        | `read_write` only when measurement exists; otherwise `read_only` | successful commands commit immediately; writes fail without measurement | workspace, if a window is visible       |

V1 does not keep a hidden or headless measurement surface after the editor window closes.

The required transitions are:

- app startup begins in `no_project_open` unless a project is opened or created
- successful `createProject` opens the created project and moves to `editor_open_clean`
- successful `openProject` moves to `editor_open_clean`
- failed `openProject` leaves the previous active session and visible workspace unchanged
- successful command application, undo, and redo persist immediately to SQLite, emit runtime events, increment the durable project revision, and remain in `editor_open_clean`
- failed command application, undo, and redo leave the active document and durable project state unchanged
- renderer load makes the measurement surface available; with an active project session this makes the runtime `read_write`
- renderer/window close makes the measurement surface unavailable; with an active project session this makes the runtime `read_only`
- reopening the editor window restores `read_write` once the renderer-backed measurement surface is available again
- explicit app quit closes the runtime and MCP bridge; no separate `app_exiting` runtime state is exposed

### Runtime operation guarantees

The v1 runtime must also guarantee:

- opening a project does not switch the active project session or visible workspace until load and normalization succeed
- successful document edits are durably persisted before `document_changed` is emitted
- failed document edits leave the active document and durable project state unchanged
- write-capable command execution requires an active project session and an available renderer-backed measurement surface
- `read_only` applies whenever there is no active project session or the measurement surface is unavailable
- the runtime does not queue writes for deferred replay while `read_only`

## Current excluded scope

The desktop app does not include these concepts as part of the core product:

- auth
- users
- orgs
- personal access tokens
- remote control-plane storage
- realtime multi-user presence
- remote-change replay
- browser route handoff from a backend
- mandatory network connectivity
- multiple documents per project

## Offline-first rule

Core editing workflows must not depend on a running server or cloud service.

The following should work locally:

- create project
- open project
- edit document
- edit scenes
- edit variables and styles
- apply explicit semantic styling edits locally
- automatic persistence
- undo and redo
- import and export project snapshots

## MCP stance

MCP is a first-class feature of the desktop product, but it is not the foundation of the runtime.

That means:

- the editor must work without MCP
- MCP is enabled by default but can be disabled
- MCP must use the same command/query/document core as the UI
- MCP must not introduce a second semantic model
- MCP runs only on localhost on a configurable port
- closing the editor window must not interrupt MCP inspection workflows
- write or browser-capture MCP workflows may be unavailable until the editor window is reopened
- v1 accepts local-machine trust rather than introducing stronger auth boundaries

## Product boundaries

The current product story does not include:

- cloud collaboration
- team libraries
- live multi-user cursors or selections
- permission systems
- backend-owned revisions
- network-required sync
- browser-hosted editing as a canonical surface
- multi-window editing
- multi-document project workflows

## Launch bar

The desktop rewrite is ready when all of the following are true:

- the desktop app can create, open, edit, and automatically persist local projects
- scene-first authoring feels stable
- document-level variables and styles propagate correctly
- explicit semantic styling workflows behave predictably
- import/export work for the supported project snapshot format
- the optional local MCP bridge can inspect the same live project session even after the window closes
- the optional local MCP bridge can mutate the same live project through the shared command/query core while the editor window is open
- MCP inspection remains available after the window closes until the user explicitly quits the app
