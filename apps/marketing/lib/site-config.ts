const REPOSITORY_URL = "https://github.com/chadnickbok/ai-canvas";

function resolveUrl(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export const siteConfig = {
  docsPath: "/docs",
  downloadPath: "/download",
  docsUrl: resolveUrl(process.env.NEXT_PUBLIC_DOCS_URL, `${REPOSITORY_URL}/tree/main/docs`),
  downloadUrl: resolveUrl(process.env.NEXT_PUBLIC_DOWNLOAD_URL, `${REPOSITORY_URL}/releases`),
  githubUrl: resolveUrl(process.env.NEXT_PUBLIC_GITHUB_URL, REPOSITORY_URL),
  licenseUrl: `${REPOSITORY_URL}/blob/main/LICENSE.md`,
  releasesUrl: `${REPOSITORY_URL}/releases`
} as const;
