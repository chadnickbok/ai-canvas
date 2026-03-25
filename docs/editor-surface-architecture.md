# Editor Surface Architecture

This document defines the edit-time visual composition of AI Canvas Desktop while a document workspace is open.

It answers:

- how the workspace is split into layers
- what each layer owns
- how viewport transforms apply across layers
- how transient interaction previews relate to committed document render
- which layers are valid screenshot and conformance targets

This document is normative for the editor workspace surface.

## 1. Authority

For editor-surface behavior, the order of authority is:

1. this document
2. the editor-surface implementation in `packages/editor-ui`
3. `docs/desktop-architecture.md`
4. `docs/rendering-behavior.md`
5. `docs/computed-layout-refresh.md`

If these disagree, update the docs and implementation in the same change.

## 2. Goals

The editor-surface architecture must:

- keep pure document rendering separable from editor-only overlays and chrome
- allow the renderer layer to be mounted independently for conformance tests, screenshots, fixture replay, and layout measurement
- allow transient edit feedback without forcing immediate mutation of rendered document content
- keep document-anchored interaction feedback aligned with rendered content during pan and zoom

The editor-surface architecture must not:

- make selection visuals, guides, or drag previews part of the canonical rendered document output
- require editor chrome to exist for renderer correctness or layout measurement
- persist transient interaction previews into the document model

## 3. Layer Stack

When a document workspace is open, the surface must be composed in this back-to-front order:

1. renderer layer
2. interaction layer
3. UI layer

This is a required v1 architecture rule, not a loose implementation preference.

The product may internally split a layer into multiple DOM subtrees, but those subtrees must behave as one conceptual layer with the same responsibilities and boundaries defined here.

## 4. Renderer Layer

The renderer layer is the browser-backed render of the normalized document.

It owns:

- rendering normalized document structure plus `render_style`
- acting as the browser measurement surface used for `computed_layout` refresh
- providing the canonical document output used for fixture replay, conformance screenshots, and renderer validation
- remaining mountable and usable without the interaction or UI layers

It must not include:

- selection rings or hover outlines
- resize handles or transform handles
- guide lines or snap indicators
- drag ghosts, insertion indicators, or speculative reflow previews
- toolbars, inspectors, panels, or dialogs

The renderer layer may participate in content hit-testing, but it must remain valid when the interaction and UI layers are absent.

## 5. Interaction Layer

The interaction layer is a transparent, document-anchored overlay above the renderer layer.

It owns transient editing visuals and direct-manipulation affordances such as:

- selection outlines and bounds
- hover outlines
- resize or transform handles
- guide lines and snap indicators
- marquee selection
- drag ghosts
- insertion indicators
- speculative flex or reflow previews
- document drop targets

The interaction layer may read:

- live geometry from the renderer layer
- persisted `computed_layout`
- viewport pan and zoom state
- active selection and gesture state

The interaction layer must not:

- become the measurement authority for persisted layout
- rewrite the document merely to show a preview
- redefine document paint order
- persist its transient state into the document model

If an element primarily depicts geometry or supports direct manipulation, it belongs in the interaction layer.

If an element primarily exposes controls or commands, it belongs in the UI layer even when it is positioned near a selection.

## 6. UI Layer

The UI layer is the topmost editor chrome layer.

It owns:

- hierarchy and scene panels
- inspector panels
- toolbars
- menus and context menus
- dialogs, sheets, and command bars
- library or design-system panels
- control popovers whose primary role is command input rather than geometry feedback

The UI layer is not part of document-space paint order.

The renderer layer must not depend on the UI layer for correctness, measurement, or conformance capture.

## 7. Viewport And Coordinate Rules

The renderer and interaction layers must share the same viewport model.

That means:

- pan and zoom transforms apply identically to both layers
- document-anchored interaction visuals remain locked to rendered content during viewport changes
- canvas-space geometry shown by the interaction layer is derived from the same visible document state the renderer is presenting

The UI layer is screen-space by default.

UI elements may position themselves using document geometry, but they remain UI-layer elements when their primary role is command input rather than geometry depiction.

## 8. Input Routing

Input routing must respect the layer boundaries.

Required behavior:

- direct-manipulation affordances such as handles, marquee starts, drag previews, and insertion targets are owned by the interaction layer
- UI controls consume their own input and must not accidentally leak gestures into the document workspace beneath them
- when no interaction affordance claims a gesture, the app may resolve selection or hit-testing against renderer-backed content
- once a drag, resize, or similar direct-manipulation gesture begins, the interaction layer keeps gesture ownership until commit or cancel

The exact event plumbing may vary by implementation, but these ownership rules must hold.

## 9. Preview And Commit Semantics

Interactive preview and committed document state are separate concerns.

During an active edit gesture:

- the renderer layer may continue showing the last committed document render
- the interaction layer may show speculative geometry, guides, or drag ghosts representing the proposed outcome

Those speculative visuals are runtime-only and must not be persisted.

On commit:

1. the app applies commands to the document model
2. normalization runs as required
3. the renderer layer re-renders committed state
4. `computed_layout` refresh runs through the normal browser-backed measurement path

On cancel, the app discards the interaction preview without mutating the persisted document.

## 10. Screenshot And Test Targets

The product should support these conceptual capture modes:

- `renderer_only`
- `renderer_plus_interaction`
- `full_editor`

`renderer_only` is the default target for renderer conformance, fixture replay, and screenshot-based rendering validation.

Tests for `renderer_only` must not require the interaction or UI layers to exist.

`renderer_plus_interaction` is appropriate for interaction-UX validation where overlays matter.

`full_editor` is appropriate for end-to-end editor UI coverage.

## 11. Non-Goals

This document does not define:

- the persisted document schema
- command payload wire shapes
- normalization policy
- renderer node semantics beyond the layer boundary
- multi-window or multi-user behavior
