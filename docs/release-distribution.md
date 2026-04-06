# Release Distribution

Status: Implementation spec for desktop build, packaging, release, distribution, and auto-update.

This document defines the target v1 distribution model for AI Canvas Desktop.

It is a build and release spec, not a claim that the full system already exists in the repository today.

Related docs:

- `docs/product-stance.md` for tray-resident lifecycle, close-to-tray behavior, and runtime guarantees
- `docs/desktop-architecture.md` for Electron main/preload/renderer ownership boundaries
- `docs/testing-and-release.md` for release validation and manual verification policy

This spec assumes a pnpm monorepo with `apps/desktop`, `electron-vite` already in use for desktop production builds, and a main/preload/renderer split. If the repository evolves, implementation details may adapt as long as the distribution and lifecycle invariants in this document remain unchanged.

## 1. Authority

For AI Canvas Desktop build, packaging, publishing, promotion, and auto-update behavior, the authoritative documents are:

1. this document for release, feed, promotion, signing, and updater rules
2. `docs/product-stance.md` for runtime lifecycle semantics such as dirty-state, final-save, close-to-tray, and recovery behavior
3. `docs/testing-and-release.md` for the release-validation and manual-verification bar
4. `docs/desktop-architecture.md` for the recommended application API and package-boundary shape

`README.md` and `docs/README.md` are indexes only. They are not behavior contracts.

If these disagree, update the docs and implementation in the same change.

## 2. Goal

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

## 3. Fixed decisions

These decisions are part of the v1 spec.

### 3.1 Packaging and updater stack

- Use `electron-vite` for desktop app build output.
- Use `electron-builder` for packaging and updater metadata generation.
- Use `electron-updater` for in-app updates.
- Package from built output only, never from raw source trees.
- Keep the current fast pnpm dev workflow unchanged.

### 3.2 Platform scope

- v1 polished distribution targets are macOS first and Windows second.
- v1 auto-update targets are macOS and Windows.
- Linux may gain packaging later, but it is not a polished v1 distribution target.

### 3.3 Release channels and fresh installs

- v1 has exactly two channels: `latest` and `beta`.
- `latest` is stable.
- `beta` is opt-in.
- There is no `alpha` channel in v1.
- All fresh installs default to `latest`.
- Downloading an installer from the marketing site or GitHub Releases does not, by itself, enroll the app in `beta`.
- A distinct installer-time "download beta and stay on beta" path is out of scope for v1.

### 3.4 Hosting model

- Human-facing downloads may live on the marketing site and/or GitHub Releases.
- Machine-facing auto-update feeds live on a generic HTTPS endpoint under our domain.
- The generic HTTPS endpoint is the only machine-readable updater source in v1.
- GitHub Releases are for human downloads only.
- Do not use the private GitHub updater provider in v1.

### 3.5 Promotion model

- "Release now" means promote an existing tested candidate.
- Promotion must not rebuild or re-sign source.
- Promotion is driven by `workflow_dispatch`.
- In v1, promotion reads from GitHub Actions artifacts created by the candidate build workflow.
- Candidate artifacts must set `retention-days: 90` explicitly.
- If a candidate artifact expires, that version is no longer promotable in v1. Cut a new higher version and revalidate it instead of rebuilding the expired version.

### 3.6 Telemetry split

- Electron `crashReporter` handles native/process crash dumps.
- Sentry handles JavaScript exceptions in main, renderer, and preload.
- Product metrics remain a separate opt-in system.
- Sentry Logs and event-loop-block detection are not required for v1 correctness.

## 4. Release identity rules

These rules intentionally constrain later implementation choices.

### 4.1 One version maps to one immutable candidate artifact set

The canonical distributed app version comes from `apps/desktop/package.json`.

V1 hard rule:

- one app version maps to exactly one immutable signed candidate artifact set
- that artifact set is identified by a promotion manifest containing version, commit SHA, file list, and checksums
- rerunning packaging for the same commit and version is acceptable only if it reproduces the exact same checksums
- any materially different rebuild requires a new higher app version

This prevents beta and stable users from running different bits under the same version string.

### 4.2 Channel is a feed concern, not a version-suffix concern

V1 does not use prerelease version suffixes such as `1.2.0-beta` as the primary channel mechanism.

Instead:

- release candidates are built once with the final app version
- beta publishes that tested artifact set to the `beta` feed first when desired
- stable promotion republishes the exact same artifact set to the `latest` feed
- `beta` and `latest` may point at the same version simultaneously
- promotion changes published feed metadata and distribution placement, not the built binary contents

Clients still compare normal semantic versions within their selected feed. Publishing the same version to `latest` after it has already shipped on `beta` does not create a new update for clients already running that version.

### 4.3 Channel switching does not imply downgrade

`electron-updater` automatically enables `allowDowngrade` when the app channel is set programmatically. That is not the desired v1 behavior.

V1 rule:

- switching from `latest` to `beta` may expose newer beta builds
- switching from `beta` back to `latest` does not immediately downgrade the installed app
- after channel changes, updater configuration must restore `allowDowngrade = false`

This avoids surprising reinstall or rollback behavior when a user opts out of beta.

### 4.4 Quit and window close are different operations

The app is tray-resident by contract. Closing the window is not the same as quitting the app.

V1 rule:

- update installation must not piggyback on window close
- downloaded updates are installed only from an explicit restart/install path, or from an explicit full-app quit path that has passed the same safety checks
- updater behavior must respect the runtime contract in `docs/product-stance.md`

### 4.5 Updater configuration is owned by the main-process service

V1 uses explicit main-process updater configuration rather than relying on builder's implicit prerelease-channel behavior or treating baked `app-update.yml` as the full runtime contract.

That means:

- `UpdateService` computes the generic feed URL from the configured base URL, persisted channel, platform, and architecture
- `UpdateService` owns programmatic channel changes and downgrade protection
- if `electron-builder` emits `app-update.yml`, treat it as packaging metadata only, not as the sole runtime authority
- GitHub is not configured as a machine-facing updater provider

## 5. Build and package contract

V1 introduces one canonical production desktop build pipeline.

### 5.1 Canonical entrypoint

The canonical production build entrypoint is:

```bash
pnpm build:desktop
```

That command should:

1. build required workspace packages
2. run the desktop production build through `electron-vite`
3. emit a packageable built-output tree for `electron-builder`

### 5.2 Packaging inputs

- `electron-vite` build output is the packaging input
- `electron-builder` packages from built output only
- source code is excluded from distribution packaging inputs
- workspace packages used at runtime must be represented by actual production build output, not dev-only watch coupling

This follows `electron-vite` production guidance to keep bundled code in one output tree for packaging.

### 5.3 Platform packaging targets

- macOS packages: `dmg` and `zip`
- Windows packages: `nsis`
- Linux packaging may exist later, but Linux updater polish is outside the v1 bar

For macOS, the `zip` artifact is required so updater metadata can be generated correctly even if the human-facing installer is the DMG.

### 5.4 Packaging config

The repository must define a dedicated `electron-builder` configuration adjacent to the desktop app.

That config should:

- package the built `out/` tree
- define app id, product name, artifact naming, and target platforms
- generate updater metadata
- set `electronUpdaterCompatibility: ">= 2.16"` explicitly
- configure only the generic HTTPS publish provider for machine-facing metadata generation
- avoid configuring GitHub as a publish provider for updater metadata

Candidate packaging and promotion must use explicit publish intent:

- `build-candidate.yml` packages with `--publish never`
- `promote-release.yml` performs the actual upload work

## 6. Publish and feed contract

### 6.1 Human downloads vs machine feeds

Human-facing downloads and machine-facing update feeds are separate concerns.

Human-facing distribution may use:

- marketing site download links
- GitHub Releases

Machine-facing updater traffic uses:

- a generic HTTPS update endpoint under our domain

### 6.2 Authoritative machine feed layout

Given a base URL such as:

```text
https://updates.example.com/aicanvas
```

V1 uses this hosted layout:

```text
{base}/{channel}/{platform}/{arch}/latest-mac.yml
{base}/{channel}/{platform}/{arch}/latest.yml
{base}/{channel}/{platform}/{arch}/{version}/{artifact-name}
{base}/{channel}/{platform}/{arch}/{version}/SHA256SUMS
```

V1 platform and architecture tokens are:

- `platform`: `darwin` or `win32`
- `arch`: `universal`, `arm64`, or `x64` as applicable to the packaged target

Rules:

- macOS metadata lives at `{base}/{channel}/darwin/{arch}/latest-mac.yml`
- Windows metadata lives at `{base}/{channel}/win32/{arch}/latest.yml`
- immutable artifacts live under the versioned subdirectory for that same channel, platform, and architecture
- metadata may reference only artifacts inside that channel/platform/arch/version subtree

### 6.3 Authoritative hosted files

The release system must publish all files required by the updater metadata, including:

- `latest-mac.yml` for macOS
- `latest.yml` for Windows
- every installer, ZIP, EXE, `.blockmap`, or other builder-emitted file referenced from that metadata
- `SHA256SUMS` for the versioned artifact directory

The authoritative machine-readable truth is the generic feed plus the promotion manifest that produced it.

### 6.4 Upload order and cache behavior

Publishing must follow this order:

1. upload versioned artifacts and `SHA256SUMS`
2. verify every referenced artifact is reachable at its final URL
3. upload channel metadata (`latest-mac.yml` or `latest.yml`) last

Cache rules:

- versioned artifacts are immutable and may be cached aggressively
- channel metadata is mutable, low-TTL content and must not be treated as immutable

### 6.5 Promotion atomicity rules

Promotion is considered live only when the channel metadata upload succeeds.

That means:

- partial artifact upload must not overwrite existing channel metadata
- a failed promotion may be rerun safely
- reruns for the same candidate and channel must be idempotent
- promotion to `latest` must publish the exact artifact checksums already approved on `beta` when stable release follows beta soak

### 6.6 GitHub Releases policy

GitHub Releases exist for human downloads, release notes, and manual asset retrieval.

V1 rule:

- upload release assets to GitHub manually during promotion
- do not publish updater metadata to GitHub
- do not create a second machine-readable update truth source

## 7. Release workflow design

### 7.1 `ci.yml`

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

### 7.2 `build-candidate.yml`

Trigger:

- push to `main`
- optional manual run for a chosen ref

Responsibilities:

- fail if release bits change without a corresponding intended desktop app version
- build desktop candidates on native target runners
- package with `--publish never`
- generate updater metadata
- produce checksums
- emit a promotion manifest containing version, commit SHA, source ref, platform/arch file list, and checksums
- upload build outputs and the manifest as GitHub Actions artifacts with `retention-days: 90`

Rules:

- candidate artifacts are the only valid promotion input in v1
- a push that would create materially different release bits for an already-issued version is invalid and must not silently overwrite candidate identity

### 7.3 `promote-release.yml`

Trigger:

- `workflow_dispatch`

Inputs:

- workflow run id or candidate artifact reference
- version
- channel: `latest` or `beta`
- release notes text or file
- optional staged rollout percentage, reserved for later rollout support

Responsibilities:

- download previously built candidate artifacts and the promotion manifest
- verify the requested version matches the manifest
- verify checksums before upload
- publish the generic-feed artifacts and `SHA256SUMS`
- publish channel metadata last
- publish or update the matching GitHub Release assets manually
- for `beta`, publish candidate artifacts and beta-channel metadata
- for `latest`, publish the same approved artifacts and stable-channel metadata without rebuild
- never rebuild or re-sign source

Promotion requires an available candidate artifact. If the referenced candidate has expired, that version cannot be promoted in v1.

Staged rollout is not part of the v1 correctness bar. If a rollout input is accepted in v1, it is forward-compatible release plumbing rather than required rollout behavior.

### 7.4 `hotfix-release.yml`

Trigger:

- `workflow_dispatch`

Responsibilities:

- build or promote a new higher version
- publish it to the same channel
- supersede a broken release

If staged rollout is used and a release must be pulled, the fix ships as a higher version. V1 does not attempt in-place rollback of the same version number.

## 8. Updater service design

V1 implements updater behavior as one explicit main-process service under `apps/desktop/src/main`.

The renderer must not own updater logic.

### 8.1 Service responsibilities

`UpdateService` should own:

- explicit `electron-updater` configuration
- generic feed URL construction from base URL, selected channel, platform, and architecture
- channel selection
- check cadence
- event subscriptions
- persisted updater state
- preload-facing typed state exposure
- restart/install safety coordination
- structured support logs

Persisted update channel, updater preferences, and privacy preferences are owned by main-process persistence. The renderer reads current values and requests changes through preload, and never writes those preferences directly.

### 8.2 Updater API usage rules

- use `electron-updater`, not Electron's built-in `autoUpdater`
- use direct main-process configuration rather than implicit prerelease-version channel detection
- do not use the private GitHub update mode
- do not rely on deprecated or implicit feed configuration paths
- keep `allowDowngrade` disabled after any programmatic channel change

### 8.3 State machine

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

When relevant, state exposure should also include:

- selected channel
- last checked time
- available or downloaded version
- install-blocked reason

### 8.4 Event handling

The service should subscribe to the standard updater events:

- `checking-for-update`
- `update-available`
- `update-not-available`
- `download-progress`
- `update-downloaded`
- `error`

### 8.5 Check timing

V1 should not check for updates on raw process boot.

Instead:

1. app startup completes
2. project or recovery boot stabilizes
3. the first update check runs
4. later checks run on a reasonable cadence or explicit user action

This prevents updater work from preempting runtime recovery and measurement-surface-sensitive startup behavior.

### 8.6 Download and install behavior

- background download is allowed
- install must be explicit
- UI must offer restart-to-install when ready
- UI must allow later
- install on explicit full quit is acceptable only if it goes through the same safety gate
- window close alone must never install an update

### 8.7 Required updater configuration

V1 must explicitly disable automatic install-on-quit behavior.

Required settings:

- `autoInstallOnAppQuit = false`
- `allowDowngrade = false` after any programmatic channel change

### 8.8 Restart/install lifecycle

Updater-triggered install must reuse the existing runtime lifecycle rather than creating a parallel close system.

V1 rule:

- `restartToInstallUpdate()` enters the same `close_requested` and final-save flow defined in `docs/product-stance.md`
- if the runtime reaches `close_blocked_final_save_error`, install remains blocked until the user retries save or explicitly discards
- `install_blocked` is an updater reflection of that blocked close state, not a second lifecycle
- `quitAndInstall()` is called only after the app reaches the equivalent of a durably clean, safe-to-exit state

Before `quitAndInstall()` or any equivalent install path runs, the main process must also confirm that:

- autosave checkpoint is flushed
- recovery artifact exists or has been refreshed
- no command batch is mid-commit
- no import/export write is mid-flight
- no destructive migration step is half-complete

If the gate fails, updater state becomes `install_blocked` and the app surfaces the reason instead of silently forcing restart.

### 8.9 Quit sequence caveat

`electron-updater` documents that `quitAndInstall()` closes windows first and emits `before-quit` later than a normal quit sequence.

The app must therefore treat update-triggered restart as a dedicated lifecycle path and not assume that ordinary close or quit hooks run in their usual order.

## 9. Settings and about UI

The renderer should consume typed update and privacy state through preload APIs.

### 9.1 About surface

Expose:

- app version
- selected update channel
- build commit or SHA if available
- `Check for updates`

### 9.2 Updates settings

Expose:

- current channel: Stable or Beta
- current updater state
- last checked time
- available or downloaded version when present
- download action when an update is available
- restart/install action when an update is ready
- install-blocked reason when present

### 9.3 Privacy settings

Expose separate controls for:

- crash report upload
- product metrics opt-in
- exception tracking copy if surfaced

Crash reporting, exception telemetry, and product metrics must not be presented as a single combined checkbox.

## 10. Crash reporting and exception tracking

### 10.1 Electron crash reporter

The main process should:

- start `crashReporter` as early as possible in startup
- optionally override the crash dump path through `app.setPath("crashDumps", ...)`
- control `uploadToServer` from persisted user preferences

Crash dump collection should still work when upload is disabled.

If useful later, the app may also surface uploaded report identifiers as a support aid, but that is not part of the v1 correctness bar.

### 10.2 Sentry

Sentry should be initialized separately in:

- main via `@sentry/electron/main`
- renderer via `@sentry/electron/renderer`
- preload via a preload-safe Sentry init path so preload exceptions are captured in the shipped app

V1 should:

- tag events with app version and selected update channel
- avoid sending project content or large document payloads
- capture main-process exceptions
- capture renderer exceptions
- capture preload exceptions
- capture updater failures
- capture migration failures
- capture import/export failures

Sentry Logs and event-loop-block detection remain out of scope for the v1 correctness bar.

## 11. Product metrics

Product metrics are opt-in and intentionally minimal.

V1 should track only:

- installation lifecycle
- project lifecycle
- import/export outcomes
- update lifecycle
- telemetry-consent changes

Exact event names and payload shapes are implementation details and are not standardized by this v1 spec.

This is operational signal, not a generalized analytics platform.

## 12. Release prerequisites

These are correctness prerequisites, not optional implementation details.

- macOS auto-update requires a signed app
- macOS shipped candidates require notarization
- macOS packaging must include the paired ZIP artifact used for update metadata generation
- Windows shipped candidates require signing when Windows shipping is enabled
- the generic update host must be reachable over HTTPS

## 13. Secrets and environment model

V1 should assume these secret categories exist:

- macOS signing and notarization credentials
- Windows signing credentials if Windows shipping is enabled
- Sentry DSN and auth token if release tagging or sourcemaps are used
- update-hosting credentials
- GitHub token and repo permissions for release publishing

Secrets must not be hard-coded in workflow files.

Release and publish jobs may use protected GitHub Actions environments.

## 14. Acceptance criteria

The release-distribution implementation is done when all of the following are true:

- `pnpm build:desktop` produces deterministic packageable output
- `electron-builder` creates macOS DMG, ZIP, and updater metadata from built output
- macOS shipped candidates are signed, notarized, and pass a signed update smoke test
- `electron-builder` creates Windows installers and updater metadata when Windows shipping is enabled
- Windows shipped candidates are signed when Windows shipping is enabled
- CI produces candidate artifacts plus a promotion manifest and stores them as workflow artifacts with explicit retention
- manual promotion publishes an already-built candidate without recompiling or re-signing source
- one promoted version never maps to multiple different artifact sets
- the generic HTTPS feed is the only machine-readable updater source
- an installed app can check the selected channel and download an update
- fresh installs default to `latest`
- beta enrollment is an in-app persisted preference rather than an installer-side mode
- downloaded updates install only from explicit restart or explicit full-quit behavior
- window close alone does not install the update
- channel switching between `latest` and `beta` works without implicit downgrade behavior
- recovery still works after forced crash and restart
- crash dumps are collected locally even when upload is disabled
- Sentry receives main, renderer, and preload exceptions with release metadata
- settings UI exposes version, selected channel, updater state, and privacy controls

## 15. Non-goals

This phase does not include:

- enterprise licensing
- auth-gated update feeds
- advanced differential rollout infrastructure beyond basic channel support
- Linux polish
- silent background install on window close
- installer-time beta enrollment
- analytics warehouse design
- one-click rollback in app UI
- durable candidate mirroring beyond GitHub Actions artifacts
- replacing GitHub Actions with a custom release backend

This work also must not change the product stance:

- no hidden headless renderer for updates
- no write-capable background replay after the window closes
- no cloud dependency added just to make updates work

## 16. Implementation order

Recommended implementation order:

### Phase 1

- builder config
- canonical production build/package contract
- version and update-channel UI in About and Settings
- candidate build workflow with promotion manifest output

### Phase 2

- generic feed publishing
- promotion workflow
- main-process `UpdateService`
- preload update API
- settings UI for update state
- explicit restart/install flow

### Phase 3

- `crashReporter` setup
- Sentry setup in main, renderer, and preload
- telemetry preference persistence
- support and diagnostics export

### Phase 4

- beta channel switching polish
- hotfix workflow
- longer-lived candidate storage if beta soak requirements outgrow GitHub Actions artifacts
- installer polish and marketing-site download integration

## Appendix A. External references

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
