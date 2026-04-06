const appId = "com.ai-canvas.desktop";
const productName = "AI Canvas Desktop";

function normalizeUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

function buildPublishProviders() {
  const providers = [];
  const updateBaseUrl = normalizeUrl(process.env.AI_CANVAS_UPDATE_BASE_URL);
  const githubOwner = process.env.AI_CANVAS_GITHUB_OWNER?.trim();
  const githubRepo = process.env.AI_CANVAS_GITHUB_REPO?.trim();

  if (updateBaseUrl) {
    providers.push({
      provider: "generic",
      url: updateBaseUrl
    });
  }

  if (githubOwner && githubRepo) {
    providers.push({
      owner: githubOwner,
      provider: "github",
      repo: githubRepo,
      releaseType: "draft"
    });
  }

  return providers;
}

const releaseChannel = process.env.AI_CANVAS_RELEASE_CHANNEL?.trim() || "latest";
const commitSha = process.env.AI_CANVAS_COMMIT_SHA?.trim() || null;

/** @type {import('electron-builder').Configuration} */
const config = {
  appId,
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  asar: true,
  directories: {
    output: "dist/release"
  },
  electronUpdaterCompatibility: ">=2.16",
  extraMetadata: {
    aiCanvasBuild: {
      commitSha,
      releaseChannel
    }
  },
  files: [
    "out/**/*",
    "package.json",
    "!src/**",
    "!scripts/**",
    "!electron.vite.config.ts",
    "!tsconfig*.json"
  ],
  mac: {
    category: "public.app-category.graphics-design",
    hardenedRuntime: true,
    target: ["dmg", "zip"]
  },
  productName,
  publish: buildPublishProviders()
};

export default config;
