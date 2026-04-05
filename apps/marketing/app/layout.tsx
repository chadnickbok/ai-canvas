import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Local-first, scene-first mockup editing for humans and AI agents with one shared desktop and MCP document model.",
  title: {
    default: "AI Canvas | Desktop + MCP",
    template: "%s | AI Canvas"
  }
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
