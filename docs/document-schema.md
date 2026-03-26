# AI Canvas Document Schema

This document defines the canonical persisted document schema for AI Canvas Desktop.

In v1, each project contains exactly one document. This schema describes that single document/workspace.

It is the normative contract for:

- local project persistence
- in-memory document normalization
- renderer input
- editor mutation targets
- local MCP inspection and mutation

This schema describes the **current product model**. It is not a compatibility guide for older systems.

## 1. Authority

For AI Canvas Desktop, the authoritative document contract is:

1. this schema document
2. the machine-readable TypeScript and validation schema in `packages/document-core`
3. the normalization rules in `docs/document-normalization.md`
4. the renderer consumption rules in `docs/rendering-behavior.md`

If these disagree, update both the documentation and the machine-readable schema in the same change.

## 2. Goals

The document model must be able to:

- persist complete project documents locally
- support scene-first editing
- preserve renderer-grade visual state
- support document-level variables and styles
- support semantic bindings and provenance
- provide a stable target for the UI and local MCP
- degrade safely when data is partially invalid

## 3. Core Decisions

### 3.1 One canonical schema version

Only one schema version is currently valid:

- `schema_version: 1`

### 3.2 One render canon

The current render canon is fixed:

- `render_canon: "browser-css"`

### 3.3 Infinite canvas

The document workspace is an infinite coordinate plane:

- `canvas.extent_mode: "infinite"`

### 3.4 Scene-first top-level model

Top-level content is ordered by `root.child_ids`.

Top-level content may technically include:

- scenes
- loose top-level nodes

However, the normal authoring model is scene-first. The editor should create scenes as the primary top-level content unit.

### 3.5 Scenes are records plus frame nodes

A scene is represented by:

- a `SceneRecord` in `scenes`
- a backing top-level `frame` node in `nodes`

The scene id and its backing frame node id are the same identifier.

### 3.6 No unknown node kind

There is no `unknown` node kind in the canonical schema.

Imported or unsupported content must be normalized into one of the supported node kinds, usually:

- `frame`
- `rectangle`

### 3.7 Render inputs and computed outputs are separate persisted layers

Every node persists both:

- `render_style`, which stores render-input declarations
- `computed_layout`, which stores the most recent resolved layout output

The separation is intentional:

- `render_style` preserves authored or directly edited layout inputs such as `"100%"`, flex properties, or omitted width/height
- `computed_layout` stores the last resolved box measured from the browser-backed renderer
- future layout behavior is driven by the input layer, not by the computed output layer
- `computed_layout` is derived and cacheable, even though it is persisted

When a change causes layout to reflow:

1. the document's render inputs are materialized into `render_style`
2. the browser-backed renderer computes layout from tree shape plus `render_style`
3. the resulting geometry is measured and written to `computed_layout` for every affected node

This means:

- relative or flexible inputs MUST round-trip unchanged in `render_style`
- `computed_layout` records only the most recently resolved geometry
- normalization does not require a fresh `computed_layout`
- first render does not require a fresh `computed_layout`
- autosave and commit must run the separate computed-layout refresh pass without collapsing authored layout inputs into pixels

### 3.8 No legacy semantic backfill

The canonical schema always stores semantic authoring data explicitly.

There is no legacy backfill path in the core model.

### 3.9 Repair on normalize

When a document is partially invalid, normalization should prefer repair over rejection.

The rule is:

- preserve what can be rendered or inspected
- repair what can be repaired deterministically
- drop broken references that cannot be repaired safely

The app should remain usable even when recovering from damaged document state.

## 4. Top-Level Document

The canonical persisted document shape is:

```ts
type RendererDocument = {
  schema_version: 1;
  render_canon: "browser-css";
  document_id: string;
  name: string;
  page_name: string;
  source: RendererDocumentSource;
  canvas: RendererCanvas;
  root: CanvasRoot;
  scenes: Record<string, SceneRecord>;
  nodes: Record<string, RendererNode>;
  assets: Record<string, AssetRecord>;
  variables: RendererVariables;
  styles: RendererStyles;
};
```

## 5. Source Metadata

```ts
type RendererDocumentSource = {
  kind: "ai-canvas";
  created_at?: string;
  imported_at?: string;
  source_document_id?: string;
  source_file_name?: string;
  source_page_name?: string;
};
```

### Rules

* New documents SHOULD use `kind: "ai-canvas"`.
* `created_at` and `imported_at` are optional metadata fields.
* `source_*` fields are informational only. They do not affect rendering or mutation semantics.

## 6. Canvas and Root

### 6.1 Canvas

```ts
type RendererCanvas = {
  extent_mode: "infinite";
  background_color?: string;
  authoring: RendererCanvasAuthoring;
};
```

`background_color` is the resolved render value.

The authoring source of truth lives in `canvas.authoring`.

### 6.2 Canvas authoring

```ts
type RendererCanvasAuthoring = {
  local_values: Partial<Record<"canvas.background_color", string | number>>;
  variable_bindings: Partial<Record<"canvas.background_color", string>>;
};
```

### 6.3 Root

```ts
type CanvasRoot = {
  id: string;
  child_ids: string[];
};
```

### Rules

* `root.child_ids` is the ordered list of top-level content on the infinite canvas.
* The order is meaningful for hierarchy and paint order.
* Every top-level node MUST appear in `root.child_ids`.
* Every id in `root.child_ids` MUST exist either:

  * as a top-level node in `nodes`, or
  * as a scene-backed frame node which also exists in `nodes`

Observed convention:

* `root.id` is usually `"canvas_root"`

## 7. Scenes

Scenes are stored in `scenes` and backed by frame nodes in `nodes`.

```ts
type SceneRecord = {
  id: string;
  frame_node_id: string;
  name: string;
  child_count: number;
  scene_metadata: RendererSceneMetadata;
};
```

### 7.1 Scene invariants

For every scene `A`:

* `scenes[A].id === A`
* `scenes[A].frame_node_id === A`
* `nodes[A]` MUST exist
* `nodes[A].kind === "frame"`
* `nodes[A].parent_id === null`
* `nodes[A].scene_id === A`
* `A` MUST appear in `root.child_ids`

### 7.2 Scene child count

`child_count` is a derived persisted field.

It MUST equal:

```ts
nodes[frame_node_id].child_ids.length
```

It is never independently authoritative.

Commit preparation SHOULD recompute it before save.

### 7.3 Scene geometry

Scene geometry is not duplicated on the scene record.

The scene's backing frame node is the only geometry source:

* authored scene geometry lives in `nodes[scene_id].render_style`
* resolved scene geometry lives in `nodes[scene_id].computed_layout`

Queries that need scene bounds should read the backing frame node.

### 7.4 Scene background

Scene background is stored on the backing frame node, not on the scene record.

Typical source:

* `nodes[scene_id].render_style.backgroundColor`
* and/or the mapped semantic authoring slot for background color

## 8. Scene Metadata

Scene metadata lives on scenes.

```ts
type RendererSceneMetadata = {
  group?: string;
  notes?: string;
  role?: string;
  summary?: string;
  tags: string[];
};
```

### Rules

* `tags` MUST always be present.
* `tags` defaults to `[]`.

## 9. Nodes

Every node shares this base shape:

```ts
type BaseNode = {
  id: string;
  kind: RendererNodeKind;
  name: string;
  parent_id: string | null;
  child_ids: string[];
  scene_id: string | null;
  is_visible: boolean;
  is_locked: boolean;
  render_style: RenderStyleBag;
  computed_layout: ComputedLayout;
  authoring: RendererNodeAuthoring;
};
```

### 9.1 Supported node kinds

The canonical normalized kinds are:

* `frame`
* `rectangle`
* `text`
* `svg`
* `svg-visual-element`

```ts
type RendererNodeKind =
  | "frame"
  | "rectangle"
  | "text"
  | "svg"
  | "svg-visual-element";
```

### 9.2 Structural invariants

For all nodes:

* node map key MUST equal `node.id`
* if `parent_id === null`, the node MUST appear in `root.child_ids`
* if `parent_id !== null`, the parent MUST exist
* the parent's `child_ids` MUST include this node id
* every listed child id MUST exist and point back via `parent_id`
* a child MUST share `scene_id` with its parent

Additional top-level rules:

* loose top-level nodes have `parent_id: null` and `scene_id: null`
* scene frame nodes have `parent_id: null` and `scene_id: <their own scene id>`

### 9.3 Leaf and container restrictions

These kinds MUST have no children:

* `text`
* `rectangle`
* `svg-visual-element`

These kinds MAY have children:

* `frame`
* `svg`

### 9.4 Geometry layers

Every node has:

* `render_style`, the input layer
* `computed_layout`, the computed output layer

```ts
type ComputedLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};
```

`computed_layout` is the resolved border-box geometry in canvas coordinates.

Rules:

* `render_style.width` and `render_style.height` MAY be absolute, relative, or absent
* omitted width/height in `render_style` are meaningful and MUST not be synthesized just to mirror outputs
* relative or flexible layout inputs MUST round-trip unchanged in `render_style`
* `computed_layout` MUST be refreshed when a mutation changes resolved geometry
* persisted computed outputs SHOULD capture the latest resolved box for any node affected by layout reflow

### 9.5 Creation-time defaults

When commands create a node or a scene backing frame and omit optional authored fields, the initialized document state is:

* `is_visible: true`
* `is_locked: false`
* `child_ids: []`
* `render_style: {}`

`computed_layout` is derived rather than caller-authored.

A newly created in-memory node may temporarily carry missing or stale `computed_layout`, but committed and persisted document state must carry the measured layout snapshot.

## 10. Typed Node Payloads

### 10.1 Frame

```ts
type FrameNode = BaseNode & {
  kind: "frame";
};
```

### 10.2 Rectangle

```ts
type RectangleNode = BaseNode & {
  kind: "rectangle";
};
```

### 10.3 Text

```ts
type TextNode = BaseNode & {
  kind: "text";
  text: {
    content: string;
  };
};
```

Rules:

* `text.content` MAY be empty
* the UI MAY create text nodes with default placeholder content for convenience
* persistence MUST allow empty string content

### 10.4 SVG root

```ts
type SvgNode = BaseNode & {
  kind: "svg";
  svg: {
    definitions?: Array<{
      id?: string;
      kind: string;
      markup: string;
    }>;
    preserve_aspect_ratio?: string;
    raw_root_attributes?: Record<string, boolean | number | string>;
    view_box?: string;
  };
};
```

### 10.5 SVG visual element

```ts
type SvgVisualElementNode = BaseNode & {
  kind: "svg-visual-element";
  svg_primitive: {
    element_name: string;
    order: number;
    attributes: Record<string, boolean | number | string>;
  };
};
```

Rules:

* `svg-visual-element` is meaningful only inside an `svg` node
* render order inside an `svg` root is determined by:

  1. `svg_primitive.order`
  2. original child order as a tiebreaker

## 11. Render Style

`render_style` is an open-ended CSS-like render-input property bag.

It stores the CSS-like declarations the product gives to the browser-backed renderer. It is not browser CSS computed style.

```ts
type RenderStyleValue = number | string;
type RenderStyleBag = Record<string, RenderStyleValue | undefined>;
```

### Rules

* `render_style` stores direct render inputs, not resolved output geometry
* `render_style` is render-oriented, not semantic-authoring-oriented
* unknown keys are allowed and MUST be preserved
* stored values are only strings or numbers
* `null` is not a persisted style value
* property deletion is represented by removing the property from the stored bag
* relative values such as percentages MUST be preserved as values, not rewritten into computed pixels
* width/height may be omitted when layout is determined by other inputs such as flex rules

The render lifecycle is:

1. normalize the document
2. materialize semantic authoring into `render_style`
3. render to the DOM
4. let the browser compute layout
5. measure the resolved border boxes
6. persist those measurements into `computed_layout`

`computed_layout` is therefore a derived persisted cache of the most recent resolved layout output. It never replaces `render_style` as the source of layout intent.

### Common keys

Common observed and supported keys include:

* `display`
* `position`
* `left`
* `top`
* `right`
* `bottom`
* `width`
* `height`
* `overflow`
* `gap`
* `flexDirection`
* `flexGrow`
* `flexBasis`
* `justifyContent`
* `alignItems`
* `alignSelf`
* `paddingTop`
* `paddingRight`
* `paddingBottom`
* `paddingLeft`
* `paddingBlock`
* `paddingInline`
* `minWidth`
* `minHeight`
* `maxHeight`
* `backgroundColor`
* `backgroundImage`
* `backgroundPosition`
* `backgroundRepeat`
* `backgroundSize`
* `borderRadius`
* `boxShadow`
* `backdropFilter`
* `filter`
* `opacity`
* `fontFamily`
* `fontSize`
* `fontWeight`
* `lineHeight`
* `letterSpacing`
* `color`
* `whiteSpace`
* `textAlign`
* `textTransform`
* `maxWidth`
* `outline`
* `outlineOffset`
* `transform`
* `transformOrigin`
* `translate`
* `rotate`
* `flexShrink`

## 12. Semantic Authoring Layer

The semantic layer is project-local and explicit in the persisted schema.

It consists of:

* canvas authoring
* node authoring
* variables
* styles
* scene metadata

### 12.1 Node semantic slots

```ts
type NodeSemanticSlot =
  | "node.layout.gap"
  | "node.layout.padding_top"
  | "node.layout.padding_right"
  | "node.layout.padding_bottom"
  | "node.layout.padding_left"
  | "node.paint.background_color"
  | "node.paint.opacity"
  | "node.shape.border_radius"
  | "node.text.color"
  | "node.typography.font_family"
  | "node.typography.font_size"
  | "node.typography.font_weight"
  | "node.typography.line_height"
  | "node.typography.letter_spacing";
```

### 12.2 Node authoring

```ts
type RendererNodeAuthoring = {
  local_values: Partial<Record<NodeSemanticSlot, string | number>>;
  variable_bindings: Partial<Record<NodeSemanticSlot, string>>;
  style_bindings: Partial<Record<"paint" | "text", string>>;
};
```

Node authoring containers exist on every node, but semantic legality is strict and determined by node kind.

### 12.3 Node-kind semantic applicability

Renderer support for a raw CSS or SVG property does not by itself make a semantic slot legal.

The v1 applicability matrix is:

- `frame`
  - valid slots: `node.layout.*`, `node.paint.background_color`, `node.paint.opacity`, `node.shape.border_radius`
  - valid style families: `paint`
- `rectangle`
  - valid slots: `node.paint.background_color`, `node.paint.opacity`, `node.shape.border_radius`
  - valid style families: `paint`
- `text`
  - valid slots: `node.text.color`, `node.typography.*`
  - valid style families: `text`
- `svg`
  - valid slots: none in v1
  - valid style families: none in v1
- `svg-visual-element`
  - valid slots: none in v1
  - valid style families: none in v1

Any other node-kind and slot or node-kind and style-family combination is invalid in the semantic layer.

Raw `render_style` may still carry non-semantic properties outside this matrix when the renderer supports them.

### 12.4 Slot mapping

Only the following render properties participate in semantic authoring:

* `canvas.background_color` -> `canvas.background_color`
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

All other render properties remain raw `render_style` only.

### 12.5 Semantic slot namespace

```ts
type RendererSemanticSlot = "canvas.background_color" | NodeSemanticSlot;
```

## 13. Variables

```ts
type RendererVariables = {
  collections: Record<string, RendererVariableCollection>;
};

type RendererVariableCollection = {
  id: string;
  name: string;
  default_mode_id: string;
  modes: Record<string, { id: string; name: string }>;
  variables: Record<string, RendererVariable>;
  description?: string;
};

type VariableModeValue<T> =
  | { kind: "value"; value: T }
  | { kind: "alias"; variable_id: string };
```

Supported variable kinds:

* `color`
* `radius`
* `spacing`
* `typography`

All variables share:

* `id`
* `collection_id`
* `group_path: string[]`
* `name`
* `scopes: RendererSemanticSlot[]`
* `values_by_mode`
* optional `description`

Mode values are:

* `{ kind: "value", value: ... }`
* `{ kind: "alias", variable_id: "..." }`

Typography variable values are:

```ts
type TypographyTokenValue = {
  font_family: string;
  font_size: string | number;
  font_weight?: string | number;
  line_height?: string | number;
  letter_spacing?: string | number;
};

type RendererVariableBase<TKind extends string, TValue> = {
  id: string;
  collection_id: string;
  kind: TKind;
  group_path: string[];
  name: string;
  scopes: RendererSemanticSlot[];
  values_by_mode: Record<string, VariableModeValue<TValue>>;
  description?: string;
};

type RendererVariable =
  | RendererVariableBase<"color", string>
  | RendererVariableBase<"radius", string | number>
  | RendererVariableBase<"spacing", string | number>
  | RendererVariableBase<"typography", TypographyTokenValue>;
```

## 14. Styles

```ts
type RendererStyles = {
  paint: Record<string, RendererPaintStyle>;
  text: Record<string, RendererTextStyle>;
};

type StyleSlotValue<T> =
  | { kind: "value"; value: T }
  | { kind: "variable"; variable_id: string };
```

Text styles may define:

* `node.text.color`
* `node.typography.font_family`
* `node.typography.font_size`
* `node.typography.font_weight`
* `node.typography.line_height`
* `node.typography.letter_spacing`

Text styles are only bindable to `text` nodes in v1.

Paint styles may define:

* `node.paint.background_color`
* `node.shape.border_radius`
* `node.paint.opacity`

Paint styles are only bindable to `frame` and `rectangle` nodes in v1.

Style slots store either:

* `{ kind: "value", value: ... }`
* `{ kind: "variable", variable_id: "..." }`

```ts
type RendererPaintStyle = {
  id: string;
  name: string;
  description?: string;
  slots: Partial<{
    "node.paint.background_color": StyleSlotValue<string>;
    "node.shape.border_radius": StyleSlotValue<string | number>;
    "node.paint.opacity": StyleSlotValue<string | number>;
  }>;
};

type RendererTextStyle = {
  id: string;
  name: string;
  description?: string;
  slots: Partial<{
    "node.text.color": StyleSlotValue<string>;
    "node.typography.font_family": StyleSlotValue<string>;
    "node.typography.font_size": StyleSlotValue<string | number>;
    "node.typography.font_weight": StyleSlotValue<string | number>;
    "node.typography.line_height": StyleSlotValue<string | number>;
    "node.typography.letter_spacing": StyleSlotValue<string | number>;
  }>;
};
```

## 15. Assets

The canonical desktop asset model is local-first and project-local.

```ts
type OpaqueValue =
  | null
  | boolean
  | number
  | string
  | OpaqueValue[]
  | { [key: string]: OpaqueValue };
```

```ts
type AssetRecord = {
  id: string;
  kind: "image" | "svg" | "unknown";
  mime_type: string;
  width?: number;
  height?: number;
  metadata?: Record<string, OpaqueValue>;
  source: EmbeddedAssetSource | LocalAssetStoreSource;
};

type EmbeddedAssetSource =
  | { kind: "data_uri"; data_uri: string }
  | { kind: "base64"; base64: string };

type LocalAssetStoreSource = {
  kind: "asset_store";
  content_hash: string;
  original_filename?: string;
};
```

### Rules

* asset ids are project-local
* `mime_type` is required
* `width` and `height` SHOULD be present when known
* `metadata` is optional
* content is stored either:

  * embedded directly in the document, or
  * by reference to the local asset store using a content hash

### Asset references

In v1, nodes reference assets only through concrete document fields.

The only documented node-level asset reference is:

1. `render_style.backgroundImage` containing `url(asset://<assetId>)`

If future node fields reference assets, they must define their own semantics explicitly.

### Asset name uniqueness

If the app persists a display name for an asset in `metadata` or elsewhere, that name SHOULD be unique within the project, case-insensitively.

## 16. Canonical Empty Document

A valid empty document has an infinite canvas, no scenes, no loose nodes, no assets, and empty semantic containers.

```json
{
  "schema_version": 1,
  "render_canon": "browser-css",
  "document_id": "doc_0001",
  "name": "Untitled",
  "page_name": "Page 1",
  "source": {
    "kind": "ai-canvas"
  },
  "canvas": {
    "extent_mode": "infinite",
    "authoring": {
      "local_values": {},
      "variable_bindings": {}
    }
  },
  "root": {
    "id": "canvas_root",
    "child_ids": []
  },
  "scenes": {},
  "nodes": {},
  "assets": {},
  "variables": {
    "collections": {}
  },
  "styles": {
    "paint": {},
    "text": {}
  }
}
```

## 17. Validation and Repair Policy

Normalization SHOULD repair documents where possible.

### 17.1 Repairable issues

Normalization SHOULD repair or safely tolerate these when possible:

* missing empty semantic containers
* missing `scene_metadata.tags`
* stale `scene.child_count`
* missing or stale `computed_layout`
* broken `root.child_ids` entries that refer to missing nodes
* broken `child_ids` entries that refer to missing nodes
* `backgroundImage` asset references to missing assets
* style bindings to missing style ids
* variable bindings to missing variable ids

Repair behavior:

* restore required empty containers
* recompute derived fields
* preserve or tolerate missing/stale `computed_layout` during normalization
* drop broken references that cannot be repaired safely

### 17.2 Structural issues

For serious structural issues, normalization SHOULD preserve as much visible content as possible.

Examples:

* if a node points to a missing parent, reattach it as a loose top-level node
* if a scene record exists without a valid frame node, drop the scene record
* if a frame node looks like an orphaned scene backing node, preserve the frame node as a loose top-level node rather than deleting it outright

### 17.3 Non-fatal stance

The product should prefer:

* render what can be rendered
* inspect what can be inspected
* drop only data that is provably broken and unsafe to keep

## 18. Non-Goals of This Document

This schema document does not define:

* normalization precedence rules in detail
* semantic materialization rules
* command semantics
* undo/redo behavior
* autosave timing
* renderer implementation details
* import compatibility rules

Those belong in separate docs.
