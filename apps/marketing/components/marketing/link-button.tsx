import { MarketingLink } from "./marketing-link";

type LinkButtonProps = {
  href: string;
  kind?: "ghost" | "primary" | "secondary";
  label: string;
  newTab?: boolean;
};

export function LinkButton({
  href,
  kind = "secondary",
  label,
  newTab
}: LinkButtonProps) {
  return (
    <MarketingLink className={`button button-${kind}`} href={href} newTab={newTab}>
      {label}
    </MarketingLink>
  );
}
