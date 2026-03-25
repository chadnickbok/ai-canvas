# AI Canvas Command Semantics

This document defines the authoritative mutation semantics for AI Canvas Desktop.

It answers:

- what a command is
- how command batches are applied
- what structural and semantic mutations mean
- how normalization, materialization, and computed-layout refresh interact with mutation
- what invariants command application must preserve

This document is normative for:

- editor mutations
- local MCP mutations
- undo/redo state transitions
- any future automation or scripting layer that writes documents through commands

It does **not** define the persisted schema itself. That lives in `docs/document-schema.md`.

## 1. Authority

For command behavior, the order of authority is:

1. this document
2. the machine-readable command definitions and application logic in `packages/document-core`
3. the normalization rules in `docs/document-normalization.md`
4. the computed-layout refresh rules in `docs/computed-layout-refresh.md`
5. the schema invariants in `docs/document-schema.md`

If these disagree, update the docs and the machine-readable implementation in the same change.

## 2. Goals

The command system must:

- provide one mutation model for the editor and MCP
- keep document behavior deterministic
- preserve schema invariants
- preserve semantic precedence rules
- support scene-first authoring
- support local repair where safe
- fail clearly when a mutation would create unrecoverable invalid state

## 3. Core Principles

### 3.1 Commands mutate one document

A command batch always targets exactly one document.

Commands do not span multiple projects or multiple documents.

### 3.2 Commands operate on normalized-for-use documents

Commands are applied to the normalized in-memory document shape.

The application flow is:

1. load persisted document
2. normalize it for use
3. apply the command batch in order
4. normalize it for use again
5. refresh `computed_layout` for commit
6. validate final invariants
7. commit the updated document

### 3.3 Command batches are atomic

A command batch is all-or-nothing.

If a batch cannot be repaired into a valid final document state, the entire batch must fail and the original document must remain unchanged.

### 3.4 Command order matters

Commands in a batch are applied strictly in order.

A later command in the same batch sees the effects of earlier commands.

### 3.5 Commands mutate canonical state, not transient UI state

Commands must mutate the canonical document model only.

They must not depend on:

- React state
- DOM state
- selection-only UI state
- renderer caches
- unsaved inspector drafts

Selection-aware commands may exist, but selection must be provided as explicit command input or resolved by a higher-level caller before command application.

### 3.6 Semantic state is authoritative for semantic slots

For semantic slots, the canonical authoring state lives in:

- `canvas.authoring`
- `node.authoring`
- `variables`
- `styles`

Commands must not treat mapped `render_style` fields as the authoritative authoring source for semantic slots.

### 3.7 Render inputs are materialized during normalization and computed outputs are refreshed before commit

Before the updated document is committed:

- normalization must already have resolved semantic slots
- normalization must already have written mapped render inputs into `canvas.background_color`
- normalization must already have written mapped node render inputs into `node.render_style`
- the browser-backed renderer must compute layout for affected nodes
- `node.computed_layout` must be refreshed for affected nodes
- normalization must already have recomputed derived fields such as scene child counts

### 3.8 Command application is single-threaded per project

Within a given project session, command batches are serialized through one command-application path shared by the UI, MCP, undo/redo, and future automation.

There is no interleaving of command batches within a project.

## 4. Command Batch Contract

A command batch has this logical shape:

```ts
type CommandBatch = {
  commands: Command[];
};
```

A concrete implementation may wrap this with additional metadata such as:

* document id
* revision
* caller metadata
* undo grouping hints

Those wrappers do not change mutation semantics.

## 5. Command Application Lifecycle

Every command batch must follow this lifecycle.

### 5.1 Load

Load the current persisted document.

### 5.2 Normalize for use

Normalize into canonical in-memory shape:

* required containers exist
* derived empty structures exist
* scene metadata tags exist
* authoring containers exist
* dangling references are dropped where appropriate
* semantic state is resolved
* render-facing semantic values are materialized into render inputs
* missing or stale `computed_layout` may still remain

### 5.3 Apply

Apply commands one at a time in order.

### 5.4 Normalize for use again

After the full batch, normalize again so the document returns to canonical in-memory shape:

* recompute scene child counts
* drop broken asset refs
* drop broken variable/style bindings
* remove invalid root or child references
* reattach orphaned nodes when repair policy requires it
* resolve semantic state
* materialize render-facing values into `render_style`

### 5.5 Refresh layout snapshot for commit

Let the browser-backed renderer resolve layout for affected nodes, then refresh computed outputs:

* `node.computed_layout`

### 5.6 Validate

Validate final structural and semantic invariants.

### 5.7 Commit

Persist the updated document only if the final state is valid.

## 6. Failure and Repair Policy

### 6.1 Repair when safe

Command application should prefer repair over rejection when the repair is deterministic and does not discard meaningful valid user state.

Examples:

* dropping broken asset references
* recomputing scene child count
* removing style bindings to deleted styles
* removing variable bindings to deleted variables

### 6.2 Fail when structural intent is unrecoverable

A batch must fail when it would leave the document in a state that cannot be repaired safely without guessing major author intent.

Examples:

* creating a node with an id collision
* reparenting a node into a missing parent
* creating a scene whose backing frame id is already in use
* introducing a cycle in the node tree

### 6.3 Fail whole batch, not partial tail

If any command in the batch causes unrecoverable failure, the entire batch fails.

Earlier commands in the batch must not be partially committed.

## 7. Identity and Addressing

### 7.1 Caller-provided ids

Create commands should use explicit caller-provided ids for created entities.

This applies to:

* scenes
* nodes
* variables
* styles
* assets

This keeps command application deterministic and easy to coordinate across the UI, MCP, undo/redo, and future automation.

### 7.2 Id uniqueness

The following id spaces must be unique within a document:

* scene ids
* node ids
* asset ids
* variable ids within their document-wide namespace
* style ids within their family namespace

### 7.3 Scene/frame identity

A scene id is also the id of its backing frame node.

That identity coupling is mandatory.

## 8. Structural Command Semantics

## 8.1 `create_scene`

Creates:

* a scene record in `scenes`
* a backing top-level `frame` node in `nodes`

The created frame node must:

* have the same id as the scene
* have `parent_id: null`
* have `scene_id` set to its own scene id
* appear in `root.child_ids`

The created scene record must:

* use the same id
* point to the same backing frame id
* initialize `scene_metadata.tags` to `[]`
* initialize `child_count` from the backing frame node

A created scene is a top-level content unit.

### 8.1.1 Position and size

Creating a scene may set input geometry on the backing frame node, including:

* `render_style.left`
* `render_style.top`
* `render_style.width`
* `render_style.height`

The scene record does not duplicate geometry.

The post-render measurement path must refresh the backing frame node's `computed_layout` before commit.

## 8.2 `update_scene`

Updates a scene record and, when geometry changes, updates the backing frame node's input geometry.

At minimum, updating a scene may affect:

* `name`
* backing-frame geometry inputs such as `left`, `top`, `width`, and `height`
* `scene_metadata`

Updating a scene's geometry must write to the backing frame node's `render_style` and refresh that node's `computed_layout` before commit.

`child_count` is derived and must not be edited directly.

## 8.3 `delete_scene`

Deleting a scene deletes:

* the scene record
* the backing frame node
* the entire node subtree inside that scene

The backing frame for a scene cannot survive as a detached frame when the scene is explicitly deleted.

Deleting a scene must also remove its id from `root.child_ids`.

## 8.4 `create_node`

Creates a new node in `nodes`.

The created node must:

* have a unique id
* match one of the supported node kinds
* have valid `parent_id`
* be inserted into the parent's `child_ids` or `root.child_ids`
* inherit the correct scene membership from its parent

If the created node is top-level and not a scene backing frame, it is a loose top-level node.

The editor should minimize creation of loose top-level nodes, but the model allows them.

### 8.4.1 Default authoring containers

Every created node must initialize:

* `authoring.local_values = {}`
* `authoring.variable_bindings = {}`
* `authoring.style_bindings = {}`

### 8.4.2 Default layout state

By commit time, every created node must have a valid `computed_layout`.

If `render_style.width` or `render_style.height` are omitted by the caller, command application must preserve that omission.

The browser-backed layout and measurement path computes `computed_layout`; it must not synthesize width/height inputs just to mirror resolved output.

## 8.5 `update_node`

Updates an existing node.

This command may update:

* `name`
* `is_visible`
* `is_locked`
* `render_style`
* node-type-specific payloads such as text or SVG payloads
* `asset_refs`

Callers may expose convenience geometry fields such as `left`, `top`, `width`, or `height`, but command application must translate those into `render_style` edits before normalization.

It must not directly edit:

* `id`
* structural parent/child relationships
* scene membership except through structural commands
* `computed_layout`

### 8.5.1 Layout-affecting update semantics

When an update changes layout or style in a way that affects resolved size:

1. the authoritative input fields must be updated
2. relative, flexible, or omitted width/height inputs must remain preserved in `render_style`
3. the node and every affected descendant or ancestor must be re-resolved
4. `computed_layout` must be refreshed for every affected node

This applies even when one authored change causes many resolved sizes to change.

## 8.6 `reparent_node`

Moves a node from one parent to another.

This command must:

* remove the node id from the old parent's `child_ids` or `root.child_ids`
* add the node id to the new parent's `child_ids` or `root.child_ids`
* update `parent_id`
* recursively rewrite scene membership for the entire subtree
* preserve subtree child order unless explicitly changed

A node must not be reparented into:

* itself
* one of its descendants
* a missing parent
* a parent whose node kind cannot contain children

If the new parent is top-level, the node becomes a loose top-level node unless it is a scene backing frame.

## 8.7 `reorder_children`

Reorders child ids within one container.

A container is either:

* `root.child_ids`
* a parent node's `child_ids`

Reorder must not change parentage.

Reorder only changes sibling order.

### 8.7.1 Scene-aware top-level reorder

Top-level reorder affects scene and loose-node paint order because `root.child_ids` is authoritative for top-level order.

## 8.8 `delete_node`

Deletes a node and its entire subtree.

This command must:

* remove the node from its parent or `root.child_ids`
* remove all descendants from `nodes`
* remove or repair references from the rest of the document as needed

A scene backing frame must not be deleted through `delete_node`.

To remove a scene, callers must use `delete_scene`.

## 9. Text Command Semantics

## 9.1 `update_text_content`

Updates `text.content` for a text node.

Rules:

* the target node must be `kind: "text"`
* `text.content` may be empty
* no non-text node may receive this command

Text content updates do not change typography bindings automatically.

They only change the text payload unless layout reflow requires a refreshed `computed_layout` snapshot.

## 10. Scene Metadata Command Semantics

## 10.1 `update_scene_metadata`

Updates `scene.scene_metadata`.

This may update:

* `group`
* `notes`
* `role`
* `summary`
* `tags`

Rules:

* `tags` must always materialize as an array
* clearing tags results in `[]`
* scene metadata changes do not directly affect node structure or render state

They may, however, affect later semantic restyle queries or scene filtering workflows.

## 11. Semantic Command Semantics

## 11.1 General rule

Semantic commands mutate authoring state first.

Render-facing properties are then materialized from that authoring state before commit.

For semantic slots, commands must not treat direct `render_style` mutation as the final source of truth.

## 11.2 Direct local semantic edit

A direct local semantic edit writes to:

* `canvas.authoring.local_values[slot]`
* or `node.authoring.local_values[slot]`

It also clears any direct variable binding for that same slot.

Style bindings remain attached.

This makes direct local edit a local override, not a detach of the whole style.

## 11.3 Clear local override

Clearing a local override removes the local authored value for that slot.

It reveals the next source in semantic precedence order.

It does not modify:

* variable bindings
* style bindings

## 11.4 Assign variable binding

Assigning a variable binding to a slot:

* sets `variable_bindings[slot] = variable_id`
* removes any local value for that slot

A variable binding overrides style-derived values for the same slot.

## 11.5 Clear variable binding

Clearing a variable binding:

1. resolves the current effective value for that slot
2. writes that resolved value into `local_values[slot]`
3. removes `variable_bindings[slot]`

This acts as “detach variable binding to local.”

## 11.6 Assign style binding

Assigning a style binding to a family:

* sets `style_bindings[family] = style_id`
* clears local values for slots in that family
* does not clear direct variable bindings for slots in that family

Direct variable bindings remain stronger than style-derived values.

## 11.7 Clear style binding

Clearing a style binding:

1. resolves the style-provided values currently contributing to that family
2. writes them into local values only for slots not already overridden by:

   * a local value
   * a direct variable binding
3. removes `style_bindings[family]`

This acts as “detach style to local.”

## 11.8 Raw style patch on a semantic property

If a caller updates `render_style` directly for a property that maps to a semantic slot, the command system must treat that as a semantic local edit.

That means:

* update the corresponding local semantic value
* clear any direct variable binding for that slot
* keep style bindings intact
* materialize the final render-input property from semantic state before commit

## 11.9 Raw style patch on a non-semantic property

If a caller updates a `render_style` property that is not part of the semantic slot map, that property is updated directly in `render_style`.

No semantic authoring fields are changed.

This includes raw geometry inputs such as `left`, `top`, `width`, and `height`.

Those edits affect the input layer only. They do not directly mutate `computed_layout`.

## 12. Variable Command Semantics

## 12.1 Create variable

Creates a variable under a collection.

The variable must:

* have a unique id within the document
* declare valid slot scopes
* provide valid mode values

## 12.2 Update variable

Updates variable metadata or mode values.

After a variable update:

* every direct binding to that variable must re-resolve
* every alias chain depending on that variable must re-resolve
* every style slot that references that variable must re-resolve
* every affected render-input semantic slot must be materialized before commit

## 12.3 Delete variable

Deleting a variable must detach all usages safely.

Effects:

* direct bindings to the variable are cleared
* alias-based variable users resolve to raw values where possible
* style slots that referenced the variable detach to raw values where possible

The goal is to preserve visible appearance as much as possible.

Deleting a variable should not silently erase currently visible styling if the effective value can be preserved locally or in style data.

## 13. Style Command Semantics

## 13.1 Create style

Creates a style in either family:

* `paint`
* `text`

The style must use only valid slots for that family.

## 13.2 Update style

Updating a style causes all bound targets in that family to re-resolve.

Effects:

* local overrides remain intact
* direct variable bindings remain intact
* style-derived slots update where they are still effective

## 13.3 Delete style

Deleting a style must detach bound nodes safely.

Effects:

* node style bindings to that style are removed
* effective style-contributed values are snapshotted into local values where needed
* existing stronger overrides remain unchanged

The goal is to preserve visible appearance as much as possible.

## 14. Design Brief Command Semantics

## 14.1 Update design brief

Updates the document-level design brief.

Rules:

* array fields must remain arrays
* clearing array fields results in `[]`
* design brief updates do not directly mutate render state

They may affect future restyle planning or MCP reasoning, but not immediate rendering by themselves.

## 15. Asset Command Semantics

## 15.1 Create asset

Creates or registers an asset record in `assets`.

The asset id must be unique.

## 15.2 Update asset metadata

Updates non-identity asset fields such as:

* metadata
* width
* height
* source details where allowed

Changing an asset may affect any node that references it through:

* `asset_refs`
* `backgroundImage: url(asset://...)`

Affected nodes should be re-resolved as needed before save, and any geometry change must refresh `computed_layout`.

## 15.3 Delete asset

Deleting an asset must remove or repair all document references to it.

Effects:

* remove the asset from `assets`
* remove dangling ids from `asset_refs`
* remove or clear `backgroundImage` values that reference the deleted asset

The document should remain valid after asset deletion.

## 16. SVG Command Semantics

## 16.1 Update SVG root payload

Updating an SVG root payload affects only `kind: "svg"` nodes.

This may update:

* definitions
* root attributes
* `view_box`
* `preserve_aspect_ratio`

## 16.2 Update SVG primitive payload

Updating an SVG primitive affects only `kind: "svg-visual-element"` nodes.

This may update:

* `element_name`
* `order`
* `attributes`

Primitive render order inside an SVG is determined by:

1. `svg_primitive.order`
2. child order as tiebreaker

## 17. Derived State Recalculation

Before commit, command application must ensure all derived state affected by the batch is current.

This includes at minimum:

* scene `child_count`
* semantic materialization into render-input properties
* refreshed `computed_layout` for nodes whose layout changed
* removal of broken style or variable bindings
* removal of broken asset refs

## 18. Undo/Redo Semantics

Undo and redo operate by replaying or inverting command batches against the same canonical command system.

That means:

* undo/redo must not bypass command application rules
* undo/redo must preserve normalization, repair, and materialization behavior
* a restored state must be equivalent to a normal command-applied state

The storage shape used for undo/redo is an implementation detail.

The mutation semantics are not.

## 19. Non-Goals of This Document

This document does not define:

* the persisted document schema in full
* renderer implementation details
* UI interaction design
* selection behavior
* autosave timing
* batching heuristics in the editor
* import compatibility behavior
