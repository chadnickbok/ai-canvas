# AI Canvas Command Payloads

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
- any future scripting or automation layer

This document does **not** define what commands mean semantically.  
That behavior lives in `docs/command-semantics.md`.

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

A concrete implementation may wrap this with metadata such as:

```ts
type ApplyCommandsInput = {
  document_id: string;
  commands: Command[];
  base_revision?: number;
};
```

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

type ComputedStyleValue = string | number;

type ComputedStylePatch = Record<string, ComputedStyleValue | null>;

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
    left: number;
    top: number;
    width: number;
    height: number;
    scene_metadata?: {
      group?: string;
      notes?: string;
      role?: string;
      summary?: string;
      tags?: string[];
    };
    computed_style?: Record<string, ComputedStyleValue>;
  };
};
```

Notes:

* `scene.id` is also the backing frame node id
* omitted `scene_metadata.tags` defaults to `[]`
* omitted `computed_style.width` / `height` may be synthesized during normalization

## 5.2 `update_scene`

```ts
type UpdateSceneCommand = {
  type: "update_scene";
  scene_id: SceneId;
  patch: {
    name?: string;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  };
};
```

This command does not directly edit `child_count`.

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
  width: number;
  height: number;
  is_visible?: boolean;
  is_locked?: boolean;
  computed_style?: Record<string, ComputedStyleValue>;
  asset_refs?: AssetId[];
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

## 5.6 `update_node`

```ts
type UpdateNodeCommand = {
  type: "update_node";
  node_id: NodeId;
  patch: {
    name?: string;
    is_visible?: boolean;
    is_locked?: boolean;
    width?: number;
    height?: number;
    computed_style?: ComputedStylePatch;
    asset_refs?: AssetId[];
  };
};
```

Patch rules:

* omitted field means unchanged
* `computed_style[key] = null` means delete that style property
* `asset_refs` replaces the entire asset ref array if provided

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

* `slots[slot] = null` means remove that slot from the style definition

## 9.3 `delete_style`

```ts
type DeleteStyleCommand = {
  type: "delete_style";
  family: StyleFamily;
  style_id: StyleId;
};
```

## 10. Design Brief Commands

## 10.1 `update_design_brief`

```ts
type UpdateDesignBriefCommand = {
  type: "update_design_brief";
  patch: {
    audience?: string | null;
    brand_adjectives?: string[];
    notes?: string | null;
    preferred_layout_idioms?: string[];
    product_summary?: string | null;
    radius_policy?: string | null;
    scene_map_summary?: string | null;
    spacing_density?: string | null;
    target_vibe?: string | null;
    typography_direction?: string | null;
  };
};
```

Rules:

* array fields replace the full array
* nullable scalar fields clear when `null`

## 11. Asset Commands

## 11.1 `create_asset`

```ts
type AssetRecord = {
  id: AssetId;
  kind: "image" | "svg" | "unknown";
  mime_type: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
  source:
    | { kind: "data_uri"; data_uri: string }
    | { kind: "base64"; base64: string }
    | { kind: "asset_store"; content_hash: string; original_filename?: string };
};

type CreateAssetCommand = {
  type: "create_asset";
  asset: AssetRecord;
};
```

## 11.2 `update_asset`

```ts
type UpdateAssetCommand = {
  type: "update_asset";
  asset_id: AssetId;
  patch: {
    width?: number | null;
    height?: number | null;
    metadata?: Record<string, unknown> | null;
    source?:
      | { kind: "data_uri"; data_uri: string }
      | { kind: "base64"; base64: string }
      | { kind: "asset_store"; content_hash: string; original_filename?: string };
  };
};
```

Rules:

* `width: null` or `height: null` clears that dimension
* `metadata: null` clears metadata
* asset `id`, `kind`, and `mime_type` are immutable through `update_asset`

## 11.3 `delete_asset`

```ts
type DeleteAssetCommand = {
  type: "delete_asset";
  asset_id: AssetId;
};
```

## 12. SVG Commands

## 12.1 `update_svg_root`

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

## 12.2 `update_svg_primitive`

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

## 13. Full Command Union

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
  | UpdateDesignBriefCommand
  | CreateAssetCommand
  | UpdateAssetCommand
  | DeleteAssetCommand
  | UpdateSvgRootCommand
  | UpdateSvgPrimitiveCommand;
```

## 14. Result Envelope

A command application result should return the updated document state and enough metadata for callers to reconcile.

A good canonical shape is:

```ts
type ApplyCommandsResult = {
  document_id: string;
  revision: number;
  document: RendererDocument;
};
```

A richer implementation may also return:

```ts
type ApplyCommandsResult = {
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

Those effect summaries are optional convenience data.
They are not part of command meaning.

## 15. Examples

## 15.1 Create a scene

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
    }
  }
}
```

## 15.2 Create a text node

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
    "computed_style": {
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

## 15.3 Bind a paint style

```json
{
  "type": "bind_node_style",
  "node_id": "node_card",
  "family": "paint",
  "style_id": "style_surface_primary"
}
```

## 15.4 Patch a semantic style field through `update_node`

```json
{
  "type": "update_node",
  "node_id": "node_card",
  "patch": {
    "computed_style": {
      "backgroundColor": "#ffffff"
    }
  }
}
```

This payload is valid. Its semantic meaning is defined in `docs/command-semantics.md`.

## 16. Non-Goals of This Document

This document does not define:

* command atomicity rules in detail
* semantic precedence rules
* normalization behavior
* rendering behavior
* undo/redo storage implementation
* transport protocol details outside the payload schema itself

