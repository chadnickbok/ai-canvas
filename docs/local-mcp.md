# Local MCP

This document defines the MCP strategy for AI Canvas Desktop.

## Product stance

MCP remains a critical feature, but it is not the foundation of the desktop runtime.

The desktop UI must work fully without MCP.

The MCP server must continue to work when the editor window is closed because the app remains resident in the tray. In v1, that closed-window mode is inspection-only because the renderer and its browser-backed measurement surface are not kept alive after the editor window closes. Only explicitly quitting the tray app should shut down the MCP server.

MCP is a local bridge over the same command/query/document core used by the UI.

## Goals

The local MCP bridge should let an agent:

- list local projects
- open and inspect a project
- inspect scenes
- inspect the design system
- apply document commands when a live browser measurement surface is available
- run semantic restyle workflows when a live browser measurement surface is available
- promote selections or targets into styles or variables when a live browser measurement surface is available
- verify results against the same current project model the UI sees

The assumptions are:

- trust is local
- the data source is local storage plus the live project session
- the live project session is the source of truth while a project is open
- SQLite is the persistence authority between sessions
- no auth token is needed for the core local workflow

## Transport

### Preferred v1 stance

Support a local MCP bridge over localhost only.

### Localhost mode

Localhost transport:

- must be on by default
- must be user-disabled
- must bind only to localhost
- must expose a configurable, user-visible port
- must make it easy to enable, disable, and reconfigure
- must visibly show when MCP is enabled and what port it is using

## Runtime model

The MCP runtime should assume:

- the Electron app starts the MCP listener by default
- closing the editor window keeps the app resident in the tray and leaves MCP running
- closing the editor window tears down the renderer and its browser-backed measurement surface in v1
- when no measurement surface is available, MCP remains read-only until the editor window is reopened
- explicitly quitting the tray app shuts down MCP
- the app supports one active project at a time in v1
- the active project is the most recently opened project
- mutations against a project are serialized through the same single-threaded command path used by the UI

## Architecture

The MCP bridge should be implemented on top of `packages/document-core`, not on top of renderer internals.

Good architecture:

- local MCP tool calls
- shared tool adapters
- document-core command/query functions
- local project session and storage services
- one serialized command-application path per project

Bad architecture:

- MCP tools scraping React state
- MCP tools inventing a second semantic model

## Capability modes

The local MCP bridge exposes two runtime capability modes:

- `read_write`, when the editor window and browser-backed measurement surface are available
- `read_only`, when the tray-resident app is running without an editor window

In `read_only` mode:

- inspect/query tools remain available
- mutation tools must fail fast with `measurement_surface_unavailable`
- browser-capture workflows such as screenshots must fail fast with `measurement_surface_unavailable`
- the bridge must not queue writes for later replay

## Project targeting

The MCP layer should work against a clear local project/session model.

Recommended stance:

- tools can target a project by id
- when one project is active, tools may default to the active project
- tools should still allow explicit project targeting to avoid ambiguity

## Initial MCP surface

Recommended initial read tools:

- `list_projects`
- `inspect_project`
- `inspect_tree`
- `inspect_node`
- `inspect_design_system`
- `inspect_scenes`

Recommended initial mutation tools:

- `create_project`
- `apply_commands`
- `update_design_system`
- `promote_selection_to_style`
- `create_variables_from_selection`

These mutation tools are available only in `read_write` mode.

## Security and UX rules

Because MCP is a core feature of the app, the app should make it a first-class feature.

Recommended rules:

- MCP is on by default
- disabling it is explicit
- the app shows when MCP is active
- the app shows the configured port
- mutation and capture failures caused by a closed editor window should clearly instruct the caller to reopen the editor window
- dangerous project-destructive operations should be clear and intentional
- the bridge should stay localhost-only unless a later product decision explicitly changes that
- v1 accepts that any process or person with local-machine access to the listener can inspect projects whenever MCP is enabled and mutate them when the measurement surface is available

## Launch bar

Local MCP is ready when:

- it can inspect the same live project session the UI sees
- it can mutate the same project through the same command/query core while the editor window is open
- design-system workflows behave the same in UI and MCP paths
- it remains available for inspection after the editor window closes until the user explicitly quits the tray app
- write and browser-capture workflows fail clearly with `measurement_surface_unavailable` while the window is closed
