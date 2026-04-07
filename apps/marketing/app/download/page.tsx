import { redirect } from 'next/navigation';

import { siteConfig } from '../../lib/site-config';

export default function DownloadPage() {
  redirect(siteConfig.downloadUrl);
}
