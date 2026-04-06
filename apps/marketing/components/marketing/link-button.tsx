import type { ReactNode } from "react";

import { MarketingLink } from "./marketing-link";

type LinkButtonProps = {
  href: string;
  kind?: "ghost" | "primary" | "secondary";
  label: string;
  leadingVisual?: ReactNode;
  newTab?: boolean;
};

export function LinkButton({
  href,
  kind = "secondary",
  label,
  leadingVisual,
  newTab
}: LinkButtonProps) {
  return (
    <MarketingLink className={`button button-${kind}`} href={href} newTab={newTab}>
      {leadingVisual}
      {label}
    </MarketingLink>
  );
}
