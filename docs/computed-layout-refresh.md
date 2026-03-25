# AI Canvas Computed Layout Refresh

This document defines how AI Canvas Desktop refreshes `computed_layout` from the browser-backed renderer before persistence.

It answers:

- when computed-layout refresh runs
- what inputs it requires
- which nodes must be refreshed
- what invariants it preserves
- how commit and autosave depend on it

This document is normative.

## 1. Authority

For computed-layout refresh behavior, the order of authority is:

1. this document
2. the machine-readable layout refresh logic in `packages/document-core`
3. `docs/command-semantics.md`
4. `docs/document-schema.md`
5. `docs/rendering-behavior.md`

If these disagree, update the docs and implementation in the same change.

## 2. Goals

Computed-layout refresh must:

- start from a normalized, materialized document
- let the browser-backed renderer resolve layout from structure plus `render_style`
- measure resolved geometry for every affected node
- write fresh `computed_layout` without rewriting authored inputs in `render_style`
- preserve relative, flexible, or omitted layout inputs exactly as authored
- produce persisted layout snapshots that match what the editor most recently resolved and displayed

Computed-layout refresh must not:

- repair schema or semantic state ad hoc
- invent missing structure
- rewrite relative or flexible width/height into pixels just to mirror computed output
- silently skip affected nodes during commit or autosave

## 3. Prerequisite

Computed-layout refresh only runs on a document that has already passed normalization for use.

That means the input document already has:

- canonical required containers
- repaired structure and references
- recomputed derived fields
- resolved semantic slots
- materialized render-facing values in `render_style`
- a live browser-backed measurement surface

If those conditions are not met, the caller must normalize first.

## 4. When Computed-Layout Refresh Runs

Computed-layout refresh runs at these boundaries:

### 4.1 Before commit

Every command or edit path that persists an updated document must refresh `computed_layout` for affected nodes before commit.

If no browser-backed measurement surface is available, the write must fail with `measurement_surface_unavailable` before persistence.

### 4.2 Before autosave

Autosave follows the same requirement as commit.

In v1, if the editor window has been closed and no measurement surface remains, autosave must not persist the document as though a fresh layout snapshot exists.

### 4.3 Optional explicit refresh

The app may also run computed-layout refresh opportunistically after interactive renders or other explicit refresh requests.

That does not change the normalization contract.

## 5. Output Shape

`computed_layout` stores:

- `x`
- `y`
- `width`
- `height`

These values are canvas-space resolved geometry.

## 6. Affected-Node Scope

If a change causes layout to reflow, the app must refresh `computed_layout` for every node whose resolved geometry changed.

This includes:

- the directly changed node
- descendants whose sizes or positions changed because of flex, percentage, or other dependent layout
- ancestors whose resolved geometry changed because of child layout

Refreshing only the originally edited node is not sufficient.

## 7. Relative and Flexible Inputs

Some layout inputs may be authored in a relative or flexible way, for example:

- percentages
- omitted width or height
- fit-content-like behavior
- flex-driven sizing

In these cases:

- `render_style` MUST preserve those inputs as authored
- `computed_layout` MUST store only the latest concrete resolved box
- refresh MUST NOT rewrite relative or flexible inputs into absolute pixels

## 8. Missing or Stale Computed Outputs

Because `computed_layout` is derived and cacheable, persisted documents may arrive with missing or stale computed outputs.

That is allowed during normalization and first render.

Before commit or autosave, refresh must repair that by re-running the browser-backed measurement path and writing fresh `computed_layout`.

Broken or stale outputs must never override surviving valid inputs.

The last persisted `computed_layout` may still be used for inspection while the app is running without an editor window, but it does not authorize new persisted mutations.

## 9. Failure Behavior

If commit or autosave requires computed-layout refresh and the browser-backed measurement path cannot run successfully, the document must not be persisted as though it has a current layout snapshot.

The caller may keep the document in memory, retry refresh, or surface a save failure, but it must not silently write a falsely current `computed_layout`.

In v1, a closed editor window is one concrete case where refresh is unavailable because no measurement surface remains. The runtime should therefore expose a clear `measurement_surface_unavailable` failure rather than implying that a hidden or headless renderer exists.

## 10. Non-Goals of This Document

This document does not define:

- schema repair policy
- semantic resolution rules
- renderer implementation details beyond layout measurement requirements
- command payload wire shapes
