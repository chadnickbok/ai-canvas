# Release Distribution

Status: Implementation spec for desktop build, packaging, release, distribution, and auto-update.

This document defines the target v1 distribution model for AI Canvas Desktop.

It is a build and release spec, not a claim that the full system already exists in the repository today.

Related docs:

- `docs/product-stance.md` for tray-resident lifecycle, close-to-tray behavior, and runtime guarantees
- `docs/desktop-architecture.md` for Electron main/preload/renderer ownership boundaries
- `docs/testing-and-release.md` for release validation and manual verification policy

This spec assumes a pnpm monorepo with `apps/desktop`, `electron-vite` already in use for desktop production builds, and a main/preload/renderer split. If the repository evolves, implementation details may adapt as long as the distribution and lifecycle invariants in this document remain unchanged.

## 1. Goal

Implement a v1 build, download, install, release, and auto-update system for AI Canvas Desktop that is safe for a local-first, tray-resident Electron app.

The implementation must preserve these product invariants:

- packaged builds are deterministic and reproducible
- human-facing downloads and machine-facing update feeds are distinct concerns
- update installation never risks silent work loss
- update behavior respects tray-resident lifecycle semantics
- crash reporting, exception tracking, and product metrics remain separate systems
- release promotion publishes already-built artifacts rather than rebuilding from source

This distribution model assumes:

- the main process owns lifecycle, updater integration, and privileged orchestration
- preload is narrow and typed
- the renderer is the only browser-backed measurement surface
- recovery and close-to-tray behavior are product constraints

## 2. Fixed decisions

These decisions are part of the v1 spec.

### 2.1 Packaging and updater stack

- Use `electron-vite` for desktop app build output.
- Use `electron-builder` for packaging and publish metadata generation.
- Use `electron-updater` for in-app updates.
- Package from built output only, never from raw source trees.
- Keep the current fast pnpm dev workflow unchanged.

### 2.2 Platform scope

- v1 polished distribution targets are macOS first and Windows second.
- v1 auto-update targets are macOS and Windows.
- Linux may gain packaging later, but it is not a polished v1 distribution target.

### 2.3 Release channels

- v1 has exactly two channels: `latest` and `beta`.
- `latest` is stable.
- `beta` is opt-in.
- There is no `alpha` channel in v1.

### 2.4 Hosting model

- Human-facing downloads may live on the marketing site and/or GitHub Releases.
- Machine-facing auto-update feeds live on a generic HTTPS endpoint under our domain.
- Do not use the private GitHub updater provider in v1.

### 2.5 Promotion model

- “Release now” means promote an existing tested candidate.
- Promotion must not rebuild source.
- Promotion is driven by `workflow_dispatch`.
- In v1, promotion reads from GitHub Actions artifacts created by the candidate build workflow.
- If the referenced candidate artifact has expired, a new candidate must be built and revalidated before promotion.

### 2.6 Telemetry split

- Electron `crashReporter` handles native/process crash dumps.
- Sentry handles JavaScript exceptions in main and renderer.
- Product metrics remain a separate opt-in system.
- Sentry Logs and event-loop-block detection are not required for v1 correctness.

## 3. Long-term impact decisions

These decisions are important enough to make explicit now because they shape the later implementation.

### 3.1 Channel is a feed concern, not a version-suffix concern

V1 does not use prerelease version suffixes such as `1.2.0-beta` as the primary channel mechanism.

Instead:

- release candidates are built once with the final app version
- beta builds use the same canonical app version as the later stable promotion candidate
- the tested artifacts may be published to `beta` first
- the same signed artifacts may later be published to `latest`
- `beta` and `latest` may point at the same version simultaneously
- promotion changes published channel metadata and distribution placement, not the built binary contents

Example:

- candidate `0.4.0` is published to the `beta` feed first
- beta users on older builds update to `0.4.0`
- after validation, the exact same `0.4.0` artifacts are published to `latest`
- beta users already on `0.4.0` do not update again
- stable users on `0.3.2` now update to `0.4.0`

Clients still compare normal semantic versions within their selected feed. Publishing the same version to `latest` after it has already shipped on `beta` does not create a new update for clients already running that version.

Operationally, promotion means publishing the approved stable-channel metadata and artifacts to the `latest` feed location. It does not mean regenerating, resigning, or rebuilding the app binaries.

This intentionally diverges from `electron-builder`'s default prerelease-version channel tutorial. V1 should therefore not depend on automatic channel inference from the app version.

### 3.2 Channel switching does not imply downgrade

`electron-updater` automatically enables `allowDowngrade` when the app channel is set programmatically. That is not the desired v1 behavior.

V1 rule:

- switching from `latest` to `beta` may expose newer beta builds
- switching from `beta` back to `latest` does not immediately downgrade the installed app
- after channel changes, updater configuration must keep downgrade behavior disabled unless a future product decision explicitly introduces downgrade UX

This avoids surprising reinstall or rollback behavior when a user opts out of beta.

### 3.3 Quit and window close are different operations

The app is tray-resident by contract. Closing the window is not the same as quitting the app.

V1 rule:

- update installation must not piggyback on window close
- downloaded updates are installed only from an explicit restart/install path, or from an explicit full-app quit path if that path has passed the same safety checks
- updater behavior must respect the runtime contract in `docs/product-stance.md`

### 3.4 Version source is local to the desktop app

The canonical distributed app version comes from `apps/desktop/package.json`.

Commit SHA and build metadata may be attached for diagnostics, but they do not replace the canonical app version.

## 4. Build and package contract

V1 introduces one canonical production desktop build pipeline.

### 4.1 Canonical entrypoint

The canonical production build entrypoint should be a dedicated root command:

```bash
pnpm build:desktop
```

That command should:

1. build required workspace packages
2. run the desktop production build through `electron-vite`
3. emit a packageable built-output tree for `electron-builder`

The current repo does not yet expose that exact command. This document defines it as the target contract.

### 4.2 Packaging inputs

- `electron-vite` build output is the packaging input
- `electron-builder` packages from built output only
- source code is excluded from distribution packaging inputs
- workspace packages used at runtime must be represented by actual production build output, not dev-only watch coupling

This follows `electron-vite` production guidance to keep bundled code in one output tree for packaging.

### 4.3 Platform packaging targets

- macOS packages: `dmg` and `zip`
- Windows packages: `nsis`
- Linux packaging may exist later, but Linux updater polish is outside the v1 bar

For macOS, the `zip` artifact is required so updater metadata can be generated correctly even if the human-facing installer is the DMG.

### 4.4 Packaging config

The repository must define a dedicated `electron-builder` configuration adjacent to the desktop app.

That config should:

- package the built `out/` tree
- define app id, product name, artifact naming, and target platforms
- generate updater metadata
- set `electronUpdaterCompatibility: ">= 2.16"` explicitly
- define publish providers in the intended order

This matches current `electron-builder` guidance for new projects and pins the updater metadata compatibility baseline instead of relying on implicit defaults.

## 5. Publish and feed model

### 5.1 Human downloads vs machine feeds

Human-facing downloads and machine-facing update feeds are separate concerns.

Human-facing distribution may use:

- marketing site download links
- GitHub Releases

Machine-facing updater traffic should use:

- a generic HTTPS update endpoint under our domain

### 5.2 Provider ordering

`electron-builder` publish providers should be ordered so that:

1. the first provider is the generic HTTPS update feed
2. an optional secondary provider publishes to GitHub Releases

This matters because the first provider becomes the default auto-update source.

### 5.3 Feed layout

The exact URL layout may vary, but v1 must preserve:

- channel separation
- platform separation
- stable URLs per installed client
- a layout that lets `latest` and `beta` go live independently

Conceptual examples:

- `https://updates.example.com/aicanvas/latest/darwin/...`
- `https://updates.example.com/aicanvas/latest/win/...`
- `https://updates.example.com/aicanvas/beta/darwin/...`

The spec does not require this exact path structure. It does require that updater clients have stable per-channel and per-platform metadata endpoints.

Channel metadata is the mechanism that differentiates `beta` from `latest`. The same app version may appear in both feeds at the same time when a tested beta candidate is promoted to stable.

### 5.4 Metadata ownership

The release system must publish:

- platform installers
- required metadata files such as `latest.yml` or `latest-mac.yml`
- checksums

For the generic provider, artifact and metadata upload is an explicit release automation responsibility.

## 6. Release workflow design

### 6.1 `ci.yml`

Trigger:

- pull requests
- pushes to `main`

Responsibilities:

- install dependencies
- typecheck
- run unit and integration tests
- run desktop smoke tests as they are added
- optionally run unsigned packaging smoke checks

This is the merge gate, not the release publisher.

### 6.2 `build-candidate.yml`

Trigger:

- push to `main`
- optional manual run for a chosen ref

Responsibilities:

- build desktop candidates on native target runners
- package platform installers
- generate updater metadata
- produce checksums
- upload build outputs as GitHub Actions artifacts

Candidate artifacts are the only valid promotion input in v1.

### 6.3 `promote-release.yml`

Trigger:

- `workflow_dispatch`

Inputs:

- workflow run id or candidate artifact reference
- version
- channel: `latest` or `beta`
- release notes text or file
- optional staged rollout percentage, reserved for later rollout support

Responsibilities:

- download previously built candidate artifacts
- publish them to the update host
- publish or update the matching GitHub Release
- for `beta`, publish candidate artifacts and beta-channel metadata
- for `latest`, publish the same approved artifacts and stable-channel metadata without rebuild
- never rebuild source

Promotion requires an available candidate artifact. If the referenced candidate has expired, release operators must create and revalidate a new candidate instead of rebuilding during promotion.

Staged rollout is not part of the v1 correctness bar. If a rollout input is accepted in v1, it is forward-compatible release plumbing rather than required rollout behavior.

### 6.4 `hotfix-release.yml`

Trigger:

- `workflow_dispatch`

Responsibilities:

- build or promote a new higher version
- publish it to the same channel
- supersede a broken release

If staged rollout is used and a release must be pulled, the fix ships as a higher version. V1 does not attempt in-place rollback of the same version number.

## 7. Updater service design

V1 implements updater behavior as one explicit main-process service under `apps/desktop/src/main`.

The renderer must not own updater logic.

### 7.1 Service responsibilities

`UpdateService` should own:

- `electron-updater` configuration
- channel selection
- check cadence
- event subscriptions
- persisted updater state
- preload-facing typed state exposure
- restart/install safety coordination
- structured support logs

Persisted update channel, updater preferences, and privacy preferences are owned by main-process persistence. The renderer reads current values and requests changes through preload, and never writes those preferences directly.

### 7.2 Updater API usage rules

- use `electron-updater`, not Electron's built-in `autoUpdater`
- do not use the private GitHub update mode
- do not rely on implicit prerelease-version channel detection for v1
- configure provider and channel behavior explicitly in the main-process updater service
- do not rely on deprecated or implicit feed configuration paths

### 7.3 State machine

The updater state machine lives in main and is reflected to renderer:

- `idle`
- `checking`
- `available`
- `not_available`
- `downloading`
- `downloaded`
- `install_blocked`
- `ready_to_restart`
- `error`

The renderer consumes this state through preload and does not recreate the authoritative state machine in React.

### 7.4 Event handling

The service should subscribe to the standard updater events:

- `checking-for-update`
- `update-available`
- `update-not-available`
- `download-progress`
- `update-downloaded`
- `error`

### 7.5 Check timing

V1 should not check for updates on raw process boot.

Instead:

1. app startup completes
2. project or recovery boot stabilizes
3. the first update check runs
4. later checks run on a reasonable cadence or explicit user action

This prevents updater work from preempting runtime recovery and measurement-surface-sensitive startup behavior.

### 7.6 Download and install behavior

- background download is allowed
- install must be explicit
- UI must offer restart-to-install when ready
- UI must allow later
- install on explicit full quit is acceptable only if it goes through the same safety gate
- window close alone must never install an update

### 7.7 Required updater configuration

V1 must explicitly disable automatic install-on-quit behavior.

`electron-updater` defaults `autoInstallOnAppQuit` to `true`, but this app requires update installation to pass through an explicit, main-process safety gate. Even when installation on full app quit is allowed, it must happen through that app-controlled lifecycle path rather than the updater's automatic default.

### 7.8 Safe restart gate

Before `quitAndInstall()` or any equivalent install path runs, the main process must confirm that:

- autosave checkpoint is flushed
- recovery artifact exists or has been refreshed
- no command batch is mid-commit
- no import/export write is mid-flight
- no destructive migration step is half-complete

If the gate fails, updater state becomes `install_blocked` and the app surfaces the reason instead of silently forcing restart.

### 7.9 Quit sequence caveat

`electron-updater` documents that `quitAndInstall()` closes windows first and emits `before-quit` later than a normal quit sequence.

The app must therefore treat update-triggered restart as a dedicated lifecycle path and not assume that ordinary close or quit hooks run in their usual order.

## 8. Settings and about UI

The renderer should consume typed update and privacy state through preload APIs.

### 8.1 About surface

Expose:

- app version
- build channel
- build commit or SHA if available
- `Check for updates`

### 8.2 Updates settings

Expose:

- current channel: Stable or Beta
- current updater state
- last checked time
- download action when an update is available
- restart/install action when an update is ready

### 8.3 Privacy settings

Expose separate controls for:

- crash report upload
- product metrics opt-in
- exception tracking copy if surfaced

Crash reporting, exception telemetry, and product metrics must not be presented as a single combined checkbox.

## 9. Crash reporting and exception tracking

### 9.1 Electron crash reporter

The main process should:

- start `crashReporter` as early as possible in startup
- optionally override the crash dump path through `app.setPath("crashDumps", ...)`
- control `uploadToServer` from persisted user preferences

Crash dump collection should still work when upload is disabled.

If useful later, the app may also surface uploaded report identifiers as a support aid, but that is not part of the v1 correctness bar.

### 9.2 Sentry

Sentry should be initialized separately in:

- main via `@sentry/electron/main`
- renderer via `@sentry/electron/renderer`

V1 should:

- tag events with app version and channel
- avoid sending project content or large document payloads
- capture main-process exceptions
- capture renderer exceptions
- capture updater failures
- capture migration failures
- capture import/export failures

Sentry Logs and event-loop-block detection remain out of scope for the v1 correctness bar.

## 10. Product metrics

Product metrics are opt-in and intentionally minimal.

V1 should track only:

- installation lifecycle
- project lifecycle
- import/export outcomes
- update lifecycle
- telemetry-consent changes

Exact event names and payload shapes are implementation details and are not standardized by this v1 spec.

This is operational signal, not a generalized analytics platform.

## 11. Secrets and environment model

V1 should assume these secret categories exist:

- macOS signing and notarization credentials
- Windows signing credentials if Windows shipping is enabled
- Sentry DSN and auth token if release tagging or sourcemaps are used
- update-hosting credentials
- GitHub token and repo permissions for release publishing

Secrets must not be hard-coded in workflow files.

Release and publish jobs may use protected GitHub Actions environments.

## 12. Acceptance criteria

The release-distribution implementation is done when all of the following are true:

- `pnpm build:desktop` produces deterministic packageable output
- `electron-builder` creates macOS installers and updater metadata
- `electron-builder` creates Windows installers and updater metadata when Windows shipping is enabled
- CI produces candidate artifacts and stores them as workflow artifacts
- manual promotion publishes an already-built candidate without recompiling source
- an installed app can check the configured channel and download an update
- downloaded updates install only from explicit restart or explicit full-quit behavior
- window close alone does not install the update
- recovery still works after forced crash and restart
- crash dumps are collected locally even when upload is disabled
- Sentry receives main and renderer exceptions with release metadata
- settings UI exposes version, channel, updater state, and privacy controls
- channel switching between `latest` and `beta` works without implicit downgrade behavior

## 13. Non-goals

This phase does not include:

- enterprise licensing
- auth-gated update feeds
- advanced differential rollout infrastructure beyond basic channel support
- Linux polish
- silent background install on window close
- analytics warehouse design
- one-click rollback in app UI
- replacing GitHub Actions with a custom release backend

This work also must not change the product stance:

- no hidden headless renderer for updates
- no write-capable background replay after the window closes
- no cloud dependency added just to make updates work

## 14. Implementation order

Recommended implementation order:

### Phase 1

- builder config
- canonical production build/package contract
- version/about UI
- candidate build workflow

### Phase 2

- generic update feed publishing
- main-process `UpdateService`
- preload update API
- settings UI for update state
- explicit restart/install flow

### Phase 3

- `crashReporter` setup
- Sentry setup
- telemetry preference persistence
- support and diagnostics export

### Phase 4

- beta channel switching polish
- hotfix workflow
- staged-rollout hardening after the core v1 release flow is stable
- installer polish and marketing-site download integration

## Appendix A. External References

Non-normative reference material.

These links are included for human traceability and background, not as part of the implementation contract:

- Electron crash reporter API: https://www.electronjs.org/docs/latest/api/crash-reporter
- electron-builder auto update: https://www.electron.build/auto-update.html
- electron-builder publish config: https://www.electron.build/publish.html
- electron-builder release channels: https://www.electron.build/tutorials/release-using-channels.html
- electron-vite production build guidance: https://electron-vite.org/guide/build
- GitHub Actions workflow artifacts: https://docs.github.com/actions/automating-your-workflow-with-github-actions/persisting-workflow-data-using-artifacts
- GitHub Actions manual dispatch: https://docs.github.com/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow
- Sentry Electron docs: https://docs.sentry.io/platforms/javascript/guides/electron/
