# Testing and Release

This document defines the validation strategy and release bar for AI Canvas Desktop.

It answers:

- what must be tested
- which layers own which kinds of tests
- how fixture-based validation works
- what release gates must pass before shipping
- what manual verification is still required
- what failures block release vs generate warnings

This document is normative for:

- local development validation
- CI validation
- pre-release checks
- launch readiness decisions for the desktop app

It does **not** define the document schema, command semantics, or rendering behavior themselves.  
Those live in the corresponding product and architecture docs.

## 1. Authority

For validation and release behavior, the order of authority is:

1. this document
2. the machine-readable test suites and CI configuration in the repository
3. `docs/product-stance.md`
4. `docs/document-schema.md`
5. `docs/document-normalization.md`
6. `docs/rendering-behavior.md`
7. `docs/command-semantics.md`
8. `docs/desktop-architecture.md`
9. `docs/local-mcp.md`

If these disagree, update the docs and the machine-readable implementation in the same change.

## 2. Goals

The validation and release strategy must:

- protect the canonical document contract
- catch renderer regressions before release
- prove UI and MCP use the same command/query/document core
- verify autosave and recovery behavior
- verify import/export correctness for the project snapshot format
- keep Electron process-boundary behavior safe and predictable
- keep releases practical for a small local-first desktop product

The strategy must not require:

- server-side infrastructure
- cloud-only validation
- a remote control plane
- heavyweight release machinery that slows product iteration without improving confidence

## 3. Core Release Principle

AI Canvas Desktop is ready to release only when the same project can be:

1. created locally
2. edited through the UI
3. edited through the local MCP bridge
4. autosaved and re-opened safely
5. exported as a project snapshot
6. imported again as a new project
7. rendered with stable visible behavior
8. recovered safely after crash-like interruption

A release is not considered healthy if only one mutation path works.

The UI path, MCP path, import path, and reopen path must all converge on the same canonical document behavior.

## 4. Testing Layers

Validation is organized into the following layers:

1. schema and normalization tests
2. command semantics tests
3. semantic resolution and design-system tests
4. renderer and measurement tests
5. persistence and recovery tests
6. IPC and Electron boundary tests
7. MCP parity tests
8. import/export snapshot tests
9. end-to-end user workflow tests
10. manual release verification

Each layer exists for a different class of regression.

## 5. Required Test Categories

## 5.1 Schema and normalization tests

These tests validate:

- canonical required container creation
- structural repair behavior
- broken-reference cleanup
- scene/frame coupling repair
- scene membership recomputation
- semantic repair
- semantic resolution
- render-input materialization
- serializer canonicalization

These tests should operate on raw document inputs and normalized document outputs.

They should prefer fixture-driven input/output assertions.

### Required coverage

At minimum, normalization tests must cover:

- empty document normalization
- missing authoring containers
- missing `scene_metadata.tags`
- stale `scene.child_count`
- broken `root.child_ids`
- missing parent repair to loose top-level node
- cycle repair
- invalid child container repair
- missing `backgroundImage` asset references
- broken variable bindings
- broken style bindings
- broken variable binding repair without command-specific intent
- broken style binding repair without command-specific intent
- invalid local semantic slot values
- invalid variable binding slots for the node kind
- invalid style family bindings for the node kind
- svg and svg-visual-element semantic authored state dropped in v1
- alias loop repair
- scene record without valid backing frame
- orphaned frame surviving as loose top-level content
- missing or stale `computed_layout` handling

## 5.2 Command semantics tests

These tests validate command application against normalized documents.

They must verify:

- ordered batch application
- batch atomicity
- deterministic repair behavior
- whole-batch rejection on unrecoverable failures
- correct derived-state recomputation
- semantic precedence preservation
- correct scene and node identity behavior

These tests should be mostly pure `document-core` tests.

### Required coverage

At minimum, command tests must cover:

- `create_scene`
- `update_scene`
- `delete_scene`
- `update_scene_metadata`
- `create_node`
- `update_node`
- `reparent_node`
- `reorder_children`
- `delete_node`
- `update_text_content`
- semantic local value set/clear
- variable bind/clear
- style bind/clear
- create/update/delete variable
- create/update/delete style
- create/update/delete asset
- create/update/delete variable collection if supported in v1
- update SVG root and primitive payloads
- `update_node` does not subsume text or SVG payload mutation
- create-node defaults for omitted `is_visible`, `is_locked`, `render_style`, and `child_ids`
- create-scene backing-frame defaults for visibility, locking, empty children, empty authoring containers, and `child_count: 0`
- create-scene requires explicit `left`, `top`, `width`, and `height`
- clear variable binding snapshots value during command application
- clear style binding snapshots family values during command application
- delete variable performs command-owned detach-and-preserve behavior
- delete style performs command-owned detach-and-preserve behavior
- delete variable collection applies the same command-owned detach behavior for contained variables
- valid paint-family binding on `frame`
- valid paint-family binding on `rectangle`
- valid text-family binding on `text`

### Required negative-path coverage

At minimum, command rejection tests must cover:

- duplicate id creation
- invalid reparent into self
- invalid reparent into descendant
- invalid reparent into missing parent
- delete scene through `delete_node`
- invalid node-kind payload combinations
- create-scene missing required geometry
- create-scene duplicate geometry via convenience fields plus `render_style`
- invalid semantic slot for the target node kind
- invalid style family for the target node kind
- invalid semantic render-style patch for the target node kind
- invalid reorder payloads
- unrecoverable cycle introduction
- unrecoverable scene/frame identity violation

## 5.3 Semantic resolution and design-system tests

These tests validate:

- semantic slot precedence
- style family resolution
- variable resolution by mode
- fallback to collection default mode
- alias chain resolution
- typography variable flattening
- detach-to-local behavior
- preservation of stronger overrides during style updates

For explicit clear/delete commands, the preserve-visible-appearance behavior under test is command behavior, not normalization ownership.

### Required coverage

At minimum, semantic tests must prove:

- local value overrides variable and style
- direct node variable binding overrides style-derived value
- clearing variable binding snapshots effective value locally
- clearing style binding snapshots family values locally where needed
- deleting a variable preserves visible appearance where deterministically possible
- deleting a style preserves visible appearance where deterministically possible
- `frame` accepts only layout and paint-family semantic slots in v1
- `rectangle` accepts only paint-family semantic slots in v1
- `text` accepts only text and typography semantic slots in v1
- `svg` and `svg-visual-element` do not participate in node semantic slots or style bindings in v1
- raw `render_style` patch on a semantic property behaves like local semantic edit
- raw `render_style` patch on a non-semantic property remains raw render input only

## 5.4 Renderer and measurement tests

These tests validate renderer consumption of normalized documents.

They must verify:

- top-level ordering
- scene rendering
- node rendering by kind
- style application
- asset-backed background resolution
- text rendering
- SVG behavior
- fallback behavior for degraded cases
- post-render layout measurement and `computed_layout` refresh

These tests may include DOM-level tests, screenshot tests, and measurement assertions.

### Required coverage

At minimum, renderer tests must cover:

- scene-backed frame rendering
- loose top-level node rendering
- text layout and styling
- frame flex layout
- percentage-based layout
- omitted width/height layout
- clipping via `overflow`
- transform application
- border radius and paint styles
- asset-backed `backgroundImage`
- missing asset degradation
- SVG root rendering
- detached SVG primitive fallback
- top-level paint order
- child order
- SVG primitive order plus child-order tiebreak

### Measurement coverage

At minimum, measurement tests must prove:

- layout-affecting command updates refresh `computed_layout`
- v1 computed-layout refresh may conservatively measure the whole containing scene rather than the exact minimal affected set
- descendants affected by flex reflow refresh `computed_layout`
- ancestors affected by child layout refresh `computed_layout` where required
- relative or flexible `render_style` inputs are preserved as inputs
- `computed_layout` stores resolved geometry without collapsing authored inputs into pixel style declarations

## 5.5 Persistence and recovery tests

These tests validate the local-first persistence model.

They must verify:

- project creation
- project reopen
- autosave durability
- checkpoint creation if implemented
- crash-recovery artifact detection
- recovery flow correctness
- migration behavior

### Required coverage

At minimum, persistence tests must cover:

- save and reopen of a valid project
- autosaved document survives app restart
- dirty close with no autosave in flight starts a final autosave before teardown
- dirty close with autosave already in flight waits for that save to resolve before teardown
- successful close-triggered final save allows close-to-tray
- failed close-triggered final save keeps the window open and leaves the last durable state unchanged
- timed-out close-triggered final save keeps the window open and surfaces the same failure path
- discard-and-close after final save failure drops unsaved in-memory state and reopens from the last durable state
- recovery offered when recovery artifact is newer than durable state
- recovery decline leaves last durable state intact
- recovery accept restores newer recoverable state
- structured data remains in SQLite
- binary assets remain disk-backed
- broken asset files degrade safely rather than crashing project load

## 5.6 IPC and Electron boundary tests

These tests validate:

- preload API shape
- payload validation
- context isolation assumptions
- renderer inability to access privileged APIs directly
- correct error-envelope behavior across process boundaries

### Required coverage

At minimum, IPC tests must cover:

- valid preload method calls
- invalid payload rejection
- unknown IPC method rejection
- renderer command dispatch through typed application API
- failure propagation for invalid command batches
- import/export IPC calls
- MCP enable/disable and status calls
- app behavior when no active project is open

## 5.7 MCP parity tests

These tests validate that MCP uses the same core document behavior as the UI.

They must prove:

- MCP inspection reads the same live project session the UI sees
- MCP mutation routes through the same command path
- MCP mutations trigger the same normalization and materialization behavior
- project targeting rules behave predictably
- localhost binding rules are enforced

### Required coverage

At minimum, MCP tests must cover:

- list projects
- inspect active project
- inspect scenes
- inspect design system
- apply commands through MCP
- update project state through MCP and verify UI-visible result
- disable MCP and verify listener is unavailable
- verify MCP binds only to localhost
- verify MCP remains available when editor window is closed but app remains resident in tray
- verify MCP remains `read_write` while a close-triggered final save is still blocking window close
- verify MCP becomes `read_only` only after the window actually closes
- verify MCP shuts down on explicit app quit

## 5.8 Snapshot import/export tests

These tests validate the project snapshot format.

They must verify:

- canonical export structure
- checksum generation
- checksum validation
- asset bundle correctness
- import repair behavior
- partial recovery behavior

### Required coverage

At minimum, snapshot tests must cover:

- minimal valid snapshot
- snapshot with one document
- reject multi-document snapshot as unsupported in v1
- reject bundle shape that attempts to encode multiple projects
- export excludes SQLite internals
- export excludes undo/redo state
- export de-duplicates identical asset bytes
- import of snapshot with missing previews
- import of snapshot with missing optional metadata
- import with corrupt or missing asset file
- import with checksum mismatch
- import of damaged but partially recoverable snapshot
- import creates a new local project rather than mutating the source project in place
- import remaps all snapshot ids to fresh local ids, including when the same snapshot is imported multiple times

## 5.9 End-to-end workflow tests

These tests validate product-level user workflows.

They should run against the actual desktop runtime as much as practical.

### Required v1 workflows

At minimum, end-to-end coverage must include:

1. create project
2. create scene
3. create nodes
4. edit text
5. apply semantic local value
6. create and bind variable
7. create and bind style
8. autosave
9. close and reopen project
10. export snapshot
11. import snapshot as new project
12. verify imported project renders equivalently
13. enable MCP
14. mutate active project through MCP
15. verify UI reflects MCP mutation
16. close window to tray
17. verify MCP still works
18. explicitly quit app
19. verify MCP stops

These do not all need to be covered by one giant scenario, but the release bar must prove all of them.

## 6. Fixture Strategy

Fixture-based validation is a first-class part of the project.

Fixtures should be used for:

- normalization inputs and outputs
- command input and expected document outputs
- renderer snapshots
- measurement expectations
- import/export bundles
- recovery scenarios

## 6.1 Fixture principles

Fixtures should be:

- small when testing a narrow behavior
- human-inspectable
- canonical
- intentionally named by scenario
- stable enough to catch regressions
- easy to update only when a deliberate product change occurs

## 6.2 Fixture categories

Recommended fixture directories:

```text
fixtures/
  normalization/
  commands/
  rendering/
  measurement/
  snapshots/
  recovery/
  mcp/
````

## 6.3 Golden output policy

Golden fixtures are acceptable for:

* normalized document output
* command result document output
* exported snapshot manifest structure
* selected render screenshots

Golden fixtures must not become an excuse to bless accidental behavior.

When a golden changes, the change must be reviewed as a product-contract change, not just a test update.

## 7. Release Gate Levels

Release gates are organized by severity.

## 7.1 Must-pass gates

These block release.

A release must not ship if any of the following fail:

* schema validation suite
* normalization suite
* command semantics suite
* semantic resolution suite
* snapshot import/export suite
* core IPC validation suite
* MCP parity suite
* required end-to-end workflows
* packaging/build success for the target release platform
* manual smoke test checklist for the release candidate

## 7.2 Warning-level gates

These do not automatically block release, but must be reviewed explicitly:

* missing optional preview files during snapshot tests
* non-critical visual diffs in degraded fallback rendering
* performance regressions below hard failure threshold but above target budget
* flaky test quarantines that have an approved temporary exception

A warning-level issue may ship only if the release decision explicitly accepts it.

## 7.3 Automatic hard-stop conditions

The following always block release:

* data-loss bug in normal edit flow
* corrupted project reopen after normal autosave
* UI and MCP producing divergent project state from equivalent operations
* project snapshot export that cannot be re-imported by the same release
* Electron security posture regression such as context isolation disabled or renderer Node integration enabled
* crash on opening a valid project fixture
* crash on importing a minimally valid snapshot
* command atomicity violation
* any test proving `render_style` input collapse into computed pixel values where the authored input should survive

## 8. CI Expectations

CI should validate the product at multiple speeds.

## 8.1 Fast validation on every change

Fast CI should include:

* typecheck
* lint
* schema and normalization tests
* command semantics tests
* semantic resolution tests
* core IPC contract tests

## 8.2 Heavier validation on protected branches or release candidates

Heavier CI should include:

* renderer tests
* screenshot or visual regression tests
* snapshot import/export tests
* MCP parity tests
* packaging smoke build
* end-to-end desktop workflow tests

## 8.3 Release-candidate CI

A release candidate should run the full suite required by the target platform, including:

* packaged app build
* install or launch smoke test
* end-to-end workflow run
* snapshot export/import run
* tray-close and explicit-quit behavior validation
* MCP localhost validation

## 9. Manual Verification

Automation is necessary but not sufficient for a desktop product.

Every release candidate should pass a manual smoke test.

## 9.1 Manual smoke checklist

At minimum, manual release verification should cover:

* launch app successfully
* create a project
* open a project
* create a scene
* create and edit a text node
* apply a style and a variable
* verify visible rendering is reasonable
* verify autosave indicator behavior if present
* close and reopen the project
* edit a project, close the window, and verify close waits for final save before tray transition
* export a snapshot
* import the snapshot as a new project
* close the editor window and verify tray-resident behavior
* verify MCP status UI
* apply one safe read call and one mutation through MCP
* explicitly quit app and verify MCP stops
* relaunch app and confirm project library remains intact

## 9.2 Manual degraded-state checks

At minimum, at least one release candidate should be checked manually against:

* missing asset behavior
* damaged snapshot partial recovery behavior
* detached SVG primitive fallback behavior
* recovery prompt behavior after simulated interruption

## 10. Performance and Stability Bar

AI Canvas Desktop does not need hyperscale backend-style SLOs, but it does need a practical release bar.

## 10.1 Minimum stability bar

The app is not releasable if:

* it crashes in normal project create/open/edit flow
* it hangs indefinitely during normal autosave or during close-triggered final save
* it cannot reopen a project saved by the same version
* MCP commonly wedges the active project session
* snapshot import/export commonly fails on valid fixtures

## 10.2 Performance targets

Performance should be judged against representative project fixtures.

Recommended tracked metrics include:

* cold app launch time
* project open time
* command batch apply time for common edits
* post-edit save time
* snapshot export time
* snapshot import time
* renderer frame stability during common edits

These metrics are release signals, not yet hard compatibility promises.

If the project later adopts hard budgets, those budgets should be added here.

## 11. Migration Validation

When schema or persistence migrations exist, release validation must include migration tests.

These must verify:

* older valid persisted projects can be opened
* migrated documents normalize into canonical current form
* export after migration produces valid current-format snapshots
* migration failure does not silently destroy user data

If no migration path is yet supported, the current release must say so explicitly.

## 12. Test Environment Rules

Validation should prefer deterministic local execution.

Recommended rules:

* tests should not require network access for core product validation
* fixture assets should be local and versioned where appropriate
* MCP tests should bind to ephemeral localhost ports during automation
* snapshot tests should use temporary directories
* Electron tests should avoid depending on developer-specific absolute paths
* renderer screenshot baselines should run in a controlled environment to reduce noise

## 13. Failure Triage Rules

When a release gate fails, the team should classify the failure as one of:

* spec bug
* implementation bug
* test bug
* fixture bug
* accepted product change requiring fixture and doc update

The correct response is:

* if the spec is wrong, update spec and implementation together
* if the implementation is wrong, fix code without weakening the gate
* if the fixture is outdated because the product changed intentionally, update fixture and docs in the same change
* if the test is flaky or invalid, fix the test rather than deleting coverage

## 14. Launch Bar

The desktop release is ready when all of the following are true:

* schema, normalization, command, and semantic tests pass
* renderer behavior is validated for required node kinds and layout cases
* autosave and reopen work reliably
* recovery behavior works for supported failure cases
* snapshot export/import work for the supported format
* MCP reads and mutates the same live project session as the UI
* MCP remains available after the window closes and stops on explicit quit
* target-platform packaging succeeds
* manual smoke verification passes on the release candidate

## 15. Non-Goals of This Document

This document does not define:

* the exact schema of command payloads
* the internal structure of every test file
* a cloud release system
* analytics-driven rollout strategy
* auto-update infrastructure
* team process such as code review ownership or sprint planning
