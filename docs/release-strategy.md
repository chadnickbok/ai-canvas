# Release Strategy

Status: Release operations / strategy.

This document defines the current release strategy and operational release shape for AI Canvas Desktop.

It answers:

- what the active release stream is
- how release versions, tags, and artifacts are produced
- which workflows own packaging, signing, notarization, and publication
- how installed desktop builds discover updates
- what a human operator should verify after a release run

It does **not** define product behavior contracts or the full validation matrix.
Those live in the contract docs and in [testing-and-release.md](testing-and-release.md).

## 1. Current Release Model

The current release model is intentionally simple:

- releases are currently macOS-only
- every push to `main` is treated as a release candidate
- the `Release macOS` workflow publishes the signed release if its gates pass
- published binaries and update metadata live on normal GitHub Releases
- installed desktop builds follow the latest published `main` release while the product is in active development

This is a single active stream, not a multi-channel release system.

There is currently no separate beta, stable, or staged-rollout channel.

## 2. Release Lanes

The repository currently uses three release-related automation lanes:

### 2.1 `CI`

`CI` is the fast Linux validation lane for pull requests.

It currently runs:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

This is the default branch-protection lane, not the packaging lane.

### 2.2 `macOS Packaging Smoke`

`macOS Packaging Smoke` runs on pull requests and on pushes to non-`main` branches.

Its job is to prove that macOS packaging still works without using release secrets. It currently:

- builds unsigned macOS artifacts with `pnpm dist:mac:unsigned`
- disables signing explicitly for that build
- verifies that macOS update metadata is still generated
- uploads the packaging outputs to the workflow run

This lane is for packaging confidence only. It does not publish a GitHub Release.

### 2.3 `Release macOS`

`Release macOS` runs on every push to `main`.

It depends on the Linux quality and test jobs first, then performs the release-specific macOS work:

- computes the main-release version and release tag
- installs the Apple signing certificate into a temporary keychain
- writes the App Store Connect API key used for notarization
- builds signed and notarized macOS artifacts
- verifies code signing, Gatekeeper acceptance, and stapling
- uploads release artifacts to the workflow run
- creates or updates the corresponding GitHub Release

This workflow is the operational source of truth for shipping the current desktop build.

## 3. Versioning and Artifacts

`main` releases do not ship the static package version from `apps/desktop/package.json` as-is.

The `Release macOS` workflow computes a release version in this format:

- `YYYY.MDD.RUN_NUMBER`

Examples:

- `2026.408.17`
- `2026.1205.41`

From that version, the workflow also derives:

- Git tag: `v${version}`
- GitHub Release title: `AI Canvas ${version}`

The workflow injects the computed values into Electron Builder by setting:

- `DESKTOP_RELEASE_VERSION`
- `DESKTOP_BUILD_VERSION`

The builder wrapper script converts those into:

- app `version`
- app `buildVersion`

The shipped macOS release artifacts currently include:

- signed `.dmg` files
- signed `.zip` files
- `latest-mac*.yml` update metadata
- `.blockmap` files used by Electron Updater

Artifact names follow the configured pattern:

- `AI-Canvas-${version}-${arch}.${ext}`

Unsigned local or smoke builds still use the same packaging configuration, but they do not use release signing credentials.

## 4. Build, Signing, and Publication Shape

Electron Builder is configured with:

- GitHub publish metadata pointing at `chadnickbok/ai-canvas`
- macOS DMG and ZIP targets for `arm64` and `x64`
- hardened runtime and notarization enabled
- `forceCodeSigning: true` for normal release builds

The repository intentionally does **not** let Electron Builder publish releases directly from the build step.

The builder wrapper always runs Electron Builder with:

- `--publish never`

That means the release flow is split on purpose:

1. Electron Builder creates the signed binaries and update metadata.
2. The GitHub Actions workflow verifies those outputs.
3. The workflow publishes the artifacts with `gh release create` or `gh release upload`.

This keeps publication under explicit workflow control while still generating the updater metadata Electron expects.

## 5. Runtime Update Behavior

The desktop app currently enables auto-update only for packaged macOS builds.

More specifically:

- unpackaged development builds do not check for updates
- non-macOS builds do not enable the updater path
- the main process starts the updater during app startup after the main window is created
- the updater checks GitHub Releases for the latest published release
- updates are downloaded automatically when available
- the app does not install automatically on quit
- once a download completes, the user is prompted to either restart and install or postpone

This matches the architecture guidance that v1 uses startup-time auto-update against the latest published `main` GitHub release only.

## 6. Operator Playbook

For the current single-stream release model, the release operator flow is:

1. Merge or push the releasable commit to `main`.
2. Let `Release macOS` compute the version and build the signed artifacts.
3. Verify that the workflow produced signed app bundles, DMGs, ZIPs, update metadata, and blockmaps.
4. Verify that code-signing checks, Gatekeeper checks, and stapling validation passed in the workflow.
5. Verify that the GitHub Release exists with the expected tag, title, commit target, and uploaded assets.
6. Run the manual smoke verification bar from [testing-and-release.md](testing-and-release.md) against a recent published `main` build.

The default recovery path for a bad release is currently fix-forward:

- publish a newer `main` release that supersedes the broken one

This document does not define staged rollback, channel switching, or phased rollout behavior because the current system does not implement those capabilities.

## 7. Boundaries With Other Docs

- [testing-and-release.md](testing-and-release.md) owns the validation bar, release gates, and manual verification policy.
- [desktop-architecture.md](desktop-architecture.md) owns architecture guidance such as the v1 simplification around startup-time auto-update.
- [README.md](../README.md) should stay a short summary and entrypoint, not the operational source of truth.

When release mechanics change, update this document together with the relevant workflow or app changes.
