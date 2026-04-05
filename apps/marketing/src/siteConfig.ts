const REPOSITORY_URL = "https://github.com/chadnickbok/ai-canvas";

function resolveUrl(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export const siteConfig = {
  docsUrl: resolveUrl(import.meta.env.VITE_DOCS_URL, `${REPOSITORY_URL}/tree/main/docs`),
  downloadUrl: resolveUrl(import.meta.env.VITE_DOWNLOAD_URL, `${REPOSITORY_URL}/releases`),
  githubUrl: resolveUrl(import.meta.env.VITE_GITHUB_URL, REPOSITORY_URL),
  licenseUrl: `${REPOSITORY_URL}/blob/main/LICENSE.md`,
  releasesUrl: `${REPOSITORY_URL}/releases`
};
