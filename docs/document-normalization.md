# AI Canvas Document Normalization

This document defines how AI Canvas Desktop converts a persisted document into the canonical normalized in-memory form used by:

- the editor
- the renderer
- command application
- local MCP
- save and autosave flows

Normalization is the process that makes documents safe, complete, and deterministic before they are used.

It answers:

- what a normalized document is
- when normalization runs
- what gets repaired
- what gets dropped
- what gets recomputed
- how semantic state is materialized into render-input state
- what normalization guarantees and does not guarantee

This document is normative.

## 1. Authority

For normalization behavior, the order of authority is:

1. this document
2. the machine-readable normalization logic in `packages/document-core`
3. `docs/document-schema.md`
4. `docs/command-semantics.md`
5. `docs/rendering-behavior.md`

If these disagree, update the docs and implementation in the same change.

## 2. Goals

Normalization must:

- produce one canonical in-memory document shape
- fill in required empty containers
- repair deterministic structural issues
- drop broken references that cannot be repaired safely
- recompute derived fields
- resolve semantic authoring state deterministically
- materialize render-input state for rendering and command use
- preserve as much valid visible content as possible

Normalization must not:

- invent major author intent
- silently rewrite unrelated content
- preserve obviously invalid references just because they existed

## 3. Core Principle

A normalized document is the only document shape that command application, rendering, and read/query logic are allowed to operate on.

Commit and autosave flows must start from a normalized document, then run the separate computed-layout refresh pass defined in `docs/computed-layout-refresh.md`.

Persisted documents may be incomplete or slightly damaged.

Normalized documents must be:

- structurally coherent
- semantically coherent
- renderable
- deterministic

Normalization is command-agnostic. It must not need to know which command, if any, produced the current document state.

That means normalization does not own command-specific detach or preserve-visible-appearance behavior for explicit commands such as clearing bindings or deleting variables/styles. Those behaviors belong to command application. Normalization only repairs malformed or dangling state using generic deterministic rules.

## 4. When Normalization Runs

Normalization runs at all of the following boundaries:

### 4.1 On load

When a document is read from disk, it must be normalized before use.

### 4.2 Before command application

All commands operate on a normalized document.

### 4.3 After command application

After a command batch is applied, the document must be normalized again before validation and commit.

### 4.4 Before render

Any render path that depends on canonical semantic or structural state must consume a normalized document.

A fresh `computed_layout` snapshot is not required for first render. The renderer consumes normalized structure plus `render_style`, then the browser computes layout.

### 4.5 Before save

Before a document is committed to persistence, it must first be normalized.

Commit and autosave then separately require computed-layout refresh for affected nodes as defined in `docs/computed-layout-refresh.md`.

## 5. Normalization Phases

Normalization proceeds in this order:

1. shape completion
2. structural repair
3. reference repair
4. derived field recomputation
5. semantic repair
6. semantic resolution
7. render-input materialization
8. final validation

Each phase sees the results of the earlier phases.

## 6. Shape Completion

Shape completion ensures that all required containers exist.

Normalization must ensure the following top-level containers always exist:

- `scenes`
- `nodes`
- `assets`
- `variables`
- `styles`

Normalization must ensure these substructures always exist:

- `canvas.authoring`
- `canvas.authoring.local_values`
- `canvas.authoring.variable_bindings`
- `scene.scene_metadata`
- `scene.scene_metadata.tags`
- `node.authoring`
- `node.authoring.local_values`
- `node.authoring.variable_bindings`
- `node.authoring.style_bindings`
- `variables.collections`
- `styles.paint`
- `styles.text`

### 6.1 Empty defaults

Canonical empty defaults are:

- empty object maps for collections and container records
- empty arrays for `tags`
- empty authoring maps for local values, variable bindings, and style bindings

Normalization must create these defaults if they are missing.

## 7. Structural Repair

Structural repair ensures that the document graph is coherent.

## 7.1 Root repair

`root.child_ids` is authoritative for top-level ordering, but it must be repaired if invalid.

Normalization must:

- remove ids in `root.child_ids` that do not correspond to an existing top-level node
- add top-level nodes missing from `root.child_ids` if they are otherwise valid top-level nodes
- deduplicate repeated ids while preserving first valid occurrence order

A top-level node is one with:

- `parent_id: null`

## 7.2 Node key/id repair

For each node entry:

- the node map key must match `node.id`

If they disagree and the conflict cannot be resolved safely, normalization should keep the map key as authoritative and rewrite `node.id` only if that does not create another conflict.

If that still cannot be repaired safely, the node should be dropped.

The same rule applies to scene records.

## 7.3 Parent-child repair

Normalization must ensure:

- if `node.parent_id !== null`, that parent exists
- the parent's `child_ids` includes the node id
- every child listed in `child_ids` exists
- every listed child points back to the parent

Repair policy:

- remove missing child ids from `child_ids`
- add a node id to the parent’s `child_ids` if the parent exists and the relationship is otherwise valid
- if a node points to a missing parent, reattach it as a loose top-level node

Reattaching means:

- set `parent_id = null`
- add the node id to `root.child_ids` if not already present

## 7.4 Cycle repair

The node graph must be acyclic.

Normalization must detect cycles.

If a cycle is found, normalization must break it deterministically by:

1. preserving the highest ancestor already reachable from a valid top-level path
2. detaching the cycle-starting node from its invalid parent
3. reattaching that node as a loose top-level node

The goal is to preserve content without guessing a more complex structure.

## 7.5 Container-kind repair

Only these node kinds may have children:

- `frame`
- `svg`

Normalization must enforce that:

- `text`
- `rectangle`
- `svg-visual-element`

have no children.

Repair policy:

- if a disallowed container has children, detach those children and reattach them as loose top-level nodes
- then clear the invalid `child_ids` from the non-container node

This is preferable to silently deleting child content.

## 7.6 Scene/frame coupling repair

Each scene must be backed by a frame node with the same id.

For every scene `S`, normalization must ensure:

- `scenes[S].id === S`
- `scenes[S].frame_node_id === S`
- `nodes[S]` exists
- `nodes[S].kind === "frame"`
- `nodes[S].parent_id === null`
- `S` appears in `root.child_ids`

Repair policy:

- if a scene record exists without a valid backing frame node, drop the scene record
- if a top-level frame node looks like an orphaned former scene backing frame, preserve the frame node as a loose top-level node
- do not invent a new scene record unless the caller explicitly asked to create one

## 8. Scene Membership Repair

Every node belongs either:

- to a scene
- or to no scene if it is loose top-level content or inside loose top-level content

If the schema uses `scene_id` on nodes, normalization must ensure scene membership is consistent through the subtree.

Rules:

- a scene backing frame has `scene_id` equal to its own scene id
- a descendant of a scene-backed subtree inherits that same `scene_id`
- a loose top-level node has `scene_id: null`
- descendants of loose top-level content inherit `scene_id: null`

Repair policy:

- recompute `scene_id` recursively from structure
- never trust stale membership fields over the actual tree shape

## 9. Reference Repair

Reference repair removes or repairs broken references outside the structural graph.

## 9.1 Asset references

In v1, nodes reference assets through concrete document fields.

The only documented node-level asset reference is:

- `render_style.backgroundImage` containing `url(asset://<assetId>)`

Normalization must:

- remove or clear `backgroundImage` values that reference missing assets
- preserve non-asset background images such as literal gradients or external URLs when those are allowed by the product

## 9.2 Variable binding repair

Normalization must drop variable bindings that reference missing variables.

This applies to:

- `canvas.authoring.variable_bindings`
- `node.authoring.variable_bindings`
- style slot references to missing variables

This is damaged-state repair, not the normative implementation of commands such as `clear_variable_binding` or `delete_variable`.

If a dropped variable binding had a currently materialized visible value, the document may preserve appearance by keeping or re-creating the corresponding local value only when that value is still known deterministically from surviving state.

The normalization rule is:

- preserve visible value when that value is still known deterministically
- otherwise drop the broken binding without inventing a replacement

## 9.3 Style binding repair

Normalization must drop style bindings that reference missing styles.

This applies to:

- `node.authoring.style_bindings.paint`
- `node.authoring.style_bindings.text`

This is damaged-state repair, not the normative implementation of commands such as `clear_style_binding` or `delete_style`.

If a broken style binding is dropped, normalization may preserve current visible appearance by snapshotting currently known effective values into local values for that family only when those values are still known deterministically from surviving state.

## 9.4 Scene reference repair in external structures

Any auxiliary structure that references scenes or nodes must drop missing ids if the reference cannot be repaired deterministically.

The product should prefer preservation of surviving content over preservation of broken pointers.

## 10. Derived Field Recalculation

Derived fields must be recomputed during normalization.

## 10.1 Scene child count

`scene.child_count` must always equal:

```ts
nodes[scene.frame_node_id].child_ids.length
```

Normalization must recompute it unconditionally.

## 10.2 Ordering-derived views

Any derived ordering metadata must be recomputed from:

* `root.child_ids`
* `parent.child_ids`
* SVG child order rules

No secondary ordering cache is authoritative.

## 11. Semantic Repair

Semantic repair ensures the semantic authoring layer is coherent before resolution.

## 11.1 Invalid local values

Local semantic values must match supported slot kinds and node-kind applicability.

Normalization must drop any local value whose slot is invalid for the target.

Examples:

* a text-only slot on the canvas
* a canvas-only slot on a node
* a typography slot on a `frame`
* a paint slot on a `text`
* any node semantic slot on `svg` or `svg-visual-element`
* a nonexistent semantic slot name

## 11.2 Invalid variable bindings for the target

Node variable bindings must use slots that are valid for the node kind.

Normalization must drop any node variable binding whose slot is invalid for the target node kind.

Canvas variable bindings must continue to use only canvas-valid slots.

## 11.3 Invalid style family bindings

Style family bindings must be valid for the target node kind.

Normalization must drop any style binding whose family is invalid for the target node kind.

There is no partial family application during normalization.

## 11.4 Invalid style family keys

Only these style families are valid:

* `paint`
* `text`

Any other style binding key must be dropped.

## 11.5 Invalid style slot content

Within styles:

* slot names must be valid for the style family
* raw values must have the correct general value shape
* variable references must target an existing variable

Invalid style slots should be dropped rather than preserving half-invalid style definitions.

## 11.6 Invalid variable scope declarations

Variables declare supported semantic scopes.

Normalization should drop invalid scopes from a variable’s scope list.

If a variable ends up with no valid scopes, the variable may still be preserved, but it becomes effectively unusable until edited.

This is preferable to deleting the whole variable automatically.

## 11.7 Alias repair

Variable alias chains must be acyclic.

If an alias loop is detected:

* the looping alias edge must be dropped
* the affected variable mode value becomes unresolved
* bindings depending on that unresolved value should fall back according to semantic resolution rules

Normalization must not recurse forever or preserve cyclic alias state.

## 12. Semantic Resolution

After repair, normalization resolves semantic state.

## 12.1 Resolution principle

Semantic authoring state is authoritative for semantic slots.

The resolved winner for each semantic slot is determined from:

* local values
* direct variable bindings
* style bindings
* unset

## 12.2 Canvas precedence

Canvas resolution order is:

1. `canvas.authoring.local_values[slot]`
2. `canvas.authoring.variable_bindings[slot]`
3. unset

## 12.3 Node precedence

Node resolution order is:

1. `node.authoring.local_values[slot]`
2. `node.authoring.variable_bindings[slot]`
3. `node.authoring.style_bindings[family]`
4. unset

Within a bound style:

* raw style values are used directly
* style-level variable references are resolved through the variable system

A direct node variable binding is stronger than a style-derived value for the same slot.

## 12.4 Variable resolution

Variable resolution works as follows:

1. start from the referenced variable id
2. use the requested mode if valid
3. otherwise use the collection’s `default_mode_id`
4. follow alias chains
5. stop at a concrete value
6. fail closed on unresolved or invalid chains

If resolution fails, the binding contributes no value.

## 12.5 Typography variable flattening

Typography variables may provide compound values.

When a typography variable is bound to a specific typography slot, normalization must flatten it by slot:

* `node.typography.font_family` -> `font_family`
* `node.typography.font_size` -> `font_size`
* `node.typography.font_weight` -> `font_weight`
* `node.typography.line_height` -> `line_height`
* `node.typography.letter_spacing` -> `letter_spacing`

If a requested subfield is absent, the binding contributes no value for that slot.

## 13. Semantic Materialization into Render Inputs

After semantic resolution, normalization must materialize render-input state.

## 13.1 Canvas materialization

The resolved canvas semantic state must be written to:

* `canvas.background_color`

If `canvas.background_color` resolves to `undefined`, the field should be omitted.

## 13.2 Node materialization

Each resolved node semantic slot must be written into the mapped `render_style` property.

The canonical slot mapping is:

* `node.paint.background_color` -> `backgroundColor`
* `node.text.color` -> `color`
* `node.shape.border_radius` -> `borderRadius`
* `node.layout.gap` -> `gap`
* `node.layout.padding_top` -> `paddingTop`
* `node.layout.padding_right` -> `paddingRight`
* `node.layout.padding_bottom` -> `paddingBottom`
* `node.layout.padding_left` -> `paddingLeft`
* `node.typography.font_family` -> `fontFamily`
* `node.typography.font_size` -> `fontSize`
* `node.typography.font_weight` -> `fontWeight`
* `node.typography.line_height` -> `lineHeight`
* `node.typography.letter_spacing` -> `letterSpacing`
* `node.paint.opacity` -> `opacity`

If a semantic slot resolves to `undefined`, the mapped `render_style` property must be removed.

## 13.3 Non-semantic style preservation

Normalization must preserve non-semantic `render_style` properties unless they are independently invalid or broken by reference.

Semantic materialization must not wipe unrelated style properties.

## 14. Computed Layout Is Outside Normalization

Every node has:

* `render_style`, which stores render inputs
* `computed_layout`, which stores resolved geometry

Normalization is responsible for making structure, references, semantic state, and render inputs canonical.

Normalization is not responsible for browser-backed measurement or for refreshing `computed_layout`.

A document may be fully normalized while still carrying missing or stale `computed_layout`.

That is acceptable on load, before first render, and in non-renderer contexts.

The separate computed-layout refresh contract is defined in `docs/computed-layout-refresh.md`.

That contract is responsible for:

* letting the browser-backed renderer resolve layout
* measuring affected nodes
* writing fresh `computed_layout`
* preserving authored inputs in `render_style`

## 15. Visibility Normalization

Visibility is controlled structurally by `is_visible`.

Normalization does not rewrite that into semantic state.

The renderer may express invisibility as `display: none` or equivalent at render time, but persisted document truth remains:

* `node.is_visible`

Normalization should not permanently inject visibility overrides into unrelated style fields unless the renderer contract explicitly requires that.

## 16. Text Normalization

Text nodes must always have:

* `kind: "text"`
* `text.content`

`text.content` may be empty.

Normalization must ensure:

* non-text nodes do not carry text payloads
* text nodes always have a text payload
* missing text content defaults to `""`

## 17. SVG Normalization

SVG roots and SVG primitives must remain structurally coherent.

Normalization must ensure:

* only `svg` nodes may contain `svg-visual-element` children
* SVG primitive payloads exist on `svg-visual-element` nodes
* SVG root payloads exist on `svg` nodes

Repair policy:

* if a primitive is detached from a valid SVG parent, preserve it as content by reattaching it as a loose top-level `rectangle` or `frame` only if there is an explicit conversion rule
* otherwise preserve the node but it will render as a bounded fallback according to renderer behavior

If your product does not support fallback-preserved SVG primitives outside SVG context, dropping them is also acceptable as long as that policy is implemented consistently.

## 18. Final Validation

After normalization, the document must satisfy:

* canonical required containers exist
* structural graph is acyclic
* all surviving parent-child relationships are coherent
* scene/frame coupling is valid
* derived fields are recomputed
* broken references are removed
* semantic state is coherent enough to resolve deterministically
* mapped render-input semantic properties are materialized

If these conditions are not met and cannot be repaired safely, normalization must fail.

## 19. Serializer Expectations

When a normalized document is serialized for persistence as part of a commit or autosave path:

* the commit path must already have run computed-layout refresh as defined in `docs/computed-layout-refresh.md`

The serializer should then ensure:

* required empty containers are emitted explicitly
* dropped references do not reappear
* derived fields reflect the normalized state
* materialized render-input properties reflect the normalized semantic state
* `computed_layout` reflects the latest resolved layout for persisted nodes
* `render_style` preserves surviving authored inputs, including relative or flexible sizing inputs

The serializer should emit one canonical shape, not multiple equivalent shapes.

## 20. Non-Goals of This Document

This document does not define:

* command grammar
* UI interaction behavior
* undo/redo storage format
* autosave timing
* renderer implementation details beyond normalized input expectations
* import compatibility from old or foreign document formats
