# AI Canvas Custom Fonts

Status: Normative contract.

This document defines the document-level custom font model for AI Canvas Desktop.

It answers:

- how custom fonts are represented in the document model
- how font files relate to assets
- how text nodes resolve font families
- how the renderer registers document fonts
- how import/export handles custom fonts
- what mutation semantics apply to fonts

This document is normative for:

- persisted document schema fields related to fonts
- renderer font registration before text render
- command application for font creation, update, and deletion
- normalization and repair of broken font references
- snapshot import/export of document fonts

It does **not** define typography variables or text styles in general. Those live in
`docs/document-schema.md`, `docs/command-semantics.md`, and related docs.

## 1. Authority

For custom-font behavior, the order of authority is:

1. this document
2. the machine-readable font model and font registration logic in `packages/document-core`
3. `docs/document-schema.md`
4. `docs/document-normalization.md`
5. `docs/rendering-behavior.md`

If these disagree, update the docs and implementation in the same change.

## 2. Goals

The custom-font system must:

- let a document carry project-local fonts without depending on OS-installed fonts
- preserve visual fidelity across machines when the same project is opened
- make custom fonts available to text rendering and browser-backed layout measurement
- remain local-first and snapshot-portable
- fail safely when a font file is missing or invalid
- keep binary bytes and font-family semantics clearly separated

The custom-font system must not:

- require network font fetching in normal local workflows
- depend on external CSS imports as the canonical font source
- treat arbitrary asset metadata as the authoritative font model
- require hidden or background renderers beyond the product stance

## 3. Core Model

Custom fonts are a document-level registry named `fonts`.

The raw font bytes are stored through the existing asset system.

The `fonts` registry stores structured font-face records that point at font assets.

### 3.1 Why fonts are not just assets

Assets store opaque bytes and basic metadata.

Fonts require additional meaning:

- family identity
- face descriptors such as weight and style
- renderer registration rules
- text-node dependency tracking
- fallback behavior when a face is missing
- import/export semantics as a design resource

Therefore the canonical font authoring object is a `FontFaceRecord`, not an
`AssetRecord`.

## 4. Persisted Model

The document adds a top-level `fonts` container.

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
  fonts: RendererFonts;
  variables: RendererVariables;
  styles: RendererStyles;
};

type RendererFonts = {
  families: Record<string, RendererFontFamily>;
  faces: Record<string, RendererFontFace>;
};
```

### 4.1 Font family

A font family is the document-level grouping used by `render_style.fontFamily`
and semantic typography slots.

```ts
type RendererFontFamily = {
  id: string;
  name: string;
  generic_fallbacks?: string[];
  notes?: string;
};
```

#### Rules

- `name` is the canonical family name exposed to text styling.
- `generic_fallbacks` may include browser generic families such as:
  - `sans-serif`
  - `serif`
  - `monospace`
  - `system-ui`
- family ids are document-local
- family names should be unique case-insensitively within the document

### 4.2 Font face

A font face represents one concrete usable face within a family.

```ts
type RendererFontFace = {
  id: string;
  family_id: string;
  asset_id: string;

  source_format?: "woff2" | "woff" | "ttf" | "otf";

  weight?: string | number;
  style?: "normal" | "italic" | "oblique";
  stretch?: string;
  unicode_range?: string;

  display?: "auto" | "block" | "swap" | "fallback" | "optional";

  postscript_name?: string;
  full_name?: string;

  status?: "ready" | "invalid_asset" | "invalid_font_data";
};
```

#### Rules

- `family_id` must reference an existing font family
- `asset_id` must reference an existing asset whose bytes are a supported font file
- `status` is derived/cacheable and may be omitted in persisted state if the implementation chooses to recompute it
- a face is uniquely identified by document-local id, not by `family + weight + style` alone
- the same asset bytes may be referenced by multiple face records if needed, though normal tooling should avoid that

## 5. Render-Time Registration

The renderer must register document font faces before rendering text that depends
on them.

The registration flow is:

1. normalize the document
2. resolve valid font families and faces
3. load font bytes from referenced assets
4. create browser `FontFace` objects
5. add them to `document.fonts`
6. await required readiness before layout-sensitive persistence paths

This applies to:

- normal render of open documents
- computed-layout refresh before commit
- browser-backed text measurement

### 5.1 Text usage

Text nodes continue to use existing typography inputs:

- `render_style.fontFamily`
- semantic typography slots such as `node.typography.font_family`

No separate `font_id` field is added to text nodes in v1.

The text layer refers to the family by name.

If a text node references a family name that exists in `fonts.families`, the
renderer should use the registered document-local faces for that family first.

If the family name does not exist in `fonts.families`, the renderer falls back to
ordinary browser font resolution.

### 5.2 Family naming rule

The canonical binding between text and document fonts is the family name, not the
family id.

This keeps browser-css render behavior aligned with how `font-family` already
works.

### 5.3 Missing or invalid faces

If a family exists but some or all faces fail to load:

- the renderer should continue with browser fallback
- the document remains openable and inspectable
- the app may surface degraded-font warnings
- the renderer must not crash

## 6. Supported Asset Source Kinds

In v1, font bytes may come only from local asset-backed content.

Allowed asset source kinds are the same as ordinary assets:

- `data_uri`
- `base64`
- `asset_store`

Normal desktop workflows should prefer `asset_store` for imported font files.

## 7. Mutation Model

Fonts are mutated through dedicated font commands, not through generic asset
metadata edits.

The authoritative editable objects are:

- font families
- font faces

Asset creation may happen as part of font import UX, but the asset record alone
does not make a usable font available to the document.

## 8. Repair and Normalization

Normalization must ensure:

- `fonts` container exists
- broken family references from faces are dropped
- broken asset references from faces are dropped
- duplicate family names are repaired deterministically or rejected if they cannot be repaired safely
- invalid face descriptors are canonicalized or dropped
- text nodes are not rewritten merely because a custom family is missing

Broken font records should be dropped or marked invalid in a deterministic way,
while surviving text content and typography inputs remain intact.

## 9. Snapshot Portability

Snapshot export must include:

- the `fonts` registry in `document.json`
- the referenced font asset bytes in the asset bundle

Import must remap:

- font family ids
- font face ids
- referenced asset ids

while preserving family names and face descriptors.

## 10. Non-Goals

This document does not define:

- cloud font libraries
- remote hosted font fetching as canonical project state
- variable fonts beyond raw file support
- full OpenType feature editing UI
- rich text run-level font overrides
