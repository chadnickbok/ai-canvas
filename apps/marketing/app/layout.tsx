import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { siteConfig } from '../lib/site-config';

import './globals.css';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  applicationName: siteConfig.brandName,
  description:
    'Strapping AI Canvas is the fastest way to bootstrap visual design with a local desktop editor and MCP clients working against one shared document model.',
  icons: {
    apple: '/apple-icon.png',
    icon: [
      { type: 'image/x-icon', url: '/favicon.ico' },
      { sizes: '512x512', type: 'image/png', url: '/icon.png' },
    ],
  },
  metadataBase: new URL(siteConfig.siteUrl),
  openGraph: {
    description:
      'Bootstrap visual design fast with a local desktop editor and MCP clients sharing one scene-first project model.',
    siteName: siteConfig.brandName,
    title: siteConfig.brandName,
    url: siteConfig.siteUrl,
  },
  title: {
    default: 'Strapping AI Canvas | Bootstrap Visual Design Fast',
    template: `%s | ${siteConfig.brandName}`,
  },
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
