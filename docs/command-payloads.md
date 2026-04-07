# AI Canvas Command Payloads

Status: Normative contract.

This document defines the canonical command payload schema for AI Canvas Desktop.

It specifies:

- the command batch envelope
- the `Command` discriminated union
- payload shape for each command
- patch conventions
- required and optional fields
- command result shape

This document is normative for:

- editor command dispatch
- local MCP command dispatch
- undo/redo command replay
- any scripting or automation layer

This document does **not** define what commands mean semantically.  
That behavior lives in `docs/command-semantics.md`.

Whenever this document describes whether a payload shape is valid or invalid, it is defining wire-shape admissibility only. Mutation meaning, repair behavior, lifecycle, and failure semantics live in `docs/command-semantics.md`.

## 1. Authority

For command payload shape, the order of authority is:

1. this document
2. the machine-readable command schema in `packages/document-core`
3. `docs/command-semantics.md`
4. `docs/document-schema.md`

If these disagree, update the docs and machine-readable schema in the same change.

## 2. Design Rules

### 2.1 Discriminated union

Every command must have a `type` field.

```ts
type Command = {
  type: string;
};
````

Concrete commands are discriminated by `type`.

### 2.2 Caller-provided ids

Create commands must use caller-provided ids.

This applies to:

* scenes
* nodes
* assets
* variables
* styles

### 2.3 Omitted means unchanged

For patch-style commands:

* omitted field means “leave unchanged”

### 2.4 `null` means clear only where explicitly allowed

`null` is only allowed where a command explicitly says it means “clear this field”.

It must not be used as a general replacement for omission.

### 2.5 No implicit side-channel state

Commands must contain all information needed for deterministic application.

They must not depend on:

* current UI selection unless the caller resolves that into explicit ids
* current hover state
* DOM state
* local renderer caches

## 3. Batch Envelope

Commands are applied in ordered batches.

```ts
type CommandBatch = {
  commands: Command[];
};
```

The canonical application envelope is:

```ts
type ApplyCommandsInput = {
  document_id: string;
  commands: Command[];
  base_revision?: number;
};
```

Notes:

* `base_revision` is an optional optimistic concurrency token
* conflict behavior is defined in `docs/command-semantics.md`
* in v1, callers usually derive `document_id` from the targeted project's sole document

## 4. Shared Primitive Types

```ts
type Id = string;

type SceneId = string;
type NodeId = string;
type AssetId = string;
type VariableId = string;
type VariableCollectionId = string;
type StyleId = string;

type StyleFamily = "paint" | "text";

type NodeKind =
  | "frame"
  | "rectangle"
  | "text"
  | "svg"
  | "svg-visual-element";

type RenderStyleValue = string | number;

type RenderStylePatch = Record<string, RenderStyleValue | null>;

type OpaqueValue =
  | null
  | boolean
  | number
  | string
  | OpaqueValue[]
  | { [key: string]: OpaqueValue };

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

type CanvasSemanticSlot = "canvas.background_color";

type SceneMetadataPatch = {
  group?: string | null;
  notes?: string | null;
  role?: string | null;
  summary?: string | null;
  tags?: string[];
};
```

## 5. Structural Commands

## 5.1 `create_scene`

Creates a new scene and its backing frame node.

```ts
type CreateSceneCommand = {
  type: "create_scene";
  scene: {
    id: SceneId;
    name: string;
    left?: RenderStyleValue;
    top?: RenderStyleValue;
    width?: RenderStyleValue;
    height?: RenderStyleValue;
    scene_metadata?: {
      group?: string;
      notes?: string;
      role?: string;
      summary?: string;
      tags?: string[];
    };
    render_style?: Record<string, RenderStyleValue>;
  };
};
```

Notes:

* `scene.id` is also the backing frame node id
* omitted `scene_metadata.tags` defaults to `[]`
* `create_scene` requires authored `left`, `top`, `width`, and `height` inputs for the backing frame
* each of `left`, `top`, `width`, and `height` must be provided exactly once, either through its convenience field or the corresponding `render_style` property
* convenience geometry fields are translated into backing-frame `render_style`
* callers must not provide the same geometry property in both a convenience field and `render_style`
* `create_scene` must not rely on implicit placement or size defaults

## 5.2 `update_scene`

```ts
type UpdateSceneCommand = {
  type: "update_scene";
  scene_id: SceneId;
  patch: {
    name?: string;
    left?: RenderStyleValue;
    top?: RenderStyleValue;
    width?: RenderStyleValue;
    height?: RenderStyleValue;
    render_style?: RenderStylePatch;
  };
};
```

Rules:

* this command updates scene name and backing-frame render inputs only
* scene metadata is edited through `update_scene_metadata`
* convenience geometry fields are translated into backing-frame `render_style`
* callers must not provide the same geometry property in both a convenience field and `render_style`
* `render_style[key] = null` means delete that backing-frame render-style property
* this command does not directly edit `child_count`

## 5.3 `delete_scene`

```ts
type DeleteSceneCommand = {
  type: "delete_scene";
  scene_id: SceneId;
};
```

## 5.4 `update_scene_metadata`

```ts
type UpdateSceneMetadataCommand = {
  type: "update_scene_metadata";
  scene_id: SceneId;
  patch: SceneMetadataPatch;
};
```

Rules:

* `tags` replaces the full tags array
* nullable string fields clear when `null`

## 5.5 `create_node`

```ts
type CreateNodeCommand = {
  type: "create_node";
  node: CreateNodePayload;
  parent: {
    parent_id: NodeId | null;
    index?: number;
  };
};
```

Where:

```ts
type BaseCreateNodePayload = {
  id: NodeId;
  kind: NodeKind;
  name: string;
  left?: RenderStyleValue;
  top?: RenderStyleValue;
  width?: RenderStyleValue;
  height?: RenderStyleValue;
  is_visible?: boolean;
  is_locked?: boolean;
  render_style?: Record<string, RenderStyleValue>;
};

type CreateFrameNodePayload = BaseCreateNodePayload & {
  kind: "frame";
};

type CreateRectangleNodePayload = BaseCreateNodePayload & {
  kind: "rectangle";
};

type CreateTextNodePayload = BaseCreateNodePayload & {
  kind: "text";
  text: {
    content: string;
  };
};

type CreateSvgNodePayload = BaseCreateNodePayload & {
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

type CreateSvgVisualElementNodePayload = BaseCreateNodePayload & {
  kind: "svg-visual-element";
  svg_primitive: {
    element_name: string;
    order: number;
    attributes: Record<string, boolean | number | string>;
  };
};

type CreateNodePayload =
  | CreateFrameNodePayload
  | CreateRectangleNodePayload
  | CreateTextNodePayload
  | CreateSvgNodePayload
  | CreateSvgVisualElementNodePayload;
```

Rules:

* `parent.parent_id = null` creates a loose top-level node
* callers should use `create_scene` rather than creating a scene backing frame directly
* omitted `is_visible` defaults to `true`
* omitted `is_locked` defaults to `false`
* omitted `render_style` defaults to `{}`
* convenience geometry fields are translated into `render_style`
* callers must not provide the same geometry property in both a convenience field and `render_style`
* omitted width/height remain omitted authored inputs

## 5.6 `update_node`

```ts
type UpdateNodeCommand = {
  type: "update_node";
  node_id: NodeId;
  patch: {
    name?: string;
    is_visible?: boolean;
    is_locked?: boolean;
    left?: RenderStyleValue;
    top?: RenderStyleValue;
    width?: RenderStyleValue;
    height?: RenderStyleValue;
    render_style?: RenderStylePatch;
  };
};
```

Patch rules:

* omitted field means unchanged
* convenience geometry fields are translated into `render_style`
* callers must not provide the same geometry property in both a convenience field and `render_style`
* `render_style[key] = null` means delete that style property
* typed payload fields are updated through dedicated commands rather than `update_node`
* use `update_text_content`, `update_svg_root`, and `update_svg_primitive` for text and SVG payload mutation

## 5.7 `reparent_node`

```ts
type ReparentNodeCommand = {
  type: "reparent_node";
  node_id: NodeId;
  destination: {
    parent_id: NodeId | null;
    index?: number;
  };
};
```

## 5.8 `reorder_children`

```ts
type ReorderChildrenCommand = {
  type: "reorder_children";
  container: {
    parent_id: NodeId | null;
  };
  child_ids: NodeId[];
};
```

Rules:

* `parent_id: null` means reorder `root.child_ids`
* `child_ids` must be a full replacement ordering for that container
* `child_ids` must contain exactly the existing children of that container
* `child_ids` must not contain duplicates
* reorder does not insert, delete, or reparent children

## 5.9 `delete_node`

```ts
type DeleteNodeCommand = {
  type: "delete_node";
  node_id: NodeId;
};
```

## 6. Text Commands

## 6.1 `update_text_content`

```ts
type UpdateTextContentCommand = {
  type: "update_text_content";
  node_id: NodeId;
  content: string;
};
```

`content` may be empty.

## 7. Semantic Commands

## 7.1 `set_canvas_local_value`

```ts
type SetCanvasLocalValueCommand = {
  type: "set_canvas_local_value";
  slot: CanvasSemanticSlot;
  value: string | number;
};
```

## 7.2 `clear_canvas_local_value`

```ts
type ClearCanvasLocalValueCommand = {
  type: "clear_canvas_local_value";
  slot: CanvasSemanticSlot;
};
```

## 7.3 `bind_canvas_variable`

```ts
type BindCanvasVariableCommand = {
  type: "bind_canvas_variable";
  slot: CanvasSemanticSlot;
  variable_id: VariableId;
};
```

## 7.4 `clear_canvas_variable_binding`

```ts
type ClearCanvasVariableBindingCommand = {
  type: "clear_canvas_variable_binding";
  slot: CanvasSemanticSlot;
};
```

## 7.5 `set_node_local_value`

```ts
type SetNodeLocalValueCommand = {
  type: "set_node_local_value";
  node_id: NodeId;
  slot: NodeSemanticSlot;
  value: string | number;
};
```

## 7.6 `clear_node_local_value`

```ts
type ClearNodeLocalValueCommand = {
  type: "clear_node_local_value";
  node_id: NodeId;
  slot: NodeSemanticSlot;
};
```

## 7.7 `bind_node_variable`

```ts
type BindNodeVariableCommand = {
  type: "bind_node_variable";
  node_id: NodeId;
  slot: NodeSemanticSlot;
  variable_id: VariableId;
};
```

## 7.8 `clear_node_variable_binding`

```ts
type ClearNodeVariableBindingCommand = {
  type: "clear_node_variable_binding";
  node_id: NodeId;
  slot: NodeSemanticSlot;
};
```

## 7.9 `bind_node_style`

```ts
type BindNodeStyleCommand = {
  type: "bind_node_style";
  node_id: NodeId;
  family: StyleFamily;
  style_id: StyleId;
};
```

## 7.10 `clear_node_style_binding`

```ts
type ClearNodeStyleBindingCommand = {
  type: "clear_node_style_binding";
  node_id: NodeId;
  family: StyleFamily;
};
```

## 7.11 Semantic applicability rules

Node-targeted semantic commands use a strict node-kind applicability matrix.

In v1:

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
  - valid slots: none
  - valid style families: none
- `svg-visual-element`
  - valid slots: none
  - valid style families: none

Rules:

* `set_node_local_value`, `clear_node_local_value`, `bind_node_variable`, and `clear_node_variable_binding` require `slot` to be valid for the target node kind
* `bind_node_style` and `clear_node_style_binding` require `family` to be valid for the target node kind
* invalid node-kind and slot or node-kind and family combinations must fail with `validation_failed`
* v1 does not partially apply an invalid style family to a node

## 8. Variable Commands

## 8.1 `create_variable_collection`

```ts
type CreateVariableCollectionCommand = {
  type: "create_variable_collection";
  collection: {
    id: VariableCollectionId;
    name: string;
    default_mode_id: string;
    modes: Record<string, { id: string; name: string }>;
    description?: string;
  };
};
```

## 8.2 `update_variable_collection`

```ts
type UpdateVariableCollectionCommand = {
  type: "update_variable_collection";
  collection_id: VariableCollectionId;
  patch: {
    name?: string;
    default_mode_id?: string;
    description?: string | null;
  };
};
```

## 8.3 `delete_variable_collection`

```ts
type DeleteVariableCollectionCommand = {
  type: "delete_variable_collection";
  collection_id: VariableCollectionId;
};
```

## 8.4 `create_variable`

```ts
type VariableValueByMode =
  | { kind: "value"; value: string | number | TypographyTokenValue }
  | { kind: "alias"; variable_id: VariableId };

type TypographyTokenValue = {
  font_family: string;
  font_size: string | number;
  font_weight?: string | number;
  line_height?: string | number;
  letter_spacing?: string | number;
};

type CreateVariableCommand = {
  type: "create_variable";
  variable: {
    id: VariableId;
    collection_id: VariableCollectionId;
    kind: "color" | "radius" | "spacing" | "typography";
    group_path: string[];
    name: string;
    scopes: Array<CanvasSemanticSlot | NodeSemanticSlot>;
    values_by_mode: Record<string, VariableValueByMode>;
    description?: string;
  };
};
```

## 8.5 `update_variable`

```ts
type UpdateVariableCommand = {
  type: "update_variable";
  variable_id: VariableId;
  patch: {
    group_path?: string[];
    name?: string;
    scopes?: Array<CanvasSemanticSlot | NodeSemanticSlot>;
    values_by_mode?: Record<string, VariableValueByMode>;
    description?: string | null;
  };
};
```

## 8.6 `delete_variable`

```ts
type DeleteVariableCommand = {
  type: "delete_variable";
  variable_id: VariableId;
};
```

## 9. Style Commands

## 9.1 `create_style`

```ts
type StyleSlotValue =
  | { kind: "value"; value: string | number }
  | { kind: "variable"; variable_id: VariableId };

type CreatePaintStyleCommand = {
  type: "create_style";
  style: {
    id: StyleId;
    family: "paint";
    name: string;
    description?: string;
    slots: Partial<{
      "node.paint.background_color": StyleSlotValue;
      "node.shape.border_radius": StyleSlotValue;
      "node.paint.opacity": StyleSlotValue;
    }>;
  };
};

type CreateTextStyleCommand = {
  type: "create_style";
  style: {
    id: StyleId;
    family: "text";
    name: string;
    description?: string;
    slots: Partial<{
      "node.text.color": StyleSlotValue;
      "node.typography.font_family": StyleSlotValue;
      "node.typography.font_size": StyleSlotValue;
      "node.typography.font_weight": StyleSlotValue;
      "node.typography.line_height": StyleSlotValue;
      "node.typography.letter_spacing": StyleSlotValue;
    }>;
  };
};

type CreateStyleCommand =
  | CreatePaintStyleCommand
  | CreateTextStyleCommand;
```

Rules:

* `type` discriminates the command family
* `style.family` discriminates the create payload variant
* family validity for a target node is checked when the style is bound, not when the style is defined

## 9.2 `update_style`

```ts
type UpdatePaintStyleCommand = {
  type: "update_style";
  family: "paint";
  style_id: StyleId;
  patch: {
    name?: string;
    description?: string | null;
    slots?: Partial<{
      "node.paint.background_color": StyleSlotValue | null;
      "node.shape.border_radius": StyleSlotValue | null;
      "node.paint.opacity": StyleSlotValue | null;
    }>;
  };
};

type UpdateTextStyleCommand = {
  type: "update_style";
  family: "text";
  style_id: StyleId;
  patch: {
    name?: string;
    description?: string | null;
    slots?: Partial<{
      "node.text.color": StyleSlotValue | null;
      "node.typography.font_family": StyleSlotValue | null;
      "node.typography.font_size": StyleSlotValue | null;
      "node.typography.font_weight": StyleSlotValue | null;
      "node.typography.line_height": StyleSlotValue | null;
      "node.typography.letter_spacing": StyleSlotValue | null;
    }>;
  };
};

type UpdateStyleCommand =
  | UpdatePaintStyleCommand
  | UpdateTextStyleCommand;
```

Rule:

* `family` discriminates the update payload variant
* `slots[slot] = null` means remove that slot from the style definition
* family validity for a target node is checked when the style is bound, not when the style is defined

## 9.3 `delete_style`

```ts
type DeleteStyleCommand = {
  type: "delete_style";
  family: StyleFamily;
  style_id: StyleId;
};
```

## 10. Asset Commands

## 10.1 `create_asset`

```ts
type AssetRecord = {
  id: AssetId;
  kind: "image" | "svg" | "unknown";
  mime_type: string;
  width?: number;
  height?: number;
  metadata?: Record<string, OpaqueValue>;
  source: { kind: "asset_store"; content_hash: string; original_filename?: string };
};

type CreateAssetCommand = {
  type: "create_asset";
  asset: AssetRecord;
};
```

Notes:

* live desktop command payloads create asset records only; they do not upload raw bytes
* MCP callers that need to ingest bytes should use `create_asset_from_bytes`, and callers that only have a public image URL should use `create_asset_from_url`
* both MCP asset-ingest tools return a usable `asset_id` that can be referenced in later commands

## 10.2 `update_asset`

```ts
type UpdateAssetCommand = {
  type: "update_asset";
  asset_id: AssetId;
  patch: {
    width?: number | null;
    height?: number | null;
    metadata?: Record<string, OpaqueValue> | null;
    source?: { kind: "asset_store"; content_hash: string; original_filename?: string };
  };
};
```

Rules:

* `width: null` or `height: null` clears that dimension
* `metadata: null` clears metadata
* live desktop command payloads should create or switch assets only to `asset_store` sources
* asset `id`, `kind`, and `mime_type` are immutable through `update_asset`

## 10.3 `delete_asset`

```ts
type DeleteAssetCommand = {
  type: "delete_asset";
  asset_id: AssetId;
};
```

## 11. SVG Commands

## 11.1 `update_svg_root`

```ts
type UpdateSvgRootCommand = {
  type: "update_svg_root";
  node_id: NodeId;
  patch: {
    definitions?: Array<{
      id?: string;
      kind: string;
      markup: string;
    }>;
    preserve_aspect_ratio?: string | null;
    raw_root_attributes?: Record<string, boolean | number | string>;
    view_box?: string | null;
  };
};
```

Rules:

* nullable scalar-like fields clear when `null`
* array/object fields replace when provided

## 11.2 `update_svg_primitive`

```ts
type UpdateSvgPrimitiveCommand = {
  type: "update_svg_primitive";
  node_id: NodeId;
  patch: {
    element_name?: string;
    order?: number;
    attributes?: Record<string, boolean | number | string>;
  };
};
```

## 12. Full Command Union

```ts
type Command =
  | CreateSceneCommand
  | UpdateSceneCommand
  | DeleteSceneCommand
  | UpdateSceneMetadataCommand
  | CreateNodeCommand
  | UpdateNodeCommand
  | ReparentNodeCommand
  | ReorderChildrenCommand
  | DeleteNodeCommand
  | UpdateTextContentCommand
  | SetCanvasLocalValueCommand
  | ClearCanvasLocalValueCommand
  | BindCanvasVariableCommand
  | ClearCanvasVariableBindingCommand
  | SetNodeLocalValueCommand
  | ClearNodeLocalValueCommand
  | BindNodeVariableCommand
  | ClearNodeVariableBindingCommand
  | BindNodeStyleCommand
  | ClearNodeStyleBindingCommand
  | CreateVariableCollectionCommand
  | UpdateVariableCollectionCommand
  | DeleteVariableCollectionCommand
  | CreateVariableCommand
  | UpdateVariableCommand
  | DeleteVariableCommand
  | CreateStyleCommand
  | UpdateStyleCommand
  | DeleteStyleCommand
  | CreateAssetCommand
  | UpdateAssetCommand
  | DeleteAssetCommand
  | UpdateSvgRootCommand
  | UpdateSvgPrimitiveCommand;
```

## 13. Result Envelope

A command application result should return either the updated document state or a structured failure.

The canonical success shape is:

```ts
type ApplyCommandsSuccess = {
  ok: true;
  document_id: string;
  revision: number;
  document: RendererDocument;
  effects?: {
    changed_node_ids?: NodeId[];
    changed_scene_ids?: SceneId[];
    changed_asset_ids?: AssetId[];
    changed_variable_ids?: VariableId[];
    changed_style_ids?: StyleId[];
  };
};
```

The canonical error shape is:

```ts
type ApplyCommandsErrorCode =
  | "revision_conflict"
  | "validation_failed"
  | "unrecoverable_command"
  | "unknown_command"
  | "target_not_found"
  | "measurement_surface_unavailable";

type ApplyCommandsError = {
  ok: false;
  document_id: string;
  revision?: number;
  error: {
    code: ApplyCommandsErrorCode;
    message: string;
    command_index?: number;
    details?: Record<string, OpaqueValue>;
  };
};

type ApplyCommandsResult =
  | ApplyCommandsSuccess
  | ApplyCommandsError;
```

Rules:

* failures reject the whole batch and leave the document unchanged
* `revision`, when present on an error, is the current persisted revision known to the command system
* `command_index` identifies the first failing command when the failure is attributable to one command
* `effects` are optional convenience data and are not part of command meaning

## 14. Examples

## 14.1 Create a scene

```json
{
  "type": "create_scene",
  "scene": {
    "id": "scene_home",
    "name": "Home",
    "left": 120,
    "top": 80,
    "width": 390,
    "height": 844,
    "scene_metadata": {
      "role": "screen",
      "tags": ["mobile", "home"]
    },
    "render_style": {
      "backgroundColor": "#f6f8fb"
    }
  }
}
```

## 14.2 Create a text node

```json
{
  "type": "create_node",
  "node": {
    "id": "node_title",
    "kind": "text",
    "name": "Title",
    "width": 220,
    "height": 40,
    "text": {
      "content": "Welcome"
    },
    "render_style": {
      "fontSize": "32px",
      "fontWeight": 700,
      "color": "#111111"
    }
  },
  "parent": {
    "parent_id": "scene_home",
    "index": 0
  }
}
```

## 14.3 Bind a paint style

```json
{
  "type": "bind_node_style",
  "node_id": "node_card",
  "family": "paint",
  "style_id": "style_surface_primary"
}
```

## 14.4 Patch a semantic style field through `update_node`

```json
{
  "type": "update_node",
  "node_id": "node_card",
  "patch": {
    "render_style": {
      "backgroundColor": "#ffffff"
    }
  }
}
```

This payload is valid. Its semantic meaning is defined in `docs/command-semantics.md`.

## 15. Non-Goals of This Document

This document does not define:

* command atomicity rules in detail
* semantic precedence rules
* normalization behavior
* rendering behavior
* undo/redo storage implementation
* transport protocol details outside the payload schema itself
