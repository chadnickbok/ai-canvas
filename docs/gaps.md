# Runtime, Persistence, Snapshot, and Recovery Gaps

Status: Current-state audit / non-normative.

This document describes what the codebase does today. It is intentionally not a
new contract. The contract and guidance docs still describe the intended product
shape; this file records where the current implementation matches or trails
those docs.

## Plain terms

### Runtime

In the current codebase, "runtime" mostly means the desktop main-process project
session layer around:

- `ProjectRuntime` in `apps/desktop/src/main/runtime/projectRuntime.ts`
- `ProjectStore` in `apps/desktop/src/main/runtime/projectStore.ts`
- the Electron IPC/preload bridge in `apps/desktop/src/main/registerIpc.ts`,
  `apps/desktop/src/preload/index.ts`, and `packages/ipc-contract/src/index.ts`
- the renderer-backed computed-layout measurement bridge in
  `apps/desktop/src/main/rendererLayoutMeasurementBridge.ts` and
  `apps/desktop/src/renderer/CommitLayoutMeasurementHost.tsx`
- the local MCP bridge wiring in `apps/desktop/src/main/createProjectService.ts`
  and `packages/mcp-bridge/src/index.ts`

It is not a separate durable engine, event log, or state-machine framework. The
current runtime keeps the active project session in memory, delegates durable
storage to `ProjectStore`, and reports a small capability object to the
renderer.

### Automatic persistence today

The current persistence model is commit-on-command. There is no user-facing
manual save action, and every successful edit is persisted automatically before
the renderer is told about the changed document. The save happens during command
application:

1. a UI or MCP caller sends a command batch,
2. `ProjectRuntime` applies it,
3. computed layout is refreshed if needed,
4. `ProjectStore.saveProjectDocument` writes the new document and revision to
   SQLite.

There is no delayed save timer, dirty queue, pending/in-flight/error save state,
retry UI, or close-blocking final-save workflow. That is now the documented
contract, not a deviation from it.

### Snapshot

"Snapshot" currently means two different things in the repository:

- Implemented: undo/redo history stores document snapshots in
  `project_history.undo_json` and `project_history.redo_json`.
- Planned by docs: portable `.aicp` project snapshots for import, export,
  backup and restore, as described in `docs/project-snapshot-format.md`.

Only the undo/redo document-snapshot meaning exists in runtime code today. The
portable project snapshot format is documented but not implemented as an
import/export API.

### Recovery today

Recovery today is durable restart behavior: if a command successfully commits,
reopening the project loads that durable SQLite state. If the process exits
before a command commits, reopening loads the previous committed revision.
Persisted undo/redo history is stored with the project.

The codebase intentionally does not create a separate checkpoint directory,
detect newer checkpoint artifacts on restart, or prompt the user to accept or
decline alternate recovered state.

## Current implementation map

The desktop app has four relevant layers:

- **Renderer UI**: `apps/desktop/src/renderer/App.tsx` owns app screen state and
  receives runtime events. `packages/editor-ui` builds command batches from
  gestures, inspector edits, delete actions, and undo/redo controls.
- **IPC/preload contract**: `packages/ipc-contract/src/index.ts`,
  `apps/desktop/src/preload/index.ts`, and
  `apps/desktop/src/main/registerIpc.ts` expose create/open/list/get-active,
  apply-commands, undo/redo, runtime capabilities, MCP status, and layout
  measurement.
- **Main runtime**: `ProjectRuntime` owns the active in-memory project session,
  active history stacks, command serialization, capability reporting, and event
  emission.
- **Storage**: `ProjectStore` owns SQLite rows, project revisions, current
  document JSON, project asset metadata, and persisted undo/redo history.

Document mutation itself lives in `packages/document-core/src/applyCommands.ts`.
That package validates command envelopes, checks `document_id` and
`base_revision`, applies command semantics, normalizes the document, and asks
the runtime to refresh computed layout when changed nodes need measurement.

## Current open -> load -> edit -> save loop

### 1. App boot

`apps/desktop/src/main/index.ts` creates the process-level objects:

- `ProjectStore` at `app.getPath('userData')/app.db`
- `ProjectRuntime`
- `RendererLayoutMeasurementBridge`
- `LocalMcpBridge`
- the Electron `BrowserWindow`
- IPC handlers through `registerIpc`

The main window sets the runtime measurement surface to available after
`did-finish-load`. When the window closes, it sets measurement unavailable,
rejects pending layout measurements, and clears the `mainWindow` reference.

### 2. Renderer load

`App.tsx` loads initial state by calling these preload API methods in parallel:

- `listProjects`
- `getActiveProject`
- `getHistoryState`
- `getRuntimeCapabilities`
- `getMcpStatus`

If there is an active project, the renderer shows the workspace. Otherwise it
shows the project library. Runtime events later update the same state through
`projects_changed`, `active_project_changed`, `document_changed`,
`history_state_changed`, `runtime_capabilities_changed`, and
`mcp_status_changed`.

### 3. Create project

Creating a project goes through:

- `App.tsx` -> `api.createProject`
- `registerIpc.ts` -> `runtime.createProject`
- `ProjectRuntime.createProject`
- `ProjectStore.createProject`

`ProjectStore.createProject` creates a project id and document id, creates an
empty document, opens a SQLite transaction, inserts a `projects` row with
`current_document_json`, revision `1`, `source_kind = 'new'`, and
`last_opened_at`, inserts an empty `project_history` row, commits, and returns
the stored project.

`ProjectRuntime.createProject` then sets that project as the active session,
loads empty history, emits project/active/history/capability events, and returns
the project summary.

### 4. Open project

Opening a project goes through:

- `App.tsx` -> `api.openProject`
- `registerIpc.ts` -> `runtime.openProject`
- `ProjectRuntime.openProject`
- `ProjectStore.getProject`
- `ProjectStore.markOpened`

`ProjectStore.getProject` reads `current_document_json`, hydrates asset-store
metadata from `project_assets`, normalizes the document with fallback ids/name,
resolves asset URLs, and returns the stored project.

`ProjectRuntime.openProject` does not switch the active session until
`getProject` succeeds. If loading fails or the project is missing, the previous
active session remains in place. After a successful load it calls `markOpened`,
loads persisted history, sets the active session, and emits state events.

One nuance: `markOpened` updates both `last_opened_at` and `updated_at`. Opening
a project mutates project metadata, but it does not mutate document content.

### 5. UI edit command creation

The editor UI does not directly mutate storage. It creates command batches.
Examples:

- inspector fill changes in `DocumentWorkspaceScreen.tsx` emit `update_node`
- delete selection emits `delete_node` or `delete_scene`
- move/resize in `useInteractionController.ts` emits `update_node` or
  `update_scene`
- create-tool clicks emit `create_node`, with an optional parent style update

These command batches include the active `document_id` and current
`base_revision`.

### 6. Apply commands through IPC

`App.tsx` sends command batches through `api.applyCommands`. If the result is a
base-revision mismatch, it fetches the latest active project and retries the same
batch with the latest revision.

The main process validates the payload in `registerIpc.ts` and calls
`ProjectRuntime.applyCommands`. MCP mutations use the same internal runtime path
through `ProjectRuntime.applyProjectCommands`.

Before applying commands, `ProjectRuntime` requires:

- an active session,
- the command `document_id` to match the active document,
- a measurement surface to be available.

The measurement surface is available only when the runtime has both the
measurement flag set and a computed-layout refresher attached.

### 7. Document-core application and layout refresh

`packages/document-core/src/applyCommands.ts` does the document-level work:

- normalizes the current document,
- validates command input,
- rejects a mismatched `document_id`,
- rejects a mismatched `base_revision`,
- rejects non-empty command batches when the measurement surface is unavailable,
- applies command handlers,
- normalizes again,
- materializes semantic render state,
- asks the runtime to refresh computed layout for changed nodes when needed.

The refresh callback installed by `apps/desktop/src/main/index.ts` sends a layout
measurement request to the renderer. `CommitLayoutMeasurementHost.tsx` renders
the document in a hidden measurement host, measures requested subtrees, and
returns `computed_layout` data. The main process applies those measurements to
the document before persistence.

This means current write-capable command execution depends on a live renderer
window. The code intentionally does not keep a hidden/headless measurement
surface after the editor window is gone.

### 8. Durable save

After document-core returns a changed document, `ProjectRuntime` creates a
pre-edit history entry, builds the next undo/redo stacks, and calls
`ProjectStore.saveProjectDocument`.

`saveProjectDocument` opens a SQLite transaction and performs an optimistic
revision update:

- update `projects.current_document_json`,
- increment `projects.revision`,
- update `projects.updated_at`,
- require the current row revision to equal the expected revision,
- replace project asset metadata rows for `asset_store` assets,
- write undo/redo JSON when history was provided,
- commit.

If the project row is missing, the save returns `not_found`. If the row exists
but the revision does not match, it returns `revision_conflict`.

### 9. Renderer update after save

After persistence succeeds, `ProjectRuntime` updates its active in-memory
session and emits:

- `projects_changed`
- `active_project_changed`
- `document_changed`
- `history_state_changed`

`App.tsx` applies those events and replaces the visible active project document
with the saved document returned by the runtime event.

### 10. Undo and redo

Undo/redo are implemented in `ProjectRuntime.applyHistoryTraversalInternal`.
They use persisted document snapshots from the runtime history stacks, finalize
the target document through `finalizeCommittedDocument`, save through
`ProjectStore.saveProjectDocument`, update history stacks, increment the project
revision, and emit the same visible state events.

Undo/redo also require the measurement surface. If the renderer measurement
surface is unavailable, they return `measurement_surface_unavailable`.

### 11. Close and read-only behavior

Current close behavior is simple:

- closing the window marks measurement unavailable,
- pending measurement requests are rejected,
- write-capable command execution fails with `measurement_surface_unavailable`,
- runtime capabilities report `read_only` when there is no active session or no
  measurement surface.

The current runtime capability state is only:

- `no_project_open` when no active session exists,
- `editor_open_clean` when an active session exists.

There is no separate implemented state for dirty, pending save, in-flight save,
save error, final-save, app exiting, or closed inspection-only.

## Gap inventory

### Runtime state status

`docs/product-stance.md` now defines the implemented simple runtime model. The
code exposes only `no_project_open` and `editor_open_clean` as `runtimeState`,
plus `read_write` or `read_only` as `mode`.

The remaining limitation is naming precision: `editor_open_clean` means an
active project session exists, not necessarily that a renderer window is
currently visible. Window/measurement availability is represented separately by
`measurementSurfaceAvailable` and `mode`.

### Automatic persistence status

Current edits are persisted immediately as part of each successful command. That
is the documented persistence contract, and it explains why the app can reopen
the last committed edit.

What is intentionally not part of the current runtime contract:

- dirty tracking separate from durable revision,
- coalesced save timer,
- pending/in-flight save state,
- non-blocking save error state,
- final-save-on-close state,
- retry/keep-editing/discard close-error actions,
- save-status UI.

### Crash durability status

The current app treats a closed editor window as "no measurement surface" for
writes. It also does not implement a separate checkpoint workflow:

- no tray object was found in the Electron main process,
- no checkpoint artifacts are written,
- no restart-time checkpoint scan or alternate-state prompt exists.

The durable SQLite save path is still useful crash resistance for completed
commands. That is now the documented recovery model for the launch product.

### Snapshot import/export gap

`docs/project-snapshot-format.md` defines a portable `.aicp` bundle format for
export, import, backup, and restore.

The current IPC contract, preload API, runtime, store, and MCP bridge do not
expose import/export snapshot operations. The implemented storage model is the
live SQLite/project-asset-store model, not the portable snapshot bundle model.

### Test gap

Current tests cover important implemented behavior:

- project create/open,
- failed open preserving the active session,
- command persistence and revision increments,
- computed-layout refresh through test refreshers,
- asset persistence and embedded-asset migration,
- undo/redo and persisted history across reopen,
- MCP mutation through the shared runtime path,
- read-only write failure when measurement is unavailable.

Current tests do not cover behavior outside the implemented current runtime:

- portable snapshot import/export.

## What is already true

These parts should not be treated as gaps:

- There is a durable save path for successful edits.
- The save path is automatic; users do not need to click Save after each edit.
- Project open failure preserves the previous active runtime session.
- Document mutation is shared by UI and MCP through the same runtime command
  path.
- Project revisions are optimistic and persisted in SQLite.
- Undo/redo history is persisted locally and survives reopen.
- Asset-store metadata is stored outside `current_document_json` and hydrated
  back into the document on load.
- Write-capable commands fail when the renderer-backed measurement surface is
  unavailable.

## Verification snapshot

At the time of this audit, `pnpm test` passed with:

- `@ai-canvas/document-core`: 8 files, 31 tests
- `@ai-canvas/editor-ui`: 9 files, 66 tests
- `@ai-canvas/mcp-bridge`: 1 file, 9 tests
- `@ai-canvas/desktop`: 7 files, 39 tests
