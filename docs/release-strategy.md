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

- releases ship for macOS and Linux, and the repository is wired to ship Windows when the Azure Artifact Signing configuration is present
- every push to `main` is treated as a release candidate
- the `Release Desktop` workflow publishes the release if its gates pass
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
- a Windows desktop build-and-test lane that runs `pnpm build:packages`, `pnpm build:desktop`, and `pnpm --filter @ai-canvas/desktop test`

This is the default branch-protection lane, not the packaging lane.

### 2.2 `Packaging Smoke`

`Packaging Smoke` runs on pull request updates only.

Its job is to prove that packaging still works without release secrets. It currently:

- builds unsigned macOS artifacts with `pnpm dist:mac:unsigned`
- builds Linux `.deb` and AppImage artifacts for `x64` and `arm64`
- builds unsigned Windows NSIS artifacts for `x64`
- disables signing explicitly for the macOS smoke build
- verifies that macOS, Linux, and Windows update metadata are still generated
- uploads the packaging outputs to the workflow run

This lane is for packaging confidence only. It does not publish a GitHub Release.

### 2.3 `Release Desktop`

`Release Desktop` runs on every push to `main`.

It depends on the Linux quality and test jobs first, then performs the release-specific platform work:

- computes the main-release version and release tag
- builds Linux release artifacts for `x64` and `arm64`
- builds signed Windows NSIS release artifacts for `x64` when the required Azure signing configuration is present
- installs the Apple signing certificate into a temporary keychain
- writes the App Store Connect API key used for notarization
- builds signed and notarized macOS app artifacts
- signs, notarizes, and staples the final DMG artifacts
- verifies code signing, Gatekeeper acceptance, and stapling for both app bundles and DMGs
- verifies that Linux `.deb`, AppImage, Windows NSIS, and updater metadata were produced for the enabled platforms
- uploads all platform artifacts to the workflow run
- creates or updates the corresponding GitHub Release after the macOS and Linux jobs complete

This workflow is the operational source of truth for shipping the current desktop build.

## 3. Versioning and Artifacts

`main` releases do not ship the static package version from `apps/desktop/package.json` as-is.

The `Release Desktop` workflow computes a release version in this format:

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

The shipped release artifacts currently include:

- signed, notarized, and stapled `.dmg` files
- signed `.zip` files containing notarized and stapled `.app` bundles
- Linux `.deb` packages for `x64` and `arm64`
- Linux AppImage bundles for `x64` and `arm64`
- signed Windows NSIS `.exe` installers for `x64` when Azure Artifact Signing is configured
- `latest-mac*.yml` update metadata
- `latest-linux*.yml` update metadata
- `latest.yml` Windows update metadata when Windows signing is configured
- `.blockmap` files used by Electron Updater

Artifact names follow the configured pattern:

- `AI-Canvas-${version}-${arch}.${ext}`

Unsigned local or smoke builds still use the same packaging configuration, but they do not use release signing credentials.

## 4. Build, Signing, and Publication Shape

Electron Builder is configured with:

- GitHub publish metadata pointing at `chadnickbok/ai-canvas`
- macOS DMG and ZIP targets for `arm64` and `x64`
- Linux DEB and AppImage targets for `arm64` and `x64`
- Windows NSIS targets for `x64`
- hardened runtime and notarization enabled for macOS
- `forceCodeSigning: true` for normal macOS release builds
- Azure Artifact Signing support for signed Windows releases, activated only when the required GitHub Actions secrets and variables are present

The repository intentionally does **not** let Electron Builder publish releases directly from the build step.

The builder wrapper always runs Electron Builder with:

- `--publish never`

That means the release flow is split on purpose:

1. Electron Builder creates the platform artifacts and update metadata for macOS, Linux, and Windows.
2. The GitHub Actions macOS job signs, notarizes, and staples the final DMGs used for direct-download distribution.
3. The GitHub Actions Windows job signs the NSIS installer through Azure Artifact Signing when the signing configuration is available.
4. The GitHub Actions platform jobs verify their expected artifact sets.
5. A final publish job creates or updates the GitHub Release with the merged platform assets.

This keeps publication under explicit workflow control while still generating the updater metadata Electron expects.

## 5. Runtime Update Behavior

The desktop app currently enables auto-update for packaged macOS, Linux, and Windows builds.

More specifically:

- unpackaged development builds do not check for updates
- unsupported packaged platforms do not enable the updater path
- the main process starts the updater during app startup after the main window is created
- the updater checks GitHub Releases for the latest published release
- updates are downloaded automatically when available
- the app does not install automatically on quit
- once a download completes, the user is prompted to either restart and install or postpone

This matches the architecture guidance that v1 uses startup-time auto-update against the latest published `main` GitHub release only.

## 6. Operator Playbook

For the current single-stream release model, the release operator flow is:

1. Merge or push the releasable commit to `main`.
2. Let `Release Desktop` compute the version and build the macOS and Linux artifacts, plus Windows artifacts if Azure Artifact Signing is configured.
3. Verify that the workflow produced signed macOS app bundles, DMGs, ZIPs, Linux `.deb` and AppImage artifacts, and Windows NSIS artifacts for every enabled platform.
4. Verify that signing checks and packaging checks all passed for the enabled platforms.
5. Verify that the GitHub Release exists with the expected tag, title, commit target, and uploaded assets for every enabled platform.
6. Run the manual smoke verification bar from [testing-and-release.md](testing-and-release.md) against a recent published `main` build.

## 6.1 Windows signing prerequisites

Signed Windows releases require GitHub Actions configuration that is intentionally external to the repo:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `WINDOWS_AZURE_TRUSTED_SIGNING_ENDPOINT`
- `WINDOWS_AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `WINDOWS_AZURE_TRUSTED_SIGNING_PROFILE_NAME`
- `WINDOWS_SIGN_PUBLISHER_NAME`

Until those values are configured, the Windows signed release job stays skipped and the rest of the release pipeline continues with macOS and Linux only.

The default recovery path for a bad release is currently fix-forward:

- publish a newer `main` release that supersedes the broken one

This document does not define staged rollback, channel switching, or phased rollout behavior because the current system does not implement those capabilities.

## 7. Boundaries With Other Docs

- [testing-and-release.md](testing-and-release.md) owns the validation bar, release gates, and manual verification policy.
- [desktop-architecture.md](desktop-architecture.md) owns architecture guidance such as the v1 simplification around startup-time auto-update.
- [README.md](../README.md) should stay a short summary and entrypoint, not the operational source of truth.

When release mechanics change, update this document together with the relevant workflow or app changes.
