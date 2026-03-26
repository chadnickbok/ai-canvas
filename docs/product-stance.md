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
- autosave-first rather than manual-save-first
- library-backed rather than raw-file-backed for v1

The active project is the most recently opened project.

When the editor window is open, opening the active project opens its sole document workspace. V1 does not include document switching within a project.

Closing the editor window does not quit the app. The v1 dirty-state, autosave, measurement-surface, close-to-tray, and MCP-capability behavior is defined by the runtime lifecycle contract below.

### Runtime lifecycle contract

The runtime exposes these outer states:

- `no_project_open`
- `app_exiting`

When an active project session exists, the runtime must be in exactly one of these editor-session states:

| State | Dirty state | Save state | Measurement surface | MCP mode | Close behavior | Required user-visible state |
| --- | --- | --- | --- | --- | --- | --- |
| `editor_open_clean` | no unsaved in-memory changes | no autosave scheduled or in flight | available | `read_write` | may close immediately | normal editable window with no save error |
| `editor_open_dirty_autosave_pending` | dirty | autosave scheduled but not yet in flight | available | `read_write` | close cannot complete; close request escalates to final-save flow | non-blocking dirty or autosave-pending UI |
| `editor_open_autosave_in_flight` | dirty until the save resolves and no newer edits remain | autosave in flight | available | `read_write` | close cannot complete; close request joins the final-save flow | non-blocking saving UI |
| `editor_open_autosave_error` | dirty | no save in flight; last autosave failed | available | `read_write` | close cannot complete; close request starts final-save flow | non-blocking save-error UI while editing may continue |
| `close_blocked_final_save_in_flight` | dirty until final save succeeds or discard happens | final save in flight or currently awaited | available | `read_write` | close remains blocked | blocking save-in-progress UI |
| `close_blocked_final_save_error` | dirty | no save in flight; last final-save attempt failed or timed out | available | `read_write` | close remains blocked until retry, keep-editing, or discard | blocking error UI with `Retry Save`, `Keep Editing`, and `Discard and Close` |
| `editor_closed_inspection_only` | no unsaved in-memory changes remain authoritative | no save in flight | unavailable | `read_only` | window is already closed | no editor window; tray-resident inspection-only runtime |

V1 does not keep a hidden or headless measurement surface outside these states.

The required transitions are:

- `edit_makes_document_dirty` moves `editor_open_clean` to `editor_open_dirty_autosave_pending`
- further edits in `editor_open_dirty_autosave_pending` stay pending and coalesce behind one autosave attempt
- `autosave_timer_fires` moves `editor_open_dirty_autosave_pending` to `editor_open_autosave_in_flight`
- `autosave_succeeds` moves `editor_open_autosave_in_flight` to `editor_open_clean` only if no newer unsaved edits remain; otherwise it returns to `editor_open_dirty_autosave_pending`
- `autosave_fails` moves `editor_open_autosave_in_flight` to `editor_open_autosave_error`
- `close_requested` from any dirty open-editor state moves into `close_blocked_final_save_in_flight`
- if close arrives while autosave is already in flight, the runtime first awaits that attempt; if newer unsaved edits still remain after it succeeds, the runtime must immediately start another final save attempt and stay in `close_blocked_final_save_in_flight`
- `final_save_succeeds` moves `close_blocked_final_save_in_flight` to `editor_closed_inspection_only`
- `final_save_fails` or close-save timeout moves `close_blocked_final_save_in_flight` to `close_blocked_final_save_error`
- `retry_save` moves `close_blocked_final_save_error` to `close_blocked_final_save_in_flight`
- `keep_editing` moves `close_blocked_final_save_error` to `editor_open_autosave_error`
- `discard_and_close` moves `close_blocked_final_save_error` to `editor_closed_inspection_only` using the last durable persisted state
- `close_requested` from `editor_open_clean` moves directly to `editor_closed_inspection_only`
- `reopen_window` moves `editor_closed_inspection_only` to `editor_open_clean`
- `explicit_quit` from `editor_closed_inspection_only` moves to `app_exiting`

The runtime must not transition into `editor_closed_inspection_only` before a successful close or an explicit discard.

### Runtime operation guarantees

The v1 runtime must also guarantee:

- opening a project does not switch the active project session or visible workspace until load and normalization succeed
- importing a snapshot does not expose a partial imported project for editing and does not switch the active project session before import persistence succeeds
- exporting a snapshot does not change the active project session or MCP capability mode, and export failure leaves session state unchanged
- normal autosave failure while the editor window remains open is not `measurement_surface_unavailable`
- `read_only` begins only after the window actually closes and the browser-backed measurement surface is gone

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
- autosave
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

- the desktop app can create, open, edit, and autosave local projects
- scene-first authoring feels stable
- document-level variables and styles propagate correctly
- explicit semantic styling workflows behave predictably
- import/export work for the supported project snapshot format
- the optional local MCP bridge can inspect the same live project session even after the window closes
- the optional local MCP bridge can mutate the same live project through the shared command/query core while the editor window is open
- MCP inspection remains available after the window closes until the user explicitly quits the tray app
