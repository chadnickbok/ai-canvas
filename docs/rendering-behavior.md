# AI Canvas Rendering Behavior

Status: Normative contract.

This document defines how AI Canvas Desktop renders a normalized document.

It answers:

- what document shape the renderer consumes
- how top-level content is interpreted
- how scenes render
- how each node kind renders
- how style values are applied
- how assets resolve
- how ordering, clipping, and visibility work
- what fallback behavior is allowed

This document is a normative contract for the pure document render used by the desktop renderer.

It defines the pure document render only.

It does not define:

- the interaction layer
- transient editor overlays such as selection outlines, guides, or drag previews
- editor chrome such as panels, inspectors, or toolbars

## 1. Authority

For rendering behavior, the order of authority is:

1. this document
2. the renderer implementation in `packages/editor-ui`
3. `docs/document-schema.md`
4. `docs/document-normalization.md`

If these disagree, update the docs and implementation in the same change.

## 2. Render Canon

The current render canon is fixed:

- `render_canon: "browser-css"`

This means the renderer should interpret the document using browser-like HTML, SVG, and CSS semantics wherever possible.

The renderer is not a custom scene engine with its own layout rules.

It is a browser-backed renderer of a structured document model.

## 3. Renderer Input

The renderer must consume a **normalized** document.

The renderer must not rely on:

- missing required containers
- stale derived fields
- broken parent-child relationships
- unresolved semantic bindings
- unmaterialized semantic render properties

Before rendering, the document is expected to have already passed normalization.

The renderer consumes normalized structure plus `render_style`. A fresh `computed_layout` snapshot is not required for first render.

## 4. Core Rendering Model

The rendered workspace consists of:

- an infinite canvas
- ordered top-level content from `root.child_ids`
- scene-backed content
- optional loose top-level nodes

The renderer must preserve:

- top-level ordering
- subtree ordering
- scene grouping
- scene-local content structure
- semantic materialization already written into `render_style`

## 5. Top-Level Render Selection

Each entry in `root.child_ids` is interpreted in this order:

1. if `scenes[id]` exists, render it as a scene
2. otherwise, if `nodes[id]` exists and is top-level, render it as a loose top-level node
3. otherwise, skip it

The renderer must not invent missing top-level content.

Normalization is responsible for repairing `root.child_ids` before render.

## 6. Canvas Rendering

## 6.1 Infinite canvas

The canvas is an infinite coordinate plane.

The renderer should present a bounded viewport onto that infinite space, but the document model itself is not bounded.

## 6.2 Canvas background

The canvas background color is taken from:

- `canvas.background_color`

That field is already the resolved render-facing value.

The renderer should not independently resolve semantic canvas bindings at render time.

## 6.3 Top-level ordering

`root.child_ids` is authoritative for top-level paint order.

Later entries render above earlier entries.

This applies to:

- scenes
- loose top-level nodes

## 7. Scene Rendering

A scene is represented by:

- a scene record in `scenes`
- a backing frame node in `nodes` with the same id

The renderer treats the scene as a top-level positioned unit.

## 7.1 Scene geometry

A scene’s top-level position and extent come only from its backing frame node:

- authored placement and sizing come from `nodes[scene.id].render_style`
- last measured placement and sizing come from `nodes[scene.id].computed_layout`

The scene record does not duplicate geometry.

## 7.2 Backing frame role

The backing frame node provides:

- scene-local child structure
- scene-local styling
- background styling
- layout and content tree
- top-level placement and extent

The renderer should treat the backing frame node as both the content root and the source of scene placement.

## 7.3 Scene/frame synchronization assumption

The schema and command system are expected to keep the scene record and backing frame synchronized.

The renderer may assume:

- `scene.id === scene.frame_node_id`
- `nodes[scene.id]` exists
- `nodes[scene.id].kind === "frame"`

If this is violated after normalization, the renderer should skip the scene record rather than guessing a replacement.

## 7.4 Scene clipping

If the backing frame’s render-facing style implies clipping, such as:

- `overflow: hidden`
- `overflow: clip`

the renderer should clip scene-local descendants accordingly.

## 8. Node Rendering

The renderer supports these node kinds:

- `frame`
- `rectangle`
- `text`
- `svg`
- `svg-visual-element`

Nodes render according to:

- structural position in the tree
- `render_style`
- typed payload fields
- resolved asset references

## 9. General Style Consumption Rules

## 9.1 `render_style` is primary render input

For rendering, `render_style` is the primary render-facing style bag.

The renderer should pass through supported render properties as directly as possible to browser-backed style application.

## 9.2 Unknown style properties

Unknown `render_style` keys should be preserved in the document, but the renderer only needs to apply properties that are valid and safe for its rendering path.

If a property is unsupported by the implementation, the renderer may ignore it.

The renderer must not remove unsupported properties from the document just because it does not render them.

## 9.3 Default box sizing

The renderer should apply:

- `box-sizing: border-box`

to rendered HTML box nodes unless the implementation intentionally chooses a different global rule and does so consistently.

## 9.4 Visibility

Visibility is controlled by:

- `node.is_visible`

If `is_visible === false`, the renderer should render the node as not visible.

The renderer may implement this as:

- `display: none`
- or equivalent omission from the rendered tree

The persisted truth remains `is_visible`, not a style mutation.

## 9.5 Geometry consumption

The renderer consumes geometry from `render_style` plus normal browser layout.

Authoritative input may include:

- `width`
- `height`
- `position`
- `left`
- `top`
- `right`
- `bottom`
- flex and alignment properties
- omitted values that intentionally defer sizing to browser layout

The renderer should not treat `computed_layout` as the normal source of layout input.

`computed_layout` is the last measured layout snapshot. It may be used for inspection, overlays, and MCP queries, but it does not replace browser layout computation during render.

A fresh `computed_layout` is not required for first render.

## 9.6 Positioning consumption

The renderer should consume position properties from `render_style` when present, including:

- `position`
- `left`
- `top`
- `right`
- `bottom`
- `transform`
- `translate`
- `rotate`
- `transformOrigin`

For scenes, top-level placement comes from the backing frame node, not from the scene record.

## 10. Frame Rendering

`frame` nodes render as HTML container elements.

A frame may:

- contain children
- participate in flex layout
- act as an absolute-positioned box
- provide background paint
- provide clipping
- provide box-level effects

The renderer should apply `render_style` to the frame as directly as possible.

### Common frame behaviors

Common frame style keys include:

- `display`
- `position`
- `left`
- `top`
- `right`
- `width`
- `height`
- `overflow`
- `gap`
- `flexDirection`
- `justifyContent`
- `alignItems`
- `paddingTop`
- `paddingRight`
- `paddingBottom`
- `paddingLeft`
- `paddingBlock`
- `paddingInline`
- `backgroundColor`
- `backgroundImage`
- `backgroundPosition`
- `backgroundRepeat`
- `backgroundSize`
- `borderRadius`
- `boxShadow`
- `backdropFilter`
- `filter`
- `opacity`
- `outline`
- `outlineOffset`
- `flexShrink`

## 11. Rectangle Rendering

`rectangle` nodes render as leaf HTML box elements.

A rectangle has no children.

It may render:

- solid fills
- image fills
- gradients
- border radius
- box shadows
- opacity
- filters
- outlines

The renderer should apply the same basic box-style consumption rules as for frames, except rectangles are always leaves.

## 12. Text Rendering

`text` nodes render as HTML text elements.

The rendered text content comes from:

- `text.content`

`text.content` may be empty.

The renderer must preserve the text payload exactly as stored.

It must not invent placeholder text at render time.

## 12.1 Text style consumption

The renderer should consume text styles from `render_style`, including:

- `color`
- `fontFamily`
- `fontSize`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `whiteSpace`
- `textAlign`
- `textTransform`
- `maxWidth`

## 12.2 Text sizing

Text still renders from `text.content` plus `render_style` under normal browser layout behavior.

Saved `computed_layout` may be used as the most recent measured text box for inspection, but it does not replace browser text flow during render.

## 13. SVG Rendering

`svg` nodes render as real SVG roots.

`svg-visual-element` nodes render as SVG primitives only within an active SVG context.

## 13.1 SVG root consumption

An `svg` node’s typed payload provides:

- definitions
- root attributes
- `view_box`
- `preserve_aspect_ratio`

These map to rendered SVG behavior as follows:

- `view_box` -> `viewBox`
- `preserve_aspect_ratio` -> `preserveAspectRatio`
- `raw_root_attributes` -> forwarded root attributes after sanitization
- `definitions[*].markup` -> parsed `<defs>` content after sanitization

The outer rendered box still uses normal node rendering rules for position and size.

## 13.2 SVG primitive consumption

A `svg-visual-element` node provides:

- `element_name`
- `order`
- `attributes`

These should render as actual SVG child elements when the parent render context is an SVG root.

## 13.3 SVG child ordering

Within an SVG root, primitive render order is:

1. ascending `svg_primitive.order`
2. original child order as tiebreaker

Outside SVG context, a `svg-visual-element` should not render as a normal HTML node.

## 13.4 Detached primitive fallback

Normalized input should not contain detached `svg-visual-element` nodes.

If unexpected non-normalized input still presents a detached primitive, the renderer should render a bounded fallback placeholder or skip that node rather than crash.

The fallback should be visibly present but clearly degraded.

It should not pretend to be a fully valid primitive render.

## 13.5 SVG sanitization

SVG definition and attribute forwarding must be sanitized.

The renderer must block obviously unsafe markup, including:

- event-handler attributes
- `script`
- `foreignObject`
- `javascript:` links

The goal is to support safe document rendering, not arbitrary embedded behavior.

## 14. Asset Resolution

Assets are resolved from the document’s `assets` map.

In the desktop runtime, that document-level asset metadata is hydrated from the project-local asset catalog, and the renderer consumes only resolved browser-usable sources supplied by the runtime.

In v1, nodes reference assets through concrete document fields.

The only documented node-level asset reference is:

1. `render_style.backgroundImage` containing `url(asset://<assetId>)`

## 14.1 Asset-backed background images

If `render_style.backgroundImage` contains:

- `url(asset://<assetId>)`

and that asset exists, the renderer should resolve that into a usable browser render source.

Depending on asset source kind, that means:

- embedded data directly for legacy compatibility
- or local asset-store content resolved to a loadable URL/data source in the desktop runtime

## 14.2 Asset source kinds

The canonical asset source kinds are:

- embedded:
  - `data_uri`
  - `base64`
- local asset store:
  - `asset_store`

The renderer should not care how the asset store is implemented internally.

It only needs a renderable resolved source, and it should not derive raw OS file paths itself.

## 14.3 Missing assets

If a node references a missing asset after normalization, the renderer should render without that asset-backed content.

Typical behavior:

- clear the asset-backed `backgroundImage`
- preserve other non-broken style properties

The renderer must not crash because an asset is missing.

## 14.4 Non-asset background images

If `backgroundImage` contains a literal non-asset value such as:

- gradient syntax
- a direct URL allowed by product policy

the renderer should render that value directly if it is supported by the product.

## 15. Layout Behavior

Because the render canon is browser-css, the renderer should preserve browser-like layout behavior for:

- flex containers
- absolute positioning
- nested layout
- gap and padding
- transforms
- clipping
- text flow
- SVG embedding

The renderer should not reinterpret layout using a second custom layout engine if browser layout is already the product canon.

## 15.1 Saved resolved state

The persisted document is expected to include the last saved `computed_layout` snapshot for affected nodes.

The renderer should still render from `render_style` and browser layout rather than inventing an alternative interpretation of layout intent.

The saved snapshot is useful for:

- inspection
- overlays
- MCP queries

## 16. Ordering and Paint Rules

## 16.1 Top-level ordering

`root.child_ids` is authoritative for top-level paint order.

Later entries render above earlier ones.

## 16.2 Child ordering

For normal HTML-backed nodes, `child_ids` order is the paint order.

Later children render above earlier children when browser stacking behavior does not override that.

## 16.3 Scene-local ordering

Within a scene, the backing frame’s subtree order is authoritative.

Scene record ordering affects only top-level scene placement and scene-level stacking relative to other top-level content.

## 17. Fallback Behavior

The renderer should degrade gracefully.

If normalized input is still imperfect or partially unsupported, the renderer should show as much valid visible content as possible.

## 17.1 Acceptable fallback cases

Fallback behavior is acceptable for:

- unexpected detached SVG primitives from non-normalized input
- malformed SVG payloads that survive normalization
- unsupported style properties
- missing assets
- partially incomplete typed payloads

## 17.2 Fallback rule

Fallback should be:

- bounded
- visible
- non-crashing
- obviously degraded rather than silently pretending to be correct

## 17.3 What the renderer must not do

The renderer must not:

- mutate the persisted document during render
- repair schema state ad hoc during render
- invent new structure that normalization did not create
- silently reparent content during render

Repair belongs to normalization.

Render belongs to rendering.

## 18. Interaction With Normalization and Computed-Layout Refresh

The renderer assumes normalization has already done the following:

- required containers exist
- broken references have been dropped
- scene/frame coupling is valid
- scene membership is consistent
- semantic slots have been resolved
- render-facing semantic properties have been materialized into `render_style`

The renderer may receive a document whose persisted `computed_layout` is stale or missing.

That is acceptable outside explicit commit-on-command preparation.

The renderer should still render from normalized structure plus `render_style`.

The renderer should not redo those responsibilities.

## 19. Minimal Render Expectations by Kind

### `frame`

- renders as HTML box/container
- may have children
- consumes `render_style`
- may clip descendants

### `rectangle`

- renders as HTML leaf box
- no children
- consumes `render_style`

### `text`

- renders as text element
- uses `text.content`
- consumes text-related `render_style`

### `svg`

- renders as SVG root
- may contain SVG primitives
- consumes typed SVG payload plus box-level render style

### `svg-visual-element`

- renders only as an SVG primitive under an SVG root
- normalized docs should not contain detached instances; unexpected non-normalized input may fall back visibly

## 20. Non-Goals of This Document

This document does not define:

- persisted schema shape in full
- normalization repair policy in detail
- command semantics
- selection, hover, or editor chrome behavior
- hit-testing implementation
- resize handles or editor affordances
- automatic persistence behavior
- export formats other than the live desktop renderer behavior
