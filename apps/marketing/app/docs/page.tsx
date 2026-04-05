import { redirect } from "next/navigation";

import { siteConfig } from "../../lib/site-config";

export default function DocsPage() {
  redirect(siteConfig.docsUrl);
}
