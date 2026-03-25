# Product Stance

This document defines the product boundary for AI Canvas Desktop.

## Current product stance

AI Canvas Desktop is a standalone Electron app for local scene-first mockup authoring.

The canonical product story is:

- a **project** is the top-level unit of creation, editing, persistence, and MCP targeting
- opening a project enters one **document workspace**
- **scenes** are the primary top-level content unit
- project state is split between structured data in SQLite and large/binary artifacts on disk
- export creates a portable **project snapshot** that can be imported later as a new project
- the document owns variables, styles, design brief, assets, semantic authoring fields, and authored document state
- resolved render state is deterministic derived/cacheable state, not the canonical authored state

The editor, local persistence layer, and optional local MCP bridge all read and write the same document model.

## Runtime stance

The desktop app is:

- single-user for v1
- single-window for v1
- autosave-first rather than manual-save-first
- library-backed rather than raw-file-backed for v1

The active project is the most recently opened project.

Closing the editor window does not quit the app. In v1, closing the window tears down the editor renderer and its browser-backed measurement surface, then leaves the app resident in the tray. MCP can continue to target the active project session for inspection, but mutation and browser-capture workflows require the editor window to be reopened. Explicit quit from the tray or app menu shuts down the runtime and the MCP server.

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

## Offline-first rule

Core editing workflows must not depend on a running server or cloud service.

The following should work locally:

- create project
- open project
- edit document
- edit scenes
- edit variables and styles
- restyle locally
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

## Launch bar

The desktop rewrite is ready when all of the following are true:

- the desktop app can create, open, edit, and autosave local projects
- scene-first authoring feels stable
- document-level variables and styles propagate correctly
- semantic restyle works locally
- import/export work for the supported project snapshot format
- the optional local MCP bridge can inspect the same live project session even after the window closes
- the optional local MCP bridge can mutate the same live project through the shared command/query core while the editor window is open
- MCP inspection remains available after the window closes until the user explicitly quits the tray app
