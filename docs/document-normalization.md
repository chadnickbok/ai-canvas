# AI Canvas Document Normalization

Status: Normative contract.

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
- how structural, typed, semantic, and asset-reference repair work
- what normalization guarantees and does not guarantee

This document is normative.

The current machine-readable implementation produces canonical typed document shape, repairs structure, enforces node-kind semantic legality, repairs broken semantic references, resolves semantic state by exact requested slot, and materializes semantic-owned render values while preserving non-mapped raw render inputs.

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
- normalize typed node, asset, variable, and style records into canonical shapes
- resolve semantic authoring into deterministic render-facing state
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
- canonically typed
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

Any render path that depends on canonical structural state must consume a normalized document.

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
5. final validation

Semantic resolution and semantic-to-render-state materialization are part of reference repair and derived-field recomputation.

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

## 9.2 Variable binding containers

Normalization keeps variable-binding containers structurally valid and drops broken references to missing variables.

This means:

- invalid keys are dropped
- non-string binding ids are dropped
- well-typed string bindings survive only when the referenced variable exists

Alias-chain legality is handled separately under semantic repair.

## 9.3 Style binding containers

Normalization keeps style-binding containers structurally valid and drops bindings to missing styles.

This means:

- only declared style families survive
- non-string style ids are dropped
- well-typed string style ids survive only when the referenced style exists in that family

Style-slot variable references are repaired separately under semantic repair.

## 9.4 Scene reference repair in external structures

Any auxiliary structure that references scenes or nodes must drop missing ids if the reference cannot be repaired deterministically.

The product should prefer preservation of surviving content over preservation of broken pointers.

## 10. Derived Field Recalculation

Derived fields must be recomputed during normalization.

## 10.1 Scene child count

`scene.child_count` must always equal:

```ts
nodes[scene.frame_node_id].child_ids.length;
```

Normalization must recompute it unconditionally.

## 10.2 Ordering-derived views

Any derived ordering metadata must be recomputed from:

- `root.child_ids`
- `parent.child_ids`
- SVG child order rules

No secondary ordering cache is authoritative.

## 11. Semantic Repair

It ensures:

- authoring containers exist on canvas and nodes
- only semantic slot keys declared for that node kind survive in local-value and variable-binding maps
- only style families declared for that node kind survive in `style_bindings`
- variables and styles are normalized into canonical typed record shapes
- broken canvas and node variable bindings are dropped
- broken node style bindings are dropped
- style slot variable references to missing variables are dropped
- obvious alias loops in variable mode values are trimmed deterministically

## 12. Semantic Resolution

Normalization resolves semantic slots one requested slot at a time.

Rules:

- canvas precedence is local value, then direct variable binding, then unset
- node precedence is local value, then direct variable binding, then bound style family, then unset
- a variable contributes only when it exists, resolves in the chosen or default mode, and declares the exact requested slot in `scopes`
- typography variables contribute only the requested typography field
- unresolved stronger sources fail closed and do not fall through to weaker sources

## 13. Semantic Materialization into Render Inputs

Normalization owns the mapped semantic render keys.

This means:

- `canvas.background_color` is recomputed from semantic authoring
- mapped node render keys are recomputed from semantic authoring and written into `render_style`
- when a mapped semantic slot resolves to `undefined`, its mapped render key is removed
- only non-mapped `render_style` properties remain raw-only and survive untouched unless another normalization rule removes them

## 14. Computed Layout Is Outside Normalization

Every node has:

- `render_style`, which stores render inputs
- optional `computed_layout`, which stores resolved geometry when that cache is present

Normalization is responsible for making structure, typed containers, and asset-backed render references canonical.

Normalization is not responsible for browser-backed measurement or for refreshing `computed_layout`.

A document may be fully normalized while still carrying missing or stale `computed_layout`.

That is acceptable on load, before first render, and in non-renderer contexts.

The separate computed-layout refresh contract is defined in `docs/computed-layout-refresh.md`.

That contract is responsible for:

- letting the browser-backed renderer resolve layout
- measuring affected nodes
- writing fresh `computed_layout`
- preserving authored inputs in `render_style`

## 15. Visibility Normalization

Visibility is controlled structurally by `is_visible`.

Normalization does not rewrite that into semantic state.

The renderer may express invisibility as `display: none` or equivalent at render time, but persisted document truth remains:

- `node.is_visible`

Normalization should not permanently inject visibility overrides into unrelated style fields unless the renderer contract explicitly requires that.

## 16. Text Normalization

Text nodes must always have:

- `kind: "text"`
- `text.content`

`text.content` may be empty.

Normalization must ensure:

- non-text nodes do not carry text payloads
- text nodes always have a text payload
- missing text content defaults to `""`

## 17. SVG Normalization

SVG roots and SVG primitives must remain structurally coherent.

Normalization must ensure:

- only `svg` nodes may contain `svg-visual-element` children
- SVG primitive payloads exist on `svg-visual-element` nodes
- SVG root payloads exist on `svg` nodes

Repair policy:

- if a primitive is detached from a valid SVG parent, drop the primitive during normalization
- normalization must not preserve detached `svg-visual-element` nodes as loose top-level content
- normalization does not invent synthetic `svg` wrappers or fallback node conversions in v1

## 18. Final Validation

After normalization, the document must satisfy:

- canonical required containers exist
- structural graph is acyclic
- all surviving parent-child relationships are coherent
- scene/frame coupling is valid
- no surviving `svg-visual-element` is detached from an `svg` parent
- derived fields are recomputed
- broken references are removed
- semantic containers are canonically typed
- asset-backed render references are coherent enough for structural render and inspection

If these conditions are not met and cannot be repaired safely, normalization must fail.

## 19. Serializer Expectations

When a normalized document is serialized for persistence as part of a commit or autosave path:

- the commit path must already have run computed-layout refresh as defined in `docs/computed-layout-refresh.md`

The serializer should then ensure:

- required empty containers are emitted explicitly
- dropped references do not reappear
- derived fields reflect the normalized state
- semantic containers reflect the normalized typed state
- when present, `computed_layout` reflects the latest resolved layout for persisted nodes
- `render_style` preserves surviving authored inputs, including relative or flexible sizing inputs

The serializer should emit one canonical shape, not multiple equivalent shapes.

## 20. Non-Goals of This Document

This document does not define:

- command grammar
- UI interaction behavior
- undo/redo storage format
- autosave timing
- renderer implementation details beyond normalized input expectations
- import compatibility from old or foreign document formats
