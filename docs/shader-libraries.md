# Shader Libraries

Status: Proposed implementation plan.

This document defines the recommended package split for shader-based effects in AI Canvas.

## Goals

The shader system should satisfy three different consumers:

- AI Canvas itself, which needs a stable rendering runtime for the editor render area
- React application developers, who need an easy default integration path
- AI agents and developers, who need a clear reference spec and an obvious way to inspect raw shader source

The package split should support all three without making the app depend on React-specific abstractions.

## Package split

### `@ai-canvas/shader-core`

`shader-core` is the authoritative runtime package.

Responsibilities:

- WebGL context setup and teardown
- shader compilation and program lifecycle
- fullscreen quad / render target setup
- uniform registration and updates
- animation loop control
- canvas resize and device-pixel-ratio handling
- effect registry and effect metadata
- programmatic access to raw shader source

Non-goals:

- React hooks or components
- app-specific editor UI logic
- marketing/demo-only presentation code

AI Canvas should integrate with `shader-core` directly.

### `@ai-canvas/shader-react`

`shader-react` is a thin convenience adapter over `shader-core`.

Responsibilities:

- React component wrapper for a shader canvas
- React lifecycle integration
- prop-to-uniform updates
- canvas resize observation
- mount/unmount cleanup

Non-goals:

- becoming the primary runtime contract
- owning shader compilation details
- owning the effect registry format

For React consumers, this is the recommended default package.

## Integration rule

AI Canvas must use `@ai-canvas/shader-core`, not `@ai-canvas/shader-react`.

Reasoning:

- the desktop app should not couple its rendering runtime to React helper abstractions
- non-React integrations remain possible
- the core runtime stays usable from MCP-driven tooling, custom previews, and future non-React surfaces

## Effect model

Each effect should be represented by a stable machine-readable definition.

Recommended shape:

- `id`
- `name`
- `description`
- `vertexSource`
- `fragmentSource`
- `uniforms`
- `tags`

The stable unit that AI Canvas persists should be:

- `effect_id`
- uniform values
- optional future asset bindings

AI Canvas should not persist full shader source blobs in document state.

## Standard uniforms

The initial runtime should reserve a small standard set:

- `u_time`
- `u_resolution`

Additional runtime-provided uniforms such as `u_mouse` should be added only when the interaction model is clearly defined.

## Rendering baseline

Initial recommendation:

- target `WebGL1` first for the compatibility baseline
- design the runtime so a future `WebGL2` upgrade is possible without changing the effect registry contract

If the first required effect set needs `WebGL2`, revisit this before implementation begins.

## Raw shader source

The raw shader source must be intentionally discoverable.

Target structure for effect source:

```text
packages/shader-core/src/effects/<effect-id>/
  index.ts
  vertex.glsl
  fragment.glsl
```

The package should also expose a programmatic source lookup API such as `getEffectSource(id)`.

For the initial scaffold, TypeScript string exports are acceptable as a stub. The intended end state is adjacent raw `.glsl` files so humans and agents can inspect source directly.

## MCP and docs guidance

MCP-facing docs and in-app guidance should recommend packages explicitly:

- React project: use `@ai-canvas/shader-react`
- non-React or custom runtime: use `@ai-canvas/shader-core`
- raw shader source: inspect the effect definition and adjacent shader files in `@ai-canvas/shader-core`

This guidance should be stated directly, not implied.

## Preview/reference surface

The visual gallery should be driven from the same effect registry used by the runtime.

Each effect reference should show:

- preview
- effect id and name
- uniform definitions
- example usage for `shader-core`
- example usage for `shader-react`
- raw shader source location

This gives developers a "pretty picture" while still providing a usable implementation spec for coding agents.

## First implementation slice

The first meaningful delivery should include:

- `packages/shader-core` scaffold with a stable public API
- `packages/shader-react` scaffold with a minimal `ShaderCanvas`
- one or two canonical effects in the shared registry
- `getEffectSource(id)` for source inspection
- docs that explain the package split and source lookup path

## Open decisions before production rollout

- confirm `WebGL1` vs `WebGL2`
- switch stubbed TS shader strings to adjacent `.glsl` files
- define effect persistence shape in document state
- decide whether preview images are generated at runtime or checked in
