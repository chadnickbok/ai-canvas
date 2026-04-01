# Local MCP

Status: Implementation guidance.

This document defines the recommended v1 local MCP surface and runtime integration shape.

Related contracts:

- `docs/product-stance.md` for product/runtime behavior and capability states
- `docs/command-semantics.md` and `docs/command-payloads.md` for mutation contracts
- `docs/document-schema.md` for inspection shape

MCP is a local bridge over the same command/query/document core used by the UI.

## V1 goals

The local MCP bridge should let an agent:

- list local projects
- open and inspect a project
- inspect scenes
- inspect the design system
- apply document commands when a live browser measurement surface is available
- run explicit semantic styling workflows when a live browser measurement surface is available
- promote selections or targets into styles or variables when a live browser measurement surface is available
- verify results against the same current project model the UI sees

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

## Runtime integration

The MCP bridge should be implemented on top of `packages/document-core`, not on top of renderer internals or scraped React state.

It should use the same serialized command-application path and the same live project session the UI uses.

## Capability modes

The local MCP bridge exposes two runtime capability modes.

These map directly onto the runtime states defined in `docs/product-stance.md`:

- `read_write`, in all editor-open states and both close-blocked final-save states
- `read_only`, in `editor_closed_inspection_only`

In `read_only` mode:

- inspect/query tools remain available
- mutation tools must fail fast with `measurement_surface_unavailable`
- browser-capture workflows such as screenshots must fail fast with `measurement_surface_unavailable`
- the bridge must not queue writes for deferred replay

Normal autosave failure while the editor window remains open does not change MCP out of `read_write`.

## Project targeting

The MCP layer should work against a clear local project/session model.

Recommended stance:

- tools can target a project by id
- when one project is active, tools may default to the active project
- v1 does not add separate document-targeting or document-switching MCP surface because the targeted project's sole document is implied
- tools should still allow explicit project targeting to avoid ambiguity

## Initial MCP surface

Recommended initial read tools:

- `list_projects`
- `open_project`
- `inspect_project`
- `inspect_tree`
- `inspect_node`
- `inspect_design_system`
- `inspect_scenes`

Recommended initial mutation tools:

- `create_project`
- `apply_commands`
- `promote_selection_to_style`
- `create_variables_from_selection`

For the first implemented pass, ship `create_project` and `apply_commands`, and defer the selection-derived mutation helpers until the runtime exposes the additional selection and styling workflow state they need.

These mutation tools are available only in `read_write` mode.

## First implemented pass

The first implemented MCP pass should:

- expose the core project targeting and inspection tools
- expose `apply_commands` against the shared runtime session while the editor measurement surface is available
- persist normalized document state and returned revision/effects through the same runtime path the UI uses
- explicitly defer browser-backed `computed_layout` refresh to a later stage

That means:

- `apply_commands` succeeds only while the runtime is in `read_write`
- successful first-pass mutation responses should make it clear that computed-layout refresh was skipped because that stage is not implemented yet
- callers should not treat first-pass mutation success as a guarantee that `computed_layout` is fresh
- browser-capture and other layout-fresh workflows remain later-stage work

## Security and UX rules

Because MCP is a core feature of the app, the app should make it a first-class feature.

Recommended rules:

- MCP is on by default
- disabling it is explicit
- the app shows when MCP is active
- the app shows the configured port
- mutation and capture failures caused by a closed editor window should clearly instruct the caller to reopen the editor window
- dangerous project-destructive operations should be clear and intentional
- the bridge stays localhost-only
- v1 accepts that any process or person with local-machine access to the listener can inspect projects whenever MCP is enabled and mutate them when the measurement surface is available
